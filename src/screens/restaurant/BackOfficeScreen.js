import React from "react";
import {
	View,
	Text,
	StyleSheet,
	FlatList,
	TouchableOpacity,
} from "react-native";

const BackOfficeScreen = ({ navigation }) => {
	// Define an array of screen names and their display labels
	const screens = [
		{ name: "RestaurantDashboard", label: "Dashboard" },
		{ name: "OrdersScreen", label: "Orders" },
		{ name: "RestaurantMenu", label: "Menu Management" },
		{ name: "RestaurantProfile", label: "Profile" },
		{ name: "EmployeeScreen", label: "Employee" },
		// Add more screens as needed
	];

	const handleScreenPress = (screenName) => {
		navigation.navigate(screenName); // Navigate to the selected screen
	};

	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Back Office</Text>

			<FlatList
				data={screens}
				keyExtractor={(item) => item.name}
				renderItem={({ item }) => (
					<TouchableOpacity
						onPress={() => handleScreenPress(item.name)}
						style={styles.screenItem}
					>
						<Text>{item.label}</Text>
					</TouchableOpacity>
				)}
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
		marginBottom: 10,
	},
	screenItem: {
		padding: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#ccc",
	},
});

export default BackOfficeScreen;
