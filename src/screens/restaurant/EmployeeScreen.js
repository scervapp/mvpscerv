// screens/restaurant/EmployeeScreen.js
import React, { useState, useContext, useEffect } from "react";
import {
	View,
	Text,
	StyleSheet,
	FlatList,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	Modal,
	TextInput,
	ScrollView,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";

import { Button, Card, Avatar, IconButton } from "react-native-paper";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Formik } from "formik";
import * as Yup from "yup";

import colors from "../../utils/styles/appStyles";
import { Picker } from "@react-native-picker/picker";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";

// --- Reusable Add/Edit Employee Modal ---
const AddEditEmployeeModal = ({
	isVisible,
	onClose,
	onSubmit,
	isLoading,
	isFirstEmployee,
	initialData, // 🚨 NEW: Pass existing employee data if editing
}) => {
	const { t } = useTranslation();
	const isEditing = !!initialData;

	// 🚨 Dynamic Validation: PIN is required for NEW employees, optional for EDITS
	const validationSchema = Yup.object().shape({
		firstName: Yup.string().required(t("first_name_is_required")),
		lastName: Yup.string().required(t("last_name_is_required")),
		role: Yup.string()
			.oneOf(["owner", "manager", "worker"])
			.required(t("role_is_required")),
		jobTitle: Yup.string().when("role", {
			is: "worker",
			then: (schema) => schema.required(t("please_select_a_job_title")),
			otherwise: (schema) => schema.nullable(),
		}),
		pin: Yup.string()
			.min(4, t("pin_must_be_4_6_digits"))
			.max(6, t("pin_must_be_4_6_digits"))
			.concat(
				isEditing
					? Yup.string() // Optional if editing
					: Yup.string().required(t("a_pin_is_required_for_pos_access")),
			),
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
					<ScrollView showsVerticalScrollIndicator={false}>
						<Text style={styles.modalTitle}>
							{isEditing
								? t("edit_employee", "Edit Employee")
								: isFirstEmployee
									? t("create_owner_account")
									: t("add_new_employee")}
						</Text>
						<Formik
							initialValues={{
								firstName: initialData?.firstName || "",
								lastName: initialData?.lastName || "",
								role:
									initialData?.role || (isFirstEmployee ? "owner" : "worker"),
								jobTitle: initialData?.jobTitle || "",
								pin: "", // Always start empty for security
							}}
							enableReinitialize
							validationSchema={validationSchema}
							onSubmit={onSubmit}
						>
							{({
								handleChange,
								handleSubmit,
								values,
								errors,
								touched,
								setFieldValue,
							}) => (
								<>
									<TextInput
										style={styles.input}
										placeholder={t("first_name")}
										value={values.firstName}
										onChangeText={handleChange("firstName")}
										placeholderTextColor={colors.textMedium}
									/>
									{touched.firstName && errors.firstName && (
										<Text style={styles.errorText}>{errors.firstName}</Text>
									)}
									<TextInput
										style={styles.input}
										placeholder={t("last_name")}
										value={values.lastName}
										onChangeText={handleChange("lastName")}
										placeholderTextColor={colors.textMedium}
									/>
									{touched.lastName && errors.lastName && (
										<Text style={styles.errorText}>{errors.lastName}</Text>
									)}

									<Text style={styles.inputLabel}>{t("permission_role")}</Text>
									<View style={styles.roleSelectorContainer}>
										{isFirstEmployee ? (
											<View style={styles.roleOption}>
												<MaterialCommunityIcons
													name="radiobox-marked"
													size={24}
													color={colors.primary}
												/>
												<Text
													style={[styles.roleLabel, styles.roleLabelSelected]}
												>
													{t("owner_full_access")}
												</Text>
											</View>
										) : (
											<>
												<TouchableOpacity
													style={styles.roleOption}
													onPress={() => setFieldValue("role", "worker")}
												>
													<MaterialCommunityIcons
														name={
															values.role === "worker"
																? "radiobox-marked"
																: "radiobox-blank"
														}
														size={24}
														color={colors.primary}
													/>
													<Text style={styles.roleLabel}>{t("worker")}</Text>
												</TouchableOpacity>
												<TouchableOpacity
													style={styles.roleOption}
													onPress={() => setFieldValue("role", "manager")}
												>
													<MaterialCommunityIcons
														name={
															values.role === "manager"
																? "radiobox-marked"
																: "radiobox-blank"
														}
														size={24}
														color={colors.primary}
													/>
													<Text style={styles.roleLabel}>{t("manager")}</Text>
												</TouchableOpacity>
											</>
										)}
									</View>
									{touched.role && errors.role && (
										<Text style={styles.errorText}>{errors.role}</Text>
									)}

									{values.role === "worker" && (
										<>
											<Text style={styles.inputLabel}>{t("job_title")}</Text>
											<View style={styles.pickerContainer}>
												<Picker
													selectedValue={values.jobTitle}
													onValueChange={(itemValue) =>
														setFieldValue("jobTitle", itemValue)
													}
													style={styles.picker}
												>
													<Picker.Item
														label={t("server", "Server")}
														value="server"
													/>
													<Picker.Item
														label={t("host_hostess", "Host / Hostess")}
														value="host"
													/>
													<Picker.Item
														label={t(
															"chef_kitchen_staff",
															"Chef / Kitchen Staff",
														)}
														value="chef"
													/>
													<Picker.Item
														label={t("busser_support", "Busser / Support")}
														value="support"
													/>
												</Picker>
											</View>
											{touched.jobTitle && errors.jobTitle && (
												<Text style={styles.errorText}>{errors.jobTitle}</Text>
											)}
										</>
									)}

									<Text style={styles.inputLabel}>
										{t("set_4_6_digit_pin", "Set 4-6 Digit POS Login PIN")}
									</Text>
									<TextInput
										style={styles.input}
										placeholder={
											isEditing
												? t(
														"leave_blank_to_keep_current_pin",
														"Leave blank to keep current PIN",
													)
												: t("pos_pin", "POS PIN")
										}
										value={values.pin}
										onChangeText={handleChange("pin")}
										keyboardType="number-pad"
										secureTextEntry
										maxLength={6}
									/>
									{touched.pin && errors.pin && (
										<Text style={styles.errorText}>{errors.pin}</Text>
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
											{isEditing
												? t("save_changes", "Save Changes")
												: t("add_employee")}
										</Button>
									</View>
								</>
							)}
						</Formik>
					</ScrollView>
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
	);
};

const EmployeeScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [employees, setEmployees] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isActionLoading, setIsActionLoading] = useState(false);

	// 🚨 NEW: Modal & Selected Employee State
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedEmployee, setSelectedEmployee] = useState(null);

	const addEmployeeFunction = httpsCallable(functions, "addEmployee");
	const updateEmployeeFunction = httpsCallable(functions, "updateEmployee"); // 🚨 Assume this exists in your backend
	const deleteEmployeeFunction = httpsCallable(functions, "deleteEmployee");
	const { t } = useTranslation();

	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) {
			setIsLoading(false);
			return;
		}

		const employeesQuery = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.orderBy("lastName", "asc");

		const unsubscribe = employeesQuery.onSnapshot(
			(querySnapshot) => {
				const fetchedEmployees = querySnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setEmployees(fetchedEmployees);
				setIsLoading(false);
			},
			(error) => {
				console.error("Error fetching employees:", error);
				setIsLoading(false);
			},
		);

		return () => unsubscribe();
	}, [currentUserData?.uid]);

	// 🚨 NEW: Unified Save Handler (Add vs Edit)
	const handleSaveEmployee = async (values) => {
		setIsActionLoading(true);
		const restaurantId = currentUserData?.uid;

		if (!restaurantId) {
			Alert.alert(
				t("error"),
				t("could_not_identify_your_restaurant_please_log_in_again"),
			);
			setIsActionLoading(false);
			return;
		}

		try {
			if (selectedEmployee) {
				// --- UPDATE EXISTING EMPLOYEE ---
				const payload = {
					restaurantId,
					employeeId: selectedEmployee.id,
					...values,
				};

				// Don't send an empty PIN to the backend so we don't wipe their current one
				if (!payload.pin || payload.pin.trim() === "") {
					delete payload.pin;
				}

				await updateEmployeeFunction(payload);
				Alert.alert(
					t("success"),
					t("employee_updated_successfully", "Employee updated successfully."),
				);
			} else {
				// --- ADD NEW EMPLOYEE ---
				const result = await addEmployeeFunction({ restaurantId, ...values });

				if (employees.length === 0 && result.data.success) {
					await db.collection("restaurants").doc(restaurantId).update({
						hasSetupEmployees: true,
					});
				}
				Alert.alert(t("success"), t("employee_added_successfully"));
			}

			setIsModalVisible(false);
			setSelectedEmployee(null); // Reset after saving
		} catch (error) {
			Alert.alert(
				t("error"),
				error.message ||
					t("could_not_save_employee", "Could not save employee."),
			);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleDelete = (employee) => {
		Alert.alert(
			t("confirm_delete"),
			`${t("are_you_sure_you_want_to_delete")} ${employee.firstName} ${employee.lastName}? ${t("this_will_also_delete_their_login")}.`,
			[
				{ text: t("cancel"), style: "cancel" },
				{
					text: t("delete"),
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						try {
							await deleteEmployeeFunction({
								restaurantId: currentUserData.uid,
								employeeId: employee.id,
							});
						} catch (error) {
							Alert.alert(
								t("error"),
								error.message || t("could_not_delete_employee"),
							);
						} finally {
							setIsActionLoading(false);
						}
					},
				},
			],
		);
	};

	const renderEmployeeCard = ({ item }) => (
		<Card style={styles.card}>
			<Card.Title
				title={`${item.firstName} ${item.lastName}`}
				titleStyle={styles.employeeName}
				subtitle={
					(item.role || "").charAt(0).toUpperCase() + (item.role || "").slice(1)
				}
				subtitleStyle={[
					styles.employeeRole,
					(item.role === "manager" || item.role === "owner") &&
						styles.managerRole,
				]}
				left={(props) => (
					<Avatar.Icon
						{...props}
						icon={
							item.role === "manager" || item.role === "owner"
								? "account-star"
								: "account"
						}
						backgroundColor={colors.primary}
					/>
				)}
				right={(props) => (
					<View style={styles.cardActionRow}>
						{/* 🚨 NEW: Edit Button */}
						<IconButton
							{...props}
							icon="pencil-outline"
							color={colors.primary}
							onPress={() => {
								setSelectedEmployee(item);
								setIsModalVisible(true);
							}}
						/>
						{/* Original Delete Button */}
						<IconButton
							{...props}
							icon="trash-can-outline"
							color={colors.statusDanger}
							onPress={() => handleDelete(item)}
						/>
					</View>
				)}
			/>
		</Card>
	);

	if (isLoading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	const isFirstEmployee = employees.length === 0;

	return (
		<SafeAreaView style={styles.container}>
			<FlatList
				data={employees}
				renderItem={renderEmployeeCard}
				keyExtractor={(item) => item.id}
				ListHeaderComponent={
					<Text style={styles.heading}>{t("employee_roster")}</Text>
				}
				ListEmptyComponent={
					<View style={styles.emptyContainer}>
						<Ionicons
							name="people-outline"
							size={60}
							color={colors.textLight}
						/>
						<Text style={styles.emptyText}>
							{t("no_employees_found_tap_to_create_the_owner_account")}
						</Text>
					</View>
				}
				contentContainerStyle={styles.listContainer}
			/>
			<Button
				icon="plus"
				mode="contained"
				onPress={() => {
					setSelectedEmployee(null); // Clear selected user for a fresh form
					setIsModalVisible(true);
				}}
				style={styles.fab}
			>
				{t("add_employee")}
			</Button>

			{isModalVisible && (
				<AddEditEmployeeModal
					isVisible={isModalVisible}
					onClose={() => {
						setIsModalVisible(false);
						setSelectedEmployee(null);
					}}
					onSubmit={handleSaveEmployee} // 🚨 Uses unified save handler
					isLoading={isActionLoading}
					isFirstEmployee={employees.length === 0}
					initialData={selectedEmployee} // 🚨 Passes down the data if editing
				/>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	centered: { flex: 1, justifyContent: "center", alignItems: "center" },
	heading: {
		fontSize: 26,
		fontWeight: "bold",
		color: colors.textDark,
		padding: 20,
		paddingBottom: 10,
	},
	listContainer: { paddingHorizontal: 10, paddingBottom: 80 },
	emptyContainer: {
		alignItems: "center",
		marginTop: 60,
		paddingHorizontal: 30,
	},
	emptyText: {
		textAlign: "center",
		marginTop: 20,
		fontSize: 17,
		color: colors.textMedium,
		lineHeight: 24,
	},
	card: {
		marginVertical: 8,
		marginHorizontal: 10,
		elevation: 2,
		backgroundColor: colors.surfaceWhite,
	},
	employeeName: { fontWeight: "bold" },
	employeeRole: { textTransform: "capitalize", color: colors.textMedium },
	managerRole: { color: colors.primary, fontWeight: "600" },

	// 🚨 NEW: Row styling for right-side card icons
	cardActionRow: { flexDirection: "row", alignItems: "center" },

	fab: {
		position: "absolute",
		margin: 16,
		right: 0,
		bottom: 0,
		backgroundColor: colors.primary,
		borderRadius: 28,
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
		paddingTop: 20,
		paddingBottom: 20,
		borderRadius: 12,
		width: "100%",
		maxHeight: "95%",
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
		marginBottom: 15,
		fontSize: 16,
		backgroundColor: colors.backgroundLight,
		color: colors.textDark,
	}, // Updated color for better visibility
	inputLabel: {
		fontSize: 14,
		color: colors.textMedium,
		fontWeight: "500",
		marginBottom: 5,
		marginLeft: 5,
	},
	errorText: {
		color: colors.statusDanger,
		marginTop: -10,
		marginBottom: 10,
		marginLeft: 5,
		fontSize: 13,
	},
	pickerContainer: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		marginBottom: 20,
		backgroundColor: colors.backgroundLight,
		justifyContent: "center",
	},
	picker: { height: 55, width: "100%", color: colors.textMedium },
	modalActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 20,
	},
	modalButton: { flex: 1, marginHorizontal: 5, paddingVertical: 5 },
	roleSelectorContainer: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 5,
		marginBottom: 20,
	},
	roleOption: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
	},
	roleLabel: { fontSize: 16, marginLeft: 15, color: colors.textDark },
	roleLabelSelected: { fontWeight: "bold", color: colors.primary },
});

export default EmployeeScreen;
