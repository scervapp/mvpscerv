import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";

const RestaurantCard = ({ restaurant, onPress }) => {
	const { t } = useTranslation();
	const isComingSoon = restaurant.isComingSoon === true;
	const imageUri = restaurant.imageUri;
	const area = [
		restaurant.area || restaurant.neighborhood || restaurant.city,
		restaurant.state,
	]
		.filter(Boolean)
		.join(", ");
	const address = [restaurant.address, restaurant.city].filter(Boolean).join(", ");
	const isOpen = restaurant.isOpen === true || restaurant.openNow === true;
	const explicitlyClosed =
		restaurant.isOpen === false || restaurant.openNow === false;
	const statusLabel = isComingSoon
		? t("coming_soon")
		: isOpen
			? "Open"
			: explicitlyClosed
				? "Closed"
				: "Available";
	const statusStyle = isComingSoon
		? styles.statusSoon
		: isOpen
			? styles.statusOpen
			: explicitlyClosed
				? styles.statusClosed
				: styles.statusNeutral;

	return (
		<TouchableOpacity
			onPress={onPress}
			style={styles.card}
			disabled={isComingSoon}
			activeOpacity={0.78}
		>
			{imageUri ? (
				<Image source={{ uri: imageUri }} style={styles.thumbnail} />
			) : (
				<View style={styles.thumbnailPlaceholder}>
					<Ionicons name="restaurant-outline" size={28} color={colors.primary} />
				</View>
			)}
			{isComingSoon && (
				<View style={styles.overlay}>
					<Text style={styles.overlayText}>{t("coming_soon")}</Text>
				</View>
			)}
			<View style={styles.infoContainer}>
				<View style={styles.topRow}>
					<Text style={styles.name} numberOfLines={1}>
						{restaurant.restaurantName || restaurant.name || "Restaurant"}
					</Text>
					<View style={[styles.statusPill, statusStyle]}>
						<Text style={styles.statusText}>{statusLabel}</Text>
					</View>
				</View>

				<View style={styles.metaRow}>
					<Ionicons name="location-outline" size={14} color={colors.textMedium} />
					<Text style={styles.metaText} numberOfLines={1}>
						{area || address || "Nearby"}
					</Text>
				</View>

				{address ? (
					<Text style={styles.address} numberOfLines={1}>
						{address}
					</Text>
				) : null}

				<View style={styles.bottomRow}>
					{restaurant.cuisineType ? (
						<View style={styles.cuisinePill}>
							<Text style={styles.cuisineText} numberOfLines={1}>
								{restaurant.cuisineType}
							</Text>
						</View>
					) : null}
				</View>
			</View>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#E3EAEC",
		overflow: "hidden",
		elevation: 2,
		shadowColor: "#000000",
		shadowOpacity: 0.08,
		shadowRadius: 5,
		shadowOffset: { width: 0, height: 2 },
	},
	thumbnail: {
		width: 112,
		height: 116,
		backgroundColor: "#EAF5F5",
	},
	thumbnailPlaceholder: {
		width: 112,
		height: 116,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF5F5",
	},
	infoContainer: {
		flex: 1,
		padding: 12,
		justifyContent: "space-between",
		minHeight: 116,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 8,
	},
	name: {
		flex: 1,
		fontSize: 16,
		lineHeight: 20,
		fontWeight: "900",
		color: colors.textDark,
		letterSpacing: 0,
	},
	statusPill: {
		height: 24,
		paddingHorizontal: 8,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	statusOpen: { backgroundColor: "#DCFCE7" },
	statusClosed: { backgroundColor: "#FEE2E2" },
	statusSoon: { backgroundColor: "#FEF3C7" },
	statusNeutral: { backgroundColor: "#EAF5F5" },
	statusText: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.textDark,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: 7,
	},
	metaText: {
		flex: 1,
		fontSize: 13,
		fontWeight: "700",
		color: colors.textMedium,
	},
	address: {
		fontSize: 12,
		lineHeight: 17,
		color: colors.textMedium,
		marginTop: 3,
	},
	bottomRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		marginTop: 9,
	},
	cuisinePill: {
		flex: 1,
		alignSelf: "flex-start",
		paddingHorizontal: 9,
		height: 26,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F1F5F9",
	},
	cuisineText: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textDark,
	},
	overlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(255, 255, 255, 0.72)",
		justifyContent: "center",
		alignItems: "center",
	},
	overlayText: {
		fontSize: 18,
		fontWeight: "900",
		color: colors.textMedium,
		borderWidth: 2,
		borderColor: colors.textLight,
		paddingHorizontal: 15,
		paddingVertical: 8,
		borderRadius: 8,
		transform: [{ rotate: "-8deg" }],
	},
});

export default RestaurantCard;
