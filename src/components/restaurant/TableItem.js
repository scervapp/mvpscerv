import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import colors from "../../utils/styles/appStyles";

const TableItem = ({ item, onPress, isSelected }) => {
	const isAvailable = item.status === "available";

	const cardStyle = [
		styles.cardContainer,
		!isAvailable && styles.cardDisabled, // Dim the card if not available
		isSelected && styles.cardSelected, // Highlight if selected
	];

	const textStyle = [
		styles.tableName,
		!isAvailable && styles.textDisabled,
		isSelected && styles.textSelected,
	];

	return (
		<TouchableOpacity
			style={cardStyle}
			onPress={() => onPress(item)}
			disabled={!isAvailable} // Only available tables can be selected
		>
			<Ionicons
				name={isAvailable ? "checkmark-circle" : "close-circle"}
				size={24}
				color={
					isSelected
						? colors.surfaceWhite
						: isAvailable
						? colors.statusSuccess
						: colors.statusDanger
				}
				style={styles.statusIcon}
			/>
			<Text style={textStyle}>{item.name}</Text>
			<Text
				style={[
					styles.capacityText,
					!isAvailable && styles.textDisabled,
					isSelected && styles.textSelected,
				]}
			>
				Seats: {item.capacity}
			</Text>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	cardContainer: {
		flex: 1,
		margin: 8,
		minHeight: 100,
		borderRadius: 12,
		backgroundColor: colors.surfaceWhite,
		justifyContent: "center",
		alignItems: "center",
		// Shadow for a professional look
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 5,
		borderWidth: 2,
		borderColor: "transparent", // Default transparent border
	},
	cardDisabled: {
		backgroundColor: colors.backgroundLight,
		opacity: 0.7,
	},
	cardSelected: {
		backgroundColor: colors.primary, // Use your primary brand color for selection
		borderColor: colors.brandOrange, // Use accent for border
	},
	statusIcon: {
		position: "absolute",
		top: 8,
		right: 8,
	},
	tableName: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
	},
	capacityText: {
		fontSize: 14,
		color: colors.textMedium,
		marginTop: 4,
	},
	textSelected: {
		color: colors.surfaceWhite, // White text on selected background
	},
	textDisabled: {
		color: colors.textLight,
	},
});

export default TableItem;
