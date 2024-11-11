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
	Linking,
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
		const handleUrl = (event) => {
			const { url } = event;
			if (url && url.startsWith("yourapp://stripe-redirect")) {
				// Handle the redirect in your app
			}
		};

		const linkingListener = Linking.addListener("url", handleUrl);

		// Cleanup function to unsubscribe from the event
		return () => {
			linkingListener.remove();
		};
	}, []);

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
						amount: Math.round(overallTotal), // Already in cents
						customerId: stripeCustomerId,
						gratuity: gratuity, // Already in cents
						tax: tax, // Already in cents
						fee: fee, // Already in cents
						subtotal: subtotal, // Already in cents
						table: checkInObj.table.name,
						connectedAccountId: restaurant.stripeAccountId,
						discount: totalDiscount,
						originalSubtotal: originalSubtotal,
					});

					const { error: initSheetError } = await initPaymentSheet({
						merchantDisplayName: `Scerv Inc. - ${restaurant.restaurantName}`,
						paymentIntentClientSecret: clientSecret,
						allowsDelayedPaymentMethods: true,
						customerEphemeralKeySecret: ephemeralKey,
						customerId: stripeCustomerId,
						returnURL: "https://scerv.com/payment-redirect",
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
					fee: fee,
					server: checkInObj.server,
					gratuity: gratuity,
					subtotal: subtotal,
					tax: tax,
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

	// Function to calculate totals and summary
	const calculateTotals = () => {
		let subtotal = 0;
		let originalSubtotal = 0;
		for (const item of restaurantBasketItems) {
			// Calculate original subtotal (without discounts)
			originalSubtotal += Math.round(item.dish.price * 100) * item.quantity;

			// Convert price to cents and multiply by quantity
			const price = item.discount
				? parseFloat(item.discountedPrice)
				: item.dish.price;
			subtotal += Math.round(price * 100) * item.quantity;
		}

		// // Calculate tax, gratuity, and fees in cents
		// const tax = Math.round(subtotal * restaurant.taxRate);
		const gratuityAmount = Math.round(
			subtotal * (parseFloat(gratuityPercentage) / 100)
		);

		// Calculate totals for each PIP, including tax and discounts
		const pipTotals = filteredBasketData.map((personData) => {
			const pipSubtotal = personData.items.reduce((total, item) => {
				const price = item.discount
					? parseFloat(item.discountedPrice) * 100
					: Math.round(item.dish.price * 100);

				return total + price * item.quantity;
			}, 0);

			// Calculate tax for this specific PIP's subtotal in cents (after applying discounts)
			const pipTax = Math.round(pipSubtotal * restaurant.taxRate);

			// Include gratuity in the PIP total
			const pipGratuity = Math.round(
				gratuityAmount / filteredBasketData.length
			);
			const pipTotalWithGratuity = pipSubtotal + pipTax + pipGratuity;

			// Calculate fee for this specific PIP's total in cents (after applying discounts and gratuity)
			const pipFee = Math.round(pipTotalWithGratuity * fees); // Make sure 'fees' is a valid number
			const pipTotal = pipTotalWithGratuity + pipFee;

			return {
				...personData,
				subtotal: pipSubtotal,
				tax: pipTax,
				total: pipTotal,
			};
		});

		// Calculate overallTotal using pipTotals (with discounts)
		const overallTotal = pipTotals.reduce(
			(sum, pipData) => sum + pipData.total,
			0
		);

		const restaurantTotal = overallTotal;

		// Calculate total tax from pipTotals
		const tax = Math.round(
			pipTotals.reduce((sum, pipData) => sum + pipData.tax, 0)
		);

		// Calculate total fee from pipTotals
		const fee = Math.round(
			pipTotals.reduce(
				(sum, pipData) =>
					sum +
					(pipData.total -
						pipData.subtotal -
						pipData.tax -
						gratuityAmount / pipTotals.length),
				0
			)
		);

		// Calculate total discount from pipTotals
		const totalDiscount = pipTotals.reduce(
			(sum, pipData) =>
				sum +
				pipData.items.reduce(
					(acc, item) =>
						acc +
						(item.discount
							? Math.round(item.dish.price * 100) -
							  Math.round(parseFloat(item.discountedPrice) * 100)
							: 0),
					0
				),
			0
		);

		// Return values in cents (integers)
		return {
			subtotal,
			tax,
			fee,
			gratuity: gratuityAmount,
			overallTotal,
			restaurantTotal,
			pipTotals,
			totalDiscount,
			originalSubtotal,
		};
	};

	const {
		subtotal,
		tax,
		fee,
		gratuity,
		overallTotal,
		restaurantTotal,
		pipTotals,
		totalDiscount,
		originalSubtotal,
	} = calculateTotals();

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
							const pipData = pipTotals.find(
								(pip) => pip.personId === personData.personId
							);

							// Calculate totals for PIP

							return (
								<View key={personData.personId} style={styles.personSection}>
									<TouchableOpacity
										onPress={() => toggleExpandPIP(personData.personId)}
										style={styles.personHeader}
									>
										<Text style={styles.personName}>{personData.pipName}</Text>
										<Text style={styles.pipTotal}>
											{`Total: $${(pipData.total / 100).toFixed(
												2
											)} (incl. tax)`}
										</Text>
									</TouchableOpacity>

									{isExpanded && (
										<View>
											{personData.items.map((item, index) => (
												<View>
													{/* Display price with discount (if applicable) */}
													<View
														key={`item.dish.id - ${index}`}
														style={styles.itemInfoContainer}
													>
														<Text style={styles.dishName}>
															{item.dish.name} x {item.quantity}
														</Text>
														<Text style={styles.itemPrice}>
															{item.discount ? (
																<>
																	<Text style={styles.originalPrice}>
																		${item.dish.price}
																	</Text>
																	<Text style={styles.discountedPrice}>
																		${item.discountedPrice}
																	</Text>
																</>
															) : (
																`$${item.dish.price}`
															)}
														</Text>
													</View>
												</View>
											))}

											<Text style={styles.pipSubtotal}>
												{`Subtotal: $${pipData.subtotal.toFixed(2) / 100}`}
											</Text>
											<Text style={styles.pipTax}>
												{`Tax: $${pipData.tax.toFixed(2) / 100}`}
											</Text>
										</View>
									)}
								</View>
							);
						})}

						{/* Overall Order Summary with Taxes & Fees and Gratuity */}
						<View style={styles.orderSummary}>
							<View style={styles.subtotalContainer}>
								{/* Add a container for the subtotal and discount */}
								<Text style={styles.pipTotalText}>Subtotal:</Text>
								{totalDiscount > 0 ? ( // Conditionally render original and discounted subtotals
									<>
										<Text style={styles.originalPrice}>
											${(originalSubtotal / 100).toFixed(2)}
										</Text>
										<Text style={styles.discountedPrice}>
											${(subtotal / 100).toFixed(2)}
										</Text>
									</>
								) : (
									<Text>${(subtotal / 100).toFixed(2)}</Text>
								)}
							</View>

							<View style={styles.gratuityContainer}>
								{/* Gratuity selection */}
								<Text>
									Gratuity: {gratuityPercentage}% = $
									{(gratuity / 100).toFixed(2)}
								</Text>
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

							<Text style={styles.feesText}>
								Taxes: ${tax.toFixed(2) / 100}
							</Text>
							<Text style={styles.feesText}>Fee: ${fee.toFixed(2) / 100}</Text>
							<Text style={styles.totalPrice}>
								Total: ${(overallTotal / 100).toFixed(2)}
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
		marginBottom: 0,
	},
	feeBreakdownContainer: {
		marginLeft: 10, // Indent the breakdown slightly
		marginTop: 0, // Add some spacing above the breakdown
	},
	feeBreakdown: {
		fontSize: 12,
		color: "gray",
	},
	gratuityContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: -18,
		marginTop: -18,
	},
	gratuityPicker: {
		width: 70,
	},
	addNewCardButton: {
		backgroundColor: colors.secondary,
		marginBottom: 10,
	},

	originalPrice: {
		textDecorationLine: "line-through",
		color: "gray",
		marginRight: 5,
	},
	discountedPrice: {
		color: "red", // Or any color you prefer for discounts
		fontWeight: "bold",
	},
	subtotalContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-start", // Distribute space between elements
	},
	originalPrice: {
		fontSize: 16,
		textDecorationLine: "line-through",
		color: colors.textLight, // Use a light gray color
		marginRight: 5,
	},
	discountedPrice: {
		fontSize: 16,
		color: colors.primary, // Use your primary color
		fontWeight: "bold",
	},
});

export default CheckoutScreen;
