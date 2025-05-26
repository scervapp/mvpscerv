import React, { useState, useContext, useEffect } from "react";
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
import {
	Checkbox,
	Button,
	Divider,
	IconButton,
	TextInput,
} from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import { Tooltip } from "react-native-elements";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthContext } from "../../context/authContext";

const PipInstructionModal = ({
	visible,
	onClose,
	pipName,
	initialInstructions = "",
	onSaveInstructions,
}) => {
	const [instructions, setInstructions] = useState(initialInstructions);

	useEffect(() => {
		if (visible) {
			setInstructions(initialInstructions);
		}
	}, [visible, initialInstructions]);

	const handleSave = () => {
		onSaveInstructions(instructions);
		onClose();
	};

	return (
		<Modal
			visible={visible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.pipInstructionModalContent}>
					<Text style={styles.modalTitle}>
						Special Instructions for {pipName}
					</Text>
					<TextInput
						style={styles.specialInstructionsInput}
						placeholder={`Notes for ${pipName}'s item...`}
						value={instructions}
						onChangeText={setInstructions}
						multiline
						numberOfLines={4}
						placeholderTextColor={colors.textLight}
					/>
					<View style={styles.modalButtonRow}>
						<Button
							onPress={onClose}
							mode="outlined"
							style={styles.modalButton}
						>
							Cancel
						</Button>
						<Button
							onPress={handleSave}
							mode="contained"
							style={[styles.modalButton, { backgroundColor: colors.primary }]}
						>
							Save Instructions
						</Button>
					</View>
				</View>
			</View>
		</Modal>
	);
};

