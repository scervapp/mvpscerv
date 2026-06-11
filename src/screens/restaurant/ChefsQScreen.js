import React, {
	useEffect,
	useState,
	useContext,
	useMemo,
	useCallback,
} from "react";
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
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { useRestaurantData } from "../../context/restaurant/RestaurantDataContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "@react-native-firebase/functions";
import { formatCurrencyFromDollars } from "../../utils/currencyFormatter";
import RestaurantLockButton from "../../components/restaurant/RestaurantLockButton";

const itemBelongsToStation = (item, station) => {
	if (!item) return false;
	if (item.destination === station) return true;

	if (station === "kitchen") {
		return (
			Array.isArray(item.kitchenModifiers) && item.kitchenModifiers.length > 0
		);
	}

	if (station === "bar") {
		return Array.isArray(item.barModifiers) && item.barModifiers.length > 0;
	}

	return false;
};

const getStationItemStatus = (item, station, fallbackStatus = "new") =>
	item?.stationStatuses?.[station] || fallbackStatus || "new";

const getItemStatusFallback = (items, station, stationStatus = "new") => {
	const hasExplicitItemStatuses = items.some(
		(item) => item?.stationStatuses?.[station],
	);

	return hasExplicitItemStatuses ? "new" : stationStatus || "new";
};

const deriveStationStatusFromItems = (items, station, fallbackStatus = "new") => {
	if (!Array.isArray(items) || items.length === 0) {
		return fallbackStatus || "new";
	}

	const statuses = items.map((item) =>
		getStationItemStatus(item, station, fallbackStatus),
	);

	if (statuses.every((status) => status === "ready" || status === "served")) {
		return "ready";
	}
	if (
		statuses.some(
			(status) =>
				status === "preparing" || status === "ready" || status === "served",
		)
	) {
		return "preparing";
	}

	return "new";
};

const getStatusMeta = (status) => {
	switch (status) {
		case "served":
		case "ready":
			return {
				label: "READY",
				color: colors.statusSuccess,
				backgroundColor: "#ECFDF5",
				icon: "check-circle",
			};
		case "preparing":
			return {
				label: "WORKING",
				color: colors.statusWarning,
				backgroundColor: "#FFF7ED",
				icon: "fire",
			};
		default:
			return {
				label: "NEW",
				color: colors.primary,
				backgroundColor: "#EFF6FF",
				icon: "clock-outline",
			};
	}
};

const getSeatLabel = (item) =>
	item?.seatName ||
	item?.orderedForSeatName ||
	item?.orderedForName ||
	item?.orderedFor ||
	"";

