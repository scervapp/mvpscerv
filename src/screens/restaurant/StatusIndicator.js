import React from "react";
import { View, Text, StyleSheet } from "react-native";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
export const StatusIndicator = ({ isTestMode }) => {
	const { t } = useTranslation();
	const indicatorColor = isTestMode
		? colors.statusDanger
		: colors.statusSuccess;
	const labelText = isTestMode ? t("test_mode") : t("live_mode");

	return (
		<View style={styles.container}>
			<View style={[styles.light, { backgroundColor: indicatorColor }]} />
			<Text style={[styles.label, { color: indicatorColor }]}>{labelText}</Text>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 15,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
	},
	light: {
		width: 10,
		height: 10,
		borderRadius: 5,
		marginRight: 6,
	},
	label: {
		fontSize: 12,
		fontWeight: "600",
	},
});
