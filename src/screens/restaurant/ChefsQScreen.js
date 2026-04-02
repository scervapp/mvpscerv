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
	useWindowDimensions,
	StatusBar, // 🚨 NEW: For hiding the OS clock/battery
} from "react-native";

import moment from "moment";
import * as ScreenOrientation from "expo-screen-orientation";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

// --- Enterprise Kitchen Ticket ---
const KitchenTicket = React.memo(
	({ order, onUpdateStatus, viewMode, ticketWidth, currentTime }) => {
		// ... (Keep your exact KitchenTicket component code here)
		const { t, i18n } = useTranslation();
		const currentLang = i18n.language?.substring(0, 2) || "en";

		const waitTime = moment(currentTime).diff(
			moment(order.createdAt?.toDate()),
			"minutes",
		);
		const itemsToDisplay =
			order.items?.filter((item) => item.destination === viewMode) || [];
		if (itemsToDisplay.length === 0) return null;

		const currentStatus = order.stationStatuses?.[viewMode] || "new";

		const getUrgencyColor = () => {
			if (currentStatus === "ready") return colors.statusSuccess;
			if (waitTime >= 20) return colors.statusDanger;
			if (waitTime >= 10) return colors.statusWarning;
			return colors.primary;
		};

		const urgencyColor = getUrgencyColor();

		return (
			<View
				style={[
					styles.ticketContainer,
					{ width: ticketWidth, borderTopColor: urgencyColor },
				]}
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
					<View style={[styles.timerBadge, { backgroundColor: urgencyColor }]}>
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
									<Text style={styles.itemFor} numberOfLines={1}>
										{t("for")}: {item.orderedFor}
									</Text>
								)}
								{item.specialInstructions ? (
									<Text style={styles.itemInstructions} numberOfLines={2}>
										"
										{typeof item.specialInstructions === "object"
											? item.specialInstructions[currentLang] ||
												item.specialInstructions.original ||
												item.specialInstructions.en
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
						currentStatus === "new"
							? styles.preparingButton
							: styles.readyButton,
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
							{
								color: currentStatus === "new" ? colors.statusWarning : "#FFF",
							},
						]}
					>
						{currentStatus === "new" ? t("START") : t("DONE")}
					</Text>
				</TouchableOpacity>
			</View>
		);
	},
);

