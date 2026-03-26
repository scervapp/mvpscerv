// screens/restaurant/ChefsQScreen.js
import React, { useEffect, useState, useContext, useRef, useMemo } from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
	Alert,
} from "react-native";

import moment from "moment";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

// --- Kitchen Ticket Component ---
const KitchenTicket = ({ order, onUpdateStatus, viewMode }) => {
	const { t, i18n } = useTranslation(); // Bring in i18n
	const currentLang = i18n.language?.substring(0, 2) || "en"; // Get active language
	const timeSince = moment(order.createdAt?.toDate()).fromNow();

	// Filter items based on the current view mode ('kitchen' or 'bar')
	const itemsToDisplay =
		order.items?.filter((item) => item.destination === viewMode) || [];

	if (itemsToDisplay.length === 0) {
		return null;
	}

	// Grab the specific status for THIS station (fallback to "new" if undefined)
	const currentStatus = order.stationStatuses?.[viewMode] || "new";

	const getStatusStyle = () => {
		if (currentStatus === "preparing")
			return {
				backgroundColor: colors.statusWarning + "30",
				borderColor: colors.statusWarning,
			};
		if (currentStatus === "ready")
			return {
				backgroundColor: colors.statusSuccess + "30",
				borderColor: colors.statusSuccess,
			};
		return {
			backgroundColor: colors.surfaceWhite,
			borderColor: colors.borderLight,
		};
	};

	return (
		<View style={[styles.ticketContainer, getStatusStyle()]}>
			<View style={styles.ticketHeader}>
				<View>
					<Text style={styles.ticketTable}>{order.table?.name || "Table"}</Text>
					<Text style={styles.ticketServer}>
						{t("server")}: {order.server?.name || "Staff"}
					</Text>
				</View>
				<Text style={styles.ticketTime}>{timeSince}</Text>
			</View>
			<View style={styles.ticketItems}>
				{itemsToDisplay.map((item, index) => (
					<View key={`${item.id}-${index}`} style={styles.ticketItemRow}>
						<Text style={styles.itemQuantity}>{item.quantity}x</Text>
						<View style={styles.itemDetails}>
							<Text style={styles.itemName}>{item.dishName}</Text>
							{item.orderedFor && item.orderedFor !== "Myself" && (
								<Text style={styles.itemFor}>
									{t("for")}: {item.orderedFor}
								</Text>
							)}
							{item.specialInstructions ? (
								<Text style={styles.itemInstructions}>
									"
									{typeof item.specialInstructions === "object"
										? item.specialInstructions[currentLang] ||
											item.specialInstructions.original ||
											item.specialInstructions.en ||
											""
										: item.specialInstructions}
									"
								</Text>
							) : null}
						</View>
					</View>
				))}
			</View>
			<View style={styles.ticketActions}>
				{currentStatus === "new" && (
					<TouchableOpacity
						style={[styles.actionButton, styles.preparingButton]}
						onPress={() => onUpdateStatus(order, "preparing", viewMode)}
					>
						<Text
							style={[styles.actionButtonText, { color: colors.statusWarning }]}
						>
							{t("start_preparing", "Start Preparing")}
						</Text>
					</TouchableOpacity>
				)}
				{currentStatus === "preparing" && (
					<TouchableOpacity
						style={[styles.actionButton, styles.readyButton]}
						onPress={() => onUpdateStatus(order, "ready", viewMode)}
					>
						<Text
							style={[styles.actionButtonText, { color: colors.statusSuccess }]}
						>
							{t("mark_as_ready", "Mark as Ready")}
						</Text>
					</TouchableOpacity>
				)}
			</View>
		</View>
	);
};

