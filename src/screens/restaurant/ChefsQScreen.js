import React, { useEffect, useState, useContext, useMemo } from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	Dimensions,
} from "react-native";

import moment from "moment";
import * as ScreenOrientation from "expo-screen-orientation"; // 🚨 NEW
import { useFocusEffect } from "@react-navigation/native"; // 🚨 NEW
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

const { width, height } = Dimensions.get("window");

const KitchenTicket = ({ order, onUpdateStatus, viewMode }) => {
	const { t, i18n } = useTranslation();
	const currentLang = i18n.language?.substring(0, 2) || "en";

	const waitTime = moment().diff(moment(order.createdAt?.toDate()), "minutes");
	const itemsToDisplay =
		order.items?.filter((item) => item.destination === viewMode) || [];

	if (itemsToDisplay.length === 0) return null;
	const currentStatus = order.stationStatuses?.[viewMode] || "new";

	const getUrgencyColor = () => {
		if (currentStatus === "ready") return colors.statusSuccess;
		if (waitTime > 20) return colors.statusDanger;
		if (waitTime > 10) return colors.statusWarning;
		return colors.primary;
	};

	return (
		<View
			style={[styles.ticketContainer, { borderTopColor: getUrgencyColor() }]}
		>
			<View style={styles.ticketHeader}>
				<View style={{ flex: 1 }}>
					<Text style={styles.ticketTable} numberOfLines={1}>
						{order.table?.name || "Table"}
					</Text>
					<Text style={styles.ticketServer} numberOfLines={1}>
						{order.server?.name || "Staff"}
					</Text>
				</View>
				<View
					style={[styles.timerBadge, { backgroundColor: getUrgencyColor() }]}
				>
					<Text style={styles.timerText}>{waitTime}m</Text>
				</View>
			</View>

			<View style={styles.ticketItems}>
				{itemsToDisplay.map((item, index) => (
					<View key={`${item.id}-${index}`} style={styles.ticketItemRow}>
						<Text style={styles.itemQuantity}>{item.quantity}x</Text>
						<View style={styles.itemDetails}>
							<Text style={styles.itemName} numberOfLines={2}>
								{item.dishName}
							</Text>

							{item.orderedFor && item.orderedFor !== "Myself" && (
								<Text style={styles.itemFor}>
									{t("for")}: {item.orderedFor}
								</Text>
							)}

							{item.specialInstructions ? (
								<Text style={styles.itemInstructions} numberOfLines={2}>
									"
									{typeof item.specialInstructions === "object"
										? item.specialInstructions[currentLang] ||
											item.specialInstructions.original
										: item.specialInstructions}
									"
								</Text>
							) : null}
						</View>
					</View>
				))}
			</View>

			<TouchableOpacity
				style={[
					styles.actionButton,
					currentStatus === "new" ? styles.preparingButton : styles.readyButton,
				]}
				onPress={() =>
					onUpdateStatus(
						order,
						currentStatus === "new" ? "preparing" : "ready",
						viewMode,
					)
				}
			>
				<Text
					style={[
						styles.actionButtonText,
						{ color: currentStatus === "new" ? colors.statusWarning : "#FFF" },
					]}
				>
					{currentStatus === "new" ? t("START") : t("DONE")}
				</Text>
			</TouchableOpacity>
		</View>
	);
};

const ChefsQScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [orders, setOrders] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [viewMode, setViewMode] = useState("kitchen");
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();

	// 🚨 FORCE HORIZONTAL ORIENTATION
	useFocusEffect(
		React.useCallback(() => {
			ScreenOrientation.lockAsync(
				ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
			);
			return () => {
				ScreenOrientation.lockAsync(
					ScreenOrientation.OrientationLock.PORTRAIT_UP,
				);
			};
		}, []),
	);

	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) return;

		const unsubscribe = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.orderBy("createdAt", "asc")
			.onSnapshot(
				(snap) => {
					if (!snap) return;
					setOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
					setIsLoading(false);
				},
				(err) => {
					console.error("KDS Error:", err);
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const filteredOrders = useMemo(() => {
		if (!orders || !Array.isArray(orders)) return [];
		return orders.filter((o) => {
			const hasItems = o.items?.some((i) => i.destination === viewMode);
			const status = o.stationStatuses?.[viewMode] || "new";
			return hasItems && ["new", "preparing"].includes(status);
		});
	}, [orders, viewMode]);

	const handleUpdateOrderStatus = async (order, newStatus, station) => {
		try {
			await db
				.collection("kitchen_orders")
				.doc(order.id)
				.update({
					[`stationStatuses.${station}`]: newStatus,
				});
			if (order.partyId) {
				await db
					.collection("shared_baskets")
					.doc(order.partyId)
					.update({
						[`ticketStatuses.${order.id}.${station}`]: newStatus,
						lastKitchenUpdate: new Date().toISOString(),
					});
			}
		} catch (e) {
			Alert.alert("Error", "Sync failed");
		}
	};

	if (isLoading)
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.summaryBar}>
				<View>
					<Text style={styles.statLabel}>
						{viewMode.toUpperCase()} {t("RAIL")}
					</Text>
					<Text style={styles.statValue}>
						{filteredOrders.length} {t("Tickets")}
					</Text>
				</View>
				<View style={styles.toggleGroup}>
					<TouchableOpacity
						onPress={() => setViewMode("kitchen")}
						style={[styles.tab, viewMode === "kitchen" && styles.activeTab]}
					>
						<MaterialCommunityIcons
							name="chef-hat"
							size={22}
							color={viewMode === "kitchen" ? "#FFF" : colors.textMedium}
						/>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={() => setViewMode("bar")}
						style={[styles.tab, viewMode === "bar" && styles.activeTab]}
					>
						<MaterialCommunityIcons
							name="glass-cocktail"
							size={22}
							color={viewMode === "bar" ? "#FFF" : colors.textMedium}
						/>
					</TouchableOpacity>
				</View>
			</View>

			<FlatList
				data={filteredOrders}
				numColumns={4} // 🚨 Professional Horizontal Rail
				key={viewMode + "-landscape"} // Forces re-render for grid
				renderItem={({ item }) => (
					<KitchenTicket
						order={item}
						onUpdateStatus={handleUpdateOrderStatus}
						viewMode={viewMode}
					/>
				)}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.grid}
				ListEmptyComponent={
					<View style={styles.centered}>
						<Ionicons
							name="checkmark-circle-outline"
							size={80}
							color="#334155"
						/>
						<Text style={styles.emptyText}>{t("Queue Clear")}</Text>
					</View>
				}
			/>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: "#0F172A" },
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		marginTop: 50,
	},
	summaryBar: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingVertical: 12,
		backgroundColor: "#FFF",
	},
	statLabel: {
		fontSize: 10,
		fontWeight: "900",
		color: "#94A3B8",
		letterSpacing: 1,
	},
	statValue: { fontSize: 20, fontWeight: "900", color: "#1E293B" },
	toggleGroup: {
		flexDirection: "row",
		backgroundColor: "#F1F5F9",
		borderRadius: 10,
		padding: 2,
	},
	tab: { padding: 8, borderRadius: 8, paddingHorizontal: 15 },
	activeTab: { backgroundColor: colors.primary },

	grid: { padding: 6 },
	ticketContainer: {
		// 🚨 Optimized for 4-column landscape rail
		width:
			(Dimensions.get("window").width > Dimensions.get("window").height
				? Dimensions.get("window").width
				: Dimensions.get("window").height) /
				4 -
			15,
		backgroundColor: "#FFF",
		borderRadius: 10,
		margin: 6,
		minHeight: 260,
		borderTopWidth: 8,
		justifyContent: "space-between",
		elevation: 4,
	},
	ticketHeader: {
		flexDirection: "row",
		padding: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#F1F5F9",
	},
	ticketTable: { fontSize: 18, fontWeight: "900", color: colors.primary },
	ticketServer: { fontSize: 11, color: "#94A3B8" },
	timerBadge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 5,
		height: 24,
		justifyContent: "center",
	},
	timerText: { color: "#FFF", fontWeight: "900", fontSize: 13 },

	ticketItems: { padding: 10, flex: 1 },
	ticketItemRow: {
		flexDirection: "row",
		marginBottom: 8,
		alignItems: "flex-start",
	},
	itemQuantity: {
		fontSize: 16,
		fontWeight: "900",
		color: "#1E293B",
		width: 22,
		marginRight: 4,
	},
	itemDetails: { flex: 1 },
	itemName: {
		fontSize: 14,
		fontWeight: "800",
		color: "#1E293B",
		textTransform: "uppercase",
		lineHeight: 17,
	},
	itemFor: { fontSize: 11, color: colors.textMedium, fontStyle: "italic" },
	itemInstructions: {
		color: colors.statusDanger,
		fontSize: 12,
		fontWeight: "700",
		marginTop: 2,
		lineHeight: 15,
	},

	actionButton: {
		padding: 14,
		alignItems: "center",
		borderBottomLeftRadius: 10,
		borderBottomRightRadius: 10,
	},
	preparingButton: { backgroundColor: colors.statusWarning + "15" },
	readyButton: { backgroundColor: colors.statusSuccess },
	actionButtonText: { fontWeight: "900", fontSize: 14 },
	emptyText: {
		color: "#475569",
		fontSize: 18,
		fontWeight: "700",
		marginTop: 10,
	},
});

export default ChefsQScreen;
