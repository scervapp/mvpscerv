import React, { useEffect, useState, useContext } from "react";
import { View, Text, Modal, FlatList, StyleSheet } from "react-native";
import {
	fetchTables,
	updateCheckIn,
	updateTableStatus,
	sendNotification,
	fetchEmployees,
} from "../../utils/firebaseUtils";
import { AuthContext } from "../../context/authContext";
import TableItem from "./TableItem";
import { Button } from "react-native";
import { httpsCallable } from "firebase/functions";
import ServerAssignmentModal from "./ServerAssignmentModal";
import { functions } from "../../config/firebase";

const TableSelectionModal = ({
	isVisible,
	onClose,
	selectedCheckinId,
	currentRestaurantId,
	selectedCustomerId,
}) => {
	const { currentUserData } = useContext(AuthContext);
	const [tables, setTables] = useState([]);
	const [selectedTableId, setSelectedTableId] = useState(null);
	const [selectedTableNumber, setSelectedTableNumber] = useState(null);
	const [isServerModalVisible, setisServerModalVisible] = useState(false);
	const [employees, setEmployees] = useState(null);
	const [assignedServer, setAssignedServer] = useState(null);

	useEffect(() => {
		// Function to fetch tables from firestore
		const fetchMyTables = async () => {
			const allTables = await fetchTables(currentRestaurantId);
			const availableTables = allTables.filter(
				(table) => table.status === "available"
			);
			setTables(availableTables);
		};

		// Only fetch tables if the modal is visible
		if (isVisible) {
			fetchMyTables();
		}
	}, [isVisible, currentRestaurantId]);

	const handleTableSelect = (table) => {
		setSelectedTableId(table.id);
		setSelectedTableNumber(table.name);
		if (setSelectedTableId) {
			setisServerModalVisible(true);
		}
	};

	useEffect(() => {
		// Fetch my employees with the role of server
		const fetchMyEmployees = async () => {
			const allEmployees = await fetchEmployees(currentRestaurantId);

			const serverEmployees = allEmployees.filter(
				(employee) => employee.role === "server"
			);

			setEmployees(serverEmployees);
		};

		fetchMyEmployees();
	}, [currentRestaurantId, selectedTableId]);

	const onAssignServer = async (selectedServer) => {
		try {
			setAssignedServer(selectedServer);
		} catch (error) {
			console.log("Error assigning server", error);
		}
	};

	const handleConfirm = async () => {
		if (selectedTableId && assignedServer) {
			try {
				const handleCheckInResponseFunction = httpsCallable(
					functions,
					"handleCheckInResponse"
				);

				console.log("Assigned Server", assignedServer);

				const result = await handleCheckInResponseFunction({
					checkInId: selectedCheckinId,
					action: "ACCEPTED",
					tableNumber: selectedTableNumber,
					employeeName:
						assignedServer.firstName + " " + assignedServer.lastName,
					serverId: assignedServer.id,
				});

				if (result.data.success) {
					setisServerModalVisible(true);
				} else {
					// Handle error from the Cloud Function
					console.error("Error accepting check-in:", result.data.error);
					Alert.alert(
						"Error",
						result.data.error || "Failed to accept check-in. Please try again."
					);
				}

				// 3. Send notification to the customer
				await sendNotification(selectedCustomerId, selectedTableNumber);
			} catch (error) {
				console.log("Error in confirmation flow", error);
			} finally {
				onClose();
			}
		}
	};

	return (
		<Modal>
			<View style={styles.container}>
				<Text style={styles.title}>Tables Available</Text>

				<FlatList
					data={tables}
					renderItem={({ item }) => (
						<TableItem item={item} onPress={() => handleTableSelect(item)} />
					)}
					keyExtractor={(item) => item.id}
					showsVerticalScrollIndicator={false}
				/>
				<View style={styles.buttonContainer}>
					<Button title="Cancel" onPress={onClose} />
					<Button
						title="Confirm"
						onPress={handleConfirm}
						disabled={!selectedTableId}
					/>
				</View>
				{/*Server assignment modal*/}
				{isServerModalVisible && (
					<ServerAssignmentModal
						isVisible={isServerModalVisible}
						onClose={() => setisServerModalVisible(false)}
						servers={employees}
						onAssignServer={onAssignServer}
					/>
				)}
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#fff",
		padding: 20,
	},
	title: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 10,
	},
	tableList: {
		marginBottom: 20, // Space before buttons
	},
	buttonContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
	},
});

export default TableSelectionModal;
