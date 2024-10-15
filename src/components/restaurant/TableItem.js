import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Card, ListItem } from "react-native-elements";

const TableItem = ({
	item,
	onPress,
	isSelected,
	isCheckinFlow,
	width,
	height,
}) => {
	// Determin background color based on status
	const tableItemStyle = {
		...styles.tableItem,
		backgroundColor: getTableItemStyle(item.status),
		width: width,
		height: height,
	};

	return (
		<TouchableOpacity
			disabled={!onPress}
			onPress={onPress}
			style={[
				styles.tableItem,
				tableItemStyle,
				isSelected && styles.selected,
				styles.shadowEffect,
			]}
		>
			<View style={styles.tableContent}>
				<Text style={styles.tableNumber}>{item.name}</Text>
				{isCheckinFlow && item.status === "available" && (
					<Text style={styles.status}>item.status</Text>
				)}
			</View>
		</TouchableOpacity>
	);
};

const getTableItemStyle = (status) => {
	switch (status) {
		case "available":
			return "#147a23"; // Green style
		case "OCCUPIED":
			return "#851f18"; // Red style
		case "checkedOut":
			return "orange"; // Yellow style
		default:
			return {}; // Default styles (optional)
	}
};
const styles = StyleSheet.create({
	tableItem: {
		borderRadius: 10,
		margin: 10,
		justifyContent: "center",
		alignItems: "center",
	},
	tableContent: {
		alignItems: "center",
	},
	tableNumber: {
		fontSize: 18, // Increased font size for better visibility
		fontWeight: "bold",
		color: "#fff", // White text for better contrast
		marginBottom: 5,
	},
	capacity: {
		fontSize: 14,
		color: "#fff", // White text for contrast
		marginTop: 5,
	},
	selected: {
		backgroundColor: "#007bff", // Highlight color when selected
	},
	status: {
		fontSize: 14,
		color: "#ddd", // Lighter text for subtlety
		marginTop: 5,
	},
	shadowEffect: {
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 5,
		elevation: 5, // Android shadow support
	},
});

export default TableItem;
