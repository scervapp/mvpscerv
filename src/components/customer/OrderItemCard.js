import React from "react";
import { View, Text, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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
		liveTrackerStatus,
		variant = "default",
	} = props;

	const isPickupVariant = variant === "pickup";
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

	const selectedModifiers = Array.isArray(item.selectedModifiers)
		? item.selectedModifiers
		: [];

	const getModifierDisplayName = (modifier) => {
		if (!modifier) return "";

		if (typeof modifier.name === "string") return modifier.name;

		if (modifier.name && typeof modifier.name === "object") {
			return (
				modifier.name[currentLang] ||
				modifier.name.en ||
				modifier.name.es ||
				modifier.name.original ||
				""
			);
		}

		return "";
	};

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
				return null;
		}
	};

	const badgeConfig = getStatusBadge();

	return (
		<View
			style={[
				styles.orderItemCard,
				isPickupVariant && styles.pickupOrderItemCard,
				isSentToKitchen && styles.sentItemCardVisual,
			]}
		>
			<View
				style={[
					styles.itemContent,
					isPickupVariant && styles.pickupItemContent,
				]}
			>
				{(!isPickupVariant || badgeConfig) && (
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
				)}

				<View
					style={[
						styles.detailsContainer,
						isPickupVariant && styles.pickupDetailsContainer,
					]}
				>
					<Text
						style={[
							styles.dishName,
							isPickupVariant && styles.pickupDishName,
							isSentToKitchen && styles.sentItemText,
						]}
					>
						{item.dishName}
					</Text>

					{!isPickupVariant && displayOrderedForName && (
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
								isPickupVariant && styles.pickupSpecialInstructions,
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
					{selectedModifiers.length > 0 && (
						<View style={styles.modifiersContainer}>
							{selectedModifiers.map((modifier, index) => {
								const modifierName = getModifierDisplayName(modifier);
								const modifierPrice = Number(modifier?.price || 0);

								return (
									<Text
										key={`${modifier.optionId || modifierName || "modifier"}-${index}`}
										style={[
											styles.modifierText,
											isSentToKitchen && styles.sentItemText,
										]}
									>
										• {modifierName}
										{modifierPrice > 0
											? ` (+$${modifierPrice.toFixed(2)})`
											: ""}
									</Text>
								);
							})}
						</View>
					)}

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

				<View
					style={[
						styles.controlsAndPriceContainer,
						isPickupVariant && styles.pickupControlsAndPriceContainer,
					]}
				>
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
							isPickupVariant && styles.pickupItemPrice,
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
	pickupOrderItemCard: {
		borderRadius: 0,
		paddingVertical: 14,
		paddingHorizontal: 0,
		marginVertical: 0,
		shadowOpacity: 0,
		shadowRadius: 0,
		elevation: 0,
		borderWidth: 0,
		backgroundColor: "transparent",
	},
	sentItemCardVisual: {
		backgroundColor: colors.backgroundLight,
	},
	itemContent: {
		flexDirection: "row",
		alignItems: "center",
	},
	pickupItemContent: {
		alignItems: "center",
	},
	statusIconContainer: {
		marginRight: 10,
		alignItems: "center",
		paddingTop: 2,
	},
	detailsContainer: {
		flex: 1,
		marginRight: 8,
	},
	pickupDetailsContainer: {
		marginRight: 10,
	},
	dishName: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.textDark,
		marginBottom: 4,
	},
	pickupDishName: {
		fontSize: 17,
		fontWeight: "700",
		marginBottom: 6,
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
	pickupSpecialInstructions: {
		fontStyle: "normal",
		lineHeight: 18,
	},
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
	pickupControlsAndPriceContainer: {
		minWidth: 110,
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
	pickupItemPrice: {
		fontSize: 17,
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
	modifiersContainer: {
		marginTop: 6,
	},
	modifierText: {
		fontSize: 13,
		color: colors.textMedium,
		lineHeight: 18,
		marginTop: 2,
	},
});

export default OrderItemCard;
