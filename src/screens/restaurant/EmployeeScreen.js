// screens/restaurant/EmployeeScreen.js
import React, { useState, useContext, useEffect, useCallback } from "react";
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
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, functions } from "../../config/firebase";
import { httpsCallable } from "firebase/functions";
import { Button, Card, Avatar, IconButton } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { Formik } from "formik";
import * as Yup from "yup";
import { Picker } from "@react-native-picker/picker";
import colors from "../../utils/styles/appStyles";

// --- Reusable Add/Edit Employee Modal ---
const AddEditEmployeeModal = ({
	isVisible,
	onClose,
	onSubmit,
	isLoading,
	isFirstEmployee,
}) => {
	const validationSchema = Yup.object().shape({
		firstName: Yup.string().required("First name is required."),
		lastName: Yup.string().required("Last name is required."),
		email: Yup.string()
			.email("Invalid email format.")
			.required("Email is required."),
		role: Yup.string()
			.oneOf(["owner", "manager", "worker"])
			.required("Role is required."),
		pin: Yup.string().when("role", {
			is: (role) => role === "manager" || role === "owner",
			then: (schema) =>
				schema
					.min(4, "PIN must be 4-6 digits")
					.max(6, "PIN must be 4-6 digits")
					.required("A PIN is required for this role."),
			otherwise: (schema) => schema.optional(),
		}),
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
					<ScrollView>
						<Text style={styles.modalTitle}>
							{isFirstEmployee ? "Create Owner Account" : "Add New Employee"}
						</Text>
						<Formik
							initialValues={{
								firstName: "",
								lastName: "",
								email: "",
								role: isFirstEmployee ? "owner" : "worker",
								pin: "",
							}}
							enableReinitialize // Ensures form resets when opened again
							validationSchema={validationSchema}
							onSubmit={onSubmit}
						>
							{(
								{
									handleChange,
									handleBlur,
									handleSubmit,
									values,
									errors,
									touched,
									setFieldValue,
								} // <<< Destructure setFieldValue
							) => (
								<>
									<TextInput
										style={styles.input}
										placeholder="First Name"
										value={values.firstName}
										onChangeText={handleChange("firstName")}
										onBlur={handleBlur("firstName")}
									/>
									{touched.firstName && errors.firstName && (
										<Text style={styles.errorText}>{errors.firstName}</Text>
									)}

									<TextInput
										style={styles.input}
										placeholder="Last Name"
										value={values.lastName}
										onChangeText={handleChange("lastName")}
										onBlur={handleBlur("lastName")}
									/>
									{touched.lastName && errors.lastName && (
										<Text style={styles.errorText}>{errors.lastName}</Text>
									)}

									<TextInput
										style={styles.input}
										placeholder="Email"
										value={values.email}
										onChangeText={handleChange("email")}
										onBlur={handleBlur("email")}
										keyboardType="email-address"
										autoCapitalize="none"
									/>
									{touched.email && errors.email && (
										<Text style={styles.errorText}>{errors.email}</Text>
									)}

									<Text style={styles.inputLabel}>Role</Text>
									<View style={styles.pickerContainer}>
										<Picker
											selectedValue={values.role}
											// --- THE FIX IS HERE ---
											// Use setFieldValue for more reliable updates from pickers.
											onValueChange={(itemValue) =>
												setFieldValue("role", itemValue)
											}
											style={styles.picker}
											enabled={!isFirstEmployee}
										>
											{isFirstEmployee ? (
												<Picker.Item
													label="Owner (Cannot be changed)"
													value="owner"
												/>
											) : (
												<>
													<Picker.Item
														label="Worker (Server, Host, etc.)"
														value="worker"
													/>
													<Picker.Item label="Manager" value="manager" />
												</>
											)}
										</Picker>
									</View>

									{(values.role === "manager" || values.role === "owner") && (
										<>
											<Text style={styles.inputLabel}>Set 4-6 Digit PIN</Text>
											<TextInput
												style={styles.input}
												placeholder="PIN"
												value={values.pin}
												onChangeText={handleChange("pin")}
												keyboardType="number-pad"
												secureTextEntry
												maxLength={6}
											/>
											{touched.pin && errors.pin && (
												<Text style={styles.errorText}>{errors.pin}</Text>
											)}
										</>
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
											Add Employee
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
	const [isModalVisible, setIsModalVisible] = useState(false);

	const addEmployeeFunction = httpsCallable(functions, "addEmployee");
	const deleteEmployeeFunction = httpsCallable(functions, "deleteEmployee");

	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) {
			setIsLoading(false);
			return;
		}

		const employeesRef = collection(
			db,
			"restaurants",
			restaurantId,
			"employees"
		);
		const q = query(employeesRef, orderBy("lastName", "asc"));
		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				setEmployees(
					snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
				);
				setIsLoading(false);
			},
			(error) => {
				console.error("Error fetching employees:", error);
				setIsLoading(false);
			}
		);
		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const handleAddEmployee = async (values) => {
		setIsActionLoading(true);
		try {
			await addEmployeeFunction({
				restaurantId: currentUserData.uid,
				...values,
			});
			Alert.alert("Success", "Employee added successfully.");
			setIsModalVisible(false);
		} catch (error) {
			Alert.alert("Error", error.message || "Could not add employee.");
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleDelete = (employee) => {
		Alert.alert(
			"Confirm Delete",
			`Are you sure you want to delete ${employee.firstName} ${employee.lastName}? This will also delete their login.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
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
								"Error",
								error.message || "Could not delete employee."
							);
						} finally {
							setIsActionLoading(false);
						}
					},
				},
			]
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
					<IconButton
						{...props}
						icon="trash-can-outline"
						color={colors.statusDanger}
						onPress={() => handleDelete(item)}
					/>
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

	return (
		<SafeAreaView style={styles.container}>
			<FlatList
				data={employees}
				renderItem={renderEmployeeCard}
				keyExtractor={(item) => item.id}
				ListHeaderComponent={
					<Text style={styles.heading}>Employee Roster</Text>
				}
				ListEmptyComponent={
					<View style={styles.emptyContainer}>
						<Ionicons
							name="people-outline"
							size={60}
							color={colors.textLight}
						/>
						<Text style={styles.emptyText}>
							No employees found. Tap '+' to create the Owner account.
						</Text>
					</View>
				}
				contentContainerStyle={styles.listContainer}
			/>
			<Button
				icon="plus"
				mode="contained"
				onPress={() => setIsModalVisible(true)}
				style={styles.fab}
			>
				Add Employee
			</Button>
			{isModalVisible && (
				<AddEditEmployeeModal
					isVisible={isModalVisible}
					onClose={() => setIsModalVisible(false)}
					onSubmit={handleAddEmployee}
					isLoading={isActionLoading}
					isFirstEmployee={employees.length === 0}
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
	card: { marginVertical: 8, marginHorizontal: 10, elevation: 2 },
	employeeName: { fontWeight: "bold" },
	employeeRole: { textTransform: "capitalize", color: colors.textMedium },
	managerRole: { color: colors.primary, fontWeight: "600" },
	fab: {
		position: "absolute",
		margin: 16,
		right: 0,
		bottom: 0,
		backgroundColor: colors.primary,
		borderRadius: 28,
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
		marginBottom: 10,
		fontSize: 16,
		backgroundColor: colors.backgroundLight,
	},
	inputLabel: {
		fontSize: 14,
		color: colors.textMedium,
		fontWeight: "500",
		marginBottom: 5,
		marginLeft: 5,
	},
	errorText: {
		color: colors.statusDanger,
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
	picker: { height: 55, width: "100%" },
	modalActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 20,
	},
	modalButton: { flex: 1, marginHorizontal: 5, paddingVertical: 5 },
});

export default EmployeeScreen;
