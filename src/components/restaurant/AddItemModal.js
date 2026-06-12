// components/restaurant/AddItemModal.js
import React, { useState, useContext, useEffect, useMemo } from "react";
import {
	Modal,
	View,
	Text,
	StyleSheet,
	TextInput,
	TouchableOpacity,
	Switch,
	Alert,
	ScrollView,
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Image,
	ActionSheetIOS,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Picker } from "@react-native-picker/picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import {
	pickImage,
	uploadImageAndGetDownloadURL,
} from "../../utils/firebaseUtils";

const createId = (prefix) =>
	`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createEmptyModifierOption = () => ({
	id: createId("opt"),
	name: "",
	price: "",
	category: "Extras",
	isDefault: false,
	isAvailable: true,
});

const createEmptyModifierGroup = () => ({
	id: createId("grp"),
	name: "",
	description: "",
	required: false,
	minSelect: "0",
	maxSelect: "1",
	options: [createEmptyModifierOption()],
});

const parseMoney = (value) => {
	const parsed = parseFloat(String(value || "").trim());
	return isNaN(parsed) ? 0 : parsed;
};

const normalizeNonNegativeInt = (value, fallback) => {
	const parsed = parseInt(String(value ?? ""), 10);
	if (isNaN(parsed) || parsed < 0) return fallback;
	return parsed;
};

const AddItemModal = ({ isVisible, onClose, itemToEdit }) => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const insets = useSafeAreaInsets();

	const MENU_CATEGORIES = useMemo(
		() => [
			{
				label: t("daily_special_category", "Daily Special"),
				value: "Daily Special",
			},
			{ label: t("breakfast_category", "Breakfast"), value: "Breakfast" },
			{ label: t("brunch_category", "Brunch"), value: "Brunch" },
			{ label: t("starters_category", "Starters"), value: "Starters" },
			{ label: t("appetizers_category", "Appetizers"), value: "Appetizers" },
			{ label: t("soups_category", "Soups"), value: "Soups" },
			{ label: t("salads_category", "Salads"), value: "Salads" },
			{ label: t("sides_category", "Sides"), value: "Sides" },
			{ label: t("entrees_category", "Entrees"), value: "Entrees" },
			{ label: t("pasta_category", "Pasta"), value: "Pasta" },
			{ label: t("seafood_category", "Seafood"), value: "Seafood" },
			{ label: t("grill_category", "Grill"), value: "Grill" },
			{ label: t("burgers_category", "Burgers"), value: "Burgers" },
			{
				label: t("sandwiches_category", "Sandwiches"),
				value: "Sandwiches",
			},
			{ label: t("pizza_category", "Pizza"), value: "Pizza" },
			{ label: t("tacos_category", "Tacos"), value: "Tacos" },
			{ label: t("kids_menu_category", "Kids Menu"), value: "Kids Menu" },
			{ label: t("desserts_category", "Desserts"), value: "Desserts" },
			{ label: t("combos_category", "Combos"), value: "Combos" },
			{ label: t("extras_category", "Extras"), value: "Extras" },
			{ label: t("sauces_category", "Sauces"), value: "Sauces" },
			{ label: t("drinks_category", "Drinks"), value: "Drinks" },
			{
				label: t("non_alcoholic_drinks_category", "Non-Alcoholic Drinks"),
				value: "Non-Alcoholic Drinks",
			},
			{ label: t("sodas_category", "Sodas"), value: "Sodas" },
			{ label: t("juices_category", "Juices"), value: "Juices" },
			{ label: t("coffee_category", "Coffee"), value: "Coffee" },
			{ label: t("tea_category", "Tea"), value: "Tea" },
			{ label: t("beer_category", "Beer"), value: "Beer" },
			{ label: t("wine_category", "Wine"), value: "Wine" },
			{ label: t("cocktails_category", "Cocktails"), value: "Cocktails" },
			{ label: t("spirits_category", "Spirits"), value: "Spirits" },
		],
		[t],
	);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [price, setPrice] = useState("");
	const [category, setCategory] = useState("");
	const [isDailySpecial, setIsDailySpecial] = useState(false);
	const [imageUri, setImageUri] = useState(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [modifierGroups, setModifierGroups] = useState([]);

	const isEditMode = itemToEdit !== null;

	useEffect(() => {
		if (!isVisible) return;

		if (isEditMode) {
			setName(itemToEdit.name || "");
			setDescription(itemToEdit.description || "");
			setPrice(
				itemToEdit.price !== undefined && itemToEdit.price !== null
					? String(itemToEdit.price)
					: "",
			);
			setCategory(itemToEdit.category || "");
			setIsDailySpecial(itemToEdit.isDailySpecial || false);
			setImageUri(itemToEdit.imageUri || null);

			const loadedGroups = Array.isArray(itemToEdit.modifierGroups)
				? itemToEdit.modifierGroups.map((group) => ({
						id: group.id || createId("grp"),
						name: group.name || "",
						description: group.description || "",
						required: !!group.required,
						minSelect:
							group.minSelect !== undefined && group.minSelect !== null
								? String(group.minSelect)
								: "0",
						maxSelect:
							group.maxSelect !== undefined && group.maxSelect !== null
								? String(group.maxSelect)
								: "1",
						options:
							Array.isArray(group.options) && group.options.length > 0
								? group.options.map((option) => ({
										id: option.id || createId("opt"),
										name: option.name || "",
										price:
											option.price !== undefined && option.price !== null
												? String(option.price)
												: "",
										category: option.category || "Extras",
										isDefault: !!option.isDefault,
										isAvailable: option.isAvailable !== false,
									}))
								: [createEmptyModifierOption()],
					}))
				: [];

			setModifierGroups(loadedGroups);
		} else {
			setName("");
			setDescription("");
			setPrice("");
			setCategory("");
			setIsDailySpecial(false);
			setImageUri(null);
			setModifierGroups([]);
		}
	}, [isVisible, isEditMode, itemToEdit]);

	const groupedCategoryLabels = useMemo(
		() => MENU_CATEGORIES.map((item) => item.value),
		[MENU_CATEGORIES],
	);

	const openIOSCategorySheet = ({
		title,
		options,
		currentValue,
		onSelect,
		includePlaceholder = false,
	}) => {
		if (Platform.OS !== "ios") return;

		const values = includePlaceholder ? ["", ...options] : options;
		const labels = values.map((value) => {
			if (!value) return t("select_category_placeholder", "Select category");
			return MENU_CATEGORIES.find((item) => item.value === value)?.label || value;
		});
		const cancelButtonIndex = labels.length;

		ActionSheetIOS.showActionSheetWithOptions(
			{
				title,
				options: [...labels, t("cancel_button", "Cancel")],
				cancelButtonIndex,
				userInterfaceStyle: "light",
			},
			(buttonIndex) => {
				if (buttonIndex === cancelButtonIndex) return;
				const selectedValue = values[buttonIndex];
				if (selectedValue !== currentValue) {
					onSelect(selectedValue);
				}
			},
		);
	};

	const handleImageSelection = async () => {
		setIsUploading(true);
		try {
			const result = await pickImage();

			if (result.success) {
				const uniqueId = `${Date.now()}-${Math.random()
					.toString(36)
					.substring(2, 8)}`;
				const path = `menuItemImages/${currentUserData.uid}/${uniqueId}.jpg`;
				const downloadURL = await uploadImageAndGetDownloadURL(
					result.uri,
					path,
				);
				setImageUri(downloadURL);
			}
		} catch (error) {
			console.log("Image selection/upload process failed in modal.");
		} finally {
			setIsUploading(false);
		}
	};

	const updateModifierGroup = (groupId, updater) => {
		setModifierGroups((prev) =>
			prev.map((group) =>
				group.id === groupId
					? typeof updater === "function"
						? updater(group)
						: { ...group, ...updater }
					: group,
			),
		);
	};

	const addModifierGroup = () => {
		setModifierGroups((prev) => [...prev, createEmptyModifierGroup()]);
	};

	const removeModifierGroup = (groupId) => {
		setModifierGroups((prev) => prev.filter((group) => group.id !== groupId));
	};

	const addModifierOption = (groupId) => {
		updateModifierGroup(groupId, (group) => ({
			...group,
			options: [...group.options, createEmptyModifierOption()],
		}));
	};

	const updateModifierOption = (groupId, optionId, patch) => {
		updateModifierGroup(groupId, (group) => ({
			...group,
			options: group.options.map((option) =>
				option.id === optionId ? { ...option, ...patch } : option,
			),
		}));
	};

	const removeModifierOption = (groupId, optionId) => {
		updateModifierGroup(groupId, (group) => {
			const nextOptions = group.options.filter(
				(option) => option.id !== optionId,
			);

			return {
				...group,
				options:
					nextOptions.length > 0 ? nextOptions : [createEmptyModifierOption()],
			};
		});
	};

	const validateForm = () => {
		if (!name.trim() || !price.trim() || !category) {
			Alert.alert(
				t("missing_information_title", "Missing information"),
				t(
					"fill_out_item_details_message",
					"Please fill out the item name, price, and category.",
				),
			);
			return false;
		}

		if (isNaN(parseFloat(price))) {
			Alert.alert(
				t("invalid_price_title", "Invalid price"),
				t("enter_valid_price_message", "Please enter a valid numeric price."),
			);
			return false;
		}

		for (let i = 0; i < modifierGroups.length; i += 1) {
			const group = modifierGroups[i];

			if (!group.name.trim()) {
				Alert.alert(
					t("modifier_group_missing_name", "Modifier group missing name"),
					t("modifier_group_needs_name_message", {
						defaultValue: `Modifier group ${i + 1} needs a name.`,
						index: i + 1,
					}),
				);
				return false;
			}

			const minSelect = normalizeNonNegativeInt(group.minSelect, 0);
			const maxSelect = normalizeNonNegativeInt(group.maxSelect, 1);

			if (maxSelect < minSelect) {
				Alert.alert(
					t("invalid_modifier_limits", "Invalid modifier limits"),
					t("modifier_group_invalid_limits_message", {
						defaultValue:
							'"{{groupName}}" has max selections lower than min selections.',
						groupName: group.name,
					}),
				);
				return false;
			}

			if (!Array.isArray(group.options) || group.options.length === 0) {
				Alert.alert(
					t("modifier_group_needs_option", "Modifier group needs options"),
					t("modifier_group_needs_option_message", {
						defaultValue: '"{{groupName}}" must have at least one option.',
						groupName: group.name,
					}),
				);
				return false;
			}

			for (let j = 0; j < group.options.length; j += 1) {
				const option = group.options[j];

				if (!option.name.trim()) {
					Alert.alert(
						t("modifier_option_missing_name", "Modifier option missing name"),
						t("modifier_option_needs_name_message", {
							defaultValue: 'An option in "{{groupName}}" needs a name.',
							groupName: group.name,
						}),
					);
					return false;
				}

				if (option.price !== "" && isNaN(parseFloat(option.price))) {
					Alert.alert(
						t("invalid_modifier_option_price", "Invalid option price"),
						t("modifier_option_invalid_price_message", {
							defaultValue:
								'"{{optionName}}" in "{{groupName}}" has an invalid price.',
							optionName: option.name,
							groupName: group.name,
						}),
					);
					return false;
				}

				if (!option.category) {
					Alert.alert(
						t("modifier_option_missing_category", "Option missing category"),
						t("modifier_option_needs_category_message", {
							defaultValue:
								'"{{optionName}}" in "{{groupName}}" needs a category.',
							optionName: option.name,
							groupName: group.name,
						}),
					);
					return false;
				}
			}
		}

		return true;
	};

	const buildCleanModifierGroups = () =>
		modifierGroups.map((group) => {
			const minSelect = normalizeNonNegativeInt(group.minSelect, 0);
			const maxSelect = normalizeNonNegativeInt(group.maxSelect, 1);

			return {
				id: group.id,
				name: group.name.trim(),
				description: group.description.trim(),
				required: !!group.required,
				minSelect,
				maxSelect,
				options: group.options.map((option) => ({
					id: option.id,
					name: option.name.trim(),
					price: parseMoney(option.price),
					category: option.category,
					isDefault: !!option.isDefault,
					isAvailable: option.isAvailable !== false,
				})),
			};
		});

	const handleSubmit = async () => {
		if (!validateForm()) return;

		setIsSubmitting(true);
		const restaurantId = currentUserData.uid;

		const menuItemData = {
			restaurantId,
			name: name.trim(),
			description: description.trim(),
			price: parseFloat(price),
			category,
			isDailySpecial,
			imageUri: imageUri,
			modifierGroups: buildCleanModifierGroups(),
			hasModifiers: modifierGroups.length > 0,
			updatedAt: new Date(),
		};

		if (!isEditMode) {
			menuItemData.createdAt = new Date();
		}

		try {
			if (isEditMode) {
				await db
					.collection("menuItems")
					.doc(itemToEdit.id)
					.update(menuItemData);
				Alert.alert(
					t("success_title", "Success"),
					t("menu_item_updated_message", "Menu item updated."),
				);
			} else {
				await db.collection("menuItems").add(menuItemData);
				Alert.alert(
					t("success_title", "Success"),
					t("new_menu_item_added_message", "New menu item added."),
				);
			}
			onClose();
		} catch (error) {
			console.error("Error saving menu item:", error);
			Alert.alert(
				t("error_title", "Error"),
				t("could_not_save_menu_item_message", "Could not save menu item."),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Modal
			visible={isVisible}
			animationType="slide"
			transparent={false}
			onRequestClose={onClose}
		>
			<KeyboardAvoidingView
				style={{ flex: 1 }}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				<View
					style={[
						styles.modalView,
						{ paddingTop: insets.top, paddingBottom: insets.bottom },
					]}
				>
					<ScrollView showsVerticalScrollIndicator={false}>
						<View style={styles.header}>
							<Text style={styles.modalTitle}>
								{isEditMode
									? t("edit_item_title", "Edit Item")
									: t("add_new_item_title", "Add New Item")}
							</Text>
							<TouchableOpacity onPress={onClose} style={styles.closeButton}>
								<Text style={styles.closeButtonText}>
									{t("cancel_button", "Cancel")}
								</Text>
							</TouchableOpacity>
						</View>

						<Text style={styles.label}>
							{t("item_image_label", "Item Image")}
						</Text>
						<View style={styles.imagePickerContainer}>
							{imageUri ? (
								<Image source={{ uri: imageUri }} style={styles.imagePreview} />
							) : (
								<View style={styles.imagePlaceholder}>
									<Ionicons name="camera" size={40} color={colors.textLight} />
								</View>
							)}
							<TouchableOpacity
								style={[
									styles.uploadButton,
									isUploading && styles.uploadButtonDisabled,
								]}
								onPress={handleImageSelection}
								disabled={isUploading}
							>
								{isUploading ? (
									<ActivityIndicator color={colors.primary} />
								) : (
									<Text style={styles.uploadButtonText}>
										{imageUri
											? t("change_image_button", "Change Image")
											: t("upload_image_button", "Upload Image")}
									</Text>
								)}
							</TouchableOpacity>
						</View>

						<Text style={styles.label}>
							{t("item_name_label", "Item Name")}
						</Text>
						<TextInput
							value={name}
							onChangeText={setName}
							placeholder={t("classic_burger_placeholder", "Classic Burger")}
							style={styles.input}
							placeholderTextColor={colors.textLight}
						/>

						<Text style={styles.label}>
							{t("description_label", "Description")}
						</Text>
						<TextInput
							value={description}
							onChangeText={setDescription}
							placeholder={t(
								"description_placeholder",
								"Describe the dish, ingredients, and special notes.",
							)}
							style={[styles.input, styles.descriptionInput]}
							multiline
							placeholderTextColor={colors.textLight}
						/>

						<Text style={styles.label}>{t("price_label", "Price")}</Text>
						<TextInput
							value={price}
							onChangeText={setPrice}
							placeholder={t("price_placeholder", "0.00")}
							style={styles.input}
							keyboardType="numeric"
							placeholderTextColor={colors.textLight}
						/>

						<Text style={styles.label}>{t("category_label", "Category")}</Text>
						{Platform.OS === "ios" ? (
							<TouchableOpacity
								style={styles.selectButton}
								onPress={() =>
									openIOSCategorySheet({
										title: t("category_label", "Category"),
										options: groupedCategoryLabels,
										currentValue: category,
										onSelect: setCategory,
										includePlaceholder: true,
									})
								}
							>
								<Text
									style={[
										styles.selectButtonText,
										!category && styles.selectButtonPlaceholder,
									]}
								>
									{category
										? MENU_CATEGORIES.find((item) => item.value === category)
												?.label || category
										: t("select_category_placeholder", "Select category")}
								</Text>
								<Ionicons
									name="chevron-down"
									size={18}
									color={colors.textMedium}
								/>
							</TouchableOpacity>
						) : (
							<View style={styles.pickerContainer}>
								<Picker
									selectedValue={category}
									onValueChange={(itemValue) => setCategory(itemValue)}
									style={styles.picker}
								>
									<Picker.Item
										label={t("select_category_placeholder", "Select category")}
										value=""
									/>
									{MENU_CATEGORIES.map((categoryItem) => (
										<Picker.Item
											key={categoryItem.value}
											label={categoryItem.label}
											value={categoryItem.value}
										/>
									))}
								</Picker>
							</View>
						)}

						<View style={styles.switchContainer}>
							<Text style={styles.labelInline}>
								{t("daily_special_label", "Daily Special")}
							</Text>
							<Switch
								value={isDailySpecial}
								onValueChange={setIsDailySpecial}
								trackColor={{ false: "#767577", true: colors.primary }}
								thumbColor="#f4f3f4"
							/>
						</View>

						<View style={styles.sectionBlock}>
							<View style={styles.sectionHeaderRow}>
								<View style={styles.sectionHeaderTextWrap}>
									<Text style={styles.sectionTitle}>
										{t("modifiers_title", "Modifiers / Extras / Combos")}
									</Text>
									<Text style={styles.sectionSubtitle}>
										{t(
											"modifiers_subtitle",
											"Add groups like sauces, sides, or drinks under this item.",
										)}
									</Text>
								</View>

								<TouchableOpacity
									style={styles.secondaryActionButton}
									onPress={addModifierGroup}
								>
									<Ionicons
										name="add-circle-outline"
										size={18}
										color={colors.primary}
									/>
									<Text style={styles.secondaryActionButtonText}>
										{t("add_group_button", "Add Group")}
									</Text>
								</TouchableOpacity>
							</View>

							{modifierGroups.length === 0 ? (
								<View style={styles.emptyModifierState}>
									<Text style={styles.emptyModifierText}>
										{t(
											"no_modifier_groups_yet",
											"No modifier groups yet. Add one for combos, sauces, drinks, or sides.",
										)}
									</Text>
								</View>
							) : (
								modifierGroups.map((group, groupIndex) => (
									<View key={group.id} style={styles.groupCard}>
										<View style={styles.groupCardHeader}>
											<Text style={styles.groupCardTitle}>
												{t("modifier_group_label", {
													defaultValue: "Modifier Group {{index}}",
													index: groupIndex + 1,
												})}
											</Text>
											<TouchableOpacity
												onPress={() => removeModifierGroup(group.id)}
												style={styles.removeButton}
											>
												<Ionicons
													name="trash-outline"
													size={18}
													color={colors.statusDanger}
												/>
											</TouchableOpacity>
										</View>

										<Text style={styles.label}>
											{t("group_name_label", "Group Name")}
										</Text>
										<TextInput
											value={group.name}
											onChangeText={(value) =>
												updateModifierGroup(group.id, { name: value })
											}
											placeholder={t("group_name_placeholder", "Choose a side")}
											style={styles.input}
											placeholderTextColor={colors.textLight}
										/>

										<Text style={styles.label}>
											{t("group_description_label", "Group Description")}
										</Text>
										<TextInput
											value={group.description}
											onChangeText={(value) =>
												updateModifierGroup(group.id, { description: value })
											}
											placeholder={t(
												"group_description_placeholder",
												"Optional note shown to the customer",
											)}
											style={styles.input}
											placeholderTextColor={colors.textLight}
										/>

										<View style={styles.switchContainer}>
											<Text style={styles.labelInline}>
												{t("required_label", "Required")}
											</Text>
											<Switch
												value={!!group.required}
												onValueChange={(value) =>
													updateModifierGroup(group.id, { required: value })
												}
												trackColor={{
													false: "#767577",
													true: colors.primary,
												}}
												thumbColor="#f4f3f4"
											/>
										</View>

										<View style={styles.inlineRow}>
											<View style={styles.inlineCol}>
												<Text style={styles.label}>
													{t("min_select_label", "Min Select")}
												</Text>
												<TextInput
													value={String(group.minSelect)}
													onChangeText={(value) =>
														updateModifierGroup(group.id, { minSelect: value })
													}
													keyboardType="numeric"
													style={styles.input}
													placeholder={t("min_select_placeholder", "0")}
													placeholderTextColor={colors.textLight}
												/>
											</View>

											<View style={styles.inlineCol}>
												<Text style={styles.label}>
													{t("max_select_label", "Max Select")}
												</Text>
												<TextInput
													value={String(group.maxSelect)}
													onChangeText={(value) =>
														updateModifierGroup(group.id, { maxSelect: value })
													}
													keyboardType="numeric"
													style={styles.input}
													placeholder={t("max_select_placeholder", "1")}
													placeholderTextColor={colors.textLight}
												/>
											</View>
										</View>

										<Text style={styles.optionsTitle}>
											{t("options_title", "Options")}
										</Text>

										{group.options.map((option, optionIndex) => (
											<View key={option.id} style={styles.optionCard}>
												<View style={styles.optionHeader}>
													<Text style={styles.optionTitle}>
														{t("option_label", {
															defaultValue: "Option {{index}}",
															index: optionIndex + 1,
														})}
													</Text>
													<TouchableOpacity
														onPress={() =>
															removeModifierOption(group.id, option.id)
														}
														style={styles.removeButton}
													>
														<Ionicons
															name="close-circle-outline"
															size={18}
															color={colors.statusDanger}
														/>
													</TouchableOpacity>
												</View>

												<Text style={styles.label}>
													{t("option_name_label", "Option Name")}
												</Text>
												<TextInput
													value={option.name}
													onChangeText={(value) =>
														updateModifierOption(group.id, option.id, {
															name: value,
														})
													}
													placeholder={t("option_name_placeholder", "Coke")}
													style={styles.input}
													placeholderTextColor={colors.textLight}
												/>

												<View style={styles.inlineRow}>
													<View style={styles.inlineCol}>
														<Text style={styles.label}>
															{t("price_label", "Price")}
														</Text>
														<TextInput
															value={String(option.price)}
															onChangeText={(value) =>
																updateModifierOption(group.id, option.id, {
																	price: value,
																})
															}
															placeholder={t("price_placeholder", "0.00")}
															keyboardType="numeric"
															style={styles.input}
															placeholderTextColor={colors.textLight}
														/>
													</View>

													<View style={styles.inlineCol}>
														<Text style={styles.label}>
															{t("category_label", "Category")}
														</Text>
														{Platform.OS === "ios" ? (
															<TouchableOpacity
																style={styles.selectButtonCompact}
																onPress={() =>
																	openIOSCategorySheet({
																		title: t("category_label", "Category"),
																		options: groupedCategoryLabels,
																		currentValue: option.category,
																		onSelect: (value) =>
																			updateModifierOption(
																				group.id,
																				option.id,
																				{ category: value },
																			),
																	})
																}
															>
																<Text
																	style={styles.selectButtonText}
																	numberOfLines={1}
																>
																	{option.category}
																</Text>
																<Ionicons
																	name="chevron-down"
																	size={16}
																	color={colors.textMedium}
																/>
															</TouchableOpacity>
														) : (
															<View style={styles.pickerContainerCompact}>
																<Picker
																	selectedValue={option.category}
																	onValueChange={(value) =>
																		updateModifierOption(group.id, option.id, {
																			category: value,
																		})
																	}
																	style={styles.pickerCompact}
																>
																	{groupedCategoryLabels.map((catValue) => (
																		<Picker.Item
																			key={catValue}
																			label={catValue}
																			value={catValue}
																		/>
																	))}
																</Picker>
															</View>
														)}
													</View>
												</View>

												<View style={styles.switchContainer}>
													<Text style={styles.labelInline}>
														{t("default_option_label", "Default Option")}
													</Text>
													<Switch
														value={!!option.isDefault}
														onValueChange={(value) =>
															updateModifierOption(group.id, option.id, {
																isDefault: value,
															})
														}
														trackColor={{
															false: "#767577",
															true: colors.primary,
														}}
														thumbColor="#f4f3f4"
													/>
												</View>

												<View style={styles.switchContainer}>
													<Text style={styles.labelInline}>
														{t("available_label", "Available")}
													</Text>
													<Switch
														value={option.isAvailable !== false}
														onValueChange={(value) =>
															updateModifierOption(group.id, option.id, {
																isAvailable: value,
															})
														}
														trackColor={{
															false: "#767577",
															true: colors.primary,
														}}
														thumbColor="#f4f3f4"
													/>
												</View>
											</View>
										))}

										<TouchableOpacity
											style={styles.addOptionButton}
											onPress={() => addModifierOption(group.id)}
										>
											<Ionicons
												name="add-circle-outline"
												size={18}
												color={colors.primary}
											/>
											<Text style={styles.addOptionButtonText}>
												{t("add_option_button", "Add Option")}
											</Text>
										</TouchableOpacity>
									</View>
								))
							)}
						</View>
					</ScrollView>

					<TouchableOpacity
						style={[
							styles.submitButton,
							isSubmitting && styles.submitButtonDisabled,
						]}
						onPress={handleSubmit}
						disabled={isSubmitting}
					>
						{isSubmitting ? (
							<ActivityIndicator color="#FFFFFF" />
						) : (
							<Text style={styles.submitButtonText}>
								{isEditMode
									? t("update_item_button", "Update Item")
									: t("add_item_to_menu_button", "Add Item to Menu")}
							</Text>
						)}
					</TouchableOpacity>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalView: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 20,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 15,
		marginBottom: 10,
	},
	modalTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.textDark,
		flex: 1,
		paddingRight: 12,
	},
	closeButton: {
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: 15,
		backgroundColor: colors.backgroundMedium,
	},
	closeButtonText: {
		fontSize: 14,
		fontWeight: "bold",
		color: colors.textMedium,
	},
	label: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.textDark,
		marginBottom: 8,
		marginTop: 15,
	},
	labelInline: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.textDark,
	},
	input: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		paddingVertical: 12,
		fontSize: 16,
		color: colors.textDark,
	},
	descriptionInput: {
		height: 100,
		textAlignVertical: "top",
	},
	pickerContainer: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		justifyContent: "center",
	},
	picker: {
		height: 50,
		color: colors.textDark,
	},
	pickerContainerCompact: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		justifyContent: "center",
	},
	pickerCompact: {
		height: 50,
		color: colors.textDark,
	},
	selectButton: {
		minHeight: 50,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	selectButtonCompact: {
		minHeight: 50,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	selectButtonText: {
		flex: 1,
		fontSize: 16,
		color: colors.textDark,
		paddingRight: 8,
	},
	selectButtonPlaceholder: {
		color: colors.textLight,
	},
	switchContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 15,
		paddingVertical: 10,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginTop: 20,
	},
	submitButton: {
		backgroundColor: colors.primary,
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 20,
		marginBottom: 10,
	},
	submitButtonDisabled: {
		backgroundColor: colors.primary + "80",
	},
	submitButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	imagePickerContainer: {
		alignItems: "center",
		marginBottom: 10,
	},
	imagePreview: {
		width: 150,
		height: 150,
		borderRadius: 8,
		backgroundColor: colors.backgroundMedium,
		marginBottom: 15,
	},
	imagePlaceholder: {
		width: 150,
		height: 150,
		borderRadius: 8,
		backgroundColor: colors.backgroundMedium,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 15,
	},
	uploadButton: {
		backgroundColor: colors.primary + "20",
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 20,
	},
	uploadButtonDisabled: {
		backgroundColor: colors.backgroundMedium,
	},
	uploadButtonText: {
		color: colors.primary,
		fontWeight: "bold",
		fontSize: 14,
	},
	sectionBlock: {
		marginTop: 24,
		marginBottom: 10,
	},
	sectionHeaderRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	sectionHeaderTextWrap: {
		flex: 1,
		paddingRight: 12,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: colors.textDark,
	},
	sectionSubtitle: {
		fontSize: 14,
		color: colors.textMedium,
		marginTop: 4,
	},
	secondaryActionButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary + "15",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 18,
	},
	secondaryActionButtonText: {
		color: colors.primary,
		fontWeight: "700",
		marginLeft: 6,
		fontSize: 13,
	},
	emptyModifierState: {
		marginTop: 14,
		padding: 16,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	emptyModifierText: {
		color: colors.textMedium,
		fontSize: 14,
		lineHeight: 20,
	},
	groupCard: {
		marginTop: 16,
		padding: 14,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	groupCardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	groupCardTitle: {
		fontSize: 17,
		fontWeight: "700",
		color: colors.textDark,
	},
	removeButton: {
		padding: 4,
	},
	inlineRow: {
		flexDirection: "row",
		columnGap: 12,
	},
	inlineCol: {
		flex: 1,
	},
	optionsTitle: {
		fontSize: 16,
		fontWeight: "700",
		color: colors.textDark,
		marginTop: 18,
		marginBottom: 8,
	},
	optionCard: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 10,
		padding: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginTop: 10,
	},
	optionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	optionTitle: {
		fontSize: 15,
		fontWeight: "700",
		color: colors.textDark,
	},
	addOptionButton: {
		marginTop: 14,
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 18,
		backgroundColor: colors.primary + "15",
	},
	addOptionButtonText: {
		color: colors.primary,
		fontWeight: "700",
		marginLeft: 6,
	},
});

export default AddItemModal;
