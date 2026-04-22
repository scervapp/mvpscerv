import React, { useState, useEffect, useContext, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	ScrollView,
	TouchableOpacity,
	Alert,
	ActivityIndicator,
	Platform,
	Modal,
	KeyboardAvoidingView,
	TextInput,
} from "react-native";
import {
	useRoute,
	useNavigation,
	CommonActions,
} from "@react-navigation/native";
import { Button, Divider } from "react-native-paper";
import { StripeProvider, useStripe } from "@stripe/stripe-react-native";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import formatCurrency from "../../utils/currencyFormatter";
import { httpsCallable } from "@react-native-firebase/functions";
import { useCheckInStatus } from "../../utils/customerUtils";
import firestore from "@react-native-firebase/firestore";
import DlocalNativeCheckout from "./DlocalNativeCheckout.js";

const DRINK_CATEGORIES = [
	"Beer",
	"Wine",
	"Cocktails",
	"Spirits",
	"Sodas",
	"Drinks",
	"Juices",
	"Non-Alcoholic Drinks",
	"Alcoholic Drinks",
	"Beverages",
];

const PartyCheckoutScreen = () => {
	const { t, i18n } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const { partyDetails, sharedBaskets } = useParty();
	const { initPaymentSheet, presentPaymentSheet } = useStripe();
	const navigation = useNavigation();
	const route = useRoute();

	const { partyId } = route.params;

	const sharedBasketItems = sharedBaskets[partyId]?.items || [];
	const party = partyDetails[partyId] || {};

	const isPickupMode = party?.orderMode === "pickup";
	const fulfillmentType =
		party?.fulfillmentType || (isPickupMode ? "hotel_pickup" : "table");

	const { checkInObj } = useCheckInStatus(
		party?.restaurantId,
		currentUserData?.uid,
	);

	const [isPreparing, setIsPreparing] = useState(false);
	const [paymentError, setPaymentError] = useState(null);
	const [stripePublishableKey, setStripePublishableKey] = useState(null);

	const [pricingTiers, setPricingTiers] = useState(null);
	const [gratuityPercentage, setGratuityPercentage] = useState("18");

	const [dlocalPublicKey, setDlocalPublicKey] = useState(null);
	const [dlocalCheckoutToken, setDlocalCheckoutToken] = useState(null);
	const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
	const [isLiveMode, setIsLiveMode] = useState(null);

	const [savedName, setSavedName] = useState("");
	const [savedDocument, setSavedDocument] = useState("");
	const [savedEmail, setSavedEmail] = useState("");
	const [restaurantData, setRestaurantData] = useState(null);

	const canAcceptPayments = restaurantData?.canAcceptPayments !== false;

	const [pickupSpecialInstructions, setPickupSpecialInstructions] =
		useState("");
	const [isEditingPickupInstructions, setIsEditingPickupInstructions] =
		useState(false);

	const country = party?.restaurantCountryCode || "PA";
	const isPanama =
		country === "PA" || country === "Panama" || country === "panama";

	const confirmDlocalPayment = httpsCallable(functions, "confirmDlocalPayment");

	const {
		myItemsInBasket,
		mySubtotal,
		myOriginalSubtotal,
		myTax,
		myGratuity,
		myPlatformFee,
		myFinalTotal,
		myTotalDiscount,
	} = useMemo(() => {
		if (!sharedBasketItems || !currentUserData || !currentUserData.uid) {
			return {
				myItemsInBasket: [],
				mySubtotal: 0,
				myOriginalSubtotal: 0,
				myTax: 0,
				myGratuity: 0,
				myPlatformFee: 0,
				myFinalTotal: 0,
				myTotalDiscount: 0,
			};
		}

		const items = sharedBasketItems.filter(
			(item) => item.orderedByUserId === currentUserData.uid,
		);

		if (items.length === 0) {
			return {
				myItemsInBasket: [],
				mySubtotal: 0,
				myOriginalSubtotal: 0,
				myTax: 0,
				myGratuity: 0,
				myPlatformFee: 0,
				myFinalTotal: 0,
				myTotalDiscount: 0,
			};
		}

		let originalSubtotalInCents = 0;
		let discountedSubtotalInCents = 0;
		let taxInCents = 0;

		items.forEach((item) => {
			const priceInCents = Math.round((item.price || 0) * 100);
			const quantity = item.quantity || 1;
			originalSubtotalInCents += priceInCents * quantity;

			const finalPriceInCents =
				item.discountedPrice !== null && item.discountedPrice !== undefined
					? Math.round(item.discountedPrice * 100)
					: priceInCents;

			discountedSubtotalInCents += finalPriceInCents * quantity;

			const effectiveUnitPriceInCents =
				item.discountedPrice !== null && item.discountedPrice !== undefined
					? Math.round(item.discountedPrice * 100)
					: Math.round((item.price || 0) * 100);

			const rawTaxRate =
				item.itbmsRate !== undefined && item.itbmsRate !== null
					? Number(item.itbmsRate)
					: item.taxRate !== undefined && item.taxRate !== null
						? Number(item.taxRate)
						: 0;

			if (!isNaN(rawTaxRate) && rawTaxRate > 0) {
				taxInCents += Math.round(
					effectiveUnitPriceInCents * quantity * (rawTaxRate / 100),
				);
			}
		});

		const gratuityInCents = canAcceptPayments
			? Math.round(
					discountedSubtotalInCents * (parseFloat(gratuityPercentage) / 100),
				)
			: 0;

		const restaurantTier =
			restaurantData && restaurantData.pricingTier
				? restaurantData.pricingTier
				: "basic";

		let rawPayout =
			pricingTiers &&
			pricingTiers[restaurantTier] &&
			pricingTiers[restaurantTier].payoutPercentage !== undefined &&
			pricingTiers[restaurantTier].payoutPercentage !== null
				? pricingTiers[restaurantTier].payoutPercentage
				: 0.97;

		let payoutVal = Number(rawPayout);
		if (isNaN(payoutVal)) payoutVal = 0.97;
		if (payoutVal > 1) payoutVal = payoutVal / 100;

		const calculatedPlatformFeePercentage = canAcceptPayments
			? Math.max(0, Math.round((1 - payoutVal) * 10000) / 10000)
			: 0;

		const platformFeeInCents = Math.round(
			discountedSubtotalInCents * calculatedPlatformFeePercentage,
		);

		const finalTotalInCents =
			discountedSubtotalInCents +
			taxInCents +
			gratuityInCents +
			platformFeeInCents;

		const totalDiscountInCents =
			originalSubtotalInCents - discountedSubtotalInCents;

		console.log(
			"[CHECKOUT TAX ITEMS]",
			items.map((item) => ({
				name: item.dishName || item.name,
				category: item.category,
				price: item.price,
				quantity: item.quantity,
				itbmsRate: item.itbmsRate,
				taxRate: item.taxRate,
			})),
		);

		return {
			myItemsInBasket: items.map((item) => ({
				id: item.id || "",
				name: item.dishName || item.name || "Item",
				menuItemId: item.menuItemId || "",
				restaurantId: item.restaurantId || "",

				// final unit price
				price: item.price || 0,

				// original item price before modifiers
				basePrice:
					item.basePrice !== undefined && item.basePrice !== null
						? item.basePrice
						: item.price || 0,

				// per-unit modifier total
				modifiersTotal:
					item.modifiersTotal !== undefined && item.modifiersTotal !== null
						? item.modifiersTotal
						: 0,

				// structured selected modifiers
				selectedModifiers: Array.isArray(item.selectedModifiers)
					? item.selectedModifiers
					: [],

				quantity: item.quantity || 1,
				discountedPrice:
					item.discountedPrice !== undefined && item.discountedPrice !== null
						? item.discountedPrice
						: null,
				category: item.category || "",
				specialInstructions: item.specialInstructions || "",
				itbmsRate:
					item.itbmsRate !== undefined && item.itbmsRate !== null
						? item.itbmsRate
						: item.taxRate !== undefined && item.taxRate !== null
							? item.taxRate
							: 0,
			})),
			myOriginalSubtotal: originalSubtotalInCents,
			mySubtotal: discountedSubtotalInCents,
			myTax: taxInCents,
			myGratuity: gratuityInCents,
			myPlatformFee: platformFeeInCents,
			myFinalTotal: finalTotalInCents,
			myTotalDiscount: totalDiscountInCents,
		};
	}, [
		sharedBasketItems,
		currentUserData && currentUserData.uid,
		gratuityPercentage,
		pricingTiers,
		restaurantData && restaurantData.pricingTier,
		canAcceptPayments,
	]);

	const resolvedRestaurantId =
		party?.restaurantId || myItemsInBasket[0]?.restaurantId || null;

	const isReadyToPay =
		myFinalTotal > 0 &&
		currentUserData?.uid &&
		(isPickupMode || (party?.id && party?.checkInId));

	useEffect(() => {
		if (!resolvedRestaurantId) return;

		const unsubscribe = db
			.collection("restaurants")
			.doc(resolvedRestaurantId)
			.onSnapshot((doc) => {
				if (doc.exists) setRestaurantData(doc.data());
			});

		return () => unsubscribe();
	}, [resolvedRestaurantId]);

	useEffect(() => {
		if (!currentUserData?.uid) return;

		const fetchSavedDetails = async () => {
			try {
				const userDoc = await db
					.collection("customers")
					.doc(currentUserData.uid)
					.get();

				if (userDoc.exists) {
					const data = userDoc.data();
					if (data.dlocalName) setSavedName(data.dlocalName);
					if (data.dlocalDocument) setSavedDocument(data.dlocalDocument);
					if (data.email) {
						setSavedEmail(data.email);
					} else if (currentUserData?.email) {
						setSavedEmail(currentUserData.email);
					}
				} else if (currentUserData?.email) {
					setSavedEmail(currentUserData.email);
				}
			} catch (error) {
				console.error("Error fetching user details:", error);
				if (currentUserData?.email) {
					setSavedEmail(currentUserData.email);
				}
			}
		};

		fetchSavedDetails();
	}, [currentUserData?.uid, currentUserData?.email]);

	useEffect(() => {
		let isMounted = true;

		const fetchInitialData = async () => {
			if (!resolvedRestaurantId) return;

			const tiersSnap = await db
				.collection("appConfig")
				.doc("pricingTiers")
				.get();

			if (tiersSnap.exists && isMounted) {
				const data = tiersSnap.data();
				setPricingTiers(data.pricingTiers || data);
			}

			if (!canAcceptPayments) return;

			if (!isPanama) {
				try {
					const getStripePublishableKeyFunction = httpsCallable(
						functions,
						"getStripePublishableKey",
					);

					const { data } = await getStripePublishableKeyFunction({
						restaurantId: resolvedRestaurantId,
					});

					if (isMounted && data.stripePublishableKey) {
						setStripePublishableKey(data.stripePublishableKey);
					}
				} catch (error) {
					if (isMounted) {
						setPaymentError(
							t(
								"could_not_load_payment_configuration_for_this_restaurant",
								"Could not load payment configuration for this restaurant.",
							),
						);
					}
				}
			}

			if (isPanama && myFinalTotal > 0 && isMounted) {
				try {
					const getPublicKey = httpsCallable(functions, "getDlocalPublicKey");
					const keyResponse = await getPublicKey({
						restaurantId: resolvedRestaurantId,
					});

					if (isMounted) {
						setIsLiveMode(keyResponse.data.isLive);
						if (keyResponse.data.publicKey) {
							setDlocalPublicKey(keyResponse.data.publicKey);
						}
					}

					const createPayment = httpsCallable(functions, "createDlocalPayment");
					const paymentResponse = await createPayment({
						amount: myFinalTotal,
						currency: "USD",
						country: "PA",
						restaurantId: resolvedRestaurantId,
					});

					if (isMounted && paymentResponse.data.merchant_checkout_token) {
						setDlocalCheckoutToken(
							paymentResponse.data.merchant_checkout_token,
						);
					}
				} catch (error) {
					console.error("Smart Fields Initialization Error:", error);
					if (isMounted) {
						setPaymentError(
							"Failed to initialize secure checkout. Please try again later.",
						);
					}
				}
			}
		};

		fetchInitialData();

		return () => {
			isMounted = false;
		};
	}, [resolvedRestaurantId, myFinalTotal, isPanama, canAcceptPayments, t]);

	useEffect(() => {
		// 🚨 HARD STOP for pickup — NEVER go to confirmation
		if (isPickupMode) return;

		if (party?.status === "completed") {
			navigation.dispatch(
				CommonActions.reset({
					index: 0,
					routes: [
						{
							name: "OrderConfirmation",
							params: {
								initialStatus: "completed",
								itemsToRate: myItemsInBasket,
								isIndividual: false,
								origin: "party",
								appOrderId: party.id,
							},
						},
					],
				}),
			);
		}
	}, [party?.status, navigation, myItemsInBasket, party?.id, isPickupMode]);

	const handleSmartFieldToken = async (cardData) => {
		if (!isReadyToPay || myFinalTotal <= 0) return;

		setIsPreparing(true);
		setPaymentError(null);

		const {
			token: cardToken,
			name: cardholderName,
			document,
			email,
			saveDetails,
		} = cardData;

		try {
			const uid = currentUserData?.uid;
			const safeRestId = resolvedRestaurantId;

			if (!safeRestId) {
				throw new Error("Restaurant information is missing.");
			}

			const normalizedEmail =
				typeof email === "string" && email.trim()
					? email.trim().toLowerCase()
					: savedEmail || currentUserData?.email || "customer@scerv.com";

			// ✅ Real customer identity name (for orders, pickup, QR, reports)
			const resolvedProfileName =
				`${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`.trim() ||
				currentUserData?.fullName ||
				currentUserData?.name ||
				"Guest";

			// ✅ Billing/cardholder name stays separate
			const resolvedCardholderName =
				typeof cardholderName === "string" && cardholderName.trim()
					? cardholderName.trim()
					: savedName || resolvedProfileName;

			if (saveDetails && uid) {
				await db.collection("customers").doc(uid).set(
					{
						dlocalName: resolvedCardholderName,
						dlocalDocument: document,
						email: normalizedEmail,
					},
					{ merge: true },
				);
			}

			const cleanDocument = document
				? document.replace(/\s+/g, "")
				: "8-888-8888";

			const formattedItems = myItemsInBasket.map((item) => ({
				...item,
				status: "new",
				destination: DRINK_CATEGORIES.includes(item.category || "")
					? "bar"
					: "kitchen",
			}));

			const pendingOrderData = {
				restaurantId: safeRestId,
				customerId: uid || "anonymous",
				customerEmail: normalizedEmail,

				// ✅ Use real profile/customer identity for the order
				customerName: resolvedProfileName,

				// ✅ Keep billing/cardholder separately for audit/payment context
				cardholderName: resolvedCardholderName,

				subtotal: mySubtotal || 0,
				tax: myTax || 0,
				gratuity: myGratuity || 0,
				platformFee: myPlatformFee || 0,
				totalPrice: myFinalTotal || 0,
				items: formattedItems,
				table: isPickupMode ? { name: "Pickup Window" } : party?.table || null,
				server: isPickupMode ? { name: "Pickup Queue" } : party?.server || null,
				checkInId: isPickupMode ? null : party?.checkInId || null,
				checkInTimestamp:
					checkInObj?.createdAt || firestore.FieldValue.serverTimestamp(),
				status: "pending",
				type: isPickupMode ? "pickup" : "party",
				partyId: partyId || "",
				orderMode: isPickupMode ? "pickup" : "dineIn",
				fulfillmentType,

				// keep this if you’ve added pickup-level notes
				pickupSpecialInstructions: isPickupMode
					? pickupSpecialInstructions?.trim?.() || ""
					: "",

				createdAt: firestore.FieldValue.serverTimestamp(),
			};

			const pendingOrderRef = await firestore()
				.collection("pending_orders")
				.add(pendingOrderData);

			const pendingOrderId = pendingOrderRef.id;

			const result = await confirmDlocalPayment({
				pendingOrderId,
				checkoutToken: dlocalCheckoutToken,
				cardToken,
				clientFirstName: resolvedCardholderName.split(" ")[0] || "Guest",
				clientLastName:
					resolvedCardholderName.split(" ").slice(1).join(" ") || "User",
				clientDocument: cleanDocument,
				clientDocumentType: "CIP",
				clientEmail: normalizedEmail,
				country: "PA",
				restaurantId: safeRestId,
			});

			const isSuccessful =
				result.data?.success === true ||
				result.data?.data?.success === true ||
				result.data?.status === "SUCCESS";

			if (!isSuccessful) {
				const backendError =
					result.data?.error ||
					result.data?.message ||
					result.data?.data?.message ||
					"Payment rejected by the gateway.";
				throw new Error(backendError);
			}

			// ✅ persist active pickup order so status screen can recover it
			if (isPickupMode && uid) {
				await db.collection("customers").doc(uid).set(
					{
						activePickupOrderId: pendingOrderId,
					},
					{ merge: true },
				);
			}

			if (isPickupMode) {
				navigation.dispatch(
					CommonActions.reset({
						index: 0,
						routes: [
							{
								name: "PickupOrderStatus",
								params: {
									orderId: pendingOrderId,
									partyId,
								},
							},
						],
					}),
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
									itemsToRate: myItemsInBasket,
									isIndividual: false,
									origin: "party",
									appOrderId: pendingOrderId,
								},
							},
						],
					}),
				);
			}
		} catch (error) {
			console.error("Smart Field Payment Error:", error);
			setPaymentError(error.message);
			Alert.alert("Payment Error", error.message);
		} finally {
			setIsPreparing(false);
		}
	};

	const handleManualCheckout = async () => {
		setIsPreparing(true);

		try {
			if (isPickupMode) {
				await db.collection("parties").doc(partyId).update({
					customerStatus: "ready_to_pay",
					checkoutRequestedAt: firestore.FieldValue.serverTimestamp(),
					fulfillmentType,
					pickupSpecialInstructions: pickupSpecialInstructions.trim(),
				});

				Alert.alert(
					t("pickup_order_ready_for_payment", "Pickup Order Ready"),
					t(
						"pickup_order_marked_ready_for_payment",
						"Your pickup order has been marked ready for payment handling.",
					),
				);
			} else {
				await db
					.collection("parties")
					.doc(partyId)
					.update({
						customerStatus: "ready_to_pay",
						checkoutRequestedAt: firestore.FieldValue.serverTimestamp(),
						serviceRequested: true,
						serviceRequestedAt: new Date().toISOString(),
						serviceTableName: party?.table?.name || "A table",
					});

				Alert.alert(
					t("check_requested", "Check Requested"),
					t(
						"server_notified_message",
						"Your server has been notified and will bring the bill to your table shortly.",
					),
				);
			}
		} catch (error) {
			Alert.alert(
				t("error", "Error"),
				t("could_not_request_checkout", "Could not request checkout."),
			);
		} finally {
			setIsPreparing(false);
		}
	};

	const handlePayment = async () => {
		if (!isReadyToPay || isPreparing) return;

		setIsPreparing(true);
		setPaymentError(null);

		try {
			const preparePayment = httpsCallable(functions, "preparePayment");

			const { data: prepData } = await preparePayment({
				paymentType: isPickupMode ? "pickup" : "party",
				restaurantId: party.restaurantId,
				partyId: party.id,
				items: myItemsInBasket.map((item) => ({ id: item.id })),
				gratuity: myGratuity,
				platformFee: myPlatformFee,
				checkInId: isPickupMode ? null : party.checkInId,
				table: isPickupMode ? null : party.table || null,
				server: isPickupMode ? null : party.server || null,
				checkInTimestamp: null,
				orderMode: isPickupMode ? "pickup" : "dineIn",
				fulfillmentType,
			});

			if (!prepData?.paymentIntentClientSecret) {
				throw new Error(
					t(
						"failed_to_get_payment_details_from_server",
						"Failed to get payment details from server.",
					),
				);
			}

			const { error: initError } = await initPaymentSheet({
				merchantDisplayName: `Scerv Inc. - ${party.restaurantName || "Restaurant"}`,
				paymentIntentClientSecret: prepData.paymentIntentClientSecret,
				customerEphemeralKeySecret: prepData.ephemeralKeySecret,
				customerId: prepData.customerId,
				allowsDelayedPaymentMethods: true,
				returnURL: "scerv://stripe-redirect",
			});

			if (initError) {
				throw new Error(
					`${t("failed_to_initialize_payment_sheet", "Failed to initialize payment sheet")}: ${initError.message}`,
				);
			}

			const { error: presentError } = await presentPaymentSheet();

			if (presentError) {
				if (presentError.code !== "Canceled") {
					throw new Error(
						`${t("payment_failed", "Payment failed")}: ${presentError.message}`,
					);
				}
				return;
			}

			navigation.dispatch(
				CommonActions.reset({
					index: 0,
					routes: [
						{
							name: "OrderConfirmation",
							params: {
								initialStatus: "processing",
								itemsToRate: myItemsInBasket,
								basketId: party.id,
								origin: isPickupMode ? "pickup" : "party",
								isIndividual: false,
							},
						},
					],
				}),
			);
		} catch (error) {
			console.error("Party payment process failed:", error);
			setPaymentError(error.message);
			Alert.alert(t("payment_error", "Payment Error"), error.message);
		} finally {
			setIsPreparing(false);
		}
	};

	const primaryTitle = isPickupMode
		? t("complete_your_pickup_order", "Complete Your Pickup Order")
		: t("checkout_your_portion", "Checkout Your Portion");

	const secondaryTitle = party?.restaurantName || "";

	const manualButtonLabel = canAcceptPayments
		? isPickupMode
			? "" // ❌ no label, we won’t show this button
			: party?.customerStatus === "ready_to_pay"
				? t("server_notified", "Server Notified")
				: t("pay_cash", "Pay Cash")
		: isPickupMode
			? "" // ❌ no label
			: party?.customerStatus === "ready_to_pay"
				? t("server_notified", "Server Notified")
				: t("request_check", "Request Check");

	const cardButtonLabel =
		party?.customerStatus === "ready_to_pay"
			? t("server_notified", "Server Notified")
			: `${t("pay", "Pay")} ${formatCurrency(canAcceptPayments ? myFinalTotal : mySubtotal)}`;

	return (
		<StripeProvider publishableKey={stripePublishableKey || ""}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					style={styles.container}
					contentContainerStyle={styles.scrollContentContainer}
				>
					<View style={styles.header}>
						<Text style={styles.title}>{primaryTitle}</Text>
						{!!secondaryTitle && (
							<Text style={styles.restaurantName}>{secondaryTitle}</Text>
						)}
						{isPickupMode && (
							<Text style={styles.modePill}>
								{t("hotel_pickup", "Pickup Window")}
							</Text>
						)}
					</View>

					<View style={styles.section}>
						<Text style={styles.sectionTitle}>
							{isPickupMode
								? t("your_order", "Your Order")
								: t("your_items", "Your Items")}
						</Text>

						{myItemsInBasket.length > 0 ? (
							myItemsInBasket.map((item) => {
								const hasDiscount =
									item.discountedPrice !== null &&
									item.discountedPrice !== undefined &&
									item.discountedPrice < item.price;

								const originalTotalInCents =
									Math.round((item.price || 0) * 100) * item.quantity;

								const finalTotalInCents = hasDiscount
									? Math.round(item.discountedPrice * 100) * item.quantity
									: originalTotalInCents;

								return (
									<View key={item.id} style={styles.itemRowBlock}>
										<View style={styles.itemInfoBlock}>
											<Text style={styles.itemName}>
												{item.quantity}x {item.name}
											</Text>

											{Array.isArray(item.selectedModifiers) &&
												item.selectedModifiers.length > 0 && (
													<View style={styles.modifiersContainer}>
														{item.selectedModifiers.map((modifier, index) => (
															<Text
																key={`${modifier.optionId || modifier.name || "modifier"}-${index}`}
																style={styles.modifierText}
															>
																•{" "}
																{typeof modifier.name === "string"
																	? modifier.name
																	: modifier.name?.[
																			i18n.language?.substring(0, 2)
																		] ||
																		modifier.name?.en ||
																		modifier.name?.es ||
																		modifier.name?.original ||
																		""}
																{Number(modifier.price || 0) > 0
																	? ` (+$${Number(modifier.price).toFixed(2)})`
																	: ""}
															</Text>
														))}
													</View>
												)}
										</View>

										<View style={styles.priceContainer}>
											{hasDiscount && (
												<Text style={styles.originalPriceText}>
													{formatCurrency(originalTotalInCents)}
												</Text>
											)}
											<Text
												style={[
													styles.itemPrice,
													hasDiscount && styles.discountText,
												]}
											>
												{formatCurrency(finalTotalInCents)}
											</Text>
										</View>
									</View>
								);
							})
						) : (
							<Text style={styles.noItemsText}>
								{t(
									"you_have_no_items_in_this_order",
									"You have no items in this order.",
								)}
							</Text>
						)}
					</View>

					{isPickupMode && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>
								{t(
									"pickup_special_instructions",
									"Pickup Special Instructions",
								)}
							</Text>
							<Text style={styles.helperText}>
								{t(
									"pickup_special_instructions_help",
									"Add notes for the pickup window or for the whole order.",
								)}
							</Text>

							<TextInput
								style={styles.instructionsInput}
								value={pickupSpecialInstructions}
								onChangeText={setPickupSpecialInstructions}
								placeholder={t(
									"pickup_special_instructions_placeholder",
									"Example: Call when outside, no utensils, extra napkins, send to front desk...",
								)}
								placeholderTextColor={colors.textMedium}
								multiline
								textAlignVertical="top"
								maxLength={250}
							/>

							<Text style={styles.instructionsCounter}>
								{pickupSpecialInstructions.length}/250
							</Text>
						</View>
					)}

					{canAcceptPayments && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>
								{t("add_gratuity", "Add Gratuity")}
							</Text>
							<View style={styles.gratuityContainer}>
								<Picker
									selectedValue={gratuityPercentage}
									onValueChange={(itemValue) =>
										setGratuityPercentage(itemValue)
									}
									style={styles.gratuityPicker}
								>
									<Picker.Item label={t("10_percent", "10%")} value="10" />
									<Picker.Item label={t("12_percent", "12%")} value="12" />
									<Picker.Item label={t("15_percent", "15%")} value="15" />
									<Picker.Item
										label={t("18_percent_recommended", "18% Recommended")}
										value="18"
									/>
									<Picker.Item label={t("20_percent", "20%")} value="20" />
									<Picker.Item label={t("22_percent", "22%")} value="22" />
									<Picker.Item label={t("25_percent", "25%")} value="25" />
									<Picker.Item
										label={t("no_tip_cash", "No Tip / Cash")}
										value="0"
									/>
								</Picker>
							</View>
						</View>
					)}

					<View style={styles.section}>
						<Text style={styles.sectionTitle}>
							{t("your_bill_summary", "Your Bill Summary")}
						</Text>

						{myTotalDiscount > 0 ? (
							<>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>
										{t("items_total", "Items Total")}:
									</Text>
									<Text style={styles.amount}>
										{formatCurrency(myOriginalSubtotal)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>{t("discount", "Discount")}:</Text>
									<Text style={[styles.amount, styles.discountText]}>
										-{formatCurrency(myTotalDiscount)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={[styles.label, { fontWeight: "bold" }]}>
										{t("subtotal", "Subtotal")}:
									</Text>
									<Text style={[styles.amount, { fontWeight: "bold" }]}>
										{formatCurrency(mySubtotal)}
									</Text>
								</View>
							</>
						) : (
							<View style={styles.summaryRow}>
								<Text style={styles.label}>{t("subtotal", "Subtotal")}:</Text>
								<Text style={styles.amount}>{formatCurrency(mySubtotal)}</Text>
							</View>
						)}

						{canAcceptPayments && myTax > 0 && (
							<View style={styles.summaryRow}>
								<Text style={styles.label}>{t("tax", "Tax")}:</Text>
								<Text style={styles.amount}>{formatCurrency(myTax)}</Text>
							</View>
						)}

						{canAcceptPayments && (
							<>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>{t("gratuity", "Gratuity")}:</Text>
									<Text style={styles.amount}>
										{formatCurrency(myGratuity)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>
										{t("service_fee", "Service Fee")} (
										{restaurantData && restaurantData.pricingTier
											? restaurantData.pricingTier
											: "basic"}
										):
									</Text>
									<Text style={styles.amount}>
										{formatCurrency(myPlatformFee)}
									</Text>
								</View>
							</>
						)}

						<Divider style={styles.divider} />

						<View style={styles.summaryRow}>
							<Text style={styles.totalLabel}>
								{t("your_total", "Your Total")}:
							</Text>
							<Text style={styles.totalAmount}>
								{formatCurrency(canAcceptPayments ? myFinalTotal : mySubtotal)}
							</Text>
						</View>
					</View>

					{paymentError && <Text style={styles.errorText}>{paymentError}</Text>}
				</ScrollView>

				<View style={styles.footer}>
					{canAcceptPayments ? (
						<View style={{ flexDirection: "row", gap: 10 }}>
							{!isPickupMode && (
								<Button
									mode="outlined"
									onPress={handleManualCheckout}
									disabled={
										!isReadyToPay ||
										isPreparing ||
										(!isPickupMode && party?.customerStatus === "ready_to_pay")
									}
									loading={isPreparing}
									style={[
										styles.payButton,
										{
											flex: 1,
											backgroundColor: colors.surfaceWhite,
											borderColor: colors.primary,
											borderWidth: 1,
										},
									]}
									labelStyle={[styles.payButtonText, { color: colors.primary }]}
								>
									{manualButtonLabel}
								</Button>
							)}

							<Button
								mode="contained"
								onPress={() => {
									if (isPanama) {
										setIsPaymentModalVisible(true);
									} else {
										handlePayment();
									}
								}}
								disabled={
									!isReadyToPay ||
									isPreparing ||
									(!isPickupMode && party?.customerStatus === "ready_to_pay")
								}
								loading={isPreparing}
								style={[styles.payButton, { flex: 1 }]}
								labelStyle={styles.payButtonText}
							>
								{isPreparing
									? t("preparing", "Preparing")
									: isPickupMode
										? t("place_order_pay", "Place Order & Pay")
										: cardButtonLabel}
							</Button>
						</View>
					) : (
						<View style={{ flexDirection: "row", gap: 10 }}>
							{!isPickupMode && (
								<Button
									mode="contained"
									onPress={handleManualCheckout}
									disabled={
										!isReadyToPay ||
										isPreparing ||
										(!isPickupMode && party?.customerStatus === "ready_to_pay")
									}
									loading={isPreparing}
									style={[
										styles.payButton,
										{ flex: 1, backgroundColor: colors.statusWarning },
									]}
									labelStyle={styles.payButtonText}
								>
									{manualButtonLabel}
								</Button>
							)}

							<Button
								mode="contained"
								onPress={() => {}}
								disabled={true}
								style={[
									styles.payButton,
									{ flex: 1, backgroundColor: colors.borderLight },
								]}
								labelStyle={[
									styles.payButtonText,
									{ color: colors.textMedium },
								]}
							>
								{isPickupMode
									? t("place_order_pay", "Place Order & Pay")
									: t("pay_with_card", "Pay with Card")}
							</Button>
						</View>
					)}
				</View>

				<Modal
					visible={isPaymentModalVisible}
					transparent={true}
					animationType="slide"
					onRequestClose={() => setIsPaymentModalVisible(false)}
				>
					<KeyboardAvoidingView
						style={{ flex: 1 }}
						behavior={Platform.OS === "ios" ? "padding" : "height"}
						keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
					>
						<View style={styles.modalBackground}>
							<TouchableOpacity
								style={StyleSheet.absoluteFill}
								activeOpacity={1}
								onPress={() => setIsPaymentModalVisible(false)}
							/>

							<View style={styles.bottomSheet}>
								<ScrollView
									contentContainerStyle={styles.bottomSheetScrollContent}
									keyboardShouldPersistTaps="handled"
									showsVerticalScrollIndicator={false}
								>
									<View style={styles.sheetHeader}>
										<Text style={styles.sheetTitle}>
											{t("payment_details", "Payment Details")}
										</Text>
										<TouchableOpacity
											onPress={() => setIsPaymentModalVisible(false)}
										>
											<Ionicons
												name="close-circle"
												size={30}
												color={colors.textMedium}
											/>
										</TouchableOpacity>
									</View>

									<View style={styles.webViewContainer}>
										<DlocalNativeCheckout
											publicKey={dlocalPublicKey}
											checkoutToken={dlocalCheckoutToken}
											amountFormatted={formatCurrency(myFinalTotal)}
											locale={i18n.language || "es"}
											isLive={isLiveMode}
											initialName={savedName}
											initialDocument={savedDocument}
											initialEmail={savedEmail || currentUserData?.email || ""}
											onTokenSuccess={(cardData) => {
												setIsPaymentModalVisible(false);
												handleSmartFieldToken(cardData);
											}}
											onError={(message) => {
												setPaymentError(message);
												Alert.alert("Payment Error", message);
											}}
											onProcessing={() => setIsPreparing(true)}
										/>
									</View>
								</ScrollView>
							</View>
						</View>
					</KeyboardAvoidingView>
				</Modal>
			</SafeAreaView>
		</StripeProvider>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	scrollContentContainer: { paddingBottom: 120 },
	header: { padding: 20, paddingBottom: 10, alignItems: "center" },
	title: { fontSize: 24, fontWeight: "bold", color: colors.textDark },
	restaurantName: { fontSize: 16, color: colors.textMedium, marginTop: 4 },
	modePill: {
		marginTop: 10,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 999,
		backgroundColor: colors.primary + "15",
		color: colors.primary,
		fontSize: 12,
		fontWeight: "700",
		overflow: "hidden",
	},
	section: {
		marginHorizontal: 15,
		marginVertical: 10,
		padding: 15,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		elevation: 2,
		shadowColor: "#000",
		shadowOpacity: 0.08,
		shadowRadius: 5,
		shadowOffset: { width: 0, height: 2 },
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: colors.primary,
		marginBottom: 12,
	},
	itemRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	itemName: {
		fontSize: 16,
		color: colors.textDark,
		flexShrink: 1,
		marginRight: 10,
	},
	itemPrice: { fontSize: 16, fontWeight: "500", color: colors.textDark },
	noItemsText: {
		fontSize: 16,
		color: colors.textMedium,
		fontStyle: "italic",
		textAlign: "center",
	},
	gratuityContainer: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
	},
	gratuityPicker: {
		height: Platform.OS === "ios" ? 180 : 50,
		color: colors.textDark,
	},
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 5,
	},
	label: { fontSize: 16, color: colors.textMedium },
	amount: { fontSize: 16, fontWeight: "500", color: colors.textDark },
	totalLabel: { fontSize: 18, fontWeight: "bold", color: colors.textDark },
	totalAmount: { fontSize: 18, fontWeight: "bold", color: colors.primary },
	divider: { marginVertical: 8 },
	errorText: {
		color: colors.statusDanger,
		textAlign: "center",
		margin: 15,
		fontSize: 14,
	},
	footer: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: 20,
		paddingBottom: 30,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		minHeight: 100,
	},
	payButton: {
		paddingVertical: 8,
		borderRadius: 8,
		backgroundColor: colors.primary,
	},
	payButtonText: { fontSize: 16, fontWeight: "bold", color: "#fff" },
	originalPriceText: {
		fontSize: 14,
		color: colors.textLight,
		textDecorationLine: "line-through",
		marginBottom: 2,
	},
	discountText: {
		fontSize: 16,
		fontWeight: "500",
		color: colors.statusSuccess,
	},
	modalBackground: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		justifyContent: "flex-end",
	},

	bottomSheet: {
		backgroundColor: colors.surfaceWhite,
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: Platform.OS === "ios" ? 40 : 20,
		width: "100%",
		maxHeight: "92%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -4 },
		shadowOpacity: 0.1,
		shadowRadius: 10,
		elevation: 10,
	},
	bottomSheetScrollContent: {
		paddingBottom: 20,
		flexGrow: 1,
	},

	webViewContainer: {
		width: "100%",
		height: 620,
		minHeight: 620,
	},
	sheetHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	sheetTitle: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
	},
	priceContainer: {
		alignItems: "flex-end",
		justifyContent: "center",
	},
	itemRowBlock: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	itemInfoBlock: {
		flex: 1,
		marginRight: 10,
	},
	modifiersContainer: {
		marginTop: 4,
	},
	modifierText: {
		fontSize: 13,
		color: colors.textMedium,
		lineHeight: 18,
		marginTop: 2,
	},
	helperText: {
		fontSize: 13,
		color: colors.textMedium,
		marginBottom: 10,
		lineHeight: 18,
	},
	instructionsInput: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 10,
		padding: 12,
		minHeight: 110,
		fontSize: 15,
		color: colors.textDark,
		backgroundColor: colors.backgroundLight,
	},
	instructionsCounter: {
		marginTop: 8,
		textAlign: "right",
		fontSize: 12,
		color: colors.textMedium,
	},
});

export default PartyCheckoutScreen;
