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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AddItemModal from "./AddItemModal";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { formatMenuPrice } from "../../utils/currencyFormatter";

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
				t("archive_menu_item_title", "Archive Item"),
				t(
					"confirm_archive_menu_item_message",
					"Archive this item? It will be hidden from customers, but ratings and review history will stay protected.",
				),
				[
					{
						text: t("cancel_button", "Cancel"),
						style: "cancel",
					},
					{
						text: t("archive_button", "Archive"),
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
			// Archive instead of deleting so restaurants cannot reset dish reputation.
			await db.collection("menuItems").doc(menuItem.id).update({
				isAvailable: false,
				isArchived: true,
				archivedAt: new Date(),
				archivedByRestaurantId: restaurantId,
			});
		} catch (error) {
			console.log("Error deleting menu item:", error);
			Alert.alert(t("error_title"), t("error_deleting_menu_item_message"));
		}
	};

	// --- NEW: Toggle Visibility Logic ---
	const handleToggleVisibility = async () => {
		try {
			const nextIsAvailable = !isAvailable;
			await db.collection("menuItems").doc(item.id).update({
				isAvailable: nextIsAvailable,
				...(nextIsAvailable
					? {
							isArchived: false,
							archivedAt: null,
						}
					: {}),
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
					{item.name}
				</Text>
				<View style={styles.metaRow}>
					<Text style={styles.price}>{formatMenuPrice(item.price)}</Text>
					<Text style={styles.category}>{item.category}</Text>
				</View>
				<Text style={styles.description} numberOfLines={2}>
					{item.description}
				</Text>
			</View>

			<View style={styles.actionButtonsContainer}>
				<TouchableOpacity
					style={[styles.iconButton, !isAvailable && styles.showButton]}
					onPress={handleToggleVisibility}
				>
					<Ionicons
						name={isAvailable ? "eye-off-outline" : "eye-outline"}
						size={18}
						color={isAvailable ? colors.textMedium : "#fff"}
					/>
				</TouchableOpacity>

				<TouchableOpacity style={styles.iconButton} onPress={handleEdit}>
					<MaterialCommunityIcons
						name="pencil-outline"
						size={18}
						color={colors.primary}
					/>
				</TouchableOpacity>

				<TouchableOpacity
					style={[styles.iconButton, styles.deleteIconButton]}
					onPress={handleDelete}
				>
					<Ionicons name="trash-outline" size={18} color={colors.statusDanger} />
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
		padding: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		marginBottom: 8,
	},
	containerHidden: {
		backgroundColor: colors.backgroundLight,
	},
	infoContainer: {
		flex: 1,
		paddingLeft: 12,
	},
	title: {
		fontSize: 15,
		fontWeight: "900",
		color: colors.textDark,
	},
	textHidden: {
		color: colors.textMedium,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 4,
	},
	price: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.primary,
		marginRight: 8,
	},
	category: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
	},
	description: {
		fontSize: 12,
		color: colors.textMedium,
		lineHeight: 17,
		marginTop: 4,
	},
	image: {
		width: 70,
		height: 70,
		borderRadius: 8,
	},
	imageHidden: {
		opacity: 0.4,
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
		marginLeft: 8,
		width: 42,
		alignItems: "center",
		justifyContent: "center",
	},
	iconButton: {
		width: 36,
		height: 36,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 6,
	},
	showButton: {
		backgroundColor: colors.statusSuccess,
		borderColor: colors.statusSuccess,
	},
	deleteIconButton: {
		backgroundColor: "#fff5f5",
		borderColor: "#fecaca",
		marginBottom: 0,
	},
});

export default MenuItem;
