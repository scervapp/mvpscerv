// screens/customer/PartyCheckoutScreen.js
import React, {
	useState,
	useEffect,
	useContext,
	useMemo,
	useCallback,
} from "react";
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
} from "react-native";
import {
	useRoute,
	useNavigation,
	CommonActions,
} from "@react-navigation/native";
import { Button, Divider } from "react-native-paper";
import { StripeProvider, useStripe } from "@stripe/stripe-react-native";
import { Picker } from "@react-native-picker/picker";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import formatCurrency from "../../utils/currencyFormatter";
import { httpsCallable } from "@react-native-firebase/functions";
import { useCheckInStatus } from "../../utils/customerUtils";

const PartyCheckoutScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const { partyDetails, sharedBaskets } = useParty();
	const { initPaymentSheet, presentPaymentSheet } = useStripe();
	const navigation = useNavigation();
	const route = useRoute();

	const { partyId } = route.params;

	const sharedBasketItems = sharedBaskets[partyId];
	const party = partyDetails[partyId] || [];

	const { checkInObj } = useCheckInStatus(
		party?.restaurantId,
		currentUserData?.uid
	);

	// --- State Management ---
	const [isPreparing, setIsPreparing] = useState(false); // Preparing payment sheet
	const [isPaying, setIsPaying] = useState(false);
	const [paymentError, setPaymentError] = useState(null);
	const [isPaymentSheetReady, setIsPaymentSheetReady] = useState(false);
	const [stripePublishableKey, setStripePublishableKey] = useState(null);

	const [fees, setFees] = useState(0.05); // Default platform fee, fetched from DB
	const [gratuityPercentage, setGratuityPercentage] = useState("18"); // Default tip
	const [isLoadingParty, setIsLoadingParty] = useState(false);

	const [calculatedTax, setCalculatedTax] = useState(0);
	const [finalTotal, setFinalTotal] = useState(0);
	const [isReadyToPay, setIsReadyToPay] = useState(false);

	useEffect(() => {
		if (!party?.restaurantId) return;

		const fetchKey = async () => {
			const feesSnap = await db.collection("appConfig").doc("general").get();
			if (feesSnap.exists()) {
				setFees(feesSnap.data().fees); // Make sure this is number like 0.05
			} else if (isMounted) {
				console.warn("Fee configuration not found, using default.");
				setFees(0.03); // Set default if not found
			}
			try {
				console.log(
					`PartyCheckoutScreen: Fetching Stripe publishable key for restaurant ${party.restaurantId}`
				);
				const getStripePublishableKeyFunction = httpsCallable(
					functions,
					"getStripePublishableKey"
				);

				const { data } = await getStripePublishableKeyFunction({
					restaurantId: party.restaurantId,
				});
				if (data.stripePublishableKey) {
					setStripePublishableKey(data.stripePublishableKey);
					console.log(
						"PartyCheckoutScreen: Stripe publishable key fetched successfully."
					);
				} else {
					throw new Error("Publishable key not returned from server.");
				}
			} catch (error) {
				console.error("Error fetching Stripe publishable key:", error);
				setPaymentError(
					"Could not load payment configuration for this restaurant."
				);
			}
		};
		fetchKey();
	}, [party?.restaurantId]);

	// --- Data Filtering & Calculations (useMemo for performance) ---
	const {
		myItemsInBasket,
		mySubtotal,
		myGratuity,
		myPlatformFee,
		myFinalTotal,
		myTotalDiscount,
	} = useMemo(() => {
		if (!sharedBasketItems || !currentUserData?.uid) {
			return {
				myItemsInBasket: [],
				mySubtotal: 0,
				myGratuity: 0,
				myPlatformFee: 0,
				myFinalTotal: 0,
				myTotalDiscount: 0,
			};
		}

		const items = sharedBasketItems.filter(
			(item) => item.orderedByUserId === currentUserData.uid
		);

		if (items.length === 0) {
			return {
				myItemsInBasket: [],
				mySubtotal: 0,
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
			discountedSubtotalInCents * (parseFloat(gratuityPercentage) / 100)
		);
		const platformFeeInCents = Math.round(discountedSubtotalInCents * fees);
		const finalTotalInCents =
			discountedSubtotalInCents + gratuityInCents + platformFeeInCents;
		const totalDiscountInCents =
			originalSubtotalInCents - discountedSubtotalInCents;

		// FINAL: Include menuItemId + restaurantId for rating
		return {
			myItemsInBasket: items.map((item) => ({
				id: item.id, // basketItemId
				name: item.dishName,
				menuItemId: item.menuItemId, // ← REQUIRED for rating
				restaurantId: item.restaurantId, // ← REQUIRED for rating
				price: item.price,
				quantity: item.quantity,
				discountedPrice: item.discountedPrice,
			})),
			mySubtotal: discountedSubtotalInCents,
			myGratuity: gratuityInCents,
			myPlatformFee: platformFeeInCents,
			myFinalTotal: finalTotalInCents,
			myTotalDiscount: totalDiscountInCents,
		};
	}, [sharedBasketItems, currentUserData?.uid, gratuityPercentage, fees]);

	useEffect(() => {
		const canPay =
			myFinalTotal > 0 && party?.id && currentUserData?.uid && party?.checkInId;

		setIsReadyToPay(canPay);
	}, [myFinalTotal, party, currentUserData]);
	// --- Handle Payment Action ---
	const handlePayment = async () => {
		// Prevent multiple presses or paying when not ready.
		if (!isReadyToPay || isPreparing) {
			return;
		}
		setIsPreparing(true);
		setPaymentError(null);

		try {
			// --- Step 1: Call the single 'preparePayment' Cloud Function ---
			console.log("Party Checkout: Calling 'preparePayment' function...");
			const preparePayment = httpsCallable(functions, "preparePayment");

			// --- Step 2: Build the secure payload for the backend ---
			// We send item IDs and let the server calculate the authoritative total.
			const { data: prepData } = await preparePayment({
				paymentType: "party",
				restaurantId: party.restaurantId,
				partyId: party.id,
				items: myItemsInBasket.map((item) => ({ id: item.id })), // Send only basket item IDs
				gratuity: myGratuity, // Send this user's portion of the gratuity
				checkInId: party.checkInId,
				table: party.table || null,
				server: party.server || null,
				checkInTimestamp: null,
				// No stripeCustomerId is sent; the server securely handles it.
			});

			if (!prepData?.paymentIntentClientSecret) {
				throw new Error("Failed to get payment details from server.");
			}

			// --- Step 3: Initialize the Stripe Payment Sheet ---
			const { error: initError } = await initPaymentSheet({
				merchantDisplayName: `Scerv Inc. - ${party.restaurantName}`,
				paymentIntentClientSecret: prepData.paymentIntentClientSecret,
				customerEphemeralKeySecret: prepData.ephemeralKeySecret,
				customerId: prepData.customerId,
				allowsDelayedPaymentMethods: true,
				returnURL: "scerv://stripe-redirect",
			});

			if (initError) {
				throw new Error(
					`Failed to initialize payment sheet: ${initError.message}`
				);
			}

			// --- Step 4: Present the Payment Sheet to the User ---
			const { error: presentError } = await presentPaymentSheet();

			if (presentError) {
				// Handle cases where the user cancels the payment sheet
				if (presentError.code !== "Canceled") {
					throw new Error(`Payment failed: ${presentError.message}`);
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
									itemsToRate: myItemsInBasket, // ← PASS IT
									basketId: party.id,
									origin: "party",
									isIndividual: false,
								},
							},
						],
					})
				);
			}
		} catch (error) {
			console.error("Party payment process failed:", error);
			setPaymentError(error.message);
			Alert.alert("Payment Error", error.message);
		} finally {
			// Reset the loading state if there was an error and we didn't navigate away
			setIsPreparing(false);
		}
	};

	// --- Render Logic ---
	return (
		<StripeProvider publishableKey={stripePublishableKey}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					style={styles.container}
					contentContainerStyle={styles.scrollContentContainer}
				>
					<View style={styles.header}>
						<Text style={styles.title}>Checkout Your Portion</Text>
						<Text style={styles.restaurantName}>{party?.restaurantName}</Text>
					</View>

					{/* Your Itemized List */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Your Items</Text>
						{myItemsInBasket.length > 0 ? (
							myItemsInBasket.map((item) => {
								console.log("Item From Party Checkout", item);
								return (
									<View key={item.id} style={styles.itemRow}>
										<Text style={styles.itemName}>
											{item.quantity}x {item.name}{" "}
											{item.orderedByPipName
												? `(For ${item.orderedByPipName})`
												: ""}
										</Text>
										<Text style={styles.itemPrice}>
											{formatCurrency((item.price || 0) * item.quantity * 100)}
										</Text>
									</View>
								);
							}) // ✅ missing this parenthesis in your version
						) : (
							<Text style={styles.noItemsText}>
								You have no items in this order.
							</Text>
						)}
					</View>

					{/* Gratuity Section */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Add Gratuity</Text>
						<View style={styles.gratuityContainer}>
							<Picker
								selectedValue={gratuityPercentage}
								onValueChange={(itemValue) => setGratuityPercentage(itemValue)}
								style={styles.gratuityPicker}
							>
								<Picker.Item label="5%" value="5" />
								<Picker.Item label="10%" value="10" />
								<Picker.Item label="15%" value="15" />
								<Picker.Item label="18% (Recommended)" value="18" />
								<Picker.Item label="20%" value="20" />
								<Picker.Item label="25%" value="25" />
								<Picker.Item label="No Tip" value="0" />
							</Picker>
						</View>
					</View>

					{/* Order Summary */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Your Bill Summary</Text>
						{/* Conditionally show original price and discount if a discount exists */}
						{myTotalDiscount > 0 && (
							<>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>Original Subtotal:</Text>
									<Text style={styles.originalPriceText}>
										{formatCurrency(mySubtotal)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>Discounts:</Text>
									<Text style={styles.discountText}>
										-{formatCurrency(myTotalDiscount)}
									</Text>
								</View>
							</>
						)}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Subtotal:</Text>
							<Text style={styles.amount}>{formatCurrency(mySubtotal)}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.label}>
								Gratuity ({gratuityPercentage}%):
							</Text>
							<Text style={styles.amount}>{formatCurrency(myGratuity)}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Service Fee:</Text>
							<Text style={styles.amount}>{formatCurrency(myPlatformFee)}</Text>
						</View>

						<View style={styles.summaryRow}></View>
						<Divider style={styles.divider} />
						<View style={styles.summaryRow}>
							<Text style={styles.totalLabel}>Your Total:</Text>
							{isPreparing ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<Text style={styles.totalAmount}>
									{formatCurrency(myFinalTotal)}
								</Text>
							)}
						</View>
					</View>

					{paymentError && <Text style={styles.errorText}>{paymentError}</Text>}
				</ScrollView>

				{/* Pay Button Footer */}
				<View style={styles.footer}>
					<Button
						mode="contained"
						onPress={handlePayment}
						disabled={!isReadyToPay || isPreparing}
						loading={isPreparing || isPaying}
						style={styles.payButton}
						labelStyle={styles.payButtonText}
					>
						{isPreparing
							? "Preparing..."
							: isPaying
							? "Processing..."
							: `Pay ${formatCurrency(myFinalTotal)}`}
					</Button>
				</View>
			</SafeAreaView>
		</StripeProvider>
	);
};

// --- Styles ---
const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	scrollContentContainer: { paddingBottom: 100 }, // Space for footer
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
	disclaimerText: {
		fontSize: 12,
		color: colors.textLight,
		textAlign: "center",
		marginTop: 10,
	},
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
		paddingBottom: 30, // Extra padding for home bar
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	payButton: { paddingVertical: 8, borderRadius: 8 },
	payButtonText: { fontSize: 16, fontWeight: "bold" },
	originalPriceText: {
		fontSize: 16,
		color: colors.textLight,
		textDecorationLine: "line-through",
	},
	discountText: {
		fontSize: 16,
		fontWeight: "500",
		color: colors.statusSuccess, // Or a nice green color
	},
});

export default PartyCheckoutScreen;
