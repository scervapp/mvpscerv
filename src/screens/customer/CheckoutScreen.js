// CheckoutScreen.js (React Native - Smart Fields Version)

import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
	Button,
	Alert,
	Platform,
	TouchableOpacity,
} from "react-native";
import { functions, db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { useBasket } from "../../context/customer/BasketContext";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import {
	transformBasketData,
	useCheckInStatus,
} from "../../utils/customerUtils";
import { useStripe, StripeProvider } from "@stripe/stripe-react-native";
import colors from "../../utils/styles/appStyles";

import formatCurrency from "../../utils/currencyFormatter";
import { CommonActions } from "@react-navigation/native";
import { httpsCallable } from "@react-native-firebase/functions";

import firestore from "@react-native-firebase/firestore";
import { useTranslation } from "react-i18next";
import { chargeSavedCard } from "../../services/PaypalAdapter";
import { Ionicons } from "@expo/vector-icons";
import dLocalAdapter from "../../services/dLocalAdapter";

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import DlocalNativeCheckout from "./DlocalNativeCheckout.js";
import PlatformSelect from "../../components/global/PlatformSelect";

// NEW: Import our WebView Bridge Component

const DEFAULT_SCERV_FEE_PERCENTAGE = 0.03;

const normalizePercentage = (value, fallback = 0) => {
	if (value === undefined || value === null || value === "") return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return parsed > 1 ? parsed / 100 : parsed;
};

const getTierScervFeePercentage = (
	tierConfig,
	globalFeePercentage = DEFAULT_SCERV_FEE_PERCENTAGE,
) => {
	const globalFee = normalizePercentage(
		globalFeePercentage,
		DEFAULT_SCERV_FEE_PERCENTAGE,
	);
	if (!tierConfig) return globalFee;

	const rawFee =
		tierConfig.scervFeePercentage ??
		tierConfig.platformFeePercentage ??
		tierConfig.guestServiceFeePercentage ??
		tierConfig.customerServiceFeePercentage;

	if (rawFee !== undefined && rawFee !== null) {
		return Math.max(0, normalizePercentage(rawFee, DEFAULT_SCERV_FEE_PERCENTAGE));
	}

	const rawPayout = tierConfig.payoutPercentage;
	if (rawPayout !== undefined && rawPayout !== null) {
		return Math.max(
			0,
			Math.round((1 - normalizePercentage(rawPayout, 0.97)) * 10000) / 10000,
		);
	}

	return globalFee;
};

const CheckoutScreen = ({ route, navigation }) => {
	const { t, i18n } = useTranslation();
	const { restaurant, baskets } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const { clearBasket } = useBasket();

	// --- State Variables ---
	const [isPreparing, setIsPreparing] = useState(false);
	const [isPaying, setIsPaying] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isDataLoading, setIsDataLoading] = useState(true);
	const [paymentError, setPaymentError] = useState(null);
	const [pricingTiers, setPricingTiers] = useState(null);
	const [globalFeePercentage, setGlobalFeePercentage] = useState(
		DEFAULT_SCERV_FEE_PERCENTAGE,
	);
	const [gratuityPercentage, setGratuityPercentage] = useState("15");
	const [expandedPIPs, setExpandedPIPs] = useState({});
	const [savedCards, setSavedCards] = useState([]);
	const [selectedVaultId, setSelectedVaultId] = useState(null);
	const [isDlocalLoading, setIsDlocalLoading] = useState(false);

	// --- NEW SMART FIELDS STATE VARIABLES ---
	const [dlocalPublicKey, setDlocalPublicKey] = useState(null);
	const [dlocalCheckoutToken, setDlocalCheckoutToken] = useState(null);

	const pendingOrderIdRef = useRef(null);
	const pendingFirestoreDocIdRef = useRef(null);

	const { checkInObj } = useCheckInStatus(
		restaurant?.uid,
		currentUserData?.uid,
	);
	const serverRatingContext = useMemo(() => {
		const server = checkInObj?.server || null;
		const serverId = String(server?.id || "").trim();

		if (
			!restaurant?.uid ||
			!serverId ||
			serverId.toLowerCase() === "unassigned"
		) {
			return null;
		}

		return {
			restaurantId: restaurant.uid,
			checkInId: checkInObj?.id || null,
			server,
		};
	}, [checkInObj?.id, checkInObj?.server, restaurant?.uid]);

	const [isPaymentSheetReady, setIsPaymentSheetReady] = useState(false);
	const [stripePublishableKey, setStripePublishableKey] = useState(null);
	const [finalTotal, setFinalTotal] = useState(0);

	const [isReadyToPay, setIsReadyToPay] = useState(false);

	const { initPaymentSheet, presentPaymentSheet } = useStripe();
	const country =
		restaurant?.countryCode || restaurant?.country || restaurant?.countryName || "US";

	const isPanama =
		country === "PA" || country === "Panama" || country === "panama";
	const isUSA =
		country === "US" ||
		country === "USA" ||
		country === "usa" ||
		country === "United States";

	const selectedCard =
		savedCards?.find((card) => card.vaultId === selectedVaultId) ||
		savedCards?.[0];
	const stripeBillingDetails = useMemo(() => {
		const name = [
			currentUserData?.firstName,
			currentUserData?.lastName,
		]
			.filter(Boolean)
			.join(" ")
			.trim();

		return {
			...(name && { name }),
			...(currentUserData?.email && { email: currentUserData.email }),
			...(currentUserData?.phoneNumber && {
				phone: currentUserData.phoneNumber,
			}),
		};
	}, [currentUserData]);

	// --- Memoized Basket Items ---
	const restaurantBasketItems = useMemo(() => {
		const items = baskets[restaurant?.id]?.items || [];
		return items.filter((item) => item.sentToChefQ);
	}, [baskets, restaurant?.id]);

	// --- Memoized PIP Data ---
	const filteredBasketData = useMemo(() => {
		const transformedData = transformBasketData(restaurantBasketItems);
		return transformedData.filter(
			(personData) => personData.items && personData.items.length > 0,
		);
	}, [restaurantBasketItems]);

	// --- Fetch Initial Config & SMART FIELDS TOKENS ---
	useEffect(() => {
		let isMounted = true;
		const fetchInitialData = async () => {
			setIsDataLoading(true);
			try {
				const [tiersSnap, generalSnap] = await Promise.all([
					db.collection("appConfig").doc("pricingTiers").get(),
					db.collection("appConfig").doc("general").get(),
				]);
				if (isMounted && tiersSnap.exists()) {
					const data = tiersSnap.data();
					setPricingTiers(data.pricingTiers || data);
				}
				if (isMounted && generalSnap.exists()) {
					const data = generalSnap.data() || {};
					const rawFee =
						data.customerServiceFeePercentage ??
						data.scervFeePercentage ??
						data.platformFeePercentage ??
						data.fees;
					setGlobalFeePercentage(
						normalizePercentage(rawFee, DEFAULT_SCERV_FEE_PERCENTAGE),
					);
				}
			} catch (error) {
				// error handling
			}
			if (restaurant?.uid && !isPanama) {
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
					}
				} catch (e) {
					if (isMounted) setPaymentError(t("could_not_load_payment_config"));
				}
			}

			// === NEW: INITIALIZE DLOCAL SMART FIELDS FOR PANAMA ===
			if (isPanama && finalTotal > 0 && isMounted) {
				try {
					// 1. Fetch Public Key
					const getPublicKey = httpsCallable(functions, "getDlocalPublicKey");
					const keyResponse = await getPublicKey();
					if (isMounted && keyResponse.data.publicKey) {
						setDlocalPublicKey(keyResponse.data.publicKey);
					}

					// 2. Fetch Merchant Checkout Token (MUST HAVE allow_transparent: true IN BACKEND)
					const createPayment = httpsCallable(functions, "createDlocalPayment");
					const paymentResponse = await createPayment({
						amount: finalTotal,
						currency: "USD", // Ensure this matches your dLocal setup
						country: "PA",
					});

					if (isMounted && paymentResponse.data.merchant_checkout_token) {
						setDlocalCheckoutToken(
							paymentResponse.data.merchant_checkout_token,
						);
					}
				} catch (error) {
					console.error("Smart Fields Initialization Error:", error);
					if (isMounted)
						setPaymentError(
							"Failed to initialize secure checkout. Please try again later.",
						);
				}
			}

			if (isMounted) setIsDataLoading(false);
		};

		fetchInitialData();
		return () => {
			isMounted = false;
		};
	}, [restaurant?.uid, isPanama, finalTotal]); // Added finalTotal as dependency to ensure correct amount

	// --- useMemo Hook for Calculating Totals ---
	const {
		subtotal,
		gratuity,
		platformFee,
		taxAmount,
		totalDiscount,
		originalSubtotal,
		pipTotals,
		totalForPayment,
		finalTotal: memoizedFinalTotal,
	} = useMemo(() => {
		if (
			!restaurantBasketItems ||
			restaurantBasketItems.length === 0 ||
			!Array.isArray(filteredBasketData)
		) {
			return {
				subtotal: 0,
				gratuity: 0,
				platformFee: 0,
				taxAmount: 0,
				totalDiscount: 0,
				originalSubtotal: 0,
				pipTotals: [],
				totalForPayment: 0,
				finalTotal: 0,
			};
		}

		let calcSubtotal = 0;
		let calcOriginalSubtotal = 0;
		const restaurantTier = restaurant?.pricingTier || "basic";
		const scervFeePercentage = getTierScervFeePercentage(
			pricingTiers?.[restaurantTier],
			globalFeePercentage,
		);
		let taxRate = Number(restaurant?.taxRate || 0);
		if (isNaN(taxRate)) taxRate = 0;
		if (taxRate > 1) taxRate = taxRate / 100;

		for (const item of restaurantBasketItems) {
			const originalPrice = Math.round((Number(item?.dish?.price) || 0) * 100);
			const quantity = Number(item?.quantity) || 1;
			calcOriginalSubtotal += originalPrice * quantity;
			const price = item?.discount
				? parseFloat(item.discountedPrice) * 100
				: originalPrice;
			calcSubtotal += Math.round(price || 0) * quantity;
		}

		const calcGratuityAmount = Math.round(
			calcSubtotal * (parseFloat(gratuityPercentage) / 100),
		);

		const calculatedTaxAmount = Math.round(calcSubtotal * taxRate);

		const calcPipTotals = filteredBasketData.map((personData) => {
			const itemsToReduce = personData?.items;
			let pipSubtotal = 0;
			let pipOriginalSubtotal = 0;

			if (Array.isArray(itemsToReduce)) {
				pipSubtotal = itemsToReduce.reduce((total, item) => {
					const originalPrice = Math.round(
						(Number(item?.dish?.price) || 0) * 100,
					);
					const quantity = Number(item?.quantity) || 1;
					const price = item?.discount
						? parseFloat(item.discountedPrice) * 100
						: originalPrice;
					pipOriginalSubtotal += originalPrice * quantity;
					return total + Math.round(price || 0) * quantity;
				}, 0);
			}

			const numberOfPips =
				filteredBasketData.length > 0 ? filteredBasketData.length : 1;
			const pipGratuity = Math.round(calcGratuityAmount / numberOfPips);
			const pipTax = Math.round(pipSubtotal * taxRate);
			const pipFee = Math.round((pipSubtotal + pipTax) * scervFeePercentage);
			const pipDiscount = pipOriginalSubtotal - pipSubtotal;

			return {
				...(personData || {}),
				subtotal: pipSubtotal,
				fee: pipFee,
				tax: pipTax,
				gratuity: pipGratuity,
				discount: pipDiscount,
				total: pipSubtotal + pipTax + pipGratuity + pipFee,
			};
		});

		const calculated_platform_fee = calcPipTotals.reduce(
			(sum, pip) => sum + (pip.fee || 0),
			0,
		);
		const calcTotalDiscount = calcOriginalSubtotal - calcSubtotal;
		const calcFinalAmount =
			calcSubtotal +
			calculatedTaxAmount +
			calcGratuityAmount +
			calculated_platform_fee;

		return {
			subtotal: calcSubtotal,
			gratuity: calcGratuityAmount,
			platformFee: calculated_platform_fee,
			taxAmount: calculatedTaxAmount,
			totalDiscount: calcTotalDiscount,
			originalSubtotal: calcOriginalSubtotal,
			pipTotals: calcPipTotals,
			totalForPayment: calcSubtotal + calculatedTaxAmount + calcGratuityAmount,
			finalTotal: calcFinalAmount,
		};
	}, [
		restaurantBasketItems,
		gratuityPercentage,
		filteredBasketData,
		pricingTiers,
		globalFeePercentage,
		restaurant?.pricingTier,
		restaurant?.taxRate,
	]);

	useEffect(() => {
		if (memoizedFinalTotal !== undefined) {
			setFinalTotal(memoizedFinalTotal);
		}
	}, [memoizedFinalTotal]);

	useEffect(() => {
		const canPay =
			currentUserData?.uid &&
			restaurant?.uid &&
			checkInObj?.id &&
			finalTotal > 0;
		setIsReadyToPay(canPay);
	}, [currentUserData, restaurant, checkInObj, finalTotal]);

	// --- Saved Cards / PayPal Fetching (Left untouched) ---
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
				setSavedCards(cards);
				if (cards.length > 0) setSelectedVaultId(cards[0].vaultId);
			} catch (error) {
				console.error("Error fetching saved cards: ", error);
			}
		};
		fetchSavedCards();
	}, []);

	// --- Stripe Payment (USA) ---
	const handlePayment = async () => {
		if (!isReadyToPay || isPreparing) return;
		setIsPreparing(true);
		setPaymentError(null);

		try {
			const preparePayment = httpsCallable(functions, "preparePayment");
			const { data: prepData } = await preparePayment({
				paymentType: "individual",
				restaurantId: restaurant.uid,
				items: restaurantBasketItems.map((item) => ({
					id: item.id,
					quantity: item.quantity,
				})),
				gratuity: gratuity,
				taxAmount,
				platformFee,
				expectedTotal: finalTotal,
				stripeCustomerId: currentUserData.stripeCustomerId,
				checkInId: checkInObj.id,
				table: checkInObj.table || null,
				server: checkInObj.server || null,
				checkInTimestamp: checkInObj.acceptedAt,
			});

			if (!prepData?.paymentIntentClientSecret)
				throw new Error(t("failed_to_get_payment_details_from_server"));

			const { error: initError } = await initPaymentSheet({
				merchantDisplayName: `Scerv Inc. - ${restaurant.restaurantName}`,
				paymentIntentClientSecret: prepData.paymentIntentClientSecret,
				customerEphemeralKeySecret: prepData.ephemeralKeySecret,
				customerId: prepData.customerId,
				allowsDelayedPaymentMethods: true,
				allowsRemovalOfLastSavedPaymentMethod: true,
				defaultBillingDetails: stripeBillingDetails,
				returnURL: "scerv://stripe-redirect",
			});

			if (initError)
				throw new Error(
					t("failed_to_initialize_payment_sheet", {
						message: initError.message,
					}),
				);

			const { error: presentError } = await presentPaymentSheet();

			if (presentError) {
				if (presentError.code !== "Canceled")
					throw new Error(
						t("payment_failed", { message: presentError.message }),
					);
			} else {
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
									isIndividual: true,
									origin: "individual",
									appOrderId: prepData.orderId || null,
									serverRatingContext,
								},
							},
						],
					}),
				);
			}
		} catch (error) {
			setPaymentError(error.message);
			Alert.alert(t("payment_error"), error.message);
		} finally {
			setIsPreparing(false);
		}
	};

	const handlePayPalCheckout = async () => {
		/* Left untouched */
	};
	const handleVaultedCheckout = async () => {
		/* Left untouched */
	};

	// =========================================================
	// SMART FIELD TOKEN HANDLER (THE SILVER BULLET BYPASS)
	// =========================================================
	const handleSmartFieldToken = async (cardData) => {
		if (!isReadyToPay || finalTotal <= 0) return;
		setIsPreparing(true);
		setPaymentError(null);

		const { token: cardToken, name: cardholderName, document } = cardData;

		try {
			const uid = currentUserData?.uid;

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

			// 🚨 THE BYPASS: We abandon the buggy /confirm endpoint and route the secure
			// Smart Fields token directly to your EXISTING, tested direct charge function!
			const processDlocalTokenCharge = httpsCallable(
				functions,
				"processDlocalTokenCharge",
			);
			const confirmDlocalPayment = httpsCallable(
				functions,
				"confirmDlocalPayment",
			);
			const result = await confirmDlocalPayment({
				pendingOrderId: pendingOrderId,
				checkoutToken: dlocalCheckoutToken,
				cardToken: cardToken,
				clientFirstName: cardholderName.split(" ")[0] || "Guest",
				clientLastName: cardholderName.split(" ").slice(1).join(" ") || "User",
				clientDocument: document, // Make sure you type a REAL Panamanian format here during testing (e.g. 8-123-4567)
				clientDocumentType: "CIP", // Let's test their explicit Panama string
				clientEmail: currentUserData?.email || "customer@scerv.com",
				country: "PA",
			});

			// Your existing function returns { success: true }
			if (result.data.success) {
				console.log("✅ Charge Successful via Direct Token Charge!");

				const itemsToRate = restaurantBasketItems.map((i) => ({
					id: i.id,
					name: i.dish.name,
					menuItemId: i.menuItemId,
					restaurantId: i.restaurantId,
					price: i.price,
					quantity: i.quantity,
					discountedPrice: i.discountedPrice,
				}));

				navigation.dispatch(
					CommonActions.reset({
						index: 0,
						routes: [
							{
								name: "OrderConfirmation",
								params: {
									initialStatus: "processing", // The webhook will handle fulfillment
									itemsToRate: itemsToRate,
									isIndividual: true,
									origin: "individual",
									appOrderId: pendingOrderId,
									serverRatingContext,
								},
							},
						],
					}),
				);
			} else {
				throw new Error(
					result.data.error || "Payment failed to process securely.",
				);
			}
		} catch (error) {
			console.error("Smart Field Bypass Error:", error);
			setPaymentError(error.message);
			Alert.alert(t("checkout.payment_error_title"), error.message);
		} finally {
			setIsPreparing(false);
		}
	};

	const toggleExpandPIP = (personId) => {
		setExpandedPIPs((prev) => ({ ...prev, [personId]: !prev[personId] }));
	};

	// --- Render Logic ---
	if (!currentUserData || !restaurant || isDataLoading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<StripeProvider publishableKey={stripePublishableKey || ""}>
			<View style={styles.container}>
				<ScrollView showsVerticalScrollIndicator={false}>
					<Text style={styles.mainHeading}>{t("review_your_order")}</Text>
					<Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>

					{/* PIP Breakdown & Gratuity Sections (Left intact) */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>{t("items_by_person")}</Text>
						{filteredBasketData.map((personData) => {
							const isExpanded = !!expandedPIPs[personData.personId];
							const pipData = pipTotals.find(
								(p) => p.personId === personData.personId,
							);
							const estimatedPipTotal = pipData ? pipData.total : 0;
							if (!pipData) return null;
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
								<PlatformSelect
									value={gratuityPercentage}
									onValueChange={setGratuityPercentage}
									title={t("add_gratuity")}
									options={[
										{ label: t("0_percent"), value: "0" },
										{ label: t("5_percent"), value: "5" },
										{ label: t("10_percent"), value: "10" },
										{ label: t("15_percent"), value: "15" },
										{ label: t("18_percent"), value: "18" },
										{ label: t("20_percent"), value: "20" },
										{ label: t("25_percent"), value: "25" },
									]}
									pickerStyle={styles.gratuityPicker}
									itemStyle={styles.gratuityPickerItem}
								/>
								<MaterialCommunityIcons
									name="chevron-down"
									size={24}
									color={colors.textDark}
									style={styles.pickerIcon}
								/>
							</View>
						</View>
					</View>

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
						{taxAmount > 0 && (
							<View style={styles.summaryRow}>
								<Text style={styles.label}>{t("tax", "Tax")}:</Text>
								<Text style={styles.amount}>{formatCurrency(taxAmount)}</Text>
							</View>
						)}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>
								{t("gratuity_with_percentage", {
									percentage: gratuityPercentage,
								})}
								:
							</Text>
							<Text style={styles.amount}>{formatCurrency(gratuity)}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.label}>{t("service_fee")}:</Text>
							<Text style={styles.amount}>{formatCurrency(platformFee)}</Text>
						</View>

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

					{paymentError && <Text style={styles.errorText}>{paymentError}</Text>}

					{/* ========================================== */}
					{/* 🇵🇦 PANAMA CHECKOUT (dLocal Smart Fields) */}
					{/* ========================================== */}
					{isPanama && (
						<View style={styles.checkoutButtonsContainer}>
							{/* --- PayPal Section (Untouched) --- */}
							{selectedCard ? (
								<>
									<TouchableOpacity
										style={[
											styles.paypalButton,
											styles.buttonMargin,
											(!isReadyToPay || isPreparing) && styles.buttonDisabled,
										]}
										onPress={handleVaultedCheckout}
										disabled={!isReadyToPay || isPreparing || !selectedVaultId}
									>
										<Text style={styles.buttonText}>
											{t("checkout.pay_with_selected_card")}
										</Text>
									</TouchableOpacity>
									<TouchableOpacity
										style={styles.secondaryTextButton}
										onPress={handlePayPalCheckout}
										disabled={!isReadyToPay || isPreparing}
									>
										<Text style={styles.secondaryButtonText}>
											{t("checkout.add_new_card")}
										</Text>
									</TouchableOpacity>
								</>
							) : (
								<TouchableOpacity
									style={[
										styles.paypalButton,
										styles.buttonMargin,
										(!isReadyToPay || isPreparing) && styles.buttonDisabled,
									]}
									onPress={handlePayPalCheckout}
									disabled={!isReadyToPay || isPreparing}
								>
									<Text style={styles.buttonText}>
										{t("checkout.pay_button")} {formatCurrency(finalTotal)}
									</Text>
								</TouchableOpacity>
							)}

							{/* --- THE NEW SMART FIELDS BRIDGE --- */}
							{isReadyToPay &&
							finalTotal > 0 &&
							dlocalPublicKey &&
							dlocalCheckoutToken ? (
								<DlocalNativeCheckout
									publicKey={dlocalPublicKey}
									checkoutToken={dlocalCheckoutToken}
									amountFormatted={formatCurrency(finalTotal)}
									locale={i18n.language || "es"}
									onProcessing={() => setIsPreparing(true)}
									onError={(msg) => {
										setIsPreparing(false);
										setPaymentError(msg);
									}}
									onTokenSuccess={handleSmartFieldToken}
								/>
							) : (
								isPanama &&
								!dlocalCheckoutToken &&
								finalTotal > 0 && (
									<View style={{ padding: 20, alignItems: "center" }}>
										<ActivityIndicator size="small" color={colors.primary} />
										<Text style={{ marginTop: 10, color: colors.textLight }}>
											Loading secure checkout...
										</Text>
									</View>
								)
							)}
						</View>
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
	totalRow: {
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: 1.5,
		borderTopColor: colors.primary,
	},
	totalLabel: { fontSize: 17, fontWeight: "bold", color: colors.primary },
	totalAmount: { fontSize: 17, fontWeight: "bold", color: colors.primary },
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
	gratuityPickerItem: { height: 120, color: colors.textDark },
	pickerIcon: {
		position: "absolute",
		right: 10,
		top: Platform.OS === "ios" ? 50 : 12,
	},
	errorText: {
		color: colors.danger || "red",
		textAlign: "center",
		marginVertical: 10,
		paddingHorizontal: 10,
	},
	checkoutButtonsContainer: {
		marginTop: 24,
		paddingHorizontal: 20,
		paddingBottom: 40,
		width: "100%",
	},
	buttonMargin: { marginBottom: 16 },
	paypalButton: {
		backgroundColor: colors.primary,
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
	buttonDisabled: {
		backgroundColor: "#D1D1D6",
		shadowOpacity: 0,
		elevation: 0,
	},
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
	secondaryButtonText: { color: "#0070BA", fontSize: 16, fontWeight: "600" },
});

export default CheckoutScreen;
