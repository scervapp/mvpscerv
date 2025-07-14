// CheckoutScreen.js (React Native - Stripe Checkout Version)

import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
	Button,
	Alert,
	Platform, // --- NEW: Import Platform (Optional but good for platform-specific logic)
	TouchableOpacity,
} from "react-native";
import { functions, db } from "../../config/firebase"; // Your Firebase config
import { AuthContext } from "../../context/authContext";
import { Picker } from "@react-native-picker/picker";
import { useBasket } from "../../context/customer/BasketContext"; // Assuming you still need this
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"; // For icons
import {
	transformBasketData,
	useCheckInStatus,
} from "../../utils/customerUtils"; // Assuming you still need these
import { useStripe, StripeProvider } from "@stripe/stripe-react-native"; // <<< ADD BACK
import colors from "../../utils/styles/appStyles";

import formatCurrency from "../../utils/currencyFormatter";
import { CommonActions } from "@react-navigation/native";

const CheckoutScreen = ({ route, navigation }) => {
	const { restaurant, baskets } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const { clearBasket } = useBasket(); // Keep if needed post-webhook

	// --- State Variables ---
	const [isPreparing, setIsPreparing] = useState(false); // Loading state for preparing sheet
	const [isPaying, setIsPaying] = useState(false); // Loading state for actual payment presentation
	const [isLoading, setIsLoading] = useState(false); // For checkout action button
	const [isDataLoading, setIsDataLoading] = useState(true); // For initial config fetch
	const [paymentError, setPaymentError] = useState(null);
	const [fees, setFees] = useState(0.05); // Your platform fee percentage (e.g., 5%) - fetch this
	const [gratuityPercentage, setGratuityPercentage] = useState("15");
	const [expandedPIPs, setExpandedPIPs] = useState({}); // For collapsible sections

	// Use useRef to store the orderId across the reidrect reliably
	const pendingOrderIdRef = useRef(null);
	const pendingFirestoreDocIdRef = useRef(null); // FIresstore's UNIQUE Id

	const { checkInObj } = useCheckInStatus(
		restaurant?.uid,
		currentUserData?.uid
	); // Keep if needed for metadata

	const [isPaymentSheetReady, setIsPaymentSheetReady] = useState(false); // <<< ADD BACK
	const [stripePublishableKey, setStripePublishableKey] = useState(null);
	const [calculatedTax, setCalculatedTax] = useState(0); // Tax from server
	const [finalTotal, setFinalTotal] = useState(0); // Final total from server
	const [selectedCard, setSelectedCard] = useState(null); // State for saved card selection

	const { initPaymentSheet, presentPaymentSheet } = useStripe(); // <<< ADD BACK

	// --- Memoized Basket Items (Keep this) ---
	const restaurantBasketItems = useMemo(() => {
		const items = baskets[restaurant?.id]?.items || [];
		return items.filter((item) => item.sentToChefQ);
	}, [baskets, restaurant?.id]);

	// --- Memoized PIP Data (Keep this if needed for display) ---
	const filteredBasketData = useMemo(() => {
		const transformedData = transformBasketData(restaurantBasketItems);
		return transformedData.filter(
			(personData) => personData.items && personData.items.length > 0
		);
	}, [restaurantBasketItems]);

	// --- useEffect to Fetch Initial Config (e.g., Fees) ---
	useEffect(() => {
		let isMounted = true;
		const fetchInitialData = async () => {
			setIsDataLoading(true);
			try {
				const feesSnap = await db.collection("appConfig").doc("general").get();
				if (isMounted && feesSnap.exists()) {
					setFees(feesSnap.data().fees); // Make sure this is number like 0.05
				} else if (isMounted) {
					console.warn("Fee configuration not found, using default.");
					setFees(0.05); // Set default if not found
				}
			} catch (error) {
				/* ... error handling ... */
			}
			if (restaurant?.uid) {
				try {
					const getStripePublishableKeyFunction = httpsCallable(
						functions,
						"getStripePublishableKey"
					);
					const { data } = await getStripePublishableKeyFunction({
						restaurantId: restaurant.uid,
					});
					if (isMounted && data.stripePublishableKey) {
						setStripePublishableKey(data.stripePublishableKey);
					} else if (isMounted) {
						throw new Error("Pub key not returned");
					}
				} catch (e) {
					console.error("Error fetching publishable key:", e);
					if (isMounted) setPaymentError("Could not load payment config.");
				}
			}
			if (isMounted) setIsDataLoading(false); // Assuming data loading state exists
		};

		fetchInitialData();
		return () => {
			isMounted = false;
		};
	}, []);

	// --- useMemo Hook for Calculating Pre-Tax Totals ---
	const {
		subtotal, // Total pre-tax subtotal (after discounts) in cents
		gratuity, // Total gratuity in cents
		platformFee, // Your calculated platform fee in cents
		totalDiscount, // Total discount in cents
		originalSubtotal, // Total original subtotal (before discounts) in cents
		pipTotals, // Array of per-person calculations (useful for display)
		totalForPayment,
	} = useMemo(() => {
		console.log("Memo: Recalculating Totals Running");
		// Guard clause: Ensure necessary data is available
		if (
			!restaurantBasketItems ||
			restaurantBasketItems.length === 0 ||
			typeof fees !== "number" ||
			typeof restaurant?.taxRate !== "number"
		) {
			console.log("Calculate Totals Memo: Skipping, missing required data");
			return {
				subtotal: 0,
				gratuity: 0,
				platformFee: 0,
				totalDiscount: 0,
				originalSubtotal: 0,
				pipTotals: [],
				totalForPayment: 0,
			};
		}

		let calcSubtotal = 0;
		let calcOriginalSubtotal = 0;

		// Calculate overall subtotal and original subtotal
		for (const item of restaurantBasketItems) {
			const originalPrice = Math.round((Number(item?.dish?.price) || 0) * 100);
			const quantity = Number(item?.quantity) || 1;
			calcOriginalSubtotal += originalPrice * quantity;

			const price = item?.discount
				? parseFloat(item.discountedPrice) * 100
				: originalPrice;
			calcSubtotal += Math.round(price || 0) * quantity; // Ensure price is a number
		}

		const calcGratuityAmount = Math.round(
			calcSubtotal * (parseFloat(gratuityPercentage) / 100)
		);

		// Calculate details per PIP
		const calcPipTotals = filteredBasketData.map((personData) => {
			const itemsToReduce = personData?.items;
			let pipSubtotal = 0;
			let pipOriginalSubtotal = 0; // Original subtotal for this PIP

			if (Array.isArray(itemsToReduce)) {
				pipSubtotal = itemsToReduce.reduce((total, item) => {
					const originalPrice = Math.round(
						(Number(item?.dish?.price) || 0) * 100
					);
					const quantity = Number(item?.quantity) || 1;
					const price = item?.discount
						? parseFloat(item.discountedPrice) * 100
						: originalPrice;
					pipOriginalSubtotal += originalPrice * quantity; // Accumulate original price for PIP discount calc
					return total + Math.round(price || 0) * quantity;
				}, 0);
			}

			const numberOfPips =
				filteredBasketData.length > 0 ? filteredBasketData.length : 1;
			const pipGratuity = Math.round(calcGratuityAmount / numberOfPips);
			const pipFee = Math.round(pipSubtotal * fees); // Platform fee for THIS PIP
			const pipDiscount = pipOriginalSubtotal - pipSubtotal; // Discount for THIS PIP

			return {
				...(personData || {}), // Spread person data safely
				subtotal: pipSubtotal,
				fee: pipFee,
				gratuity: pipGratuity,
				discount: pipDiscount,
				total: pipTotals,
			};
		});

		// Calculate overall platform fee by summing pipFees
		const calculated_platform_fee = calcPipTotals.reduce(
			(sum, pip) => sum + (pip.fee || 0),
			0
		);

		const calcTotalDiscount = calcOriginalSubtotal - calcSubtotal;
		const calcTotalForPayment =
			calcSubtotal + calcGratuityAmount + calculated_platform_fee;

		return {
			subtotal: calcSubtotal,
			gratuity: calcGratuityAmount,
			platformFee: calculated_platform_fee,
			totalDiscount: calcTotalDiscount,
			originalSubtotal: calcOriginalSubtotal,
			pipTotals: calcPipTotals, // Include the detailed PIP array
			totalForPayment: calcTotalForPayment,
		};
	}, [
		// Dependencies for recalculation
		restaurantBasketItems,
		gratuityPercentage,
		fees,
		filteredBasketData,
	]);

	// --- NEW/REVISED: useEffect to Prepare Payment Sheet Data ---
	useEffect(() => {
		// Only run if we have the key, user, restaurant, and an amount to charge
		if (
			!stripePublishableKey ||
			!currentUserData?.uid ||
			!restaurant?.uid ||
			!checkInObj || // We need the full check-in object
			subtotal <= 0 // Use subtotal, as amountBeforeTax depends on gratuity which can change
		) {
			setIsPaymentSheetReady(false);
			return;
		}

		const prepareSheet = async () => {
			setIsPreparing(true);
			setIsPaymentSheetReady(false);
			setPaymentError(null);

			try {
				let stripeCustomerId = null;
				const userDocRef = db.collection("customers").doc(currentUserData.uid);
				const userDocSnapshot = await userDocRef.get();
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
						restaurantId: restaurant.uid,
					});
					stripeCustomerId = customerId;
					await updateDoc(userDocRef, { stripeCustomerId });
				}

				const leanItemsForMetadata = restaurantBasketItems.map((item) => ({
					menuItemId: item.menuItemId, // The ID of the menu item
					quantity: item.quantity,
					specialInstructions: item.specialInstructions || "",
					// Include any other small, essential fields like pipId if necessary
					pipId: item.pipId,
					pipName: item.pipName,
					discount: item.discount || null,
					discountedPrice: item.discountedPrice || null,
				}));

				// This is the data that will be stored in the Stripe metadata
				const dataToPrepare = {
					restaurantId: restaurant.uid,
					customerId: stripeCustomerId,
					connectedAccountId: restaurant.stripeAccountId,
					// Pass the calculated totals
					subtotal,
					gratuity,
					platformFee,
					// Pass the data needed for the webhook to create the order
					items: leanItemsForMetadata, // Or your leanItemsForMetadata
					table: checkInObj.table || null,
					server: checkInObj.server || null,
					checkInId: checkInObj.id,
					checkInTimestamp: checkInObj.acceptedAt,
				};

				// 4. Call the single, updated server function
				const preparePaymentSheetFunction = httpsCallable(
					functions,
					"preparePaymentSheetData"
				);
				const result = await preparePaymentSheetFunction(dataToPrepare);
				const prepData = result?.data;

				if (!prepData || !prepData.paymentIntentClientSecret) {
					throw new Error("Server did not return necessary Stripe secrets.");
				}
				// --- END OF FIX ---

				// 5. Update UI State with Tax/Total from Serve
				setFinalTotal(prepData.finalAmount || 0);

				// 6. Initialize Payment Sheet
				const { error: initSheetError } = await initPaymentSheet({
					merchantDisplayName: `Scerv Inc. - ${restaurant.restaurantName}`,
					paymentIntentClientSecret: prepData.paymentIntentClientSecret,
					customerEphemeralKeySecret: prepData.ephemeralKeySecret,
					customerId: prepData.customerId,
					returnURL: "stripe://stripe-redirect",
				});

				if (initSheetError) {
					throw initSheetError;
				} else {
					setIsPaymentSheetReady(true);
				}
			} catch (error) {
				console.error("Error preparing payment sheet:", error);
				setPaymentError(
					`Error: ${error.message || "Failed to prepare payment."}`
				);
				setIsPaymentSheetReady(false);
			} finally {
				setIsPreparing(false);
			}
		};

		prepareSheet();
	}, [
		// Dependencies for preparing the payment sheet
		stripePublishableKey,
		currentUserData?.uid,
		restaurant?.uid,
		checkInObj,
		totalForPayment,
	]);

	// --- Handle Payment Button Press ---
	const handlePayment = async () => {
		if (!isPaymentSheetReady || isPaying) return;
		setIsPaying(true);
		setPaymentError(null);

		console.log("Presenting Payment Sheet...");
		const { error } = await presentPaymentSheet();

		if (error) {
			// This part is correct. It handles cancellations and declines.
			if (error.code !== "Canceled") {
				console.error("Payment failed:", error);
				setPaymentError(
					`Payment failed: ${error.localizedMessage || error.message}`
				);
			}
			setIsPaying(false);
		} else {
			// --- PAYMENT SUCCEEDED ---
			// We no longer look for a pending document ID.
			// We simply navigate to a confirmation screen. The webhook will handle the rest.
			console.log(
				"Payment Sheet completed successfully! Navigating to confirmation."
			);

			navigation.dispatch(
				CommonActions.reset({
					index: 0,
					routes: [
						{
							name: "OrderConfirmation",
							params: {
								// We pass a status to tell the screen to show a "processing" message
								// while it waits for the webhook.
								initialStatus: "processing",
								// We no longer pass an orderDocId
							},
						},
					],
				})
			);

			// Note: We don't set isPaying to false here because we are navigating away.
		}
	};

	// Function to toggle PIP section expansion
	const toggleExpandPIP = (personId) => {
		setExpandedPIPs((prev) => ({ ...prev, [personId]: !prev[personId] }));
	};

	// --- Render Logic ---
	if (!currentUserData || !restaurant || isDataLoading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	return (
		// --- ADD BACK StripeProvider ---
		<StripeProvider publishableKey={stripePublishableKey}>
			<View style={styles.container}>
				<ScrollView showsVerticalScrollIndicator={false}>
					<Text style={styles.mainHeading}>Review Your Order</Text>
					<Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>

					{/* --- PIP Breakdown --- */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Items by Person</Text>
						{filteredBasketData.map((personData) => {
							const isExpanded = !!expandedPIPs[personData.personId];
							// Find matching pip calculated data
							const pipData = pipTotals.find(
								(p) => p.personId === personData.personId
							);
							// Calculate estimated total for this PIP including client-estimated tax
							const estimatedPipTotal = pipData
								? pipData.totalBeforeTax + pipData.tax
								: 0;

							if (!pipData) return null; // Safety check
							return (
								<View key={personData.personId} style={styles.pipSection}>
									<TouchableOpacity
										onPress={() => toggleExpandPIP(personData.personId)}
										style={styles.pipHeader}
									>
										<Text style={styles.pipName}>
											{personData.pipName || "Guest"}
										</Text>
										<View style={styles.pipHeaderTotals}>
											<Text style={styles.pipTotalDisplay}>
												Est: {formatCurrency(estimatedPipTotal)}
											</Text>
											<MaterialCommunityIcons
												name={isExpanded ? "chevron-up" : "chevron-down"}
												size={26}
												color={colors.primary}
											/>
										</View>
									</TouchableOpacity>
									{isExpanded && (
										<View style={styles.pipItemsContainer}>
											{personData.items.map((item, index) => (
												<View
													key={`${item.dish.id}-${index}`}
													style={styles.itemRow}
												>
													<Text style={styles.itemName}>
														{item.quantity}x {item.dish.name}
													</Text>
													<Text style={styles.itemPrice}>
														{formatCurrency(
															Math.round(
																(item.discount
																	? parseFloat(item.discountedPrice)
																	: item.dish?.price || 0) * 100
															) * item.quantity
														)}
													</Text>
												</View>
											))}
										</View>
									)}
								</View>
							);
						})}
					</View>

					{/* --- Gratuity Picker --- */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Add Gratuity</Text>
						<View style={styles.gratuityContainer}>
							<Text style={styles.gratuityCurrentText}>
								Selected: {gratuityPercentage}% ({formatCurrency(gratuity)})
							</Text>
							<Picker
								selectedValue={gratuityPercentage}
								onValueChange={(itemValue) => setGratuityPercentage(itemValue)}
								style={styles.gratuityPicker}
								// Add prompt etc if desired
							>
								<Picker.Item label="0%" value="0" />
								<Picker.Item label="10%" value="10" />
								<Picker.Item label="15%" value="15" />
								<Picker.Item label="18%" value="18" />
								<Picker.Item label="20%" value="20" />
								<Picker.Item label="25%" value="25" />
							</Picker>
						</View>
					</View>

					{/* --- Order Summary Section --- */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Order Summary</Text>
						{totalDiscount > 0 && (
							<>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>Original Subtotal:</Text>
									<Text style={styles.originalPrice}>
										{formatCurrency(originalSubtotal)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>Discounts:</Text>
									<Text style={styles.discountAmount}>
										-{formatCurrency(totalDiscount)}
									</Text>
								</View>
							</>
						)}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Subtotal:</Text>
							<Text style={styles.amount}>{formatCurrency(subtotal)}</Text>
						</View>
						{/* Gratuity Row */}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>
								Gratuity ({gratuityPercentage}%):
							</Text>
							<Text style={styles.amount}>{formatCurrency(gratuity)}</Text>
						</View>
						{/* Platform Fee Row */}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Service Fee:</Text>
							<Text style={styles.amount}>{formatCurrency(platformFee)}</Text>
						</View>

						{/* Final Total Row */}
						<View style={[styles.summaryRow, styles.totalRow]}>
							<Text style={styles.totalLabel}>Total Amount:</Text>
							{isPreparing || finalTotal === null ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<Text style={styles.totalAmount}>
									{formatCurrency(finalTotal)}
								</Text>
							)}
						</View>
					</View>

					{/* --- TODO: Payment Method Selection UI --- */}
					{/* <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Payment Method</Text>
                        // Add UI here to list savedCards and allow selection (sets selectedCard state)
                        // OR indicate that a new card will be entered via Payment Sheet
                    </View> */}

					{paymentError && <Text style={styles.errorText}>{paymentError}</Text>}

					{/* --- Pay Button --- */}
					<View style={styles.payButtonContainer}>
						<Button
							title={
								isPreparing
									? "Calculating..."
									: isPaying
									? "Processing..."
									: finalTotal !== null
									? `Pay ${formatCurrency(finalTotal)}`
									: "Pay Now"
							}
							onPress={handlePayment}
							disabled={!isPaymentSheetReady || isPreparing || isPaying} // Disable until ready & not processing
							color={colors.primary} // Use theme color
						/>
					</View>
				</ScrollView>
			</View>
		</StripeProvider>
	);
};

// --- Styles ---
// (Use styles from previous examples, ensure they cover elements used)
const styles = StyleSheet.create({
	loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
	container: { flex: 1, backgroundColor: colors.background || "#f4f4f8" }, // Lighter background
	mainHeading: {
		fontSize: 24,
		fontWeight: "bold",
		textAlign: "center",
		marginVertical: 20,
		color: colors.textDark,
	},
	restaurantName: {
		fontSize: 18,
		fontWeight: "500",
		textAlign: "center",
		marginBottom: 20,
		color: colors.text,
	},
	section: {
		marginBottom: 15,
		padding: 15,
		backgroundColor: "#ffffff",
		borderRadius: 10,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 3,
		elevation: 2,
		marginHorizontal: 10,
	},
	sectionTitle: {
		fontSize: 17,
		fontWeight: "bold",
		marginBottom: 12,
		color: colors.primary,
		paddingBottom: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
	},
	label: { fontSize: 15, color: "#495057" },
	amount: { fontSize: 15, fontWeight: "500" },
	labelItalic: { fontSize: 15, color: "#6c757d", fontStyle: "italic" },
	amountItalic: {
		fontSize: 15,
		fontWeight: "500",
		fontStyle: "italic",
		color: "#6c757d",
	},
	totalRow: {
		marginTop: 10,
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: "#eee",
	},
	totalLabel: { fontSize: 16, fontWeight: "bold" },
	totalAmount: { fontSize: 16, fontWeight: "bold" },
	errorText: { color: "red", textAlign: "center", marginVertical: 10 },
	gratuityContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 20,
		padding: 10,
		backgroundColor: "#fff",
		borderRadius: 8,
	},
	// PIP Styles
	pipSection: {
		marginBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
		paddingBottom: 10,
	},
	pipHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 5,
	},
	pipName: { fontSize: 16, fontWeight: "600", flexShrink: 1, marginRight: 8 }, // Allow name to shrink
	pipHeaderTotals: { flexDirection: "row", alignItems: "center" }, // Container for total and icon
	pipTotalDisplay: {
		fontSize: 15,
		fontWeight: "500",
		color: colors.text,
		marginRight: 5,
	}, // Style for PIP total in header
	pipItemsContainer: {
		paddingLeft: 15,
		marginTop: 8,
		borderLeftWidth: 2,
		borderLeftColor: colors.lightGray,
	},
	itemRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 4,
	},
	itemName: { fontSize: 14, color: colors.text, flexShrink: 1, marginRight: 5 },
	itemPrice: { fontSize: 14, color: colors.text, fontWeight: "500" },
	pipDetailText: {
		fontSize: 13,
		color: colors.textLight,
		fontStyle: "italic",
		marginTop: 2,
	}, // For optional PIP breakdown details
	// Summary Styles
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 5,
	},
	label: { fontSize: 15, color: colors.textDark },
	amount: { fontSize: 15, fontWeight: "500", color: colors.textDark },
	originalPrice: {
		fontSize: 15,
		textDecorationLine: "line-through",
		color: colors.textLight,
		marginLeft: 5,
	},
	discountAmount: {
		fontSize: 15,
		color: colors.warning || "#E85D04",
		fontWeight: "500",
	},
	labelItalic: { fontSize: 15, color: colors.textLight, fontStyle: "italic" },
	amountItalic: {
		fontSize: 15,
		fontWeight: "500",
		fontStyle: "italic",
		color: colors.textLight,
	},
	calculatingText: {
		fontSize: 15,
		fontStyle: "italic",
		color: colors.textLight,
	},
	totalRow: {
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: 1.5,
		borderTopColor: colors.primary,
	},
	totalLabel: { fontSize: 17, fontWeight: "bold", color: colors.primary },
	totalAmount: { fontSize: 17, fontWeight: "bold", color: colors.primary },
	// Gratuity Styles
	gratuityContainer: { paddingVertical: 10 }, // Container for the whole gratuity section
	gratuitySelectionRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 0,
	}, // Row layout for label, picker, amount
	gratuityLabel: { fontSize: 15, color: colors.textDark, marginRight: 10 }, // Label for "Tip:"
	gratuityPicker: {
		flex: 1, // Allow picker to take available space
		height: Platform.OS === "ios" ? 120 : 50, // iOS needs more height for wheel
		// Add specific styling for iOS background if needed
		// backgroundColor: Platform.OS === 'ios' ? '#f0f0f0' : 'transparent',
	},
	gratuityPickerItem: {
		// iOS only
		height: 120,
	},
	gratuityAmountDisplay: {
		fontSize: 15,
		fontWeight: "500",
		color: colors.textDark,
		marginLeft: 10,
	}, // Display calculated amount
	errorText: {
		color: colors.danger || "red",
		textAlign: "center",
		marginVertical: 10,
		paddingHorizontal: 10,
	},
	payButtonContainer: { margin: 20, marginTop: 10 },
});

export default CheckoutScreen;

