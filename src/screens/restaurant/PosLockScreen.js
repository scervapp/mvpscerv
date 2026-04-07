// screens/restaurant/PosLockScreen.js
import React, { useState, useEffect, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	Alert,
	FlatList,
	TouchableOpacity,
	SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { fetchEmployees } from "../../utils/firebaseUtils"; // Fetch ALL employees, not just managers
import ManagerPinModal from "../../components/restaurant/ManagerPinModal";
import colors from "../../utils/styles/appStyles";

const PosLockScreen = () => {
	const { t } = useTranslation();
	const { currentUserData, logout } = useContext(AuthContext);
	const { startSession } = useEmployeeSession();

	const [staffList, setStaffList] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	// Pin Modal State
	const [isPinModalVisible, setIsPinModalVisible] = useState(false);
	const [employeeToVerify, setEmployeeToVerify] = useState(null);

	// Load ALL staff for the PIN pad list
	useEffect(() => {
		const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
		if (!restaurantId) return;

		const loadStaff = async () => {
			try {
				const employees = await fetchEmployees(restaurantId);
				setStaffList(employees);
			} catch (error) {
				console.error("Failed to load staff list:", error);
			} finally {
				setIsLoading(false);
			}
		};

		loadStaff();
	}, [currentUserData?.uid, currentUserData?.restaurantId]);

	// Handle initial owner setup (from your original logic)
	useEffect(() => {
		if (
			currentUserData?.role === "owner" &&
			currentUserData?.hasSetupEmployees === false
		) {
			Alert.alert(
				t("welcome_owner"),
				t("to_secure_your_pos_please_create_an_employee_profile_and_pin"),
				[
					{
						text: t("ok"),
						onPress: () => {
							// Temporarily unlock them as owner so they can go to Back Office
							startSession({
								id: currentUserData.uid,
								name: "Owner Setup",
								role: "owner",
							});
						},
					},
				],
			);
		}
	}, [currentUserData]);

	const handleEmployeeSelect = (employee) => {
		setEmployeeToVerify(employee);
		setIsPinModalVisible(true);
	};

	const onPinSuccess = (verifiedEmployeeFromBackend) => {
		setIsPinModalVisible(false);
		// 🚨 THE FIX: Merge the fully loaded local profile with the backend confirmation
		// This guarantees activeSession has her 'jobTitle', 'firstName', 'lastName', etc.
		startSession({
			...employeeToVerify,
			...verifiedEmployeeFromBackend,
		});
	};

	if (isLoading) {
		return (
			<View style={styles.container}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>{t("loading_pos")}...</Text>
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Scerv POS</Text>

				<Text style={styles.subtitle}>{t("select_your_name_to_unlock")}</Text>
			</View>

			<FlatList
				data={staffList}
				keyExtractor={(item) => item.id}
				numColumns={2}
				contentContainerStyle={styles.staffGrid}
				renderItem={({ item }) => (
					<TouchableOpacity
						style={styles.staffCard}
						onPress={() => handleEmployeeSelect(item)}
					>
						<View style={styles.avatarCircle}>
							<Text style={styles.avatarText}>
								{item.firstName?.charAt(0)}
								{item.lastName?.charAt(0)}
							</Text>
						</View>
						<Text style={styles.staffName} numberOfLines={1}>
							{item.firstName} {item.lastName}
						</Text>
						<Text style={styles.staffRole}>
							{(item.jobTitle || item.role).toUpperCase()}
						</Text>
					</TouchableOpacity>
				)}
			/>

			{/* Logout the generic device account entirely */}
			<TouchableOpacity style={styles.logoutBtn} onPress={logout}>
				<Text style={styles.logoutText}>{t("logout_device")}</Text>
			</TouchableOpacity>

			{employeeToVerify && (
				<ManagerPinModal
					isVisible={isPinModalVisible}
					onClose={() => setIsPinModalVisible(false)}
					onSuccess={onPinSuccess}
					employeeToVerify={employeeToVerify}
					restaurantId={currentUserData?.uid}
				/>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		alignItems: "center",
	},
	loadingText: { marginTop: 15, fontSize: 16, color: colors.textMedium },
	header: { alignItems: "center", marginTop: 40, marginBottom: 30 },
	title: {
		fontSize: 32,
		fontWeight: "900",
		color: colors.primary,
		letterSpacing: 2,
	},
	subtitle: { fontSize: 16, color: colors.textMedium, marginTop: 5 },
	staffGrid: { paddingHorizontal: 15 },
	staffCard: {
		backgroundColor: colors.surfaceWhite,
		width: 150,
		padding: 20,
		margin: 10,
		borderRadius: 16,
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	avatarCircle: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: colors.primary + "20",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 10,
	},
	avatarText: { fontSize: 24, fontWeight: "bold", color: colors.primary },
	staffName: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
	},
	staffRole: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 4,
		fontWeight: "600",
	},
	logoutBtn: { marginBottom: 30, padding: 15 },
	logoutText: { color: colors.statusDanger, fontWeight: "bold" },
});

export default PosLockScreen;
