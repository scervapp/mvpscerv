import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from 'react-i18next';
import { Ionicons } from "@expo/vector-icons";
import colors from "../../../utils/styles/appStyles";

const PartyLobbyHeaderContent = ({
	partyDetails,
	partyStatus,
	partyError,
	isHost,
}) => {
	const { t } = useTranslation();
	if (!partyDetails) {
		return null; // Or a loading/error state specific to header
	}

	return (
		<>
			<Text style={styles.title}>{t('party_lobby_title')}</Text>
			<Text style={styles.restaurantName}>
				{partyDetails?.restaurantName || t('loading_restaurant_message')}
			</Text>
			<Text style={styles.statusText}>
				{t('status_label')}:{" "}
				<Text
					style={[
						styles.statusValue,
						styles[`status_${partyStatus || "unknown"}`],
					]}
				>
					{(partyStatus || t('unknown_status_text')).toUpperCase()}
				</Text>
			</Text>
			{partyError && <Text style={styles.inlineErrorText}>{partyError}</Text>}

			<View style={styles.hostSection}>
				<Text style={styles.sectionTitle}>{t('host_label')}</Text>
				<View style={styles.guestItem}>
					<Ionicons name="person-circle" size={24} color={colors.primary} />
					<Text style={styles.guestName}>
						{partyDetails?.hostName || t('host_name_fallback')} {isHost ? t('you_label') : ""}
					</Text>
				</View>
			</View>
			<Text style={styles.sectionTitle}>
				{t('guests_label', { count: partyDetails?.guestPips?.length || 0 })}
			</Text>
		</>
	);
};

const styles = StyleSheet.create({
	title: {
		fontSize: 24,
		fontWeight: "bold",
		textAlign: "center",
		marginBottom: 10,
		color: colors.textDark,
	},
	restaurantName: {
		fontSize: 18,
		fontWeight: "500",
		textAlign: "center",
		marginBottom: 15,
		color: colors.text,
	},
	statusText: {
		fontSize: 16,
		textAlign: "center",
		marginBottom: 20,
		color: colors.textLight,
	},
	statusValue: { fontWeight: "bold", color: colors.textDark },
	status_pending: { color: colors.warning || "#ffc107" },
	status_active: { color: colors.success || "green" },
	status_completed: { color: colors.textLight || "gray" },
	status_cancelled: { color: colors.danger || "red" },
	inlineErrorText: {
		color: colors.danger || "red",
		textAlign: "center",
		marginVertical: 10,
	},
	hostSection: { marginBottom: 20 },
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
		color: colors.primary,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
		paddingBottom: 5,
	},
	guestItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
		backgroundColor: "#fff",
		borderRadius: 5,
		marginBottom: 5,
		paddingHorizontal: 10,
	},
	guestName: { marginLeft: 10, fontSize: 16, color: colors.textDark },
});

export default PartyLobbyHeaderContent;
