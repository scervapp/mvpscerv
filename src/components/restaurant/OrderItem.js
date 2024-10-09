import React, { useState } from "react";
import { View, Text, StyleSheet, Button, TouchableOpacity } from "react-native";
import moment from "moment";
import { Picker } from "@react-native-picker/picker";
import { AntDesign } from "@expo/vector-icons";
import { useActionSheet } from "@expo/react-native-action-sheet";

const OrderItem = ({ item, onMarkComplete, onMarkInProgress }) => {
	const [itemStatus, setItemStatus] = useState(item.itemStatus || "pending");
	const { showActionSheetWithOptions } = useActionSheet();

	const formattedTime = moment(item.sentToChefQAt.toDate()).fromNow();

	const handleStatusChange = (index) => {
		const newStatus = ["pending", "preparing", "completed"][index];
		setItemStatus(newStatus);

		// Call the appropriate callback function based on the selected status
		if (newStatus === "completed") {
			onMarkComplete(item.id);
		} else if (newStatus === "preparing") {
			onMarkInProgress(item.id);
		}
	};

	const handleOpenActionSheet = () => {
		// Configure the action sheet options
		const options = ["Pending", "In Progress", "Completed", "Cancel"];
		const cancelButtonIndex = 3;

		showActionSheetWithOptions(
			{
				options,
				cancelButtonIndex,
			},
			(buttonIndex) => {
				if (buttonIndex !== cancelButtonIndex) {
					handleStatusChange(buttonIndex);
				}
			}
		);
	};

	// Receive the 'item' prop
	return (
		<View
			style={[
				styles.orderItemContainer,
				itemStatus === "completed" && styles.completedOrderItem,
			]}
		>
			<View style={styles.itemInfo}>
				<Text
					style={[
						styles.dishName,
						itemStatus === "completed" && styles.completedDishName,
					]}
				>
					{item.dish.name} x {item.quantity}
				</Text>
				{/* Display PIP name */}
				<Text style={styles.pipName}>{item.pip.name}</Text>

				{/* Special Instructions (if any) */}
				{item.specialInstructions && (
					<Text style={styles.specialInstructions}>
						{item.specialInstructions}
					</Text>
				)}
			</View>

			<View style={styles.itemStatusContainer}>
				<TouchableOpacity onPress={handleOpenActionSheet}>
					{/* Button to open the picker */}
					<AntDesign name="caretdown" size={16} color="gray" />
				</TouchableOpacity>
			</View>

			{/* Display the time the order was sent */}
			<Text style={styles.timeSent}>{formattedTime}</Text>
		</View>
	);
};

const styles = StyleSheet.create({
	orderItemContainer: {
		flexDirection: "row", // Arrange item details, status, and time in a row
		justifyContent: "space-between", // Space them out evenly
		alignItems: "center", // Align items vertically
		marginBottom: 10,
		padding: 10,
		borderWidth: 1,
		borderColor: "#ccc",
		borderRadius: 5,
	},
	itemInfo: {
		flex: 1, // Allow item info to take up available space
		marginRight: 10,
	},
	dishName: {
		fontSize: 16,
		fontWeight: "bold",
	},
	pipName: {
		fontSize: 14,
		color: "gray",
	},
	specialInstructions: {
		fontSize: 12,
		color: "gray",
		marginTop: 2,
	},
	itemStatusContainer: {
		marginLeft: 10,
	},
	statusPicker: {
		width: 120,
	},
	timeSent: {
		fontSize: 12,
		color: "gray",
	},
	completedOrderItem: {
		// Style for completed items
		opacity: 0.6, // Slightly reduce opacity
	},
	completedDishName: {
		textDecorationLine: "line-through",
	},
	statusPicker: {
		width: 120,
	},
	hiddenPicker: {
		position: "absolute", // Position it absolutely
		top: -1000, // Move it off-screen to hide it
	},
});

export default OrderItem;
