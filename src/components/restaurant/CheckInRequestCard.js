import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import moment from "moment";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";

// --- Reusable Check-In Card Component ---
const CheckInRequestCard = ({ item, onSelect }) => {
	const formatTime = (timestamp) => {
		if (!timestamp?.toDate) return "Just now"; // Guard against invalid timestamp
		const now = moment();
		const then = moment(timestamp.toDate());
		const diffMinutes = now.diff(then, "minutes");

		if (diffMinutes < 1) return "Just now";
		if (diffMinutes < 60) return `${diffMinutes}m ago`;
		return then.format("h:mm A");
	};

	const isParty = item.type === "party";

	return (
		<View style={styles.cardContainer}>
			<View style={styles.cardHeader}>
				<View style={styles.headerLeft}>
					<Ionicons
						name={isParty ? "people-circle" : "person-circle"}
						size={22}
						color={colors.textMedium}
					/>
					<Text style={styles.partySizeText}>
						Party of {item.numberOfPeople}
					</Text>
				</View>
				<Text style={styles.checkInTime}>{formatTime(item.timestamp)}</Text>
			</View>

			<View style={styles.cardBody}>
				<Text style={styles.customerName}>{item.customerName}</Text>
				{isParty && (
					<View style={styles.partyBadge}>
						<Text style={styles.partyBadgeText}>PARTY</Text>
					</View>
				)}
			</View>

			<View style={styles.cardFooter}>
				<TouchableOpacity
					style={styles.seatButton}
					onPress={() => onSelect(item)}
				>
					<Text style={styles.seatButtonText}>Seat Party</Text>
					<Ionicons
						name="arrow-forward-circle"
						size={22}
						color={colors.surfaceWhite}
					/>
				</TouchableOpacity>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	cardContainer: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		marginBottom: 15,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	cardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
		paddingBottom: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	headerLeft: {
		flexDirection: "row",
		alignItems: "center",
	},
	partySizeText: {
		fontSize: 16,
		fontWeight: "500",
		color: colors.textMedium,
		marginLeft: 8,
	},
	checkInTime: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.textMedium,
	},
	cardBody: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 15,
	},
	customerName: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		flex: 1,
	},
	partyBadge: {
		backgroundColor: colors.primary + "20",
		borderRadius: 5,
		paddingHorizontal: 8,
		paddingVertical: 4,
		marginLeft: 10,
	},
	partyBadgeText: {
		color: colors.primary,
		fontWeight: "bold",
		fontSize: 12,
	},
	cardFooter: {
		alignItems: "flex-end",
	},
	seatButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary,
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
	},
	seatButtonText: {
		color: colors.textOnPrimaryBrand,
		fontSize: 16,
		fontWeight: "bold",
		marginRight: 8,
	},
});

export default CheckInRequestCard;
