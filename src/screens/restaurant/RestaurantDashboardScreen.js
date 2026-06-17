import React, { useContext, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import moment from "moment";
import { useTranslation } from "react-i18next";

import i18n from "../../config/i18n";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { useWorkDay } from "../../context/restaurant/WorkDayContext";
import RestaurantLockButton from "../../components/restaurant/RestaurantLockButton";
import { isPickupEnabledForRestaurant } from "../../config/featureFlags";
import { useRestaurantOperationsBadges } from "../../hooks/restaurant/useRestaurantOperationsBadges";
import { getRestaurantPermissions } from "../../utils/restaurantPermissions";
import colors from "../../utils/styles/appStyles";

const DashboardCard = ({
	label,
	description,
	iconName,
	onPress,
	color = colors.primary,
	badgeCount = 0,
	badgeTone = "neutral",
}) => {
	const { t } = useTranslation();
	const badgeText = badgeCount > 9 ? "9+" : String(badgeCount);

	return (
		<TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.78}>
			<View style={styles.cardSurface}>
				<View style={[styles.iconCircle, { backgroundColor: color + "15" }]}>
					<MaterialCommunityIcons name={iconName} size={22} color={color} />
				</View>
				<View style={styles.cardTextWrap}>
					<Text style={styles.cardLabel}>{t(label)}</Text>
					{description ? (
						<Text style={styles.cardDescription} numberOfLines={1}>
							{description}
						</Text>
					) : null}
				</View>
				{badgeCount > 0 ? (
					<View style={[styles.cardBadge, styles[`cardBadge_${badgeTone}`]]}>
						<Text
							style={[styles.cardBadgeText, styles[`cardBadgeText_${badgeTone}`]]}
						>
							{badgeText}
						</Text>
					</View>
				) : null}
				<Ionicons name="chevron-forward" size={18} color={colors.textMedium} />
			</View>
		</TouchableOpacity>
	);
};

