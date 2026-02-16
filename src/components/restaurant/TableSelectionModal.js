import React, { useEffect, useState, useContext } from "react";
import { View, Text, Modal, FlatList, StyleSheet } from "react-native";
import { useTranslation } from 'react-i18next';
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

import ServerAssignmentModal from "./ServerAssignmentModal";
import { functions } from "../../config/firebase";
import { httpsCallable } from "@react-native-firebase/functions";

const TableSelectionModal = ({
	isVisible,
	onClose,
	selectedCheckinId,
	currentRestaurantId,
	selectedCustomerId,
	numInParty,
}) => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const [tables, setTables] = useState([]);
	const [selectedTableId, setSelectedTableId] = useState(null);
	const [selectedTableNumber, setSelectedTableNumber] = useState(null);
	const [isServerModalVisible, setisServerModalVisible] = useState(false);
	const [employees, setEmployees] = useState(null);
	const [assignedServer, setAssignedServer] = useState(null);
	const [table, setTable] = useState(null);

	const [server, setServer] = useState(null);

	// Fetch and subscribe to tables in real-time
	useEffect(() => {
		if (isVisible) {
			const unsubscribe = fetchTables(currentRestaurantId, (allTables) => {
				const availableTables = allTables.filter(
					(table) => table.status === "available"
				);
				setTables(availableTables); // Update available tables in state
			});

			// Unsubscribe from the snapshot listener when the modal closes
			return () => unsubscribe;
		}
	}, [isVisible, currentRestaurantId]);

	const handleTableSelect = (table) => {
		setTable(table);
		if (setTable) {
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
			setServer(selectedServer);
		} catch (error) {
			console.log("Error assigning server", error);
		}
	};

	const handleConfirm = async () => {
		if (table && server) {
			try {
				const handleCheckInResponseFunction = httpsCallable(
					functions,
					"handleCheckInResponse"
				);

				const result = await handleCheckInResponseFunction({
					checkInId: selectedCheckinId,
					action: "ACCEPTED",
					table,
					server,
					customerId: selectedCustomerId,
					restaurantId: currentRestaurantId,
					numInParty: numInParty,
				});

				if (result.data.success) {
					setisServerModalVisible(true);
				} else {
					// Handle error from the Cloud Function
					console.error("Error accepting check-in:", result.data.error);
					Alert.alert(
						t('error_title'),
						result.data.error || t('failed_to_accept_check_in_error')
					);
				}

				// 3. Send notification to the customer
				await sendNotification(selectedCustomerId, table);
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
				<Text style={styles.title}>{t('tables_available_title')}</Text>

				<FlatList
					data={tables}
					renderItem={({ item }) => (
						<TableItem item={item} onPress={() => handleTableSelect(item)} />
					)}
					keyExtractor={(item) => item.id}
					showsVerticalScrollIndicator={false}
				/>
				<View style={styles.buttonContainer}>
					<Button title={t('cancel_button')} onPress={onClose} />
					<Button title={t('confirm_button')} onPress={handleConfirm} disabled={!table} />
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

