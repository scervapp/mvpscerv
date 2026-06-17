import React, { useState, useEffect, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
	Alert,
	TouchableOpacity,
} from "react-native";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import formatCurrency from "../../utils/currencyFormatter";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useRoute } from "@react-navigation/native";
import { AirbnbRating, Rating } from "react-native-ratings";
import { httpsCallable } from "@react-native-firebase/functions";
import { Timestamp } from "@react-native-firebase/firestore";
import { useTranslation } from "react-i18next";

const OrderHistoryDetailScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const orderDocId = route.params?.orderDocId;

	const [orderDetails, setOrderDetails] = useState(null);
	const [restaurantName, setRestaurantName] = useState(t("restaurant"));
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [ratingStates, setRatingStates] = useState({}); // State to manage loading/error per item rating

	const submitDishRatingFunction = httpsCallable(functions, "submitDishRating");

	// Fetch Restaurant Name (once orderDetails with restaurantId is available)
	useEffect(() => {
		let isMounted = true;
		if (orderDetails?.restaurantId) {
			const restRef = db
				.collection("restaurants")
				.doc(orderDetails.restaurantId);
			restRef
				.get()
				.then((docSnap) => {
					if (isMounted && docSnap.exists()) {
						setRestaurantName(
							docSnap.data().restaurantName || t("restaurant")
						);
					} else if (isMounted) {
						console.warn(
							`Restaurant doc ${orderDetails.restaurantId} not found.`
						);
					}
				})
				.catch((err) => {
					console.error("Error fetching restaurant name:", err);
					if (isMounted) setRestaurantName(t("restaurant")); // Use default on error
				});
		}
		return () => {
			isMounted = false;
		};
	}, [orderDetails?.restaurantId]); // Depend on restaurantId from orderDetails

	// Listen to the specific order document
	useEffect(() => {
		if (!orderDocId) {
			setError(t("no_order_id_provided"));
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);

		const orderRef = db.collection("orders").doc(orderDocId);
		const unsubscribe = orderRef.onSnapshot(
			(docSnap) => {
				if (docSnap.exists()) {
					const data = docSnap.data();

					// Ensure items array exists and has the ratedByUserFlag (default is false if missing)
					const itemWithRatingFlag = (data.items || []).map((item) => ({
						...item,
						ratedByUser: item.ratedByUser === true, // Convert to boolean
					}));

					setOrderDetails({
						id: docSnap.id,
						...data,
						gratuity: data.gratuity ?? data.gratuityAmount ?? 0,
						platformFeeActual:
							data.platformFeeActual ??
							data.platformFee ??
							data.scervFee ??
							data.paymentTrace?.platformFeeActual ??
							0,
						taxActual: data.taxActual ?? data.taxAmount ?? 0,
						items: itemWithRatingFlag,
					});
					setRatingStates({});
				} else {
					setError(t("order_not_found"));
					setOrderDetails(null);
				}
				setLoading(false);
			},
			(err) => {
				console.error("Error listening to order snapshot:", err);
				setError(t("error_fetching_order_details"));
				setLoading(false);
			}
		);
		return () => unsubscribe(); // Cleanup listener
	}, [orderDocId]);

	// --- NEW: Function to handle rating submission ---
	const handleRatingSubmit = async (itemIndex, ratingValue) => {
		if (
			!orderDetails ||
			!orderDetails.items ||
			!orderDetails.items[itemIndex]
		) {
			console.error("Cannot submit rating: Order details or item missing.");
			return;
		}

		const item = orderDetails.items[itemIndex];
		const itemRatingKey = `${orderDocId}_${itemIndex}`; // Unique key for this item's rating state

		// Set loading state for this specific item
		setRatingStates((prev) => ({
			...prev,
			[itemRatingKey]: { loading: true, error: null },
		}));

		try {
			const dataToSend = {
				orderDocId: orderDocId,
				dishId: item.dish.id, // Make sure dish.id exists
				restaurantId: orderDetails.restaurantId,
				ratingValue: ratingValue,
				itemIndexInOrder: itemIndex, // Pass the index
				// comment: "Optional comment here", // Add if you implement comments
			};

			console.log("Submitting rating with data:", dataToSend);
			const result = await submitDishRatingFunction(dataToSend);

			if (result.data.success) {
				console.log("Rating submitted successfully:", result.data.ratingId);
				// Optimistic UI Update: Mark item as rated locally
				setOrderDetails((prevDetails) => {
					if (!prevDetails) return null;
					const updatedItems = [...prevDetails.items];
					if (updatedItems[itemIndex]) {
						// Check if item still exists
						updatedItems[itemIndex] = {
							...updatedItems[itemIndex],
							ratedByUser: true,
						};
					}
					return { ...prevDetails, items: updatedItems };
				});
				// Clear loading/error state for this item
				setRatingStates((prev) => ({
					...prev,
					[itemRatingKey]: { loading: false, error: null },
				}));
			} else {
				throw new Error(result.data.error || t("failed_to_submit_rating"));
			}
		} catch (error) {
			console.error("Error submitting rating:", error);
			Alert.alert(
				t("rating_error"),
				error.message || t("could_not_submit_rating")
			);
			// Set error state for this specific item
			setRatingStates((prev) => ({
				...prev,
				[itemRatingKey]: { loading: false, error: error.message },
			}));
		}
	};
	// --- END NEW FUNCTION ---

	// --- Helper to render status ---
	const renderStatus = () => {
		const status = orderDetails?.paymentStatus || t("unknown");
		let color = colors.textLight;
		let icon = "help-circle-outline";
		switch (status.toLowerCase()) {
			case "paid":
			case "confirmed":
				color = colors.success || "green";
				icon = "check-circle-outline";
				break;
			case "failed":
			case "cancelled":
				color = colors.danger || "red";
				icon = "close-circle-outline";
				break;
			case "pending":
			case "pending_payment":
			case "processing":
				color = colors.warning || "#ffc107";
				icon = "progress-clock";
				break;
		}
		return (
			<View style={styles.statusContainer}>
				<MaterialCommunityIcons name={icon} size={20} color={color} />
				<Text style={[styles.statusText, { color }]}>
					{status.charAt(0).toUpperCase() + status.slice(1)}
				</Text>
			</View>
		);
	};

	// --- Render Logic ---
	if (loading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (error || !orderDetails) {
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>
					{error || t("could_not_load_order_details")}
				</Text>
			</View>
		);
	}

	const orderDate =
		orderDetails.timestamp instanceof Timestamp
			? orderDetails.timestamp.toDate()
			: new Date();

	console.log("Items", orderDetails.items);

	return (
		<ScrollView style={styles.container}>
			{/* --- Header Info --- */}
			<View style={styles.headerSection}>
				<Text style={styles.restaurantTitle}>{restaurantName}</Text>
				<Text style={styles.orderInfoText}>
					{t("order_id")}: {orderDetails.orderId}
				</Text>
				<Text style={styles.orderInfoText}>
					{t("date")}: {orderDate.toLocaleDateString()}
					{orderDate.toLocaleTimeString()}
				</Text>
				{renderStatus()}
			</View>

			{/* --- Items --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>{t("items_ordered")}</Text>
				{orderDetails.items && orderDetails.items.length > 0 ? (
					orderDetails.items.map((item, index) => {
						const itemRatingKey = `${orderDocId}_${index}`; // Unique key for this item's rating}`
						const ratingState = ratingStates[itemRatingKey] || {
							loading: false,
							error: null,
						};

						return (
							<View
								key={`${item.dish?.id || index}-${index}`}
								style={styles.itemRow}
							>
								<View style={styles.itemDetails}>
									<Text style={styles.itemName}>
										{item.quantity}x{" "}
										{item.dishName || t("unknown_item")}
									</Text>
									{/* Add modifier display if needed */}
									{item.specialInstructions && (
										<Text style={styles.itemInstructions}>
											{t("notes")}: {item.specialInstructions}
										</Text>
									)}
								</View>

								<Text style={styles.itemPrice}>
									{formatCurrency(
										Math.round(
											item.discount
												? parseFloat(item.discountedPrice)
												: item.price || 0
										) * item.quantity
									)}
								</Text>

								{/* --- Rating Section (Now INSIDE the main returned View) --- */}
								{orderDetails.paymentStatus === "paid" && ( // Only show rating section if order is paid
									<View style={styles.ratingSection}>
										{ratingState.loading ? (
											<ActivityIndicator size="small" color={colors.primary} />
										) : ratingState.error ? (
											<Text style={styles.ratingErrorText}>
												{t("error")}: {ratingState.error}
											</Text>
										) : item.ratedByUser ? (
											<View style={styles.alreadyRatedContainer}>
												<MaterialCommunityIcons
													name="star-check"
													size={18}
													color={colors.success || "green"}
												/>
												<Text style={styles.alreadyRatedText}>
													{t("rated")}
												</Text>
											</View>
										) : (
											// Show AirbnbRating component if not rated and not loading/error
											<AirbnbRating
												count={5}
												defaultRating={0} // Start with 0 stars
												size={20} // Adjust size as needed
												showRating={false} // Hide the text rating below stars
												onFinishRating={(rating) =>
													handleRatingSubmit(index, rating)
												}
												starContainerStyle={styles.ratingStars}
											/>
										)}
									</View>
								)}
								{/* --- End Rating Section --- */}
							</View>
						);
					})
				) : (
					<Text style={styles.noDataText}>
						{t("no_items_found_for_this_order")}
					</Text>
				)}
			</View>

			{/* --- Financial Summary --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>{t("payment_summary")}</Text>
				<View style={styles.summaryRow}>
					<Text style={styles.label}>{t("subtotal")}:</Text>
					<Text style={styles.amount}>
						{formatCurrency(orderDetails.subtotal)}
					</Text>
				</View>
				{/* Display discount calculated by webhook if available */}
				{orderDetails.totalDiscountApplied > 0 && (
					<View style={styles.summaryRow}>
						<Text style={styles.label}>{t("discounts")}:</Text>
						<Text style={[styles.amount, styles.discountAmount]}>
							-{formatCurrency(orderDetails.totalDiscountApplied)}
						</Text>
					</View>
				)}
				<View style={styles.summaryRow}>
					<Text style={styles.label}>{t("gratuity")}:</Text>
					<Text style={styles.amount}>
						{formatCurrency(orderDetails.gratuity)}
					</Text>
				</View>
				<View style={styles.summaryRow}>
					<Text style={styles.label}>{t("service_fee")}:</Text>
					<Text style={styles.amount}>
						{formatCurrency(orderDetails.platformFeeActual)}
					</Text>
					{/* Use actual fee collected */}
				</View>
				<View style={styles.summaryRow}>
					<Text style={styles.label}>{t("sales_tax")}:</Text>
					<Text style={styles.amount}>
						{formatCurrency(orderDetails.taxActual)}
					</Text>
					{/* Use actual tax */}
				</View>
				<View style={[styles.summaryRow, styles.totalRow]}>
					<Text style={styles.totalLabel}>{t("total_charged")}:</Text>
					<Text style={styles.totalAmount}>
						{formatCurrency(orderDetails.totalPrice)}
					</Text>
					{/* Final total */}
				</View>
				{/* Optionally show fee waiver context */}
				{orderDetails.platformFeeWaived && (
					<View style={[styles.summaryRow, styles.waivedRow]}>
						<Text style={[styles.label, styles.lineThrough]}>
							{t("potential_fee")}:
						</Text>
						<Text style={[styles.amount, styles.lineThrough]}>
							(
							{formatCurrency(
								orderDetails.potentialPlatformFee || orderDetails.fee
							)}
							)
						</Text>
						<MaterialCommunityIcons
							name="tag-off-outline"
							size={16}
							color={colors.success || "green"}
							style={{ marginLeft: 5 }}
						/>
						<Text style={styles.waiverText}>{t("waived")}</Text>
					</View>
				)}
			</View>

			{/* --- Server Tips (Optional if needed again) --- */}
			{orderDetails.serverTips && orderDetails.serverTips.length > 0 && (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>{t("server_tips_breakdown")}</Text>
					{orderDetails.serverTips.map((tip, index) => (
						<View key={`${tip.serverName}-${index}`} style={styles.itemRow}>
							<Text style={styles.serverName}>{tip.serverName}</Text>
							<Text style={styles.serverTipsAmount}>
								{formatCurrency(tip.gratuityTotal)}
							</Text>
						</View>
					))}
				</View>
			)}
		</ScrollView>
	);
};

