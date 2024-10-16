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
	updateDoc,
} from "firebase/firestore";
import {
	transformBasketData,
	useCheckInStatus,
} from "../../utils/customerUtils";
import { AuthContext } from "../../context/authContext";
import { useBasket } from "../../context/customer/BasketContext";
import colors from "../../utils/styles/appStyles";
import { Picker } from "@react-native-picker/picker";
import { CreditCardInput } from "react-native-credit-card-input";
import { db, functions } from "../../config/firebase";
import { httpsCallable } from "firebase/functions";

import { useStripe, StripeProvider } from "@stripe/stripe-react-native";
import { Checkbox } from "react-native-paper";

const CheckoutScreen = ({ route, navigation }) => {
	const { restaurant, baskets } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const { clearBasket } = useBasket();
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
	const [saveCard, setSaveCard] = useState(true);
	const [savedCard, setSavedCard] = useState(null);
	const [showCardInput, setShowCardInput] = useState(true);
	const { checkInObj } = useCheckInStatus(restaurant.uid, currentUserData.uid);
	const [isPaymentSheetReady, setIsPaymentSheetReady] = useState(false);

	const [stripePublishableKey, setStripePublishableKey] = useState(null);

	const { initPaymentSheet, presentPaymentSheet } = useStripe(null);
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
			const initializePaymentSheet = async () => {
				setIsLoading(true);
				try {
					let stripeCustomerId = null;
					let ephemeralKey = null;

					// Get customer Stripe ID from Firestore or create one
					const userDocRef = doc(db, "customers", currentUserData.uid);
					const userDocSnapshot = await getDoc(userDocRef);

					if (
						userDocSnapshot.exists() &&
						userDocSnapshot.data().stripeCustomerId
					) {
						stripeCustomerId = userDocSnapshot.data().stripeCustomerId;
					} else {
						const createStripeCustomerFunction = httpsCallable(
							functions,
							"createStripeCustomer"
						);
						const {
							data: { customerId },
						} = await createStripeCustomerFunction({
							userId: currentUserData.uid,
							email: currentUserData.email,
						});
						stripeCustomerId = customerId;
						await updateDoc(userDocRef, { stripeCustomerId });
					}

					// Create an ephemeral key for the customer
					const createEphemeralKeyFunction = httpsCallable(
						functions,
						"createEphemeralKey"
					);
					const {
						data: { ephemeralKey: newEphemeralKey },
					} = await createEphemeralKeyFunction({
						customerId: stripeCustomerId,
						apiVersion: "2024-06-20",
					});
					ephemeralKey = newEphemeralKey;

					// Call your Firebase Cloud Function to create a PaymentIntent
					const createPaymentIntentFunction = httpsCallable(
						functions,
						"createPaymentIntent"
					);
					const {
						data: { clientSecret },
					} = await createPaymentIntentFunction({
						amount: Math.round(overallTotal * 100),
						customerId: stripeCustomerId,
						gratuity: gratuity,
						tax: tax,
						fee: fee,
						table: checkInObj.table.name,
					});

					const { error: initSheetError } = await initPaymentSheet({
						merchantDisplayName: `Scerv Inc. - ${restaurant.restaurantName}`,
						paymentIntentClientSecret: clientSecret,
						allowsDelayedPaymentMethods: true,
						customerEphemeralKeySecret: ephemeralKey,
						customerId: stripeCustomerId,
					});

					if (!initSheetError) {
						setIsPaymentSheetReady(true);
					}

					if (initSheetError) {
						console.error("PaymentSheet, initialization error", initSheetError);
					}
				} catch (error) {
					console.error("Error during payment sheet initialization:", error);
					setPaymentError(
						"Error initializing payment sheet. Please try again."
					);
				} finally {
					setIsLoading(false);
				}
			};
			initializePaymentSheet();
		}
	}, [stripePublishableKey, currentUserData.uid, restaurant.restaurantName]);

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

	const handlePayment = async () => {
		setIsLoading(true);

		try {
			// 3. Present the PaymentSheet to the user
			const { error: presentError } = await presentPaymentSheet();

			if (presentError) {
				console.error("PaymentSheet presentation error: ", presentError);
				return;
			} else {
				// 5. Payment successful, create the order document in Fire
				//4. Payment successful, create the order document in Firestore
				const createOrderFunction = httpsCallable(functions, "createOrder");
				const {
					data: { orderId },
				} = await createOrderFunction({
					userId: currentUserData.uid,
					restaurantId: restaurant.id,
					table: checkInObj.table,
					items: restaurantBasketItems,
					totalPrice: overallTotal,
				});

				clearBasket(restaurant.id);

				if (orderId) {
					navigation.navigate("OrderConfirmation", { orderId });
				}
			}
		} catch (error) {
			console.error("Error during payment: ", error);
		} finally {
			setIsLoading(false);
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
		<StripeProvider publishableKey={stripePublishableKey}>
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
									onValueChange={(itemValue) =>
										setGratuityPercentage(itemValue)
									}
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
						<View style={styles.paymentInfo}>
							<Text style={styles.heading}>Payment Information</Text>

							{/* {!showCardInput && (
								<Button
									title="Add New Card"
									buttonStyle={styles.addnewCardButton}
									onPress={() => setShowCardInput(true)}
								/>
							)} */}
							{/* Conditionally render the CreditCardInput */}
							{/* {showCardInput && (
								<>
									<Checkbox.Item
										label="Save card for future use"
										status={saveCard ? "checked" : "unchecked"}
										onPress={() => setSaveCard(!saveCard)}
									/>
								</>
							)} */}

							{/* Pay Button with Loading Indicator */}
							{isPaymentLoading ? (
								<ActivityIndicator size="large" color={colors.primary} />
							) : (
								<Button
									title="Pay Now"
									disabled={!isPaymentSheetReady || isPaymentLoading}
									onPress={handlePayment}
								/>
							)}
						</View>
					</ScrollView>
				) : (
					<Text>Basket is empty</Text>
				)}
			</View>
		</StripeProvider>
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
	addNewCardButton: {
		backgroundColor: colors.secondary,
		marginBottom: 10,
	},
});

export default CheckoutScreen;
