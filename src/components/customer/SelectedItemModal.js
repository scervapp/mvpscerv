import React, { useState, useContext } from "react";
import { useNavigation } from "@react-navigation/native";
import {
	View,
	Text,
	Modal,
	StyleSheet,
	TouchableOpacity,
	ScrollView,
	Alert,
} from "react-native";
import { Checkbox, Button, Divider } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import { Tooltip } from "react-native-elements";
import { Ionicons } from "@expo/vector-icons";

const SelectedItemModal = ({
	visible,
	selectedItem,
	onClose,
	pips,
	selectedPIPs,
	confirmAddToBasket,
	handlePIPSelection,
}) => {
	const [customerError, setCustomerError] = useState("");
	const navigation = useNavigation();
	const [helpTextVisible, setHelpTextVisible] = useState(false);

	return (
		<Modal visible={visible} animationType="fade" onRequestClose={onClose}>
			<View style={styles.modalContainer}>
				<View style={styles.modalContent}>
					{/* Item Details */}
					<View style={styles.itemDetailsContainer}>
						<Text style={styles.itemName}>{selectedItem?.name}</Text>
						{selectedItem?.description && (
							<Text style={styles.itemDescription}>
								{selectedItem?.description}
							</Text>
						)}
						<Text style={styles.itemPrice}>${selectedItem?.price}</Text>
					</View>

					<Divider style={styles.divider} />

					{/* PIP Selection */}
					<View style={styles.pipSelectionContainer}>
						<View style={styles.sectionHeader}>
							<Text style={styles.sectionTitle}>Choose who gets this:</Text>
							{/* Help Icon */}
							<TouchableOpacity
								onPress={() => setHelpTextVisible(!helpTextVisible)}
							>
								<Ionicons name="help-circle-outline" size={20} color="gray" />
							</TouchableOpacity>
						</View>

						{/* Help Text (conditionally rendered) */}
						{helpTextVisible && (
							<Text style={styles.helpText}>
								Not sure what PIPs are? They let you assign items to people in
								your party! Tap "Manage PIPS" to add or edit them.
							</Text>
						)}

						{/* Add a button to navigate to the PIPS screen */}
						<TouchableOpacity
							onPress={() => {
								onClose();
								navigation.navigate("AccountScreen", {
									screen: "PipScreenInner",
								}); // Then navigate to the PIPS screen
							}}
							style={styles.addPipButton}
						>
							<Text style={styles.addPipButtonText}>Manage PIPS</Text>
						</TouchableOpacity>

						{pips.length > 0 ? (
							pips.map((pip) => (
								<TouchableOpacity
									key={pip.id}
									style={styles.pipCheckbox}
									onPress={() => handlePIPSelection(pip.id)}
								>
									<Checkbox
										status={
											selectedPIPs.some(
												(selectedPip) => selectedPip.id === pip.id
											)
												? "checked"
												: "unchecked"
										}
										onPress={() => handlePIPSelection(pip.id)}
										color={colors.primary}
									/>
									<Text style={styles.pipName}>{pip.name}</Text>
								</TouchableOpacity>
							))
						) : (
							<Text style={styles.noPipsText}>No PIPS found.</Text>
						)}
					</View>

					<Divider style={styles.divider} />

					{/* Buttons */}
					<View style={styles.buttonContainer}>
						<TouchableOpacity
							onPress={confirmAddToBasket}
							style={styles.confirmButton}
						>
							<Text style={styles.confirmButtonText}>Add to Basket</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={onClose} style={styles.cancelButton}>
							<Text style={styles.cancelButtonText}>Cancel</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center", // This was causing the issue
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContent: {
		backgroundColor: "white",
		padding: 20,
		borderRadius: 10,
		width: "90%", // Or maxWidth: 400, as discussed earlier
		maxHeight: "80%",
	},
	itemDetailsContainer: {
		alignItems: "center",
		marginBottom: 20,
	},
	itemName: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 5,
	},
	itemDescription: {
		fontSize: 16,
		marginBottom: 10,
		textAlign: "center",
		color: "#666",
	},
	itemPrice: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.primary,
	},
	divider: {
		marginVertical: 20,
	},
	pipSelectionContainer: {
		marginBottom: 20,
		overflow: "visible",
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center",
	},
	pipCheckbox: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 8,
	},
	pipName: {
		fontSize: 16,
		marginLeft: 10,
	},
	noPipsText: {
		fontSize: 16,
		textAlign: "center",
		color: "#999",
	},
	buttonContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginTop: 20,
	},
	addButton: {
		backgroundColor: colors.primary,
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
		flex: 1,
		marginRight: 10,
	},
	addButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	confirmButton: {
		// Styles for the Confirm button
		backgroundColor: colors.primary, // Or any color you prefer
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
		flex: 1,
		marginRight: 10,
	},
	confirmButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	cancelButton: {
		// Styles for the Cancel button
		backgroundColor: "#ccc", // Or any color you prefer
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
		flex: 1,
	},
	cancelButtonText: {
		color: "#333",
		fontSize: 16,
		fontWeight: "bold",
	},
	addPipButton: {
		backgroundColor: colors.primary,
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 15,
	},
	addPipButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 10,
	},
	helpText: {
		fontSize: 14,
		color: "#666", // Slightly muted color for help text
		textAlign: "center",
		marginBottom: 15,
	},
});

export default SelectedItemModal;
