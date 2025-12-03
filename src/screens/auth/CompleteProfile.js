// screens/auth/CompleteProfileScreen.js
import React, { useState, useContext } from "react";
import {
	View,
	Text,
	TextInput,
	Button,
	Alert,
	StyleSheet,
	ActivityIndicator,
} from "react-native"; // Added Text, StyleSheet, ActivityIndicator
import { doc, getDoc, setDoc } from "@react-native-firebase/firestore";
import { db } from "../../config/firebase"; // Check your path. usually just 'firebase', not 'firebase.native' unless you specifically named it that.
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

export default function CompleteProfileScreen() {
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [loading, setLoading] = useState(false);

	// FIX: Use 'currentUser' (Auth Object), NOT 'currentUserData' (Firestore Doc)
	const { currentUser } = useContext(AuthContext);

	const saveProfile = async () => {
		if (!firstName.trim() || !lastName.trim()) {
			return Alert.alert("Required", "Please enter your first and last name.");
		}

		setLoading(true);
		try {
			// 1. Create the document in Firestore
			// We use currentUser.uid (from Firebase Auth) because currentUserData is null
			await setDoc(
				doc(db, "customers", currentUser.uid),
				{
					uid: currentUser.uid,
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					phoneNumber: currentUser.phoneNumber,
					role: "customer",
					canViewHiddenRestaurants: false,
					stripeCustomerId_test: null,
					stripeCustomerId_live: null,
					partyIds: [],
					createdAt: new Date(),
					profileCompleted: true,
				},
				{ merge: true }
			);

			// 2. Do NOTHING else.
			// The onSnapshot listener in AppNavigator.js will detect this new document
			// and automatically flip the switch to show the App Stack.
			console.log("Profile created successfully.");
		} catch (e) {
			console.error(e);
			Alert.alert("Error saving profile", e.message);
			setLoading(false); // Only stop loading if there is an error
		}
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Almost there!</Text>
			<Text style={styles.subtitle}>
				Please confirm your name to finish setup.
			</Text>

			<TextInput
				style={styles.input}
				placeholder="First name"
				value={firstName}
				onChangeText={setFirstName}
				placeholderTextColor={colors.textMedium}
			/>
			<TextInput
				style={styles.input}
				placeholder="Last name"
				value={lastName}
				onChangeText={setLastName}
				placeholderTextColor={colors.textMedium}
			/>

			{loading ? (
				<ActivityIndicator size="large" color="#0000ff" />
			) : (
				<Button
					color={colors.primary}
					title="Complete Setup"
					onPress={saveProfile}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
		justifyContent: "center",
		backgroundColor: "#fff",
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 16,
		color: "#666",
		marginBottom: 30,
		textAlign: "center",
		color: colors.textDark,
	},
	input: {
		borderWidth: 1,
		borderColor: "#ccc",
		padding: 15,
		marginBottom: 15,
		borderRadius: 8,
		fontSize: 16,
		color: colors.textDark,
	},
});
