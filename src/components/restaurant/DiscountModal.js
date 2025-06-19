import React, { useState } from "react";
import {
	Modal,
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
} from "react-native";
import { Button } from "react-native-paper";
import colors from "../../utils/styles/appStyles";

const DiscountModal = ({ isVisible, onClose, onSubmit, item, isLoading }) => {
	// It's better to reset state when the modal becomes visible
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");



	if (!isVisible) return null;

	const handleApply = () => {
		const parsedAmount = parseFloat(amount);
		// Pass the validated data up to the parent
		onSubmit(parsedAmount, reason, item);
	};

	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<TouchableOpacity
				style={styles.modalOverlay}
				activeOpacity={1}
				onPressOut={onClose}
			>
				<TouchableOpacity style={styles.discountModalContent} activeOpacity={1}>
					<Text style={styles.modalTitle}>Discount Item</Text>
					<Text style={styles.discountItemName}>{item.dishName}</Text>
					<TextInput
						style={styles.input}
						placeholder="Discount Amount (e.g., 2.50)"
						value={amount}
						onChangeText={setAmount}
						keyboardType="decimal-pad" // More appropriate for currency
					/>
					<TextInput
						style={styles.input}
						placeholder="Reason (e.g., 'Food cold')"
						value={reason}
						onChangeText={setReason}
					/>
					<View style={styles.modalActions}>
						<Button onPress={onClose} mode="outlined">
							Cancel
						</Button>
						<Button
							onPress={handleApply}
							mode="contained"
							loading={isLoading}
							disabled={isLoading}
						>
							Apply
						</Button>
					</View>
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
	);
};

// It's good practice to keep styles with the component
const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	discountModalContent: {
		backgroundColor: colors.surfaceWhite, // Assuming this color exists
		padding: 25,
		borderRadius: 12,
		width: "100%",
		maxWidth: 400,
	},
	modalTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginBottom: 15,
	},
	discountItemName: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 20,
	},
	input: {
		height: 50,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		marginBottom: 10,
		fontSize: 16,
	},
	modalActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 20,
	},
});

export default DiscountModal;
