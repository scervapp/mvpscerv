import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../../utils/styles/appStyles";

const PartyBasketGuide = ({ isHost }) => {
	return (
		<View style={styles.guideContainer}>
			<MaterialCommunityIcons
				name="basket-outline"
				size={60}
				color={colors.textLight}
			/>
			<Text style={styles.guideTitle}>Your Party Basket is Empty</Text>
			<Text style={styles.guideSubtitle}>
				Tap the{" "}
				<Ionicons name="add-circle" size={16} color={colors.brandOrange} />{" "}
				button below to add your first item to the order.
			</Text>

			<View style={styles.iconGuideSection}>
				<Text style={styles.iconGuideHeader}>Header Actions</Text>

				{/* Always show the Members icon explanation */}
				<View style={styles.iconGuideRow}>
					<Ionicons name="people-outline" size={24} color={colors.primary} />
					<Text style={styles.iconGuideText}>
						Tap to see who is currently in the party.
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
								As the host, tap here to generate an invite code and share it
								with friends.
							</Text>
						</View>
						<View style={styles.iconGuideRow}>
							<MaterialCommunityIcons
								name="location-enter"
								size={24}
								color={colors.primary}
							/>
							<Text style={styles.iconGuideText}>
								When you arrive at the restaurant, tap here to activate the
								check-in for your party.
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
	guideSubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 35,
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
