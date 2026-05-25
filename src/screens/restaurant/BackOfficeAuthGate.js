// screens/restaurant/BackOfficeAuthGate.js
import React, { useState, useEffect, useContext, useRef } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	Alert,
	Modal,
	FlatList,
	TouchableOpacity,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Button } from "react-native-paper";
import { AuthContext } from "../../context/authContext";
import { fetchEmployeesByRole } from "../../utils/firebaseUtils";
import ManagerPinModal from "../../components/restaurant/ManagerPinModal";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { getRestaurantPermissions } from "../../utils/restaurantPermissions";
// This is a simple modal to let the user select which manager is authorizing the action.
const ManagerSelectionModal = ({ isVisible, onClose, managers, onSelect }) => {
	const { t } = useTranslation();
	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>
						{t("manager_authorization_required")}
					</Text>
					<Text style={styles.modalSubtitle}>
						{t(
							"please_select_which_manager_is_present_to_authorize_this_action"
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
				</View>
			</View>
		</Modal>
	);
};

const BackOfficeAuthGate = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const permissions = getRestaurantPermissions(activeSession);
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;

	const [isManagerListVisible, setIsManagerListVisible] = useState(false);
	const [managers, setManagers] = useState([]);
	const [isPinModalVisible, setIsPinModalVisible] = useState(false);
	const [managerToVerify, setManagerToVerify] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	const hasVerifiedRef = useRef(false);
	// useFocusEffect runs every time the screen comes into view, ensuring the check is always fresh.
	useFocusEffect(
		React.useCallback(() => {
			if (hasVerifiedRef.current) return;
			if (!restaurantId) {
				// If for some reason user data isn't loaded, wait.
				setIsLoading(true);
				return;
			}

			const checkPermissions = async () => {
				if (!permissions.canManageBackOffice) {
					Alert.alert(t("access_denied"), t("back_office_managers_only"), [
						{ text: t("ok"), onPress: () => navigation.goBack() },
					]);
					setIsLoading(false);
					return;
				}

				const userRole = currentUserData.role;
				const needsOnboarding = currentUserData.hasSetupEmployees === false;

				// --- THIS IS THE NEW ONBOARDING LOGIC ---
				// If the user is the owner AND they haven't set up employees yet,
				// give them a one-time pass to the back office.
				if (userRole === "owner" && needsOnboarding) {
					console.log(
						"BackOfficeAuthGate: New owner detected. Granting one-time access to Back Office."
					);
					Alert.alert(
						t("welcome_owner"),
						t(
							"to_secure_your_back_office_please_start_by_creating_your_own_owner_profile_on_the_employee_screen_and_setting_a_pin"
						),
						[
							{
								text: t("ok"),
								onPress: () => navigation.replace("BackOffice"),
							},
						] // Use replace to prevent going back to the gate
					);
					return;
				}
				// --- END OF NEW LOGIC ---

				// For all other cases, start the standard PIN verification flow.
				setIsLoading(true);
				try {
					const managerList = (
						await fetchEmployeesByRole(restaurantId, ["manager", "owner"])
					).filter((manager) => manager.isActive !== false);
					if (managerList.length === 0) {
						// This case is a fallback if an owner has somehow deleted all managers including themselves.
						Alert.alert(
							t("access_denied"),
							t(
								"no_managers_are_configured_for_this_restaurant_please_contact_support"
							),
							[{ text: t("ok"), onPress: () => navigation.goBack() }]
						);
					} else {
						setManagers(managerList);
						setIsManagerListVisible(true);
					}
				} catch (error) {
					Alert.alert(t("error"), t("could_not_fetch_manager_list"), [
						{ text: t("ok"), onPress: () => navigation.goBack() },
					]);
				} finally {
					setIsLoading(false);
				}
			};

			checkPermissions();
		}, [
			currentUserData?.uid,
			currentUserData?.restaurantId,
			hasVerifiedRef.current,
			navigation,
			permissions.canManageBackOffice,
			restaurantId,
			t,
		])
	);

	const onSelectManagerForVerification = (manager) => {
		setIsManagerListVisible(false);
		setManagerToVerify(manager);
		setIsPinModalVisible(true);
	};

	const onPinSuccess = (verifiedEmployee) => {
		console.log(`${verifiedEmployee.name} successfully verified!`);
		hasVerifiedRef.current = true;
		navigation.replace("BackOffice");
	};

	const onModalClose = () => {
		setIsManagerListVisible(false);
		setIsPinModalVisible(false);
		if (navigation.canGoBack()) {
			navigation.goBack();
		}
	};

	// This screen just shows a loading indicator while it performs its permission checks.
	return (
		<View style={styles.container}>
			<ActivityIndicator size="large" color={colors.primary} />
			<Text style={styles.loadingText}>{t("verifying_permissions")}...</Text>

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
					restaurantId={restaurantId}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	loadingText: { marginTop: 15, fontSize: 16, color: colors.textMedium },
	// Modal Styles
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.7)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 20,
		borderRadius: 12,
		width: "100%",
		maxWidth: 400,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 10,
		textAlign: "center",
	},
	modalSubtitle: {
		fontSize: 15,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 20,
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

export default BackOfficeAuthGate;