// --- Toggle Buttons ---
const ViewModeToggle = ({ viewMode, setViewMode }) => {
	const { t } = useTranslation();
	return (
		<View style={styles.toggleContainer}>
			<TouchableOpacity
				style={[
					styles.toggleButton,
					viewMode === "kitchen" && styles.toggleButtonActive,
				]}
				onPress={() => setViewMode("kitchen")}
			>
				<MaterialCommunityIcons
					name="chef-hat"
					size={20}
					color={viewMode === "kitchen" ? colors.primary : colors.textMedium}
				/>
				<Text
					style={[
						styles.toggleButtonText,
						viewMode === "kitchen" && styles.toggleButtonTextActive,
					]}
				>
					{t("kitchen", "Kitchen")}
				</Text>
			</TouchableOpacity>
			<TouchableOpacity
				style={[
					styles.toggleButton,
					viewMode === "bar" && styles.toggleButtonActive,
				]}
				onPress={() => setViewMode("bar")}
			>
				<MaterialCommunityIcons
					name="glass-cocktail"
					size={20}
					color={viewMode === "bar" ? colors.primary : colors.textMedium}
				/>
				<Text
					style={[
						styles.toggleButtonText,
						viewMode === "bar" && styles.toggleButtonTextActive,
					]}
				>
					{t("bar", "Bar")}
				</Text>
			</TouchableOpacity>
		</View>
	);
};

