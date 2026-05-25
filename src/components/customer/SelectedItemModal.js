import React, { useState, useContext, useEffect, useMemo } from "react";
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
import { useTranslation } from "react-i18next";
import { Button, Divider, IconButton, TextInput } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthContext } from "../../context/authContext";
import {
	formatCurrencyFromDollars,
	normalizeMenuPriceToDollars,
} from "../../utils/currencyFormatter";

const PipInstructionModal = ({
	visible,
	onClose,
	pipName,
	initialInstructions = "",
	onSaveInstructions,
}) => {
	const { t } = useTranslation();
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
						{t("special_instructions_for_pip", {
							pipName: pipName,
							defaultValue: `Special instructions for ${pipName}`,
						})}
					</Text>
					<TextInput
						style={styles.specialInstructionsInput}
						placeholder={t("notes_for_pip_item_placeholder", {
							pipName: pipName,
							defaultValue: `Add notes for ${pipName}`,
						})}
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
							{t("cancel_button", "Cancel")}
						</Button>
						<Button
							onPress={handleSave}
							mode="contained"
							style={[styles.modalButton, { backgroundColor: colors.primary }]}
						>
							{t("save_instructions_button", "Save")}
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
	pips,
	onConfirm,
	orderingMode = "individual",
	isLoading = false,
	partyData,
}) => {
	const { t, i18n } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);

	const [quantity, setQuantity] = useState(1);
	const [partyModeTarget, setPartyModeTarget] = useState(null);
	const [orderTargets, setOrderTargets] = useState([]);

	const [isPipInstructionModalVisible, setIsPipInstructionModalVisible] =
		useState(false);
	const [editingTargetForInstructions, setEditingTargetForInstructions] =
		useState(null);

	const [selectedModifiers, setSelectedModifiers] = useState([]);

	const getLocalizedText = (value) => {
		if (!value) return "";
		if (typeof value === "string") return value;

		const language = (i18n.language || "en").toLowerCase();
		if (language.startsWith("es")) {
			return value.es || value.en || value.original || "";
		}
		return value.en || value.es || value.original || "";
	};

	const modifierGroups = useMemo(() => {
		if (!selectedItem || !Array.isArray(selectedItem.modifierGroups)) return [];
		return selectedItem.modifierGroups;
	}, [selectedItem]);

	const currentUserTarget = useMemo(() => {
		if (!currentUserData?.uid) return null;

		return {
			id: currentUserData.uid,
			userId: currentUserData.uid,
			name:
				currentUserData.fullName ||
				currentUserData.firstName ||
				t("myself", "Myself"),
			specialInstructions: "",
		};
	}, [
		currentUserData?.uid,
		currentUserData?.fullName,
		currentUserData?.firstName,
		t,
	]);

	const displayOptions = useMemo(() => {
		const normalizedPips = Array.isArray(pips)
			? pips
					.map((pip) => {
						const id = pip?.id || pip?.userId || pip?.localPipId;
						if (!id) return null;

						return {
							...pip,
							id,
							name: pip?.name || pip?.fullName || t("guest", "Guest"),
							specialInstructions: pip?.specialInstructions || "",
						};
					})
					.filter(Boolean)
			: [];

		if (normalizedPips.length > 0) return normalizedPips;
		return currentUserTarget ? [currentUserTarget] : [];
	}, [pips, currentUserTarget, t]);

	useEffect(() => {
		if (visible && selectedItem) {
			setQuantity(1);
			setSelectedModifiers([]);

			const initialTarget = displayOptions[0] || null;

			setPartyModeTarget(orderingMode === "party" ? initialTarget : null);
			setOrderTargets(initialTarget ? [initialTarget] : []);
		}
	}, [visible, selectedItem, orderingMode, displayOptions]);

	const openInstructionModalForTarget = (target) => {
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
					: t,
			),
		);

		if (
			partyModeTarget &&
			partyModeTarget.id === editingTargetForInstructions.id
		) {
			setPartyModeTarget((prev) =>
				prev ? { ...prev, specialInstructions: instructions } : prev,
			);
		}

		setEditingTargetForInstructions(null);
	};

	const toggleIndividualTargetSelection = (targetToToggle) => {
		const isCurrentlySelected = orderTargets.some(
			(t) => t.id === targetToToggle.id,
		);

		if (isCurrentlySelected) {
			setOrderTargets((prev) => prev.filter((t) => t.id !== targetToToggle.id));
		} else {
			const newTarget = { ...targetToToggle, specialInstructions: "" };
			setOrderTargets((prev) => [...prev, newTarget]);
			openInstructionModalForTarget(newTarget);
		}
	};

	const handlePartyModeTargetSelection = (targetOption) => {
		const newTarget = { ...targetOption, specialInstructions: "" };
		setPartyModeTarget(newTarget);
		setOrderTargets([newTarget]);
	};

	const getSelectionsForGroup = (groupId) =>
		selectedModifiers.filter((modifier) => modifier.groupId === groupId);

	const isOptionSelected = (groupId, optionId) =>
		selectedModifiers.some(
			(modifier) =>
				modifier.groupId === groupId && modifier.optionId === optionId,
		);

	const toggleModifierOption = (group, option) => {
		const currentSelections = getSelectionsForGroup(group.id);
		const maxSelect =
			group.maxSelect !== undefined && group.maxSelect !== null
				? Number(group.maxSelect)
				: 1;

		const isSelected = isOptionSelected(group.id, option.id);

		if (isSelected) {
			setSelectedModifiers((prev) =>
				prev.filter(
					(modifier) =>
						!(modifier.groupId === group.id && modifier.optionId === option.id),
				),
			);
			return;
		}

		const newModifier = {
			groupId: group.id,
			groupName: getLocalizedText(group.name) || group.name || "",
			optionId: option.id,
			name: getLocalizedText(option.name) || option.name || "",
			price:
				option.price !== undefined && option.price !== null
					? Number(option.price)
					: 0,
			category: option.category || "Extras",
		};

		if (maxSelect <= 1) {
			setSelectedModifiers((prev) => [
				...prev.filter((modifier) => modifier.groupId !== group.id),
				newModifier,
			]);
			return;
		}

		if (currentSelections.length >= maxSelect) {
			Alert.alert(
				t("modifier_limit_reached_title", "Selection limit reached"),
				t("modifier_limit_reached_message", {
					groupName: getLocalizedText(group.name) || group.name || "",
					maxSelect: maxSelect,
					defaultValue: `You can only choose ${maxSelect} option(s) for ${getLocalizedText(group.name) || group.name || "this group"}.`,
				}),
			);
			return;
		}

		setSelectedModifiers((prev) => [...prev, newModifier]);
	};

	const validateModifierGroups = () => {
		for (let i = 0; i < modifierGroups.length; i += 1) {
			const group = modifierGroups[i];
			const required = !!group.required;
			const minSelect =
				group.minSelect !== undefined && group.minSelect !== null
					? Number(group.minSelect)
					: required
						? 1
						: 0;

			const selections = getSelectionsForGroup(group.id);

			if (required && selections.length < minSelect) {
				Alert.alert(
					t("required_selection_title", "Required selection"),
					t("required_selection_message", {
						groupName: getLocalizedText(group.name) || group.name || "",
						minSelect: minSelect,
						defaultValue: `Please choose at least ${minSelect} option(s) for ${getLocalizedText(group.name) || group.name || "this group"}.`,
					}),
				);
				return false;
			}
		}

		return true;
	};

	const modifiersTotal = useMemo(() => {
		return selectedModifiers.reduce(
			(sum, modifier) => sum + Number(modifier.price || 0),
			0,
		);
	}, [selectedModifiers]);

	const basePrice = normalizeMenuPriceToDollars(
		selectedItem && selectedItem.price ? selectedItem.price : 0,
	);
	const unitPriceWithModifiers = basePrice + modifiersTotal;
	const finalPrice = unitPriceWithModifiers * quantity;

	const handleConfirmPress = () => {
		if (!selectedItem) {
			console.error("handleConfirmPress: Aborted, selectedItem is missing.");
			return;
		}

		if (orderTargets.length === 0) {
			Alert.alert(
				t("order_for_whom_title", "Who is this for?"),
				t(
					"select_at_least_one_person_message",
					"Please select at least one person.",
				),
			);
			return;
		}

		if (!validateModifierGroups()) {
			return;
		}

		const dataToConfirm = {
			menuItemDetails: {
				...selectedItem,
				selectedModifiers,
				modifiersTotal,
				basePrice,
				finalUnitPrice: unitPriceWithModifiers,
			},
			quantity,
		};

		if (orderingMode === "individual") {
			dataToConfirm.individualPips = orderTargets;
		} else if (orderingMode === "party") {
			if (!partyData || !partyData.partyId) {
				Alert.alert(
					t("error_title", "Error"),
					t(
						"party_info_missing_cannot_add_item_message",
						"Party info is missing. Cannot add this item.",
					),
				);
				return;
			}

			const partyTarget = orderTargets[0] || {};
			dataToConfirm.partyContextData = {
				partyId: partyData.partyId,
				currentUserId: partyData.currentUserId,
				orderingForPipName: partyTarget.name,
			};
			dataToConfirm.specialInstructions = partyTarget.specialInstructions;
		}

		onConfirm(dataToConfirm);
	};

	const renderModifierGroup = (group) => {
		const groupTitle = getLocalizedText(group.name) || group.name || "";
		const groupDescription =
			getLocalizedText(group.description) || group.description || "";

		const maxSelect =
			group.maxSelect !== undefined && group.maxSelect !== null
				? Number(group.maxSelect)
				: 1;

		const currentSelections = getSelectionsForGroup(group.id);

		return (
			<View key={group.id} style={styles.sectionContainer}>
				<Text style={styles.sectionTitle}>{groupTitle}</Text>

				{!!groupDescription && (
					<Text style={styles.groupDescription}>{groupDescription}</Text>
				)}

				<Text style={styles.groupMetaText}>
					{group.required
						? t("required_modifier_group", {
								defaultValue: "Required",
							})
						: t("optional_modifier_group", {
								defaultValue: "Optional",
							})}
					{" • "}
					{maxSelect <= 1
						? t("choose_one_modifier", {
								defaultValue: "Choose 1",
							})
						: t("choose_up_to_modifier", {
								max: maxSelect,
								defaultValue: `Choose up to ${maxSelect}`,
							})}
				</Text>

				{Array.isArray(group.options) &&
					group.options
						.filter((option) => option.isAvailable !== false)
						.map((option) => {
							const selected = isOptionSelected(group.id, option.id);
							const optionName =
								getLocalizedText(option.name) || option.name || "";
							const optionPrice =
								option.price !== undefined && option.price !== null
									? Number(option.price)
									: 0;

							return (
								<TouchableOpacity
									key={option.id}
									style={[
										styles.modifierOptionRow,
										selected && styles.modifierOptionRowSelected,
									]}
									onPress={() => toggleModifierOption(group, option)}
									activeOpacity={0.85}
								>
									<View style={styles.modifierOptionLeft}>
										<MaterialCommunityIcons
											name={
												maxSelect <= 1
													? selected
														? "radiobox-marked"
														: "radiobox-blank"
													: selected
														? "checkbox-marked-circle"
														: "checkbox-blank-circle-outline"
											}
											size={22}
											color={colors.primary}
										/>
										<View style={styles.modifierOptionTextWrap}>
											<Text style={styles.modifierOptionName}>
												{optionName}
											</Text>
											{!!option.category && (
												<Text style={styles.modifierOptionCategory}>
													{option.category}
												</Text>
											)}
										</View>
									</View>

									<Text style={styles.modifierOptionPrice}>
										{optionPrice > 0
										? `+${formatCurrencyFromDollars(optionPrice)}`
											: t("included_label", "Included")}
									</Text>
								</TouchableOpacity>
							);
						})}

				{currentSelections.length > 0 && (
					<View style={styles.groupSelectionSummary}>
						<Text style={styles.groupSelectionSummaryText}>
							{t("selected_count_label", {
								count: currentSelections.length,
								defaultValue:
									currentSelections.length === 1
										? "1 selected"
										: `${currentSelections.length} selected`,
							})}
						</Text>
					</View>
				)}

				<Divider style={styles.divider} />
			</View>
		);
	};

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
							<Text style={styles.itemName}>
								{getLocalizedText(selectedItem && selectedItem.name)}
							</Text>

							{!!(
								selectedItem &&
								(getLocalizedText(selectedItem.description) ||
									selectedItem.description)
							) && (
								<Text style={styles.itemDescription}>
									{getLocalizedText(selectedItem.description) ||
										selectedItem.description}
								</Text>
							)}

							<Text style={styles.itemPrice}>
								{formatCurrencyFromDollars(unitPriceWithModifiers)}
							</Text>

							{modifiersTotal > 0 && (
								<Text style={styles.modifiersTotalText}>
									{t("includes_modifiers_total", {
										total: formatCurrencyFromDollars(modifiersTotal),
										defaultValue: `Includes ${formatCurrencyFromDollars(modifiersTotal)} in selected add-ons`,
									})}
								</Text>
							)}
						</View>

						<Divider style={styles.divider} />

						<View style={styles.sectionContainer}>
							<Text style={styles.sectionTitle}>
								{t("quantity_title", "Quantity")}
							</Text>
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

							<View style={styles.totalPreviewBox}>
								<Text style={styles.totalPreviewLabel}>
									{t("item_total_label", "Item Total")}
								</Text>
								<Text style={styles.totalPreviewValue}>
									{formatCurrencyFromDollars(finalPrice)}
								</Text>
							</View>
						</View>

						<Divider style={styles.divider} />

						{modifierGroups.length > 0 && (
							<View style={styles.sectionContainer}>
								<Text style={styles.sectionTitle}>
									{t("customize_item_title", "Customize Item")}
								</Text>
								<Text style={styles.helpText}>
									{t(
										"customize_item_help_text",
										"Choose your options below. Required groups must be completed before adding to basket.",
									)}
								</Text>
							</View>
						)}

						{modifierGroups.map(renderModifierGroup)}

						{orderingMode === "party" && (
							<View style={styles.sectionContainer}>
								<Text style={styles.sectionTitle}>
									{t("order_item_for_party_title", "Order this item for")}
								</Text>

								{displayOptions.map((option) => {
									const uniqueKey = option.id;
									const isSelected = orderTargets[0]?.id === uniqueKey;
									const targetObject = {
										id: uniqueKey,
										name: option.name,
									};

									return (
										<View key={uniqueKey} style={styles.pipEntryContainer}>
											<TouchableOpacity
												style={styles.pipCheckboxItem}
												onPress={() =>
													handlePartyModeTargetSelection(targetObject)
												}
											>
												<MaterialCommunityIcons
													name={
														isSelected ? "radiobox-marked" : "radiobox-blank"
													}
													size={24}
													color={colors.primary}
												/>
												<Text style={styles.pipNameText}>{option.name}</Text>
											</TouchableOpacity>

											{isSelected && (
												<TouchableOpacity
													onPress={() =>
														openInstructionModalForTarget(orderTargets[0])
													}
													style={styles.editInstructionsButton}
												>
													<Ionicons
														name="pencil-outline"
														size={20}
														color={colors.primary}
													/>
													<Text style={styles.editInstructionsText}>
														{orderTargets[0].specialInstructions
															? t("edit_notes_button", "Edit notes")
															: t("add_notes_button", "Add notes")}
													</Text>
												</TouchableOpacity>
											)}
										</View>
									);
								})}

								{orderTargets.length > 0 && orderTargets[0] && (
									<TextInput
										style={styles.specialInstructionsInput}
										placeholder={t("special_instructions_for_pip_placeholder", {
											pipName: orderTargets[0].name,
											defaultValue: `Special instructions for ${orderTargets[0].name}`,
										})}
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
										{t(
											"order_for_select_all_that_apply_title",
											"Who is this for?",
										)}
									</Text>
								</View>

								<Text style={styles.managePipsHintText}>
									{t(
										"not_eating_alone_hint",
										"Select one or more people for this item.",
									)}
								</Text>

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
									{t("manage_pips_button", "Manage PIPs")}
								</Button>

								{displayOptions.map((target) => {
									const currentSelection = orderTargets.find(
										(t) => t.id === target.id,
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
															? t("edit_notes_button", "Edit notes")
															: t("add_notes_button", "Add notes")}
													</Text>
												</TouchableOpacity>
											)}
										</View>
									);
								})}

								{displayOptions.length === 0 && (
									<Text style={styles.noPipsText}>
										{t(
											"no_pips_message",
											"No PIPs available yet. Add one from your account screen.",
										)}
									</Text>
								)}
							</View>
						)}
					</ScrollView>

					<View style={styles.modalActionButtonsContainer}>
						<Button
							onPress={onClose}
							mode="outlined"
							style={styles.modalActionButton}
							labelStyle={{ color: colors.textDark, fontSize: 16 }}
						>
							{t("cancel_button", "Cancel")}
						</Button>

						<Button
							onPress={handleConfirmPress}
							mode="contained"
							style={[
								styles.modalActionButton,
								{ backgroundColor: colors.primary },
							]}
							labelStyle={{ color: colors.textOnPrimaryBrand, fontSize: 16 }}
							disabled={isLoading}
							loading={isLoading}
						>
							{t("add_to_basket_button", {
								quantity: quantity,
								basketType:
									orderingMode === "party"
										? t("party_basket", "party basket")
										: t("my_basket", "my basket"),
								defaultValue:
									orderingMode === "party"
										? `Add ${quantity} to party basket`
										: `Add ${quantity} to my basket`,
							})}
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
	scrollContainer: {
		paddingHorizontal: 20,
		paddingTop: 45,
		paddingBottom: 20,
	},
	closeButton: {
		position: "absolute",
		top: 10,
		right: 10,
		zIndex: 1,
	},
	itemDetailsContainer: {
		alignItems: "center",
		marginBottom: 15,
	},
	itemName: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginBottom: 6,
	},
	itemDescription: {
		fontSize: 14,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 8,
	},
	itemPrice: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary,
	},
	modifiersTotalText: {
		marginTop: 6,
		fontSize: 13,
		color: colors.textMedium,
		textAlign: "center",
	},
	divider: {
		marginVertical: 15,
		backgroundColor: colors.borderLight,
	},
	sectionContainer: {
		marginBottom: 15,
	},
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
	groupDescription: {
		fontSize: 13,
		color: colors.textMedium,
		marginBottom: 6,
	},
	groupMetaText: {
		fontSize: 12,
		color: colors.textMedium,
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
	totalPreviewBox: {
		marginTop: 10,
		padding: 12,
		borderRadius: 10,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	totalPreviewLabel: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textDark,
	},
	totalPreviewValue: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary,
	},
	helpText: {
		fontSize: 13,
		color: colors.textMedium,
		fontStyle: "italic",
		textAlign: "left",
		marginBottom: 10,
	},
	managePipsButton: {
		alignSelf: "center",
		marginVertical: 8,
	},
	managePipsHintText: {
		fontSize: 12,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 10,
	},
	pipEntryContainer: {
		marginBottom: 5,
	},
	pipCheckboxItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
	},
	pipNameText: {
		fontSize: 16,
		color: colors.textDark,
		marginLeft: 10,
	},
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
		color: colors.textMedium,
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
	modalActionButton: {
		flex: 1,
		marginHorizontal: 8,
		borderRadius: 8,
	},
	modalButton: {
		flex: 1,
		marginHorizontal: 8,
		borderRadius: 8,
	},
	modalButtonRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		width: "100%",
		marginTop: 20,
	},
	pipInstructionModalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 20,
		borderRadius: 10,
		width: "90%",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center",
		color: colors.textDark,
	},
	specialInstructionsInput: {
		width: "100%",
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
		color: colors.textDark,
		marginTop: 5,
		height: 100,
		textAlignVertical: "top",
	},
	modifierOptionRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderRadius: 10,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginBottom: 8,
	},
	modifierOptionRowSelected: {
		borderColor: colors.primary,
		backgroundColor: colors.primary + "10",
	},
	modifierOptionLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		marginRight: 10,
	},
	modifierOptionTextWrap: {
		marginLeft: 10,
		flex: 1,
	},
	modifierOptionName: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textDark,
	},
	modifierOptionCategory: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	modifierOptionPrice: {
		fontSize: 14,
		fontWeight: "700",
		color: colors.primary,
	},
	groupSelectionSummary: {
		marginTop: 2,
		marginBottom: 4,
	},
	groupSelectionSummaryText: {
		fontSize: 12,
		color: colors.textMedium,
	},
});

export default SelectedItemModal;
