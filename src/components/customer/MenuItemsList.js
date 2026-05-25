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
	ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Snackbar } from "react-native-paper";
import { AuthContext } from "../../context/authContext";
import SelectedItemModal from "./SelectedItemModal";
import colors from "../../utils/styles/appStyles";
import { Ionicons } from "@expo/vector-icons";
import { formatMenuPrice } from "../../utils/currencyFormatter";

// --- IMPORT THE HELPER HERE ---
import { getLocalizedValue } from "../../utils/localizationHelper";

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

const itemRequiresCustomization = (item) => {
	if (!item || !Array.isArray(item.modifierGroups)) return false;

	return item.modifierGroups.some((group) => {
		const required = !!group.required;
		const minSelect =
			group && group.minSelect !== undefined && group.minSelect !== null
				? Number(group.minSelect)
				: 0;

		return required || minSelect > 0;
	});
};

// 🚨 UPDATED: MenuItemRow now accepts selection props
const MenuItemRow = ({
	item,
	onPress,
	isSelected,
	onToggleSelect,
	showCheckbox,
}) => {
	const { t } = useTranslation();

	const displayName = getLocalizedValue(item, "name");
	const displayDescription = getLocalizedValue(item, "description");
	const requiresCustomization = itemRequiresCustomization(item);

	const safeFormatCurrency = (price) =>
		Number.isFinite(Number(price))
			? formatMenuPrice(price)
			: t("not_available_abbreviation");
	const { averageRating = 0, ratingCount = 0 } = item;

	return (
		<View style={styles.menuItemWrapper}>
			{/* 🚨 THE QUICK-SELECT CHECKBOX (Only shows in Party Mode) */}
			{showCheckbox && !requiresCustomization && (
				<TouchableOpacity
					style={styles.checkboxContainer}
					onPress={onToggleSelect}
					activeOpacity={0.7}
				>
					<Ionicons
						name={isSelected ? "checkbox" : "square-outline"}
						size={28}
						color={isSelected ? colors.primary : colors.textMedium}
					/>
				</TouchableOpacity>
			)}

			{/* The rest of the row behaves normally (opens modal) */}
			<TouchableOpacity onPress={onPress} style={styles.menuItem}>
				<View style={styles.contentContainer}>
					<Text style={styles.name}>{displayName}</Text>

					{displayDescription ? (
						<Text style={styles.description} numberOfLines={2}>
							{displayDescription}
						</Text>
					) : null}
					{requiresCustomization && (
						<View style={styles.customizeBadge}>
							<Text style={styles.customizeBadgeText}>
								{t("customize_badge", "Customize")}
							</Text>
						</View>
					)}

					{averageRating > 0 && (
						<View style={styles.ratingRow}>
							<StarRatingDisplay rating={averageRating} />
							<Text style={styles.ratingText}>
								{averageRating.toFixed(1)} ({ratingCount}{" "}
								{ratingCount === 1 ? t("rating") : t("ratings")})
							</Text>
						</View>
					)}

					<Text style={styles.price}>{safeFormatCurrency(item.price)}</Text>
				</View>
				{item.imageUri && (
					<Image
						source={{ uri: item.imageUri }}
						style={styles.image}
						resizeMode="cover"
					/>
				)}
			</TouchableOpacity>
		</View>
	);
};

