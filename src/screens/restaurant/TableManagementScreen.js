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
import { Button, Divider, Switch, TextInput } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import { clearTable, fetchTables } from "../../utils/firebaseUtils";
import TableItem from "../../components/restaurant/TableItem";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import * as Yup from "yup";
import { Formik } from "formik";

const AddEditTableModal = ({
	isVisible,
	onClose,
	onSubmit,
	initialData = null,
	isLoading,
	onDelete,
}) => {
	const validationSchema = Yup.object().shape({
		name: Yup.string().required("Table name is required."),
		capacity: Yup.number()
			.min(1, "Capacity must be at least 1")
			.required("Capacity is required.")
			.typeError("Must be a number"),
	});

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
					<Text style={styles.modalTitle}>
						{initialData ? `Edit ${initialData.name}` : "Add New Table"}
					</Text>
					<Formik
						initialValues={{
							name: initialData?.name || "",
							capacity: initialData?.capacity?.toString() || "",
						}}
						validationSchema={validationSchema}
						enableReinitialize // Important for pre-filling form when editing
						onSubmit={onSubmit}
					>
						{({
							handleChange,
							handleBlur,
							handleSubmit,
							values,
							errors,
							touched,
						}) => (
							<>
								<TextInput
									style={styles.input}
									placeholder="Table Name (e.g., 'Patio 5')"
									value={values.name}
									onChangeText={handleChange("name")}
									onBlur={handleBlur("name")}
									placeholderTextColor={colors.textLight}
								/>
								{touched.name && errors.name && (
									<Text style={styles.errorText}>{errors.name}</Text>
								)}
								<TextInput
									style={styles.input}
									placeholder="Seating Capacity"
									value={values.capacity}
									onChangeText={handleChange("capacity")}
									onBlur={handleBlur("capacity")}
									keyboardType="number-pad"
									placeholderTextColor={colors.textLight}
								/>
								{touched.capacity && errors.capacity && (
									<Text style={styles.errorText}>{errors.capacity}</Text>
								)}
								<View style={styles.modalActions}>
									<Button
										onPress={onClose}
										mode="outlined"
										style={styles.modalButton}
									>
										Cancel
									</Button>
									<Button
										onPress={handleSubmit}
										mode="contained"
										loading={isLoading}
										disabled={isLoading}
										style={[
											styles.modalButton,
											{ backgroundColor: colors.primary },
										]}
									>
										{initialData ? "Save Changes" : "Add Table"}
									</Button>
								</View>
							</>
						)}
					</Formik>

					{/* Delete button only shows when editing an existing table */}
					{initialData && (
						<View style={styles.deleteAction}>
							<Divider style={styles.divider} />
							<Button
								icon="trash-can-outline"
								mode="contained"
								onPress={onDelete}
								loading={isLoading}
								disabled={isLoading}
								color={colors.statusDanger}
							>
								Delete Table
							</Button>
						</View>
					)}
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
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

const TableManagementScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [tables, setTables] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isActionLoading, setIsActionLoading] = useState(false);

	const [isEditMode, setIsEditMode] = useState(false);
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedTable, setSelectedTable] = useState(null);

	const addTableFunction = httpsCallable(functions, "addTable");
	const updateTableFunction = httpsCallable(functions, "updateTable");
	const deleteTableFunction = httpsCallable(functions, "deleteTable");

	useEffect(() => {
		if (!currentUserData?.uid) {
			setIsLoading(false);
			return;
		}
		const unsubscribe = fetchTables(currentUserData.uid, (fetchedTables) => {
			const sortedTables = (fetchedTables || []).sort((a, b) => {
				const numA = parseInt((a.name || "").match(/\d+/)?.[0] || 0, 10);
				const numB = parseInt((b.name || "").match(/\d+/)?.[0] || 0, 10);
				return numA - numB;
			});
			setTables(sortedTables);
			setIsLoading(false);
		});
		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const handleTablePress = (table) => {
		setSelectedTable(table);
		setIsModalVisible(true);
	};

	const handleClearTable = async () => {
		if (!selectedTable) return;
		setIsActionLoading(true);
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

	const handleAddEditSubmit = async (values) => {
		setIsActionLoading(true);
		const restaurantId = currentUserData.uid;
		try {
			if (selectedTable) {
				await updateTableFunction({
					restaurantId,
					tableId: selectedTable.id,
					...values,
				});
				Alert.alert("Success", "Table updated successfully.");
			} else {
				await addTableFunction({ restaurantId, ...values });
				Alert.alert("Success", "New table added successfully.");
			}
		} catch (error) {
			console.error("Error saving table:", error);
			Alert.alert("Error", error.message || "Could not save the table.");
		} finally {
			setIsActionLoading(false);
			setIsModalVisible(false);
			setSelectedTable(null);
		}
	};

	const handleDeleteTable = () => {
		if (!selectedTable || selectedTable.status === "OCCUPIED") {
			Alert.alert(
				"Cannot Delete",
				"Occupied tables cannot be deleted. Please check out the guests first."
			);
			return;
		}
		Alert.alert(
			"Confirm Deletion",
			`Are you sure you want to permanently delete ${selectedTable.name}?`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						try {
							await deleteTableFunction({
								restaurantId: currentUserData.uid,
								tableId: selectedTable.id,
							});
						} catch (error) {
							Alert.alert("Error", error.message || "Could not delete table.");
						} finally {
							setIsActionLoading(false);
							setIsModalVisible(false);
							setSelectedTable(null);
						}
					},
				},
			]
		);
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
					<View style={styles.editToggleContainer}>
						<Text style={styles.editToggleLabel}>Edit Floor Plan</Text>
						<Switch
							value={isEditMode}
							onValueChange={setIsEditMode}
							color={colors.primary}
						/>
					</View>
				</View>

				{tables.length === 0 ? (
					<View style={styles.centeredContainer}>
						<Ionicons name="grid-outline" size={60} color={colors.textLight} />
						<Text style={styles.noDataText}>
							No tables found. Use Edit Mode to add your first table.
						</Text>
					</View>
				) : (
					<FlatList
						data={tables}
						renderItem={({ item }) => (
							<TableItem
								item={item}
								// --- THE FIX IS HERE ---
								// Always call handleTablePress. The modal logic will decide what to show.
								onPress={() => handleTablePress(item)}
							/>
						)}
						keyExtractor={(item) => item.id}
						numColumns={3}
						contentContainerStyle={styles.tableList}
						showsVerticalScrollIndicator={false}
					/>
				)}

				{isEditMode && (
					<Button
						icon="plus-circle"
						mode="contained"
						onPress={() => handleTablePress(null)}
						style={styles.fab}
					>
						Add Table
					</Button>
				)}

				{selectedTable && !isEditMode && (
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
							<TouchableOpacity
								style={styles.statusModalContent}
								activeOpacity={1}
							>
								<Text style={styles.modalTitle}>{selectedTable?.name}</Text>
								<View style={styles.modalDetailRow}>
									<Text style={styles.modalDetailLabel}>Status:</Text>
									<Text
										style={[
											styles.modalDetailValue,
											{ color: getStatusColor(selectedTable?.status) },
										]}
									>
										{(selectedTable?.status || "UNKNOWN").toUpperCase()}
									</Text>
								</View>
								<View style={styles.modalDetailRow}>
									<Text style={styles.modalDetailLabel}>Capacity:</Text>
									<Text style={styles.modalDetailValue}>
										{selectedTable?.capacity} guests
									</Text>
								</View>

								<View style={styles.modalActions}>
									{selectedTable?.status === "checkedOut" && (
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

				{isModalVisible &&
					(isEditMode ? (
						<AddEditTableModal
							isVisible={isModalVisible}
							onClose={() => {
								setIsModalVisible(false);
								setSelectedTable(null);
							}}
							onSubmit={handleAddEditSubmit}
							onDelete={handleDeleteTable}
							initialData={selectedTable}
							isLoading={isActionLoading}
						/>
					) : (
						// This is the status/action modal for when NOT in Edit Mode
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
								<TouchableOpacity
									style={styles.statusModalContent}
									activeOpacity={1}
								>
									<Text style={styles.modalTitle}>{selectedTable?.name}</Text>
									<View style={styles.modalDetailRow}>
										<Text style={styles.modalDetailLabel}>Status:</Text>
										<Text
											style={[
												styles.modalDetailValue,
												{ color: getStatusColor(selectedTable?.status) },
											]}
										>
											{selectedTable?.status?.toUpperCase()}
										</Text>
									</View>
									<View style={styles.modalDetailRow}>
										<Text style={styles.modalDetailLabel}>Capacity:</Text>
										<Text style={styles.modalDetailValue}>
											{selectedTable?.capacity} guests
										</Text>
									</View>

									<View style={styles.modalActions}>
										{selectedTable?.status === "checkedOut" && (
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
										{selectedTable?.status === "OCCUPIED" && (
											<Text style={styles.modalInfoText}>
												This table is currently seated. View order details in
												the Chef's Q.
											</Text>
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
					))}
			</View>
		</SafeAreaView>
	);
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
	header: {
		padding: 20,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	title: { fontSize: 28, fontWeight: "bold", color: colors.textDark },
	editToggleContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 15,
	},
	editToggleLabel: {
		fontSize: 16,
		color: colors.textMedium,
		fontWeight: "500",
	},
	tableList: { padding: 10 },
	noDataText: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 20,
	},
	fab: {
		position: "absolute",
		margin: 16,
		right: 0,
		bottom: 0,
		backgroundColor: colors.primary,
		borderRadius: 28,
		paddingVertical: 5,
	},

	// Modal Styles
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 25,
		paddingTop: 30,
		paddingBottom: 20,
		borderRadius: 12,
		width: "100%",
		maxWidth: 400,
	},
	modalTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 25,
		textAlign: "center",
	},
	input: {
		height: 55,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		marginBottom: 10,
		fontSize: 16,
		backgroundColor: colors.backgroundLight,
	},
	errorText: {
		color: colors.statusDanger,
		marginBottom: 10,
		marginLeft: 5,
		fontSize: 13,
	},
	modalActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 20,
	},
	modalButton: { flex: 1, marginHorizontal: 5, paddingVertical: 5 },
	divider: {
		marginVertical: 20,
		height: 1,
		backgroundColor: colors.borderLight,
	},
	deleteAction: { marginTop: 15, padding: 5 },

	statusModalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 25,
		borderRadius: 12,
		width: "95%",
		maxWidth: 400,
	},
});

export default TableManagementScreen;