// --- Enterprise Kitchen Ticket ---
const KitchenTicket = React.memo(
	({
		order,
		onUpdateStatus,
		onUpdateItemStatus,
		viewMode,
		ticketWidth,
		currentTime,
		updatingKeys,
	}) => {
		const { t, i18n } = useTranslation();
		const currentLang = i18n.language?.substring(0, 2) || "en";

		const getLocalizedText = (value) => {
			if (!value) return "";
			if (typeof value === "string") return value;

			return value[currentLang] || value.en || value.es || value.original || "";
		};
		const modifiersForThisStation = (item) => {
			if (viewMode === "kitchen") {
				if (
					Array.isArray(item.kitchenModifiers) &&
					item.kitchenModifiers.length > 0
				) {
					return item.kitchenModifiers;
				}
			} else if (viewMode === "bar") {
				if (Array.isArray(item.barModifiers) && item.barModifiers.length > 0) {
					return item.barModifiers;
				}
			}

			// Fallback for older tickets that only have selectedModifiers
			if (Array.isArray(item.selectedModifiers)) {
				return item.selectedModifiers.filter((modifier) => {
					const category = String(modifier?.category || "")
						.trim()
						.toLowerCase();

					const isDrink = [
						"beer",
						"wine",
						"cocktails",
						"spirits",
						"sodas",
						"drinks",
						"juices",
						"non-alcoholic drinks",
						"alcoholic drinks",
						"beverages",
						"coffee",
						"tea",
					].includes(category);

					return viewMode === "bar" ? isDrink : !isDrink;
				});
			}

			return [];
		};

		const waitTime = moment(currentTime).diff(
			moment(order.createdAt?.toDate()),
			"minutes",
		);
		const itemsToDisplay =
			order.items?.filter((item) => itemBelongsToStation(item, viewMode)) || [];
		if (itemsToDisplay.length === 0) return null;

		const stationStatus = order.stationStatuses?.[viewMode] || "new";
		const itemStatusFallback = getItemStatusFallback(
			itemsToDisplay,
			viewMode,
			stationStatus,
		);
		const currentStatus = deriveStationStatusFromItems(
			itemsToDisplay,
			viewMode,
			itemStatusFallback,
		);

		// 🚨 1. Determine if this is a hotel order
		const statusMeta = getStatusMeta(currentStatus);
		const openCount = itemsToDisplay.filter(
			(item) =>
				!["ready", "served"].includes(
					getStationItemStatus(item, viewMode, itemStatusFallback),
				),
		).length;
		const ticketActionKey = `${order.id}:${viewMode}:all`;
		const isTicketUpdating = updatingKeys[ticketActionKey];
		const isPickup = order.fulfillmentType === "hotel_pickup";

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
						<View style={styles.ticketMetaRow}>
							<Text style={styles.ticketServer} numberOfLines={1}>
								{order.server?.name || "Staff"}
							</Text>
							<View
								style={[
									styles.ticketStatusChip,
									{ backgroundColor: statusMeta.backgroundColor },
								]}
							>
								<MaterialCommunityIcons
									name={statusMeta.icon}
									size={12}
									color={statusMeta.color}
								/>
								<Text
									style={[
										styles.ticketStatusText,
										{ color: statusMeta.color },
									]}
								>
									{t(statusMeta.label, statusMeta.label)}
								</Text>
							</View>
						</View>

						{/* 🚨 2. Render the high-visibility TO-GO badge */}
						{isPickup && (
							<View style={styles.togoBadge}>
								<Ionicons name="bag-handle" size={12} color="#FFF" />
								<Text style={styles.togoText}>TO-GO / PICKUP</Text>
							</View>
						)}
					</View>
					<View style={[styles.timerBadge, { backgroundColor: urgencyColor }]}>
						<Text style={styles.timerText}>{waitTime}m</Text>
					</View>
				</View>

				<View style={styles.ticketItems}>
					{itemsToDisplay.map((item, index) => {
						const stationModifiers = modifiersForThisStation(item);
						const itemStatus = getStationItemStatus(
							item,
							viewMode,
							itemStatusFallback,
						);
						const itemStatusMeta = getStatusMeta(itemStatus);
						const isItemReady =
							itemStatus === "ready" || itemStatus === "served";
						const nextItemStatus =
							itemStatus === "new" ? "preparing" : "ready";
						const itemUpdateKey = `${order.id}:${viewMode}:${item.id}`;
						const isItemUpdating = updatingKeys[itemUpdateKey];
						const seatLabel = getSeatLabel(item);
						const shouldShowSeatLabel =
							seatLabel &&
							!["myself", "table"].includes(String(seatLabel).toLowerCase());
						const specialInstructions =
							item.specialInstructions &&
							typeof item.specialInstructions === "object"
								? item.specialInstructions[currentLang] ||
									item.specialInstructions.original ||
									item.specialInstructions.en ||
									""
								: item.specialInstructions || "";

						return (
							<View
								key={`${item.id}-${index}`}
								style={[
									styles.ticketItemRow,
									isItemReady && styles.ticketItemRowReady,
								]}
							>
								<Text style={styles.itemQuantity}>{item.quantity}x</Text>
								<View style={styles.itemDetails}>
									<View style={styles.itemTitleRow}>
										<Text style={styles.itemName} numberOfLines={2}>
											{item.dishName}
										</Text>
										<View
											style={[
												styles.itemStatusChip,
												{ backgroundColor: itemStatusMeta.backgroundColor },
											]}
										>
											<Text
												style={[
													styles.itemStatusChipText,
													{ color: itemStatusMeta.color },
												]}
											>
												{t(itemStatusMeta.label, itemStatusMeta.label)}
											</Text>
										</View>
									</View>

									{shouldShowSeatLabel && (
										<View style={styles.seatBadge}>
											<Ionicons name="person" size={12} color={colors.primary} />
											<Text style={styles.seatBadgeText} numberOfLines={1}>
												{seatLabel}
											</Text>
										</View>
									)}

									{stationModifiers.length > 0 && (
										<View style={styles.modifiersContainer}>
											{stationModifiers.map((modifier, modifierIndex) => (
												<Text
													key={`${modifier.optionId || modifier.name || "modifier"}-${modifierIndex}`}
													style={styles.modifierText}
												>
													- {getLocalizedText(modifier.name)}
													{Number(modifier.price || 0) > 0
														? ` (+${formatCurrencyFromDollars(modifier.price)})`
														: ""}
												</Text>
											))}
										</View>
									)}

									{specialInstructions ? (
										<Text style={styles.itemInstructions} numberOfLines={3}>
											"{specialInstructions}"
										</Text>
									) : null}
								</View>

								<TouchableOpacity
									disabled={isItemReady || isItemUpdating}
									style={[
										styles.itemStatusButton,
										itemStatus === "new" && styles.itemStartButton,
										itemStatus === "preparing" && styles.itemDoneButton,
										isItemReady && styles.itemReadyButton,
										isItemUpdating && styles.itemUpdatingButton,
									]}
									onPress={() =>
										onUpdateItemStatus(
											order,
											item,
											nextItemStatus,
											viewMode,
										)
									}
								>
									{isItemUpdating ? (
										<ActivityIndicator size="small" color={colors.primary} />
									) : (
										<Text
											style={[
												styles.itemStatusButtonText,
												itemStatus === "new" && styles.itemStartButtonText,
												isItemReady && styles.itemReadyButtonText,
											]}
											numberOfLines={1}
										>
											{isItemReady
												? t("READY", "READY")
												: itemStatus === "new"
													? t("START", "START")
													: t("READY", "READY")}
										</Text>
									)}
								</TouchableOpacity>
							</View>
						);
					})}
				</View>

				<TouchableOpacity
					disabled={isTicketUpdating}
					style={[
						styles.actionButton,
						currentStatus === "new"
							? styles.preparingButton
							: styles.readyButton,
						isTicketUpdating && styles.actionButtonDisabled,
					]}
					onPress={() =>
						onUpdateStatus(
							order,
							currentStatus === "new" ? "preparing" : "ready",
							viewMode,
						)
					}
				>
					{isTicketUpdating ? (
						<ActivityIndicator
							size="small"
							color={currentStatus === "new" ? colors.statusWarning : "#FFF"}
						/>
					) : (
						<Text
							style={[
								styles.actionButtonText,
								{
									color:
										currentStatus === "new" ? colors.statusWarning : "#FFF",
								},
							]}
						>
							{currentStatus === "new"
								? t("START TICKET", "START TICKET")
								: t("READY OPEN ITEMS", "READY OPEN ITEMS")}
							{"  "}
							<Text style={styles.actionButtonCount}>({openCount})</Text>
						</Text>
					)}
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
	const { activeSession } = useEmployeeSession();
	const [orders, setOrders] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [viewMode, setViewMode] = useState("kitchen");
	const [updatingKeys, setUpdatingKeys] = useState({});
	const [currentTime, setCurrentTime] = useState(Date.now());
	const { setKitchenQueueFocused } = useRestaurantData();
	const updateKitchenOrderStationStatusFunction = httpsCallable(
		functions,
		"updateKitchenOrderStationStatus",
	);

	// 🚨 NEW: Fullscreen State
	const [isFullscreen, setIsFullscreen] = useState(false);

	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const isFocused = useIsFocused();

	// 1. Force Landscape Layout
	useFocusEffect(
		React.useCallback(() => {
			console.log("[KDS ORIENTATION] ChefQ focused; locking landscape");
			setKitchenQueueFocused(true);
			ScreenOrientation.lockAsync(
				ScreenOrientation.OrientationLock.LANDSCAPE,
			).catch((error) => {
				console.error("ChefsQ: Failed to lock landscape:", error);
			});
			return () => {
				console.log("[KDS ORIENTATION] ChefQ blur cleanup; delaying portrait restore");
				setKitchenQueueFocused(false);
				setTimeout(() => {
					if (navigation.isFocused()) {
						console.log(
							"[KDS ORIENTATION] ChefQ refocused; portrait restore cancelled",
						);
						return;
					}

					console.log("[KDS ORIENTATION] ChefQ still blurred; restoring portrait");
					ScreenOrientation.lockAsync(
						ScreenOrientation.OrientationLock.PORTRAIT_UP,
					).catch((error) => {
						console.error("ChefsQ: Failed to restore portrait:", error);
					});
				}, 750);
				// 🚨 Failsafe: Turn everything back on if they leave the screen
				StatusBar.setHidden(false);
				navigation.setOptions({ headerShown: true });
				navigation
					.getParent()
					?.setOptions({ tabBarStyle: { display: "flex" } });
			};
		}, [navigation, setKitchenQueueFocused]),
	);

	// 🚨 2. The Fullscreen Controller
	useEffect(() => {
		if (!isFocused) return;

		console.log("[KDS ORIENTATION] ChefQ active; maintaining landscape", {
			orderCount: orders.length,
			viewMode,
		});
		ScreenOrientation.lockAsync(
			ScreenOrientation.OrientationLock.LANDSCAPE,
		).catch((error) => {
			console.error("ChefsQ: Failed to maintain landscape:", error);
		});
	}, [isFocused, orders.length, viewMode]);

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
	const numColumns = Math.max(1, Math.floor(width / 320));
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
				console.log("[KDS ORDERS] Snapshot received", {
					count: snap.docs.length,
				});
				setOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
				setIsLoading(false);
			});
		return () => unsubscribe();
	}, [currentUserData?.uid]);

	// 6. Client Filtering
	const filteredOrders = useMemo(() => {
		if (!orders || !Array.isArray(orders)) return [];
		return orders.filter((o) => {
			const stationItems =
				o.items?.filter((item) => itemBelongsToStation(item, viewMode)) || [];
			const status = o.stationStatuses?.[viewMode] || "new";
			const itemStatusFallback = getItemStatusFallback(
				stationItems,
				viewMode,
				status,
			);
			const hasOpenItems = stationItems.some(
				(item) =>
					getStationItemStatus(item, viewMode, itemStatusFallback) !== "ready",
			);
			return (
				stationItems.length > 0 &&
				hasOpenItems &&
				["new", "preparing"].includes(status)
			);
		});
	}, [orders, viewMode]);

	const runWithUpdatingKey = useCallback(async (key, updateFn) => {
		setUpdatingKeys((current) => ({ ...current, [key]: true }));
		try {
			await updateFn();
		} finally {
			setUpdatingKeys((current) => {
				const next = { ...current };
				delete next[key];
				return next;
			});
		}
	}, []);

	const staffName =
		activeSession?.name ||
		`${activeSession?.firstName || ""} ${
			activeSession?.lastName || ""
		}`.trim();

	const handleUpdateOrderStatus = useCallback(
		async (order, newStatus, station) => {
			const updateKey = `${order.id}:${station}:all`;
			try {
				await runWithUpdatingKey(updateKey, () =>
					updateKitchenOrderStationStatusFunction({
						orderId: order.id,
						station,
						status: newStatus,
						staffId: activeSession?.id || null,
						staffName,
					}),
				);
			} catch (e) {
				console.error("Update ticket failed:", e);
				Alert.alert("Error", "Update failed");
			}
		},
		[
			activeSession?.id,
			runWithUpdatingKey,
			staffName,
			updateKitchenOrderStationStatusFunction,
		],
	);

	const handleUpdateItemStatus = useCallback(
		async (order, item, newStatus, station) => {
			const updateKey = `${order.id}:${station}:${item.id}`;
			try {
				await runWithUpdatingKey(updateKey, () =>
					updateKitchenOrderStationStatusFunction({
						orderId: order.id,
						itemId: item.id,
						station,
						status: newStatus,
						staffId: activeSession?.id || null,
						staffName,
					}),
				);
			} catch (e) {
				console.error("Update item failed:", e);
				Alert.alert("Error", "Update failed");
			}
		},
		[
			activeSession?.id,
			runWithUpdatingKey,
			staffName,
			updateKitchenOrderStationStatusFunction,
		],
	);

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
				<View style={styles.floatingControlStack}>
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
					<RestaurantLockButton
						color="#FFF"
						style={styles.floatingLockBtn}
					/>
				</View>
			)}

			{/* 🚨 3. Hide Summary Bar when in Fullscreen */}
			{!isFullscreen && (
				<View style={styles.summaryBar}>
					<View>
						<Text style={styles.statLabel}>
							{viewMode === "kitchen"
								? t("Kitchen Q", "Kitchen Q")
								: t("Bar Q", "Bar Q")}
						</Text>
						<Text style={styles.statValue}>
							{filteredOrders.length} {t("Active")}
						</Text>
					</View>

					<View style={styles.controlsRow}>
						<RestaurantLockButton style={styles.summaryLockBtn} />
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
									size={22}
									color={viewMode === "kitchen" ? "#FFF" : colors.textMedium}
								/>
								<Text
									style={[
										styles.tabText,
										viewMode === "kitchen" && styles.activeTabText,
									]}
								>
									{t("Kitchen", "Kitchen")}
								</Text>
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
								<Text
									style={[
										styles.tabText,
										viewMode === "bar" && styles.activeTabText,
									]}
								>
									{t("Bar", "Bar")}
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			)}

			<FlatList
				data={filteredOrders}
				numColumns={numColumns}
				key={`${numColumns}-${viewMode}`}
				removeClippedSubviews
				initialNumToRender={12}
				maxToRenderPerBatch={12}
				windowSize={7}
				renderItem={({ item }) => (
					<KitchenTicket
						order={item}
						onUpdateStatus={handleUpdateOrderStatus}
						onUpdateItemStatus={handleUpdateItemStatus}
						viewMode={viewMode}
						ticketWidth={ticketWidth}
						currentTime={currentTime}
						updatingKeys={updatingKeys}
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
		letterSpacing: 0,
	},
	statValue: {
		fontSize: 22,
		fontWeight: "900",
		color: "#1E293B",
		letterSpacing: 0,
	},

	// 🚨 NEW: Styling for the controls row
	controlsRow: { flexDirection: "row", alignItems: "center" },
	summaryLockBtn: {
		marginRight: 8,
		backgroundColor: "#F8FAFC",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E2E8F0",
	},
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
	tab: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 10,
		minWidth: 112,
		justifyContent: "center",
	},
	activeTab: { backgroundColor: colors.primary },
	tabText: {
		color: colors.textMedium,
		fontSize: 13,
		fontWeight: "900",
		marginLeft: 6,
	},
	activeTabText: { color: "#FFF" },

	grid: { padding: 8 },
	ticketContainer: {
		backgroundColor: "#FFF",
		borderRadius: 8,
		margin: 8,
		minHeight: 270,
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
		letterSpacing: 0,
	},
	ticketServer: { fontSize: 12, color: "#94A3B8", fontWeight: "600" },
	ticketMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 2,
	},
	ticketStatusChip: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 999,
		paddingHorizontal: 7,
		paddingVertical: 3,
		marginLeft: 8,
	},
	ticketStatusText: {
		fontSize: 10,
		fontWeight: "900",
		marginLeft: 4,
	},
	timerBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
		justifyContent: "center",
	},
	timerText: { color: "#FFF", fontWeight: "900", fontSize: 14 },
	ticketItems: { padding: 10, flex: 1 },
	ticketItemRow: {
		flexDirection: "row",
		marginBottom: 10,
		alignItems: "center",
		borderBottomWidth: 1,
		borderBottomColor: "#F1F5F9",
		paddingBottom: 9,
	},
	ticketItemRowReady: {
		opacity: 0.6,
	},
	itemQuantity: {
		fontSize: 18,
		fontWeight: "900",
		color: "#1E293B",
		width: 28,
		marginRight: 4,
	},
	itemDetails: { flex: 1, minWidth: 0 },
	itemTitleRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	itemName: {
		flex: 1,
		fontSize: 15,
		fontWeight: "800",
		color: "#1E293B",
		textTransform: "uppercase",
		lineHeight: 18,
	},
	itemStatusChip: {
		borderRadius: 999,
		paddingHorizontal: 6,
		paddingVertical: 3,
		marginLeft: 8,
		marginTop: 1,
	},
	itemStatusChipText: {
		fontSize: 9,
		fontWeight: "900",
	},
	seatBadge: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		backgroundColor: "#EFF6FF",
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 3,
		marginTop: 4,
		maxWidth: "90%",
	},
	seatBadgeText: {
		fontSize: 11,
		color: colors.primary,
		fontWeight: "900",
		marginLeft: 4,
	},
	itemInstructions: {
		color: colors.statusDanger,
		fontSize: 12,
		fontWeight: "800",
		marginTop: 4,
		lineHeight: 16,
	},
	itemStatusButton: {
		height: 42,
		minWidth: 74,
		paddingHorizontal: 10,
		marginLeft: 8,
		borderRadius: 6,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},
	itemStartButton: {
		backgroundColor: colors.statusWarning + "15",
		borderColor: colors.statusWarning + "55",
	},
	itemDoneButton: {
		backgroundColor: colors.statusSuccess,
		borderColor: colors.statusSuccess,
	},
	itemReadyButton: {
		backgroundColor: "#F8FAFC",
		borderColor: "#CBD5E1",
	},
	itemUpdatingButton: {
		backgroundColor: "#F8FAFC",
		borderColor: "#CBD5E1",
	},
	itemStatusButtonText: {
		fontSize: 11,
		fontWeight: "900",
		color: "#FFF",
		letterSpacing: 0,
	},
	itemStartButtonText: {
		color: colors.statusWarning,
	},
	itemReadyButtonText: {
		color: "#64748B",
	},
	actionButton: {
		padding: 15,
		alignItems: "center",
		borderBottomLeftRadius: 8,
		borderBottomRightRadius: 8,
	},
	preparingButton: { backgroundColor: colors.statusWarning + "15" },
	readyButton: { backgroundColor: colors.statusSuccess },
	actionButtonDisabled: { opacity: 0.75 },
	actionButtonText: { fontWeight: "900", fontSize: 16, letterSpacing: 0 },
	actionButtonCount: { fontSize: 14, letterSpacing: 0 },
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
		backgroundColor: "rgba(15, 23, 42, 0.75)", // Semi-transparent dark blue
		padding: 12,
		borderRadius: 50,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.2)",
	},
	floatingControlStack: {
		position: "absolute",
		top: 20,
		right: 20,
		zIndex: 999,
		alignItems: "center",
	},
	floatingLockBtn: {
		backgroundColor: "rgba(15, 23, 42, 0.75)",
		borderRadius: 50,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.2)",
		marginTop: 10,
	},
	togoBadge: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.statusWarning, // High visibility orange
		paddingVertical: 3,
		paddingHorizontal: 8,
		borderRadius: 4,
		alignSelf: "flex-start",
		marginTop: 4,
	},
	togoText: {
		color: "#FFF",
		fontSize: 10,
		fontWeight: "bold",
		marginLeft: 4,
	},
	modifiersContainer: {
		marginTop: 4,
		marginBottom: 2,
	},
	modifierText: {
		fontSize: 12,
		color: "#475569",
		fontWeight: "700",
		lineHeight: 16,
		marginTop: 2,
	},
});

export default ChefsQScreen;
