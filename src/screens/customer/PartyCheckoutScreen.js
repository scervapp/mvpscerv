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
import { httpsCallable } from "firebase/functions";

import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import formatCurrency from "../../utils/currencyFormatter";

const PartyCheckoutScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const { partyDetails, sharedBasketItems } = useParty();
	const { initPaymentSheet, presentPaymentSheet } = useStripe();
	const navigation = useNavigation();
	const route = useRoute();

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

	const { partyId } = route.params;

	useEffect(() => {
		if (!partyDetails?.restaurantId) return;

		const fetchKey = async () => {
			try {
				console.log(
					`PartyCheckoutScreen: Fetching Stripe publishable key for restaurant ${partyDetails.restaurantId}`
				);
				const getStripePublishableKeyFunction = httpsCallable(
					functions,
					"getStripePublishableKey"
				);

				const { data } = await getStripePublishableKeyFunction({
					restaurantId: partyDetails.restaurantId,
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
	}, [partyDetails?.restaurantId]);

	// --- Data Filtering & Calculations (useMemo for performance) ---
	const {
		myItems,
		subtotal,
		originalSubtotal,
		totalDiscount,
		gratuity,
		platformFee,
		totalForPayment,
	} = useMemo(() => {
		if (!sharedBasketItems || !currentUserData?.uid) {
			return {
				myItems: [],
				subtotal: 0,
				originalSubtotal: 0,
				totalDiscount: 0,
				gratuity: 0,
				platformFee: 0,
				totalForPayment: 0,
			};
		}

		// 1. Filter for the current user's items that have been sent to the kitchen
		const userItems = sharedBasketItems.filter(
			(item) =>
				item.orderedByUserId === currentUserData.uid && item.status === "sent"
		);

		// 2. Calculate user's subtotal

		const initialTotals = { originalSubtotal: 0, finalSubtotal: 0 };

		const calculatedTotals = userItems.reduce((acc, item) => {
			const quantity = Number(item.quantity) || 1;
			const originalPrice = (Number(item.price) || 0) * 100; // Original price in cents

			acc.originalSubtotal += originalPrice * quantity;

			// --- THIS IS THE FIX ---
			// Check if a discount exists and use the discountedPrice if available
			const finalPrice =
				item.discount > 0 && typeof item.discountedPrice === "number"
					? Math.round(item.discountedPrice * 100) // Use discounted price in cents
					: originalPrice;
			// --- END OF FIX ---

			acc.finalSubtotal += finalPrice * quantity;
			return acc;
		}, initialTotals);

		const userSubtotal = calculatedTotals.finalSubtotal;
		const userOriginalSubtotal = calculatedTotals.originalSubtotal;
		const userTotalDiscount = userOriginalSubtotal - userSubtotal;

		// 3. Calculate gratuity and fees based on the user's FINAL subtotal
		const userGratuity = Math.round(
			userSubtotal * (parseFloat(gratuityPercentage) / 100)
		);
		const userPlatformFee = Math.round(userSubtotal * fees);

		// 4. Calculate total amount for payment processing
		const userTotalForPayment = userSubtotal + userGratuity + userPlatformFee;

		return {
			myItems: userItems,
			subtotal: userSubtotal,
			originalSubtotal: userOriginalSubtotal,
			totalDiscount: userTotalDiscount,
			gratuity: userGratuity,
			platformFee: userPlatformFee,
			totalForPayment: userTotalForPayment,
		};
	}, [sharedBasketItems, currentUserData?.uid, gratuityPercentage, fees]);

	useEffect(() => {
		// Guard against running without necessary data
		if (
			totalForPayment <= 49 ||
			!partyDetails?.id ||
			!partyDetails?.restaurantStripeAccountId
		) {
			// Check if loading is finished before showing an error
			if (
				!isLoadingParty &&
				partyDetails &&
				!partyDetails.restaurantStripeAccountId
			) {
				console.error(
					"Error: Restaurant Stripe Account ID is missing from partyDetails."
				);
				setPaymentError("This restaurant is not set up for payments.");
			}
			setIsPaymentSheetReady(false);
			return;
		}

		const prepareSheet = async () => {
			setIsPreparing(true);
			setPaymentError(null);
			try {
				// This is the data Stripe Tax needs to calculate tax correctly.
				const lineItemsForTax = myItems.map((item) => {
					const priceInCents = Math.round((item.price || 0) * 100);
					return {
						amount: priceInCents * (item.quantity || 1),
						quantity: 1,
						tax_code: "txcd_10103001", // General food/beverage tax code
						reference: item.id,
					};
				});
				const customerDetailsForTax = {
					address: {
						line1: null,
						city: null,
						state: "NY",
						postal_code: "11215",
						country: "US",
					},
					address_source: "billing",
				};

				// --- Call the NEW 'preparePartyPaymentSheet' Cloud Function ---
				const prepareFn = httpsCallable(functions, "preparePartyPaymentSheet");
				const { data } = await prepareFn({
					partyId: partyDetails.id,
					amount: totalForPayment, // Total in cents for this user's portion
					platformFee: platformFee, // Your calculated fee for this user's portion
					restaurantStripeAccountId: partyDetails.restaurantStripeAccountId,
					subtotal: subtotal, // Pass the user's subtotal
					gratuity: gratuity, // Pass the user's gratuity
					lineItems: lineItemsForTax,
					customerDetails: customerDetailsForTax,
				});

				if (!data.paymentIntent || !data.ephemeralKey || !data.customer) {
					throw new Error("Payment details from server are incomplete.");
				}

				// After getting the response, update the state with the server-calculated values.
				setCalculatedTax(data.calculatedTaxAmount || 0);
				setFinalTotal(data.finalAmount || totalForPayment);
				// Initialize the Payment Sheet
				const { error } = await initPaymentSheet({
					merchantDisplayName: `Scerv Inc. - ${partyDetails.restaurantName}`,
					paymentIntentClientSecret: data.paymentIntent,
					customerEphemeralKeySecret: data.ephemeralKey,
					customerId: data.customer,
					publishableKey: stripePublishableKey,
					allowsDelayedPaymentMethods: true,
					returnURL: "stripe://stripe-redirect",
				});

				if (error) {
					throw error;
				}
				setIsPaymentSheetReady(true);
			} catch (error) {
				console.error("Error preparing payment sheet:", error);
				setPaymentError(`Could not prepare payment: ${error.message}`);
			} finally {
				setIsPreparing(false);
			}
		};

		prepareSheet();
	}, [totalForPayment, partyDetails]); // Dependency array is correct

	// --- Handle Payment Action ---
	const handlePayment = async () => {
		if (!isPaymentSheetReady || isPaying) return;
		setIsPaying(true);
		setPaymentError(null);

		const { error } = await presentPaymentSheet();

		if (error) {
			if (error.code !== "Canceled") {
				console.error("Payment failed:", error);
				setPaymentError(
					`Payment failed: ${error.localizedMessage || error.message}`
				);
			}
			setIsPaying(false);
			console.log(
				"PartyCheckoutScreen: Payment Sheet completed successfully! Navigating to confirmation."
			);
		} else {
			navigation.dispatch(
				CommonActions.reset({
					index: 0,
					routes: [
						{
							name: "OrderConfirmation",
							params: {
								mode: "party", // <<< Specify the mode
								partyId: partyDetails.id, // Pass the partyId
								initialStatus: "paid",
							},
						},
					],
				})
			);
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
						<Text style={styles.restaurantName}>
							{partyDetails?.restaurantName}
						</Text>
					</View>

					{/* Your Itemized List */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Your Items</Text>
						{myItems.length > 0 ? (
							myItems.map((item) => (
								<View key={item.id} style={styles.itemRow}>
									<Text style={styles.itemName}>
										{item.quantity}x {item.dishName}{" "}
										{item.orderedByPipName
											? `(For ${item.orderedByPipName})`
											: ""}
									</Text>
									<Text style={styles.itemPrice}>
										{formatCurrency((item.price || 0) * item.quantity * 100)}
									</Text>
								</View>
							))
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
								<Picker.Item label="15%" value="15" />
								<Picker.Item label="18% (Recommended)" value="18" />
								<Picker.Item label="20%" value="20" />
								<Picker.Item label="25%" value="25" />
								<Picker.Item label="Custom" value="custom" disabled={true} />
								<Picker.Item label="No Tip" value="0" />
							</Picker>
						</View>
					</View>

					{/* Order Summary */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Your Bill Summary</Text>
						{/* Conditionally show original price and discount if a discount exists */}
						{totalDiscount > 0 && (
							<>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>Original Subtotal:</Text>
									<Text style={styles.originalPriceText}>
										{formatCurrency(originalSubtotal)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>Discounts:</Text>
									<Text style={styles.discountText}>
										-{formatCurrency(totalDiscount)}
									</Text>
								</View>
							</>
						)}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Subtotal:</Text>
							<Text style={styles.amount}>{formatCurrency(subtotal)}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.label}>
								Gratuity ({gratuityPercentage}%):
							</Text>
							<Text style={styles.amount}>{formatCurrency(gratuity)}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Service Fee:</Text>
							<Text style={styles.amount}>{formatCurrency(platformFee)}</Text>
						</View>
						<Divider style={styles.divider} />
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Est. Sales Tax:</Text>
							{isPreparing ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<Text style={styles.amount}>
									{formatCurrency(calculatedTax)}
								</Text>
							)}
						</View>
						<Divider style={styles.divider} />
						<View style={styles.summaryRow}>
							<Text style={styles.totalLabel}>Your Total:</Text>
							{isPreparing ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<Text style={styles.totalAmount}>
									{formatCurrency(finalTotal)}
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
						disabled={
							!isPaymentSheetReady ||
							isPaying ||
							isPreparing ||
							myItems.length === 0
						}
						loading={isPreparing || isPaying}
						style={styles.payButton}
						labelStyle={styles.payButtonText}
					>
						{isPreparing
							? "Preparing..."
							: isPaying
							? "Processing..."
							: `Pay ${formatCurrency(finalTotal)}`}
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
	gratuityPicker: { height: Platform.OS === "ios" ? 180 : 50 },
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

