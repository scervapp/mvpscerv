import React from "react";
import { View, Text, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { IconButton } from "react-native-paper";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";
import formatCurrency from "../../utils/currencyFormatter";

const OrderItemCard = (props) => {
	const { t, i18n } = useTranslation();
	const {
		restaurantId,
		item,
		onQuantityChange,
		allowEdit = false,
		isSentToKitchen = false,
		isUpdating = false,
		liveTrackerStatus, // 🚨 NEW PROP
	} = props;

	const currentLang = i18n.language?.substring(0, 2) || "en";

	if (!item || !item.dishName) {
		return (
			<View style={styles.basketItemRow}>
				<Text style={styles.errorText}>{t("item_data_unavailable")}</Text>
			</View>
		);
	}

	const handleDecrement = () => {
		if (!allowEdit || isUpdating) return;
		const currentQuantity = item.quantity;
		if (currentQuantity === 1) {
			Alert.alert(
				t("confirm_remove_title"),
				t("confirm_remove_message", { dishName: item.dishName }),
				[
					{ text: t("cancel_button"), style: "cancel" },
					{
						text: t("remove_button"),
						onPress: () => onQuantityChange(item.id, 0),
						style: "destructive",
					},
				],
			);
		} else {
			onQuantityChange(item.id, currentQuantity - 1);
		}
	};

	const handleIncrement = () => {
		if (!allowEdit || isUpdating) return;
		onQuantityChange(item.id, item.quantity + 1);
	};

	const itemTotal =
		Math.round(
			(item.discount ? parseFloat(item.discountedPrice) : item?.price || 0) *
				100,
		) * item.quantity;

	const displayOrderedForName = item.orderedByPipName || item.pip?.name;

	// 🚨 REAL-TIME BADGE CONFIGURATOR
	const getStatusBadge = () => {
		const status = liveTrackerStatus || (isSentToKitchen ? "sent" : "new");

		switch (status) {
			case "preparing":
				return {
					text: t("preparing", "Preparing"),
					color: colors.statusWarning,
					bg: colors.statusWarning + "20",
					icon: "fire",
				};
			case "ready":
				return {
					text: t("ready", "Ready"),
					color: colors.statusSuccess,
					bg: colors.statusSuccess + "20",
					icon: "check-circle",
				};
			case "sent":
				return {
					text: t("sent", "Sent"),
					color: colors.textMedium,
					bg: colors.backgroundMedium,
					icon: "clock-outline",
				};
			default:
				return null; // Hide badge if "new" (still building cart)
		}
	};

	const badgeConfig = getStatusBadge();

	return (
		<View
			style={[
				styles.orderItemCard,
				isSentToKitchen && styles.sentItemCardVisual,
				isUpdating && styles.updatingItemVisual,
			]}
		>
			<View style={styles.itemContent}>
				<View style={styles.statusIconContainer}>
					{isSentToKitchen ? (
						<MaterialCommunityIcons
							name="check-circle"
							size={24}
							color={badgeConfig?.color || colors.statusSuccess}
						/>
					) : (
						<MaterialCommunityIcons
							name="circle-outline"
							size={24}
							color={colors.textLight}
						/>
					)}
				</View>

				<View style={styles.detailsContainer}>
					<Text
						style={[styles.dishName, isSentToKitchen && styles.sentItemText]}
					>
						{item.dishName}
					</Text>
					{displayOrderedForName && (
						<Text
							style={[
								styles.orderedForText,
								isSentToKitchen && styles.sentItemText,
							]}
						>
							{t("for", "For")}: {displayOrderedForName}
						</Text>
					)}
					{item.specialInstructions && (
						<Text
							style={[
								styles.specialInstructions,
								isSentToKitchen && styles.sentItemText,
							]}
						>
							{t("notes_label")}:{" "}
							{typeof item.specialInstructions === "object"
								? item.specialInstructions[currentLang] ||
									item.specialInstructions.original ||
									""
								: item.specialInstructions}
						</Text>
					)}

					{/* 🚨 THE NEW REAL-TIME STATUS BADGE */}
					{badgeConfig && (
						<View
							style={[styles.statusBadge, { backgroundColor: badgeConfig.bg }]}
						>
							<MaterialCommunityIcons
								name={badgeConfig.icon}
								size={14}
								color={badgeConfig.color}
								style={{ marginRight: 4 }}
							/>
							<Text
								style={[styles.statusBadgeText, { color: badgeConfig.color }]}
							>
								{badgeConfig.text}
							</Text>
						</View>
					)}
				</View>

				<View style={styles.controlsAndPriceContainer}>
					{isUpdating ? (
						<View style={styles.quantityControls}>
							<ActivityIndicator size="small" color={colors.primary} />
						</View>
					) : !isSentToKitchen && allowEdit ? (
						<View style={styles.quantityControls}>
							<IconButton
								icon="minus-circle"
								size={26}
								onPress={handleDecrement}
								style={styles.quantityButton}
								iconColor={colors.textMedium}
								disabled={isUpdating}
							/>
							<Text style={styles.quantityText}>{item.quantity}</Text>
							<IconButton
								icon="plus-circle"
								size={26}
								onPress={handleIncrement}
								style={styles.quantityButton}
								iconColor={colors.primary}
								disabled={isUpdating}
							/>
						</View>
					) : (
						<Text style={styles.quantityDisplayOnly}>
							{t("qty_label")}: {item.quantity}
						</Text>
					)}
					<Text
						style={[
							styles.itemPrice,
							isSentToKitchen && styles.sentItemPriceDimmed,
						]}
					>
						{formatCurrency(itemTotal)}
					</Text>
				</View>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	orderItemCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		paddingVertical: 10,
		paddingHorizontal: 12,
		marginVertical: 6,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 2.5,
		elevation: 2,
		borderWidth: 1,
		borderColor: colors.borderLight + "60",
	},
	sentItemCardVisual: {
		backgroundColor: colors.backgroundLight,
	},
	itemContent: {
		flexDirection: "row",
		alignItems: "center",
	},
	statusIconContainer: {
		marginRight: 10,
		alignItems: "center",
	},
	detailsContainer: {
		flex: 1,
		marginRight: 8,
	},
	dishName: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.textDark,
		marginBottom: 4,
	},
	orderedForText: {
		fontSize: 13,
		color: colors.textMedium,
		fontStyle: "italic",
		marginBottom: 4,
	},
	specialInstructions: {
		fontSize: 13,
		color: colors.textMedium,
		fontStyle: "italic",
	},
	// 🚨 NEW BADGE STYLES
	statusBadge: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		marginTop: 6,
	},
	statusBadgeText: {
		fontSize: 12,
		fontWeight: "bold",
	},
	controlsAndPriceContainer: {
		alignItems: "flex-end",
		minWidth: 90,
	},
	quantityControls: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5,
	},
	quantityButton: {
		margin: 0,
		width: 32,
		height: 32,
	},
	quantityText: {
		fontSize: 17,
		fontWeight: "bold",
		color: colors.textDark,
		minWidth: 24,
		textAlign: "center",
		marginHorizontal: 4,
	},
	quantityDisplayOnly: {
		fontSize: 15,
		color: colors.textMedium,
		fontWeight: "500",
		marginBottom: 5,
	},
	itemPrice: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
	},
	sentItemText: {
		color: colors.textMedium,
	},
	sentItemPriceDimmed: {
		color: colors.textMedium,
		fontWeight: "500",
	},
	errorText: {
		color: colors.statusDanger,
		padding: 10,
		fontSize: 14,
	},
});

export default OrderItemCard;
