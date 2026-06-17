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
import { useTranslation } from "react-i18next";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import TableItem from "./TableItem";
import { fetchEmployees, fetchTables } from "../../utils/firebaseUtils";
import PlatformSelect from "../global/PlatformSelect";

const TableAndServerSelectionModal = ({
	isVisible,
	onClose,
	onConfirm, // Callback: onConfirm({ table, server })
	currentRestaurantId,
	numInParty, // Number of people in the check-in party
	isProcessing,
}) => {
	const { t } = useTranslation();
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
				setError(t('could_not_load_server_list_error'));
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
							(table) =>
								table.status === "available" && table.isActive !== false
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
					setError(t('could_not_process_table_data_error'));
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
				t('no_table_selected_title'),
				t('select_table_to_seat_party_message')
			);
			return;
		}
		if (!selectedServer) {
			Alert.alert(t('no_server_selected_title'), t('assign_server_to_table_message'));
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
					{t('no_suitable_tables_available_message', { numInParty: numInParty })}
				</Text>
			);
		}
		return (
			<>
				<Text style={styles.sectionTitle}>{t('select_available_table_title')}</Text>
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

				<Text style={styles.sectionTitle}>{t('assign_server_title')}</Text>
				<View style={styles.pickerContainer}>
					<PlatformSelect
						value={selectedServer?.id || null}
						onValueChange={(itemValue) => {
							if (itemValue) {
								const serverObject = servers.find((s) => s.id === itemValue);
								setSelectedServer(serverObject);
							} else {
								setSelectedServer(null);
							}
						}}
						title={t("assign_server_title")}
						placeholder={t("select_server_placeholder")}
						options={servers.map((server) => ({
							label: `${server.firstName} ${server.lastName}`,
							value: server.id,
						}))}
						style={styles.selectButton}
						pickerStyle={styles.picker}
						itemStyle={styles.pickerItem}
					/>
				</View>
			</>
		);
	};
	return (
		<Modal visible={isVisible} animationType="slide" onRequestClose={onClose}>
			<SafeAreaView style={styles.modalContainer}>
				<View style={styles.header}>
					<Text style={styles.modalTitle}>
						{t('seat_party_title', { numInParty: numInParty })}
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
						{t('cancel_button')}
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
						{t('confirm_and_seat_button')}
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
	pickerItem: { color: colors.textDark, fontSize: 16 },
	selectButton: { borderWidth: 0, backgroundColor: colors.surfaceWhite },
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
