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
import { httpsCallable } from "@react-native-firebase/functions";

import firestore from "@react-native-firebase/firestore";
import { useTranslation } from "react-i18next";
import { chargeSavedCard } from "../../services/PaypalAdapter";
import { Ionicons } from "@expo/vector-icons";

const CheckoutScreen = ({ route, navigation }) => {
	const { t } = useTranslation();
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
	const [savedCards, setSavedCards] = useState([]);
	const [selectedVaultId, setSelectedVaultId] = useState(null);
	const [isDropdownExpanded, setIsDropdownExpanded] = useState(false);

	// Use useRef to store the orderId across the reidrect reliably
	const pendingOrderIdRef = useRef(null);
	const pendingFirestoreDocIdRef = useRef(null); // FIresstore's UNIQUE Id

	const { checkInObj } = useCheckInStatus(
		restaurant?.uid,
		currentUserData?.uid,
	); // Keep if needed for metadata

	const [isPaymentSheetReady, setIsPaymentSheetReady] = useState(false); // <<< ADD BACK
	const [stripePublishableKey, setStripePublishableKey] = useState(null);
	const [calculatedTax, setCalculatedTax] = useState(0); // Tax from server
	const [finalTotal, setFinalTotal] = useState(0); // Final total from server

	const [isReadyToPay, setIsReadyToPay] = useState(false);

	const { initPaymentSheet, presentPaymentSheet } = useStripe(); // <<< ADD BACK
	const country = restaurant?.countryCode;

	const isPanama =
		country === "PA" || country === "Panama" || country === "panama";
	const isUSA = country === "US" || country === "USA" || country === "usa";

	const selectedCard =
		savedCards?.find((card) => card.vaultId === selectedVaultId) ||
		savedCards?.[0];
	// --- Memoized Basket Items (Keep this) ---
	const restaurantBasketItems = useMemo(() => {
		const items = baskets[restaurant?.id]?.items || [];
		return items.filter((item) => item.sentToChefQ);
	}, [baskets, restaurant?.id]);

	// --- Memoized PIP Data (Keep this if needed for display) ---
	const filteredBasketData = useMemo(() => {
		const transformedData = transformBasketData(restaurantBasketItems);
		return transformedData.filter(
			(personData) => personData.items && personData.items.length > 0,
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
					setFees(0.03); // Set default if not found
				}
			} catch (error) {
				/* ... error handling ... */
			}
			if (restaurant?.uid) {
				try {
					const getStripePublishableKeyFunction = httpsCallable(
						functions,
						"getStripePublishableKey",
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
					if (isMounted) setPaymentError(t("could_not_load_payment_config"));
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
		finalTotal: memoizedFinalTotal,
	} = useMemo(() => {
		console.log("Memo: Recalculating Totals Running");
		// Guard clause: Ensure necessary data is available
		if (
			!restaurantBasketItems ||
			restaurantBasketItems.length === 0 ||
			!Array.isArray(filteredBasketData) || // Ensure it's an array
			typeof fees !== "number"
		) {
			console.log(
				"Calculate Totals Memo: Skipping, missing required data or basket is not ready.",
			);
			return {
				subtotal: 0,
				gratuity: 0,
				platformFee: 0,
				totalDiscount: 0,
				originalSubtotal: 0,
				pipTotals: [],
				totalForPayment: 0,
				finalTotal: 0,
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
			calcSubtotal * (parseFloat(gratuityPercentage) / 100),
		);

		// Calculate details per PIP
		const calcPipTotals = filteredBasketData.map((personData) => {
			const itemsToReduce = personData?.items;
			let pipSubtotal = 0;
			let pipOriginalSubtotal = 0; // Original subtotal for this PIP

			if (Array.isArray(itemsToReduce)) {
				pipSubtotal = itemsToReduce.reduce((total, item) => {
					const originalPrice = Math.round(
						(Number(item?.dish?.price) || 0) * 100,
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

			const pipTotal = pipSubtotal + pipGratuity;
			return {
				...(personData || {}), // Spread person data safely
				subtotal: pipSubtotal,
				fee: pipFee,
				gratuity: pipGratuity,
				discount: pipDiscount,
				total: pipTotal,
			};
		});

		// Calculate overall platform fee by summing pipFees
		const calculated_platform_fee = calcPipTotals.reduce(
			(sum, pip) => sum + (pip.fee || 0),
			0,
		);

		const calcTotalDiscount = calcOriginalSubtotal - calcSubtotal;
		const calcTotalForPayment = calcSubtotal + calcGratuityAmount;
		const calcFinalAmount =
			calcSubtotal + calcGratuityAmount + calculated_platform_fee;

		return {
			subtotal: calcSubtotal,
			gratuity: calcGratuityAmount,
			platformFee: calculated_platform_fee,
			totalDiscount: calcTotalDiscount,
			originalSubtotal: calcOriginalSubtotal,
			pipTotals: calcPipTotals, // Include the detailed PIP array
			totalForPayment: calcTotalForPayment,
			finalTotal: calcFinalAmount,
		};
	}, [
		// Dependencies for recalculation
		restaurantBasketItems,
		gratuityPercentage,
		fees,
		filteredBasketData,
	]);

	useEffect(() => {
		if (memoizedFinalTotal !== undefined) {
			setFinalTotal(memoizedFinalTotal);
		}
	}, [memoizedFinalTotal]);

	useEffect(() => {
		console.log("--- Debugging Pay Button Status ---");
		console.log("1. Has currentUserData:", !!currentUserData?.uid);
		console.log("2. Has restaurantData:", !!restaurant?.uid);
		console.log("3. Has checkInObj:", !!checkInObj?.id);
		console.log(
			"4. Is finalTotal > 0:",
			finalTotal > 0,
			`(Value: ${finalTotal})`,
		);
		const canPay =
			currentUserData?.uid &&
			restaurant?.uid &&
			checkInObj?.id &&
			finalTotal > 0;

		setIsReadyToPay(canPay);
	}, [currentUserData, restaurant, checkInObj, finalTotal]);
	// --- NEW/REVISED: useEffect to Prepare Payment Sheet Data ---

	const handlePayment = async () => {
		if (!isReadyToPay || isPreparing) {
			return; // Prevent multiple presses
		}
		setIsPreparing(true);
		setPaymentError(null);

		try {
			// --- Step A: Call the single 'preparePayment' Cloud Function ---
			console.log("Button pressed. Calling 'preparePayment' function...");
			const preparePayment = httpsCallable(functions, "preparePayment");

			// --- This is the new, secure payload ---
			// We send item IDs and quantities, NOT the final total.
			// The backend will calculate the authoritative total.
			const { data: prepData } = await preparePayment({
				paymentType: "individual",
				restaurantId: restaurant.uid,
				items: restaurantBasketItems.map((item) => ({
					id: item.id,
					quantity: item.quantity,
				})),
				gratuity: gratuity, // Send the calculated gratuity amount in cents
				stripeCustomerId: currentUserData.stripeCustomerId, // Assumes you have this
				checkInId: checkInObj.id,
				table: checkInObj.table || null, // Add this line
				server: checkInObj.server || null,
				checkInTimestamp: checkInObj.acceptedAt,
			});

			console.log("PrepData:", prepData);

			if (!prepData?.paymentIntentClientSecret) {
				throw new Error(t("failed_to_get_payment_details_from_server"));
			}

			// --- Step B: Initialize the Stripe Payment Sheet ---
			const { error: initError } = await initPaymentSheet({
				merchantDisplayName: `Scerv Inc. - ${restaurant.restaurantName}`,
				paymentIntentClientSecret: prepData.paymentIntentClientSecret,
				customerEphemeralKeySecret: prepData.ephemeralKeySecret,
				customerId: prepData.customerId,
				allowsDelayedPaymentMethods: true,
				returnURL: "scerv://stripe-redirect", // Your app's custom URL scheme
			});

			if (initError) {
				throw new Error(
					t("failed_to_initialize_payment_sheet", {
						message: initError.message,
					}),
				);
			}

			// --- Step C: Present the Payment Sheet to the User ---
			const { error: presentError } = await presentPaymentSheet();

			if (presentError) {
				if (presentError.code !== "Canceled") {
					throw new Error(
						t("payment_failed", { message: presentError.message }),
					);
				}
				// If user cancels, we simply do nothing.
			} else {
				// --- Step D: Handle Successful Payment ---
				console.log("Payment successful! Navigating to confirmation screen.");

				navigation.dispatch(
					CommonActions.reset({
						index: 0,
						routes: [
							{
								name: "OrderConfirmation",
								params: {
									initialStatus: "processing",
									itemsToRate: restaurantBasketItems.map((i) => ({
										id: i.id,
										name: i.dish.name,
										menuItemId: i.menuItemId,
										restaurantId: i.restaurantId,
										price: i.price,
										quantity: i.quantity,
										discountedPrice: i.discountedPrice,
									})),

									isIndividual: true, // ← NEW
									origin: "individual",
								},
							},
						],
					}),
				);
			}
		} catch (error) {
			console.error("Payment process failed:", error);
			setPaymentError(error.message);
			Alert.alert(t("payment_error"), error.message);
		} finally {
			setIsPreparing(false);
		}
	};

	useEffect(() => {
		const fetchSavedCards = async () => {
			const uid = currentUserData.uid;
			if (!uid) return;

			try {
				const cardsSnapshot = await db
					.collection("customers")
					.doc(uid)
					.collection("savedPaymentMethods")
					.where("processor", "==", "paypal")
					.get();

				const cards = cardsSnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));

				console.log("Has card", cards);
				setSavedCards(cards);

				// Auto-select the first card if they have one
				if (cards.length > 0) {
					setSelectedVaultId(cards[0].vaultId);
				}
			} catch (error) {
				console.error("Error fetching saved cards: ", error);
			}
		};

		fetchSavedCards();
	}, []);

	useEffect(() => {
		if (savedCards && savedCards.length > 0 && !selectedVaultId) {
			setSelectedVaultId(savedCards[0].vaultId);
		}
	}, [savedCards, selectedVaultId]);

	const handlePayPalCheckout = async () => {
		if (!isReadyToPay || isPreparing || finalTotal <= 0) return;

		try {
			setIsPreparing(true);
			setIsLoading(true);

			const uid = currentUserData?.uid; // Use your existing user auth variable

			console.log("Creating pending order for Standard PayPal checkout...");

			// 1. Build the pending order just like the vaulted flow
			const pendingOrderData = {
				restaurantId: restaurant.uid,
				customerId: uid,
				subtotal: originalSubtotal,
				gratuity: gratuity,
				platformFee: platformFee,
				totalPrice: finalTotal,
				items: restaurantBasketItems,
				table: checkInObj?.table || null,
				checkInId: checkInObj?.id || null,
				server: checkInObj?.server || null,
				status: "pending",
				type: "individual",
				createdAt: firestore.FieldValue.serverTimestamp(),
			};

			const pendingOrderRef = await firestore()
				.collection("pending_orders")
				.add(pendingOrderData);
			const pendingOrderId = pendingOrderRef.id;
			console.log("✅ Created Pending Order ID:", pendingOrderId);

			// 2. Build the itemsToRate array so we don't lose the rating feature in the WebView!
			const itemsToRate = restaurantBasketItems.map((i) => ({
				id: i.id,
				name: i.dish.name,
				menuItemId: i.menuItemId,
				restaurantId: i.restaurantId,
				price: i.price,
				quantity: i.quantity,
				discountedPrice: i.discountedPrice,
			}));

			// 3. Pass all the math AND the new IDs to the PayPal WebView Screen
			navigation.navigate("PayPalScreen", {
				restaurantId: restaurant.uid,
				amount: (finalTotal / 100).toFixed(2),
				subtotal: (originalSubtotal / 100).toFixed(2),
				gratuity: (gratuity / 100).toFixed(2),
				platformFee: (platformFee / 100).toFixed(2),
				appOrderId: pendingOrderId, // <--- NEW: The DB Document ID
				paymentType: "individual", // <--- NEW: For fulfillOrder
				itemsToRate: itemsToRate, // <--- NEW: Passing ratings data forward
			});
		} catch (error) {
			console.error("Error creating pending order:", error);
			Alert.alert("Error", "Could not initialize PayPal checkout.");
		} finally {
			setIsPreparing(false);
			setIsLoading(false);
		}
	};
	// Make sure you have this import at the top:
	// import firestore from '@react-native-firebase/firestore';

	const handleVaultedCheckout = async () => {
		// 1. Validation
		if (!isReadyToPay || isPreparing || !selectedVaultId || finalTotal <= 0) {
			return; // Silent return, just like your Stripe code
		}

		try {
			setIsPreparing(true); // Matching your state name from the Stripe code
			setIsLoading(true);

			const payPalAmount = (finalTotal / 100).toFixed(2);
			const uid = currentUserData?.uid; // Or however you get the current user ID in this file

			// =========================================================
			// 2. CREATE THE PENDING ORDER (Bypassing Stripe preparePayment)
			// =========================================================
			console.log("Creating pending order for PayPal Vault checkout...");

			const pendingOrderData = {
				restaurantId: restaurant.uid,
				customerId: uid,
				subtotal: originalSubtotal,
				gratuity: gratuity,
				platformFee: platformFee, // Add this if you have it in state
				totalPrice: finalTotal,
				// We pass the full items so fulfillOrder can delete them from the basket later
				items: restaurantBasketItems,
				table: checkInObj?.table || null,
				checkInId: checkInObj?.id || null,
				server: checkInObj?.server || null,
				status: "pending",
				type: "individual", // So fulfillOrder knows how to clean it up
				createdAt: firestore.FieldValue.serverTimestamp(),
			};

			const pendingOrderRef = await db
				.collection("pending_orders")
				.add(pendingOrderData);
			const pendingOrderId = pendingOrderRef.id;
			console.log("✅ Created Pending Order ID:", pendingOrderId);

			// =========================================================
			// 3. CHARGE THE SAVED CARD
			// =========================================================
			console.log(
				`Charging Vault ID ${selectedVaultId} for $${payPalAmount}...`,
			);

			const result = await chargeSavedCard(
				selectedVaultId,
				payPalAmount,
				restaurant.uid,
				pendingOrderId,
				"individual",
			);

			// =========================================================
			// 4. SUCCESS & NAVIGATION (Matching your exact original payload)
			// =========================================================
			if (result && result.success) {
				console.log(
					"✅ Payment successful! Navigating to confirmation screen.",
				);

				navigation.dispatch(
					CommonActions.reset({
						index: 0,
						routes: [
							{
								name: "OrderConfirmation",
								params: {
									initialStatus: "processing",
									// Keeping your exact rating payload!
									itemsToRate: restaurantBasketItems.map((i) => ({
										id: i.id,
										name: i.dish.name,
										menuItemId: i.menuItemId,
										restaurantId: i.restaurantId,
										price: i.price,
										quantity: i.quantity,
										discountedPrice: i.discountedPrice,
									})),
									isIndividual: true,
									origin: "individual",
								},
							},
						],
					}),
				);
			}
		} catch (error) {
			console.error("Payment process failed:", error);
			setPaymentError(error.message);
			Alert.alert(
				"Payment Error",
				"Could not process your saved card. " + String(error.message),
			);
		} finally {
			setIsPreparing(false);
			setIsLoading(false);
		}
	};

	const handleDeleteCard = (documentId, vaultIdToDelete) => {
		Alert.alert(
			"Remove Card",
			"Are you sure you want to delete this saved card?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							const uid = currentUserData?.uid; // Or however you get your uid

							// 1. Delete from Firestore
							await firestore()
								.collection("customers")
								.doc(uid)
								.collection("savedPaymentMethods")
								.doc(documentId)
								.delete();

							// 2. Remove it from the local screen state instantly
							setSavedCards((prevCards) =>
								prevCards.filter((card) => card.id !== documentId),
							);

							// 3. If they just deleted the card they had selected, deselect it
							if (selectedVaultId === vaultIdToDelete) {
								setSelectedVaultId(null);
							}

							console.log("Card successfully deleted.");
						} catch (error) {
							console.error("Error deleting card:", error);
							Alert.alert(
								"Error",
								"Could not remove this card. Please try again.",
							);
						}
					},
				},
			],
		);
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
					<Text style={styles.mainHeading}>{t("review_your_order")}</Text>
					<Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>

					{/* --- PIP Breakdown --- */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>{t("items_by_person")}</Text>
						{filteredBasketData.map((personData) => {
							const isExpanded = !!expandedPIPs[personData.personId];
							// Find matching pip calculated data
							const pipData = pipTotals.find(
								(p) => p.personId === personData.personId,
							);
							// Calculate estimated total for this PIP including client-estimated tax
							const estimatedPipTotal = pipData ? pipData.total : 0;

							if (!pipData) return null; // Safety check
							return (
								<View key={personData.personId} style={styles.pipSection}>
									<TouchableOpacity
										onPress={() => toggleExpandPIP(personData.personId)}
										style={styles.pipHeader}
									>
										<Text style={styles.pipName}>
											{personData.pipName || t("guest")}
										</Text>
										<View style={styles.pipHeaderTotals}>
											<Text style={styles.pipTotalDisplay}>
												{t("est_amount", {
													amount: formatCurrency(estimatedPipTotal),
												})}
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
																	: item.dish?.price || 0) * 100,
															) * item.quantity,
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
						<Text style={styles.sectionTitle}>{t("add_gratuity")}</Text>
						<View style={styles.gratuityContainer}>
							<Text style={styles.gratuityCurrentText}>
								{t("selected_gratuity", {
									percentage: gratuityPercentage,
									amount: formatCurrency(gratuity),
								})}
							</Text>
							<View style={styles.pickerContainer}>
								<Picker
									selectedValue={gratuityPercentage}
									onValueChange={(itemValue) =>
										setGratuityPercentage(itemValue)
									}
									style={styles.gratuityPicker}
									itemStyle={styles.gratuityPickerItem}
								>
									<Picker.Item label={t("0_percent")} value="0" />
									<Picker.Item label={t("5_percent")} value="5" />
									<Picker.Item label={t("10_percent")} value="10" />
									<Picker.Item label={t("15_percent")} value="15" />
									<Picker.Item label={t("18_percent")} value="18" />
									<Picker.Item label={t("20_percent")} value="20" />
									<Picker.Item label={t("25_percent")} value="25" />
								</Picker>
								<MaterialCommunityIcons
									name="chevron-down"
									size={24}
									color={colors.textDark}
									style={styles.pickerIcon}
								/>
							</View>
						</View>
					</View>

					{/* --- Order Summary Section --- */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>{t("order_summary")}</Text>
						{totalDiscount > 0 && (
							<>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>{t("original_subtotal")}:</Text>
									<Text style={styles.originalPrice}>
										{formatCurrency(originalSubtotal)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>{t("discounts")}:</Text>
									<Text style={styles.discountAmount}>
										-{formatCurrency(totalDiscount)}
									</Text>
								</View>
							</>
						)}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>{t("subtotal")}:</Text>
							<Text style={styles.amount}>{formatCurrency(subtotal)}</Text>
						</View>
						{/* Gratuity Row */}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>
								{t("gratuity_with_percentage", {
									percentage: gratuityPercentage,
								})}
								:
							</Text>
							<Text style={styles.amount}>{formatCurrency(gratuity)}</Text>
						</View>
						{/* Platform Fee Row */}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>{t("service_fee")}:</Text>
							<Text style={styles.amount}>{formatCurrency(platformFee)}</Text>
						</View>

						{/* Final Total Row */}
						<View style={[styles.summaryRow, styles.totalRow]}>
							<Text style={styles.totalLabel}>{t("total_amount")}:</Text>
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
					{isPanama && (
						<>
							{/* THE SAVED CARDS DROPDOWN (PayPal) */}
							{selectedCard && (
								<View style={styles.savedCardsWrapper}>
									<View style={styles.selectedCardRow}>
										<TouchableOpacity
											style={styles.cardSelectArea}
											onPress={() => setIsDropdownExpanded(!isDropdownExpanded)}
										>
											<Ionicons
												name="card"
												size={24}
												color="#333"
												style={styles.cardIcon}
											/>
											<Text style={styles.cardText}>
												{selectedCard.brand} •••• {selectedCard.last4}
											</Text>
											<Ionicons
												name={
													isDropdownExpanded ? "chevron-up" : "chevron-down"
												}
												size={20}
												color="#666"
											/>
										</TouchableOpacity>

										<TouchableOpacity
											style={styles.deleteButton}
											onPress={() =>
												handleDeleteCard(selectedCard.id, selectedCard.vaultId)
											}
										>
											<Ionicons
												name="trash-outline"
												size={24}
												color="#FF3B30"
											/>
										</TouchableOpacity>
									</View>

									{isDropdownExpanded && (
										<View style={styles.dropdownContainer}>
											{savedCards.map((card) => {
												if (card.id === selectedCard.id) return null;
												return (
													<TouchableOpacity
														key={card.id}
														style={styles.dropdownItem}
														onPress={() => {
															setSelectedVaultId(card.vaultId);
															setIsDropdownExpanded(false);
														}}
													>
														<Ionicons
															name="card-outline"
															size={20}
															color="#888"
															style={styles.cardIcon}
														/>
														<Text style={styles.dropdownCardText}>
															{card.brand} •••• {card.last4}
														</Text>
													</TouchableOpacity>
												);
											})}
										</View>
									)}
								</View>
							)}

							{/* THE PAYPAL CHECKOUT BUTTONS */}
							<View style={styles.checkoutButtonsContainer}>
								{selectedCard ? (
									// ===============================================
									// STATE 1: USER HAS A SAVED CARD
									// ===============================================
									<>
										{/* Primary Button: Pay with Vault */}
										<TouchableOpacity
											style={[
												styles.paypalButton,
												styles.buttonMargin,
												(!isReadyToPay || isPreparing) && styles.buttonDisabled,
											]}
											onPress={handleVaultedCheckout}
											disabled={
												!isReadyToPay || isPreparing || !selectedVaultId
											}
										>
											<Text style={styles.buttonText}>
												Pay with Selected Card
											</Text>
										</TouchableOpacity>

										{/* Secondary Button: Add a New Card (Smaller, Text-Only) */}
										<TouchableOpacity
											style={styles.secondaryTextButton}
											onPress={handlePayPalCheckout}
											disabled={!isReadyToPay || isPreparing}
										>
											<Text style={styles.secondaryButtonText}>
												Add a New Card
											</Text>
										</TouchableOpacity>
									</>
								) : (
									// ===============================================
									// STATE 2: NO SAVED CARDS (First-time user)
									// ===============================================
									<TouchableOpacity
										style={[
											styles.paypalButton,
											(!isReadyToPay || isPreparing) && styles.buttonDisabled,
										]}
										onPress={handlePayPalCheckout}
										disabled={!isReadyToPay || isPreparing}
									>
										<Text style={styles.buttonText}>
											Pay {formatCurrency(finalTotal)}
										</Text>
									</TouchableOpacity>
								)}
							</View>
						</>
					)}

					{/* ========================================== */}
					{/* 🇺🇸 USA CHECKOUT (Stripe)                   */}
					{/* ========================================== */}
					{isUSA && (
						<View style={styles.checkoutButtonsContainer}>
							<TouchableOpacity
								style={[
									styles.standardButton,
									(!isReadyToPay || isPreparing) && styles.buttonDisabled,
								]}
								onPress={handlePayment}
								disabled={!isReadyToPay || isPreparing}
							>
								<Text style={styles.buttonText}>
									Pay {formatCurrency(finalTotal)}
								</Text>
							</TouchableOpacity>
						</View>
					)}
				</ScrollView>
			</View>
		</StripeProvider>
	);
};

// --- Styles ---
// (Use styles from previous examples, ensure they cover elements used)
const styles = StyleSheet.create({
	loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
	container: { flex: 1, backgroundColor: colors.background || "#f4f4f8" },
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
	pipName: {
		fontSize: 16,
		fontWeight: "600",
		flexShrink: 1,
		marginRight: 8,
		color: colors.textDark,
	},
	pipHeaderTotals: { flexDirection: "row", alignItems: "center" },
	pipTotalDisplay: {
		fontSize: 15,
		fontWeight: "500",
		color: colors.text,
		marginRight: 5,
	},
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
	},
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
	gratuityContainer: { paddingVertical: 10 },
	gratuityCurrentText: {
		fontSize: 15,
		color: colors.textDark,
		marginBottom: 10,
	},
	pickerContainer: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		borderColor: colors.lightGray,
		borderRadius: 8,
		paddingHorizontal: 10,
	},
	gratuityPicker: {
		flex: 1,
		height: Platform.OS === "ios" ? 120 : 50,
		color: colors.textDark,
	},
	gratuityPickerItem: {
		height: 120,
		color: colors.textDark,
	},
	pickerIcon: {
		position: "absolute",
		right: 10,
		top: Platform.OS === "ios" ? 50 : 12,
	},
	gratuityAmountDisplay: {
		fontSize: 15,
		fontWeight: "500",
		color: colors.textDark,
		marginLeft: 10,
	},
	errorText: {
		color: colors.danger || "red",
		textAlign: "center",
		marginVertical: 10,
		paddingHorizontal: 10,
	},

	// ==========================================
	// 💳 PAYMENT UI STYLES
	// ==========================================

	// Dropdown Container
	savedCardsWrapper: {
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E5E5EA",
		marginVertical: 16,
		marginHorizontal: 20, // aligns perfectly with the buttons
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 3,
		elevation: 2,
	},
	selectedCardRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 16,
		paddingHorizontal: 16,
		backgroundColor: "#FAFAFA",
	},
	cardSelectArea: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	cardIcon: {
		marginRight: 12,
	},
	cardText: {
		fontSize: 16,
		color: "#1C1C1E",
		fontWeight: "600",
		flex: 1,
	},
	deleteButton: {
		paddingLeft: 16,
		paddingVertical: 4,
		justifyContent: "center",
		alignItems: "center",
	},
	dropdownContainer: {
		backgroundColor: "#FFFFFF",
		borderTopWidth: 1,
		borderTopColor: "#E5E5EA",
	},
	dropdownItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 16,
		paddingHorizontal: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#F2F2F7",
	},
	dropdownCardText: {
		fontSize: 15,
		color: "#8E8E93",
		fontWeight: "500",
	},

	// Buttons Container
	checkoutButtonsContainer: {
		marginTop: 24,
		paddingHorizontal: 20, // Keeps buttons off screen edges
		paddingBottom: 40,
		width: "100%",
	},
	buttonMargin: {
		marginBottom: 16, // Perfect gap between stacked buttons
	},

	// 🔵 PayPal Specific Button
	paypalButton: {
		backgroundColor: colors.primary, // Official PayPal Blue
		paddingVertical: 16,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		width: "100%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},

	// ⚫ Standard / Stripe Button
	standardButton: {
		backgroundColor: colors.primary || "#111111",
		paddingVertical: 16,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		width: "100%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},

	// ⚪ Disabled State (Applies to both)
	buttonDisabled: {
		backgroundColor: "#D1D1D6",
		shadowOpacity: 0,
		elevation: 0,
	},

	// Text Style (Applies to both)
	buttonText: {
		color: "#FFFFFF",
		fontSize: 18,
		fontWeight: "700",
		letterSpacing: 0.5,
	},
	secondaryTextButton: {
		paddingVertical: 12,
		alignItems: "center",
		justifyContent: "center",
		width: "100%",
	},
	secondaryButtonText: {
		color: "#0070BA", // Keeps the PayPal blue, but as text
		fontSize: 16,
		fontWeight: "600",
	},
});

export default CheckoutScreen;
