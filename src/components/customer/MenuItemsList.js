import React, { useContext, useEffect, useMemo, useState } from "react";
import {
	View,
	Text,
	ActivityIndicator,
	StyleSheet,
	Image,
	TouchableOpacity,
	Modal,
	Alert,
	SectionList,
	TextInput,
	ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useBasket } from "../../context/customer/BasketContext";
import { Button, Snackbar } from "react-native-paper";
import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";
import SelectedItemModal from "./SelectedItemModal";
import colors from "../../utils/styles/appStyles";
import { Tooltip } from "react-native-elements";
import formatCurrency from "../../utils/currencyFormatter";
import { Ionicons } from "@expo/vector-icons";

const StarRatingDisplay = ({ rating = 0, size = 16 }) => {
	const fullStars = Math.floor(rating);
	const hasHalf = rating % 1 >= 0.5;
	return (
		<View style={{ flexDirection: "row", alignItems: "center" }}>
			{[1, 2, 3, 4, 5].map((i) => (
				<Ionicons
					key={i}
					name={
						i <= fullStars
							? "star"
							: i === fullStars + 1 && hasHalf
								? "star-half"
								: "star-outline"
					}
					size={size}
					color="#FFD700"
					style={{ marginRight: 2 }}
				/>
			))}
		</View>
	);
};

const MenuItemRow = ({ item, onPress }) => {
	const { t } = useTranslation();
	// Helper to safely format currency
	const formatCurrency = (price) => {
		if (typeof price !== "number" || isNaN(price))
			return t("not_available_abbreviation");
		return `$${price.toFixed(2)}`;
	};
	const { averageRating = 0, ratingCount = 0 } = item;

	return (
		<TouchableOpacity onPress={onPress} style={styles.menuItem}>
			<View style={styles.contentContainer}>
				{/* Name and Price are no longer in a separate "titleRow" View */}
				<Text style={styles.name}>{item.name}</Text>
				{item.description ? (
					<Text style={styles.description} numberOfLines={2}>
						{item.description}
					</Text>
				) : null}
				{averageRating > 0 && (
					<View style={styles.ratingRow}>
						<StarRatingDisplay rating={averageRating} />
						<Text style={styles.ratingText}>
							{averageRating.toFixed(1)} ({ratingCount}{" "}
							{ratingCount === 1 ? t("rating") : t("ratings")})
						</Text>
					</View>
				)}

				<Text style={styles.price}>{formatCurrency(item.price)}</Text>
			</View>
			{item.imageUri && (
				<Image
					source={{ uri: item.imageUri }}
					style={styles.image}
					resizeMode="cover"
				/>
			)}
		</TouchableOpacity>
	);
};

