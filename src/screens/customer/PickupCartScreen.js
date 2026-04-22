// screens/customer/PickupCartScreen.js
import React, { useContext, useMemo, useState, useCallback } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	FlatList,
	TouchableOpacity,
	ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import colors from "../../utils/styles/appStyles";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import OrderItemCard from "../../components/customer/OrderItemCard";
import formatCurrency from "../../utils/currencyFormatter";

const PickupCartScreen = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const route = useRoute();
	const { currentUserData } = useContext(AuthContext);

	const {
		sharedBaskets,
		handlePartyItemQuantityChange,
		partyDetails,
		isLoadingParty,
		isLoadingBasket,
	} = useParty();

	const currentPartyId = route.params?.partyId || null;
	const currentParty = currentPartyId
		? partyDetails?.[currentPartyId] || null
		: null;
	const isPickupMode = currentParty?.orderMode === "pickup";

	const [updatingItemId, setUpdatingItemId] = useState(null);

	const myItems = useMemo(() => {
		if (!sharedBaskets || !currentPartyId || !currentUserData?.uid) return [];

		const rawBasket = sharedBaskets[currentPartyId] || {};
		const items = rawBasket.items || [];

		return items.filter(
			(item) =>
				item.addedByUserId === currentUserData.uid ||
				item.orderedByUserId === currentUserData.uid,
		);
	}, [sharedBaskets, currentPartyId, currentUserData?.uid]);

	const subtotal = useMemo(() => {
		return myItems.reduce((total, item) => {
			const itemPrice =
				item.discountedPrice !== null && item.discountedPrice !== undefined
					? item.discountedPrice
					: item.price || 0;

			return total + itemPrice * (item.quantity || 1);
		}, 0);
	}, [myItems]);

	const onQuantityChange = useCallback(
		async (itemId, newQuantity) => {
			if (!currentPartyId || !currentUserData?.uid) return;

			setUpdatingItemId(itemId);
			try {
				await handlePartyItemQuantityChange(
					currentPartyId,
					itemId,
					newQuantity,
					currentUserData.uid,
				);
			} catch (error) {
				console.error("PickupCartScreen: Item Update Error", error);
			} finally {
				setUpdatingItemId(null);
			}
		},
		[currentPartyId, currentUserData?.uid, handlePartyItemQuantityChange],
	);

	const handleGoBack = () => {
		navigation.goBack();
	};

	const handleGoToCheckout = () => {
		if (!currentPartyId) return;

		navigation.navigate("PartyCheckout", {
			partyId: currentPartyId,
		});
	};

	const isInitialLoading =
		(isLoadingParty || isLoadingBasket) && !currentParty && !myItems.length;

	if (isInitialLoading) {
		return (
			<SafeAreaView style={styles.screen}>
				<View style={styles.centeredState}>
					<ActivityIndicator size="large" color={colors.primary} />
					<Text style={styles.stateText}>
						{t("loading_pickup_order", "Loading pickup order")}...
					</Text>
				</View>
			</SafeAreaView>
		);
	}

	if (!currentPartyId) {
		return (
			<SafeAreaView style={styles.screen}>
				<View style={styles.centeredState}>
					<MaterialCommunityIcons
						name="alert-circle-outline"
						size={60}
						color={colors.statusDanger}
					/>
					<Text style={styles.stateTitle}>{t("error", "Error")}</Text>
					<Text style={styles.stateText}>
						{t("pickup_order_not_found", "Pickup order not found.")}
					</Text>
					<TouchableOpacity style={styles.returnButton} onPress={handleGoBack}>
						<Text style={styles.returnButtonText}>
							{t("go_back_button", "Go Back")}
						</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		);
	}

	// Prevent accidentally using this screen for a dine-in party
	if (currentParty && !isPickupMode) {
		return (
			<SafeAreaView style={styles.screen}>
				<View style={styles.centeredState}>
					<MaterialCommunityIcons
						name="silverware-fork-knife"
						size={60}
						color={colors.textMedium}
					/>
					<Text style={styles.stateTitle}>
						{t("wrong_order_type", "Wrong Order Type")}
					</Text>
					<Text style={styles.stateText}>
						{t(
							"this_cart_is_only_for_pickup_orders",
							"This cart is only for pickup orders.",
						)}
					</Text>
					<TouchableOpacity
						style={styles.returnButton}
						onPress={() =>
							navigation.replace("PartySession", { partyId: currentPartyId })
						}
					>
						<Text style={styles.returnButtonText}>
							{t("view_your_order", "View Order")}
						</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.screen}>
			<View style={styles.headerBar}>
				<TouchableOpacity
					onPress={handleGoBack}
					style={styles.backButton}
					activeOpacity={0.8}
				>
					<Ionicons name="arrow-back" size={22} color={colors.textDark} />
				</TouchableOpacity>

				<View style={styles.headerTextWrap}>
					<Text style={styles.headerTitle}>
						{t("pickup_order", "Pickup Order")}
					</Text>
					<Text style={styles.headerSubtitle}>
						{t("review_your_items", "Review your items before checkout")}
					</Text>
				</View>

				<View style={styles.headerRightSpacer} />
			</View>

			{myItems.length > 0 && (
				<View style={styles.summaryCard}>
					<View style={styles.summaryTopRow}>
						<View>
							<Text style={styles.summaryEyebrow}>
								{t("your_cart", "Your Cart")}
							</Text>
							<Text style={styles.summaryCount}>
								{myItems.length}{" "}
								{myItems.length === 1 ? t("item", "item") : t("items", "items")}
							</Text>
						</View>

						<View style={styles.summaryAmountWrap}>
							<Text style={styles.summaryAmountLabel}>
								{t("subtotal", "Subtotal")}
							</Text>
							<Text style={styles.summaryAmount}>
								{formatCurrency(subtotal * 100)}
							</Text>
						</View>
					</View>
				</View>
			)}

			<View style={styles.cartListContainer}>
				<FlatList
					data={myItems}
					keyExtractor={(item, index) =>
						item.basketItemId || item.id || `basket-item-${index}`
					}
					contentContainerStyle={[
						styles.listContent,
						myItems.length === 0 && styles.emptyListContent,
					]}
					showsVerticalScrollIndicator={false}
					ListEmptyComponent={
						<View style={styles.emptyContainer}>
							<View style={styles.emptyIconWrap}>
								<MaterialCommunityIcons
									name="shopping-outline"
									size={38}
									color={colors.textLight}
								/>
							</View>

							<Text style={styles.emptyTitle}>
								{t("your_cart_is_empty", "Your cart is empty.")}
							</Text>
							<Text style={styles.emptySubtitle}>
								{t(
									"add_items_to_continue_pickup",
									"Add items to continue your pickup order.",
								)}
							</Text>

							<TouchableOpacity
								style={styles.emptyPrimaryButton}
								onPress={() =>
									navigation.navigate("PartyMenu", {
										partyId: currentPartyId,
										restaurantId:
											currentParty?.restaurantId || route.params?.restaurantId,
									})
								}
								activeOpacity={0.85}
							>
								<Text style={styles.emptyPrimaryButtonText}>
									{t("add_items", "Add Items")}
								</Text>
							</TouchableOpacity>
						</View>
					}
					renderItem={({ item }) => (
						<OrderItemCard
							item={item}
							onQuantityChange={onQuantityChange}
							allowEdit={true}
							isUpdating={updatingItemId === item.id}
							variant="pickup"
						/>
					)}
					ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
				/>
			</View>

			{myItems.length > 0 && (
				<View style={styles.bottomSheetBar}>
					<View style={styles.totalRow}>
						<View>
							<Text style={styles.totalLabel}>{t("subtotal", "Subtotal")}</Text>
							<Text style={styles.totalHelper}>
								{t(
									"tax_and_fees_at_checkout",
									"Tax and fees shown at checkout",
								)}
							</Text>
						</View>

						<Text style={styles.totalAmount}>
							{formatCurrency(subtotal * 100)}
						</Text>
					</View>

					<View style={styles.actionRow}>
						<TouchableOpacity
							style={styles.secondaryButton}
							onPress={() =>
								navigation.navigate("PartyMenu", {
									partyId: currentPartyId,
									restaurantId:
										currentParty?.restaurantId || route.params?.restaurantId,
								})
							}
							activeOpacity={0.85}
						>
							<Text style={styles.secondaryButtonText}>
								+ {t("add_more", "Add More")}
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							style={styles.primaryButton}
							onPress={handleGoToCheckout}
							activeOpacity={0.85}
						>
							<Text style={styles.primaryButtonText}>
								{t("checkout", "Checkout")}
							</Text>
							<Ionicons
								name="arrow-forward"
								size={18}
								color="#FFF"
								style={{ marginLeft: 8 }}
							/>
						</TouchableOpacity>
					</View>
				</View>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
	},

	headerBar: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingTop: 12,
		paddingBottom: 14,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},

	backButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},

	headerTextWrap: {
		flex: 1,
		marginLeft: 12,
	},

	headerTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: colors.textDark,
	},

	headerSubtitle: {
		marginTop: 2,
		fontSize: 13,
		color: colors.textMedium,
	},

	headerRightSpacer: {
		width: 36,
	},

	summaryCard: {
		marginHorizontal: 16,
		marginTop: 16,
		padding: 16,
		borderRadius: 16,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},

	summaryTopRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},

	summaryEyebrow: {
		fontSize: 12,
		fontWeight: "600",
		color: colors.textMedium,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},

	summaryCount: {
		marginTop: 4,
		fontSize: 18,
		fontWeight: "700",
		color: colors.textDark,
	},

	summaryAmountWrap: {
		alignItems: "flex-end",
	},

	summaryAmountLabel: {
		fontSize: 12,
		color: colors.textMedium,
	},

	summaryAmount: {
		marginTop: 4,
		fontSize: 20,
		fontWeight: "800",
		color: colors.textDark,
	},

	listContent: {
		paddingHorizontal: 16,
		paddingVertical: 4,
	},

	emptyListContent: {
		flexGrow: 1,
		justifyContent: "center",
	},

	cartCard: {
		borderRadius: 16,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		overflow: "hidden",
	},

	cartCardInner: {
		paddingHorizontal: 12,
		paddingVertical: 10,
	},

	cardSpacer: {
		height: 12,
	},

	emptyContainer: {
		alignItems: "center",
		paddingHorizontal: 24,
	},

	emptyIconWrap: {
		width: 72,
		height: 72,
		borderRadius: 36,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},

	emptyTitle: {
		marginTop: 18,
		fontSize: 20,
		fontWeight: "700",
		color: colors.textDark,
		textAlign: "center",
	},

	emptySubtitle: {
		marginTop: 8,
		fontSize: 15,
		color: colors.textMedium,
		textAlign: "center",
		lineHeight: 21,
	},

	emptyPrimaryButton: {
		marginTop: 20,
		paddingHorizontal: 22,
		paddingVertical: 12,
		borderRadius: 12,
		backgroundColor: colors.primary,
	},

	emptyPrimaryButtonText: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "700",
	},

	bottomSheetBar: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 28,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.08,
		shadowRadius: 8,
		elevation: 12,
	},

	totalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 14,
	},

	totalLabel: {
		fontSize: 16,
		fontWeight: "700",
		color: colors.textDark,
	},

	totalHelper: {
		marginTop: 4,
		fontSize: 12,
		color: colors.textMedium,
	},

	totalAmount: {
		fontSize: 22,
		fontWeight: "800",
		color: colors.textDark,
	},

	actionRow: {
		flexDirection: "row",
		gap: 12,
	},

	secondaryButton: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 14,
		borderRadius: 14,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},

	secondaryButtonText: {
		color: colors.textDark,
		fontSize: 15,
		fontWeight: "600",
	},

	primaryButton: {
		flex: 1.5,
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 14,
		borderRadius: 14,
		backgroundColor: colors.primary,
	},

	primaryButtonText: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "700",
	},
	cartListContainer: {
		marginHorizontal: 16,
		marginTop: 16,
		marginBottom: 150,
		borderRadius: 18,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		overflow: "hidden",
	},
	rowDivider: {
		height: 1,
		backgroundColor: colors.borderLight,
	},
});

export default PickupCartScreen;
