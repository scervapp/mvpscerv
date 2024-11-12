import React, { useState, useContext, useEffect } from "react";
import {
	View,
	Text,
	StyleSheet,
	TextInput,
	Button,
	Alert,
	TouchableOpacity,
	FlatList,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDocs,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { Picker } from "@react-native-picker/picker";
import { colors } from "react-native-elements";

const EmployeeScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState("server"); // You can customize the default role
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	// State to store the employees
	const [employees, setEmployees] = useState([]);

	const handleAddEmployee = async () => {
		try {
			setIsLoading(true);
			setError(null); // Clear any previous errors

			// 1. Basic input validation
			if (!firstName.trim() || !lastName.trim() || !email.trim()) {
				throw new Error("Please fill in all fields.");
			}

			// 2. You might want to add more robust email validation here (e.g., using a regular expression)

			// 3. Create the employee document in Firestore
			const employeeData = {
				firstName,
				lastName,
				email,
				role,
				restaurantId: currentUserData.uid, // Associate the employee with the current restaurant
				// ... other employee details you might want to store
			};

			await addDoc(
				collection(db, "restaurants", currentUserData.uid, "employees"),
				employeeData
			);

			// 4. Clear input fields and show success message
			setFirstName("");
			setLastName("");
			setEmail("");
			Alert.alert("Success", "Employee added successfully!");
		} catch (error) {
			console.error("Error adding employee:", error);
			setError(error.message);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		const fetchEmployees = async () => {
			try {
				const employeesRef = collection(
					db,
					"restaurants",
					currentUserData.uid,
					"employees"
				);
				const querySnapshot = await getDocs(employeesRef);

				const employeesData = [];
				querySnapshot.forEach((doc) => {
					employeesData.push({ id: doc.id, ...doc.data() });
				});

				setEmployees(employeesData);
			} catch (error) {
				console.error("Error fetching employees:", error);
				// Handle the error (e.g., display an error message)
			}
		};

		fetchEmployees();
	}, []);

	const handleDeleteEmployee = async (employeeId) => {
		Alert.alert(
			"Confirm Delete",
			"Are you sure you want to delete this employee?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							await deleteDoc(
								doc(
									db,
									"restaurants",
									currentUserData.uid,
									"employees",
									employeeId
								)
							);
							// Update the employees state (you can refetch or filter the array)
							setEmployees(
								employees.filter((employee) => employee.id !== employeeId)
							);
						} catch (error) {
							console.error("Error deleting employee:", error);
							Alert.alert("Error", "Failed to delete employee.");
						}
					},
				},
			]
		);
	};

	const renderEmployee = ({ item }) => (
		<View style={styles.employeeItem}>
			<Text style={styles.employeeName}>
				{item.firstName} {item.lastName}
			</Text>
			<Text style={styles.employeeEmail}>{item.email}</Text>
			<Text style={styles.employeeRole}>Role: {item.role}</Text>
			<TouchableOpacity
				onPress={() => handleDeleteEmployee(item.id)}
				style={styles.deleteButton}
			>
				<Text style={styles.deleteButtonText}>Delete</Text>
			</TouchableOpacity>
		</View>
	);
	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Add New Employee</Text>

			{/* Input Fields */}
			<View style={styles.formContainer}>
				{/* Added a container for the form */}
				<TextInput
					placeholder="First Name"
					value={firstName}
					onChangeText={setFirstName}
					style={styles.input}
				/>
				<TextInput
					placeholder="Last Name"
					value={lastName}
					onChangeText={setLastName}
					style={styles.input}
				/>
				<TextInput
					placeholder="Email"
					value={email}
					onChangeText={setEmail}
					style={styles.input}
					keyboardType="email-address"
				/>
				{/* Role Selection */}
				<View style={styles.pickerContainer}>
					{/* Added a container for the Picker */}
					<Picker
						selectedValue={role}
						onValueChange={(itemValue) => setRole(itemValue)}
						style={styles.picker}
					>
						<Picker.Item label="Server" value="server" />
						<Picker.Item label="Host/Hostess" value="host" />
						<Picker.Item label="Manager" value="manager" />
						{/* ... add more roles as needed */}
					</Picker>
				</View>
				{/* Error Message */}
				{error && <Text style={styles.errorText}>{error}</Text>}
				{/* Add Employee Button */}
				<TouchableOpacity
					style={styles.addButton}
					onPress={handleAddEmployee}
					disabled={isLoading}
				>
					<Text style={styles.addButtonText}>Add Employee</Text>
				</TouchableOpacity>
			</View>
			<FlatList
				data={employees}
				renderItem={renderEmployee}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.employeeList}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background, // Use your background color
		padding: 20,
	},
	heading: {
		fontSize: 24, // Increased font size
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.primary, // Use your primary color
		textAlign: "center",
	},
	formContainer: {
		backgroundColor: "white", // White background for the form
		padding: 20,
		borderRadius: 10,
	},
	input: {
		borderWidth: 1,
		borderColor: colors.lightGray, // Use a light gray for the border
		borderRadius: 8, // Use rounded corners
		padding: 12, // Increased padding
		marginBottom: 15, // Increased margin
		fontSize: 16,
	},
	pickerContainer: {
		borderWidth: 1,
		borderColor: "#ced4da", // Light gray border for the picker container
		borderRadius: 8,
		marginBottom: 20,
	},
	picker: {
		height: 45, // Adjust height as needed
	},
	addButton: {
		backgroundColor: colors.primary, // Use your primary color
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
	},
	addButtonText: {
		// Added styles for the button text
		color: "white",
		fontSize: 18,
		fontWeight: "bold",
	},
	errorText: {
		color: "red",
		marginBottom: 10,
		textAlign: "center",
	},
	employeeList: {
		marginTop: 20,
	},
	employeeItem: {
		backgroundColor: "white",
		padding: 15,
		marginBottom: 10,
		borderRadius: 8,
	},
	employeeName: {
		fontSize: 18,
		fontWeight: "bold",
	},
	employeeEmail: {
		fontSize: 16,
		color: "#666",
	},
	employeeRole: {
		fontSize: 14,
		color: "#999",
	},
	deleteButton: {
		backgroundColor: colors.error, // Use your error color (e.g., red)
		padding: 8,
		borderRadius: 5,
		alignSelf: "flex-end", // Align the button to the right
		marginTop: 10,
	},
	deleteButtonText: {
		color: "white",
		fontSize: 14,
	},
});

export default EmployeeScreen;
