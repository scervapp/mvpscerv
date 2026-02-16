// screens/restaurant/RestaurantDashboardScreen.js
import React, { useContext, useState, useCallback, useRef } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	ScrollView,
	TouchableOpacity,
	Modal,
	FlatList,
} from "react-native";
import { Button } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import moment from "moment";

import { useWorkDay } from "../../context/restaurant/WorkDayContext";
import { AuthContext } from "../../context/authContext";
import ManagerPinModal from "../../components/restaurant/ManagerPinModal";
import {
	fetchEmployees,
	fetchEmployeesByRole,
} from "../../utils/firebaseUtils";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";

import { useRestaurantData } from "../../context/restaurant/RestaurantDataContext";

// Reusable card component for the navigation grid
const DashboardCard = ({ label, iconName, onPress }) => {
	const { t } = useTranslation();
	return (
		<TouchableOpacity style={styles.card} onPress={onPress}>
			<View style={styles.iconContainer}>
				<MaterialCommunityIcons
					name={iconName}
					size={40}
					color={colors.primary}
				/>
			</View>
			<Text style={styles.cardLabel}>{t(label)}</Text>
		</TouchableOpacity>
	);
};

// A simple modal to let the user select which manager is present
const ManagerSelectionModal = ({ isVisible, onClose, managers, onSelect }) => {
	const { t } = useTranslation();
	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<TouchableOpacity
				style={styles.modalOverlay}
				activeOpacity={1}
				onPressOut={onClose}
			>
				<TouchableOpacity style={styles.modalContent} activeOpacity={1}>
					<Text style={styles.modalTitle}>{t("manager_authorization")}</Text>
					<Text style={styles.modalSubtitle}>
						{t(
							"please_select_which_manager_is_present_to_authorize_this_action",
						)}
					</Text>
					<FlatList
						data={managers}
						keyExtractor={(item) => item.id}
						renderItem={({ item }) => (
							<TouchableOpacity
								style={styles.managerRow}
								onPress={() => onSelect(item)}
							>
								<Text style={styles.managerName}>
									{item.firstName} {item.lastName}
								</Text>
							</TouchableOpacity>
						)}
					/>
					<Button onPress={onClose} mode="outlined" style={{ marginTop: 15 }}>
						{t("cancel")}
					</Button>
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
	);
};

