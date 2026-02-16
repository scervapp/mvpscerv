import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles"; // Adjust your path

const LanguageToggle = ({ style }) => {
	const { i18n } = useTranslation();

	const toggleLanguage = () => {
		console.log("Current Language:", i18n.language); // Check what it is currently
		const nextLanguage = i18n.language === "en" ? "es" : "en";
		console.log("Switching to:", nextLanguage); // Check what it is setting
		i18n.changeLanguage(nextLanguage);
	};

	return (
		<TouchableOpacity
			onPress={toggleLanguage}
			style={[styles.container, style]}
		>
			<Text style={styles.text}>
				{i18n.language === "en" ? "🇺🇸 EN" : "🇵🇦 ES"}
			</Text>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
		backgroundColor: "rgba(0,0,0,0.05)", // Subtle background
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	text: {
		fontSize: 14,
		fontWeight: "bold",
		color: colors.textDark,
	},
});

export default LanguageToggle;
