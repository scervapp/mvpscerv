import React, { useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	Alert,
	ActivityIndicator,
	Pressable,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { IconButton } from "react-native-paper";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";
import formatCurrency, {
	formatCurrencyFromDollars,
} from "../../utils/currencyFormatter";

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
		hideOrderedFor = false,
	} = props;

	const isPickupVariant = variant === "pickup";
	const isCompactVariant = variant === "compact";
	const currentLang = i18n.language?.substring(0, 2) || "en";
	const [isExpanded, setIsExpanded] = useState(false);

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

	const displaySpecialInstructions =
		typeof item.specialInstructions === "object"
			? item.specialInstructions[currentLang] ||
				item.specialInstructions.original ||
				""
			: String(item.specialInstructions || "").trim();

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
			case "served":
			case "delivered":
			case "completed":
				return {
					text: t("delivered_to_table", "Delivered"),
					color: colors.statusSuccess,
					bg: colors.statusSuccess + "20",
					icon: "check-circle",
					step: 3,
				};
			case "ready":
			case "on_the_way":
				return {
					text: t("order_on_the_way", "On the way"),
					color: colors.statusSuccess,
					bg: colors.statusSuccess + "20",
					icon: "silverware-fork-knife",
					step: 3,
				};
			case "preparing":
				return {
					text: t("order_being_prepared", "Being prepared"),
					color: colors.statusWarning,
					bg: colors.statusWarning + "20",
					icon: "fire",
					step: 2,
				};
			case "fired":
			case "sent":
				return {
					text: t("order_received", "Order received"),
					color: colors.primary,
					bg: colors.primary + "15",
					icon: "clock-outline",
					step: 1,
				};
			default:
				return null;
		}
	};

	const badgeConfig = getStatusBadge();
	const compactTrackerSteps = [
		t("order_received_short", "Received"),
		t("order_preparing_short", "Preparing"),
		t("order_on_the_way_short", "On the way"),
	];
	const isDetailsExpanded = isCompactVariant && isExpanded;
	const hasExpandableDetails =
		isCompactVariant &&
		(Boolean(displaySpecialInstructions) ||
			selectedModifiers.length > 0 ||
			String(item.dishName || "").length > 24);
	const DetailsShell = hasExpandableDetails ? Pressable : View;

	return (
		<View
			style={[
				styles.orderItemCard,
				isPickupVariant && styles.pickupOrderItemCard,
				isCompactVariant && styles.compactOrderItemCard,
				isDetailsExpanded && styles.compactOrderItemCardExpanded,
				isSentToKitchen && styles.sentItemCardVisual,
			]}
		>
			<View
				style={[
					styles.itemContent,
					isPickupVariant && styles.pickupItemContent,
					isCompactVariant && styles.compactItemContent,
					isDetailsExpanded && styles.compactItemContentExpanded,
				]}
			>
				{(!isPickupVariant || badgeConfig) && (
					<View
						style={[
							styles.statusIconContainer,
							isCompactVariant && styles.compactStatusIconContainer,
						]}
					>
						{isSentToKitchen ? (
							<MaterialCommunityIcons
								name={badgeConfig?.icon || "check-circle"}
								size={isCompactVariant ? 18 : 24}
								color={badgeConfig?.color || colors.statusSuccess}
							/>
						) : (
							<MaterialCommunityIcons
								name="circle-outline"
								size={isCompactVariant ? 18 : 24}
								color={colors.textLight}
							/>
					)}
					</View>
				)}

				<DetailsShell
					style={[
						styles.detailsContainer,
						isPickupVariant && styles.pickupDetailsContainer,
						isCompactVariant && styles.compactDetailsContainer,
					]}
					onPress={
						hasExpandableDetails
							? () => setIsExpanded((currentValue) => !currentValue)
							: undefined
					}
					accessibilityRole={hasExpandableDetails ? "button" : undefined}
					accessibilityLabel={
						hasExpandableDetails
							? t("view_item_details", "View item details")
							: undefined
					}
				>
					<Text
						style={[
							styles.dishName,
							isPickupVariant && styles.pickupDishName,
							isCompactVariant && styles.compactDishName,
							isSentToKitchen && styles.sentItemText,
						]}
						numberOfLines={isCompactVariant && !isDetailsExpanded ? 1 : undefined}
					>
						{item.dishName}
					</Text>

					{!isPickupVariant &&
						!isCompactVariant &&
						!hideOrderedFor &&
						displayOrderedForName && (
						<Text
							style={[
								styles.orderedForText,
								isSentToKitchen && styles.sentItemText,
							]}
						>
							{t("for", "For")}: {displayOrderedForName}
						</Text>
					)}

					{(!isCompactVariant || isDetailsExpanded) &&
						Boolean(displaySpecialInstructions) && (
						<Text
							style={[
								styles.specialInstructions,
								isPickupVariant && styles.pickupSpecialInstructions,
								isSentToKitchen && styles.sentItemText,
							]}
						>
							{t("notes_label")}:{" "}
							{displaySpecialInstructions}
							</Text>
						)}
					{(!isCompactVariant || isDetailsExpanded) &&
						selectedModifiers.length > 0 && (
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
											? ` (+${formatCurrencyFromDollars(modifierPrice)})`
											: ""}
									</Text>
								);
							})}
						</View>
					)}

					{badgeConfig && !isPickupVariant && (
						<View
							style={[
								styles.statusBadge,
								isCompactVariant && styles.compactStatusBadge,
								{ backgroundColor: badgeConfig.bg },
							]}
						>
							<MaterialCommunityIcons
								name={badgeConfig.icon}
								size={isCompactVariant ? 12 : 14}
								color={badgeConfig.color}
								style={{ marginRight: 4 }}
							/>
							<Text
								style={[
									styles.statusBadgeText,
									isCompactVariant && styles.compactStatusBadgeText,
									{ color: badgeConfig.color },
								]}
							>
								{badgeConfig.text}
							</Text>
						</View>
					)}

					{badgeConfig && isCompactVariant && (
						<View style={styles.compactProgressRail}>
							{compactTrackerSteps.map((stepLabel, index) => {
								const stepNumber = index + 1;
								const isComplete = badgeConfig.step >= stepNumber;

								return (
									<View key={stepLabel} style={styles.compactProgressStep}>
										<View
											style={[
												styles.compactProgressDot,
												{
													backgroundColor: isComplete
														? badgeConfig.color
														: colors.borderLight,
												},
											]}
										/>
										<Text
											style={[
												styles.compactProgressLabel,
												isComplete && {
													color: badgeConfig.color,
													fontWeight: "700",
												},
											]}
											numberOfLines={1}
										>
											{stepLabel}
										</Text>
									</View>
								);
							})}
						</View>
					)}

					{hasExpandableDetails && (
						<View style={styles.compactDetailsHint}>
							<Text style={styles.compactDetailsHintText}>
								{isDetailsExpanded
									? t("hide_details", "Hide details")
									: t("view_details", "View details")}
							</Text>
							<MaterialCommunityIcons
								name={isDetailsExpanded ? "chevron-up" : "chevron-down"}
								size={14}
								color={colors.primary}
							/>
						</View>
					)}
				</DetailsShell>

				<View
					style={[
						styles.controlsAndPriceContainer,
						isPickupVariant && styles.pickupControlsAndPriceContainer,
						isCompactVariant && styles.compactControlsAndPriceContainer,
					]}
				>
					{isUpdating ? (
						<View style={styles.quantityControls}>
							<ActivityIndicator size="small" color={colors.primary} />
						</View>
					) : !isSentToKitchen && allowEdit ? (
						<View
							style={[
								styles.quantityControls,
								isCompactVariant && styles.compactQuantityControls,
							]}
						>
							<IconButton
								icon="minus-circle"
								size={isCompactVariant ? 22 : 26}
								onPress={handleDecrement}
								style={[
									styles.quantityButton,
									isCompactVariant && styles.compactQuantityButton,
								]}
								iconColor={colors.textMedium}
								disabled={isUpdating}
							/>
							<Text
								style={[
									styles.quantityText,
									isCompactVariant && styles.compactQuantityText,
								]}
							>
								{item.quantity}
							</Text>
							<IconButton
								icon="plus-circle"
								size={isCompactVariant ? 22 : 26}
								onPress={handleIncrement}
								style={[
									styles.quantityButton,
									isCompactVariant && styles.compactQuantityButton,
								]}
								iconColor={colors.primary}
								disabled={isUpdating}
							/>
						</View>
					) : (
						<Text
							style={[
								styles.quantityDisplayOnly,
								isCompactVariant && styles.compactQuantityDisplayOnly,
							]}
						>
							{isCompactVariant ? `x${item.quantity}` : `${t("qty_label")}: ${item.quantity}`}
						</Text>
					)}

					<Text
						style={[
							styles.itemPrice,
							isPickupVariant && styles.pickupItemPrice,
							isCompactVariant && styles.compactItemPrice,
							isSentToKitchen && styles.sentItemPriceDimmed,
						]}
						numberOfLines={1}
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
	compactOrderItemCard: {
		backgroundColor: "transparent",
		borderRadius: 0,
		paddingVertical: 6,
		paddingHorizontal: 0,
		marginVertical: 0,
		shadowOpacity: 0,
		shadowRadius: 0,
		elevation: 0,
		borderWidth: 0,
	},
	compactOrderItemCardExpanded: {
		paddingVertical: 8,
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
	compactItemContent: {
		alignItems: "center",
	},
	compactItemContentExpanded: {
		alignItems: "flex-start",
	},
	statusIconContainer: {
		marginRight: 10,
		alignItems: "center",
		paddingTop: 2,
	},
	compactStatusIconContainer: {
		marginRight: 6,
		paddingTop: 0,
	},
	detailsContainer: {
		flex: 1,
		marginRight: 8,
	},
	pickupDetailsContainer: {
		marginRight: 10,
	},
	compactDetailsContainer: {
		marginRight: 6,
		minWidth: 0,
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
	compactDishName: {
		fontSize: 14,
		fontWeight: "600",
		marginBottom: 0,
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
	compactStatusBadge: {
		marginTop: 4,
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: 8,
	},
	compactStatusBadgeText: {
		fontSize: 10,
	},
	compactProgressRail: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 5,
		gap: 6,
	},
	compactProgressStep: {
		flexDirection: "row",
		alignItems: "center",
		maxWidth: 72,
	},
	compactProgressDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		marginRight: 3,
	},
	compactProgressLabel: {
		fontSize: 9,
		color: colors.textLight,
	},
	compactDetailsHint: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		marginTop: 4,
	},
	compactDetailsHintText: {
		color: colors.primary,
		fontSize: 11,
		fontWeight: "800",
		marginRight: 2,
	},
	controlsAndPriceContainer: {
		alignItems: "flex-end",
		minWidth: 90,
	},
	pickupControlsAndPriceContainer: {
		minWidth: 110,
	},
	compactControlsAndPriceContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		minWidth: 112,
	},
	quantityControls: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5,
	},
	compactQuantityControls: {
		marginBottom: 0,
		marginRight: 6,
	},
	quantityButton: {
		margin: 0,
		width: 32,
		height: 32,
	},
	compactQuantityButton: {
		width: 24,
		height: 24,
	},
	quantityText: {
		fontSize: 17,
		fontWeight: "bold",
		color: colors.textDark,
		minWidth: 24,
		textAlign: "center",
		marginHorizontal: 4,
	},
	compactQuantityText: {
		fontSize: 14,
		minWidth: 18,
		marginHorizontal: 0,
	},
	quantityDisplayOnly: {
		fontSize: 15,
		color: colors.textMedium,
		fontWeight: "500",
		marginBottom: 5,
	},
	compactQuantityDisplayOnly: {
		fontSize: 13,
		marginBottom: 0,
		marginRight: 8,
	},
	itemPrice: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
	},
	pickupItemPrice: {
		fontSize: 17,
	},
	compactItemPrice: {
		fontSize: 14,
		minWidth: 58,
		textAlign: "right",
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
