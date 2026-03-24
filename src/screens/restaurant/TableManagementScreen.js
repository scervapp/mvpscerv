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

// 🚨 Don't forget to import your new modal!
import DiscountModal from "../../components/restaurant/DiscountModal";

import { functions } from "../../config/firebase";
import * as Yup from "yup";
import { Formik } from "formik";
import OrderDetailsModal from "../../components/restaurant/OrderDetailModal";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";

const AddEditTableModal = ({
	isVisible,
	onClose,
	onSubmit,
	initialData = null,
	isLoading,
	onDelete,
}) => {
	const { t } = useTranslation();
	const validationSchema = Yup.object().shape({
		name: Yup.string().required(t("table_name_is_required")),
		capacity: Yup.number()
			.min(1, t("capacity_must_be_at_least_1"))
			.required(t("capacity_is_required"))
			.typeError(t("must_be_a_number")),
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
						{initialData
							? `${t("edit")} ${initialData.name}`
							: t("add_new_table")}
					</Text>
					<Formik
						initialValues={{
							name: initialData?.name || "",
							capacity: initialData?.capacity?.toString() || "",
						}}
						validationSchema={validationSchema}
						enableReinitialize
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
									placeholder={t("table_name_e_g_patio_5")}
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
									placeholder={t("seating_capacity")}
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
										{t("cancel")}
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
										{initialData ? t("save_changes") : t("add_table")}
									</Button>
								</View>
							</>
						)}
					</Formik>

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
								{t("delete_table")}
							</Button>
						</View>
					)}
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
	);
};

const isTableOccupied = (table) => {
	if (!table) return false;

	// 🚨 FIX: Explicitly mark as not occupied if they are checked out
	if (table.status === "checkedOut" || table.status === "CHECKEDOUT") {
		return false;
	}

	return (
		table.status === "OCCUPIED" ||
		table.status === "occupied" ||
		!!table.currentCheckInId
	);
};

const getDisplayStatus = (table) => {
	if (!table) return "UNKNOWN";
	if (isTableOccupied(table)) return "OCCUPIED";
	if (table.status) return table.status;
	return "AVAILABLE";
};

const getStatusColor = (status) => {
	const formattedStatus = status?.toUpperCase() || "";
	switch (formattedStatus) {
		case "AVAILABLE":
			return colors.statusSuccess;
		case "OCCUPIED":
			return colors.statusDanger;
		case "CHECKEDOUT":
			return colors.statusWarning;
		default:
			return colors.textMedium;
	}
};

