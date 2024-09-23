import React, { useState, useContext } from "react";
import { View, Text, StyleSheet, TextInput, Button, Alert } from "react-native";
import { AuthContext } from "../../context/authContext";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../config/firebase";
import { Picker } from "@react-native-picker/picker";

const EmployeeScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState("server"); // You can customize the default role
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

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

	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Add New Employee</Text>

			{/* Input Fields */}
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

			{/* Role Selection (You can customize this based on your roles) */}
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

			{/* Error Message (if any) */}
			{error && <Text style={styles.errorText}>{error}</Text>}

			{/* Add Employee Button */}
			<Button
				title="Add Employee"
				onPress={handleAddEmployee}
				buttonStyle={styles.addButton}
				loading={isLoading} // Show loading indicator while adding
				disabled={isLoading}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
	},
	heading: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 20,
	},
	input: {
		borderWidth: 1,
		borderColor: "#ccc",
		borderRadius: 5,
		padding: 10,
		marginBottom: 10,
	},
	picker: {
		marginBottom: 20,
	},
	addButton: {
		backgroundColor: "green", // Or any suitable color
	},
	errorText: {
		color: "red",
		marginBottom: 10,
	},
});

export default EmployeeScreen;
