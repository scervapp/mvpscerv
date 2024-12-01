import React, { useEffect, useRef, useState } from "react";
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
import { AntDesign, MaterialIcons } from "@expo/vector-icons"; // Import icon
import { useActionSheet } from "@expo/react-native-action-sheet";
import colors from "../../utils/styles/appStyles";
import { Ionicons } from "@expo/vector-icons"; // Import Ionicons

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

		if (newStatus === "completed") {
			onMarkComplete(item.id);
		} else if (newStatus === "preparing") {
			onMarkInProgress(item.id);
		}
	};

	const handleApplyDiscount = () => {
		if (discountAmount) {
			onApplyDiscount(item.id, parseFloat(discountAmount));
			setDiscountAmount("");
		}
	};

	const handleOpenActionSheet = () => {
		const options = ["Pending", "In Progress", "Completed", "Cancel"];
		const cancelButtonIndex = 3;

		showActionSheetWithOptions(
			{
				options,
				cancelButtonIndex,
			},
			(buttonIndex) => {
				if (buttonIndex !== cancelButtonIndex) {
					handleStatusChange(options[buttonIndex].toLowerCase());
				}
			}
		);
	};

	return (
		<View>
			<TouchableOpacity
				style={styles.orderItemContainer}
				onPress={() => setModalVisible(true)}
			>
				{/* Table Number */}
				<View style={styles.tableNumberContainer}>
					<Text style={styles.tableNumber}>
						{item.table.name.replace("Table ", "")}
					</Text>
				</View>

				{/* Item Details */}
				<View style={styles.itemDetailsContainer}>
					<Text style={styles.dishName}>
						{item.dish.name} x {item.quantity}
					</Text>

					{/* Special Instructions (if any) */}
					{item.pip.specialInstructions && (
						<Text style={styles.specialInstructions}>
							{item.pip.specialInstructions}
						</Text>
					)}

					{/* Display price with discount (if applicable) */}
					<Text style={styles.itemPrice}>
						{item.discount ? (
							<>
								<Text style={styles.originalPrice}>${item.dish.price}</Text>
								<Text style={styles.discountedPrice}>
									${item.discountedPrice}
								</Text>
							</>
						) : (
							`$${item.dish.price}`
						)}
					</Text>

					{/* Order Time */}
					<Text style={styles.orderTime}>{formattedTime}</Text>
				</View>

				{/* Status Icon */}
				<View style={styles.statusIconContainer}>
					{item.itemStatus === "pending" && (
						<Ionicons name="time-outline" size={24} color="gray" />
					)}
					{item.itemStatus === "preparing" && (
						<Ionicons name="flame" size={24} color="orange" />
					)}
					{item.itemStatus === "completed" && (
						<Ionicons name="checkmark-circle" size={24} color="green" />
					)}
				</View>
			</TouchableOpacity>

			{/* Status and Discount Modal */}
			<Modal visible={modalVisible} animationType="slide" transparent={true}>
				<View style={styles.modalContainer}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>{item.dish.name}</Text>
						{item.pip.specialInstructions && (
							<Text style={styles.specialInstructions}>
								{item.pip.specialInstructions}
							</Text>
						)}
						{/* Status Picker */}
						<Picker
							selectedValue={itemStatus}
							onValueChange={handleStatusChange}
							style={styles.statusPicker}
						>
							<Picker.Item label="Pending" value="pending" />
							<Picker.Item label="Preparing" value="preparing" />
							<Picker.Item label="Completed" value="completed" />
						</Picker>

						{/* Discount Input */}
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

						{/* Close Modal Button */}
						<Button title="Close" onPress={() => setModalVisible(false)} />
					</View>
				</View>
			</Modal>
		</View>
	);
};

const styles = StyleSheet.create({
	orderItemContainer: {
		flexDirection: "row",
		alignItems: "center",
		padding: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#ccc",
	},
	tableNumberContainer: {
		backgroundColor: colors.primary,
		padding: 8,
		borderRadius: 5,
		marginRight: 10,
	},
	tableNumber: {
		fontSize: 16,
		fontWeight: "bold",
		color: "white",
	},
	itemDetailsContainer: {
		flex: 1,
		marginRight: 10,
	},
	dishName: {
		fontSize: 16,
		fontWeight: "bold",
	},
	specialInstructions: {
		fontSize: 14,
		color: "red",
		marginTop: 5,
	},
	itemPrice: {
		fontSize: 16,
		fontWeight: "bold",
	},
	originalPrice: {
		textDecorationLine: "line-through",
		color: colors.textLight, // Use a lighter color for the original price
		marginRight: 5,
	},
	discountedPrice: {
		color: colors.primary, // Use your primary color for the discounted price
		fontWeight: "bold",
	},
	orderTime: {
		fontSize: 12,
		color: "gray",
	},
	statusIconContainer: {
		// Added container for the status icon
		marginLeft: 10,
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
		width: "80%",
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",

		marginBottom: 15,
		textAlign: "center",
	},
	statusPicker: {
		width: 200,
		marginBottom: 20,
		borderWidth: 1,
		borderColor: colors.lightGray, // Add a border to the picker
		borderRadius: 8, // Add rounded corners to the picker
		padding: 10,
	},
	discountInputContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 10,
		borderWidth: 1,
		borderColor: "#ced4da",
		borderRadius: 8,
		paddingHorizontal: 10,
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
	cancelButton: {
		// Style for the "Cancel" button
		backgroundColor: "#ccc",
		padding: 12,
		borderRadius: 8,
		marginTop: 20, // Add margin top
		alignItems: "center",
	},
	completedOrderItem: {
		opacity: 0.6, // Slightly reduce opacity for completed items
	},
});

export default OrderItem;
