// screens/customer/PartyCheckoutScreen.js
import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
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
	Animated,
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

const PartyCheckoutScreen = () => {
	const { t, i18n } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const { partyDetails, sharedBaskets } = useParty();
	const { initPaymentSheet, presentPaymentSheet } = useStripe();
	const navigation = useNavigation();
	const route = useRoute();

	const { partyId } = route.params;

	const sharedBasketItems = sharedBaskets[partyId]?.items || [];
	const party = partyDetails[partyId] || [];

	const { checkInObj } = useCheckInStatus(
		party?.restaurantId,
		currentUserData?.uid,
	);

	// --- State Management ---
	const [isPreparing, setIsPreparing] = useState(false);
	const [isPaying, setIsPaying] = useState(false);
	const [paymentError, setPaymentError] = useState(null);
	const [stripePublishableKey, setStripePublishableKey] = useState(null);

	const [fees, setFees] = useState(0.05);
	const [gratuityPercentage, setGratuityPercentage] = useState("18");

	const [finalTotal, setFinalTotal] = useState(0);
	const [isReadyToPay, setIsReadyToPay] = useState(false);

	// --- SMART FIELDS STATE VARIABLES ---
	const [dlocalPublicKey, setDlocalPublicKey] = useState(null);
	const [dlocalCheckoutToken, setDlocalCheckoutToken] = useState(null);
	const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
	const [isLiveMode, setIsLiveMode] = useState(null);

	// 🚨 NEW: State to hold the pre-filled user details
	const [savedName, setSavedName] = useState("");
	const [savedDocument, setSavedDocument] = useState("");
	const [restaurantData, setRestaurantData] = useState(null);
	const canAcceptPayments = restaurantData?.canAcceptPayments !== false;

	// Determine region
	const country = party?.restaurantCountryCode || "PA";
	const isPanama =
		country === "PA" || country === "Panama" || country === "panama";

	const confirmDlocalPayment = httpsCallable(functions, "confirmDlocalPayment");

	// --- Data Filtering & Calculations (useMemo for performance) ---
	const {
		myItemsInBasket,
		mySubtotal,
		myOriginalSubtotal,
		myGratuity,
		myPlatformFee,
		myFinalTotal,
		myTotalDiscount,
	} = useMemo(() => {
		if (!sharedBasketItems || !currentUserData?.uid) {
			return {
				myItemsInBasket: [],
				mySubtotal: 0,
				myOriginalSubtotal: 0,
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
				myGratuity: 0,
				myPlatformFee: 0,
				myFinalTotal: 0,
				myTotalDiscount: 0,
			};
		}

		let originalSubtotalInCents = 0;
		let discountedSubtotalInCents = 0;

		items.forEach((item) => {
			const priceInCents = Math.round((item.price || 0) * 100);
			const quantity = item.quantity || 1;
			originalSubtotalInCents += priceInCents * quantity;

			const finalPriceInCents =
				item.discountedPrice !== null && item.discountedPrice !== undefined
					? Math.round(item.discountedPrice * 100)
					: priceInCents;

			discountedSubtotalInCents += finalPriceInCents * quantity;
		});

		const gratuityInCents = Math.round(
			discountedSubtotalInCents * (parseFloat(gratuityPercentage) / 100),
		);
		const platformFeeInCents = Math.round(discountedSubtotalInCents * fees);
		const finalTotalInCents =
			discountedSubtotalInCents + gratuityInCents + platformFeeInCents;
		const totalDiscountInCents =
			originalSubtotalInCents - discountedSubtotalInCents;

		return {
			myItemsInBasket: items.map((item) => ({
				id: item.id || "",
				name: item.dishName || "Item",
				menuItemId: item.menuItemId || "",
				restaurantId: item.restaurantId || "",
				price: item.price || 0,
				quantity: item.quantity || 1,
				discountedPrice: item.discountedPrice ?? null,
			})),
			myOriginalSubtotal: originalSubtotalInCents,
			mySubtotal: discountedSubtotalInCents,
			myGratuity: gratuityInCents,
			myPlatformFee: platformFeeInCents,
			myFinalTotal: finalTotalInCents,
			myTotalDiscount: totalDiscountInCents,
		};
	}, [sharedBasketItems, currentUserData?.uid, gratuityPercentage, fees]);

	const slideAnim = useRef(new Animated.Value(800)).current;

	useEffect(() => {
		if (!party?.restaurantId) return;
		const unsubscribe = db
			.collection("restaurants")
			.doc(party.restaurantId)
			.onSnapshot((doc) => {
				if (doc.exists) setRestaurantData(doc.data());
			});
		return () => unsubscribe();
	}, [party?.restaurantId]);

	useEffect(() => {
		if (isPaymentModalVisible) {
			Animated.timing(slideAnim, {
				toValue: 0,
				duration: 300,
				useNativeDriver: true,
			}).start();
		} else {
			Animated.timing(slideAnim, {
				toValue: 800,
				duration: 250,
				useNativeDriver: true,
			}).start();
		}
	}, [isPaymentModalVisible, slideAnim]);

	useEffect(() => {
		setFinalTotal(myFinalTotal);
		const canPay =
			myFinalTotal > 0 && party?.id && currentUserData?.uid && party?.checkInId;
		setIsReadyToPay(canPay);
	}, [myFinalTotal, party, currentUserData]);

	// 🚨 NEW: Fetch saved user details when component mounts
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
				}
			} catch (error) {
				console.error("Error fetching user details:", error);
			}
		};

		fetchSavedDetails();
	}, [currentUserData?.uid]);

	// --- Fetch Configs & INITIALIZE DLOCAL ---
	useEffect(() => {
		let isMounted = true;

		const fetchInitialData = async () => {
			if (!party?.restaurantId) return;

			const feesSnap = await db.collection("appConfig").doc("general").get();
			if (feesSnap.exists() && isMounted) {
				setFees(feesSnap.data().fees);
			} else if (isMounted) {
				setFees(0.03);
			}

			if (!isPanama) {
				try {
					const getStripePublishableKeyFunction = httpsCallable(
						functions,
						"getStripePublishableKey",
					);
					const { data } = await getStripePublishableKeyFunction({
						restaurantId: party.restaurantId,
					});
					if (isMounted && data.stripePublishableKey) {
						setStripePublishableKey(data.stripePublishableKey);
					}
				} catch (error) {
					if (isMounted)
						setPaymentError(
							t("could_not_load_payment_configuration_for_this_restaurant"),
						);
				}
			}

			if (isPanama && finalTotal > 0 && isMounted) {
				try {
					const getPublicKey = httpsCallable(functions, "getDlocalPublicKey");
					const keyResponse = await getPublicKey({
						restaurantId: party.restaurantId,
					});
					setIsLiveMode(keyResponse.data.isLive);
					if (isMounted && keyResponse.data.publicKey) {
						setDlocalPublicKey(keyResponse.data.publicKey);
					}

					const createPayment = httpsCallable(functions, "createDlocalPayment");
					const paymentResponse = await createPayment({
						amount: finalTotal,
						currency: "USD",
						country: "PA",
						restaurantId: party.restaurantId,
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
		};

		fetchInitialData();
		return () => {
			isMounted = false;
		};
	}, [party?.restaurantId, finalTotal, isPanama]);

	useEffect(() => {
		// If the table is officially closed by the restaurant...
		if (party?.status === "completed") {
			console.log(
				"Restaurant closed the table. Auto-routing to Order Confirmation...",
			);

			// ...instantly navigate the user to rate their dishes.
			// We pass the party.id as the appOrderId because that's what the CF uses to save the final receipt!
			navigation.dispatch(
				CommonActions.reset({
					index: 0,
					routes: [
						{
							name: "OrderConfirmation",
							params: {
								initialStatus: "completed",
								itemsToRate: myItemsInBasket, // Pass their specific items so they can rate them
								isIndividual: false,
								origin: "party",
								appOrderId: party.id, // The final order uses the party ID
							},
						},
					],
				}),
			);
		}
	}, [party?.status, navigation, myItemsInBasket, party?.id]);

	// =========================================================
	// SMART FIELD TOKEN HANDLER (DLOCAL BYPASS)
	// =========================================================
	const handleSmartFieldToken = async (cardData) => {
		if (!isReadyToPay || myFinalTotal <= 0) return;

		setIsPreparing(true);
		setPaymentError(null);

		// 🚨 Unpack the saveDetails flag
		const {
			token: cardToken,
			name: cardholderName,
			document,
			saveDetails,
		} = cardData;

		try {
			const uid = currentUserData?.uid;

			// 🚨 NEW: Save details to Firestore if the user checked the box
			if (saveDetails && uid) {
				await db.collection("customers").doc(uid).set(
					{
						dlocalName: cardholderName,
						dlocalDocument: document,
					},
					{ merge: true },
				);
			}

			const cleanDocument = document
				? document.replace(/\s+/g, "")
				: "8-888-8888";

			const pendingOrderData = {
				restaurantId:
					myItemsInBasket[0]?.restaurantId || party?.restaurantId || "",
				customerId: uid || "anonymous",
				subtotal: mySubtotal || 0,
				gratuity: myGratuity || 0,
				platformFee: myPlatformFee || 0,
				totalPrice: myFinalTotal || 0,
				items: myItemsInBasket,
				table: party?.table || null,
				checkInId: party?.checkInId || null,
				checkInTimestamp:
					checkInObj?.createdAt || firestore.FieldValue.serverTimestamp(),
				server: party?.server || null,
				status: "pending",
				type: "party",
				partyId: party.id || "",
				createdAt: firestore.FieldValue.serverTimestamp(),
			};

			const pendingOrderRef = await firestore()
				.collection("pending_orders")
				.add(pendingOrderData);

			const pendingOrderId = pendingOrderRef.id;

			console.log("🚀 Firing Payment to CF with CIP:", cleanDocument);

			const result = await confirmDlocalPayment({
				pendingOrderId: pendingOrderId,
				checkoutToken: dlocalCheckoutToken,
				cardToken: cardToken,
				clientFirstName: cardholderName.split(" ")[0] || "Guest",
				clientLastName: cardholderName.split(" ").slice(1).join(" ") || "User",
				clientDocument: cleanDocument,
				clientDocumentType: "CIP",
				clientEmail: currentUserData?.email || "customer@scerv.com",
				country: "PA",
				restaurantId: party?.restaurantId,
			});

			const isSuccessful =
				result.data?.success === true ||
				result.data?.data?.success === true ||
				result.data?.status === "SUCCESS";

			if (isSuccessful) {
				console.log("✅ Party Charge Verified! Navigating...");

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
			} else {
				const backendError =
					result.data?.error ||
					result.data?.message ||
					result.data?.data?.message ||
					"Payment rejected by the gateway.";
				throw new Error(backendError);
			}
		} catch (error) {
			console.error("❌ Smart Field Bypass Error:", error);
			setPaymentError(error.message);
			Alert.alert("Payment Error", error.message);
		} finally {
			setIsPreparing(false);
		}
	};

	const handleManualCheckout = async () => {
		setIsPreparing(true);
		try {
			await db
				.collection("parties")
				.doc(partyId)
				.update({
					customerStatus: "ready_to_pay",
					checkoutRequestedAt: firestore.FieldValue.serverTimestamp(),
					// 🚨 NEW: Trigger the service request system simultaneously
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
		} catch (error) {
			Alert.alert("Error", "Could not request checkout.");
		} finally {
			setIsPreparing(false);
		}
	};
	// --- Stripe Payment Action (USA) ---
	const handlePayment = async () => {
		if (!isReadyToPay || isPreparing) return;
		setIsPreparing(true);
		setPaymentError(null);

		try {
			console.log("Party Checkout: Calling 'preparePayment' function...");
			const preparePayment = httpsCallable(functions, "preparePayment");

			const { data: prepData } = await preparePayment({
				paymentType: "party",
				restaurantId: party.restaurantId,
				partyId: party.id,
				items: myItemsInBasket.map((item) => ({ id: item.id })),
				gratuity: myGratuity,
				checkInId: party.checkInId,
				table: party.table || null,
				server: party.server || null,
				checkInTimestamp: null,
			});

			if (!prepData?.paymentIntentClientSecret) {
				throw new Error(t("failed_to_get_payment_details_from_server"));
			}

			const { error: initError } = await initPaymentSheet({
				merchantDisplayName: `Scerv Inc. - ${party.restaurantName}`,
				paymentIntentClientSecret: prepData.paymentIntentClientSecret,
				customerEphemeralKeySecret: prepData.ephemeralKeySecret,
				customerId: prepData.customerId,
				allowsDelayedPaymentMethods: true,
				returnURL: "scerv://stripe-redirect",
			});

			if (initError)
				throw new Error(
					`${t("failed_to_initialize_payment_sheet")}: ${initError.message}`,
				);

			const { error: presentError } = await presentPaymentSheet();

			if (presentError) {
				if (presentError.code !== "Canceled") {
					throw new Error(`${t("payment_failed")}: ${presentError.message}`);
				}
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
									basketId: party.id,
									origin: "party",
									isIndividual: false,
								},
							},
						],
					}),
				);
			}
		} catch (error) {
			console.error("Party payment process failed:", error);
			setPaymentError(error.message);
			Alert.alert(t("payment_error"), error.message);
		} finally {
			setIsPreparing(false);
		}
	};

	// --- Render Logic ---
	return (
		<StripeProvider publishableKey={stripePublishableKey || ""}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					style={styles.container}
					contentContainerStyle={styles.scrollContentContainer}
				>
					{/* Header Section */}
					<View style={styles.header}>
						<Text style={styles.title}>{t("checkout_your_portion")}</Text>
						<Text style={styles.restaurantName}>{party?.restaurantName}</Text>
					</View>

					{/* Items List Section */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>{t("your_items")}</Text>
						{myItemsInBasket.length > 0 ? (
							myItemsInBasket.map((item) => (
								<View key={item.id} style={styles.itemRow}>
									<Text style={styles.itemName}>
										{item.quantity}x {item.name}
									</Text>
									<Text style={styles.itemPrice}>
										{formatCurrency((item.price || 0) * item.quantity * 100)}
									</Text>
								</View>
							))
						) : (
							<Text style={styles.noItemsText}>
								{t("you_have_no_items_in_this_order")}
							</Text>
						)}
					</View>

					{/* Conditional Gratuity: Only shown if restaurant accepts in-app payments */}
					{canAcceptPayments && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>{t("add_gratuity")}</Text>
							<View style={styles.gratuityContainer}>
								<Picker
									selectedValue={gratuityPercentage}
									onValueChange={(itemValue) =>
										setGratuityPercentage(itemValue)
									}
									style={styles.gratuityPicker}
								>
									<Picker.Item label={t("18_percent_recommended")} value="18" />
									<Picker.Item label={t("20_percent")} value="20" />
									<Picker.Item label={t("no_tip")} value="0" />
								</Picker>
							</View>
						</View>
					)}

					{/* Bill Summary */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>{t("your_bill_summary")}</Text>
						<View style={styles.summaryRow}>
							<Text style={styles.label}>{t("subtotal")}:</Text>
							<Text style={styles.amount}>{formatCurrency(mySubtotal)}</Text>
						</View>

						{canAcceptPayments && (
							<>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>{t("gratuity")}:</Text>
									<Text style={styles.amount}>
										{formatCurrency(myGratuity)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>{t("service_fee")}:</Text>
									<Text style={styles.amount}>
										{formatCurrency(myPlatformFee)}
									</Text>
								</View>
							</>
						)}

						<Divider style={styles.divider} />

						<View style={styles.summaryRow}>
							<Text style={styles.totalLabel}>{t("your_total")}:</Text>
							<Text style={styles.totalAmount}>
								{formatCurrency(canAcceptPayments ? finalTotal : mySubtotal)}
							</Text>
						</View>
					</View>

					{paymentError && <Text style={styles.errorText}>{paymentError}</Text>}
				</ScrollView>

				{/* Footer Action Button */}
				<View style={styles.footer}>
					{canAcceptPayments ? (
						/* SCENARIO A: Restaurant accepts payments. Give them the choice between Cash or Card. */
						<View style={{ flexDirection: "row", gap: 10 }}>
							{/* Secondary Action: Pay Cash / Request Check */}
							<Button
								mode="outlined"
								onPress={handleManualCheckout}
								disabled={
									!isReadyToPay ||
									isPreparing ||
									party?.customerStatus === "ready_to_pay"
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
								{party?.customerStatus === "ready_to_pay"
									? t("server_notified", "Server Notified")
									: t("pay_cash", "Pay Cash")}
							</Button>

							{/* Primary Action: Pay Digitally */}
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
									party?.customerStatus === "ready_to_pay"
								}
								loading={isPreparing}
								style={[styles.payButton, { flex: 1 }]}
								labelStyle={styles.payButtonText}
							>
								{isPreparing
									? t("preparing")
									: party?.customerStatus === "ready_to_pay"
										? t("server_notified", "Server Notified")
										: `${t("pay")} ${formatCurrency(finalTotal)}`}
							</Button>
						</View>
					) : (
						/* SCENARIO B: No in-app payments. Show "Request Check" AND a disabled "Pay" button. */
						<View style={{ flexDirection: "row", gap: 10 }}>
							<Button
								mode="contained"
								onPress={handleManualCheckout}
								disabled={
									!isReadyToPay ||
									isPreparing ||
									party?.customerStatus === "ready_to_pay"
								}
								loading={isPreparing}
								style={[
									styles.payButton,
									{ flex: 1, backgroundColor: colors.statusWarning },
								]}
								labelStyle={styles.payButtonText}
							>
								{party?.customerStatus === "ready_to_pay"
									? t("server_notified", "Server Notified")
									: t("request_check", "Request Check")}
							</Button>

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
								{t("pay_with_card", "Pay with Card")}
							</Button>
						</View>
					)}
				</View>

				{/* DLocal Payment Sheet Modal */}
				<Modal
					visible={isPaymentModalVisible}
					transparent={true}
					animationType="slide"
				>
					<View style={styles.modalBackground}>
						<TouchableOpacity
							style={StyleSheet.absoluteFill}
							activeOpacity={1}
							onPress={() => setIsPaymentModalVisible(false)}
						/>
						<View style={styles.bottomSheet}>
							<View style={styles.sheetHeader}>
								<Text style={styles.sheetTitle}>{t("payment_details")}</Text>
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
									amountFormatted={formatCurrency(finalTotal)}
									locale={i18n.language || "es"}
									isLive={isLiveMode}
									initialName={savedName}
									initialDocument={savedDocument}
									onTokenSuccess={(cardData) => {
										setIsPaymentModalVisible(false);
										handleSmartFieldToken(cardData);
									}}
									onProcessing={() => setIsPreparing(true)}
								/>
							</View>
						</View>
					</View>
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
		fontSize: 16,
		color: colors.textLight,
		textDecorationLine: "line-through",
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
		maxHeight: "85%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -4 },
		shadowOpacity: 0.1,
		shadowRadius: 10,
		elevation: 10,
	},
	webViewContainer: {
		height: 420,
		width: "100%",
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
	loadingSheet: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		minHeight: 200,
	},
	loadingSheetText: {
		marginTop: 15,
		fontSize: 16,
		color: colors.textMedium,
	},
});

export default PartyCheckoutScreen;
