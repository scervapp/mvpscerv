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

	const isInactive = item.isActive === false;
	const section = item.section || item.area || t("main_dining", "Main Dining");
	const tableType =
		item.tableType &&
		t(`table_type_${item.tableType}`, item.tableType.replace(/([A-Z])/g, " $1"));

	// Status colors are intentionally high-contrast so floor staff can scan tables quickly.
	let statusText = isInactive ? t("inactive", "Inactive") : t("unknown_status");
	let bgColor = colors.surfaceWhite;
	let textColor = colors.textDark;
	let borderColor = colors.borderLight;
	let iconName = isInactive ? "pause-circle-outline" : "help-circle-outline";

	if (isInactive) {
		bgColor = colors.backgroundMedium;
		textColor = colors.textMedium;
		borderColor = colors.borderLight;
	} else {
		switch (item.status) {
			case "available":
				statusText = t("available_status");
				bgColor = "#D1FAE5";
				textColor = "#065F46";
				borderColor = "#6EE7B7";
				iconName = "checkmark-circle-outline";
				break;
			case "OCCUPIED":
			case "occupied":
				statusText = t("occupied_status");
				bgColor = "#FEE2E2";
				textColor = "#991B1B";
				borderColor = "#FCA5A5";
				iconName = "people";
				break;
			case "checkedOut":
				statusText = t("needs_cleaning_status");
				bgColor = "#FEF3C7";
				textColor = "#92400E";
				borderColor = "#FCD34D";
				iconName = "alert-circle-outline";
				break;
		}
	}

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
				<Text style={[styles.metaText, dynamicTextStyle]} numberOfLines={1}>
					{section}
					{tableType ? ` - ${tableType}` : ""}
				</Text>
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
		height: 126,
		borderRadius: 8,
		justifyContent: "space-between",
		padding: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 4,
		borderWidth: 2,
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
		marginBottom: 3,
	},
	metaText: {
		fontSize: 12,
		fontWeight: "700",
		marginBottom: 3,
	},
	capacityText: {
		fontSize: 14,
		fontWeight: "500",
	},
});

export default TableItem;
