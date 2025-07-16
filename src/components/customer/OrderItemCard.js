// components/customer/OrderItemCard.js (or a suitable path)
import React from "react";
import { View, Text, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { IconButton } from "react-native-paper";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"; // Or your preferred icon set
import colors from "../../utils/styles/appStyles";
import formatCurrency from "../../utils/currencyFormatter";

const OrderItemCard = (props) => {
	const {
		restaurantId,
		item,
		onQuantityChange,
		allowEdit = false,
		isSentToKitchen = false,
		isUpdating = false,
	} = props;

	if (!item || !item.dishName) {
		// Handle cases where item or item.dish might be undefined
		return (
			<View style={styles.basketItemRow}>
				<Text style={styles.errorText}>Item data is unavailable.</Text>
			</View>
		);
	}

	const handleDecrement = () => {
		if (!allowEdit || isUpdating) return;
		const currentQuantity = item.quantity;
		if (currentQuantity === 1) {
			Alert.alert("Confirm Remove", `Remove ${item.dishName}?`, [
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					onPress: () => onQuantityChange(0), // Pass only the new quantity
					style: "destructive",
				},
			]);
		} else {
			onQuantityChange(currentQuantity - 1); // Pass only the new quantity
		}
	};

	const handleIncrement = () => {
		if (!allowEdit || isUpdating) return; // Disable if updating
		onQuantityChange(item.quantity + 1); // Pass only the new quantity
	};

	const itemTotal =
		Math.round(
			(item.discount ? parseFloat(item.discountedPrice) : item?.price || 0) *
				100
		) * item.quantity;

	const displayOrderedForName = item.orderedByPipName || item.pip?.name;
	return (
		<View
			style={[
				styles.orderItemCard,
				isSentToKitchen && styles.sentItemCardVisual,
				isUpdating && styles.updatingItemVisual, // Apply visual style when updating
			]}
		>
			<View style={styles.itemContent}>
				<View style={styles.statusIconContainer}>
					{isSentToKitchen ? (
						<Ionicons
							name="checkmark-circle"
							size={24}
							color={colors.statusSuccess}
						/>
					) : (
						// Show a subtle icon for items not yet sent, or nothing
						<MaterialCommunityIcons
							name="circle-outline"
							size={24}
							color={colors.textLight}
						/>
					)}
				</View>

				<View style={styles.detailsContainer}>
					<Text
						style={[styles.dishName, isSentToKitchen && styles.sentItemText]}
					>
						{item.dishName}
					</Text>
					{displayOrderedForName && (
						<Text
							style={[
								styles.orderedForText,
								isSentToKitchen && styles.sentItemText,
							]}
						>
							For: {displayOrderedForName}
						</Text>
					)}
					{item.specialInstructions && (
						<Text
							style={[
								styles.specialInstructions,
								isSentToKitchen && styles.sentItemText,
							]}
						>
							Notes: {item.specialInstructions}
						</Text>
					)}
				</View>

				<View style={styles.controlsAndPriceContainer}>
					{/* Show ActivityIndicator if this item is updating */}
					{isUpdating ? (
						<View style={styles.quantityControls}>
							{/* Keep container for consistent height */}
							<ActivityIndicator size="small" color={colors.primary} />
						</View>
					) : !isSentToKitchen && allowEdit ? (
						<View style={styles.quantityControls}>
							<IconButton
								icon="minus-circle"
								size={26}
								onPress={handleDecrement}
								style={styles.quantityButton}
								color={colors.textMedium}
								disabled={isUpdating} // Disable while any update is in progress
							/>
							<Text style={styles.quantityText}>{item.quantity}</Text>
							<IconButton
								icon="plus-circle"
								size={26}
								onPress={handleIncrement}
								style={styles.quantityButton}
								color={colors.primary}
								disabled={isUpdating} // Disable while any update is in progress
							/>
						</View>
					) : (
						// Display quantity as text if not editable or already sent
						<Text style={styles.quantityDisplayOnly}>Qty: {item.quantity}</Text>
					)}
					<Text
						style={[
							styles.itemPrice,
							isSentToKitchen && styles.sentItemPriceDimmed,
						]}
					>
						{formatCurrency(itemTotal)}
					</Text>
				</View>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.surfaceWhite, // Use new surfaceWhite
		borderRadius: 8, // Consistent with pipSection
		paddingVertical: 10, // Adjusted padding
		paddingHorizontal: 12,
		marginVertical: 6, // Space between cards
		// Adding a subtle shadow consistent with your pipSection idea but more modern
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08, // Softer shadow
		shadowRadius: 2.5,
		elevation: 2, // Subtle elevation for Android
		borderWidth: 1, // Optional: very light border for definition
		borderColor: colors.borderLight + "60", // Very light, semi-transparent border
	},
	sentItemCardVisual: {
		backgroundColor: colors.backgroundLight, // Slightly different background for sent items
		// opacity: 0.8, // Or slightly dim the whole card
	},
	itemContent: {
		flexDirection: "row",
		alignItems: "center", // Align items vertically in the center of the row
	},
	statusIconContainer: {
		marginRight: 10, // Space next to icon
		alignItems: "center",
	},
	detailsContainer: {
		flex: 1, // Allow this section to take up available space
		marginRight: 8, // Space before controls/price
	},
	dishName: {
		fontSize: 16, // Good size for item name
		fontWeight: "600", // Semi-bold for emphasis
		color: colors.textDark, // Use new textDark
		marginBottom: 4,
	},
	orderedForText: {
		fontSize: 13,
		color: colors.textMedium, // Use new textMedium
		fontStyle: "italic",
		marginBottom: 4,
	},
	specialInstructions: {
		fontSize: 13,
		color: colors.textMedium,
		fontStyle: "italic",
	},
	controlsAndPriceContainer: {
		alignItems: "flex-end", // Align to the right
		minWidth: 90, // Ensure enough space
	},
	quantityControls: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5, // Space between controls and price
	},
	quantityButton: {
		margin: 0, // Remove default margin of IconButton
		width: 32, // Define touch target size
		height: 32,
	},
	quantityText: {
		fontSize: 17, // Clear quantity display
		fontWeight: "bold",
		color: colors.textDark,
		minWidth: 24, // Prevent layout jumps
		textAlign: "center",
		marginHorizontal: 4, // Space around the number
	},
	quantityDisplayOnly: {
		// When controls are not shown
		fontSize: 15,
		color: colors.textMedium,
		fontWeight: "500",
		marginBottom: 5, // Align with price
	},
	itemPrice: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark, // Price stands out
	},
	sentItemText: {
		// For dish name, ordered for, special instructions when sent
		color: colors.textLight, // Dimmer text
		// textDecorationLine: "line-through", // Optional: if you want strikethrough
	},
	sentItemPriceDimmed: {
		color: colors.textLight, // Dimmer price
		fontWeight: "500",
	},
	errorText: {
		color: colors.statusDanger, // Use new statusDanger
		padding: 10,
		fontSize: 14,
	},
});

export default OrderItemCard;