// --- Main Screen ---
const ChefsQScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [orders, setOrders] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const previousOrderCount = useRef(0);
	const [error, setError] = useState(null);
	const insets = useSafeAreaInsets();
	const { t } = useTranslation();

	const [viewMode, setViewMode] = useState("kitchen"); // 'kitchen' or 'bar'

	useEffect(() => {
		const restaurantId = currentUserData?.uid;

		if (!restaurantId) {
			if (!currentUserData) return;
			setError(t("your_user_profile_is_not_linked_to_a_restaurant"));
			setIsLoading(false);
			return;
		}

		// 🚨 NATIVE LISTENER SYNTAX WITH NEW overallStatus QUERY
		const unsubscribe = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.orderBy("createdAt", "desc")
			.onSnapshot(
				(querySnapshot) => {
					const ordersData = querySnapshot.docs.map((doc) => ({
						id: doc.id,
						...doc.data(),
					}));

					setOrders(ordersData);
					setIsLoading(false);
				},
				(err) => {
					console.error("ChefsQScreen snapshot error:", err);
					setError(t("could_not_fetch_orders", "Could not fetch orders"));
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [currentUserData?.uid, t]);

	const filteredOrders = useMemo(() => {
		if (!orders) return [];
		return orders.filter((order) => {
			// 1. Does it have items for this station?
			const hasItems =
				order.items &&
				order.items.some((item) => item.destination === viewMode);

			// 2. What is this specific station's status?
			const currentStatus = order.stationStatuses?.[viewMode] || "new";

			// 3. Only show the ticket if this station hasn't cleared it yet
			const isStationActive = ["new", "preparing", "ready"].includes(
				currentStatus,
			);

			return hasItems && isStationActive;
		});
	}, [orders, viewMode]);

	const headingText =
		viewMode === "kitchen"
			? t("chefs_q", "Chef's Queue")
			: t("bar_q", "Bar Queue");
	const emptyQueueText =
		viewMode === "kitchen"
			? t("the_kitchen_queue_is_clear", "The Kitchen queue is clear!")
			: t("the_bar_queue_is_clear", "The Bar queue is clear!");

	// 🚨 BULLETPROOF UPDATE FUNCTION
	const handleUpdateOrderStatus = async (order, newStatus, station) => {
		console.log(`[KDS] Tapped ${newStatus} for station: ${station}`);

		if (!order || !order.id) {
			console.error("[KDS] Error: 'order' object is missing or invalid.");
			return;
		}

		try {
			// 1. Update ONLY this station's status on the restaurant ticket
			console.log(`[KDS] Updating kitchen_orders doc: ${order.id}`);
			await db
				.collection("kitchen_orders")
				.doc(order.id)
				.update({
					[`stationStatuses.${station}`]: newStatus,
				});

			// 2. Real-Time Customer Sync!
			if (order.partyId) {
				console.log(`[KDS] Syncing to customer party: ${order.partyId}`);
				await db
					.collection("shared_baskets")
					.doc(order.partyId)
					.update({
						// 🚨 THE FIX: Use update() so dot-notation works!
						[`ticketStatuses.${order.id}.${station}`]: newStatus,
						lastKitchenUpdate: new Date().toISOString(),
					});
			} else {
				console.warn("[KDS] No partyId on this order. Skipping customer sync.");
			}

			console.log("[KDS] ✅ Status update complete!");
		} catch (error) {
			console.error(`[KDS] ❌ Error updating order ${order.id}:`, error);
			Alert.alert(
				t("error", "Error"),
				t("could_not_update_order_status", "Could not update order status"),
			);
		}
	};

	if (isLoading) {
		return (
			<View style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.centeredContainer}>
				<Text style={styles.emptyQueueText}>{error}</Text>
			</View>
		);
	}

	return (
		<View style={[styles.container, { paddingTop: insets.top }]}>
			<View style={styles.headerRow}>
				<Text style={styles.heading}>{headingText}</Text>
				<ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
			</View>

			{filteredOrders.length === 0 ? (
				<View style={styles.centeredContainer}>
					<Ionicons name="receipt-outline" size={60} color={colors.textLight} />
					<Text style={styles.emptyQueueText}>{emptyQueueText}</Text>
				</View>
			) : (
				<FlatList
					data={filteredOrders}
					renderItem={({ item }) => (
						<KitchenTicket
							order={item}
							onUpdateStatus={handleUpdateOrderStatus}
							viewMode={viewMode}
						/>
					)}
					keyExtractor={(item) => item.id}
					contentContainerStyle={styles.listContainer}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 15,
		marginBottom: 10,
	},
	heading: {
		fontSize: 28,
		fontWeight: "bold",
		color: colors.textDark,
	},
	toggleContainer: {
		flexDirection: "row",
		backgroundColor: colors.backgroundMedium,
		borderRadius: 20,
		padding: 4,
		paddingTop: 10,
	},
	toggleButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 6,
		paddingHorizontal: 16,
		borderRadius: 16,
	},
	toggleButtonActive: {
		backgroundColor: colors.surfaceWhite,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 3,
	},
	toggleButtonText: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.textMedium,
		marginLeft: 6,
	},
	toggleButtonTextActive: {
		color: colors.primary,
	},
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	emptyQueueText: {
		fontSize: 18,
		color: colors.textMedium,
		marginTop: 15,
		textAlign: "center",
	},
	listContainer: { paddingHorizontal: 10, paddingBottom: 10 },
	ticketContainer: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		padding: 15,
		marginBottom: 15,
		borderLeftWidth: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3,
		elevation: 4,
	},
	ticketHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		paddingBottom: 10,
		marginBottom: 10,
	},
	ticketTable: { fontSize: 22, fontWeight: "bold", color: colors.primary },
	ticketServer: { fontSize: 14, color: colors.textMedium },
	ticketTime: { fontSize: 14, fontWeight: "500", color: colors.textMedium },
	ticketItems: { marginBottom: 15 },
	ticketItemRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginVertical: 6,
	},
	itemQuantity: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginRight: 10,
		width: 30,
	},
	itemDetails: { flex: 1 },
	itemName: {
		fontSize: 17,
		fontWeight: "500",
		color: colors.textDark,
		lineHeight: 22,
	},
	itemFor: {
		fontSize: 14,
		color: colors.textMedium,
		fontStyle: "italic",
		lineHeight: 18,
	},
	itemInstructions: {
		fontSize: 14,
		color: colors.statusDanger,
		fontWeight: "500",
		marginTop: 3,
		lineHeight: 18,
	},
	ticketActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 10,
		marginTop: 5,
	},
	actionButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
	preparingButton: { backgroundColor: colors.statusWarning + "20" },
	readyButton: { backgroundColor: colors.statusSuccess + "20" },
	actionButtonText: { fontSize: 16, fontWeight: "bold" },
});

export default ChefsQScreen;
