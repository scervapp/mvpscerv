import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";

const TableItem = ({ item, onPress, isSelected, onLongPress }) => {
	const { t } = useTranslation();
	if (!item || !item.name || !item.status) {
		return null; // Render nothing to prevent the crash
	}

	// --- Determine table status and corresponding Pastel/Deep styles ---
	let statusText = t("unknown_status");
	let bgColor = colors.surfaceWhite;
	let textColor = colors.textDark;
	let borderColor = colors.borderLight;
	let iconName = "help-circle-outline";

	switch (item.status) {
		case "available":
			statusText = t("available_status");
			bgColor = "#D1FAE5"; // Pastel Mint Green
			textColor = "#065F46"; // Deep Emerald Text
			borderColor = "#6EE7B7";
			iconName = "checkmark-circle-outline";
			break;
		case "OCCUPIED":
		case "occupied":
			statusText = t("occupied_status");
			bgColor = "#FEE2E2"; // Pastel Rose Red
			textColor = "#991B1B"; // Deep Crimson Text
			borderColor = "#FCA5A5";
			iconName = "people";
			break;
		case "checkedOut":
			statusText = t("needs_cleaning_status");
			bgColor = "#FEF3C7"; // Pastel Lemon Yellow
			textColor = "#92400E"; // Deep Amber Text
			borderColor = "#FCD34D";
			iconName = "alert-circle-outline";
			break;
	}

	// Dynamic styles to handle the pastel theme OR the selected state
	const dynamicContainerStyle = {
		backgroundColor: isSelected ? colors.primary : bgColor,
		borderColor: isSelected ? colors.brandOrange : borderColor,
	};

	const dynamicTextStyle = {
		color: isSelected ? colors.surfaceWhite : textColor,
	};

	return (
		<TouchableOpacity
			style={[styles.cardContainer, dynamicContainerStyle]}
			onPress={() => onPress(item)}
			onLongPress={() => onLongPress(item)}
			activeOpacity={0.7}
		>
			<View style={styles.header}>
				<Text style={[styles.tableName, dynamicTextStyle]}>{item.name}</Text>
				<Ionicons
					name={iconName}
					size={24}
					color={isSelected ? colors.surfaceWhite : textColor}
				/>
			</View>

			<View style={styles.body}>
				<Text style={[styles.statusText, dynamicTextStyle]}>{statusText}</Text>
				{/* Adding slight opacity to capacity so it visually separates from the bold status */}
				<Text style={[styles.capacityText, dynamicTextStyle, { opacity: 0.8 }]}>
					{t("seats_label")}: {item.capacity}
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
		justifyContent: "space-between", // Space out header and body
		padding: 12,
		// Professional shadow
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 4,
		borderWidth: 2, // Border width is constant, color changes dynamically
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
	},
	statusText: {
		fontSize: 15,
		fontWeight: "700",
		marginBottom: 4,
	},
	capacityText: {
		fontSize: 14,
		fontWeight: "500",
	},
});

export default TableItem;
