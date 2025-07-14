// components/restaurant/AddItemModal.js
import React, { useState, useContext, useEffect } from "react";
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
} from "react-native";
import { Picker } from "@react-native-picker/picker";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { Ionicons } from "@expo/vector-icons";
import { pickImage, uploadImage } from "../../utils/firebaseUtils";

// NOTE: The image upload functionality is removed for this example to focus on the core logic.
// You can re-integrate your 'pickImage' and 'uploadImage' utilities.

const AddItemModal = ({ isVisible, onClose, itemToEdit }) => {
	const { currentUserData } = useContext(AuthContext);
	const insets = useSafeAreaInsets(); // For better layout on all devices

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [price, setPrice] = useState("");
	const [category, setCategory] = useState("");
	const [isDailySpecial, setIsDailySpecial] = useState(false);
	// Add state for imageUri if you re-integrate image uploads
	const [imageUri, setImageUri] = useState(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isEditMode = itemToEdit !== null;

	// This effect runs when the modal opens or the itemToEdit changes
	useEffect(() => {
		if (isVisible) {
			if (isEditMode) {
				// If we are editing, populate the form with the item's data
				setName(itemToEdit.name || "");
				setDescription(itemToEdit.description || "");
				setPrice(String(itemToEdit.price) || ""); // Ensure price is a string for the TextInput
				setCategory(itemToEdit.category || "");
				setIsDailySpecial(itemToEdit.isDailySpecial || false);
				setImageUri(itemToEdit.imageUri || null);
			} else {
				// If we are adding, reset the form to its initial state
				setName("");
				setDescription("");
				setPrice("");
				setCategory("");
				setIsDailySpecial(false);
				setImageUri(null);
			}
		}
	}, [isVisible, itemToEdit]);

	const handleImageSelection = async () => {
		setIsUploading(true);
		try {
			const result = await pickImage();

			if (result.success) {
				const downloadURL = await uploadImage(result.uri, "menuItemImages");
				setImageUri(downloadURL);
			}
		} catch (error) {
			console.log("Image selection/upload process failed in modal.");
		} finally {
			setIsUploading(false);
		}
	};

	const validateForm = () => {
		if (!name.trim() || !price.trim() || !category) {
			Alert.alert(
				"Missing Information",
				"Please fill out the item name, price, and category."
			);
			return false;
		}
		if (isNaN(parseFloat(price))) {
			Alert.alert(
				"Invalid Price",
				"Please enter a valid number for the price."
			);
			return false;
		}
		return true;
	};

	const handleSubmit = async () => {
		if (!validateForm()) {
			return;
		}

		setIsSubmitting(true);
		const restaurantId = currentUserData.uid;

		const menuItemData = {
			restaurantId,
			name: name.trim(),
			description: description.trim(),
			price: parseFloat(price), // Store price as a number
			category,
			isDailySpecial,
			imageUri: imageUri, // Add this back if using images
		};

		try {
			if (isEditMode) {
				// Update existing document
				await db.collection("menuItems").doc(itemToEdit.id).update(menuItemData);
				Alert.alert("Success", "Menu item has been updated.");
			} else {
				// Create new document
				await db.collection("menuItems").add(menuItemData);
				Alert.alert("Success", "New menu item has been added.");
			}
			onClose(); // Close the modal on success
		} catch (error) {
			console.error("Error saving menu item:", error);
			Alert.alert("Error", "Could not save the menu item. Please try again.");
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
								{isEditMode ? "Edit Item" : "Add New Item"}
							</Text>
							<TouchableOpacity onPress={onClose} style={styles.closeButton}>
								<Text style={styles.closeButtonText}>Cancel</Text>
							</TouchableOpacity>
						</View>

						<Text style={styles.label}>Item Image</Text>
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
										{imageUri ? "Change Image" : "Upload Image"}
									</Text>
								)}
							</TouchableOpacity>
						</View>

						<Text style={styles.label}>Item Name</Text>
						<TextInput
							value={name}
							onChangeText={setName}
							placeholder="e.g., Classic Burger"
							style={styles.input}
						/>

						<Text style={styles.label}>Description</Text>
						<TextInput
							value={description}
							onChangeText={setDescription}
							placeholder="Juicy beef patty, fresh lettuce, tomato..."
							style={[styles.input, styles.descriptionInput]}
							multiline
						/>

						<Text style={styles.label}>Price</Text>
						<TextInput
							value={price}
							onChangeText={setPrice}
							placeholder="e.g., 12.99"
							style={styles.input}
							keyboardType="numeric"
						/>

						<Text style={styles.label}>Category</Text>
						<View style={styles.pickerContainer}>
							<Picker
								selectedValue={category}
								onValueChange={(itemValue) => setCategory(itemValue)}
								style={styles.picker}
							>
								<Picker.Item label="Select a Category..." value="" />
								<Picker.Item label="Appetizers" value="Appetizers" />
								<Picker.Item label="Entrees" value="Entrees" />
								<Picker.Item label="Desserts" value="Desserts" />
								<Picker.Item label="Drinks" value="Drinks" />
								<Picker.Item label="Beer" value="Beer" />
								<Picker.Item label="Wine" value="Wine" />
								<Picker.Item label="Cocktails" value="Cocktails" />
							</Picker>
						</View>

						<View style={styles.switchContainer}>
							<Text style={styles.label}>Daily Special</Text>
							<Switch
								value={isDailySpecial}
								onValueChange={setIsDailySpecial}
								trackColor={{ false: "#767577", true: colors.primary }}
								thumbColor={"#f4f3f4"}
							/>
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
								{isEditMode ? "Update Item" : "Add Item to Menu"}
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
	modalTitle: { fontSize: 24, fontWeight: "bold", color: colors.textDark },
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
	descriptionInput: { height: 100, textAlignVertical: "top" },
	pickerContainer: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		justifyContent: "center",
	},
	picker: { height: 50 },
	switchContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 15,
		paddingVertical: 5,
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
	},
	submitButtonDisabled: { backgroundColor: colors.primary + "80" },
	submitButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
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
});

export default AddItemModal;
