import React, { useState, useEffect, useContext } from "react";
import { doc, getDoc, onSnapshot, Timestamp } from "firebase/firestore";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
} from "react-native";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import formatCurrency from "../../utils/currencyFormatter";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useRoute } from "@react-navigation/native";

const OrderHistoryDetailScreen = () => {
	const route = useRoute();
	const orderDocId = route.params?.orderDocId;

	const [orderDetails, setOrderDetails] = useState(null);
	const [restaurantName, setRestaurantName] = useState("Restaurant");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Fetch Restaurant Name (once orderDetails with restaurantId is available)
	useEffect(() => {
		let isMounted = true;
		if (orderDetails?.restaurantId) {
			const restRef = doc(db, "restaurants", orderDetails.restaurantId);
			getDoc(restRef)
				.then((docSnap) => {
					if (isMounted && docSnap.exists()) {
						setRestaurantName(docSnap.data().restaurantName || "Restaurant");
					} else if (isMounted) {
						console.warn(
							`Restaurant doc ${orderDetails.restaurantId} not found.`
						);
					}
				})
				.catch((err) => {
					console.error("Error fetching restaurant name:", err);
					if (isMounted) setRestaurantName("Restaurant"); // Use default on error
				});
		}
		return () => {
			isMounted = false;
		};
	}, [orderDetails?.restaurantId]); // Depend on restaurantId from orderDetails

	// Listen to the specific order document
	useEffect(() => {
		if (!orderDocId) {
			setError("No Order ID provided.");
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);

		const orderRef = doc(db, "orders", orderDocId);
		const unsubscribe = onSnapshot(
			orderRef,
			(docSnap) => {
				if (docSnap.exists()) {
					setOrderDetails({ id: docSnap.id, ...docSnap.data() });
				} else {
					setError("Order not found.");
					setOrderDetails(null);
				}
				setLoading(false);
			},
			(err) => {
				console.error("Error listening to order snapshot:", err);
				setError("Error fetching order details.");
				setLoading(false);
			}
		);
		return () => unsubscribe(); // Cleanup listener
	}, [orderDocId]);

	// --- Helper to render status ---
	const renderStatus = () => {
		const status = orderDetails?.paymentStatus || "Unknown";
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
					{error || "Could not load order details."}
				</Text>
			</View>
		);
	}

	const orderDate =
		orderDetails.timestamp instanceof Timestamp
			? orderDetails.timestamp.toDate()
			: new Date();

	return (
		<ScrollView style={styles.container}>
			{/* --- Header Info --- */}
			<View style={styles.headerSection}>
				<Text style={styles.restaurantTitle}>{restaurantName}</Text>
				<Text style={styles.orderInfoText}>
					Order ID: {orderDetails.orderId}
				</Text>
				<Text style={styles.orderInfoText}>
					Date: {orderDate.toLocaleDateString()}
					{orderDate.toLocaleTimeString()}
				</Text>
				{renderStatus()}
			</View>

			{/* --- Items --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Items Ordered</Text>
				{orderDetails.items && orderDetails.items.length > 0 ? (
					orderDetails.items.map((item, index) => (
						<View
							key={`${item.dish?.id || index}-${index}`}
							style={styles.itemRow}
						>
							<View style={styles.itemDetails}>
								<Text style={styles.itemName}>
									{item.quantity}x {item.dish?.name || "Unknown Item"}
								</Text>
								{/* Add modifier display if needed */}
								{item.specialInstructions && (
									<Text style={styles.itemInstructions}>
										Notes: {item.specialInstructions}
									</Text>
								)}
							</View>
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
					))
				) : (
					<Text style={styles.noDataText}>No items found for this order.</Text>
				)}
			</View>

			{/* --- Financial Summary --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Payment Summary</Text>
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Subtotal:</Text>
					<Text style={styles.amount}>
						{formatCurrency(orderDetails.subtotal)}
					</Text>
				</View>
				{/* Display discount calculated by webhook if available */}
				{orderDetails.totalDiscountApplied > 0 && (
					<View style={styles.summaryRow}>
						<Text style={styles.label}>Discounts:</Text>
						<Text style={[styles.amount, styles.discountAmount]}>
							-{formatCurrency(orderDetails.totalDiscountApplied)}
						</Text>
					</View>
				)}
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Gratuity:</Text>
					<Text style={styles.amount}>
						{formatCurrency(orderDetails.gratuity)}
					</Text>
				</View>
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Service Fee:</Text>
					<Text style={styles.amount}>
						{formatCurrency(orderDetails.platformFeeActual)}
					</Text>
					{/* Use actual fee collected */}
				</View>
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Sales Tax:</Text>
					<Text style={styles.amount}>
						{formatCurrency(orderDetails.taxActual)}
					</Text>
					{/* Use actual tax */}
				</View>
				<View style={[styles.summaryRow, styles.totalRow]}>
					<Text style={styles.totalLabel}>Total Charged:</Text>
					<Text style={styles.totalAmount}>
						{formatCurrency(orderDetails.totalPrice)}
					</Text>
					{/* Final total */}
				</View>
				{/* Optionally show fee waiver context */}
				{orderDetails.platformFeeWaived && (
					<View style={[styles.summaryRow, styles.waivedRow]}>
						<Text style={[styles.label, styles.lineThrough]}>
							Potential Fee:
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
						<Text style={styles.waiverText}>Waived</Text>
					</View>
				)}
			</View>

			{/* --- Server Tips (Optional if needed again) --- */}
			{orderDetails.serverTips && orderDetails.serverTips.length > 0 && (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Server Tips Breakdown</Text>
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
});

export default OrderHistoryDetailScreen;
