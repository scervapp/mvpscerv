import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Card, ListItem } from "react-native-elements";

const TableItem = ({ item, onPress, isSelected, isCheckinFlow }) => {
	// Determin background color based on status
	const tableItemStyle = {
		...styles.tableItem,
		backgroundColor: getTableItemStyle(item.status),
	};

	return (
		<TouchableOpacity
			disabled={!onPress}
			onPress={onPress}
			style={[styles.tableItem, tableItemStyle, isSelected && styles.selected]}
		>
			<Text style={styles.tableNumber}>{item.name}</Text>
			{isCheckinFlow && item.status === "available" && (
				<Text style={styles.status}>item.status</Text>
			)}
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
			return "#adad0a"; // Yellow style
		default:
			return {}; // Default styles (optional)
	}
};
const styles = StyleSheet.create({
	container: {
		margin: 5,
	},
	tableItem: {
		borderRadius: 10,
		padding: 10,
		borderWidth: 1,
		borderColor: "#ccc",
		borderRadius: 5,
		marginBottom: 5,
		height: 100,
		width: 100,
		margin: 5,
	},
	availableTable: {
		backgroundColor: "#d1f2eb",
	},
	occupiedTable: {
		backgroundColor: "#851f18",
	},
	checkedOutTable: {
		backgroundColor: "#fff3cd",
	},
	tableNumber: {
		fontSize: 14, // Adjust as needed
		fontWeight: "bold",
		textAlign: "center",
		color: "white",
	},
	selected: {
		backgroundColor: "lightblue",
	},
	status: {
		color: "#999",
		fontSize: 12,
	},
	tableContainer: {
		flex: 1,
		width: "90%",
	},
});

export default TableItem;
