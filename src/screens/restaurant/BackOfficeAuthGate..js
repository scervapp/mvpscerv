// screens/restaurant/BackOfficeAuthGate.js
import React, { useState, useEffect, useContext } from "react";
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
import { fetchEmployees } from "../../utils/firebaseUtils";
import ManagerPinModal from "../../components/restaurant/ManagerPinModal";
import colors from "../../utils/styles/appStyles";

// This is a simple modal to let the user select which manager is authorizing the action.
const ManagerSelectionModal = ({ isVisible, onClose, managers, onSelect }) => (
	<Modal
		visible={isVisible}
		transparent={true}
		animationType="fade"
		onRequestClose={onClose}
	>
		<View style={styles.modalOverlay}>
			<View style={styles.modalContent}>
				<Text style={styles.modalTitle}>Manager Authorization Required</Text>
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
			</View>
		</View>
	</Modal>
);

const BackOfficeAuthGate = () => {
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);

	const [isManagerListVisible, setIsManagerListVisible] = useState(false);
	const [managers, setManagers] = useState([]);
	const [isPinModalVisible, setIsPinModalVisible] = useState(false);
	const [managerToVerify, setManagerToVerify] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	useFocusEffect(
		React.useCallback(() => {
			const checkPermissions = async () => {
				const userRole = currentUserData?.role;
				console.log(
					`BackOfficeAuthGate: Checking permissions for role: ${userRole}`
				);

				if (userRole === "manager" || userRole === "owner") {
					// If user is already a manager, navigate them directly to the Back Office.
					console.log(
						"BackOfficeAuthGate: Manager/Owner detected. Navigating to Back Office."
					);
					navigation.replace("BackOffice"); // Use replace to avoid a back button
				} else {
					// If user is a worker, fetch the list of managers for PIN verification.
					console.log(
						"BackOfficeAuthGate: Worker detected. Fetching manager list for PIN override."
					);
					setIsLoading(true);
					try {
						const managerList = await fetchEmployees(currentUserData.uid, [
							"manager",
							"owner",
						]);
						if (managerList.length === 0) {
							Alert.alert(
								"Access Denied",
								"No managers are configured for this restaurant. Please contact the owner.",
								[
									{
										text: "OK",
										onPress: () => navigation.navigate("Dashboard"),
									},
								]
							);
						} else {
							setManagers(managerList);
							setIsManagerListVisible(true);
						}
					} catch (error) {
						Alert.alert("Error", "Could not fetch manager list.", [
							{ text: "OK", onPress: () => navigation.navigate("Dashboard") },
						]);
					} finally {
						setIsLoading(false);
					}
				}
			};

			checkPermissions();
		}, [currentUserData])
	);

	// Called when a manager is selected from the first modal
	const onSelectManagerForVerification = (manager) => {
		setIsManagerListVisible(false);
		setManagerToVerify(manager);
		setIsPinModalVisible(true);
	};

	// This is the 'onSuccess' callback for the PIN modal
	const onPinSuccess = (verifiedEmployee) => {
		console.log(`${verifiedEmployee.name} successfully verified!`);
		setIsPinModalVisible(false);
		setManagerToVerify(null);
		// On success, navigate to the Back Office
		navigation.replace("BackOffice");
	};

	const onModalClose = () => {
		setIsManagerListVisible(false);
		setIsPinModalVisible(false);
		navigation.navigate("Dashboard"); // Go back to dashboard if they cancel
	};

	return (
		<View style={styles.container}>
			<ActivityIndicator size="large" color={colors.primary} />
			<Text style={styles.loadingText}>Verifying Permissions...</Text>

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
		marginBottom: 20,
		textAlign: "center",
	},
	managerRow: {
		paddingVertical: 18,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	managerName: { fontSize: 18, textAlign: "center", color: colors.primary },
});

export default BackOfficeAuthGate;
