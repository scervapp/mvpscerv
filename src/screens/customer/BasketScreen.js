import React, { useContext, useEffect, useState, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	FlatList, // Use FlatList for main scroll
	ScrollView,
	Alert,
	ActivityIndicator,
	SafeAreaView,
	RefreshControl, // Add SafeAreaView, RefreshControl
} from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { AntDesign, FontAwesome5 } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import {
	Provider,
	Portal,
	FAB,
	Snackbar,
	IconButton,
} from "react-native-paper";

import {
	transformBasketData,
	useCheckInStatus,
} from "../../utils/customerUtils";
import { AuthContext } from "../../context/authContext";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { jsx } from "react/jsx-runtime";
import formatCurrency from "../../utils/currencyFormatter";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"; // Use consistent icon set if possible
import { Divider } from "react-native-elements";
import { doc, getDoc } from "firebase/firestore";

const BasketScreen = ({ route, navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const { restaurant } = route.params;
	const { baskets, basketError, handleQuantityChange, updateItemStatus } =
		useBasket(); // Ensure updateItemStatus exists in context
	const [filteredBasketData, setFilteredBasketData] = useState([]); // For PIP display
	const [isProcessing, setIsProcessing] = useState(false); // Combined loading state
	const [showSnackbar, setShowSnackbar] = useState(false);
	const [snackbarMessage, setSnackbarMessage] = useState("");
	const { checkInStatus, checkInObj } = useCheckInStatus(
		restaurant?.uid,
		currentUserData?.uid
	);
	const [fees, setFees] = useState(0.05); // Default platform fee %

	// Get basket for the current restaurant
	const restaurantBasketItems = useMemo(() => {
		return baskets[restaurant?.id]?.items || [];
	}, [baskets, restaurant?.id]);

	// Fetch fee config
	useEffect(() => {
		const fetchFeeConfig = async () => {
			try {
				const feesDocRef = doc(db, "appConfig", "general"); // Adjust if path differs
				const docSnap = await getDoc(feesDocRef);
				if (docSnap.exists()) {
					const fetchedFees = parseFloat(docSnap.data().fees);
					if (!isNaN(fetchedFees)) setFees(fetchedFees);
				}
			} catch (error) {
				console.error("Error fetching fee config:", error);
			}
		};
		fetchFeeConfig();
	}, []);

	// --- Data Transformation and Totals Calculation ---
	const {
		subtotal, // After discounts
		taxEstimate, // Client-side estimate
		platformFeeEstimate, // Client-side estimate
		grandTotalEstimate, // Client-side estimate
		totalDiscount,
		originalSubtotal,
		pipDataForDisplay, // Transformed data for rendering PIPs
	} = useMemo(() => {
		console.log("Running totals useMemo...");
		console.log("  Input Fees:", fees, typeof fees);
		console.log(
			"  Input Tax Rate:",
			restaurant?.taxRate,
			typeof restaurant?.taxRate
		);
		console.log("  Input Basket Items Count:", restaurantBasketItems?.length);

		if (
			!restaurantBasketItems ||
			typeof fees !== "number" /* ... other guards */
		) {
			console.log("  Skipping calculation due to missing inputs.");
			return {
				/* default zeroed object */
			};
		}
		let calcSubtotal = 0;
		let calcOriginalSubtotal = 0;
		let calcTotalDiscount = 0;

		// Calculate overall totals first
		restaurantBasketItems.forEach((item) => {
			const originalPrice = Math.round((Number(item?.dish?.price) || 0) * 100);
			const quantity = Number(item?.quantity) || 1;
			calcOriginalSubtotal += originalPrice * quantity;
			const price = item?.discount
				? parseFloat(item.discountedPrice) * 100
				: originalPrice;
			calcSubtotal += Math.round(price || 0) * quantity;
		});
		calcTotalDiscount = calcOriginalSubtotal - calcSubtotal;

		// Estimate tax and fee based on current subtotal
		// NOTE: Tax estimate uses restaurant.taxRate, final tax calculated by Stripe Tax later
		const calcTaxEstimate = Math.round(
			calcSubtotal * (restaurant?.taxRate || 0)
		);
		const calcPlatformFeeEstimate = Math.round(calcSubtotal * fees); // Fee on pre-tax subtotal

		const calcGrandTotalEstimate =
			calcSubtotal + calcTaxEstimate + calcPlatformFeeEstimate; // Estimate BEFORE gratuity

		// Transform data for PIP display
		const transformedData = transformBasketData(restaurantBasketItems);
		const filteredData = transformedData.filter((p) => p?.items?.length > 0);
		const calcPipDataForDisplay = filteredData.map((personData) => {
			let pipSubtotal = 0;
			personData.items.forEach((item) => {
				const originalPrice = Math.round(
					(Number(item?.dish?.price) || 0) * 100
				);
				const quantity = Number(item?.quantity) || 1;
				const price = item?.discount
					? parseFloat(item.discountedPrice) * 100
					: originalPrice;
				pipSubtotal += Math.round(price || 0) * quantity;
			});
			return { ...personData, subtotal: pipSubtotal }; // Add calculated subtotal per PIP
		});

		return {
			subtotal: calcSubtotal,
			taxEstimate: calcTaxEstimate,
			platformFeeEstimate: calcPlatformFeeEstimate,
			grandTotalEstimate: calcGrandTotalEstimate,
			totalDiscount: calcTotalDiscount,
			originalSubtotal: calcOriginalSubtotal,
			pipDataForDisplay: calcPipDataForDisplay,
		};
	}, [restaurantBasketItems, restaurant?.taxRate, fees, transformBasketData]); // Dependencies

	// --- Actions ---
	const handleSendToChefsQ = async () => {
		if (checkInStatus !== "ACCEPTED") {
			Alert.alert("Not Checked In", "Please check in to place an order.");
			return;
		}
		const unsentItems = restaurantBasketItems
			.filter((item) => !item.sentToChefQ)
			.map((item) => ({
				// Map to format needed by cloud function
				dish: item.dish, // Pass full dish object or just needed IDs/info
				quantity: item.quantity,
				specialInstructions: item.specialInstructions,
				pips: [item.pip], // Assuming structure expects array
				id: item.id, // The unique ID for this basket item instance
			}));

		if (unsentItems.length === 0) {
			Alert.alert(
				"No New Items",
				"All current basket items have already been sent."
			);
			return;
		}

		setIsProcessing(true);
		setSnackbarMessage("");

		try {
			const sendToChefsQFunction = httpsCallable(functions, "sendToChefsQ");
			const result = await sendToChefsQFunction({
				userId: currentUserData.uid,
				restaurantId: restaurant.id, // Use correct restaurant ID field
				items: unsentItems,
				server: checkInObj?.server || null,
				table: checkInObj?.table || null,
			});

			if (result.data.success) {
				// Update local state to mark items as sent
				// This depends on how your useBasket context works
				// Ideally, context handles updating the 'sentToChefQ' flag

				setSnackbarMessage("Order sent to kitchen!");
				setShowSnackbar(true);
			} else {
				throw new Error(result.data.error || "Failed to send order.");
			}
		} catch (error) {
			console.error("Failed to send Order", error);
			setSnackbarMessage(`Error: ${error.message || "Could not send order."}`);
			setShowSnackbar(true);
		} finally {
			setIsProcessing(false);
		}
	};

	const confirmRemoveItem = (item) => {
		Alert.alert(
			"Confirm Remove",
			`Remove ${item.dish.name} for ${item.pip.name}?`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					onPress: () => handleQuantityChange(restaurant.id, item.id, 0), // Assumes qty 0 removes
					style: "destructive",
				},
			]
		);
	};

	// Memoize the check for unsent items
	const hasUnsentItems = useMemo(() => {
		return restaurantBasketItems.some((item) => !item.sentToChefQ);
	}, [restaurantBasketItems]);

	// Memoize the condition for allowing checkout
	// Checkout allowed ONLY IF checked in AND basket not empty AND NO items are unsent
	const canCheckout = useMemo(() => {
		return (
			checkInStatus === "ACCEPTED" &&
			restaurantBasketItems.length > 0 &&
			!hasUnsentItems
		);
	}, [checkInStatus, restaurantBasketItems, hasUnsentItems]);

	// Memoize the condition for allowing sending items to kitchen
	const canSendToKitchen = useMemo(() => {
		return checkInStatus === "ACCEPTED" && hasUnsentItems;
	}, [checkInStatus, hasUnsentItems]);

	// --- Render Functions ---
	const renderBasketItem = ({ item: basketItem, personId }) => {
		// Note: personId might not be needed if item object contains all info
		const itemTotal =
			Math.round(
				(basketItem.discount
					? parseFloat(basketItem.discountedPrice)
					: basketItem.dish?.price || 0) * 100
			) * basketItem.quantity;
		return (
			<View
				key={basketItem.id}
				style={[
					styles.basketItemRow,
					basketItem.sentToChefQ ? styles.sentItemVisual : {},
				]}
			>
				<View style={styles.itemIconContainer}>
					{basketItem.sentToChefQ ? (
						<Ionicons
							name="checkmark-circle"
							size={22}
							color={colors.success || "green"}
						/>
					) : (
						<Ionicons
							name="time-outline"
							size={22}
							color={colors.warning || "#E85D04"}
						/> // Changed to outline version
					)}
				</View>
				<View style={styles.itemDetails}>
					<Text
						style={[
							styles.dishName,
							basketItem.sentToChefQ && styles.sentItemText,
						]}
					>
						{basketItem.dish.name}
					</Text>
					{basketItem.specialInstructions && (
						<Text style={styles.specialInstructions}>
							{basketItem.specialInstructions}
						</Text>
					)}
				</View>
				<View style={styles.itemControlsAndPrice}>
					{!basketItem.sentToChefQ ? (
						<View style={styles.quantityControls}>
							<IconButton
								icon="minus-circle-outline"
								size={22}
								onPress={() => {
									const currentQuantity = basketItem.quantity;
									if (currentQuantity === 1) {
										Alert.alert(
											"Confirm Remove",
											`Remove ${basketItem.dish.name}?`,
											[
												{ text: "Cancel", style: "cancel" },
												{
													text: "Remove",
													// --- CORRECTED CALL (2 args) ---
													onPress: () => handleQuantityChange(basketItem.id, 0),
													style: "destructive",
												},
											]
										);
									} else {
										// --- CORRECTED CALL (2 args) ---
										handleQuantityChange(basketItem.id, currentQuantity - 1);
									}
								}}
								style={styles.quantityButton}
							/>
							<Text style={styles.quantity}>{basketItem.quantity}</Text>
							<IconButton
								icon="plus-circle-outline"
								size={22}
								onPress={() =>
									handleQuantityChange(basketItem.id, basketItem.quantity + 1)
								}
								style={styles.quantityButton}
							/>
						</View>
					) : (
						<Text style={styles.itemQuantitySent}>x {basketItem.quantity}</Text> // Show quantity if sent
					)}
					<Text
						style={[
							styles.itemPrice,
							basketItem.sentToChefQ && styles.sentItemText,
						]}
					>
						{formatCurrency(itemTotal)}
					</Text>
				</View>
			</View>
		);
	};

	const renderPipSection = ({ item: personData }) => (
		<View key={personData.personId} style={styles.pipSection}>
			<Text style={styles.pipName}>{personData.pipName}</Text>
			<FlatList
				data={personData.items}
				renderItem={({ item }) =>
					renderBasketItem({ item, personId: personData.personId })
				}
				keyExtractor={(item) => item.id}
				scrollEnabled={false} // Disable scroll for inner list
			/>
			<View style={styles.pipTotalContainer}>
				<Text style={styles.pipTotalLabel}>
					Subtotal for {personData.pipName}:
				</Text>
				<Text style={styles.pipTotalAmount}>
					{formatCurrency(personData.subtotal)}
				</Text>
			</View>
			<Divider style={styles.pipDivider} />
		</View>
	);

	// --- Main Render ---
	return (
		<Provider>
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.container}>
					{/* Header */}
					<Text style={styles.mainHeading}>Your Basket</Text>
					<Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>
					{basketError && <Text style={styles.errorText}>{basketError}</Text>}

					{/* --- NEW: Status Message Area --- */}
					{!isProcessing &&
						restaurantBasketItems.length > 0 && ( // Only show messages if not processing and basket has items
							<>
								{checkInStatus !== "ACCEPTED" && (
									<View style={[styles.statusMessageContainer, styles.infoBox]}>
										<MaterialCommunityIcons
											name="information-outline"
											size={22}
											color={styles.infoText.color}
										/>
										<Text style={[styles.statusTextBase, styles.infoText]}>
											Please ensure you are checked in at your table to send
											items to the kitchen or checkout.
										</Text>
									</View>
								)}
								{checkInStatus === "ACCEPTED" && hasUnsentItems && (
									<View
										style={[styles.statusMessageContainer, styles.warningBox]}
									>
										<MaterialCommunityIcons
											name="alert-circle-outline"
											size={22}
											color={styles.warningText.color}
										/>
										<Text style={[styles.statusTextBase, styles.warningText]}>
											You have new items! Please press "Send New Items to
											Kitchen" below before checking out.
										</Text>
									</View>
								)}
								{checkInStatus === "ACCEPTED" &&
									!hasUnsentItems &&
									restaurantBasketItems.length > 0 && (
										<View
											style={[styles.statusMessageContainer, styles.successBox]}
										>
											<MaterialCommunityIcons
												name="check-circle-outline"
												size={22}
												color={styles.successText.color}
											/>
											<Text style={[styles.statusTextBase, styles.successText]}>
												All items sent to the kitchen! Ready to checkout.
											</Text>
										</View>
									)}
							</>
						)}
					{/* --- END: Status Message Area --- */}

					{/* Loading Indicator or Basket List */}
					{isProcessing && restaurantBasketItems.length === 0 ? ( // Show loader only if no items AND loading
						<View style={styles.centered}>
							<ActivityIndicator size="large" color={colors.primary} />
						</View>
					) : restaurantBasketItems.length === 0 ? (
						<View style={styles.centered}>
							<Text style={styles.emptyText}>Your basket is empty.</Text>
						</View>
					) : (
						<FlatList
							data={pipDataForDisplay} // Use the calculated PIP data
							renderItem={renderPipSection}
							keyExtractor={(item) => item.personId}
							style={styles.pipList}
							ListFooterComponent={
								// Put Summary and Send Button in Footer
								<>
									{/* Order Summary Section */}
									<View style={styles.summarySection}>
										<Text style={styles.summaryTitle}>Order Estimate</Text>
										{totalDiscount > 0 && (
											<View style={styles.summaryRow}>
												<Text style={styles.summaryLabel}>
													Original Subtotal:
												</Text>
												<Text style={styles.originalPrice}>
													{formatCurrency(originalSubtotal)}
												</Text>
											</View>
										)}
										<View style={styles.summaryRow}>
											<Text style={styles.summaryLabel}>Subtotal:</Text>
											<Text style={styles.summaryAmount}>
												{formatCurrency(subtotal)}
											</Text>
										</View>
										{totalDiscount > 0 && (
											<View style={styles.summaryRow}>
												<Text style={styles.summaryLabel}>Discounts:</Text>
												<Text
													style={[styles.summaryAmount, styles.discountAmount]}
												>
													-{formatCurrency(totalDiscount)}
												</Text>
											</View>
										)}
										<View style={styles.summaryRow}>
											<Text style={styles.summaryLabel}>
												Est. Service Fee ({(fees * 100).toFixed(0)}%):
											</Text>
											<Text style={styles.summaryAmount}>
												{formatCurrency(platformFeeEstimate)}
											</Text>
										</View>
										<View style={styles.summaryRow}>
											<Text style={styles.summaryLabel}>
												Est. Tax ({(restaurant?.taxRate * 100).toFixed(2)}%):
											</Text>
											<Text style={styles.summaryAmount}>
												{formatCurrency(taxEstimate)}
											</Text>
										</View>
										<View style={[styles.summaryRow, styles.grandTotalRow]}>
											<Text style={styles.grandTotalLabel}>
												Estimated Total (Before Tip):
											</Text>
											<Text style={styles.grandTotalAmount}>
												{formatCurrency(grandTotalEstimate)}
											</Text>
										</View>
										<Text style={styles.disclaimerText}>
											Final tax & total calculated at checkout. Gratuity added
											on next screen.
										</Text>
									</View>
									{/* --- Action Area --- */}
									<View style={styles.actionContainer}>
										{/* Contextual Message */}
										{checkInStatus !== "ACCEPTED" &&
											restaurantBasketItems.length > 0 && (
												<Text style={styles.warningMessage}>
													Please ensure you are checked in to send items or
													checkout.
												</Text>
											)}
										{checkInStatus === "ACCEPTED" && hasUnsentItems && (
											<Text style={styles.warningMessage}>
												Send new items to the kitchen before checking out.
											</Text>
										)}
										{checkInStatus === "ACCEPTED" &&
											!hasUnsentItems &&
											restaurantBasketItems.length > 0 && (
												<Text style={styles.successMessage}>
													All items sent! Ready to checkout.
												</Text>
											)}

										{/* Send to Kitchen Button */}
										<TouchableOpacity
											style={[
												styles.sendButtonBase,
												canSendToKitchen
													? styles.sendButtonActive
													: styles.sendButtonInactive,
											]}
											onPress={handleSendToChefsQ}
											// Disable if not checked in, if already sending, or if nothing to send
											disabled={!canSendToKitchen || isProcessing}
										>
											{isProcessing ? (
												<ActivityIndicator color="#ffffff" size="small" />
											) : (
												<Text style={styles.sendButtonText}>
													Send New Items to Kitchen
												</Text>
											)}
										</TouchableOpacity>
									</View>
								</>
							}
						/>
					)}
				</View>

				{/* Checkout FAB */}
				<Portal>
					{/* Show FAB if user is checked in and has items */}
					{checkInStatus === "ACCEPTED" && restaurantBasketItems.length > 0 && (
						<FAB
							style={[styles.fab, !canCheckout && styles.fabDisabled]} // Apply disabled style
							icon="credit-card-check-outline"
							label="Checkout"
							color={canCheckout ? colors.white : "#a0a0a0"} // Dim text color when disabled
							onPress={() =>
								navigation.navigate("CheckoutScreen", { restaurant, baskets })
							}
							visible={!isProcessing} // Hide if processing anything (like sending to kitchen)
							disabled={!canCheckout || isProcessing} // Disable based on canCheckout logic
						/>
					)}
				</Portal>

				<Snackbar
					visible={showSnackbar}
					onDismiss={() => setShowSnackbar(false)}
					duration={Snackbar.DURATION_SHORT} // Or DURATION_MEDIUM
					action={{ label: "OK", onPress: () => setShowSnackbar(false) }}
				>
					{snackbarMessage}
				</Snackbar>
			</SafeAreaView>
		</Provider>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.background || "#f8f9fa" },
	container: { flex: 1 },
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
	mainHeading: {
		fontSize: 24,
		fontWeight: "bold",
		textAlign: "center",
		marginVertical: 15,
		color: colors.textDark,
	},
	restaurantName: {
		fontSize: 18,
		fontWeight: "500",
		textAlign: "center",
		marginBottom: 15,
		color: colors.text,
	},
	errorText: {
		color: colors.danger || "red",
		textAlign: "center",
		marginVertical: 10,
	},
	emptyText: {
		color: colors.textLight || "#6c757d",
		fontSize: 16,
		textAlign: "center",
		marginTop: 50,
	},
	pipList: { paddingHorizontal: 10 },
	pipSection: {
		marginBottom: 15,
		backgroundColor: "#ffffff",
		borderRadius: 8,
		padding: 12,
	},
	pipName: {
		fontSize: 17,
		fontWeight: "bold",
		marginBottom: 10,
		color: colors.primary,
	},
	pipItemsContainer: { marginBottom: 10 },
	basketItemRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
	},
	itemDetails: { flex: 1, marginRight: 10 },
	dishName: { fontSize: 15, fontWeight: "500", color: colors.textDark },
	specialInstructions: {
		fontSize: 12,
		color: colors.textLight,
		fontStyle: "italic",
		marginTop: 3,
	},
	itemControlsAndPrice: { flexDirection: "row", alignItems: "center" },
	quantityControls: {
		flexDirection: "row",
		alignItems: "center",
		marginRight: 10,
	},
	quantityButton: { marginHorizontal: -5 }, // Reduce spacing around icon buttons
	quantity: { marginHorizontal: 5, fontSize: 16, fontWeight: "500" },
	itemPrice: { fontWeight: "bold", fontSize: 15 },
	itemQuantitySent: { fontSize: 15, color: colors.textLight, marginRight: 10 }, // Style for 'x Qty' when sent
	sentItemVisual: { opacity: 0.6 }, // Fade sent items slightly
	sentItemText: { textDecorationLine: "line-through", color: colors.textLight },
	pipTotalContainer: {
		marginTop: 10,
		paddingTop: 5,
		borderTopWidth: 1,
		borderTopColor: colors.lightGray || "#eee",
		alignItems: "flex-end",
	},
	pipTotalLabel: { fontSize: 14, color: colors.text },
	pipTotalAmount: { fontSize: 15, fontWeight: "bold" },
	pipDivider: { marginTop: 5 },
	summarySection: {
		margin: 10,
		marginTop: 20,
		padding: 15,
		backgroundColor: "#fff",
		borderRadius: 8,
	},
	summaryTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
		color: colors.primary,
	},
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 4,
	},
	summaryLabel: { fontSize: 15, color: colors.textDark },
	summaryAmount: { fontSize: 15, fontWeight: "500" },
	originalPrice: {
		fontSize: 15,
		textDecorationLine: "line-through",
		color: colors.textLight,
	},
	discountAmount: {
		fontSize: 15,
		color: colors.warning || "#E85D04",
		fontWeight: "500",
	},
	grandTotalRow: {
		marginTop: 10,
		paddingTop: 10,
		borderTopWidth: 1.5,
		borderTopColor: colors.primary,
	},
	grandTotalLabel: { fontSize: 16, fontWeight: "bold", color: colors.primary },
	grandTotalAmount: { fontSize: 16, fontWeight: "bold", color: colors.primary },
	disclaimerText: {
		fontSize: 12,
		color: colors.textLight,
		fontStyle: "italic",
		textAlign: "center",
		marginTop: 10,
	},
	buttonContainer: { paddingHorizontal: 10, marginTop: 10, marginBottom: 80 }, // Add bottom margin to avoid FAB overlap
	sendButtonBase: {
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
		marginVertical: 5,
	},
	sendButtonActive: { backgroundColor: colors.primary },
	sendButtonInactive: { backgroundColor: colors.mediumGray || "#cccccc" },
	sendButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
	messageText: {
		textAlign: "center",
		marginTop: 5,
		color: colors.textLight,
		fontSize: 13,
	},
	fab: {
		position: "absolute",
		margin: 16,
		right: 0,
		bottom: 0,
		backgroundColor: colors.success || "green",
	},

	actionContainer: {
		// Container for messages and send button
		paddingHorizontal: 10,
		paddingTop: 15,
		paddingBottom: 90, // Extra padding at bottom of list FOOTER to ensure FAB doesn't overlap button
	},
	warningMessage: {
		// Style for messages telling user what to do
		textAlign: "center",
		marginBottom: 10,
		color: colors.warning || "#E85D04", // Use a warning color
		fontSize: 14,
		fontWeight: "500",
	},
	successMessage: {
		// Style for the "Ready to checkout" message
		textAlign: "center",
		marginBottom: 10,
		color: colors.success || "green",
		fontSize: 14,
		fontWeight: "500",
	},
	sendButtonBase: {
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
		marginVertical: 5,
	},
	sendButtonActive: { backgroundColor: colors.primary },
	sendButtonInactive: { backgroundColor: colors.mediumGray || "#cccccc" },
	sendButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
	messageText: {
		textAlign: "center",
		marginTop: 5,
		color: colors.textLight,
		fontSize: 13,
	}, // Keep for other messages maybe
	fab: {
		position: "absolute",
		margin: 16,
		right: 0,
		bottom: 0,
		backgroundColor: colors.success || "green", // Active color
	},
	fabDisabled: {
		// Style to visually indicate disabled state
		backgroundColor: colors.mediumGray || "#cccccc",
		opacity: 0.7,
	},
	itemIconContainer: {
		// Style for the new icon container
		width: 30, // Fixed width for alignment
		alignItems: "center",
		justifyContent: "center",

		marginRight: 8, // Space between icon and item details
	},

	statusMessageContainer: {
		// Container for general status messages
		paddingHorizontal: 15,
		paddingVertical: 10,
		marginHorizontal: 10,
		marginBottom: 15,
		borderRadius: 8,
		flexDirection: "row",
		alignItems: "center",
	},
	warningBox: {
		// Specific style for the unsent items warning
		backgroundColor: colors.warningBackground || "#FFF3CD", // Light warning color
	},
	successBox: {
		// Specific style for the ready message
		backgroundColor: colors.successBackground || "#D4EDDA", // Light success color
	},
	infoBox: {
		// Style for other info messages
		backgroundColor: colors.infoBackground || "#D1ECF1", // Light info color
	},
	statusTextBase: {
		// Base text style for all messages
		fontSize: 14,
		marginLeft: 10,
		flex: 1, // Allow text to wrap
	},
	warningText: {
		color: colors.warningText || "#856404", // Darker warning color
		fontWeight: "500",
	},
	successText: {
		color: colors.successText || "#155724", // Darker success color
		fontWeight: "500",
	},
	infoText: {
		color: colors.infoText || "#0C5460", // Darker info color
	},
});

export default BasketScreen;