const RestaurantDashboardScreen = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const { currentWorkDay, workDayStatus, isLoading, startWorkDay, endWorkDay } =
		useWorkDay();

	const [isManagerListVisible, setIsManagerListVisible] = useState(false);
	const [managers, setManagers] = useState([]);
	const [isPinModalVisible, setIsPinModalVisible] = useState(false);
	const [managerToVerify, setManagerToVerify] = useState(null);
	const [isFetchingManagers, setIsFetchingManagers] = useState(false);
	const [isActionLoading, setIsActionLoading] = useState(false);

	const handleBackOfficePress = useCallback(async () => {
		const userRole = currentUserData?.role;
		const needsOnboarding = currentUserData?.hasSetupEmployees === false;
		const restaurantId = currentUserData?.uid;

		if (!restaurantId) {
			Alert.alert(
				t("error"),
				t("could_not_identify_your_restaurant_please_log_in_again"),
			);
			return;
		}

		// 1. One-time pass for new owners to complete setup
		if (userRole === "owner" && needsOnboarding) {
			Alert.alert(
				t("welcome_owner"),
				t(
					"to_secure_your_back_office_please_start_by_creating_your_own_owner_profile_on_the_employee_screen_and_setting_a_pin",
				),
				[
					{
						text: t("continue_to_setup"),
						onPress: () =>
							navigation.navigate("BackOfficeNavigator", {
								screen: "EmployeeScreen",
							}),
					},
				],
			);
			return;
		}

		// 2. For everyone else, start the standard PIN verification flow.
		setIsFetchingManagers(true);
		try {
			const managerList = await fetchEmployeesByRole(restaurantId, [
				"manager",
				"owner",
			]);
			if (managerList.length === 0) {
				Alert.alert(
					t("access_denied"),
					t("no_managers_are_configured_for_this_restaurant"),
					[{ text: t("ok") }],
				);
				return;
			}
			setManagers(managerList);
			setIsManagerListVisible(true);
		} catch (error) {
			Alert.alert(t("error"), t("could_not_fetch_manager_list"));
			console.error("Error in handleBackOfficePress:", error);
		} finally {
			setIsFetchingManagers(false);
		}
	}, [currentUserData, navigation]);

	const onSelectManagerForVerification = (manager) => {
		setIsManagerListVisible(false);
		setManagerToVerify(manager);
		setIsPinModalVisible(true);
	};

	const onPinSuccess = () => {
		console.log("PIN Success! Navigating to Back Office.");
		setIsPinModalVisible(false);
		setManagerToVerify(null);
		navigation.navigate("BackOfficeNavigator", {
			screen: "BackOffice",
		});
	};

	const onModalClose = () => {
		setIsManagerListVisible(false);
		setIsPinModalVisible(false);
	};

	const handleStartDay = async () => {
		setIsActionLoading(true);
		try {
			// 2. Await Tone.start() to activate the audio engine.
			// This must be triggered by a direct user press.

			// 3. Then, proceed with starting the workday as before.
			await startWorkDay();
		} catch (error) {
			console.error("Error during start day process:", error);
			// The startWorkDay function already shows an alert on failure.
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleEndDay = () => {
		Alert.alert(
			t("end_work_day"),
			t("are_you_sure_you_want_to_end_the_current_work_day"),
			[
				{ text: t("cancel"), style: "cancel" },
				{
					text: t("end_day"),
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						await endWorkDay();
						setIsActionLoading(false);
					},
				},
			],
		);
	};

	const renderStatusContent = () => {
		if (isLoading) {
			return <ActivityIndicator size="large" color={colors.primary} />;
		}
		if (workDayStatus === "OPEN" && currentWorkDay) {
			const startTime = moment(currentWorkDay.startTime?.toDate()).format("LT");
			return (
				<View style={styles.statusContent}>
					<Ionicons
						name="sunny-outline"
						size={60}
						color={colors.statusSuccess}
					/>
					<Text style={styles.statusTitle}>{t("restaurant_is_open")}</Text>
					<Text style={styles.statusSubtitle}>
						{t("work_day_started_at")} {startTime}
					</Text>
					<Button
						mode="contained"
						onPress={handleEndDay}
						loading={isActionLoading}
						disabled={isActionLoading}
						style={[
							styles.actionButton,
							{ backgroundColor: colors.statusDanger },
						]}
					>
						{t("end_work_day")}
					</Button>
				</View>
			);
		}
		return (
			<View style={styles.statusContent}>
				<Ionicons name="moon-outline" size={60} color={colors.textMedium} />
				<Text style={styles.statusTitle}>{t("restaurant_is_closed")}</Text>
				<Text style={styles.statusSubtitle}>
					{t("tap_below_to_begin_a_new_work_day")}
				</Text>
				<Button
					mode="contained"
					onPress={handleStartDay}
					loading={isActionLoading}
					disabled={isActionLoading}
					style={[
						styles.actionButton,
						{ backgroundColor: colors.statusSuccess },
					]}
				>
					{t("start_work_day")}
				</Button>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView>
				<View style={styles.header}>
					<Text style={styles.welcomeText}>
						{t("welcome")}, {currentUserData?.firstName || t("manager")}
					</Text>
					<Text style={styles.title}>
						{currentUserData?.restaurantName || t("dashboard")}
					</Text>
				</View>

				<View style={styles.statusContainer}>{renderStatusContent()}</View>

				<View style={styles.navigationGrid}>
					<DashboardCard
						label={t("customers_waiting")}
						iconName="account-clock-outline"
						onPress={() => navigation.navigate("Checkins")}
					/>
					<DashboardCard
						label={t("chefs_q")}
						iconName="silverware-fork-knife"
						onPress={() => navigation.navigate("ChefsQ")}
					/>
					<DashboardCard
						label={t("table_view")}
						iconName="table-chair"
						onPress={() => navigation.navigate("Tables")}
					/>
					<DashboardCard
						label={t("back_office")}
						iconName="briefcase-outline"
						onPress={handleBackOfficePress}
					/>
				</View>
			</ScrollView>

			<ManagerSelectionModal
				isVisible={isManagerListVisible}
				onClose={onModalClose}
				managers={managers}
				onSelect={onSelectManagerForVerification}
			/>

			{managerToVerify && (
				<ManagerPinModal
					isVisible={isPinModalVisible}
					onClose={onModalClose}
					onSuccess={onPinSuccess}
					employeeToVerify={managerToVerify}
					restaurantId={currentUserData?.uid}
				/>
			)}

			{isFetchingManagers && (
				<View style={styles.loadingOverlay}>
					<ActivityIndicator size="large" color={colors.surfaceWhite} />
				</View>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
	welcomeText: { fontSize: 18, color: colors.textMedium, textAlign: "center" },
	title: {
		fontSize: 28,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginTop: 4,
	},
	statusContainer: {
		padding: 20,
		margin: 15,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 16,
		elevation: 5,
	},
	statusContent: {
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 20,
	},
	statusTitle: {
		fontSize: 24,
		fontWeight: "bold",
		marginTop: 15,
		marginBottom: 8,
	},
	statusSubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 30,
		maxWidth: "85%",
	},
	actionButton: { borderRadius: 8, paddingVertical: 10, width: "90%" },
	navigationGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-around",
		paddingHorizontal: 10,
		marginTop: 10,
	},
	card: {
		width: "45%",
		aspectRatio: 1.1,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		marginBottom: 15,
		alignItems: "center",
		justifyContent: "center",
		elevation: 3,
	},
	iconContainer: { marginBottom: 12 },
	cardLabel: {
		fontSize: 16,
		fontWeight: "600",
		textAlign: "center",
		color: colors.textDark,
	},
	loadingOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.7)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 20,
		borderRadius: 12,
		width: "90%",
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center",
		color: colors.textDark,
	},
	modalSubtitle: {
		fontSize: 15,
		textAlign: "center",
		marginBottom: 20,
		color: colors.textMedium,
	},
	managerRow: {
		paddingVertical: 18,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	managerName: {
		fontSize: 18,
		textAlign: "center",
		color: colors.primary,
		fontWeight: "500",
	},
});

export default RestaurantDashboardScreen;
