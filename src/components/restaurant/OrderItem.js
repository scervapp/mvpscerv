import React, { useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	Button,
	TouchableOpacity,
	Modal,
	TextInput,
} from "react-native";
import moment from "moment";
import { Picker } from "@react-native-picker/picker";
import { AntDesign } from "@expo/vector-icons";
import { useActionSheet } from "@expo/react-native-action-sheet";
import colors from "../../utils/styles/appStyles";

const OrderItem = ({
	item,
	onMarkComplete,
	onMarkInProgress,
	onApplyDiscount,
}) => {
	const [modalVisible, setModalVisible] = useState(false);
	const [itemStatus, setItemStatus] = useState(item.itemStatus || "pending");
	const [discountAmount, setDiscountAmount] = useState("");

	const { showActionSheetWithOptions } = useActionSheet();

	const formattedTime = moment(item.sentToChefQAt.toDate()).fromNow();

	const handleStatusChange = (newStatus) => {
		setItemStatus(newStatus);
		setModalVisible(false);

		// Call the appropriate callback function based on the selected status
		if (newStatus === "completed") {
			onMarkComplete(item.id);
		} else if (newStatus === "preparing") {
			onMarkInProgress(item.id);
		}
	};

	const handleApplyDiscount = () => {
		if (discountAmount) {
			onApplyDiscount(item.id, parseFloat(discountAmount)); // Pass itemId and discount amount
			setDiscountAmount("");
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
				<Text style={styles.pipName}>{item.pip.name}</Text>

				{/* Special Instructions (if any) */}
				{item.specialInstructions && (
					<Text style={styles.specialInstructions}>
						{item.specialInstructions}
					</Text>
				)}

				{/* Display price with discount (if applicable) */}
				<Text style={styles.itemPrice}>
					{item.discount ? (
						<>
							<Text style={styles.originalPrice}>${item.dish.price}</Text>
							<Text style={styles.discountedPrice}>
								{" "}
								${item.discountedPrice}
							</Text>
						</>
					) : (
						`$${item.dish.price}`
					)}
				</Text>
			</View>

			<View style={styles.itemStatusContainer}>
				<TouchableOpacity onPress={() => setModalVisible(true)}>
					{/* Button to open the picker */}
					<AntDesign name="caretdown" size={16} color="gray" />
				</TouchableOpacity>
			</View>
			<Modal visible={modalVisible} animationType="fade" transparent={true}>
				<View style={styles.modalContainer}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>Change Status</Text>
						<Picker
							selectedValue={itemStatus}
							onValueChange={handleStatusChange}
							style={styles.statusPicker}
						>
							<Picker.Item label="Pending" value="pending" />
							<Picker.Item label="In Progress" value="preparing" />
							<Picker.Item label="Completed" value="completed" />
						</Picker>
						<View style={styles.discountInputContainer}>
							<TextInput
								style={styles.discountInput}
								placeholder="Enter discount amount"
								value={discountAmount}
								onChangeText={setDiscountAmount}
								keyboardType="numeric"
							/>
							<TouchableOpacity
								onPress={handleApplyDiscount}
								style={styles.applyDiscountButton}
							>
								<Text style={styles.applyDiscountButtonText}>Apply</Text>
							</TouchableOpacity>
						</View>
						<Button title="Cancel" onPress={() => setModalVisible(false)} />
					</View>
				</View>
			</Modal>

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
	modalContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContent: {
		backgroundColor: "white",
		padding: 20,
		borderRadius: 10,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
	},
	statusPicker: {
		width: 200, // Adjust width as needed
		marginBottom: 20,
	},
	originalPrice: {
		textDecorationLine: "line-through",
		color: "gray",
		marginRight: 5,
	},
	discountedPrice: {
		color: "red",
		fontWeight: "bold",
	},
	discountInputContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 10,
		borderWidth: 1,
		borderColor: "#ced4da", // Light gray border
		borderRadius: 8,
		paddingHorizontal: 10,
		marginVertical: 10,
	},
	discountInput: {
		flex: 1,
		height: 40,
		fontSize: 16,
	},
	applyDiscountButton: {
		backgroundColor: colors.primary,
		paddingHorizontal: 15,
		paddingVertical: 8,
		borderRadius: 8,
		marginLeft: 10,
	},
	applyDiscountButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default OrderItem;
