import React, { useState, useContext, useEffect } from "react";
import {
	Modal,
	View,
	Text,
	StyleSheet,
	TextInput,
	Button,
	Image,
	Platform,
	Switch,
	Alert,
	ScrollView,
	TouchableWithoutFeedback,
	TouchableOpacity,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { pickImage, uploadImage } from "../../utils/firebaseUtils";
import app from "../../config/firebase";
import {
	getFirestore,
	doc,
	getDoc,
	setDoc,
	addDoc,
	collection,
} from "firebase/firestore";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

const AddItemModal = ({
	isVisible,
	onClose,
	onAddItem,
	isEdit,
	itemData,
	restaurantId,
	updateMenuItem,
}) => {
	const db = getFirestore(app);
	const { isLoading, currentUserData } = useContext(AuthContext);
	const [imageUri, setImageUri] = useState(null);
	const [isUploading, setIsUploading] = useState(false);

	const [formData, setFormData] = useState({
		name: "",
		price: "",
		description: "",
		price: "",
		category: "",
		isDailySpecial: false,
	});

	handleBackButton = () => {
		navigation.goBack();
	};

	useEffect(() => {
		if (isEdit && itemData) {
			// Populate form with itemData
			setFormData(itemData); // assuming you have a form state
			setImageUri(itemData.imageUri);
		} else {
			setFormData({
				name: "",
				price: "",
				description: "",
				price: "",
				category: "",
				isDailySpecial: false,
			});
			setImageUri(null);
		}
	}, [isEdit, itemData]);

	// Add Menu Item
	const addMenuItem = async (restaurantId, menuItemData) => {
		try {
			const menuItemsRef = collection(db, "menuItems");
			const newMenuItemRef = await addDoc(menuItemsRef, {
				...menuItemData,
				restaurantId: restaurantId,
			});

			console.log("Menu Item added successfully with ID", menuItemsRef.id);
		} catch (error) {
			console.log("Error adding menu item:", error);
			Alert.alert("Error", "There was an error adding the menu item.");
		}
	};

	const handleSubmit = async () => {
		try {
			const newItemData = {
				...formData,
				imageUri,
			};

			if (isEdit) {
				await updateMenuItem(currentUserData.uid, itemData.id, newItemData);
			} else {
				await addMenuItem(currentUserData.uid, newItemData);
				setFormData({
					name: "",
					price: "",
					description: "",
					price: "",
					category: "",
					isDailySpecial: false,
				});

				setImageUri(null);
			}
		} catch (error) {
			console.log("Error adding menu item:", error);
			Alert.alert("Error", "There was an error adding the menu item.");
		}
		onClose();
	};
	const handleImageUpload = async () => {
		setIsUploading(true);
		try {
			const { success, imageUri } = await pickImage();
			console.log("Image URI before uploaded", imageUri);
			if (success) {
				const downloadUrl = await uploadImage(imageUri, "menuItemImages");
				setImageUri(downloadUrl);
			} else {
				console.log("Image upload failed");
			}
		} catch (error) {
			console.log("Error uploading image:", error);
			Alert.alert("Upload error", "There was an issue uploading your image.");
		} finally {
			setIsUploading(false);
		}
	};
	return (
		<Modal visible={isVisible} animationType="slide">
			<View style={styles.modalContainer}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>{isEdit ? "Edit" : "Add"} Item</Text>

					<View style={styles.formContainer}>
						<TextInput
							value={formData.name}
							placeholder="Name"
							style={styles.input}
							onChangeText={(text) => setFormData({ ...formData, name: text })}
						/>
						<TextInput
							value={formData.description}
							onChangeText={(text) =>
								setFormData({ ...formData, description: text })
							}
							placeholder="Description"
							style={[styles.input, styles.descriptionInput]}
							multiline
							numberOfLines={4}
						/>
						<TextInput
							value={formData.price}
							placeholder="Price"
							style={styles.input}
							onChangeText={(text) => setFormData({ ...formData, price: text })}
						/>

						{/* Category Picker */}
						<View style={styles.pickerContainer}>
							<Picker
								style={styles.picker}
								selectedValue={formData.category}
								onValueChange={(itemValue, itemIndex) =>
									setFormData({ ...formData, category: itemValue })
								}
							>
								<Picker.Item label="Select Category" value="" />
								<Picker.Item label="Appetizer" value="Appetizer" />
								<Picker.Item label="Entree" value="Entree" />
								<Picker.Item label="Dessert" value="Dessert" />
								<Picker.Item label="Beverage" value="Beverage" />
								<Picker.Item
									label="Alcoholic Beverage"
									value="Alcoholic beverage"
								/>
							</Picker>
						</View>

						{/* Daily Special Switch */}
						<View style={styles.switchContainer}>
							<Text style={styles.switchLabel}>Daily Special</Text>
							<Switch
								value={formData.isDailySpecial}
								onValueChange={() => {
									setFormData({
										...formData,
										isDailySpecial: !formData.isDailySpecial,
									});
								}}
								trackColor={{ false: "#767577", true: colors.primary }}
							/>
						</View>

						{/* Image Upload */}
						<View style={styles.imageContainer}>
							{imageUri && (
								<Image source={{ uri: imageUri }} style={styles.previewImage} />
							)}
							<TouchableOpacity
								onPress={handleImageUpload}
								style={styles.uploadButton}
								disabled={isUploading}
							>
								<Text style={styles.uploadButtonText}>
									{isUploading ? "Uploading..." : "Upload Image"}
								</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Buttons */}
					<View style={styles.buttonContainer}>
						<TouchableOpacity style={styles.cancelButton} onPress={onClose}>
							<Text style={styles.cancelButtonText}>Cancel</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.submitButton}
							onPress={handleSubmit}
						>
							<Text style={styles.submitButtonText}>
								{isEdit ? "Update" : "Add"}
							</Text>
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
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		textAlign: "center",
	},
	formContainer: {
		marginBottom: 20,
	},
	input: {
		borderWidth: 1,
		borderColor: "#ccc",
		padding: 10,
		marginBottom: 10,
		borderRadius: 5,
	},
	descriptionInput: {
		height: 100,
		textAlignVertical: "top",
		borderColor: "#ccc",
		borderWidth: 1,
		borderRadius: 5,
		marginBottom: 15,
	},
	pickerContainer: {
		borderWidth: 1,
		borderColor: "#ced4da",
		borderRadius: 8,
		marginBottom: 15,
	},
	picker: {
		height: 45,
	},
	switchContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 15,
	},
	switchLabel: {
		fontSize: 16,
	},
	imageContainer: {
		alignItems: "center",
		marginBottom: 20,
	},
	previewImage: {
		width: 200,
		height: 200,
		borderRadius: 10,
	},
	uploadButton: {
		backgroundColor: colors.primary,
		padding: 10,
		borderRadius: 8,
		marginTop: 10,
		alignItems: "center",
	},
	uploadButtonText: {
		color: "white",
	},
	buttonContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginTop: 15,
	},
	cancelButton: {
		backgroundColor: "#ccc",
		padding: 12,
		borderRadius: 8,
		flex: 1,
		marginHorizontal: 5,
		alignItems: "center",
	},
	cancelButtonText: {
		color: "#333",
		fontSize: 16,
		fontWeight: "bold",
	},
	submitButton: {
		backgroundColor: colors.primary,
		padding: 12,
		borderRadius: 8,
		flex: 1,
		marginHorizontal: 5,
		alignItems: "center",
	},
	submitButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
});
export default AddItemModal;