const RestaurantDashboardScreen = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const { currentWorkDay, workDayStatus, startWorkDay, endWorkDay } =
		useWorkDay();
	const { activeSession } = useEmployeeSession();
	const [isActionLoading, setIsActionLoading] = useState(false);

	const permissions = getRestaurantPermissions(activeSession);
	const pickupEnabled = isPickupEnabledForRestaurant(currentUserData);
	const isOpen = workDayStatus === "OPEN" && currentWorkDay;
	const operationsBadges = useRestaurantOperationsBadges(currentUserData?.uid);

	const handleBackOfficePress = () => {
		navigation.navigate("BackOfficeNavigator", { screen: "BackOffice" });
	};

	const openRestaurantTab = (tabName, screenName = null) => {
		if (tabName === "ActiveTablesNavigator") {
			if (screenName) {
				navigation.navigate("ActiveTablesNavigator", { screen: screenName });
				return;
			}

			navigation.navigate("ActiveTablesNavigator");
			return;
		}

		const targetNavigation = navigation.getParent() || navigation;
		if (screenName) {
			targetNavigation.navigate(tabName, { screen: screenName });
			return;
		}

		targetNavigation.navigate(tabName);
	};

	const handleEndDay = () => {
		Alert.alert(
			t("close_day_title", "Close out the day?"),
			t(
				"close_day_message",
				"This closes the books, clears active tables, archives Chef Q and Bar Q tickets, and prepares the restaurant for the next open day.",
			),
			[
				{ text: t("cancel") },
				{
					text: t("close_day_confirm", "Close Day"),
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						const result = await endWorkDay();
						setIsActionLoading(false);
						if (result?.success) {
							Alert.alert(
								t("day_closed", "Day Closed"),
								t(
									"day_closed_summary",
									"Books closed. Cleared {{tables}} table(s), archived {{orders}} kitchen/bar ticket(s), and closed {{parties}} active party record(s).",
									{
										tables: result.tablesCleared || 0,
										orders: result.ordersArchived || 0,
										parties: result.partiesClosed || 0,
									},
								),
							);
						}
					},
				},
			],
		);
	};

	const toggleLanguage = () => {
		const newLang = i18n.language === "en" ? "es" : "en";
		i18n.changeLanguage(newLang);
	};

	const renderStatusHeader = () => {
		const statusColor = isOpen ? colors.statusSuccess : colors.statusDanger;

		return (
			<View style={styles.statusBanner}>
				<View style={styles.statusInfo}>
					<View style={[styles.statusDot, { backgroundColor: statusColor }]} />
					<View style={styles.statusTextWrap}>
						<Text style={styles.statusLabel}>
							{isOpen ? t("LIVE OPERATIONS") : t("OFFLINE")}
						</Text>
						<Text style={styles.statusMainText}>
							{isOpen ? t("Restaurant is Open") : t("Restaurant is Closed")}
						</Text>
						{isOpen ? (
							<Text style={styles.statusTime}>
								{t("Started at")}{" "}
								{moment(currentWorkDay.startTime?.toDate()).format("LT")}
							</Text>
						) : null}
					</View>
				</View>
				<TouchableOpacity
					style={[styles.statusToggleBtn, { borderColor: statusColor }]}
					onPress={isOpen ? handleEndDay : startWorkDay}
					disabled={isActionLoading}
					activeOpacity={0.8}
				>
					{isActionLoading ? (
						<ActivityIndicator color={statusColor} />
					) : (
						<Text style={[styles.statusToggleText, { color: statusColor }]}>
							{isOpen ? t("Close Shop") : t("Open Shop")}
						</Text>
					)}
				</TouchableOpacity>
			</View>
		);
	};

	const renderOperationsBadges = () => {
		if (!permissions.canSeatWalkIn) return null;

		return (
			<View style={styles.operationsBadgeRow}>
				<TouchableOpacity
					style={styles.operationsBadge}
					activeOpacity={0.8}
					onPress={() =>
						openRestaurantTab(
							"ActiveTablesNavigator",
							"RestaurantReservationsScreen",
						)
					}
				>
					<View style={styles.operationsBadgeIcon}>
						<MaterialCommunityIcons
							name="calendar-clock"
							size={18}
							color="#7c3aed"
						/>
					</View>
					<View style={styles.operationsBadgeTextWrap}>
						<Text style={styles.operationsBadgeValue}>
							{operationsBadges.reservationsTotal}
						</Text>
						<Text style={styles.operationsBadgeLabel}>
							{t("reservations", "Reservations")}
						</Text>
					</View>
				</TouchableOpacity>

				<TouchableOpacity
					style={[
						styles.operationsBadge,
						operationsBadges.checkInRequests > 0 &&
							styles.operationsBadgeUrgent,
					]}
					activeOpacity={0.8}
					onPress={() =>
						openRestaurantTab(
							"ActiveTablesNavigator",
							"HostStandScreen",
						)
					}
				>
					<View style={styles.operationsBadgeIcon}>
						<MaterialCommunityIcons
							name="account-clock-outline"
							size={18}
							color={
								operationsBadges.checkInRequests > 0
									? colors.statusDanger
									: colors.textMedium
							}
						/>
					</View>
					<View style={styles.operationsBadgeTextWrap}>
						<Text style={styles.operationsBadgeValue}>
							{operationsBadges.checkInRequests}
						</Text>
						<Text style={styles.operationsBadgeLabel}>
							{t("check_in_requests", "Check-ins")}
						</Text>
					</View>
				</TouchableOpacity>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView
				style={styles.container}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.brandHeader}>
					<View style={styles.brandTextWrap}>
						<Text style={styles.eyebrow}>
							{isOpen
								? t("open_for_service", "Open for service")
								: t("pre_service", "Pre-service")}
						</Text>
						<Text style={styles.brandName}>
							{currentUserData?.restaurantName || "SCERV POS"}
						</Text>
						<Text style={styles.userRole}>
							{activeSession?.name || t("staff", "Staff")} -{" "}
							{activeSession?.jobTitle?.toUpperCase?.() || t("TEAM", "TEAM")}
						</Text>
					</View>
					<View style={styles.headerActions}>
						<TouchableOpacity
							onPress={toggleLanguage}
							style={styles.languageButton}
							activeOpacity={0.8}
						>
							<Text style={styles.languageText}>
								{i18n.language === "en" ? "ES" : "EN"}
							</Text>
						</TouchableOpacity>
						<RestaurantLockButton style={styles.lockButton} />
						<View style={styles.dateContainer}>
							<Text style={styles.dateText}>{moment().format("ddd, MMM Do")}</Text>
						</View>
					</View>
				</View>

				{permissions.isManagement ? renderStatusHeader() : null}
				{renderOperationsBadges()}

				{(permissions.canViewTickets ||
					permissions.canSeatWalkIn ||
					permissions.canViewServiceRequests) && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>
							{t("front_of_house", "Front of House")}
						</Text>
						<View style={styles.navigationStack}>
							{permissions.canViewTickets ? (
								<DashboardCard
									label={t("active_tables", "Active Tables")}
									description={t("tables_orders_guests", "Tables, orders, guests")}
									iconName="clipboard-text-outline"
									color="#2563eb"
									onPress={() => openRestaurantTab("ActiveTablesNavigator")}
								/>
							) : null}
							{permissions.canSeatWalkIn ? (
								<DashboardCard
									label={t("seat_walk_in", "Seat Walk-in")}
									description={t("assign_table_server", "Assign table and server")}
									iconName="table-chair"
									color="#0ea5e9"
									onPress={() =>
										openRestaurantTab(
											"ActiveTablesNavigator",
											"ManualSeatScreen",
										)
									}
								/>
							) : null}
							{permissions.canSeatWalkIn ? (
								<DashboardCard
									label={t("reservations", "Reservations")}
									description={
										operationsBadges.pendingReservations > 0
											? t(
													"reservation_requests_waiting",
													"{{count}} request(s) need approval",
													{
														count: operationsBadges.pendingReservations,
													},
												)
											: t("confirmed_reservations", "Confirmed reservations")
									}
									iconName="calendar-clock"
									color="#7c3aed"
									badgeCount={operationsBadges.reservationsTotal}
									badgeTone={
										operationsBadges.pendingReservations > 0
											? "warning"
											: "primary"
									}
									onPress={() =>
										openRestaurantTab(
											"ActiveTablesNavigator",
											"RestaurantReservationsScreen",
										)
									}
								/>
							) : null}
							{permissions.canSeatWalkIn ? (
								<DashboardCard
									label={t("host_check_ins", "Host Check-ins")}
									description={
										operationsBadges.checkInRequests > 0
											? t(
													"parties_waiting_to_be_seated",
													"{{count}} waiting to be seated",
													{
														count: operationsBadges.checkInRequests,
													},
												)
											: t(
													"no_waiting_check_ins",
													"No waiting check-in requests",
												)
									}
									iconName="account-clock-outline"
									color="#dc2626"
									badgeCount={operationsBadges.checkInRequests}
									badgeTone="danger"
									onPress={() =>
										openRestaurantTab(
											"ActiveTablesNavigator",
											"HostStandScreen",
										)
									}
								/>
							) : null}
							{permissions.canViewServiceRequests ? (
								<DashboardCard
									label={t("service_requests", "Service Requests")}
									description={t("guest_needs_attention", "Guest needs attention")}
									iconName="bell-ring-outline"
									color="#dc2626"
									onPress={() =>
										openRestaurantTab(
											"ActiveTablesNavigator",
											"ServiceRequestsScreen",
										)
									}
								/>
							) : null}
						</View>
					</View>
				)}

				{(permissions.canViewKitchen ||
					(pickupEnabled && permissions.canViewPickupQueue)) && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>
							{t("back_of_house", "Back of House")}
						</Text>
						<View style={styles.navigationStack}>
							{permissions.canViewKitchen ? (
								<DashboardCard
									label={t("kitchen", "Kitchen / Bar")}
									description={t("live_ticket_flow", "Live ticket flow")}
									iconName="silverware-fork-knife"
									color="#d97706"
									onPress={() => openRestaurantTab("ChefsQ")}
								/>
							) : null}
							{pickupEnabled && permissions.canViewPickupQueue ? (
								<DashboardCard
									label={t("pickup_queue", "Pickup Queue")}
									description={t("orders_ready_to_go", "Orders ready to go")}
									iconName="bag-personal-outline"
									color="#0f766e"
									onPress={() => openRestaurantTab("Pickups")}
								/>
							) : null}
						</View>
					</View>
				)}

				{permissions.canManageBackOffice ? (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>
							{t("management", "Management")}
						</Text>
						<View style={styles.navigationStack}>
							<DashboardCard
								label={t("back_office", "Back Office")}
								description={t("menu_staff_reports", "Menu, staff, reports")}
								iconName="shield-check-outline"
								color="#059669"
								onPress={handleBackOfficePress}
							/>
							<DashboardCard
								label={t("rewards", "Rewards")}
								description={t("loyalty_tiers_guest_perks", "Loyalty tiers and guest perks")}
								iconName="star-four-points-outline"
								color="#2563eb"
								onPress={() =>
									navigation.navigate("BackOfficeNavigator", {
										screen: "RestaurantRewardsScreen",
									})
								}
							/>
						</View>
					</View>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	content: { paddingBottom: 28 },
	brandHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		paddingHorizontal: 20,
		paddingTop: 18,
		paddingBottom: 16,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	brandTextWrap: { flex: 1, paddingRight: 12 },
	eyebrow: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
		textTransform: "uppercase",
		marginBottom: 4,
	},
	brandName: {
		fontSize: 22,
		fontWeight: "900",
		color: colors.textDark,
	},
	userRole: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 4,
	},
	headerActions: {
		alignItems: "flex-end",
	},
	languageButton: {
		minWidth: 38,
		minHeight: 34,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.surfaceWhite,
		marginBottom: 6,
	},
	languageText: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textDark,
	},
	lockButton: {
		marginBottom: 6,
		minWidth: 38,
		minHeight: 38,
	},
	dateContainer: {
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 8,
	},
	dateText: { fontSize: 12, fontWeight: "800", color: colors.textDark },
	statusBanner: {
		marginHorizontal: 16,
		marginTop: 16,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		padding: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	statusInfo: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		paddingRight: 10,
	},
	statusDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginRight: 10,
	},
	statusTextWrap: { flex: 1 },
	statusLabel: {
		color: colors.textMedium,
		fontSize: 10,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	statusMainText: {
		color: colors.textDark,
		fontSize: 16,
		fontWeight: "900",
		marginTop: 2,
	},
	statusTime: {
		color: colors.textMedium,
		fontSize: 12,
		marginTop: 2,
	},
	statusToggleBtn: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 8,
	},
	statusToggleText: { fontWeight: "900", fontSize: 13 },
	operationsBadgeRow: {
		flexDirection: "row",
		gap: 10,
		marginHorizontal: 16,
		marginTop: 12,
	},
	operationsBadge: {
		flex: 1,
		minHeight: 66,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		padding: 10,
		flexDirection: "row",
		alignItems: "center",
	},
	operationsBadgeUrgent: {
		borderColor: colors.statusDanger,
		backgroundColor: "#fff5f5",
	},
	operationsBadgeIcon: {
		width: 34,
		height: 34,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.backgroundLight,
		marginRight: 9,
	},
	operationsBadgeTextWrap: { flex: 1 },
	operationsBadgeValue: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.textDark,
	},
	operationsBadgeLabel: {
		fontSize: 11,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 1,
	},
	section: {
		marginTop: 18,
		paddingHorizontal: 16,
	},
	sectionTitle: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textMedium,
		textTransform: "uppercase",
		marginBottom: 8,
	},
	navigationStack: {
		borderRadius: 8,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
	},
	card: {
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	cardSurface: {
		minHeight: 72,
		paddingHorizontal: 14,
		paddingVertical: 12,
		flexDirection: "row",
		alignItems: "center",
	},
	iconCircle: {
		width: 42,
		height: 42,
		borderRadius: 8,
		justifyContent: "center",
		alignItems: "center",
		marginRight: 12,
	},
	cardTextWrap: { flex: 1 },
	cardLabel: {
		fontSize: 15,
		fontWeight: "900",
		color: colors.textDark,
	},
	cardDescription: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 3,
	},
	cardBadge: {
		minWidth: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 8,
		marginLeft: 8,
		marginRight: 8,
	},
	cardBadge_primary: { backgroundColor: "#ede9fe" },
	cardBadge_warning: { backgroundColor: "#fff7ed" },
	cardBadge_danger: { backgroundColor: "#fee2e2" },
	cardBadge_neutral: { backgroundColor: colors.backgroundLight },
	cardBadgeText: {
		fontSize: 12,
		fontWeight: "900",
	},
	cardBadgeText_primary: { color: "#6d28d9" },
	cardBadgeText_warning: { color: "#c2410c" },
	cardBadgeText_danger: { color: colors.statusDanger },
	cardBadgeText_neutral: { color: colors.textMedium },
});

export default RestaurantDashboardScreen;
