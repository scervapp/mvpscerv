import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from 'react-i18next';
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../../utils/styles/appStyles";

const PartyBasketGuide = ({ isHost }) => {
	const { t } = useTranslation();
	return (
		<View style={styles.guideContainer}>
			<MaterialCommunityIcons
				name="basket-outline"
				size={60}
				color={colors.textLight}
			/>
			<Text style={styles.guideTitle}>{t('your_party_basket_is_empty_title')}</Text>
			<View style={styles.subtitleContainer}>
				<Text style={styles.guideSubtitle}>{t('tap_the_text')} </Text>
				<Ionicons name="add-circle" size={16} color={colors.brandOrange} />
				<Text style={styles.guideSubtitle}>
					{t('button_below_to_add_first_item_text')} 
				</Text>
			</View>

			<View style={styles.iconGuideSection}>
				<Text style={styles.iconGuideHeader}>{t('header_actions_title')}</Text>

				{/* Always show the Members icon explanation */}
				<View style={styles.iconGuideRow}>
					<Ionicons name="people-outline" size={24} color={colors.primary} />
					<Text style={styles.iconGuideText}>
						{t('members_icon_description')}
					</Text>
				</View>

				{/* Conditionally show Host-specific icon explanations */}
				{isHost && (
					<>
						<View style={styles.iconGuideRow}>
							<Ionicons
								name="person-add-outline"
								size={24}
								color={colors.primary}
							/>
							<Text style={styles.iconGuideText}>
								{t('host_invite_icon_description')}
							</Text>
						</View>
						<View style={styles.iconGuideRow}>
							<MaterialCommunityIcons
								name="location-enter"
								size={24}
								color={colors.primary}
							/>
							<Text style={styles.iconGuideText}>
								{t('host_activate_check_in_icon_description')}
							</Text>
						</View>
					</>
				)}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	guideContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
		paddingBottom: 60,
	},
	guideTitle: {
		fontSize: 22,
		fontWeight: "600",
		color: colors.textDark,
		textAlign: "center",
		marginTop: 15,
		marginBottom: 8,
	},
	subtitleContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		flexWrap: "wrap",
		marginBottom: 35,
		paddingHorizontal: 20,
	},
	guideSubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		lineHeight: 24,
	},
	iconGuideSection: {
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		width: "100%",
		paddingTop: 20,
	},
	iconGuideHeader: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 20,
		textAlign: "center",
	},
	iconGuideRow: {
		flexDirection: "row",
		alignItems: "flex-start", // Align icon with the top of the text
		width: "100%",
		marginBottom: 15,
		paddingHorizontal: 10,
	},
	iconGuideText: {
		flex: 1,
		marginLeft: 15,
		fontSize: 15,
		color: colors.textMedium,
		lineHeight: 22,
	},
});

export default PartyBasketGuide;
