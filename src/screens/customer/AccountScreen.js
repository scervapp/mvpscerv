import { useNavigation } from "@react-navigation/native";
import React, { useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	Pressable,
	Alert,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import { Ionicons } from "@expo/vector-icons";

const AccountScreen = () => {
	const { logout, deleteUserFunction } = useContext(AuthContext);
	const navigation = useNavigation();

	const handleSignOut = async () => {
		try {
			await logout({ global: true });
			navigation.navigate("Welcome");
		} catch (error) {
			console.log("error signing out: ", error);
		}
	};

	const handleDeleteAccount = async () => {
		Alert.alert(
			"Delete Account",
			"Are you sure you want to delete your account? This action cannot be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							// 1. Delete the user's account from Firebase Authentication
							await deleteUserFunction();
							navigation.navigate("Welcome");
						} catch (error) {
							console.error("Error deleting account:", error);
							Alert.alert(
								"Error",
								"Failed to delete account. Please try again."
							);
						}
					},
				},
			]
		);
	};

	// Render the account settings screen
	return (
		<View style={styles.container}>
			<Text style={styles.header}>My Account</Text>

			<TouchableOpacity
				onPress={() => navigation.navigate("PipsScreenInner")}
				style={styles.listItem}
			>
				<Ionicons
					name="people-outline"
					size={24}
					color="gray"
					style={styles.icon}
				/>
				<Text style={styles.listItemText}>PIPS</Text>
				<Ionicons
					name="chevron-forward-outline"
					size={24}
					color="gray"
					style={styles.chevronIcon}
				/>
			</TouchableOpacity>

			<TouchableOpacity
				onPress={() => navigation.navigate("OrderHistoryScreenInner")}
				style={styles.listItem}
			>
				<Ionicons
					name="time-outline"
					size={24}
					color="gray"
					style={styles.icon}
				/>
				<Text style={styles.listItemText}>Order History</Text>
				<Ionicons
					name="chevron-forward-outline"
					size={24}
					color="gray"
					style={styles.chevronIcon}
				/>
			</TouchableOpacity>

			{/* Add other list items as needed */}
			<TouchableOpacity onPress={handleDeleteAccount} style={styles.listItem}>
				{/* Add the "Delete Account" button */}
				<Ionicons
					name="trash-outline"
					size={24}
					color="red"
					style={styles.icon}
				/>
				<Text style={styles.listItemText}>Delete Account</Text>
			</TouchableOpacity>

			<Pressable onPress={handleSignOut} style={styles.logoutButton}>
				<Text style={styles.logoutButtonText}>Logout</Text>
			</Pressable>
		</View>
	);
};

// Add styles
const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
		backgroundColor: "#f8f8f8", // Example background color
	},
	header: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		color: "#333",
	},
	listItem: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#fff",
		padding: 15,
		marginBottom: 10,
		borderRadius: 8,
	},
	icon: {
		marginRight: 10,
	},
	chevronIcon: {
		marginLeft: "auto",
	},
	listItemText: {
		fontSize: 16,
		flex: 1,
	},
	logoutButton: {
		backgroundColor: "#dc3545", // Example logout button color
		padding: 15,
		borderRadius: 8,
		marginTop: 30,
		alignItems: "center",
	},
	logoutButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default AccountScreen;

//AccountScreen
