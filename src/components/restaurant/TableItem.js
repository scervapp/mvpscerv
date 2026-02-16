// src/components/restaurant/TableItem.js
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from 'react-i18next';
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";

const TableItem = ({ item, onPress, isSelected, onLongPress }) => {
	const { t } = useTranslation();
	if (!item || !item.name || !item.status) {
		return null; // Render nothing to prevent the crash
	}
	// --- Determine table status and corresponding styles ---
	let statusText = t('unknown_status');
	let statusColor = colors.textLight;
	let iconName = "help-circle-outline";
	let canBePressed = false;

	switch (item.status) {
		case "available":
			statusText = t('available_status');
			statusColor = colors.statusSuccess;
			iconName = "checkmark-circle-outline";
			canBePressed = true;
			break;
		case "OCCUPIED": // Handle both cases for robustness
		case "occupied":
			statusText = t('occupied_status');
			statusColor = colors.statusDanger;
			iconName = "person";
			break;
		case "checkedOut":
			statusText = t('needs_cleaning_status');
			statusColor = colors.statusWarning;
			iconName = "alert-circle-outline";
			break;
	}

	const cardStyle = [
		styles.cardContainer,
		!canBePressed && styles.cardDisabled,
		isSelected && styles.cardSelected,
	];

	const textStyle = [styles.tableName, isSelected && styles.textSelected];

	return (
		<TouchableOpacity
			style={cardStyle}
			onPress={() => onPress(item)}
			onLongPress={() => onLongPress(item)}
			// A table can be tapped to view details even if occupied, but seating is only for available tables.
			// The parent modal will decide what actions are available based on status.
			// disabled={!canBePressed}
		>
			<View style={styles.header}>
				<Text style={textStyle}>{item.name}</Text>
				<Ionicons
					name={iconName}
					size={24}
					color={isSelected ? colors.surfaceWhite : statusColor}
				/>
			</View>

			<View style={styles.body}>
				<Text
					style={[
						styles.statusText,
						{ color: isSelected ? colors.surfaceWhite + "90" : statusColor },
					]}
				>
					{statusText}
				</Text>
				<Text style={[styles.capacityText, isSelected && styles.textSelected]}>
					{t('seats_label')}: {item.capacity}
				</Text>
			</View>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	cardContainer: {
		flex: 1,
		margin: 8,
		height: 110, // Consistent height
		borderRadius: 12,
		backgroundColor: colors.surfaceWhite,
		justifyContent: "space-between", // Space out header and body
		padding: 12,
		// Professional shadow
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 4,
		borderWidth: 2,
		borderColor: "transparent",
	},
	cardDisabled: {
		backgroundColor: colors.backgroundLight,
	},
	cardSelected: {
		backgroundColor: colors.primary,
		borderColor: colors.brandOrange, // Use your accent color for selection border
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	body: {
		alignItems: "flex-start",
	},
	tableName: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
	},
	statusText: {
		fontSize: 15,
		fontWeight: "600",
		marginBottom: 4,
	},
	capacityText: {
		fontSize: 14,
		color: colors.textMedium,
	},
	textSelected: {
		color: colors.surfaceWhite,
	},
});

export default TableItem;
