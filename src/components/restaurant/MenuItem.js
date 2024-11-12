import React, { useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	Image,
	Button,
	Alert,
	TouchableOpacity,
} from "react-native";
import AddItemModal from "./AddItemModal";
import {
	getFirestore,
	doc,
	getDoc,
	setDoc,
	addDoc,
	collection,
	updateDoc,
	getDocs,
	onSnapshot,
} from "firebase/firestore";
import app from "../../config/firebase";
import { deleteDoc } from "firebase/firestore";
import colors from "../../utils/styles/appStyles";

const MenuItem = ({ item, restaurantId }) => {
	const db = getFirestore(app);
	const [showModal, setShowModal] = useState(false);

	const handleEdit = () => {
		setShowModal(true);
	};
	const handleDelete = () => {
		try {
			Alert.alert(
				"Delete Menu Item",
				"Are you sure you want to delete this menu item?",
				[
					{
						text: "Cancel",
						style: "cancel",
					},
					{
						text: "Delete",
						onPress: () => deleteMenuItem(restaurantId, item),
					},
				]
			);
		} catch (error) {
			console.log("Error deleting menu item:", error);
		}
		// Handle delete logic here
	};

	const deleteMenuItem = async (restaurantId, menuItem) => {
		try {
			const menuItemRef = doc(db, "menuItems", menuItem.id);
			await deleteDoc(menuItemRef);
		} catch (error) {
			console.log("Error deleting menu item:", error);
			Alert.alert("Error", "There was an error deleting the menu item.");
		}
	};

	// Handle item update
	const updateMenuItem = async (restaurantId, menuItemId, menuItemData) => {
		try {
			const menuItemRef = doc(db, "menuItems", menuItemId);
			const menuItemSnapshot = await getDoc(menuItemRef);
			if (!menuItemSnapshot.exists()) {
				throw new Error("Menu Item not found");
			}

			if (menuItemData.restaurantId !== restaurantId) {
				throw new Error("Menu Item not found");
			}
			await updateDoc(menuItemRef, menuItemData);
			console.log("Menu Item updated successfully");
		} catch (error) {
			console.log("Error updating menu item:", error);
			Alert.alert("Error", "There was an error updating the menu item.");
		}
	};

	return (
		<View style={styles.container}>
			<Image source={{ uri: item.imageUri }} style={styles.image} />
			<View style={styles.infoContainer}>
				<Text style={styles.title}>
					{item.name} - ${parseFloat(item.price).toFixed(2)}
					{/* Format the price */}
				</Text>
				<Text style={styles.category}>{item.category}</Text>
				{/* Added category style */}
				<Text style={styles.description}>{item.description}</Text>
			</View>

			{/* Action Buttons */}
			<View style={styles.actionButtonsContainer}>
				<TouchableOpacity style={styles.editButton} onPress={handleEdit}>
					<Text style={styles.editButtonText}>Edit</Text>
				</TouchableOpacity>
				<TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
					<Text style={styles.deleteButtonText}>Delete</Text>
				</TouchableOpacity>
			</View>
			<AddItemModal
				isVisible={showModal}
				onClose={() => setShowModal(false)}
				itemData={item} // Pass item pre-population
				isEdit={true} // Set to true to enable edit mode
				updateMenuItem={updateMenuItem}
				restaurantId={restaurantId}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		padding: 15,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
		backgroundColor: "white", // Add a white background
		borderRadius: 8, // Add rounded corners
		marginBottom: 10,
	},
	infoContainer: {
		flex: 1,
		paddingLeft: 10,
	},
	title: {
		fontSize: 18, // Increased font size
		fontWeight: "bold",
	},
	category: {
		fontSize: 14,
		color: "#666", // Slightly muted color for category
	},
	description: {
		fontSize: 14,
		color: "#666",
	},
	image: {
		width: 70, // Increased image size
		height: 70,
		borderRadius: 8, // Add rounded corners to the image
	},
	actionButtonsContainer: {
		marginLeft: 10,
	},
	editButton: {
		backgroundColor: colors.primary, // Use your primary color
		padding: 8,
		borderRadius: 5,
		marginBottom: 5, // Add space between buttons
		alignItems: "center",
	},
	editButtonText: {
		color: "white",
		fontSize: 14,
	},
	deleteButton: {
		backgroundColor: "red", // Use your error color (e.g., red)
		padding: 8,
		borderRadius: 5,
		alignItems: "center",
	},
	deleteButtonText: {
		color: "white",
		fontSize: 14,
	},
});

export default MenuItem;
