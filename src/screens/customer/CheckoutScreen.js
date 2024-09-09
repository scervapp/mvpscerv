import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
	TouchableOpacity,
	Button,
	Alert,
} from "react-native";
import {
	doc,
	getDoc,
	setDoc,
	collection,
	serverTimestamp,
	addDoc,
} from "firebase/firestore";
import {
	transformBasketData,
	useCheckInStatus,
} from "../../utils/customerUtils";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";
import { Picker } from "@react-native-picker/picker";
import { CreditCardInput } from "react-native-credit-card-input";
import {
	db,
	functions,
	getStripePublishableKeyFromRemoteConfig,
} from "../../config/firebase";
import { httpsCallable } from "firebase/functions";

import { useStripe } from "@stripe/stripe-react-native";

const CheckoutScreen = ({ route }) => {
	const { restaurant, baskets } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const [isLoading, setIsLoading] = useState(true);
	const [filteredBasketData, setFilteredBasketData] = useState([]);
	const [expandedPIPs, setExpandedPIPs] = useState({});
	const [gratuityPercentage, setGratuityPercentage] = useState("15");
	const [isShowFeesBreakdown, setIsShowFeesBreakdown] = useState(false);
	const [cardDetails, setCardDetails] = useState([]);
	const restaurantBasketItems =
		baskets[restaurant.id]?.items.filter((item) => item.sentToChefQ) || [];
	const [paymentError, setPaymentError] = useState(null);
	const [isPaymentLoading, setIsPaymentLoading] = useState(false);
	const [fees, setFees] = useState(null);
	const [isStripeInitialized, setIsStripeInitialized] = useState(false);
	const { checkInStatus, tableNumber } = useCheckInStatus(
		restaurant.uid,
		currentUserData.uid
	);
	const [stripePublishableKey, setStripePublishableKey] = useState(null);

	const { initPaymentSheet, presentPaymentSheet } = useStripe();

	useEffect(() => {
		const fetchStripePublishableKey = async () => {
			try {
				const getStripePublishableKeyFunction = httpsCallable(
					functions,
					"getStripePublishableKey"
				);
				const {
					data: { stripePublishableKey },
				} = await getStripePublishableKeyFunction();

				if (stripePublishableKey) {
					setStripePublishableKey(stripePublishableKey);
				} else {
					throw new Error("Failed to fetch stripe publishable key");
				}
			} catch (error) {
				console.error("Error fetching stripe publishable key", error);
				setPaymentError("Could not initialize Stripe. PLease try again");
			}
		};
		fetchStripePublishableKey();
	}, []);

	// Initialize Stripe Payment Sheet
	useEffect(() => {
		if (stripePublishableKey) {
			const initializeStripe = async () => {
				try {
					const initResult = await initPaymentSheet({
						merchantDisplayName: restaurant.restaurantName,
					});
					if (initResult.error) {
						console.error(
							"Error initializing payment sheet:",
							initResult.error
						);
						setPaymentError(initResult.error.message);
					}
				} catch (error) {
					console.error("Error during payment sheet initialization:", error);
					setPaymentError(
						"Error initializing payment sheet. Please try again."
					);
				}
			};
			initializeStripe();
		}
	}, [stripePublishableKey]);

	useEffect(() => {
		const fetchFees = async () => {
			setIsLoading(true);
			try {
				const feesDocRef = doc(db, "appConfig", "general");
				const docSnapshot = await getDoc(feesDocRef);
				if (docSnapshot.exists()) {
					setFees(docSnapshot.data().fees);
				} else {
					console.log("Fee not found");
				}
			} catch (error) {
				console.log("Error fetching fee", error);
			} finally {
				setIsLoading(false);
			}
		};
		fetchFees();
	}, []);

	const handleCardDetailsChange = (form) => {
		setCardDetails(form);
	};

	const handlePayment = async () => {
		if (!cardDetails.valid) {
			Alert.alert("Invalid Card", "Please check your card details.");
			return;
		}

		try {
			setIsPaymentLoading(true);
			setPaymentError(null);

			// 1. Create a PaymentIntent on the backend (commented out for now)
			const createPaymentIntentFunction = httpsCallable(
				functions,
				"createPaymentIntent"
			);
			const {
				data: { clientSecret },
			} = await createPaymentIntentFunction({
				amount: Math.round(overallTotal * 100),
				subtotal: subtotal * 100,
				tax: tax * 100,
				fee: fee * 100,
				gratuity: gratuity & 100,
			});

			// Initialize the payment sheet
			const { error: initSheetError } = await initPaymentSheet({
				paymentIntentClientSecret: clientSecret,
				merchantDisplayName: restaurant.restaurantName,
			});

			if (initSheetError) {
				console.error("Error initializing payment sheet: ", initSheetError);
				setPaymentError(initSheetError.message);
				return; // Exit the function early if there is an initializatioin error
			}

			// 3. Present the payment sheet to the user
			const { error: paymentSheetError } = await presentPaymentSheet();
			if (paymentSheetError) {
				console.error("Error processing payment: ", paymentSheetError);
				setPaymentError(paymentSheetError.message);
				return;
				// Retry payment or offer alternative. Remember
			} else {
				//4. Payment successful, create the order document in Firestore
				const createOrderFunction = httpsCallable(functions, "createOrder");
				const {
					data: { orderId },
				} = await createOrderFunction({
					userId: currentUserData.uid,
					restaurantId: restaurant.id,
					tableNumber: tableNumber || null,
					items: restaurantBasketItems,
					totalPrice: overallTotal,
				});

				Alert.alert("Success", "Payment Successful!");

				// 5. Clear the basket for this restaurant
				//clearBasket(restaurant.id),
				// 6. Navigate to a confirmation screen
				console.log("Navigate to Order Confirmation");
			}
		} catch (error) {
			console.error("Error processing payment:", error);
			setPaymentError(error.message);
		} finally {
			setIsPaymentLoading(false);
		}
	};

	// State to track expanded collaped state of each pip section
	// Function to toggle the expanded state of a PIP section
	const toggleExpandPIP = (personId) => {
		setExpandedPIPs((prevExpandedPIPs) => ({
			...prevExpandedPIPs,
			[personId]: !prevExpandedPIPs[personId],
		}));
	};

	// Get the basket items for the current restaurant, filtered by sentToChefQ

	useEffect(() => {
		const transformedData = transformBasketData(restaurantBasketItems);
		const filteredData = transformedData.filter(
			(personData) => personData.items && personData.items.length > 0
		);
		setFilteredBasketData(filteredData);
		setIsLoading(false);
	}, [baskets, restaurant.id]);

	// Calculate subtotal, tax, fee, gratuity, and overall total (using filteredBasketData)
	const calculateTotals = () => {
		const subtotal = restaurantBasketItems.reduce(
			(total, item) => total + item.dish.price * item.quantity,
			0
		);
		const tax = subtotal * restaurant.taxRate; // Example 8% tax
		const fee = subtotal * fees;
		const gratuityAmount = (subtotal * parseFloat(gratuityPercentage)) / 100;
		const overallTotal = subtotal + tax + fee + gratuityAmount;

		return {
			subtotal,
			tax,
			fee,
			gratuity: gratuityAmount,
			overallTotal,
		};
	};

	const { subtotal, tax, fee, gratuity, overallTotal } = calculateTotals();

	return (
		<View style={styles.container}>
			{/* Loading or Error or Order Details */}
			{isLoading ? (
				<ActivityIndicator size="large" />
			) : restaurantBasketItems.length > 0 ? (
				<ScrollView showsVerticalScrollIndicator={false}>
					{/* Order Summary */}
					<Text style={styles.heading}>Order Summary</Text>

					{/* Restaurant Name */}
					<Text style={styles.restaurantName}>{restaurant.name}</Text>

					{/* Basket Items Grouped by PIP */}
					{filteredBasketData.map((personData) => {
						const isExpanded = expandedPIPs[personData.personId] || false;

						// Calculate totals for PIP
						const pipTotal = personData.items.reduce(
							(total, item) => total + item.dish.price * item.quantity,
							0
						);

						return (
							<View key={personData.personId} style={styles.personSection}>
								{/* PIP Name and Total (always visible) */}
								<TouchableOpacity
									onPress={() => toggleExpandPIP(personData.personId)}
									style={styles.personHeader}
								>
									<Text style={styles.personName}>{personData.pipName}</Text>
									<View style={styles.pipTotalsContainer}>
										<Text style={styles.pipTotalText}>
											Total: ${pipTotal.toFixed(2)}
											{/* Display only the total for this PIP */}
										</Text>
									</View>
								</TouchableOpacity>

								{/* Items for this PIP (conditionally rendered) */}
								{isExpanded &&
									personData.items.map((basketItem) => (
										<View key={basketItem.id} style={styles.basketItem}>
											<View style={styles.itemInfoContainer}>
												<Text
													style={[
														styles.dishName,
														basketItem.sentToChefQ && styles.sentItem,
													]}
												>
													{basketItem.dish.name} x {basketItem.quantity}
												</Text>

												<Text
													style={[
														styles.itemPrice,
														basketItem.sentToChefQ && styles.sentItem,
													]}
												>
													$
													{(
														basketItem.dish.price * basketItem.quantity
													).toFixed(2)}
												</Text>
											</View>

											{/* Special Instructions (if any) */}
											{basketItem.specialInstructions && (
												<Text style={styles.specialInstructions}>
													{basketItem.specialInstructions}
												</Text>
											)}
										</View>
									))}
							</View>
						);
					})}

					{/* Overall Order Summary with Taxes & Fees and Gratuity */}
					<View style={styles.orderSummary}>
						<Text>Subtotal: ${subtotal.toFixed(2)}</Text>
						<TouchableOpacity
							onPress={() => setIsShowFeesBreakdown(!isShowFeesBreakdown)}
						>
							<Text style={styles.feesText}>
								Taxes & Fees: ${(tax + fee).toFixed(2)}
								{isShowFeesBreakdown && (
									<View style={styles.feeBreakdownContainer}>
										<Text style={styles.feeBreakdown}>
											- Tax: ${tax.toFixed(2)}
										</Text>
										<Text style={styles.feeBreakdown}>
											- Scerv Fee: ${fee.toFixed(2)}
										</Text>
									</View>
								)}
							</Text>
						</TouchableOpacity>
						<View style={styles.gratuityContainer}>
							{/* Gratuity selection */}
							<Text>Gratuity:</Text>
							<Picker
								selectedValue={gratuityPercentage}
								onValueChange={(itemValue) => setGratuityPercentage(itemValue)}
								style={styles.gratuityPicker}
							>
								<Picker.Item label="0%" value="0" />
								<Picker.Item label="10%" value="10" />
								<Picker.Item label="15%" value="15" />
								<Picker.Item label="20%" value="20" />
								{/* Add more options or custom input as needed */}
							</Picker>
						</View>
						<Text style={styles.totalPrice}>
							Total: ${overallTotal.toFixed(2)}
						</Text>
					</View>

					{/* Payment Information Input */}
					<Text style={styles.heading}>Payment Information</Text>
					<CreditCardInput onChange={handleCardDetailsChange} />
					{paymentError && <Text style={styles.errorText}>{paymentError}</Text>}

					{/* Pay Button with Loading Indicator */}
					{isPaymentLoading ? (
						<ActivityIndicator size="large" color={colors.primary} />
					) : (
						<Button title="Pay Now" onPress={handlePayment} />
					)}
				</ScrollView>
			) : (
				<Text>Basket is empty</Text>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
		backgroundColor: colors.background,
	},
	heading: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 10,
		color: colors.primary,
	},
	restaurantName: {
		fontSize: 18,
		marginBottom: 10,
	},
	personSection: {
		marginBottom: 20,
		backgroundColor: colors.accent,
		borderRadius: 8,
		padding: 10,
	},
	personHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 4,
	},
	personName: {
		fontSize: 18,
		fontWeight: "bold",
	},
	pipTotalsContainer: {
		flexDirection: "column",
		alignItems: "flex-end",
	},
	pipTotalText: {
		fontWeight: "bold",
		fontSize: 14,
	},
	basketItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 5,
		paddingHorizontal: 10,
	},
	itemInfoContainer: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	dishName: {
		fontSize: 16,
		fontWeight: "500",
	},
	quantity: {
		marginHorizontal: 5,
	},
	itemPrice: {
		fontWeight: "bold",
		color: colors.accent,
	},
	specialInstructions: {
		fontSize: 14,
		color: colors.textLight,
		marginTop: 5,
	},
	sentItem: {
		textDecorationLine: "line-through",
		color: "gray",
	},
	orderSummary: {
		marginTop: 20,
		borderTopWidth: 1,
		borderTopColor: colors.lightGray,
		paddingTop: 10,
	},
	totalLabel: {
		fontSize: 16,
		fontWeight: "bold",
	},
	totalPrice: {
		fontSize: 18,
		fontWeight: "bold",
	},
	paymentInfo: {
		marginTop: 20,
	},
	cardInput: {
		marginBottom: 10,
	},
	errorText: {
		color: "red",
		marginBottom: 10,
	},
	payButton: {
		backgroundColor: colors.primary,
		borderRadius: 5,
		paddingVertical: 10,
	},
	feesText: {
		marginBottom: 5,
	},
	feeBreakdownContainer: {
		marginLeft: 10, // Indent the breakdown slightly
		marginTop: 5, // Add some spacing above the breakdown
	},
	feeBreakdown: {
		fontSize: 12,
		color: "gray",
	},
	gratuityContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 10,
	},
	gratuityPicker: {
		width: 70,
	},
});

export default CheckoutScreen;
