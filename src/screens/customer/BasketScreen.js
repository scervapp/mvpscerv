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
import {
	AntDesign,
	FontAwesome5,
	MaterialCommunityIcons,
} from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import {
	Provider,
	Portal,
	FAB,
	Snackbar,
	IconButton,
	Divider,
} from "react-native-paper";
import { db, functions } from "../../config/firebase";

import {
	transformBasketData,
	useCheckInStatus,
} from "../../utils/customerUtils";
import { AuthContext } from "../../context/authContext";

import { useParty } from "../../context/customer/PartyContext";
import OrderItemCard from "../../components/customer/OrderItemCard";
import formatCurrency from "../../utils/currencyFormatter";
import { useTranslation } from "react-i18next";

const BasketScreen = ({ route, navigation }) => {
	const { t, i18n } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const { restaurant } = route.params;
	const {
		baskets,
		basketError,
		handleQuantityChange,
		updateItemStatus,
		sendIndividualOrderToKitchen,
		linkBasketToCheckIn,
	} = useBasket(); // Ensure updateItemStatus exists in context

	const { partyDetails, partyStatus } = useParty();

	// Determine mode from navigation params (default to "individual")
	const mode = route.params?.mode || "individual";

	const [displayItems, setDisplayItems] = useState([]);

	const [isProcessing, setIsProcessing] = useState(false); // Combined loading state
	const [showSnackbar, setShowSnackbar] = useState(false);
	const [snackbarMessage, setSnackbarMessage] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [updatingItemId, setUpdatingItemId] = useState(null); // Add this state
	const { checkInStatus, checkInObj } = useCheckInStatus(
		restaurant?.uid,
		currentUserData?.uid
	);

	const handleLocalQuantityChange = async (basketItemId, newQuantity) => {
		setUpdatingItemId(basketItemId); // Start loading indicator for this item
		try {
			await handleQuantityChange(restaurant.id, basketItemId, newQuantity);
		} catch (error) {
			// Error is already alerted in the context, but you could add more UI feedback here if needed
			console.log("BasketScreen: Failed to update quantity.");
		} finally {
			setUpdatingItemId(null); // Stop loading indicator for this item
		}
	};
	const [fees, setFees] = useState(0.05); // Default platform fee %

	// Get basket for the current restaurant
	const restaurantBasketItems = useMemo(() => {
		return baskets[restaurant?.id]?.items || [];
	}, [baskets, restaurant?.id]);

	// Fetch fee config
	useEffect(() => {
		const fetchFeeConfig = async () => {
			try {
				const docSnap = await db.collection("appConfig").doc("general").get();
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

	// This useEffect should correctly populate displayItems for "individual" mode
	useEffect(() => {
		setIsLoading(true);
		if (mode === "individual" && restaurant?.id && baskets) {
			const itemsFromContext = baskets[restaurant.id]?.items || [];

			setDisplayItems(itemsFromContext);
			setIsLoading(false);
		} else {
			// Handle other modes or missing data if this screen were to support them
			console.log(
				"BasketScreen: Not in individual mode or missing data for item display.",
				{ mode, restaurantId: restaurant?.id }
			);
			setDisplayItems([]);
			setIsLoading(false);
		}
	}, [mode, restaurant?.id, baskets]);

	const {
		subtotal,
		platformFeeEstimate,
		grandTotalEstimate,
		totalDiscount,
		originalSubtotal,
		pipDataForDisplay,
	} = useMemo(() => {
		// Guard clause no longer checks for restaurant.taxRate
		if (
			!restaurantBasketItems ||
			restaurantBasketItems.length === 0 ||
			typeof fees !== "number"
		) {
			return {
				subtotal: 0,
				platformFeeEstimate: 0,
				grandTotalEstimate: 0,
				totalDiscount: 0,
				originalSubtotal: 0,
				pipDataForDisplay: [],
			};
		}

		let calcOriginalSubtotal = 0;
		let calcSubtotalAfterDiscounts = 0;

		displayItems.forEach((item) => {
			const originalItemPrice = (Number(item.dish?.price) || 0) * 100;
			const quantity = Number(item.quantity) || 1;
			calcOriginalSubtotal += originalItemPrice * quantity;

			const finalItemPrice = item.discount
				? parseFloat(item.discountedPrice) * 100
				: originalItemPrice;
			calcSubtotalAfterDiscounts += Math.round(finalItemPrice) * quantity;
		});

		const calcTotalDiscount = calcOriginalSubtotal - calcSubtotalAfterDiscounts;

		// --- THIS IS THE FIX (PART 1) ---
		// The tax calculation is completely removed.
		const calcPlatformFeeEstimate = Math.round(
			calcSubtotalAfterDiscounts * fees
		);
		const calcGrandTotalEstimate =
			calcSubtotalAfterDiscounts + calcPlatformFeeEstimate;
		// --- END OF FIX ---

		return {
			subtotal: calcSubtotalAfterDiscounts,
			platformFeeEstimate: calcPlatformFeeEstimate,
			grandTotalEstimate: calcGrandTotalEstimate,
			totalDiscount: calcTotalDiscount,
			originalSubtotal: calcOriginalSubtotal,
			pipDataForDisplay: transformBasketData(
				displayItems,
				currentUserData?.uid,
				currentUserData?.firstName || t("your_items")
			),
		};
	}, [displayItems, fees, currentUserData]);

	// --- Actions ---
	const handleSendToChefsQ = async () => {
		if (checkInStatus !== "ACCEPTED" || !checkInObj?.id) {
			Alert.alert(
				t("not_seated"),
				t("you_must_be_seated_at_a_table_to_place_an_order")
			);
			return;
		}

		// Optional: Check for unsent items before starting
		const hasUnsentItems = (baskets[restaurant.id]?.items || []).some(
			(item) => !item.sentToChefQ
		);
		if (!hasUnsentItems) {
			Alert.alert(t("no_new_items"), t("all_your_items_have_already_been_sent"));
			return;
		}

		setIsProcessing(true); // Start loading indicator
		try {
			// --- STEP 1: Link the items to the check-in ---
			console.log(
				`BasketScreen: Linking basket items to checkInId: ${checkInObj.id}`
			);
			const linkResult = await linkBasketToCheckIn(
				restaurant.id,
				checkInObj.id
			);

			if (!linkResult.success) {
				// The context function will show an alert on failure
				throw new Error(t("failed_to_prepare_items_for_the_kitchen"));
			}

			// --- STEP 2: Send the (now linked) items to the kitchen ---
			console.log(
				"BasketScreen: Items linked. Now sending order to kitchen..."
			);
			await sendIndividualOrderToKitchen(
				checkInObj.id,
				checkInObj.table,
				checkInObj.server
			);
		} catch (error) {
			console.error("BasketScreen: Error during send to kitchen flow:", error);
			// Alerts are handled by the context functions, so we just log here.
		} finally {
			setIsProcessing(false); // Stop loading indicator
		}
	};

	// Memoize the check for unsent items
	const hasUnsentItems = useMemo(() => {
		return displayItems.some((item) => !item.sentToChefQ);
	}, [displayItems]);

	// Memoize the condition for allowing checkout
	// Checkout allowed ONLY IF checked in AND basket not empty AND NO items are unsent
	const canCheckout = useMemo(() => {
		if (mode === "party") {
			// Example: Allow party checkout only if checked in and no unsent items (for anyone)
			// return checkInStatus === "ACCEPTED" && displayItems.length > 0 && !hasUnsentItems;
			return false; // Keep disabled for now, or implement party checkout logic
		} else {
			// Individual mode logic
			return (
				checkInStatus === "ACCEPTED" &&
				displayItems.length > 0 && // FIX: Check displayItems length
				!hasUnsentItems
			);
		}
	}, [checkInStatus, displayItems, hasUnsentItems]);

	// Memoize the condition for allowing sending items to kitchen
	const canSendToKitchen = useMemo(() => {
		return checkInStatus === "ACCEPTED" && hasUnsentItems;
	}, [checkInStatus, hasUnsentItems]);

	const renderPipSection = ({ item: personData }) => (
		<View key={personData.personId} style={styles.pipSection}>
			<Text style={styles.pipName}>{personData.pipName}</Text>
			{personData.items.map((basketItem) => {
				// --- THE FIX IS HERE ---
				// We create a new, "flattened" item object to pass as a prop.
				// This matches the data structure that OrderItemCard expects.
				const itemForCard = {
					id: basketItem.id,
					dishName: basketItem.dish?.name, // From nested dish object
					price: basketItem.dish?.price, // From nested dish object
					quantity: basketItem.quantity,
					specialInstructions: basketItem.specialInstructions,
					orderedByPipName: basketItem.pip?.name, // For display within the card
					status: basketItem.sentToChefQ ? "sent" : "new", // Convert boolean to status string
				};

				return (
					<OrderItemCard
						key={basketItem.id}
						item={itemForCard}
						onQuantityChange={handleLocalQuantityChange}
						allowEdit={!basketItem.sentToChefQ}
						isSentToKitchen={basketItem.sentToChefQ}
						isUpdating={updatingItemId === basketItem.id}
					/>
				);
			})}

			<View style={styles.pipTotalContainer}>
				<Text style={styles.pipTotalLabel}>
					{t("subtotal_for", { name: personData.pipName })}
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
					<Text style={styles.mainHeading}>
						{mode === "party" ? t("table_order") : t("your_basket")}
					</Text>
					<Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>
					{basketError && <Text style={styles.errorText}>{basketError}</Text>}

					{/* --- NEW: Status Message Area --- */}
					{!isProcessing &&
						displayItems.length > 0 && ( // Only show messages if not processing and basket has items
							<>
								{checkInStatus !== "ACCEPTED" && (
									<View style={[styles.statusMessageContainer, styles.infoBox]}>
										<MaterialCommunityIcons
											name="information-outline"
											size={22}
											color={styles.infoText.color}
										/>
										<Text style={[styles.statusTextBase, styles.infoText]}>
											{t("please_ensure_you_are_checked_in_at_your_table_to_send_items_to_the_kitchen_or_checkout")}
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
											{t("you_have_new_items_please_press_send_new_items_to_kitchen_below_before_checking_out")}
										</Text>
									</View>
								)}
								{checkInStatus === "ACCEPTED" &&
									!hasUnsentItems &&
									displayItems.length > 0 && (
										<View
											style={[styles.statusMessageContainer, styles.successBox]}
										>
											<MaterialCommunityIcons
												name="check-circle-outline"
												size={22}
												color={styles.successText.color}
											/>
											<Text style={[styles.statusTextBase, styles.successText]}>
												{t("all_items_sent_to_the_kitchen_ready_to_checkout")}
											</Text>
										</View>
									)}
							</>
						)}

					{/* Loading Indicator or Basket List */}
					{isProcessing && displayItems.length === 0 ? ( // Show loader only if no items AND loading
						<View style={styles.centered}>
							<ActivityIndicator size="large" color={colors.primary} />
						</View>
					) : restaurantBasketItems.length === 0 ? (
						<View style={styles.centered}>
							<Text style={styles.emptyText}>{t("your_basket_is_empty")}</Text>
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
										<Text style={styles.summaryTitle}>{t("order_estimate")}</Text>
										{totalDiscount > 0 && (
											<View style={styles.summaryRow}>
												<Text style={styles.summaryLabel}>
													{t("original_subtotal")}
												</Text>
												<Text style={styles.originalPrice}>
													{formatCurrency(originalSubtotal)}
												</Text>
											</View>
										)}
										<View style={styles.summaryRow}>
											<Text style={styles.summaryLabel}>{t("subtotal")}</Text>
											<Text style={styles.summaryAmount}>
												{formatCurrency(subtotal)}
											</Text>
										</View>
										{totalDiscount > 0 && (
											<View style={styles.summaryRow}>
												<Text style={styles.summaryLabel}>{t("discounts")}</Text>
												<Text
													style={[styles.summaryAmount, styles.discountAmount]}
												>
													-{formatCurrency(totalDiscount)}
												</Text>
											</View>
										)}
										<View style={styles.summaryRow}>
											<Text style={styles.summaryLabel}>{t("platform_fee")}</Text>
											<Text style={styles.summaryAmount}>
												{formatCurrency(platformFeeEstimate)}
											</Text>
										</View>
										<View style={styles.summaryRow}></View>
										<View style={[styles.summaryRow, styles.grandTotalRow]}>
											<Text style={styles.grandTotalLabel}>
												{t("estimated_total_before_tip")}
											</Text>
											<Text style={styles.grandTotalAmount}>
												{formatCurrency(grandTotalEstimate)}
											</Text>
										</View>
										<Text style={styles.disclaimerText}>
											{t("final_tax_and_total_calculated_at_checkout_gratuity_added_on_next_screen")}
										</Text>
									</View>
									{/* --- Action Area --- */}
									<View style={styles.actionContainer}>
										{/* Contextual Message */}
										{checkInStatus !== "ACCEPTED" &&
											restaurantBasketItems.length > 0 && (
												<Text style={styles.warningMessage}>
													{t("please_ensure_you_are_checked_in_to_send_items_or_checkout")}
												</Text>
											)}
										{checkInStatus === "ACCEPTED" && hasUnsentItems && (
											<Text style={styles.warningMessage}>
												{t("send_new_items_to_the_kitchen_before_checking_out")}
											</Text>
										)}
										{checkInStatus === "ACCEPTED" &&
											!hasUnsentItems &&
											restaurantBasketItems.length > 0 && (
												<Text style={styles.successMessage}>
													{t("all_items_sent_ready_to_checkout")}
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
													{t("send_new_items_to_kitchen")}
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
					{checkInStatus === "ACCEPTED" && displayItems.length > 0 && (
						<FAB
							style={[styles.fab, !canCheckout && styles.fabDisabled]}
							icon="credit-card-check-outline"
							onPress={() =>
								navigation.navigate("CheckoutScreen", { restaurant, baskets })
							}
							visible={!isProcessing}
							disabled={!canCheckout || isProcessing}
							color={"white"} // Set icon color to white
						/>
					)}
				</Portal>

				<Snackbar
					visible={showSnackbar}
					onDismiss={() => setShowSnackbar(false)}
					duration={Snackbar.DURATION_SHORT} // Or DURATION_MEDIUM
					action={{ label: t("ok"), onPress: () => setShowSnackbar(false) }}
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
	quantity: {
		marginHorizontal: 5,
		fontSize: 16,
		fontWeight: "500",
		color: colors.textDark,
	},
	itemPrice: { fontWeight: "bold", fontSize: 15, color: colors.textDark },
	itemQuantitySent: {
		fontSize: 15,
		color: colors.textLight,
		marginRight: 10,
	}, // Style for 'x Qty' when sent
	sentItemVisual: { opacity: 0.6 }, // Fade sent items slightly
	sentItemText: {
		textDecorationLine: "line-through",
		color: colors.textLight,
	},
	pipTotalContainer: {
		marginTop: 10,
		paddingTop: 5,
		borderTopWidth: 1,
		borderTopColor: colors.lightGray || "#eee",
		alignItems: "flex-end",
	},
	pipTotalLabel: { fontSize: 14, color: colors.text },
	pipTotalAmount: { fontSize: 15, fontWeight: "bold", color: colors.textDark },
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
	summaryAmount: { fontSize: 15, fontWeight: "500", color: colors.textDark },
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
	grandTotalAmount: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.primary,
	},
	disclaimerText: {
		fontSize: 12,
		color: colors.textLight,
		fontStyle: "italic",
		textAlign: "center",
		marginTop: 10,
	},
	buttonContainer: {
		paddingHorizontal: 10,
		marginTop: 10,
		marginBottom: 80,
	}, // Add bottom margin to avoid FAB overlap
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
