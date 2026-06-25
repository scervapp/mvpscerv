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
		onReleasePacing,
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
		const isPickup = order.fulfillmentType === "hotel_pickup";
		const pacingStatus = order.pacingStatus || "fired";
		const isPacingHeld =
			pacingStatus === "scheduled" || pacingStatus === "held";
		const ticketActionKey = isPacingHeld
			? `${order.id}:pacing:release`
			: `${order.id}:${viewMode}:all`;
		const isTicketUpdating = updatingKeys[ticketActionKey];
		const fireAtDate = order.fireAt?.toDate ? order.fireAt.toDate() : null;
		const fireInMinutes = fireAtDate
			? moment(fireAtDate).diff(moment(currentTime), "minutes")
			: null;

		const getUrgencyColor = () => {
			if (isPacingHeld) return "#7C3AED";
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
									{
										backgroundColor: isPacingHeld
											? "#F5F3FF"
											: statusMeta.backgroundColor,
									},
								]}
							>
								<MaterialCommunityIcons
									name={isPacingHeld ? "timer-sand" : statusMeta.icon}
									size={12}
									color={isPacingHeld ? "#7C3AED" : statusMeta.color}
								/>
								<Text
									style={[
										styles.ticketStatusText,
										{ color: isPacingHeld ? "#7C3AED" : statusMeta.color },
									]}
								>
									{isPacingHeld
										? pacingStatus === "scheduled"
											? fireInMinutes !== null && fireInMinutes > 0
												? t("fires_in_minutes", {
														defaultValue: `FIRES IN ${fireInMinutes}M`,
														count: fireInMinutes,
													})
												: t("DUE TO FIRE", "DUE TO FIRE")
											: t("HELD", "HELD")
										: t(statusMeta.label, statusMeta.label)}
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
						<Text style={styles.timerText}>
							{isPacingHeld
								? fireInMinutes !== null && fireInMinutes > 0
									? `+${fireInMinutes}m`
									: "HOLD"
								: `${waitTime}m`}
						</Text>
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
									disabled={isPacingHeld || isItemReady || isItemUpdating}
									style={[
										styles.itemStatusButton,
										itemStatus === "new" && styles.itemStartButton,
										itemStatus === "preparing" && styles.itemDoneButton,
										isItemReady && styles.itemReadyButton,
										(isPacingHeld || isItemUpdating) && styles.itemUpdatingButton,
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
												: isPacingHeld
													? t("HELD", "HELD")
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
						isPacingHeld
							? styles.fireNowButton
							: currentStatus === "new"
							? styles.preparingButton
							: styles.readyButton,
						isTicketUpdating && styles.actionButtonDisabled,
					]}
					onPress={() =>
						isPacingHeld
							? onReleasePacing(order)
							: onUpdateStatus(
									order,
									currentStatus === "new" ? "preparing" : "ready",
									viewMode,
								)
					}
				>
					{isTicketUpdating ? (
						<ActivityIndicator
							size="small"
							color={
								isPacingHeld || currentStatus === "new"
									? colors.statusWarning
									: "#FFF"
							}
						/>
					) : (
						<Text
							style={[
								styles.actionButtonText,
								{
									color:
										isPacingHeld || currentStatus === "new"
											? colors.statusWarning
											: "#FFF",
								},
							]}
						>
							{isPacingHeld
								? t("FIRE NOW", "FIRE NOW")
								: currentStatus === "new"
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

const UpcomingTicket = React.memo(
	({ order, viewMode, currentTime, onReleasePacing, updatingKeys }) => {
		const { t, i18n } = useTranslation();
		const currentLang = i18n.language?.substring(0, 2) || "en";
		const pacingStatus = order.pacingStatus || "held";
		const fireAtDate = order.fireAt?.toDate ? order.fireAt.toDate() : null;
		const fireInMinutes = fireAtDate
			? moment(fireAtDate).diff(moment(currentTime), "minutes")
			: null;
		const isUpdating = updatingKeys[`${order.id}:pacing:release`];
		const itemsToDisplay =
			order.items?.filter((item) => itemBelongsToStation(item, viewMode)) || [];

		const getLocalizedText = (value) => {
			if (!value) return "";
			if (typeof value === "string") return value;
			return value[currentLang] || value.en || value.es || value.original || "";
		};

		return (
			<View style={styles.upcomingTicket}>
				<View style={styles.upcomingTicketHeader}>
					<View style={{ flex: 1, minWidth: 0 }}>
						<Text style={styles.upcomingTable} numberOfLines={1}>
							{order.table?.name || "Table"}
						</Text>
						<Text style={styles.upcomingMeta} numberOfLines={1}>
							{pacingStatus === "scheduled" && fireInMinutes !== null
								? fireInMinutes > 0
									? t("fires_in_minutes", {
											defaultValue: `Fires in ${fireInMinutes}m`,
											count: fireInMinutes,
										})
									: t("due_to_fire", "Due to fire")
								: t("manual_hold", "Manual hold")}
						</Text>
					</View>
					<View style={styles.upcomingPill}>
						<Text style={styles.upcomingPillText}>
							{pacingStatus === "scheduled"
								? t("upcoming", "Upcoming")
								: t("held", "Held")}
						</Text>
					</View>
				</View>

				{itemsToDisplay.slice(0, 3).map((item, index) => (
					<Text
						key={`${item.id || item.dishName}-${index}`}
						style={styles.upcomingItem}
						numberOfLines={1}
					>
						{item.quantity || 1}x {getLocalizedText(item.dishName) || item.dishName}
					</Text>
				))}
				{itemsToDisplay.length > 3 ? (
					<Text style={styles.upcomingMoreText}>
						+{itemsToDisplay.length - 3} {t("more", "more")}
					</Text>
				) : null}

				<TouchableOpacity
					disabled={isUpdating}
					style={[
						styles.upcomingFireButton,
						isUpdating && styles.actionButtonDisabled,
					]}
					onPress={() => onReleasePacing(order)}
				>
					{isUpdating ? (
						<ActivityIndicator size="small" color="#92400E" />
					) : (
						<Text style={styles.upcomingFireButtonText}>
							{t("fire_now", "Fire Now")}
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
	const [loadError, setLoadError] = useState(null);
	const [viewMode, setViewMode] = useState("kitchen");
	const [updatingKeys, setUpdatingKeys] = useState({});
	const [currentTime, setCurrentTime] = useState(Date.now());
	const { setKitchenQueueFocused } = useRestaurantData();
	const updateKitchenOrderStationStatusFunction = httpsCallable(
		functions,
		"updateKitchenOrderStationStatus",
	);
	const releaseKitchenOrderPacingFunction = httpsCallable(
		functions,
		"releaseKitchenOrderPacing",
	);

	// 🚨 NEW: Fullscreen State
	const [isFullscreen, setIsFullscreen] = useState(false);

	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const isFocused = useIsFocused();
	const restaurantId = useMemo(
		() => currentUserData?.restaurantId || currentUserData?.uid || null,
		[currentUserData?.restaurantId, currentUserData?.uid],
	);

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

	// 4. Firestore Sync
	useEffect(() => {
		if (!restaurantId) {
			setOrders([]);
			setLoadError(null);
			setIsLoading(false);
			return undefined;
		}

		let isMounted = true;
		setIsLoading(true);
		setLoadError(null);

		const unsubscribe = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.orderBy("createdAt", "asc")
			.onSnapshot(
				(snap) => {
					if (!isMounted || !snap) return;
					console.log("[KDS ORDERS] Snapshot received", {
						restaurantId,
						count: snap.docs.length,
					});
					setOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
					setLoadError(null);
					setIsLoading(false);
				},
				(error) => {
					console.error("ChefsQ: Error loading kitchen orders:", error);
					if (!isMounted) return;
					setOrders([]);
					setLoadError(
						error?.message ||
							t(
								"failed_to_load_kitchen_queue",
								"Failed to load kitchen queue.",
							),
					);
					setIsLoading(false);
				},
			);
		return () => {
			isMounted = false;
			unsubscribe();
		};
	}, [restaurantId, t]);

	// 5. Split the queue: active tickets stay in the main KDS, paced tickets sit in Upcoming.
	const stationOrderBuckets = useMemo(() => {
		const active = [];
		const upcoming = [];
		if (!orders || !Array.isArray(orders)) return { active, upcoming };

		orders.forEach((o) => {
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
			if (stationItems.length === 0 || !hasOpenItems) return;

			const pacingStatus = o.pacingStatus || "fired";
			if (pacingStatus === "scheduled" || pacingStatus === "held") {
				upcoming.push(o);
				return;
			}

			if (["new", "preparing"].includes(status)) {
				active.push(o);
			}
		});

		upcoming.sort((a, b) => {
			const aFireAt = a.fireAt?.toMillis ? a.fireAt.toMillis() : Number.MAX_SAFE_INTEGER;
			const bFireAt = b.fireAt?.toMillis ? b.fireAt.toMillis() : Number.MAX_SAFE_INTEGER;
			if (aFireAt !== bFireAt) return aFireAt - bFireAt;
			const aCreatedAt = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
			const bCreatedAt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
			return aCreatedAt - bCreatedAt;
		});

		return { active, upcoming };
	}, [orders, viewMode]);
	const filteredOrders = stationOrderBuckets.active;
	const upcomingOrders = stationOrderBuckets.upcoming;
	const hasUpcomingRail = upcomingOrders.length > 0;
	const upcomingRailWidth = hasUpcomingRail ? Math.min(280, Math.max(230, width * 0.24)) : 0;

	// 6. Mathematical Grid
	const activeGridWidth = Math.max(320, width - upcomingRailWidth);
	const numColumns = Math.max(1, Math.floor(activeGridWidth / 320));
	const ticketWidth = activeGridWidth / numColumns - 16;

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

	const applyLocalStationStatus = useCallback(
		(orderId, station, status, itemId = null) => {
			setOrders((currentOrders) =>
				currentOrders.map((order) => {
					if (order.id !== orderId) return order;

					const currentItems = Array.isArray(order.items) ? order.items : [];
					const updatedItems = currentItems.map((item) => {
						const shouldUpdateItem = itemId
							? item.id === itemId
							: itemBelongsToStation(item, station);

						if (!shouldUpdateItem) return item;

						return {
							...item,
							stationStatuses: {
								...(item.stationStatuses || {}),
								[station]: status,
							},
						};
					});

					const stationItems = updatedItems.filter((item) =>
						itemBelongsToStation(item, station),
					);
					const aggregateStatus = deriveStationStatusFromItems(
						stationItems,
						station,
						order.stationStatuses?.[station] || "new",
					);

					return {
						...order,
						items: updatedItems,
						stationStatuses: {
							...(order.stationStatuses || {}),
							[station]: aggregateStatus,
						},
					};
				}),
			);
		},
		[],
	);

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
				applyLocalStationStatus(order.id, station, newStatus);
			} catch (e) {
				console.error("Update ticket failed:", e);
				Alert.alert("Error", "Update failed");
			}
		},
		[
			activeSession?.id,
			applyLocalStationStatus,
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
				applyLocalStationStatus(order.id, station, newStatus, item.id);
			} catch (e) {
				console.error("Update item failed:", e);
				Alert.alert("Error", "Update failed");
			}
		},
		[
			activeSession?.id,
			applyLocalStationStatus,
			runWithUpdatingKey,
			staffName,
			updateKitchenOrderStationStatusFunction,
		],
	);

	const handleReleasePacing = useCallback(
		async (order) => {
			const updateKey = `${order.id}:pacing:release`;
			try {
				await runWithUpdatingKey(updateKey, () =>
					releaseKitchenOrderPacingFunction({
						orderId: order.id,
						staffId: activeSession?.id || null,
						staffName,
					}),
				);
			} catch (e) {
				console.error("Release paced ticket failed:", e);
				Alert.alert("Error", "Could not fire this held ticket.");
			}
		},
		[
			activeSession?.id,
			releaseKitchenOrderPacingFunction,
			runWithUpdatingKey,
			staffName,
		],
	);

	if (isLoading)
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>
					{t("loading_kitchen_queue", "Loading kitchen queue...")}
				</Text>
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

			<View style={styles.queueLayout}>
				<FlatList
					data={filteredOrders}
					numColumns={numColumns}
					key={`${numColumns}-${viewMode}-${hasUpcomingRail ? "rail" : "full"}`}
					extraData={`${currentTime}-${Object.keys(updatingKeys).join(",")}`}
					initialNumToRender={12}
					maxToRenderPerBatch={12}
					windowSize={7}
					renderItem={({ item }) => (
						<KitchenTicket
							order={item}
							onUpdateStatus={handleUpdateOrderStatus}
							onUpdateItemStatus={handleUpdateItemStatus}
							onReleasePacing={handleReleasePacing}
							viewMode={viewMode}
							ticketWidth={ticketWidth}
							currentTime={currentTime}
							updatingKeys={updatingKeys}
						/>
					)}
					keyExtractor={(item) => item.id}
					contentContainerStyle={styles.grid}
					style={styles.activeQueueList}
					ListEmptyComponent={
						<View style={styles.emptyContainer}>
							<Ionicons
								name={
									loadError
										? "alert-circle-outline"
										: "checkmark-done-circle"
								}
								size={80}
								color="#334155"
							/>
							<Text style={styles.emptyText}>
								{loadError || t("Queue is Clear")}
							</Text>
						</View>
					}
				/>

				{hasUpcomingRail && (
					<View style={[styles.upcomingRail, { width: upcomingRailWidth }]}>
						<View style={styles.upcomingRailHeader}>
							<Text style={styles.upcomingRailEyebrow}>
								{t("upcoming", "Upcoming")}
							</Text>
							<Text style={styles.upcomingRailCount}>
								{upcomingOrders.length}
							</Text>
						</View>
						<FlatList
							data={upcomingOrders}
							keyExtractor={(item) => item.id}
							extraData={`${currentTime}-${Object.keys(updatingKeys).join(",")}`}
							contentContainerStyle={styles.upcomingRailList}
							renderItem={({ item }) => (
								<UpcomingTicket
									order={item}
									viewMode={viewMode}
									currentTime={currentTime}
									onReleasePacing={handleReleasePacing}
									updatingKeys={updatingKeys}
								/>
							)}
						/>
					</View>
				)}
			</View>
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
	loadingText: {
		color: "#CBD5E1",
		fontSize: 15,
		fontWeight: "800",
		marginTop: 12,
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

	queueLayout: {
		flex: 1,
		flexDirection: "row",
	},
	activeQueueList: {
		flex: 1,
	},
	grid: { padding: 8 },
	upcomingRail: {
		backgroundColor: "#111827",
		borderLeftWidth: 3,
		borderLeftColor: "#F59E0B",
		paddingHorizontal: 10,
		paddingTop: 10,
	},
	upcomingRailHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 10,
		paddingBottom: 8,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255,255,255,0.10)",
	},
	upcomingRailEyebrow: {
		color: "#FCD34D",
		fontSize: 13,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	upcomingRailCount: {
		color: "#111827",
		backgroundColor: "#FCD34D",
		borderRadius: 999,
		overflow: "hidden",
		paddingHorizontal: 8,
		paddingVertical: 2,
		fontSize: 12,
		fontWeight: "900",
	},
	upcomingRailList: {
		paddingBottom: 20,
	},
	upcomingTicket: {
		backgroundColor: "#FEF3C7",
		borderRadius: 8,
		padding: 10,
		marginBottom: 10,
		borderWidth: 1,
		borderColor: "#F59E0B",
	},
	upcomingTicketHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginBottom: 8,
	},
	upcomingTable: {
		color: "#78350F",
		fontSize: 15,
		fontWeight: "900",
	},
	upcomingMeta: {
		color: "#92400E",
		fontSize: 11,
		fontWeight: "800",
		marginTop: 2,
	},
	upcomingPill: {
		backgroundColor: "#FFF7ED",
		borderRadius: 999,
		paddingHorizontal: 7,
		paddingVertical: 3,
		marginLeft: 6,
	},
	upcomingPillText: {
		color: "#92400E",
		fontSize: 9,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	upcomingItem: {
		color: "#1F2937",
		fontSize: 12,
		fontWeight: "800",
		marginTop: 3,
	},
	upcomingMoreText: {
		color: "#92400E",
		fontSize: 11,
		fontWeight: "800",
		marginTop: 4,
	},
	upcomingFireButton: {
		backgroundColor: "#FFF7ED",
		borderWidth: 1,
		borderColor: "#F59E0B",
		borderRadius: 6,
		paddingVertical: 9,
		alignItems: "center",
		marginTop: 10,
	},
	upcomingFireButtonText: {
		color: "#92400E",
		fontSize: 12,
		fontWeight: "900",
		textTransform: "uppercase",
	},
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
	fireNowButton: { backgroundColor: "#FEF3C7" },
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