const SelectedItemModal = ({
	visible,
	selectedItem,
	onClose,
	pips, // Current user's local PIP list
	onConfirm,
	orderingMode = "individual",
}) => {
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);

	const [quantity, setQuantity] = useState(1);
	// This state now stores { id, name, specialInstructions } for each selected PIP in individual mode
	const [internallySelectedPIPs, setInternallySelectedPIPs] = useState([]);
	// For party mode, who the item is for (currentUser or one of their local PIPs)
	const [partyModeTarget, setPartyModeTarget] = useState(null); // { id, name, specialInstructions (for this item instance) }

	const [orderTargets, setOrderTargets] = useState([]);

	// State for the PIP instruction modal
	const [isPipInstructionModalVisible, setIsPipInstructionModalVisible] =
		useState(false);
	const [editingTargetForInstructions, setEditingTargetForInstructions] =
		useState(null); // Stores { id, name, currentInstructions }

	const MYSELF_ID = currentUserData?.uid || "currentUser"; // Unique ID for "Myself"

	useEffect(() => {
		if (visible && selectedItem) {
			setQuantity(1);
			setInternallySelectedPIPs([]);
			if (orderingMode === "party" && currentUserData) {
				setOrderTargets([
					{
						id: MYSELF_ID,
						name: currentUserData.firstName || "Myself",
						specialInstructions: "",
					},
				]);
			} else {
				setOrderTargets([]);
			}
		}
	}, [visible, selectedItem, orderingMode, currentUserData, MYSELF_ID]);

	const openInstructionModalForTarget = (target) => {
		// target is {id, name}
		const existingTarget = orderTargets.find((t) => t.id === target.id);
		setEditingTargetForInstructions({
			id: target.id,
			name: target.name,
			currentInstructions: existingTarget
				? existingTarget.specialInstructions
				: "",
		});
		setIsPipInstructionModalVisible(true);
	};

	const handleSaveTargetInstructions = (instructions) => {
		if (!editingTargetForInstructions) return;

		setOrderTargets((prevTargets) =>
			prevTargets.map((t) =>
				t.id === editingTargetForInstructions.id
					? { ...t, specialInstructions: instructions }
					: t
			)
		);
		setEditingTargetForInstructions(null);
	};

	const toggleIndividualTargetSelection = (targetToToggle) => {
		// targetToToggle is {id, name}
		const isCurrentlySelected = orderTargets.some(
			(t) => t.id === targetToToggle.id
		);
		if (isCurrentlySelected) {
			setOrderTargets((prev) => prev.filter((t) => t.id !== targetToToggle.id));
		} else {
			// Add and then open instruction modal
			const newTarget = { ...targetToToggle, specialInstructions: "" };
			setOrderTargets((prev) => [...prev, newTarget]);
			openInstructionModalForTarget(newTarget); // Open for newly added target
		}
	};

	const handlePartyModeTargetSelection = (targetOption) => {
		// targetOption is {id, name}
		// In party mode, only one target is selected. Instructions are edited directly.
		setOrderTargets([{ ...targetOption, specialInstructions: "" }]); // Reset instructions when target changes
	};

	const handleConfirmPress = () => {
		if (!selectedItem) return;

		if (orderingMode === "individual" && orderTargets.length === 0) {
			Alert.alert(
				"Order For Whom?",
				"Please select at least one person (Yourself or a PIP) for this item."
			);
			return;
		}
		if (orderingMode === "party" && orderTargets.length === 0) {
			Alert.alert(
				"Order For Whom?",
				"Please select who this item is for in the party."
			);
			return;
		}

		const itemDataForContext = {
			selectedItem: { ...selectedItem },
			quantity, // This quantity will apply to EACH selected target if multiple in individual mode
			// Or to the single target in party mode.
			// specialInstructions are now part of the targets
		};

		if (orderingMode === "individual") {
			itemDataForContext.individualTargets = orderTargets; // Array of {id, name, specialInstructions}
		} else if (orderingMode === "party") {
			// In party mode, orderTargets should contain only one item
			const partyTarget = orderTargets[0];
			itemDataForContext.chosenPartyTargetName = partyTarget.name;
			itemDataForContext.specialInstructions = partyTarget.specialInstructions;
			console.log(
				"SelectedItemModal (Party Mode): chosenPartyTargetName being set to:",
				partyTarget.name
			);
		}
		console.log(
			"SelectedItemModal: Calling onConfirm with itemDataForContext:",
			JSON.stringify(itemDataForContext, null, 2)
		);
		onConfirm(itemDataForContext);
	};

	if (!selectedItem) return null;

	// Options for "Order For" in individual mode (Myself + PIPs)
	const individualOrderForOptions = currentUserData
		? [
				{ id: MYSELF_ID, name: currentUserData.firstName || "Myself" },
				...(pips || []),
		  ]
		: [...(pips || [])];

	// Options for "Order For" in party mode (Myself + User's local PIPs)
	// This assumes 'pips' prop contains the current user's local PIPs
	const partyOrderForOptions = currentUserData
		? [
				{ id: MYSELF_ID, name: currentUserData.firstName || "Myself" },
				...(pips || []),
		  ]
		: [...(pips || [])];

	return (
		<Modal
			visible={visible}
			animationType="slide"
			onRequestClose={onClose}
			transparent={true}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContent}>
					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={styles.scrollContainer}
					>
						<IconButton
							icon="close-circle"
							size={28}
							onPress={onClose}
							style={styles.closeButton}
							color={colors.textMedium}
						/>
						<View style={styles.itemDetailsContainer}>
							<Text style={styles.itemName}>{selectedItem.name}</Text>
							<Text style={styles.itemPrice}>
								${selectedItem.price.toFixed(2)}
							</Text>
						</View>
						<Divider style={styles.divider} />

						<View style={styles.sectionContainer}>
							<Text style={styles.sectionTitle}>Quantity</Text>
							<View style={styles.quantitySelector}>
								<IconButton
									icon="minus-circle"
									size={32}
									onPress={() => setQuantity((q) => Math.max(1, q - 1))}
									color={quantity > 1 ? colors.primary : colors.textLight}
									disabled={quantity <= 1}
								/>
								<Text style={styles.quantityTextModal}>{quantity}</Text>
								<IconButton
									icon="plus-circle"
									size={32}
									onPress={() => setQuantity((q) => Math.min(10, q + 1))}
									color={quantity < 10 ? colors.primary : colors.textLight}
									disabled={quantity >= 10}
								/>
							</View>
						</View>
						<Divider style={styles.divider} />

						{/* "Order For" selection - behavior depends on mode */}
						{orderingMode === "party" && (
							<View style={styles.sectionContainer}>
								<Text style={styles.sectionTitle}>
									Order this item for (in party):
								</Text>
								{partyOrderForOptions.map((option) => {
									const isSelected = orderTargets[0]?.id === option.id; // In party mode, orderTargets has one item
									return (
										<TouchableOpacity
											key={option.id}
											style={styles.pipCheckboxItem}
											onPress={() => handlePartyModeTargetSelection(option)}
										>
											<MaterialCommunityIcons
												name={isSelected ? "radiobox-marked" : "radiobox-blank"}
												size={24}
												color={colors.primary}
											/>
											<Text style={styles.pipNameText}>{option.name}</Text>
										</TouchableOpacity>
									);
								})}
								{/* Input for party mode target's special instructions */}
								{orderTargets.length > 0 &&
									orderTargets[0] && ( // Check if target exists
										<TextInput
											style={styles.specialInstructionsInput}
											placeholder={`Special instructions for ${orderTargets[0].name}...`}
											value={orderTargets[0].specialInstructions}
											onChangeText={(text) =>
												setOrderTargets((prev) => [
													{ ...prev[0], specialInstructions: text },
												])
											}
											multiline
											numberOfLines={3}
											placeholderTextColor={colors.textLight}
										/>
									)}
							</View>
						)}

						{orderingMode === "individual" && (
							<View style={styles.sectionContainer}>
								<View style={styles.sectionHeaderWithHelp}>
									<Text style={styles.sectionTitle}>
										Order for (select all that apply):
									</Text>
									{/* Help icon can be added back if needed */}
								</View>
								<Button
									icon="account-multiple-plus-outline"
									mode="text"
									onPress={() => {
										onClose();
										navigation.navigate("AccountScreen", {
											screen: "PipsScreenInner",
										});
									}}
									style={styles.managePipsButton}
									labelStyle={{ color: colors.primary, fontSize: 14 }}
								>
									Manage Your PIPs
								</Button>

								{individualOrderForOptions.map((target) => {
									const currentSelection = orderTargets.find(
										(t) => t.id === target.id
									);
									const isSelected = !!currentSelection;
									return (
										<View key={target.id} style={styles.pipEntryContainer}>
											<TouchableOpacity
												style={styles.pipCheckboxItem}
												onPress={() => toggleIndividualTargetSelection(target)}
											>
												<MaterialCommunityIcons
													name={
														isSelected
															? "checkbox-marked-circle"
															: "checkbox-blank-circle-outline"
													}
													size={24}
													color={colors.primary}
												/>
												<Text style={styles.pipNameText}>{target.name}</Text>
											</TouchableOpacity>
											{isSelected && (
												<TouchableOpacity
													onPress={() => openInstructionModalForTarget(target)}
													style={styles.editInstructionsButton}
												>
													<Ionicons
														name="pencil-outline"
														size={20}
														color={colors.primary}
													/>
													<Text style={styles.editInstructionsText}>
														{currentSelection.specialInstructions
															? "Edit Notes"
															: "Add Notes"}
													</Text>
												</TouchableOpacity>
											)}
										</View>
									);
								})}
								{individualOrderForOptions.length === 0 && (
									<Text style={styles.noPipsText}>
										You can add items for yourself.
									</Text>
								)}
							</View>
						)}
						{/* Removed general special instructions input, now per-target */}
					</ScrollView>

					<View style={styles.modalActionButtonsContainer}>
						<Button
							onPress={onClose}
							mode="outlined"
							style={styles.modalActionButton}
							labelStyle={{ color: colors.textDark, fontSize: 16 }}
						>
							Cancel
						</Button>
						<Button
							onPress={handleConfirmPress}
							mode="contained"
							style={[
								styles.modalActionButton,
								{ backgroundColor: colors.primary },
							]}
							labelStyle={{ color: colors.textOnPrimaryBrand, fontSize: 16 }}
						>
							Add {quantity} to{" "}
							{orderingMode === "party" ? "Party Basket" : "My Basket"}
						</Button>
					</View>
				</View>
			</View>

			{editingTargetForInstructions && (
				<PipInstructionModal
					visible={isPipInstructionModalVisible}
					onClose={() => setIsPipInstructionModalVisible(false)}
					pipName={editingTargetForInstructions.name}
					initialInstructions={editingTargetForInstructions.currentInstructions}
					onSaveInstructions={handleSaveTargetInstructions}
				/>
			)}
		</Modal>
	);
};

