// screens/restaurant/TableManagementScreen.js
import React, {
	useContext,
	useEffect,
	useState,
	useMemo,
	useCallback,
} from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	Modal,
} from "react-native";
import { AuthContext } from "../../context/authContext";

import { Ionicons } from "@expo/vector-icons";
import { Button } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import { clearTable, fetchTables } from "../../utils/firebaseUtils";
import TableItem from "../../components/restaurant/TableItem";

const TableManagementScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [tables, setTables] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isActionLoading, setIsActionLoading] = useState(false);

	// --- Modal State ---
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedTable, setSelectedTable] = useState(null);

	// Fetch tables with a real-time listener
	useEffect(() => {
		if (!currentUserData?.uid) {
			setIsLoading(false);
			return;
		}
		const unsubscribe = fetchTables(
			currentUserData.uid,
			(fetchedTables) => {
				// --- FIX: Client-side numeric sorting ---
				const sortedTables = fetchedTables.sort((a, b) => {
					const numA = parseInt((a.name || "").match(/\d+/)?.[0] || 0, 10);
					const numB = parseInt((b.name || "").match(/\d+/)?.[0] || 0, 10);
					return numA - numB;
				});
				setTables(sortedTables);
				setIsLoading(false);
			},
			(error) => {
				console.error(error);
				setIsLoading(false);
			}
		);
		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const handleTablePress = (table) => {
		setSelectedTable(table);
		setIsModalVisible(true);
	};

	const handleClearTable = async () => {
		if (!selectedTable) return;

		setIsActionLoading(true);
		console.log("handleClearTable: Triggered.");
		try {
			await clearTable(selectedTable.id, currentUserData.uid);
			Alert.alert(
				"Success",
				`${selectedTable.name} has been cleared and is now available.`
			);
		} catch (error) {
			console.error("Error clearing table:", error);
			Alert.alert("Error", "Could not clear the table.");
		} finally {
			setIsActionLoading(false);
			setIsModalVisible(false);
		}
	};

	const tableStats = useMemo(() => {
		const available = tables.filter((t) => t.status === "available").length;
		const occupied = tables.filter(
			(t) => t.status === "OCCUPIED" || t.status === "occupied"
		).length;
		const needsCleaning = tables.filter(
			(t) => t.status === "checkedOut"
		).length;
		return { available, occupied, needsCleaning, total: tables.length };
	}, [tables]);

	if (isLoading) {
		return (
			<View style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				<View style={styles.header}>
					<Text style={styles.title}>Table Management</Text>
					<Text style={styles.statsText}>
						{tableStats.available} Available / {tableStats.total} Total
					</Text>
				</View>

				{tables.length === 0 ? (
					<View style={styles.centeredContainer}>
						<Ionicons name="grid-outline" size={60} color={colors.textLight} />
						<Text style={styles.noDataText}>No tables found.</Text>
						{/* Optionally show a "Generate Tables" button for first-time setup */}
					</View>
				) : (
					<FlatList
						data={tables}
						renderItem={({ item }) => (
							<TableItem item={item} onPress={() => handleTablePress(item)} />
						)}
						keyExtractor={(item) => item.id}
						numColumns={3} // Adjust number of columns as you see fit
						contentContainerStyle={styles.tableList}
						showsVerticalScrollIndicator={false}
					/>
				)}

				{/* --- Action Modal --- */}
				{selectedTable && (
					<Modal
						visible={isModalVisible}
						transparent={true}
						animationType="fade"
						onRequestClose={() => setIsModalVisible(false)}
					>
						<TouchableOpacity
							style={styles.modalOverlay}
							activeOpacity={1}
							onPressOut={() => setIsModalVisible(false)}
						>
							<TouchableOpacity style={styles.modalContent} activeOpacity={1}>
								<Text style={styles.modalTitle}>{selectedTable.name}</Text>
								<View style={styles.modalDetailRow}>
									<Text style={styles.modalDetailLabel}>Status:</Text>
									<Text
										style={[
											styles.modalDetailValue,
											{ color: getStatusColor(selectedTable.status) },
										]}
									>
										{selectedTable.status.toUpperCase()}
									</Text>
								</View>
								<View style={styles.modalDetailRow}>
									<Text style={styles.modalDetailLabel}>Capacity:</Text>
									<Text style={styles.modalDetailValue}>
										{selectedTable.capacity} guests
									</Text>
								</View>
								{selectedTable.status === "OCCUPIED" && (
									<Text style={styles.modalInfoText}>
										This table is currently seated. View order details in the
										Chef's Q.
									</Text>
								)}

								<View style={styles.modalActions}>
									{selectedTable.status === "checkedOut" && (
										<Button
											icon="broom"
											mode="contained"
											onPress={handleClearTable}
											loading={isActionLoading}
											disabled={isActionLoading}
											style={{ backgroundColor: colors.primary }}
										>
											Clear & Make Available
										</Button>
									)}
									<Button
										onPress={() => setIsModalVisible(false)}
										mode="outlined"
										style={{ marginTop: 10 }}
									>
										Close
									</Button>
								</View>
							</TouchableOpacity>
						</TouchableOpacity>
					</Modal>
				)}
			</View>
		</SafeAreaView>
	);
};

const getStatusColor = (status) => {
	switch (status) {
		case "available":
			return colors.statusSuccess;
		case "OCCUPIED":
		case "occupied":
			return colors.statusDanger;
		case "checkedOut":
			return colors.statusWarning;
		default:
			return colors.textMedium;
	}
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
	title: { fontSize: 28, fontWeight: "bold", color: colors.textDark },
	statsText: { fontSize: 16, color: colors.textMedium, marginTop: 4 },
	tableList: { padding: 10 },
	noDataText: { fontSize: 18, color: colors.textMedium, marginTop: 20 },
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 25,
		borderRadius: 12,
		width: "95%",
		maxWidth: 400,
	},
	modalTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 20,
		textAlign: "center",
	},
	modalDetailRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	modalDetailLabel: { fontSize: 16, color: colors.textMedium },
	modalDetailValue: { fontSize: 16, fontWeight: "600" },
	modalInfoText: {
		fontSize: 14,
		color: colors.textMedium,
		fontStyle: "italic",
		textAlign: "center",
		marginTop: 15,
	},
	modalActions: { marginTop: 30 },
});

export default TableManagementScreen;
