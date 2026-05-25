import React, { useContext, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	ScrollView,
	TouchableOpacity,
} from "react-native";
import { Button, Surface } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import moment from "moment";

import { useWorkDay } from "../../context/restaurant/WorkDayContext";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import i18n from "../../config/i18n";
import { getRestaurantPermissions } from "../../utils/restaurantPermissions";
import RestaurantLockButton from "../../components/restaurant/RestaurantLockButton";

const DashboardCard = ({
	label,
	iconName,
	onPress,
	color = colors.primary,
}) => {
	const { t } = useTranslation();
	return (
		<TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
			<Surface style={styles.cardSurface}>
				<View style={[styles.iconCircle, { backgroundColor: color + "15" }]}>
					<MaterialCommunityIcons name={iconName} size={32} color={color} />
				</View>
				<Text style={styles.cardLabel}>{t(label)}</Text>
				<View style={styles.cardArrow}>
					<Ionicons
						name="chevron-forward"
						size={16}
						color={colors.textMedium}
					/>
				</View>
			</Surface>
		</TouchableOpacity>
	);
};

const RestaurantDashboardScreen = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const { currentWorkDay, workDayStatus, isLoading, startWorkDay, endWorkDay } =
		useWorkDay();
	const { activeSession } = useEmployeeSession();
	const [isActionLoading, setIsActionLoading] = useState(false);

	// 🚨 1. DEFINE ENTERPRISE ROLE GATES
	const permissions = getRestaurantPermissions(activeSession);

	const handleBackOfficePress = () => {
		navigation.navigate("BackOfficeNavigator", { screen: "BackOffice" });
	};

	const openRestaurantTab = (tabName, screenName = null) => {
		const targetNavigation = navigation.getParent() || navigation;

		if (screenName) {
			targetNavigation.navigate(tabName, { screen: screenName });
			return;
		}

		targetNavigation.navigate(tabName);
	};

	const renderStatusHeader = () => {
		const isOpen = workDayStatus === "OPEN" && currentWorkDay;
		const statusColor = isOpen ? colors.statusSuccess : colors.statusDanger;

		return (
			<View style={[styles.statusBanner, { backgroundColor: statusColor }]}>
				<View style={styles.statusInfo}>
					<Text style={styles.statusLabel}>
						{isOpen ? t("LIVE OPERATIONS") : t("OFFLINE")}
					</Text>
					<Text style={styles.statusMainText}>
						{isOpen ? t("Restaurant is Open") : t("Restaurant is Closed")}
					</Text>
					{isOpen && (
						<Text style={styles.statusTime}>
							{t("Started at")}{" "}
							{moment(currentWorkDay.startTime?.toDate()).format("LT")}
						</Text>
					)}
				</View>
				<TouchableOpacity
					style={styles.statusToggleBtn}
					onPress={isOpen ? handleEndDay : handleStartDay}
					disabled={isActionLoading}
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

	const handleStartDay = async () => {
		await startWorkDay();
	};

	const handleEndDay = () => {
		Alert.alert(t("end_work_day"), t("confirm?"), [
			{ text: t("cancel") },
			{
				text: t("end"),
				onPress: async () => {
					await endWorkDay();
				},
			},
		]);
	};

	const toggleLanguage = () => {
		const newLang = i18n.language === "en" ? "es" : "en";
		i18n.changeLanguage(newLang);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
				<View style={styles.brandHeader}>
					<View>
						<Text style={styles.brandName}>
							{currentUserData?.restaurantName || "SCERV POS"}
						</Text>
						<Text style={styles.userRole}>
							{activeSession?.name} • {activeSession?.jobTitle?.toUpperCase()}
						</Text>
					</View>
					<View style={styles.headerActions}>
						<TouchableOpacity
							onPress={toggleLanguage}
							style={{ marginBottom: 5 }}
						>
							<Text style={{ fontSize: 16 }}>
								{i18n.language === "en" ? "🇪🇸 Español" : "🇺🇸 English"}
							</Text>
						</TouchableOpacity>
						<RestaurantLockButton style={styles.lockButton} />
						<View style={styles.dateContainer}>
							<Text style={styles.dateText}>
								{moment().format("ddd, MMM Do")}
							</Text>
						</View>
					</View>
				</View>

				{/* 🚨 2. ONLY MANAGERS SEE IF THE RESTAURANT IS OPEN/CLOSED */}
				{permissions.isManagement && renderStatusHeader()}

				<Text style={styles.sectionTitle}>
					{t("Main Operations", "Main Operations")}
				</Text>

				<View style={styles.navigationGrid}>
					{/* 🚨 3. FRONT OF HOUSE: Servers, Hosts, and Managers */}
					{(permissions.canSeatWalkIn || permissions.canViewServiceRequests) && (
						<>
							{permissions.canSeatWalkIn && (
								<DashboardCard
									label={t("seat_walk_in", "Seat Walk-in")}
									iconName="table-chair"
									color="#0ea5e9"
									onPress={() =>
										openRestaurantTab("Checkins", "ManualSeatScreen")
									}
								/>
							)}
							{permissions.canViewServiceRequests && (
								<DashboardCard
									label={t("service_requests", "Service Requests")}
									iconName="bell-ring-outline"
									color="#ef4444"
									onPress={() =>
										openRestaurantTab("Checkins", "ServiceRequestsScreen")
									}
								/>
							)}
						</>
					)}

					{/* 🚨 4. BACK OF HOUSE: Support, Chefs, Bartenders, and Managers */}
					{(permissions.canViewKitchen || permissions.canViewPickupQueue) && (
						<>
							{permissions.canViewKitchen && (
								<DashboardCard
									label={t("kitchen", "Kitchen / Bar")}
									iconName="silverware-fork-knife"
									color="#f59e0b"
									onPress={() => openRestaurantTab("ChefsQ")}
								/>
							)}
							{permissions.canViewPickupQueue && (
								<DashboardCard
									label={t("pickup_queue", "Pickup Queue")}
									iconName="bag-personal-outline"
									color="#14b8a6"
									onPress={() => openRestaurantTab("Pickups")}
								/>
							)}
						</>
					)}

					{/* 🚨 5. BACK OFFICE: Strictly Management */}
					{permissions.canManageBackOffice && (
						<DashboardCard
							label={t("back_office", "Back Office")}
							iconName="shield-check-outline"
							color="#10b981"
							onPress={handleBackOfficePress}
						/>
					)}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: "#F3F4F6" },
	container: { flex: 1 },
	brandHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 24,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: "#E5E7EB",
	},
	headerActions: { alignItems: "flex-end" },
	lockButton: {
		marginBottom: 4,
		minWidth: 38,
		minHeight: 38,
	},
	brandName: {
		fontSize: 22,
		fontWeight: "800",
		color: colors.textDark,
		letterSpacing: -0.5,
	},
	userRole: {
		fontSize: 12,
		fontWeight: "600",
		color: colors.textMedium,
		marginTop: 2,
	},
	dateContainer: {
		backgroundColor: "#F3F4F6",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
	},
	dateText: { fontSize: 12, fontWeight: "700", color: colors.textDark },
	statusBanner: {
		margin: 20,
		borderRadius: 20,
		padding: 20,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		elevation: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 10,
	},
	statusInfo: { flex: 1 },
	statusLabel: {
		color: "rgba(255,255,255,0.7)",
		fontSize: 10,
		fontWeight: "900",
		letterSpacing: 1,
	},
	statusMainText: {
		color: "#FFF",
		fontSize: 20,
		fontWeight: "700",
		marginTop: 4,
	},
	statusTime: { color: "#FFF", fontSize: 13, marginTop: 2, opacity: 0.9 },
	statusToggleBtn: {
		backgroundColor: "#FFF",
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 12,
	},
	statusToggleText: { fontWeight: "800", fontSize: 14 },
	sectionTitle: {
		paddingHorizontal: 24,
		fontSize: 14,
		fontWeight: "800",
		color: colors.textMedium,
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 12,
		marginTop: 20, // Added margin top here since header banner might be hidden
	},
	navigationGrid: {
		paddingHorizontal: 12,
		flexDirection: "row",
		flexWrap: "wrap",
	},
	card: { width: "50%", padding: 8 },
	cardSurface: {
		backgroundColor: "#FFF",
		borderRadius: 20,
		padding: 20,
		height: 160,
		justifyContent: "space-between",
		elevation: 2,
	},
	iconCircle: {
		width: 56,
		height: 56,
		borderRadius: 18,
		justifyContent: "center",
		alignItems: "center",
	},
	cardLabel: { fontSize: 16, fontWeight: "700", color: colors.textDark },
	cardArrow: { position: "absolute", right: 15, bottom: 20 },
});

export default RestaurantDashboardScreen;
