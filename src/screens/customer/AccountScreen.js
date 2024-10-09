import { useNavigation } from "@react-navigation/native";
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

const AccountScreen = () => {
	const navigation = useNavigation();

	// Render the account settings screen
	return (
		<View style={styles.container}>
			<Text>Account Settings</Text>
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Profile</Text>
			</View>
			<TouchableOpacity
				onPress={() => navigation.navigate("PipsScreenInner")}
				style={styles.section}
			>
				<Text style={styles.sectionTitle}>PIPS</Text>
			</TouchableOpacity>
			<TouchableOpacity
				onPress={() => navigation.navigate("OrderHistoryScreenInner")}
				style={styles.section}
			>
				<Text style={styles.sectionTitle}>Order History</Text>
			</TouchableOpacity>
		</View>
	);
};

useNavigation;

// Add styles
const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
	},
	header: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 15,
	},
	section: {
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
	},
	list: {
		// Add styles to arrange the list items
	},
	listItem: {
		padding: 15,
		borderBottomWidth: 1,
		borderBottomColor: "#ccc",
	},
	listItemText: {
		fontSize: 16,
	},
});

export default AccountScreen;

//AccountScreen
