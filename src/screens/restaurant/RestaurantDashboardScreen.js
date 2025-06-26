// screens/restaurant/RestaurantDashboardScreen.js
import React, { useContext, useState, useCallback } from "react";
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

// Reusable card component for the navigation grid
const DashboardCard = ({ label, iconName, onPress }) => (
	<TouchableOpacity style={styles.card} onPress={onPress}>
		<View style={styles.iconContainer}>
			<MaterialCommunityIcons
				name={iconName}
				size={40}
				color={colors.primary}
			/>
		</View>
		<Text style={styles.cardLabel}>{label}</Text>
	</TouchableOpacity>
);

// A simple modal to let the user select which manager is present
const ManagerSelectionModal = ({ isVisible, onClose, managers, onSelect }) => (
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
				<Text style={styles.modalTitle}>Manager Authorization</Text>
				<Text style={styles.modalSubtitle}>
					Please select which manager is present to authorize this action.
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
					Cancel
				</Button>
			</TouchableOpacity>
		</TouchableOpacity>
	</Modal>
);

const RestaurantDashboardScreen = () => {
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
				"Error",
				"Could not identify your restaurant. Please log in again."
			);
			return;
		}

		// 1. One-time pass for new owners to complete setup
		if (userRole === "owner" && needsOnboarding) {
			Alert.alert(
				"Welcome, Owner!",
				"To secure your Back Office, please start by creating your own 'Owner' profile on the Employee screen and setting a PIN.",
				[
					{
						text: "Continue to Setup",
						onPress: () =>
							navigation.navigate("BackOfficeNavigator", {
								screen: "EmployeeScreen",
							}),
					},
				]
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
					"Access Denied",
					"No managers are configured for this restaurant.",
					[{ text: "OK" }]
				);
				return;
			}
			setManagers(managerList);
			setIsManagerListVisible(true);
		} catch (error) {
			Alert.alert("Error", "Could not fetch manager list.");
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
		await startWorkDay();
		setIsActionLoading(false);
	};

	const handleEndDay = () => {
		Alert.alert(
			"End Work Day",
			"Are you sure you want to end the current work day?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "End Day",
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						await endWorkDay();
						setIsActionLoading(false);
					},
				},
			]
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
					<Text style={styles.statusTitle}>Restaurant is OPEN</Text>
					<Text style={styles.statusSubtitle}>
						Work day started at {startTime}
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
						End Work Day
					</Button>
				</View>
			);
		}
		return (
			<View style={styles.statusContent}>
				<Ionicons name="moon-outline" size={60} color={colors.textMedium} />
				<Text style={styles.statusTitle}>Restaurant is CLOSED</Text>
				<Text style={styles.statusSubtitle}>
					Tap below to begin a new work day.
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
					Start Work Day
				</Button>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView>
				<View style={styles.header}>
					<Text style={styles.welcomeText}>
						Welcome, {currentUserData?.firstName || "Manager"}
					</Text>
					<Text style={styles.title}>
						{currentUserData?.restaurantName || "Dashboard"}
					</Text>
				</View>

				<View style={styles.statusContainer}>{renderStatusContent()}</View>

				<View style={styles.navigationGrid}>
					<DashboardCard
						label="Customers Waiting"
						iconName="account-clock-outline"
						onPress={() => navigation.navigate("Checkins")}
					/>
					<DashboardCard
						label="Chef's Q"
						iconName="silverware-fork-knife"
						onPress={() => navigation.navigate("ChefsQ")}
					/>
					<DashboardCard
						label="Table View"
						iconName="table-chair"
						onPress={() => navigation.navigate("Tables")}
					/>
					<DashboardCard
						label="Back Office"
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
	},
	modalSubtitle: { fontSize: 15, textAlign: "center", marginBottom: 20 },
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
