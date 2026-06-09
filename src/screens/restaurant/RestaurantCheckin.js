import React, {
	useEffect,
	useState,
	useContext,
	useCallback,
	useMemo,
} from "react";
import {
	View,
	Text,
	FlatList,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
	StyleSheet,
	RefreshControl,
	Alert,
} from "react-native";
import moment from "moment";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
	onSnapshot,
	collection,
	query,
	where,
	getDocs,
} from "@react-native-firebase/firestore";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";

import ServerAssignmentModal from "../../components/restaurant/ServerAssignmentModal";
import { getRestaurantPermissions } from "../../utils/restaurantPermissions";

const getPartyPriority = (party) => {
	const isDirty = party.status === "checkedOut";
	const needsServer =
		(!party.server || party.server.id === "unassigned") && !isDirty;
	const needsService = party.serviceRequested === true && !isDirty;
	const isCheckoutRequest = party.customerStatus === "ready_to_pay" && !isDirty;
	const hasFoodReady = Number(party.foodReadyCount || 0) > 0 && !isDirty;

	if (needsService) return 0;
	if (isCheckoutRequest) return 1;
	if (needsServer) return 2;
	if (hasFoodReady) return 3;
	if (!isDirty) return 4;
	return 5;
};

const ticketHasKitchenItems = (ticket) => {
	if (ticket?.stationStatuses?.kitchen) return true;
	if (!Array.isArray(ticket?.items)) return false;
	return ticket.items.some((item) => kitchenItemBelongsToKitchen(item));
};

const kitchenItemBelongsToKitchen = (item) => {
	if (!item) return false;
	if (item.destination === "kitchen") return true;
	return (
		Array.isArray(item.kitchenModifiers) && item.kitchenModifiers.length > 0
	);
};

const ticketKitchenStatus = (ticket) => {
	if (ticket?.stationStatuses?.kitchen) return ticket.stationStatuses.kitchen;
	if (ticketHasKitchenItems(ticket)) return ticket.status || "new";
	return null;
};

const getTicketKitchenItemStatus = (ticket, item) => {
	const ticketFallback = ticketKitchenStatus(ticket) || "new";
	return item?.stationStatuses?.kitchen || ticketFallback;
};

const buildKitchenReadyInfo = (tickets = []) => {
	let foodReadyCount = 0;
	let foodServedCount = 0;
	let foodItemCount = 0;
	const readyTicketIds = new Set();

	tickets.filter(ticketHasKitchenItems).forEach((ticket) => {
		const ticketItems = Array.isArray(ticket.items) ? ticket.items : [];
		ticketItems.forEach((item) => {
			if (!kitchenItemBelongsToKitchen(item)) return;

			const status = getTicketKitchenItemStatus(ticket, item);
			if (status === "served") {
				foodServedCount += 1;
				return;
			}

			foodItemCount += 1;
			if (status === "ready") {
				foodReadyCount += 1;
				readyTicketIds.add(ticket.id);
			}
		});
	});

	return {
		foodReadyCount,
		foodServedCount,
		foodItemCount,
		readyTicketIds: [...readyTicketIds],
		hasFoodReady: foodReadyCount > 0,
		allFoodReady: foodItemCount > 0 && foodReadyCount === foodItemCount,
	};
};