// --- Styles (Combine/Refine from previous examples) ---
const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background || "#f8f9fa" },
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	errorText: {
		color: colors.danger || "red",
		fontSize: 16,
		textAlign: "center",
	},
	noDataText: {
		fontStyle: "italic",
		color: colors.textLight || "#6c757d",
		paddingVertical: 10,
	},
	headerSection: {
		padding: 15,
		alignItems: "center",
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
		marginBottom: 15,
	},
	restaurantTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.primary || "#0056b3",
		marginBottom: 8,
	},
	orderInfoText: {
		fontSize: 14,
		color: colors.textLight || "#6c757d",
		marginBottom: 4,
	},
	statusContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 8,
		paddingVertical: 5,
		paddingHorizontal: 10,
		borderRadius: 15,
		backgroundColor: "#e9ecef",
	},
	statusText: { fontSize: 16, fontWeight: "bold", marginLeft: 8 },
	section: {
		marginBottom: 20,
		padding: 15,
		backgroundColor: "#ffffff",
		borderRadius: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 3,
		marginHorizontal: 10,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 12,
		color: colors.textDark || "#343a40",
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
		paddingBottom: 6,
	},
	itemRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		paddingVertical: 6,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#f0f0f0",
	},
	itemDetails: { flex: 1, marginRight: 10 },
	itemName: {
		fontSize: 15,
		color: colors.textDark || "#343a40",
		marginBottom: 2,
	},
	itemInstructions: {
		fontSize: 13,
		color: colors.textLight || "#6c757d",
		fontStyle: "italic",
	},
	itemPrice: {
		fontSize: 15,
		fontWeight: "500",
		color: colors.textDark || "#343a40",
	},
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
		paddingVertical: 3,
	},
	label: { fontSize: 15, color: colors.text || "#495057" },
	amount: { fontSize: 15, fontWeight: "500", color: colors.textDark },
	discountAmount: { color: colors.warning || "#E85D04" },
	subTotalRow: {
		marginTop: 8,
		paddingTop: 8,
		borderTopWidth: 1,
		borderTopColor: colors.lightGray || "#eee",
	},
	subTotalLabel: { fontSize: 16, fontWeight: "bold", color: colors.textDark },
	subTotalAmount: { fontSize: 16, fontWeight: "bold", color: colors.textDark },
	totalRow: {
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: 1.5,
		borderTopColor: colors.primary,
	},
	totalLabel: { fontSize: 17, fontWeight: "bold", color: colors.primary },
	totalAmount: { fontSize: 17, fontWeight: "bold", color: colors.primary },
	deductionLabel: { fontSize: 15, color: colors.danger || "#dc3545" },
	deductionAmount: {
		fontSize: 15,
		fontWeight: "500",
		color: colors.danger || "#dc3545",
	},
	waivedRow: { opacity: 0.8, alignItems: "center" },
	lineThrough: {
		textDecorationLine: "line-through",
		color: colors.textLight || "#6c757d",
	},
	waiverText: {
		fontSize: 13,
		color: colors.success || "green",
		fontWeight: "bold",
		marginLeft: 5,
	},
	serverName: { fontSize: 15 },
	serverTipsAmount: { fontSize: 15, fontWeight: "500" },
	netPayoutRow: {
		marginTop: 10,
		paddingTop: 10,
		borderTopWidth: 1.5,
		borderTopColor: colors.primary || "#0056b3",
	},
	netLabel: {
		fontSize: 17,
		fontWeight: "bold",
		color: colors.primary || "#0056b3",
	},
	netAmount: {
		fontSize: 17,
		fontWeight: "bold",
		color: colors.primary || "#0056b3",
	},

	// --- Rating Styles ---
	ratingSection: {
		marginTop: 4, // Space between item details and rating
		alignItems: "flex-start", // Align stars to the left
		minHeight: 30, // Ensure space even when loading/rated
		justifyContent: "center",
	},
	ratingStars: {
		// Style the container of the stars if needed (e.g., padding)
		// paddingVertical: 5,
	},
	alreadyRatedContainer: {
		flexDirection: "row",
		alignItems: "center",
		paddingLeft: 5, // Indent slightly
	},
	alreadyRatedText: {
		marginLeft: 5,
		color: colors.success || "green",
		fontSize: 14,
		fontStyle: "italic",
	},
	ratingErrorText: {
		color: colors.danger || "red",
		fontSize: 13,
		fontStyle: "italic",
		paddingLeft: 5,
	},
	itemContainer: {
		paddingVertical: 6,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#f0f0f0",
	},
});

export default OrderHistoryDetailScreen;
