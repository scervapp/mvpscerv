import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../../utils/styles/appStyles";

const PartyBasketGuide = () => {
	const { t } = useTranslation();
	return (
		<View style={styles.guideContainer}>
			<MaterialCommunityIcons
				name="silverware-fork-knife"
				size={60}
				color={colors.primary}
			/>
			<Text style={styles.guideTitle}>
				{t("party_order_empty_title", "No items yet")}
			</Text>
			<Text style={styles.guideSubtitle}>
				{t(
					"party_order_empty_subtitle",
					"Add food or drinks when you are ready. If you are not seated yet, you can still build your order while you wait.",
				)}
			</Text>
		</View>
	);
};

const styles = StyleSheet.create({
	guideContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
		paddingBottom: 120,
	},
	guideTitle: {
		fontSize: 22,
		fontWeight: "800",
		color: colors.textDark,
		textAlign: "center",
		marginTop: 15,
		marginBottom: 8,
	},
	guideSubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		lineHeight: 24,
		maxWidth: 330,
	},
});

export default PartyBasketGuide;
