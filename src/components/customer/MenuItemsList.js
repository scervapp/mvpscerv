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
	TextInput,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Snackbar } from "react-native-paper";
import { AuthContext } from "../../context/authContext";
import SelectedItemModal from "./SelectedItemModal";
import colors from "../../utils/styles/appStyles";
import { Ionicons } from "@expo/vector-icons";
import { formatMenuPrice } from "../../utils/currencyFormatter";
import { getStoredScervScore } from "../../utils/discoveryScoring";

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
const normalizeSearchText = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

const getDiscoveryScore = (item) => {
	return getStoredScervScore(item);
};

const getReviewHighlight = (item) =>
	item.reviewHighlight ||
	item.topReview ||
	item.guestHighlight ||
	item.featuredReview ||
	"";

const itemMatchesSearch = (item, query) => {
	if (!query) return true;
	const searchableValues = [
		getLocalizedValue(item, "name"),
		getLocalizedValue(item, "description"),
		item.category,
		item.standardCategory,
		...(item.searchKeywords || []),
		...(item.dishTypeTags || []),
		...(item.ingredientTags || []),
		...(item.cuisineTags || []),
		...(item.dietaryTags || []),
		...(item.flavorTags || []),
		...(item.topReviewTags || []),
	];
	const searchableText = searchableValues
		.map((value) => normalizeSearchText(value))
		.join(" ");

	return query
		.split(/\s+/)
		.filter(Boolean)
		.every((token) => searchableText.includes(token));
};

const normalizeMenuCategory = (value) =>
	normalizeSearchText(value)
		.replace(/&/g, "and")
		.replace(/\s+/g, " ");

const getCategoryRank = (category, item = {}) => {
	if (item?.isDailySpecial) return 0;
	const normalized = normalizeMenuCategory(category);

	if (["daily special", "daily specials", "specials"].includes(normalized)) {
		return 0;
	}
	if (["breakfast", "brunch"].includes(normalized)) return 5;
	if (
		[
			"appetizers",
			"appetizer",
			"starters",
			"starter",
			"snacks",
			"small plates",
			"raw bar",
		].includes(normalized)
	) {
		return 10;
	}
	if (["soups", "soup", "salads", "salad"].includes(normalized)) return 20;
	if (
		[
			"entrees",
			"entree",
			"mains",
			"main",
			"main course",
			"main courses",
			"ramen",
			"bowls",
			"bowl",
			"pasta",
			"seafood",
			"grill",
			"steaks",
			"steak",
			"burgers",
			"burger",
			"sushi",
			"sashimi",
			"nigiri",
			"sandwiches",
			"sandwich",
			"pizza",
			"tacos",
		].includes(normalized)
	) {
		return 30;
	}
	if (["sides", "side", "extras", "sauces"].includes(normalized)) return 40;
	if (
		[
			"drinks",
			"drink",
			"beverages",
			"beverage",
			"cocktails",
			"cocktail",
			"beer",
			"wine",
			"spirits",
			"spirit",
			"non-alcoholic drinks",
			"sodas",
			"juices",
			"coffee",
			"tea",
		].includes(normalized)
	) {
		return 50;
	}
	if (["desserts", "dessert"].includes(normalized)) return 60;
	if (["kids menu", "kids"].includes(normalized)) return 70;
	return 900;
};

const getMenuSortOrder = (item) => {
	const explicitSort = Number(item?.menuSortOrder ?? item?.sortOrder);
	if (Number.isFinite(explicitSort)) return explicitSort;
	return getCategoryRank(item?.category, item) * 100;
};

