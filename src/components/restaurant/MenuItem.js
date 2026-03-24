// components/restaurant/MenuItem.js
import React, { useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	Image,
	Alert,
	TouchableOpacity,
} from "react-native";
import { useTranslation } from "react-i18next";
import AddItemModal from "./AddItemModal";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";

const MenuItem = ({ item, restaurantId, onEdit }) => {
	const { t } = useTranslation();
	const [showModal, setShowModal] = useState(false);

	// Default to true if the field doesn't exist yet
	const isAvailable = item.isAvailable !== false;

	const handleEdit = () => {
		onEdit(item);
	};

	const handleDelete = () => {
		try {
			Alert.alert(
				t("delete_menu_item_title", "Delete Item"),
				t(
					"confirm_delete_menu_item_message",
					"Are you sure you want to delete this?",
				),
				[
					{
						text: t("cancel_button", "Cancel"),
						style: "cancel",
					},
					{
						text: t("delete_button", "Delete"),
						style: "destructive", // Makes it red on iOS
						onPress: () => deleteMenuItem(restaurantId, item),
					},
				],
			);
		} catch (error) {
			console.log("Error deleting menu item:", error);
		}
	};

	const deleteMenuItem = async (restaurantId, menuItem) => {
		try {
			await db.collection("menuItems").doc(menuItem.id).delete();
		} catch (error) {
			console.log("Error deleting menu item:", error);
			Alert.alert(t("error_title"), t("error_deleting_menu_item_message"));
		}
	};

	// --- NEW: Toggle Visibility Logic ---
	const handleToggleVisibility = async () => {
		try {
			await db.collection("menuItems").doc(item.id).update({
				isAvailable: !isAvailable,
			});
		} catch (error) {
			console.log("Error toggling availability:", error);
			Alert.alert(
				t("error_title", "Error"),
				t("error_updating_menu_item_message", "Could not update item status."),
			);
		}
	};

	// Handle item update
	const updateMenuItem = async (restaurantId, menuItemId, menuItemData) => {
		try {
			const menuItemSnapshot = await db
				.collection("menuItems")
				.doc(menuItemId)
				.get();
			if (!menuItemSnapshot.exists()) {
				throw new Error("Menu Item not found");
			}

			if (menuItemData.restaurantId !== restaurantId) {
				throw new Error("Menu Item not found");
			}
			await db.collection("menuItems").doc(menuItemId).update(menuItemData);
			console.log("Menu Item updated successfully");
		} catch (error) {
			console.log("Error updating menu item:", error);
			Alert.alert(t("error_title"), t("error_updating_menu_item_message"));
		}
	};

	return (
		<View style={[styles.container, !isAvailable && styles.containerHidden]}>
			<View>
				<Image
					source={{ uri: item.imageUri }}
					style={[styles.image, !isAvailable && styles.imageHidden]}
				/>
				{!isAvailable && (
					<View style={styles.outOfStockBadge}>
						<Text style={styles.outOfStockText}>{t("hidden", "Hidden")}</Text>
					</View>
				)}
			</View>

			<View style={styles.infoContainer}>
				<Text style={[styles.title, !isAvailable && styles.textHidden]}>
					{item.name} - ${parseFloat(item.price).toFixed(2)}
				</Text>
				<Text style={styles.category}>{item.category}</Text>
				<Text style={styles.description} numberOfLines={2}>
					{item.description}
				</Text>
			</View>

			{/* Action Buttons */}
			<View style={styles.actionButtonsContainer}>
				{/* Hide / Show Toggle Button */}
				<TouchableOpacity
					style={[styles.toggleButton, !isAvailable && styles.showButton]}
					onPress={handleToggleVisibility}
				>
					<Text style={styles.toggleButtonText}>
						{isAvailable ? t("hide_button", "Hide") : t("show_button", "Show")}
					</Text>
				</TouchableOpacity>

				<TouchableOpacity style={styles.editButton} onPress={handleEdit}>
					<Text style={styles.editButtonText}>{t("edit_button", "Edit")}</Text>
				</TouchableOpacity>

				<TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
					<Text style={styles.deleteButtonText}>
						{t("delete_button", "Delete")}
					</Text>
				</TouchableOpacity>
			</View>

			<AddItemModal
				isVisible={showModal}
				onClose={() => setShowModal(false)}
				itemData={item}
				isEdit={true}
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
		backgroundColor: "white",
		borderRadius: 8,
		marginBottom: 10,
	},
	containerHidden: {
		backgroundColor: "#f8f9fa", // Slight grey tint for hidden items
	},
	infoContainer: {
		flex: 1,
		paddingLeft: 10,
	},
	title: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
	},
	textHidden: {
		color: colors.textMedium, // Dim the text if hidden
	},
	category: {
		fontSize: 14,
		color: "#666",
	},
	description: {
		fontSize: 14,
		color: "#666",
	},
	image: {
		width: 70,
		height: 70,
		borderRadius: 8,
	},
	imageHidden: {
		opacity: 0.4, // Greys out the image
	},
	outOfStockBadge: {
		position: "absolute",
		top: "50%",
		left: "50%",
		transform: [{ translateX: -25 }, { translateY: -10 }],
		backgroundColor: "rgba(0,0,0,0.7)",
		paddingHorizontal: 5,
		paddingVertical: 2,
		borderRadius: 4,
	},
	outOfStockText: {
		color: "white",
		fontSize: 10,
		fontWeight: "bold",
	},
	actionButtonsContainer: {
		marginLeft: 10,
		width: 70, // Keep buttons uniform
	},
	toggleButton: {
		backgroundColor: colors.statusWarning || "#f39c12", // Orange for Hide
		padding: 8,
		borderRadius: 5,
		marginBottom: 5,
		alignItems: "center",
	},
	showButton: {
		backgroundColor: colors.statusSuccess || "#2ecc71", // Green for Show
	},
	toggleButtonText: {
		color: "white",
		fontSize: 14,
		fontWeight: "bold",
	},
	editButton: {
		backgroundColor: colors.primary,
		padding: 8,
		borderRadius: 5,
		marginBottom: 5,
		alignItems: "center",
	},
	editButtonText: {
		color: "white",
		fontSize: 14,
	},
	deleteButton: {
		backgroundColor: "red",
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
