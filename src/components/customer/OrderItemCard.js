// components/customer/OrderItemCard.js (or a suitable path)
import React from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { IconButton } from "react-native-paper";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"; // Or your preferred icon set
import colors from "../../utils/styles/appStyles";
import formatCurrency from "../../utils/currencyFormatter";

const OrderItemCard = ({
	item,
	onQuantityChange, // (itemId, newQuantity) => void
	allowEdit = false, // True if quantity can be changed
	isSentToKitchen = false,
	restaurantId,

	// You might add other props like onRemoveItem if decrementing to 0 means removal
}) => {
	if (!item || !item.dish) {
		// Handle cases where item or item.dish might be undefined
		return (
			<View style={styles.basketItemRow}>
				<Text style={styles.errorText}>Item data is unavailable.</Text>
			</View>
		);
	}

	const handleDecrement = () => {
		const currentQuantity = item.quantity;
		if (currentQuantity === 1) {
			Alert.alert("Confirm Remove", `Remove ${item.dish.name}?`, [
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					onPress: () => onQuantityChange(restaurantId, item.id, 0), // Assuming quantity 0 means remove
					style: "destructive",
				},
			]);
		} else {
			onQuantityChange(restaurantId, item.id, currentQuantity - 1);
		}
	};

	const handleIncrement = () => {
		onQuantityChange(restaurantId, item.id, item.quantity + 1);
	};

	const itemTotal =
		Math.round(
			(item.discount
				? parseFloat(item.discountedPrice)
				: item.dish?.price || 0) * 100
		) * item.quantity;

	const displayOrderedForName = item.orderedByPipName || item.pip?.name;
	return (
		<View style={[styles.card, isSentToKitchen && styles.sentItemCardVisual]}>
			<View style={styles.itemContent}>
				{/* Optional: Icon for item status (new/sent) - can be on left or right */}
				<View style={styles.statusIconContainer}>
					{isSentToKitchen ? (
						<Ionicons
							name="checkmark-circle"
							size={24}
							color={colors.statusSuccess}
						/>
					) : (
						// Using a more subtle icon for "new" or pending items if desired
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
						{item.dish.name}
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
					{!isSentToKitchen && allowEdit ? (
						<View style={styles.quantityControls}>
							<IconButton
								icon="minus-circle" // Using filled for more visual weight
								size={26} // Slightly larger for easier touch
								onPress={handleDecrement}
								style={styles.quantityButton}
								color={colors.textMedium}
								rippleColor="rgba(0,0,0,0.1)"
							/>
							<Text style={styles.quantityText}>{item.quantity}</Text>
							<IconButton
								icon="plus-circle" // Using filled
								size={26}
								onPress={handleIncrement}
								style={styles.quantityButton}
								color={colors.primary} // Primary color for increment
								rippleColor="rgba(0,0,0,0.1)"
							/>
						</View>
					) : (
						// Display quantity if not editable or already sent
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