const sortMenuItemsForSection = (a, b) => {
	const sortDiff = getMenuSortOrder(a) - getMenuSortOrder(b);
	if (sortDiff !== 0) return sortDiff;
	const scoreDiff = getDiscoveryScore(b) - getDiscoveryScore(a);
	if (scoreDiff !== 0) return scoreDiff;
	return String(getLocalizedValue(a, "name")).localeCompare(
		String(getLocalizedValue(b, "name")),
	);
};

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
	const { averageRating = 0, ratingCount = 0, reviewCount = 0 } = item;
	const visibleTags = [
		...(item.ingredientTags || []),
		...(item.flavorTags || []),
		...(item.topReviewTags || []),
	].slice(0, 3);
	const reviewHighlight = getReviewHighlight(item);

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
								{ratingCount === 1 ? t("rating") : t("ratings")}
								{reviewCount > 0
									? ` - ${reviewCount} ${t("reviews_label", "reviews")}`
									: ""}
								)
							</Text>
						</View>
					)}

					{reviewHighlight ? (
						<Text style={styles.reviewHighlightText} numberOfLines={2}>
							"{reviewHighlight}"
						</Text>
					) : null}

					{visibleTags.length > 0 && (
						<View style={styles.itemTagRow}>
							{visibleTags.map((tag) => (
								<Text key={tag} style={styles.itemTag}>
									{tag}
								</Text>
							))}
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

const FavoriteDishCard = ({ item, rank, onPress }) => {
	const { t } = useTranslation();
	const displayName = getLocalizedValue(item, "name");
	const rating = Number(item.averageRating || item.rating || 0);
	const ratingCount = Number(item.ratingCount || 0);
	const reviewCount = Number(item.reviewCount || 0);
	const topTag = [
		...(item.topReviewTags || []),
		...(item.flavorTags || []),
		...(item.ingredientTags || []),
	][0];

	return (
		<TouchableOpacity
			style={styles.favoriteDishCard}
			onPress={onPress}
			activeOpacity={0.86}
		>
			<View style={styles.favoriteRankBadge}>
				<Text style={styles.favoriteRankText}>#{rank}</Text>
			</View>
			{item.imageUri ? (
				<Image
					source={{ uri: item.imageUri }}
					style={styles.favoriteDishImage}
					resizeMode="cover"
				/>
			) : (
				<View style={styles.favoriteDishImagePlaceholder}>
					<Ionicons name="restaurant" size={24} color={colors.primary} />
				</View>
			)}
			<Text style={styles.favoriteDishName} numberOfLines={2}>
				{displayName}
			</Text>
			<View style={styles.favoriteDishRatingRow}>
				<StarRatingDisplay rating={rating} size={12} />
				<Text style={styles.favoriteDishRatingText}>
					{rating > 0 ? rating.toFixed(1) : t("new_item_label", "New")}
				</Text>
			</View>
			<Text style={styles.favoriteDishMeta} numberOfLines={1}>
				{ratingCount} {ratingCount === 1 ? t("rating") : t("ratings")}
				{reviewCount > 0
					? ` - ${reviewCount} ${t("reviews_label", "reviews")}`
					: ""}
			</Text>
			{topTag ? (
				<Text style={styles.favoriteDishTag} numberOfLines={1}>
					{topTag}
				</Text>
			) : null}
		</TouchableOpacity>
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
	isOrderingAvailable = true,
	restaurantName = "",
	onViewRestaurant,
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
	const [searchQuery, setSearchQuery] = useState("");
	const [sortMode, setSortMode] = useState("category");

	const isGuest = currentUserData?.role === "guest";

	const handleSelectItemForModal = (menuItem) => {
		if (isOrderingAvailable && isGuest) {
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
		const normalizedQuery = normalizeSearchText(searchQuery);
		const filteredItems = availableItems.filter((item) =>
			itemMatchesSearch(item, normalizedQuery),
		);

		if (sortMode !== "category" || normalizedQuery) {
			const sortedItems = [...filteredItems].sort((a, b) => {
				if (sortMode === "popular") {
					const orderDiff = Number(b.orderCount || 0) - Number(a.orderCount || 0);
					if (orderDiff !== 0) return orderDiff;
				}

				const scoreDiff = getDiscoveryScore(b) - getDiscoveryScore(a);
				if (scoreDiff !== 0) return scoreDiff;
				const ratingDiff =
					Number(b.averageRating || 0) - Number(a.averageRating || 0);
				if (ratingDiff !== 0) return ratingDiff;
				return String(getLocalizedValue(a, "name")).localeCompare(
					String(getLocalizedValue(b, "name")),
				);
			});

			return [
				{
					title: normalizedQuery
						? t("matching_dishes_title", "Matching Dishes")
						: sortMode === "popular"
							? t("popular_dishes_title", "Popular Dishes")
							: t("best_rated_dishes_title", "Best Rated Dishes"),
					data: sortedItems,
				},
			].filter((section) => section.data.length > 0);
		}

		const grouped = filteredItems.reduce((acc, item) => {
			const category = item.isDailySpecial
				? t("daily_special_category", "Daily Special")
				: item.category || t("other_category");

			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(item);
			return acc;
		}, {});

		return Object.keys(grouped)
			.sort((a, b) => {
				const rankA = getCategoryRank(a);
				const rankB = getCategoryRank(b);
				if (rankA !== rankB) return rankA - rankB;
				return String(a).localeCompare(String(b));
			})
			.map((category) => ({
				title: category,
				data: [...grouped[category]].sort(sortMenuItemsForSection),
			}))
			.filter((section) => section.data.length > 0);
	}, [menuItems, searchQuery, sortMode, t, i18n.language]);

	const favoriteDishes = useMemo(() => {
		if (!menuItems || menuItems.length === 0) return [];

		// This keeps discovery honest by blending score, ratings, volume, and reviews instead of only showing the highest raw average.
		return menuItems
			.filter((item) => {
				const rating = Number(item.averageRating || item.rating || 0);
				const ratingCount = Number(item.ratingCount || 0);
				const reviewCount = Number(item.reviewCount || 0);
				return (
					item.isAvailable !== false &&
					(rating > 0 || reviewCount > 0 || ratingCount > 0)
				);
			})
			.sort((a, b) => {
				const scoreDiff = getDiscoveryScore(b) - getDiscoveryScore(a);
				if (scoreDiff !== 0) return scoreDiff;
				return Number(b.ratingCount || 0) - Number(a.ratingCount || 0);
			})
			.slice(0, 8);
	}, [menuItems]);

	const renderHeader = () => (
		<>
			{ListHeaderComponent}
			{favoriteDishes.length > 0 && (
				<View style={styles.favoriteRailSection}>
					<View style={styles.favoriteRailHeader}>
						<View>
							<Text style={styles.favoriteRailTitle}>
								{t("guest_favorites_title", "Guest favorites")}
							</Text>
							<Text style={styles.favoriteRailSubtitle}>
								{t(
									"guest_favorites_subtitle",
									"Top dishes based on guest ratings and reviews.",
								)}
							</Text>
						</View>
						<TouchableOpacity
							style={styles.favoriteRailAction}
							onPress={() => setSortMode("best")}
						>
							<Text style={styles.favoriteRailActionText}>
								{t("see_best_label", "Best")}
							</Text>
							<Ionicons
								name="chevron-forward"
								size={15}
								color={colors.primary}
							/>
						</TouchableOpacity>
					</View>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.favoriteRailContent}
					>
						{favoriteDishes.map((item, index) => (
							<FavoriteDishCard
								key={
									item.id || `${getLocalizedValue(item, "name")}-${index}`
								}
								item={item}
								rank={index + 1}
								onPress={() => handleSelectItemForModal(item)}
							/>
						))}
					</ScrollView>
				</View>
			)}
			<View style={styles.discoveryControls}>
				<View style={styles.searchBox}>
					<Ionicons name="search" size={18} color={colors.textMedium} />
					<TextInput
						value={searchQuery}
						onChangeText={setSearchQuery}
						placeholder={t(
							"search_menu_placeholder",
							"Search calamari, crispy, vegan...",
						)}
						placeholderTextColor={colors.textLight}
						style={styles.searchInput}
						autoCorrect={false}
						clearButtonMode="while-editing"
					/>
					{searchQuery ? (
						<TouchableOpacity onPress={() => setSearchQuery("")}>
							<Ionicons
								name="close-circle"
								size={18}
								color={colors.textMedium}
							/>
						</TouchableOpacity>
					) : null}
				</View>
				<View style={styles.sortRow}>
					{[
						{ key: "category", label: t("sort_category", "Category") },
						{ key: "best", label: t("sort_best", "Best") },
						{ key: "popular", label: t("sort_popular", "Popular") },
					].map((option) => (
						<TouchableOpacity
							key={option.key}
							style={[
								styles.sortChip,
								sortMode === option.key && styles.sortChipActive,
							]}
							onPress={() => setSortMode(option.key)}
						>
							<Text
								style={[
									styles.sortChipText,
									sortMode === option.key && styles.sortChipTextActive,
								]}
							>
								{option.label}
							</Text>
						</TouchableOpacity>
					))}
				</View>
			</View>
		</>
	);

	if (isLoading) {
		return (
			<ScrollView>
				{renderHeader()}
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
				{renderHeader()}
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
				ListHeaderComponent={renderHeader}
				ListEmptyComponent={
					<Text style={styles.noItemsText}>
						{t("no_matching_menu_items", "No matching menu items found.")}
					</Text>
				}
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
					isOrderingAvailable={isOrderingAvailable}
					restaurantName={restaurantName}
					onViewRestaurant={onViewRestaurant}
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
	favoriteRailSection: {
		backgroundColor: colors.surfaceWhite,
		paddingTop: 14,
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	favoriteRailHeader: {
		paddingHorizontal: 15,
		marginBottom: 10,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	favoriteRailTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.textDark,
	},
	favoriteRailSubtitle: {
		marginTop: 2,
		fontSize: 12,
		color: colors.textMedium,
		fontWeight: "600",
	},
	favoriteRailAction: {
		minHeight: 34,
		borderRadius: 18,
		paddingHorizontal: 10,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary + "12",
	},
	favoriteRailActionText: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.primary,
		marginRight: 2,
	},
	favoriteRailContent: {
		paddingHorizontal: 15,
	},
	favoriteDishCard: {
		width: 152,
		minHeight: 218,
		marginRight: 10,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		padding: 10,
	},
	favoriteRankBadge: {
		position: "absolute",
		top: 16,
		left: 16,
		zIndex: 2,
		minWidth: 32,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.primary,
	},
	favoriteRankText: {
		color: colors.textOnPrimaryBrand || colors.surfaceWhite,
		fontSize: 12,
		fontWeight: "900",
	},
	favoriteDishImage: {
		width: "100%",
		height: 84,
		borderRadius: 8,
		backgroundColor: colors.backgroundLight,
		marginBottom: 9,
	},
	favoriteDishImagePlaceholder: {
		width: "100%",
		height: 84,
		borderRadius: 8,
		backgroundColor: colors.primary + "10",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 9,
	},
	favoriteDishName: {
		minHeight: 38,
		fontSize: 14,
		lineHeight: 18,
		fontWeight: "800",
		color: colors.textDark,
		marginBottom: 6,
	},
	favoriteDishRatingRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 4,
	},
	favoriteDishRatingText: {
		marginLeft: 4,
		fontSize: 12,
		fontWeight: "800",
		color: colors.textDark,
	},
	favoriteDishMeta: {
		fontSize: 11,
		fontWeight: "700",
		color: colors.textMedium,
		marginBottom: 7,
	},
	favoriteDishTag: {
		alignSelf: "flex-start",
		maxWidth: "100%",
		borderRadius: 12,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 8,
		paddingVertical: 4,
		fontSize: 11,
		fontWeight: "800",
		color: colors.textMedium,
		textTransform: "capitalize",
	},
	discoveryControls: {
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 15,
		paddingTop: 12,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	searchBox: {
		minHeight: 46,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 12,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	searchInput: {
		flex: 1,
		paddingHorizontal: 8,
		color: colors.textDark,
		fontSize: 15,
	},
	sortRow: {
		flexDirection: "row",
		marginTop: 10,
	},
	sortChip: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 16,
		paddingHorizontal: 12,
		paddingVertical: 7,
		marginRight: 8,
		backgroundColor: colors.surfaceWhite,
	},
	sortChipActive: {
		borderColor: colors.primary,
		backgroundColor: colors.primary,
	},
	sortChipText: {
		color: colors.textDark,
		fontSize: 13,
		fontWeight: "700",
	},
	sortChipTextActive: {
		color: colors.textOnPrimaryBrand || colors.surfaceWhite,
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
	reviewHighlightText: {
		fontSize: 12,
		lineHeight: 17,
		color: colors.textDark,
		fontWeight: "700",
		marginBottom: 6,
	},
	itemTagRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: 4,
	},
	itemTag: {
		backgroundColor: colors.backgroundLight,
		color: colors.textMedium,
		fontSize: 11,
		fontWeight: "700",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 12,
		marginRight: 5,
		marginBottom: 4,
		textTransform: "capitalize",
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