const styles = StyleSheet.create({
	scrollContainer: {
		paddingBottom: 20, // Prevent content from getting too close to the bottom
	},
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
		marginRight: 10,
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

	modalOverlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.6)",
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 0,
		borderRadius: 12,
		width: "90%",
		maxHeight: "85%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	pipInstructionModalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 20,
		borderRadius: 10,
		width: "85%",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	scrollContainer: { paddingHorizontal: 20, paddingTop: 45, paddingBottom: 20 },
	closeButton: { position: "absolute", top: 10, right: 10, zIndex: 1 },
	itemDetailsContainer: { alignItems: "center", marginBottom: 15 },
	itemName: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginBottom: 6,
	},
	itemPrice: { fontSize: 18, fontWeight: "bold", color: colors.primary },
	divider: { marginVertical: 15, backgroundColor: colors.borderLight },
	sectionContainer: { marginBottom: 15 },
	sectionHeaderWithHelp: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	sectionTitle: {
		fontSize: 17,
		fontWeight: "600",
		color: colors.textDark,
		marginBottom: 10,
	},
	quantitySelector: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginVertical: 10,
	},
	quantityTextModal: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		minWidth: 40,
		textAlign: "center",
		marginHorizontal: 15,
	},
	specialInstructionsInput: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		minHeight: 80,
		textAlignVertical: "top",
		fontSize: 15,
		color: colors.textDark,
		marginTop: 5,
	},
	helpText: {
		fontSize: 13,
		color: colors.textMedium,
		fontStyle: "italic",
		textAlign: "center",
		marginBottom: 10,
		paddingHorizontal: 5,
	},
	managePipsButton: { alignSelf: "center", marginVertical: 8 },
	pipEntryContainer: { marginBottom: 5 },
	pipCheckboxItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
	},
	pipNameText: { fontSize: 16, color: colors.textMedium, marginLeft: 10 },
	editInstructionsButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 4,
		paddingLeft: 34,
		marginTop: -5,
	},
	editInstructionsText: {
		fontSize: 13,
		color: colors.primary,
		marginLeft: 5,
		textDecorationLine: "underline",
	},
	noPipsText: {
		fontSize: 14,
		textAlign: "center",
		color: colors.textLight,
		fontStyle: "italic",
		marginTop: 5,
	},
	modalActionButtonsContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		paddingVertical: 15,
		paddingHorizontal: 15,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
	},
	modalButton: { flex: 1, marginHorizontal: 8, borderRadius: 8 },
	modalButtonRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		width: "100%",
		marginTop: 20,
	},
});

export default SelectedItemModal;