const MenuItemsList = ({
	menuItems,
	isLoading,
	restaurantId,
	pips,
	ListHeaderComponent,
	onConfirmAddItemToContext,
	orderingMode = "individual",

	partyData,
}) => {
	const { t } = useTranslation();
	const { currentUserData, logout } = useContext(AuthContext);

	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

	const isGuest = currentUserData?.role === "guest";

	const handleSelectItem = (menuItem) => {
		if (isGuest) {
			Alert.alert(
				t("create_account_to_order_title"),
				t("create_account_to_order_message"),
				[
					{
						text: t("cancel_button"),
						style: "cancel",
					},
					{
						text: t("signup_login_button"),
						// --- THIS IS THE FIX ---
						// On press, call logout() to reset the app state and
						// send the user back to the WelcomeScreen.
						onPress: () => logout(),
					},
				],
			);
			return;
		}
		setSelectedItem(menuItem);
		setIsModalVisible(true);
	};

	// This callback is triggered from the modal and calls the function passed down from the parent screen.
	const handleModalConfirm = async (itemDataFromModal) => {
		setIsSubmitting(true);
		try {
			// The parent (RestaurantDetails or PartySession) provides this function, which contains the correct logic.
			await onConfirmAddItemToContext(itemDataFromModal);
			setSnackbar({
				visible: true,
				message: t("item_added_to_order_snackbar", {
					orderType: orderingMode === "party" ? t("party") : t("individual"),
				}),
			});
		} catch (error) {
			console.error("MenuItemsList: Error confirming item add:", error);
			Alert.alert(
				t("error_title"),
				t("could_not_add_item_error", { message: error.message }),
			);
		} finally {
			setIsSubmitting(false);
			setIsModalVisible(false);
		}
	};

	// This useMemo hook efficiently processes the flat menuItems array into sections for the SectionList.
	const menuSections = useMemo(() => {
		if (!menuItems || menuItems.length === 0) return [];

		const grouped = menuItems.reduce((acc, item) => {
			const category = item.isDailySpecial
				? t("daily_special_category")
				: item.category || t("other_category");
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(item);
			return acc;
		}, {});

		const categoryOrder = [
			t("daily_special_category"),
			t("appetizers_category"),
			t("entrees_category"),
			t("desserts_category"),
			t("sides_category"),
			t("drinks_category"),
			t("beer_category"),
			t("wine_category"),
			t("cocktails_category"),
			t("non_alcoholic_drinks_category"),
			t("other_category"),
		];

		return Object.keys(grouped)
			.sort((a, b) => {
				const indexA = categoryOrder.indexOf(a);
				const indexB = categoryOrder.indexOf(b);
				if (indexA === -1 && indexB > -1) return 1; // B is preferred
				if (indexA > -1 && indexB === -1) return -1; // A is preferred
				return indexA - indexB; // Both are preferred, sort by order
			})
			.map((category) => ({
				title: category,
				data: grouped[category],
			}))
			.filter((section) => section.data.length > 0);
	}, [menuItems]);

	if (isLoading) {
		return (
			<ScrollView>
				{ListHeaderComponent}
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={{ marginTop: 30 }}
				/>
			</ScrollView>
		);
	}

	if (!menuItems || menuItems.length === 0) {
		return <Text style={styles.noItemsText}>{t("no_menu_items_found")}</Text>;
	}
	return (
		<View style={styles.container}>
			<SectionList
				sections={menuSections}
				keyExtractor={(item, index) => item.id + index}
				renderItem={({ item }) => (
					<MenuItemRow item={item} onPress={() => handleSelectItem(item)} />
				)}
				renderSectionHeader={({ section: { title } }) => (
					<Text style={styles.menuCategoryHeader}>{title}</Text>
				)}
				ListHeaderComponent={ListHeaderComponent}
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingBottom: 20 }}
			/>

			{selectedItem && (
				<SelectedItemModal
					visible={isModalVisible}
					selectedItem={selectedItem}
					pips={pips || []}
					onClose={() => setIsModalVisible(false)}
					onConfirm={handleModalConfirm}
					orderingMode={orderingMode} // Pass the mode to the modal
					isLoading={isSubmitting}
					partyData={partyData} // Pass party data to the modal
				/>
			)}

			<Snackbar
				visible={snackbar.visible}
				onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
				duration={2000}
				style={{ backgroundColor: colors.statusSuccess }}
			>
				<Text style={{ color: colors.surfaceWhite }}>{snackbar.message}</Text>
			</Snackbar>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	noItemsText: {
		textAlign: "center",
		marginTop: 30,
		fontSize: 16,
		color: colors.textLight,
		paddingHorizontal: 20,
	},
	menuCategoryHeader: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
		paddingVertical: 15,
		paddingHorizontal: 20,
		backgroundColor: colors.backgroundLight,
	},
	menuItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 15,
		paddingHorizontal: 20,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	contentContainer: {
		flex: 1,
		marginRight: 10,
	},
	ratingRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 4,
		marginBottom: 4,
	},
	ratingText: {
		marginLeft: 6,
		fontSize: 13,
		color: colors.textMedium,
	},

	// (optional) make the name a bit tighter if you want
	name: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
	},
	description: {
		fontSize: 14,
		color: colors.textMedium,
		marginTop: 4,
	},
	price: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.primary,
		marginTop: 8, // Price is back on its own line with margin
	},
	image: {
		width: 80,
		height: 80,
		borderRadius: 8,
		backgroundColor: colors.backgroundMedium,
	},
});

export default MenuItemsList;
