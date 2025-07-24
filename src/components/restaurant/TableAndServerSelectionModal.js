// src/components/restaurant/TableAndServerSelectionModal.js
import React, { useState, useEffect, useCallback } from "react";
import {
	View,
	Text,
	Modal,
	StyleSheet,
	FlatList,
	Alert,
	ActivityIndicator,
	SafeAreaView,
	TouchableOpacity,
} from "react-native";
import { Button } from "react-native-paper";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import TableItem from "./TableItem";
import { fetchEmployees, fetchTables } from "../../utils/firebaseUtils";

const TableAndServerSelectionModal = ({
	isVisible,
	onClose,
	onConfirm, // Callback: onConfirm({ table, server })
	currentRestaurantId,
	numInParty, // Number of people in the check-in party
	isProcessing,
}) => {
	const [tables, setTables] = useState([]);
	const [servers, setServers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	const [selectedTable, setSelectedTable] = useState(null);
	const [selectedServer, setSelectedServer] = useState(null);

	// Fetch both tables and servers when the modal becomes visible
	useEffect(() => {
		if (!isVisible || !currentRestaurantId) return;

		setIsLoading(true);
		setError(null);

		// Fetch servers once when the modal opens.
		const loadServers = async () => {
			try {
				const serverEmployees = await fetchEmployees(
					currentRestaurantId,
					"server"
				);
				setServers(serverEmployees || []);
			} catch (err) {
				console.error("Error fetching servers:", err);
				setError("Could not load server list.");
			}
		};

		// Set up the real-time listener for tables.
		const unsubscribeFromTables = fetchTables(
			currentRestaurantId,
			(allTables) => {
				// This is the callback that receives the tables data.
				try {
					if (Array.isArray(allTables)) {
						// Filter tables that are available and can fit the party
						const suitableTables = allTables.filter(
							(table) => table.status === "available"
						);
						const sortedTables = suitableTables.sort((a, b) => {
							// Use regex to extract numbers from the table names
							const numA = parseInt((a.name || "").match(/\d+/)?.[0] || 0, 10);
							const numB = parseInt((b.name || "").match(/\d+/)?.[0] || 0, 10);
							return numA - numB;
						});
						setTables(sortedTables);
					} else {
						// Handle case where allTables is not an array
						console.warn(
							"fetchTables callback did not receive an array:",
							allTables
						);
						setTables([]);
					}
				} catch (err) {
					console.error("Error filtering tables:", err);
					setError("Could not process table data.");
				} finally {
					// Consider loading complete after the first data snapshot is processed
					if (isLoading) setIsLoading(false);
				}
			}
		);

		loadServers();

		// Return the cleanup function for the real-time listener
		return () => {
			if (unsubscribeFromTables) {
				unsubscribeFromTables();
			}
		};
	}, [isVisible, currentRestaurantId, numInParty]);

	const handleConfirm = () => {
		if (!selectedTable) {
			Alert.alert(
				"No Table Selected",
				"Please select a table to seat the party."
			);
			return;
		}
		if (!selectedServer) {
			Alert.alert("No Server Selected", "Please assign a server to the table.");
			return;
		}
		onConfirm({ table: selectedTable, server: selectedServer });
	};

	const renderContent = () => {
		if (isLoading) {
			return (
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={{ flex: 1 }}
				/>
			);
		}
		if (error) {
			return <Text style={styles.errorText}>{error}</Text>;
		}
		if (tables.length === 0) {
			return (
				<Text style={styles.noDataText}>
					No suitable tables are currently available for a party of {numInParty}
					.
				</Text>
			);
		}
		return (
			<>
				<Text style={styles.sectionTitle}>1. Select an Available Table</Text>
				<FlatList
					data={tables}
					renderItem={({ item }) => (
						<TableItem
							item={item}
							onPress={setSelectedTable}
							isSelected={selectedTable?.id === item.id}
						/>
					)}
					keyExtractor={(item) => item.id}
					numColumns={2}
					style={styles.tableList}
				/>

				<Text style={styles.sectionTitle}>2. Assign a Server</Text>
				<View style={styles.pickerContainer}>
					<Picker
						selectedValue={selectedServer?.id}
						onValueChange={(itemValue) => {
							if (itemValue) {
								const serverObject = servers.find((s) => s.id === itemValue);
								setSelectedServer(serverObject);
							} else {
								setSelectedServer(null);
							}
						}}
						style={styles.picker}
						itemStyle={styles.pickerItem} // Added for iOS styling
					>
						<Picker.Item
							label="Select a server..."
							value={null}
							color={colors.textLight}
						/>
						{servers.map((server) => (
							<Picker.Item
								key={server.id}
								label={`${server.firstName} ${server.lastName}`}
								value={server.id}
							/>
						))}
					</Picker>
				</View>
			</>
		);
	};
	return (
		<Modal visible={isVisible} animationType="slide" onRequestClose={onClose}>
			<SafeAreaView style={styles.modalContainer}>
				<View style={styles.header}>
					<Text style={styles.modalTitle}>
						Seat Party ({numInParty} guests)
					</Text>
					<TouchableOpacity onPress={onClose} style={styles.closeButton}>
						<Ionicons name="close-circle" size={30} color={colors.textMedium} />
					</TouchableOpacity>
				</View>

				<View style={styles.content}>{renderContent()}</View>

				<View style={styles.footer}>
					<Button
						onPress={onClose}
						mode="outlined"
						style={styles.modalButton}
						labelStyle={{ color: colors.textDark }}
					>
						Cancel
					</Button>
					<Button
						onPress={handleConfirm}
						mode="contained"
						disabled={!selectedTable || !selectedServer || isProcessing}
						style={[
							styles.modalButton,
							styles.confirmButton,
							(!selectedTable || !selectedServer || isProcessing) &&
								styles.disabledButton,
						]}
						labelStyle={{ color: colors.textOnPrimaryBrand }}
						loading={isProcessing}
					>
						Confirm & Seat
					</Button>
				</View>
			</SafeAreaView>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalContainer: { flex: 1, backgroundColor: colors.backgroundLight },
	header: {
		padding: 20,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	modalTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
	},
	content: { flex: 1, padding: 10 },
	footer: {
		flexDirection: "row",
		justifyContent: "space-around",
		padding: 15,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	modalButton: { flex: 1, marginHorizontal: 8 },
	sectionTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: colors.textMedium,
		margin: 15,
		marginBottom: 5,
	},
	tableList: { flexGrow: 0 }, // Prevent FlatList from taking all space
	pickerContainer: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		marginHorizontal: 15,
		backgroundColor: colors.surfaceWhite,
	},
	picker: { height: 50, color: colors.textMedium }, // For Android consistency
	errorText: {
		textAlign: "center",
		color: colors.statusDanger,
		fontSize: 16,
		marginTop: 40,
	},
	noDataText: {
		textAlign: "center",
		color: colors.textMedium,
		fontSize: 16,
		marginTop: 40,
		paddingHorizontal: 20,
	},
	disabledButton: {
		backgroundColor: colors.textLight, // A muted gray color
		opacity: 0.7,
	},
});

export default TableAndServerSelectionModal;