const MenuItemsList = ({
	menuItems,
	isLoading,
	pips,
	ListHeaderComponent,
	onConfirmAddItemToContext,
	orderingMode = "individual",
	partyData,
	// 🚨 NEW PROPS FROM PARENT
	selectedItems = {},
	onToggleItemSelection = () => {},
}) => {
	const { t, i18n } = useTranslation();
	const { currentUserData, logout } = useContext(AuthContext);

	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedItemForModal, setSelectedItemForModal] = useState(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

	const isGuest = currentUserData?.role === "guest";

	const handleSelectItemForModal = (menuItem) => {
		if (isGuest) {
			Alert.alert(
				t("create_account_to_order_title"),
				t("create_account_to_order_message"),
				[
					{ text: t("cancel_button"), style: "cancel" },
					{ text: t("signup_login_button"), onPress: () => logout() },
				],
			);
			return;
		}
		setSelectedItemForModal(menuItem);
		setIsModalVisible(true);
	};

	const handleModalConfirm = async (itemDataFromModal) => {
		setIsSubmitting(true);
		try {
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

	const menuSections = useMemo(() => {
		if (!menuItems || menuItems.length === 0) return [];
		const availableItems = menuItems.filter(
			(item) => item.isAvailable !== false,
		);

		const grouped = availableItems.reduce((acc, item) => {
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
				if (indexA === -1 && indexB > -1) return 1;
				if (indexA > -1 && indexB === -1) return -1;
				return indexA - indexB;
			})
			.map((category) => ({
				title: category,
				data: grouped[category],
			}))
			.filter((section) => section.data.length > 0);
	}, [menuItems, t, i18n.language]);

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
		return (
			<ScrollView style={styles.container}>
				{ListHeaderComponent}
				<Text style={styles.noItemsText}>{t("no_menu_items_found")}</Text>
			</ScrollView>
		);
	}

	return (
		<View style={styles.container}>
			<SectionList
				sections={menuSections}
				keyExtractor={(item, index) => item.id + index}
				renderItem={({ item }) => (
					<MenuItemRow
						item={item}
						onPress={() => handleSelectItemForModal(item)}
						// 🚨 Pass the selection state down
						isSelected={!!selectedItems[item.id]}
						onToggleSelect={() => onToggleItemSelection(item.id)}
						showCheckbox={orderingMode === "party"}
					/>
				)}
				renderSectionHeader={({ section: { title } }) => (
					<Text style={styles.menuCategoryHeader}>{title}</Text>
				)}
				ListHeaderComponent={ListHeaderComponent}
				showsVerticalScrollIndicator={false}
				// Leave room for the bulk add button if in party mode
				contentContainerStyle={{
					paddingBottom: orderingMode === "party" ? 100 : 20,
				}}
				extraData={{ language: i18n.language, selectedItems }} // Re-render when boxes are checked
			/>

			{selectedItemForModal && (
				<SelectedItemModal
					visible={isModalVisible}
					selectedItem={selectedItemForModal}
					pips={pips || []}
					onClose={() => setIsModalVisible(false)}
					onConfirm={handleModalConfirm}
					orderingMode={orderingMode}
					isLoading={isSubmitting}
					partyData={partyData}
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
		backgroundColor: colors.background,
	},
	// 🚨 NEW WRAPPER FOR CHECKBOX + ROW
	menuItemWrapper: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#fff",
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
	},
	checkboxContainer: {
		padding: 15,
		paddingRight: 5, // Keep it close to the text
		justifyContent: "center",
		alignItems: "center",
	},
	menuItem: {
		flex: 1, // Takes up the remaining space
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 15,
	},
	contentContainer: {
		flex: 1,
		marginRight: 10,
	},
	name: {
		fontSize: 16,
		fontWeight: "bold",
		color: "#333",
		marginBottom: 4,
	},
	description: {
		fontSize: 14,
		color: "#666",
		marginBottom: 6,
	},
	price: {
		fontSize: 15,
		fontWeight: "bold",
		color: colors.primary,
		marginTop: 4,
	},
	image: {
		width: 80,
		height: 80,
		borderRadius: 8,
		backgroundColor: "#f0f0f0",
	},
	menuCategoryHeader: {
		fontSize: 20,
		fontWeight: "bold",
		backgroundColor: "#f4f4f4",
		paddingVertical: 10,
		paddingHorizontal: 15,
		color: "#333",
	},
	ratingRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5,
	},
	ratingText: {
		fontSize: 12,
		color: "#777",
		marginLeft: 5,
	},
	noItemsText: {
		textAlign: "center",
		marginTop: 20,
		fontSize: 16,
		color: "#666",
	},
	customizeBadge: {
		alignSelf: "flex-start",
		backgroundColor: colors.primary + "15",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		marginBottom: 6,
	},
	customizeBadgeText: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: "700",
	},
});

export default MenuItemsList;