const RestaurantActiveTables = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();

	const { currentUserData } = useContext(AuthContext);
	const { activeSession, endSession } = useEmployeeSession();
	const permissions = getRestaurantPermissions(activeSession);
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;

	const [rawActiveParties, setRawActiveParties] = useState([]);
	const [kitchenTicketsByParty, setKitchenTicketsByParty] = useState({});
	const [isLoading, setIsLoading] = useState(true);
	const [isActionLoading, setIsActionLoading] = useState(false);
	const [runningFoodPartyId, setRunningFoodPartyId] = useState(null);
	const [error, setError] = useState(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const [isServerModalVisible, setIsServerModalVisible] = useState(false);
	const [selectedPartyForAssignment, setSelectedPartyForAssignment] =
		useState(null);
	const [restaurantServers, setRestaurantServers] = useState([]);

	const forceClearTableFunction = httpsCallable(functions, "forceClearTable");
	const markPartyTableCleanFunction = httpsCallable(
		functions,
		"markPartyTableClean",
	);
	const assignPartyServerFunction = httpsCallable(
		functions,
		"assignPartyServer",
	);
	const acknowledgePartyServiceRequestFunction = httpsCallable(
		functions,
		"acknowledgePartyServiceRequest",
	);
	const markReadyKitchenItemsServedFunction = httpsCallable(
		functions,
		"markReadyKitchenItemsServed",
	);

	// 1. Listen for Active & Checked-Out Parties
	useEffect(() => {
		if (!restaurantId) {
			setError(
				t(
					"your_user_profile_is_not_linked_to_a_restaurant",
					"Profile not linked to a restaurant.",
				),
			);
			setIsLoading(false);
			return;
		}

		// 🚨 UPGRADED QUERY: Now fetches both "active" and "checkedOut" (Dirty) tables
		const q = db
			.collection("parties")
			.where("restaurantId", "==", restaurantId)
			.where("status", "in", [
				"pending",
				"AWAITING_TABLE",
				"active",
				"checkedOut",
			])
			.orderBy("createdAt", "desc");

		const unsubscribe = onSnapshot(
			q,
			(querySnapshot) => {
				const partiesData = querySnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));

				let filteredParties = partiesData.filter(
					(party) => party.fulfillmentType !== "hotel_pickup",
				);

				// Restrict view if strictly a server
				if (
					activeSession?.role === "worker" &&
					activeSession?.jobTitle === "server"
				) {
					filteredParties = filteredParties.filter((party) => {
						const needsServer =
							!party.server || party?.server?.id === "unassigned";
						const isMyTable = party?.server?.id === activeSession.id;
						return needsServer || isMyTable;
					});
				}

				setRawActiveParties(filteredParties);
				setError(null);
				setIsLoading(false);
				setIsRefreshing(false);
			},
			(err) => {
				console.error("RestaurantActiveTables: Snapshot error:", err);
				setError(
					t(
						"failed_to_listen_for_active_tables",
						"Failed to load active tables.",
					),
				);
				setIsLoading(false);
				setIsRefreshing(false);
			},
		);

		return () => unsubscribe();
	}, [
		restaurantId,
		activeSession?.id,
		activeSession?.role,
		activeSession?.jobTitle,
		t,
	]);

	const activeParties = useMemo(
		() =>
			rawActiveParties
				.map((party) => ({
					...party,
					...buildKitchenReadyInfo(kitchenTicketsByParty[party.id] || []),
				}))
				.sort((a, b) => {
					const priorityDifference = getPartyPriority(a) - getPartyPriority(b);
					if (priorityDifference !== 0) return priorityDifference;

					const aCreatedAt = a.createdAt?.toMillis
						? a.createdAt.toMillis()
						: 0;
					const bCreatedAt = b.createdAt?.toMillis
						? b.createdAt.toMillis()
						: 0;
					return aCreatedAt - bCreatedAt;
				}),
		[rawActiveParties, kitchenTicketsByParty],
	);

	useEffect(() => {
		if (!restaurantId) {
			setKitchenTicketsByParty({});
			return;
		}

		const unsubscribe = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.onSnapshot(
				(snapshot) => {
					const nextTicketsByParty = {};

					snapshot.docs.forEach((doc) => {
						const ticket = { id: doc.id, ...doc.data() };
						if (!ticket.partyId || ticket.fulfillmentType === "hotel_pickup") {
							return;
						}
						if (!nextTicketsByParty[ticket.partyId]) {
							nextTicketsByParty[ticket.partyId] = [];
						}
						nextTicketsByParty[ticket.partyId].push(ticket);
					});

					setKitchenTicketsByParty(nextTicketsByParty);
				},
				(err) => {
					console.error("RestaurantActiveTables: Kitchen snapshot error:", err);
					setKitchenTicketsByParty({});
				},
			);

		return () => unsubscribe();
	}, [restaurantId]);

	// 2. Fetch Servers for Assignment Modal
	useEffect(() => {
		const fetchServers = async () => {
			if (!restaurantId) return;

			try {
				const staffQuery = query(
					collection(db, `restaurants/${restaurantId}/employees`),
					where("jobTitle", "==", "server"),
				);
				const staffSnapshot = await getDocs(staffQuery);
				const staffList = staffSnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setRestaurantServers(staffList);
			} catch (err) {
				console.error("Error fetching staff:", err);
			}
		};
		fetchServers();
	}, [restaurantId]);

	const onRefresh = useCallback(() => {
		setIsRefreshing(true);
		setTimeout(() => setIsRefreshing(false), 1000);
	}, []);

	// 3. Table Tap
	const handleTableTap = (party) => {
		const isDirty = party.status === "checkedOut";

		// If it's dirty, don't open the POS menu, prompt to clean it
		if (isDirty) {
			handleClearTableAction(party);
			return;
		}

		const needsServer = !party.server || party.server.id === "unassigned";
		if (needsServer) {
			if (permissions.isServer) {
				executeServerAssignment(
					{
						id: activeSession?.id,
						name:
							activeSession?.name ||
							`${activeSession?.firstName || ""} ${
								activeSession?.lastName || ""
							}`.trim(),
					},
					party,
					true,
				);
				return;
			}
			setSelectedPartyForAssignment(party);
			setIsServerModalVisible(true);
		} else {
			navigation.navigate("ManagePartyScreen", { partyId: party.id });
		}
	};

	// 4. Assign Server
	const executeServerAssignment = async (
		selectedServer,
		partyOverride = selectedPartyForAssignment,
		openAfterAssign = false,
	) => {
		if (!partyOverride || !selectedServer) return;
		try {
			await assignPartyServerFunction({
				partyId: partyOverride.id,
				serverId: selectedServer.id,
				staffId: activeSession?.id || null,
				staffName:
					activeSession?.name ||
					`${activeSession?.firstName || ""} ${
						activeSession?.lastName || ""
					}`.trim(),
			});
			setIsServerModalVisible(false);
			setSelectedPartyForAssignment(null);
			if (openAfterAssign) {
				navigation.navigate("ManagePartyScreen", { partyId: partyOverride.id });
			}
		} catch (err) {
			console.error("Error assigning server:", err);
			Alert.alert("Error", "Could not assign server to this table.");
		}
	};

	// 5. Acknowledge Service
	const handleAcknowledge = async (partyId) => {
		try {
			await acknowledgePartyServiceRequestFunction({
				partyId,
				staffId: activeSession?.id || null,
				staffName:
					activeSession?.name ||
					`${activeSession?.firstName || ""} ${
						activeSession?.lastName || ""
					}`.trim(),
			});
		} catch (error) {
			console.error("Error clearing service request:", error);
			Alert.alert(
				t("error", "Error"),
				t("could_not_clear_request", "Could not clear request."),
			);
		}
	};

	const handleRunFood = async (party) => {
		const readyTicketIds = Array.isArray(party.readyTicketIds)
			? party.readyTicketIds
			: [];
		if (readyTicketIds.length === 0) return;

		setRunningFoodPartyId(party.id);
		try {
			const staffName =
				activeSession?.name ||
				`${activeSession?.firstName || ""} ${
					activeSession?.lastName || ""
				}`.trim();

			await markReadyKitchenItemsServedFunction({
				partyId: party.id,
				ticketIds: readyTicketIds,
				staffId: activeSession?.id || null,
				staffName,
			});
		} catch (error) {
			console.error("Error marking food as run:", error);
			Alert.alert(
				t("error", "Error"),
				t("could_not_mark_food_served", "Could not mark food as served."),
			);
		} finally {
			setRunningFoodPartyId(null);
		}
	};

	// 6. Clear / Clean Table (Smart Handler)
	const handleClearTableAction = (party) => {
		const isDirty = party.status === "checkedOut";
		const title = isDirty
			? t("clean_table", "Clean Table")
			: t("clear_table", "Clear Table");
		const message = isDirty
			? t("confirm_clean", "Mark this table as clean and ready for new guests?")
			: `${t("this_will_clear_all_data_for", "This will close out and clear")} ${party.table?.name || "this table"}. ${t("are_you_sure", "Are you sure?")}`;

		Alert.alert(title, message, [
			{ text: t("cancel", "Cancel"), style: "cancel" },
			{
				text: isDirty
					? t("mark_clean", "Mark Clean")
					: t("confirm_clear", "Clear Table"),
				style: isDirty ? "default" : "destructive",
				onPress: async () => {
					setIsActionLoading(true);
					try {
						const restaurantId =
							currentUserData?.restaurantId || currentUserData?.uid;
						const tableId = party.table?.id || party.tableId;
						const customerId = party.hostUserId || party.currentCustomerId;

						// 🚨 1. Use YOUR utility to free up the physical table on the floor plan
						const staffName =
							activeSession?.name ||
							`${activeSession?.firstName || ""} ${
								activeSession?.lastName || ""
							}`.trim();

						if (isDirty) {
							await markPartyTableCleanFunction({
								partyId: party.id,
								staffId: activeSession?.id || null,
								staffName,
							});
						} else {
							await forceClearTableFunction({
								restaurantId,
								tableId,
								checkInId: party.checkInId || party.currentCheckInId,
								customerId,
								partyId: party.id,
								staffId: activeSession?.id || null,
								staffName,
							});
						}

						// 🚨 2. Mark the Party as "completed" so it disappears from this screen

						// 🚨 3. Free the customer's app (if they aren't a walk-in)
					} catch (error) {
						console.error("Error clearing table:", error);
						Alert.alert(
							t("error", "Error"),
							`${t("could_not_clear_the_table", "Could not clear table")}: ${error.message}`,
						);
					} finally {
						setIsActionLoading(false);
					}
				},
			},
		]);
	};

	const renderPartyCard = ({ item }) => {
		// 🚨 NEW: Core Logic for Dirty State
		const isDirty = item.status === "checkedOut";

		const partySize = item.guestPips ? item.guestPips.length : 1;
		const tableName = item.table?.name || t("unknown_table", "Unknown Table");
		const hostName = item.hostName || t("guest", "Guest");

		const needsServer =
			(!item.server || item.server.id === "unassigned") && !isDirty;
		const needsService = item.serviceRequested === true && !isDirty;
		const isCheckoutRequest =
			item.customerStatus === "ready_to_pay" && !isDirty;
		const hasFoodReady = item.hasFoodReady === true && !isDirty;
		const isRunningFood = runningFoodPartyId === item.id;

		const seatedTime = item.createdAt?.toDate
			? item.createdAt
					.toDate()
					.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
			: t("just_now", "Just now");

		const timeWaiting = item.serviceRequestedAt
			? moment(item.serviceRequestedAt).fromNow()
			: "";

		const isAssignedToMe = item?.server?.id === activeSession?.id;
		const statusConfig = isDirty
			? {
					label: t("needs_cleaning_status", "Needs Cleaning"),
					icon: "spray-bottle",
					color: "#334155",
					actionLabel: t("clean", "Clean"),
				}
			: needsService
				? {
						label: t("service_requested", "Service Requested"),
						icon: "bell-ring-outline",
						color: colors.statusDanger,
						actionLabel: t("acknowledge", "Ack"),
					}
				: isCheckoutRequest
					? {
							label: t("ready_to_pay", "Ready to Pay"),
							icon: "cash-register",
							color: colors.statusSuccess,
							actionLabel: t("open", "Open"),
						}
					: needsServer
						? {
								label: t("needs_server", "Needs Server"),
								icon: "account-plus-outline",
								color: colors.brandOrange || "#E67E22",
								actionLabel: permissions.isServer
									? t("claim", "Claim")
									: t("assign", "Assign"),
							}
						: hasFoodReady
							? {
									label: t("food_ready", "Food Ready"),
									icon: "food-takeout-box-outline",
									color: colors.statusSuccess,
									actionLabel: t("open", "Open"),
								}
						: {
								label: isAssignedToMe
									? t("your_table", "Your Table")
									: t("active_table", "Active Table"),
								icon: "silverware-fork-knife",
								color: colors.primary,
								actionLabel: t("open", "Open"),
							};
		const useWhiteText = false;

		return (
			<TouchableOpacity
				style={[
					styles.cardContainer,
					{ borderLeftColor: statusConfig.color },
					needsServer && styles.cardNeedsAttention,
					needsService && styles.cardNeedsService,
					isCheckoutRequest && styles.cardNeedsCheckout,
					hasFoodReady && styles.cardFoodReady,
					isDirty && styles.cardNeedsCleaning, // 🚨 Apply Dirty Slate Style
				]}
				activeOpacity={0.9}
				onPress={() => handleTableTap(item)}
			>
				<View
					style={[
						styles.cardHeader,
						useWhiteText && styles.borderLightInverted,
					]}
				>
					<View
						style={[
							styles.tableBadge,
							useWhiteText && styles.tableBadgeInverted,
						]}
					>
						<Text
							style={[styles.tableBadgeText, useWhiteText && styles.textDark]}
						>
							{tableName}
						</Text>
					</View>
					<Text style={useWhiteText ? styles.textWhite : styles.timeText}>
						{isDirty
							? t("bill_settled", "Bill Settled")
							: `${t("seated_at", "Seated:")} ${seatedTime}`}
					</Text>
				</View>

				<View style={styles.cardBody}>
					<View style={styles.hostInfo}>
						<Ionicons
							name="person-circle"
							size={24}
							color={useWhiteText ? colors.surfaceWhite : colors.primary}
						/>
						<Text
							style={[styles.hostNameText, useWhiteText && styles.textWhite]}
						>
							{hostName}
						</Text>
					</View>

					<View
						style={[
							styles.partySizeBadge,
							useWhiteText && styles.partySizeBadgeInverted,
						]}
					>
						<Ionicons
							name="people"
							size={16}
							color={useWhiteText ? colors.surfaceWhite : colors.textDark}
						/>
						<Text
							style={[styles.partySizeText, useWhiteText && styles.textWhite]}
						>
							{partySize}
						</Text>
					</View>
				</View>

				{(needsService || isCheckoutRequest) && !isDirty && (
					<View
						style={[
							styles.serviceBanner,
							isCheckoutRequest ? styles.bgSuccessLight : styles.bgDangerLight,
						]}
					>
						<View style={styles.serviceBannerLeft}>
							<MaterialCommunityIcons
								name={isCheckoutRequest ? "cash-register" : "bell-ring"}
								size={20}
								color={
									isCheckoutRequest ? colors.statusSuccess : colors.statusDanger
								}
							/>
							<View style={{ marginLeft: 8 }}>
								<Text
									style={[
										styles.serviceBannerTitle,
										{
											color: isCheckoutRequest
												? colors.statusSuccess
												: colors.statusDanger,
										},
									]}
								>
									{isCheckoutRequest
										? t("ready_to_pay", "Ready to Pay")
										: t("service_requested", "Service Requested")}
								</Text>
								<Text style={styles.serviceBannerTime}>{timeWaiting}</Text>
							</View>
						</View>
						<TouchableOpacity
							style={[
								styles.acknowledgeBtn,
								isCheckoutRequest
									? { backgroundColor: colors.statusSuccess }
									: { backgroundColor: colors.statusDanger },
							]}
							onPress={() => handleAcknowledge(item.id)}
						>
							<Text style={styles.acknowledgeBtnText}>
								{t("acknowledge", "Ack")}
							</Text>
						</TouchableOpacity>
					</View>
				)}

				{/* 🚨 DYNAMIC FOOTER: Dirty vs Active */}
				{hasFoodReady && (
					<View style={styles.foodReadyBanner}>
						<View style={styles.serviceBannerLeft}>
							<MaterialCommunityIcons
								name="food-takeout-box-outline"
								size={20}
								color={colors.statusSuccess}
							/>
							<View style={{ marginLeft: 8 }}>
								<Text style={styles.foodReadyTitle}>
									{t("food_ready", "Food Ready")}
								</Text>
								<Text style={styles.serviceBannerTime}>
									{item.allFoodReady
										? t("all_kitchen_items_ready", "All kitchen items are ready")
										: t(
												"kitchen_items_ready_count",
												"{{ready}} of {{total}} kitchen items ready",
												{
													ready: item.foodReadyCount,
													total: item.foodItemCount,
												},
											)}
								</Text>
							</View>
						</View>
						<TouchableOpacity
							style={styles.readyBadge}
							onPress={(event) => {
								event.stopPropagation();
								handleRunFood(item);
							}}
							disabled={isRunningFood}
						>
							{isRunningFood ? (
								<ActivityIndicator size="small" color={colors.surfaceWhite} />
							) : (
								<Text style={styles.readyBadgeText}>
									{t("run_food", "Run Food")}
								</Text>
							)}
						</TouchableOpacity>
					</View>
				)}

				{isDirty ? (
					<View style={styles.dirtyFooter}>
						{permissions.canCleanTable && (
							<TouchableOpacity
								style={styles.cleanActionBtn}
								onPress={() => handleClearTableAction(item)}
							>
								<MaterialCommunityIcons
									name="spray-bottle"
									size={20}
									color={colors.surfaceWhite}
								/>
								<Text style={styles.cleanActionBtnText}>
									{t("mark_clean", "Mark Clean & Release")}
								</Text>
							</TouchableOpacity>
						)}
					</View>
				) : (
					<View style={styles.cardFooter}>
						<TouchableOpacity
							style={styles.serverEditContainer}
							onPress={() => {
								if (needsServer && permissions.isServer) {
									executeServerAssignment(
										{
											id: activeSession?.id,
											name:
												activeSession?.name ||
												`${activeSession?.firstName || ""} ${
													activeSession?.lastName || ""
												}`.trim(),
										},
										item,
										true,
									);
									return;
								}
								setSelectedPartyForAssignment(item);
								setIsServerModalVisible(true);
							}}
						>
							<MaterialCommunityIcons
								name={
									needsServer ? "alert-circle-outline" : "room-service-outline"
								}
								size={18}
								color={needsServer ? colors.surfaceWhite : colors.textMedium}
							/>
							<Text
								style={[styles.serverText, needsServer && styles.textWhiteBold]}
							>
								{" "}
								{needsServer
									? t("needs_server", "Needs Server")
									: item.server?.name}
							</Text>
							{!needsServer && (
								<MaterialCommunityIcons
									name="pencil-outline"
									size={16}
									color={colors.textMedium}
									style={{ marginLeft: 6 }}
								/>
							)}
						</TouchableOpacity>

						{!needsServer && permissions.canForceClearTable && (
							<TouchableOpacity
								style={styles.clearTableBtn}
								onPress={() => handleClearTableAction(item)}
							>
								<Text style={styles.clearTableBtnText}>
									{t("clear_table", "Clear")}
								</Text>
							</TouchableOpacity>
						)}
					</View>
				)}
			</TouchableOpacity>
		);
	};

	const renderContent = () => {
		if (isLoading || isActionLoading) {
			return (
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={{ marginTop: 50 }}
				/>
			);
		}
		if (error) {
			return (
				<View style={styles.infoContainer}>
					<Text style={styles.errorText}>{error}</Text>
				</View>
			);
		}
		if (activeParties.length === 0) {
			return (
				<View style={styles.infoContainer}>
					<Ionicons
						name="checkmark-done-circle-outline"
						size={64}
						color={colors.borderLight}
					/>
					<Text style={styles.noCheckinsText}>
						{t(
							"no_active_tables_assigned",
							"You have no active tables assigned to you right now.",
						)}
					</Text>
				</View>
			);
		}
		return (
			<FlatList
				data={activeParties}
				renderItem={renderPartyCard}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.listContainer}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={isRefreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
			/>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				<View style={styles.titleContainer}>
					<View>
						<View style={{ flexDirection: "row", alignItems: "center" }}>
							<Text style={styles.title}>{t("my_tables", "My Tables")}</Text>
							<View style={styles.countBadge}>
								<Text style={styles.countBadgeText}>
									{activeParties.length}
								</Text>
							</View>
						</View>
						<Text
							style={{
								color: colors.textMedium,
								fontSize: 14,
								marginTop: 4,
								fontStyle: "italic",
							}}
						>
							{t("logged_in_as", "Server:")}{" "}
							{activeSession?.name || activeSession?.firstName}
						</Text>
					</View>

					<View style={{ flexDirection: "row", gap: 10 }}>
						{permissions.canSeatWalkIn && (
							<TouchableOpacity
								style={styles.manualSeatBtn}
								onPress={() => navigation.navigate("ManualSeatScreen")}
							>
								<Ionicons
									name="add-circle"
									size={20}
									color={colors.surfaceWhite}
								/>
								<Text style={styles.manualSeatBtnText}>
									{t("seat_table", "Seat")}
								</Text>
							</TouchableOpacity>
						)}
					</View>
				</View>

				{renderContent()}

				<ServerAssignmentModal
					visible={isServerModalVisible}
					onClose={() => {
						setIsServerModalVisible(false);
						setSelectedPartyForAssignment(null);
					}}
					onAssignServer={executeServerAssignment}
					servers={restaurantServers}
				/>
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	titleContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 15,
	},
	title: { fontSize: 28, fontWeight: "bold", color: colors.textDark },
	countBadge: {
		backgroundColor: colors.primary + "20",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
		marginLeft: 10,
	},
	countBadgeText: { color: colors.primary, fontWeight: "bold", fontSize: 16 },
	manualSeatBtn: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary,
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 8,
	},
	manualSeatBtnText: {
		color: colors.surfaceWhite,
		fontWeight: "bold",
		marginLeft: 4,
	},
	listContainer: { paddingHorizontal: 15, paddingBottom: 30 },
	infoContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	noCheckinsText: {
		fontSize: 18,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 15,
	},
	errorText: { fontSize: 16, color: colors.statusDanger, textAlign: "center" },

	// Card Styles
	cardContainer: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		marginBottom: 15,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderLeftWidth: 6,
	},

	cardNeedsAttention: {
		backgroundColor: "#FFF7ED",
		borderColor: "#FED7AA",
		borderLeftColor: colors.brandOrange || "#E67E22",
	},
	cardNeedsService: {
		borderLeftColor: colors.statusDanger,
	},
	cardNeedsCheckout: {
		borderLeftColor: colors.statusSuccess,
	},
	cardFoodReady: {
		borderColor: "#BBF7D0",
		borderLeftColor: colors.statusSuccess,
	},

	// 🚨 NEW: Dirty Slate Styling
	cardNeedsCleaning: {
		backgroundColor: "#F8FAFC",
		borderColor: "#CBD5E1",
		borderLeftColor: "#334155",
	},
	cardDimmed: { opacity: 0.98 },

	cardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		paddingBottom: 10,
	},
	borderLightInverted: { borderBottomColor: "rgba(255,255,255,0.3)" },
	tableBadge: {
		backgroundColor: colors.primary,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
	},
	tableBadgeInverted: { backgroundColor: colors.surfaceWhite },
	tableBadgeText: {
		color: colors.surfaceWhite,
		fontWeight: "bold",
		fontSize: 14,
	},
	timeText: { color: colors.textMedium, fontSize: 13 },

	cardBody: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	hostInfo: { flexDirection: "row", alignItems: "center" },
	hostNameText: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.textDark,
		marginLeft: 8,
	},

	partySizeBadge: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 8,
	},
	partySizeBadgeInverted: { backgroundColor: "rgba(255,255,255,0.2)" },
	partySizeText: {
		marginLeft: 5,
		fontWeight: "bold",
		color: colors.textDark,
		fontSize: 14,
	},

	// Service Banner
	serviceBanner: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 10,
		borderRadius: 8,
		marginBottom: 12,
	},
	bgDangerLight: { backgroundColor: colors.statusDanger + "15" },
	bgSuccessLight: { backgroundColor: colors.statusSuccess + "15" },
	serviceBannerLeft: { flexDirection: "row", alignItems: "center" },
	serviceBannerTitle: { fontSize: 14, fontWeight: "bold" },
	serviceBannerTime: { fontSize: 12, color: colors.textMedium },
	foodReadyBanner: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 10,
		borderRadius: 8,
		marginBottom: 12,
		backgroundColor: colors.statusSuccess + "15",
	},
	foodReadyTitle: {
		fontSize: 14,
		fontWeight: "bold",
		color: colors.statusSuccess,
	},
	readyBadge: {
		backgroundColor: colors.statusSuccess,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 6,
	},
	readyBadgeText: {
		color: colors.surfaceWhite,
		fontWeight: "bold",
		fontSize: 12,
	},
	acknowledgeBtn: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
	},
	acknowledgeBtnText: {
		color: colors.surfaceWhite,
		fontWeight: "bold",
		fontSize: 12,
	},

	cardFooter: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	serverText: { color: colors.textMedium, fontSize: 14, fontWeight: "500" },
	serverEditContainer: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 4,
	},
	clearTableBtn: {
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	clearTableBtnText: {
		color: colors.textDark,
		fontWeight: "600",
		fontSize: 12,
	},

	// 🚨 NEW: Dirty Footer Styles
	dirtyFooter: {
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	cleanActionBtn: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.statusSuccess,
		paddingVertical: 12,
		borderRadius: 8,
	},
	cleanActionBtnText: {
		color: colors.surfaceWhite,
		fontWeight: "bold",
		fontSize: 15,
		marginLeft: 8,
	},

	// Utilities
	textWhite: { color: colors.surfaceWhite },
	textWhiteBold: { color: colors.surfaceWhite, fontWeight: "bold" },
	textDark: { color: colors.textDark },
});

export default RestaurantActiveTables;