// --- Main KDS Screen ---
// 🚨 NEW: Notice we destructured `navigation` from the props to control the header/tabs
const ChefsQScreen = ({ navigation }) => {
	const { width } = useWindowDimensions();
	const { currentUserData } = useContext(AuthContext);
	const [orders, setOrders] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [viewMode, setViewMode] = useState("kitchen");
	const [currentTime, setCurrentTime] = useState(Date.now());

	// 🚨 NEW: Fullscreen State
	const [isFullscreen, setIsFullscreen] = useState(false);

	const { t } = useTranslation();
	const insets = useSafeAreaInsets();

	// 1. Force Landscape Layout
	useFocusEffect(
		React.useCallback(() => {
			ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
			return () => {
				ScreenOrientation.lockAsync(
					ScreenOrientation.OrientationLock.PORTRAIT_UP,
				);
				// 🚨 Failsafe: Turn everything back on if they leave the screen
				StatusBar.setHidden(false);
				navigation.setOptions({ headerShown: true });
				navigation
					.getParent()
					?.setOptions({ tabBarStyle: { display: "flex" } });
			};
		}, [navigation]),
	);

	// 🚨 2. The Fullscreen Controller
	useEffect(() => {
		// Hide OS Status Bar
		StatusBar.setHidden(isFullscreen);

		// Hide React Navigation Header & Bottom Tabs
		// Note: Depending on your React Navigation version, tabBarStyle goes directly on setOptions
		navigation.setOptions({
			headerShown: !isFullscreen,
			tabBarStyle: { display: isFullscreen ? "none" : "flex" },
		});

		// Failsafe for nested navigators
		const parentNav = navigation.getParent();
		if (parentNav) {
			parentNav.setOptions({
				tabBarStyle: { display: isFullscreen ? "none" : "flex" },
			});
		}
	}, [isFullscreen, navigation]);

	// 3. Live Timer Engine
	useEffect(() => {
		const timerInterval = setInterval(() => setCurrentTime(Date.now()), 60000);
		return () => clearInterval(timerInterval);
	}, []);

	// 4. Mathematical Grid
	const numColumns = Math.max(1, Math.floor(width / 260));
	const ticketWidth = width / numColumns - 16;

	// 5. Firestore Sync
	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) return;

		const unsubscribe = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.orderBy("createdAt", "asc")
			.onSnapshot((snap) => {
				if (!snap) return;
				setOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
				setIsLoading(false);
			});
		return () => unsubscribe();
	}, [currentUserData?.uid]);

	// 6. Client Filtering
	const filteredOrders = useMemo(() => {
		if (!orders || !Array.isArray(orders)) return [];
		return orders.filter((o) => {
			const hasItems = o.items?.some((i) => i.destination === viewMode);
			const status = o.stationStatuses?.[viewMode] || "new";
			return hasItems && ["new", "preparing"].includes(status);
		});
	}, [orders, viewMode]);

	// 7. Action Logic
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
			Alert.alert("Error", "Update failed");
		}
	};

	if (isLoading)
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);

	return (
		// 🚨 Note: Adjusted SafeAreaView padding so it looks right in fullscreen
		<SafeAreaView
			style={[
				styles.container,
				isFullscreen && { paddingTop: 0, paddingBottom: 0 },
			]}
		>
			{/* 🚨 2. The Floating Exit Button (Only shows in Fullscreen) */}
			{isFullscreen && (
				<TouchableOpacity
					style={styles.floatingExitBtn}
					onPress={() => setIsFullscreen(false)}
				>
					<MaterialCommunityIcons
						name="fullscreen-exit"
						size={28}
						color="#FFF"
					/>
				</TouchableOpacity>
			)}

			{/* 🚨 3. Hide Summary Bar when in Fullscreen */}
			{!isFullscreen && (
				<View style={styles.summaryBar}>
					<View>
						<Text style={styles.statLabel}>
							{viewMode.toUpperCase()} {t("RAIL")}
						</Text>
						<Text style={styles.statValue}>
							{filteredOrders.length} {t("Active")}
						</Text>
					</View>

					<View style={styles.controlsRow}>
						<TouchableOpacity
							onPress={() => setIsFullscreen(true)}
							style={styles.fullscreenBtn}
						>
							<MaterialCommunityIcons
								name="fullscreen"
								size={28}
								color="#64748B"
							/>
						</TouchableOpacity>

						<View style={styles.toggleGroup}>
							<TouchableOpacity
								onPress={() => setViewMode("kitchen")}
								style={[styles.tab, viewMode === "kitchen" && styles.activeTab]}
							>
								<MaterialCommunityIcons
									name="chef-hat"
									size={24}
									color={viewMode === "kitchen" ? "#FFF" : colors.textMedium}
								/>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={() => setViewMode("bar")}
								style={[styles.tab, viewMode === "bar" && styles.activeTab]}
							>
								<MaterialCommunityIcons
									name="glass-cocktail"
									size={24}
									color={viewMode === "bar" ? "#FFF" : colors.textMedium}
								/>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			)}

			<FlatList
				data={filteredOrders}
				numColumns={numColumns}
				key={`${numColumns}-${viewMode}`}
				renderItem={({ item }) => (
					<KitchenTicket
						order={item}
						onUpdateStatus={handleUpdateOrderStatus}
						viewMode={viewMode}
						ticketWidth={ticketWidth}
						currentTime={currentTime}
					/>
				)}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.grid}
				ListEmptyComponent={
					<View style={styles.emptyContainer}>
						<Ionicons name="checkmark-done-circle" size={80} color="#334155" />
						<Text style={styles.emptyText}>{t("Queue is Clear")}</Text>
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
		backgroundColor: "#0F172A",
	},
	summaryBar: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 24,
		paddingVertical: 14,
		backgroundColor: "#FFF",
	},
	statLabel: {
		fontSize: 11,
		fontWeight: "900",
		color: "#94A3B8",
		letterSpacing: 1.5,
	},
	statValue: {
		fontSize: 22,
		fontWeight: "900",
		color: "#1E293B",
		letterSpacing: -0.5,
	},

	// 🚨 NEW: Styling for the controls row
	controlsRow: { flexDirection: "row", alignItems: "center" },
	fullscreenBtn: {
		marginRight: 16,
		padding: 8,
		backgroundColor: "#F8FAFC",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E2E8F0",
	},

	toggleGroup: {
		flexDirection: "row",
		backgroundColor: "#F1F5F9",
		borderRadius: 12,
		padding: 4,
	},
	tab: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
	activeTab: { backgroundColor: colors.primary },

	grid: { padding: 8 },
	ticketContainer: {
		backgroundColor: "#FFF",
		borderRadius: 12,
		margin: 8,
		minHeight: 290,
		borderTopWidth: 8,
		justifyContent: "space-between",
		elevation: 6,
	},
	ticketHeader: {
		flexDirection: "row",
		padding: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#F1F5F9",
		alignItems: "center",
	},
	ticketTable: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.primary,
		letterSpacing: -0.5,
	},
	ticketServer: { fontSize: 12, color: "#94A3B8", fontWeight: "600" },
	timerBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
		justifyContent: "center",
	},
	timerText: { color: "#FFF", fontWeight: "900", fontSize: 14 },
	ticketItems: { padding: 12, flex: 1 },
	ticketItemRow: {
		flexDirection: "row",
		marginBottom: 12,
		alignItems: "flex-start",
	},
	itemQuantity: {
		fontSize: 18,
		fontWeight: "900",
		color: "#1E293B",
		width: 28,
		marginRight: 4,
	},
	itemDetails: { flex: 1 },
	itemName: {
		fontSize: 15,
		fontWeight: "800",
		color: "#1E293B",
		textTransform: "uppercase",
		lineHeight: 18,
	},
	itemFor: {
		fontSize: 12,
		color: colors.textMedium,
		fontStyle: "italic",
		marginTop: 2,
	},
	itemInstructions: {
		color: colors.statusDanger,
		fontSize: 12,
		fontWeight: "800",
		marginTop: 4,
		lineHeight: 16,
	},
	actionButton: {
		padding: 16,
		alignItems: "center",
		borderBottomLeftRadius: 12,
		borderBottomRightRadius: 12,
	},
	preparingButton: { backgroundColor: colors.statusWarning + "15" },
	readyButton: { backgroundColor: colors.statusSuccess },
	actionButtonText: { fontWeight: "900", fontSize: 16, letterSpacing: 1 },
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		marginTop: 100,
	},
	emptyText: {
		color: "#475569",
		fontSize: 20,
		fontWeight: "800",
		marginTop: 16,
	},
	floatingExitBtn: {
		position: "absolute",
		top: 20,
		right: 20,
		backgroundColor: "rgba(15, 23, 42, 0.75)", // Semi-transparent dark blue
		padding: 12,
		borderRadius: 50,
		zIndex: 999, // Ensures it sits above the tickets
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.2)",
	},
});

export default ChefsQScreen;