const TableManagementScreen = () => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const [tables, setTables] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isActionLoading, setIsActionLoading] = useState(false);

	const [isEditMode, setIsEditMode] = useState(false);
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedTable, setSelectedTable] = useState(null);

	// 🚨 NEW: Discount Modal State
	const [isDiscountModalVisible, setIsDiscountModalVisible] = useState(false);

	const addTableFunction = httpsCallable(functions, "addTable");
	const updateTableFunction = httpsCallable(functions, "updateTable");
	const deleteTableFunction = httpsCallable(functions, "deleteTable");
	const forceClearTableFunction = httpsCallable(functions, "forceClearTable");

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

	const forceClearAction = async (tableToClear) => {
		if (!tableToClear?.currentCheckInId || !tableToClear?.currentCustomerId) {
			Alert.alert(
				t("error"),
				t("missing_information_needed_to_clear_this_table"),
			);
			return;
		}
		setIsActionLoading(true);
		try {
			await forceClearTableFunction({
				restaurantId: currentUserData.uid,
				tableId: tableToClear.id,
				checkInId: tableToClear.currentCheckInId,
				customerId: tableToClear.currentCustomerId,
			});
			Alert.alert(
				t("success"),
				`${tableToClear.name} ${t("has_been_cleared")}`,
			);
		} catch (error) {
			console.error("Error force-clearing table:", error);
			Alert.alert(
				t("error"),
				`${t("could_not_clear_the_table")}: ${error.message}`,
			);
		} finally {
			setIsActionLoading(false);
		}
	};

	// 🚨 NEW: Modified Long Press to show options instead of instantly force clearing
	const handleTableLongPress = (table) => {
		if (isTableOccupied(table)) {
			Alert.alert(
				t("table_options", "Table Options"),
				`${t("what_would_you_like_to_do_with", "What would you like to do with")} ${table.name}?`,
				[
					{ text: t("cancel", "Cancel"), style: "cancel" },
					{
						text: t("apply_discount", "Apply Discount"),
						onPress: () => {
							setSelectedTable(table);
							setIsDiscountModalVisible(true);
						},
					},
					{
						text: t("force_clear", "Force Clear"),
						style: "destructive",
						onPress: () => forceClearAction(table),
					},
				],
			);
		} else {
			Alert.alert(t("info"), t("only_occupied_tables_can_be_force_cleared"));
		}
	};

	// 🚨 NEW: Submit Handler for the Discount
	const handleDiscountSubmit = async (amount, reason, table) => {
		setIsActionLoading(true);
		try {
			// Placeholder: Call your Cloud Function to apply the discount here
			// await applyDiscountFunction({ tableId: table.id, amount, reason });

			console.log(
				`Applying $${amount} discount to ${table.name} for: ${reason}`,
			);
			Alert.alert(
				"Success",
				`Discount of $${amount} staged for ${table.name}.`,
			);
			setIsDiscountModalVisible(false);
		} catch (error) {
			Alert.alert("Error", "Could not apply discount.");
		} finally {
			setIsActionLoading(false);
		}
	};

	const closeModal = () => {
		setIsModalVisible(false);
		setSelectedTable(null);
	};

	const handleClearTable = async () => {
		if (!selectedTable) return;
		setIsActionLoading(true);
		try {
			await clearTable(selectedTable.id, currentUserData.uid);
			Alert.alert(
				t("success"),
				`${selectedTable.name} ${t("has_been_cleared_and_is_now_available")}`,
			);
		} catch (error) {
			console.error("Error clearing table:", error);
			Alert.alert(t("error"), t("could_not_clear_the_table"));
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
				Alert.alert(t("success"), t("table_updated_successfully"));
			} else {
				const generatedId = values.name
					.trim()
					.toLowerCase()
					.replace(/\s+/g, "_")
					.replace(/[^a-z0-9_]/g, "");

				await addTableFunction({
					restaurantId,
					tableId: generatedId,
					...values,
				});
				Alert.alert(t("success"), t("new_table_added_successfully"));
			}
		} catch (error) {
			console.error("Error saving table:", error);
			Alert.alert(t("error"), error.message || t("could_not_save_the_table"));
		} finally {
			setIsActionLoading(false);
			setIsModalVisible(false);
			setSelectedTable(null);
		}
	};

	const handleDeleteTable = () => {
		if (!selectedTable || isTableOccupied(selectedTable)) {
			Alert.alert(
				t("cannot_delete"),
				t(
					"occupied_tables_cannot_be_deleted_please_check_out_the_guests_first",
				),
			);
			return;
		}
		Alert.alert(
			t("confirm_deletion"),
			`${t("are_you_sure_you_want_to_permanently_delete")} ${
				selectedTable.name
			}?`,
			[
				{ text: t("cancel"), style: "cancel" },
				{
					text: t("delete"),
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						try {
							await deleteTableFunction({
								restaurantId: currentUserData.uid,
								tableId: selectedTable.id,
							});
						} catch (error) {
							Alert.alert(
								t("error"),
								error.message || t("could_not_delete_table"),
							);
						} finally {
							setIsActionLoading(false);
							setIsModalVisible(false);
							setSelectedTable(null);
						}
					},
				},
			],
		);
	};

	const tableStats = useMemo(() => {
		const occupied = tables.filter((t) => isTableOccupied(t)).length;
		const needsCleaning = tables.filter(
			(t) => !isTableOccupied(t) && t.status === "checkedOut",
		).length;
		const available = tables.length - occupied - needsCleaning;

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
					<Text style={styles.title}>{t("table_management")}</Text>
					<Text style={styles.statsText}>
						{tableStats.available} {t("available")} / {tableStats.total}{" "}
						{t("total")}
					</Text>
					<View style={styles.editToggleContainer}>
						<Text style={styles.editToggleLabel}>{t("edit_floor_plan")}</Text>
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
							{t("no_tables_found_use_edit_mode_to_add_your_first_table")}
						</Text>
					</View>
				) : (
					<FlatList
						data={tables}
						renderItem={({ item }) => (
							<TableItem
								item={item}
								onPress={() => handleTablePress(item)}
								onLongPress={() => handleTableLongPress(item)}
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
						{t("add_table")}
					</Button>
				)}

				{/* Modals */}
				{selectedTable && (
					<>
						<OrderDetailsModal
							isVisible={
								isModalVisible && isTableOccupied(selectedTable) && !isEditMode
							}
							onClose={closeModal}
							table={selectedTable}
						/>

						<Modal
							visible={
								isModalVisible && !isTableOccupied(selectedTable) && !isEditMode
							}
							transparent={true}
							animationType="fade"
							onRequestClose={closeModal}
						>
							<TouchableOpacity
								style={styles.modalOverlay}
								activeOpacity={1}
								onPressOut={closeModal}
							>
								<TouchableOpacity
									style={styles.statusModalContent}
									activeOpacity={1}
								>
									<Text style={styles.modalTitle}>{selectedTable.name}</Text>
									<View style={styles.modalDetailRow}>
										<Text style={styles.modalDetailLabel}>{t("status")}:</Text>
										<Text
											style={[
												styles.modalDetailValue,
												{
													color: getStatusColor(
														getDisplayStatus(selectedTable),
													),
												},
											]}
										>
											{getDisplayStatus(selectedTable).toUpperCase()}
										</Text>
									</View>
									<View style={styles.modalDetailRow}>
										<Text style={styles.modalDetailLabel}>
											{t("capacity")}:
										</Text>
										<Text style={styles.modalDetailValue}>
											{selectedTable.capacity} {t("guests")}
										</Text>
									</View>
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
												{t("clear_make_available")}
											</Button>
										)}
										<Button
											onPress={closeModal}
											mode="outlined"
											style={{ marginTop: 10 }}
										>
											{t("close")}
										</Button>
									</View>
								</TouchableOpacity>
							</TouchableOpacity>
						</Modal>
					</>
				)}

				<AddEditTableModal
					isVisible={isModalVisible && isEditMode}
					onClose={closeModal}
					onSubmit={handleAddEditSubmit}
					onDelete={handleDeleteTable}
					initialData={selectedTable}
					isLoading={isActionLoading}
				/>

				{/* 🚨 NEW: Discount Modal */}
				<DiscountModal
					isVisible={isDiscountModalVisible}
					onClose={() => setIsDiscountModalVisible(false)}
					onSubmit={handleDiscountSubmit}
					item={selectedTable}
					isLoading={isActionLoading}
				/>
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
	statsText: {
		fontSize: 16,
		color: colors.textMedium,
		marginTop: 5,
	},
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
		color: colors.textDark,
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
	modalDetailRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 15,
	},
	modalDetailLabel: {
		fontSize: 16,
		color: colors.textMedium,
		fontWeight: "600",
	},
	modalDetailValue: {
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default TableManagementScreen;
