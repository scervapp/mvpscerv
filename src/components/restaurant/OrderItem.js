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
import { AntDesign, MaterialIcons } from "@expo/vector-icons"; // Import icon
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

				{item.pip.specialInstructions && (
					<Text style={styles.specialInstructions}>
						{item.pip.specialInstructions}
					</Text>
				)}

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
			</View>

			{itemStatus === "completed" ? (
				<MaterialIcons name="check-circle" size={24} color="green" /> // Check icon for completed items
			) : (
				<TouchableOpacity onPress={() => setModalVisible(true)}>
					<AntDesign name="caretdown" size={16} color="gray" />
				</TouchableOpacity>
			)}

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

			<Text style={styles.timeSent}>{formattedTime}</Text>
		</View>
	);
};

const styles = StyleSheet.create({
	orderItemContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
		padding: 10,
		borderWidth: 1,
		borderColor: "#ccc",
		borderRadius: 5,
		backgroundColor: "#fff",
	},
	itemInfo: {
		flex: 1,
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
		color: "red",
		marginTop: 2,
	},
	itemStatusContainer: {
		marginLeft: 10,
	},
	completedOrderItem: {
		backgroundColor: "#e0f7e9", // Light green background for completed items
		borderColor: "#4caf50", // Green border
	},
	completedDishName: {
		textDecorationLine: "line-through",
		color: "gray", // Faded color for completed items
	},
	timeSent: {
		fontSize: 12,
		color: "gray",
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
		borderColor: "#ced4da",
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
