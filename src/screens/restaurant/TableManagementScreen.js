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

import { db, functions } from "../../config/firebase";
import {
	collection,
	query,
	where,
	onSnapshot,
} from "@react-native-firebase/firestore";
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
								{t("delete_table")}
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
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const [tables, setTables] = useState([]);
	const [activeTableIds, setActiveTableIds] = useState(new Set());
	const [isLoading, setIsLoading] = useState(true);
	const [isActionLoading, setIsActionLoading] = useState(false);

	const [isEditMode, setIsEditMode] = useState(false);
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedTable, setSelectedTable] = useState(null);

	const addTableFunction = httpsCallable(functions, "addTable");
	const updateTableFunction = httpsCallable(functions, "updateTable");
	const deleteTableFunction = httpsCallable(functions, "deleteTable");
	const forceClearTableFunction = httpsCallable(functions, "forceClearTable");
	const [activePartyMap, setActivePartyMap] = useState({});

	useEffect(() => {
		if (!currentUserData?.uid) {
			setIsLoading(false);
			return;
		}

		// 1. Fetch Local Tables via Utility
		const unsubscribe = fetchTables(currentUserData.uid, (fetchedTables) => {
			const sortedTables = (fetchedTables || []).sort((a, b) => {
				const numA = parseInt((a.name || "").match(/\d+/)?.[0] || 0, 10);
				const numB = parseInt((b.name || "").match(/\d+/)?.[0] || 0, 10);
				return numA - numB;
			});
			setTables(sortedTables);
			setIsLoading(false);
		});

		// 2. Listen for Active Parties for Safety Checks
		const q = query(
			collection(db, "parties"),
			where("restaurantId", "==", currentUserData.uid),
			where("status", "in", ["active", "checkedOut"]), // 🚨 CATCHES DIRTY TABLES TOO
		);

		const unsubscribeParties = onSnapshot(q, (snapshot) => {
			const occupiedIds = new Set();
			const partyMapping = {};

			snapshot.docs.forEach((doc) => {
				const data = doc.data();
				// 🚨 CATCHES BOTH WAYS THE TABLE ID MIGHT BE STORED
				const tId = data.tableId || data.table?.id;

				if (tId) {
					occupiedIds.add(tId);
					partyMapping[tId] = doc.id;
				}
			});

			setActiveTableIds(occupiedIds);
			setActivePartyMap(partyMapping);
		});

		return () => {
			unsubscribe();
			unsubscribeParties();
		};
	}, [currentUserData?.uid]);

	// ==========================================
	// AUTO POPULATE LOGIC
	// ==========================================
	const handleAutoPopulate = async () => {
		const hasUnavailableTables = tables.some(
			(t) => (t.status && t.status !== "available") || activeTableIds.has(t.id),
		);

		if (hasUnavailableTables) {
			Alert.alert(
				t("action_denied", "Action Denied"),
				t(
					"cannot_auto_populate",
					"You have occupied or uncleared tables. Please ensure all tables are set to 'Available' before auto-populating.",
				),
			);
			return;
		}

		Alert.alert(
			t("auto_populate", "Auto Populate Tables"),
			t(
				"auto_populate_confirm",
				"This will automatically generate tables up to Table 50. Are you sure?",
			),
			[
				{ text: t("cancel", "Cancel"), style: "cancel" },
				{
					text: t("confirm_button", "Confirm"),
					onPress: async () => {
						setIsActionLoading(true);
						try {
							const restaurantId = currentUserData?.uid;
							const batch = db.batch();
							let tablesAdded = 0;

							for (let i = 1; i <= 50; i++) {
								const tableId = `table_${i}`;
								const alreadyExists = tables.some((t) => t.id === tableId);

								if (!alreadyExists) {
									const tableRef = db
										.collection("restaurants")
										.doc(restaurantId)
										.collection("tables")
										.doc(tableId);

									batch.set(tableRef, {
										name: `Table ${i}`,
										tableNumber: i,
										capacity: 4,
										status: "available",
									});
									tablesAdded++;
								}
							}

							if (tablesAdded > 0) {
								await batch.commit();
								Alert.alert(
									t("success", "Success"),
									`${tablesAdded} tables generated successfully.`,
								);
							} else {
								Alert.alert(
									t("info", "Info"),
									"You already have 50 tables set up!",
								);
							}
						} catch (error) {
							console.error("Auto populate error:", error);
							Alert.alert(
								t("error", "Error"),
								"Could not auto populate tables.",
							);
						} finally {
							setIsActionLoading(false);
							setIsEditMode(false);
						}
					},
				},
			],
		);
	};

	const handleTablePress = (table) => {
		setSelectedTable(table);
		setIsModalVisible(true);
	};

	const forceClearAction = async (tableToClear) => {
		// Relaxing the strict check slightly, because walk-ins might not have a checkInId
		// but we still need to be able to force clear them.
		if (!tableToClear?.id) {
			Alert.alert(
				t("error"),
				t("missing_information_needed_to_clear_this_table"),
			);
			return;
		}

		setIsActionLoading(true);
		try {
			// 🚨 Grab the active party ID from our map
			const targetPartyId = activePartyMap[tableToClear.id] || null;

			// 🚨 Send the complete payload to the Cloud Function
			await forceClearTableFunction({
				restaurantId: currentUserData.uid,
				tableId: tableToClear.id,
				partyId: targetPartyId,
				checkInId: tableToClear.currentCheckInId || "legacy_skip",
				customerId: tableToClear.currentCustomerId || "walk_in",
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

	const handleTableLongPress = (table) => {
		// 🚨 ULTIMATE OVERRIDE: If a manager long-presses, let them clear it.
		// This is the failsafe for syncing ghost tickets or fixing corrupted table states.
		Alert.alert(
			t("force_clear_table", "Force Clear Table"),
			`${t("this_will_clear_all_data_for", "This will clear all data for")} ${
				table.name
			} ${t("and_check_out_the_current_customer_this_action_cannot_be_undone", "and check out the current customer. This action cannot be undone.")}`,
			[
				{ text: t("cancel", "Cancel"), style: "cancel" },
				{
					text: t("confirm_clear", "Confirm Clear"),
					style: "destructive",
					onPress: () => forceClearAction(table),
				},
			],
		);
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
				await addTableFunction({ restaurantId, ...values });
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
		if (
			!selectedTable ||
			selectedTable.status === "OCCUPIED" ||
			activeTableIds.has(selectedTable.id)
		) {
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
		const available = tables.filter((t) => t.status === "available").length;
		const occupied = tables.filter(
			(t) => t.status === "OCCUPIED" || t.status === "occupied",
		).length;
		const needsCleaning = tables.filter(
			(t) => t.status === "checkedOut",
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

					{/* 🚨 NEW: Auto Populate Button visible only in Edit Mode */}
					{isEditMode && (
						<TouchableOpacity
							style={[
								styles.autoPopulateButton,
								{
									backgroundColor: colors.textDark,
									opacity: isActionLoading ? 0.7 : 1,
								},
							]}
							onPress={handleAutoPopulate}
							disabled={isActionLoading}
						>
							{isActionLoading ? (
								<ActivityIndicator size="small" color={colors.surfaceWhite} />
							) : (
								<>
									<Ionicons
										name="flash-outline"
										size={18}
										color={colors.surfaceWhite}
									/>
									<Text style={styles.autoPopulateText}>
										{t("auto_populate", "Auto Populate 50")}
									</Text>
								</>
							)}
						</TouchableOpacity>
					)}
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

				{/* FAB FOR ADDING A SINGLE TABLE */}
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

				{selectedTable && (
					<>
						<OrderDetailsModal
							isVisible={
								isModalVisible &&
								(selectedTable.status === "OCCUPIED" ||
									selectedTable.status === "occupied") &&
								!isEditMode
							}
							onClose={closeModal}
							table={selectedTable}
						/>

						<Modal
							visible={
								isModalVisible &&
								selectedTable.status !== "OCCUPIED" &&
								selectedTable.status !== "occupied" &&
								!isEditMode
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
												{ color: getStatusColor(selectedTable.status) },
											]}
										>
											{(selectedTable.status || "UNKNOWN").toUpperCase()}
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
	statsText: { fontSize: 14, color: colors.textMedium, marginTop: 5 },
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
	autoPopulateButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginTop: 15,
		paddingVertical: 10,
		borderRadius: 8,
		gap: 8,
	},
	autoPopulateText: {
		color: colors.surfaceWhite,
		fontWeight: "bold",
		fontSize: 14,
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

	// Status Modal Specific Styles
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
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderColor: colors.borderLight,
	},
	modalDetailLabel: {
		fontSize: 16,
		color: colors.textMedium,
		fontWeight: "500",
	},
	modalDetailValue: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
	},
});

export default TableManagementScreen;
