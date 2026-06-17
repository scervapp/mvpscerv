// screens/restaurant/MenuManagementScreen.js
import React, { useState, useEffect, useContext, useMemo } from "react";
import {
	Text,
	View,
	StyleSheet,
	TouchableOpacity,
	SectionList,
	ActivityIndicator,
	TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AddItemModal from "../../components/restaurant/AddItemModal";
import { db } from "../../config/firebase";

import { AuthContext } from "../../context/authContext";
import MenuItem from "../../components/restaurant/MenuItem";
import colors from "../../utils/styles/appStyles";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

const MenuSectionHeader = ({ title }) => (
	<View style={styles.sectionHeaderContainer}>
		<Text style={styles.sectionHeaderText}>{title}</Text>
	</View>
);

const EmptyMenu = ({ onAddItem }) => {
	const { t } = useTranslation();
	return (
		<View style={styles.emptyContainer}>
			<Ionicons
				name="document-text-outline"
				size={80}
				color={colors.textLight}
			/>
			<Text style={styles.emptyTitle}>{t("your_menu_is_empty")}</Text>
			<Text style={styles.emptySubtitle}>
				{t("tap_the_button_below_to_add_your_first_appetizer_entree_or_drink")}
			</Text>
			<TouchableOpacity style={styles.emptyButton} onPress={onAddItem}>
				<Text style={styles.emptyButtonText}>{t("add_first_item")}</Text>
			</TouchableOpacity>
		</View>
	);
};

const MenuManagementScreen = () => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const insets = useSafeAreaInsets();

	const [showModal, setShowModal] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [menuItems, setMenuItems] = useState([]);
	const [searchTerm, setSearchTerm] = useState("");
	const visibleItemCount = menuItems.filter((item) => item.isAvailable !== false).length;
	const hiddenItemCount = menuItems.length - visibleItemCount;

	// --- Robust Data Fetching ---
	useEffect(() => {
		if (!currentUserData?.uid) {
			setIsLoading(false);
			setError(t("could_not_identify_the_restaurant_please_try_again"));
			return;
		}

		const unsubscribe = db
			.collection("menuItems")
			.where("restaurantId", "==", currentUserData.uid)
			.onSnapshot(
				(snapshot) => {
					const items = snapshot.docs.map((doc) => ({
						id: doc.id,
						...doc.data(),
					}));
					setMenuItems(items);
					setIsLoading(false);
					setError(null);
				},
				(err) => {
					console.error("MenuManagementScreen snapshot error:", err);
					setError(t("failed_to_load_menu_please_check_your_connection"));
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const handleEditItem = (item) => {
		setSelectedItem(item);
		setShowModal(true);
	};

	const handleAddItem = () => {
		setSelectedItem(null);
		setShowModal(true);
	};

	const processedMenu = useMemo(() => {
		const filteredItems = searchTerm
			? menuItems.filter((item) =>
					item.name.toLowerCase().includes(searchTerm.toLowerCase()),
				)
			: menuItems;

		if (filteredItems.length === 0) return [];

		const grouped = filteredItems.reduce((acc, item) => {
			const category = item.category || t("uncategorized");
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(item);
			return acc;
		}, {});

		const categoryOrder = [
			t("daily_special_category", "Daily Special"),
			t("breakfast_category", "Breakfast"),
			t("brunch_category", "Brunch"),
			t("starters_category", "Starters"),
			t("appetizers_category", "Appetizers"),
			t("soups_category", "Soups"),
			t("salads_category", "Salads"),
			t("sides_category", "Sides"),
			t("entrees_category", "Entrees"),
			t("pasta_category", "Pasta"),
			t("seafood_category", "Seafood"),
			t("grill_category", "Grill"),
			t("burgers_category", "Burgers"),
			t("sandwiches_category", "Sandwiches"),
			t("pizza_category", "Pizza"),
			t("tacos_category", "Tacos"),
			t("kids_menu_category", "Kids Menu"),
			t("desserts_category", "Desserts"),
			t("combos_category", "Combos"),
			t("extras_category", "Extras"),
			t("sauces_category", "Sauces"),
			t("drinks_category", "Drinks"),
			t("non_alcoholic_drinks_category", "Non-Alcoholic Drinks"),
			t("sodas_category", "Sodas"),
			t("juices_category", "Juices"),
			t("coffee_category", "Coffee"),
			t("tea_category", "Tea"),
			t("beer_category", "Beer"),
			t("wine_category", "Wine"),
			t("cocktails_category", "Cocktails"),
			t("spirits_category", "Spirits"),
		];
		return Object.keys(grouped)
			.sort((a, b) => {
				const indexA = categoryOrder.indexOf(a);
				const indexB = categoryOrder.indexOf(b);
				if (indexA > -1 && indexB > -1) return indexA - indexB;
				if (indexA > -1) return -1;
				if (indexB > -1) return 1;
				return a.localeCompare(b);
			})
			.map((category) => ({
				title: category,
				data: grouped[category],
			}));
	}, [menuItems, searchTerm, t]);

	const renderMenuItem = ({ item }) => (
		<MenuItem
			item={item}
			restaurantId={currentUserData.uid}
			onEdit={() => handleEditItem(item)}
		/>
	);

	if (isLoading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>{error}</Text>
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				{/* --- Header --- */}
				<View style={styles.header}>
					<View>
						<Text style={styles.eyebrow}>{t("menu_builder", "Menu Builder")}</Text>
						<Text style={styles.headerTitle}>{t("manage_menu")}</Text>
						<Text style={styles.headerSubtitle}>
							{menuItems.length} {t("items", "items")} - {visibleItemCount}{" "}
							{t("visible", "visible")} - {hiddenItemCount}{" "}
							{t("hidden", "hidden")}
						</Text>
					</View>
					<TouchableOpacity style={styles.headerButton} onPress={handleAddItem}>
						<Ionicons name="add" size={22} color="#fff" />
					</TouchableOpacity>
				</View>

				{/* --- Search Bar --- */}
				<View style={styles.searchContainer}>
					<Ionicons
						name="search"
						size={20}
						color={colors.textLight}
						style={styles.searchIcon}
					/>
					<TextInput
						style={styles.searchInput}
						placeholder={t("search_for_a_dish")}
						placeholderTextColor={colors.textLight}
						value={searchTerm}
						onChangeText={setSearchTerm}
					/>
				</View>

				<View style={styles.listWrap}>
					{menuItems.length === 0 ? (
						<EmptyMenu onAddItem={handleAddItem} />
					) : processedMenu.length === 0 ? (
						<View style={styles.emptyContainer}>
							<Text style={styles.emptyTitle}>{t("no_results_found")}</Text>
							<Text style={styles.emptySubtitle}>
								{t("no_menu_items_match_your_search_for", {
									searchTerm: searchTerm,
								})}
							</Text>
						</View>
					) : (
						<SectionList
							sections={processedMenu}
							renderItem={renderMenuItem}
							keyExtractor={(item, index) => item.id + index}
							renderSectionHeader={({ section: { title } }) => (
								<MenuSectionHeader title={title} />
							)}
							contentContainerStyle={styles.menuList}
							// 🚨 FIX 1: Handles dismissing keyboard organically
							keyboardDismissMode="on-drag"
							keyboardShouldPersistTaps="handled"
							// 🚨 FIX 2: Added to ensure smooth momentum scrolling
							showsVerticalScrollIndicator={false}
							removeClippedSubviews={true}
						/>
					)}
				</View>

				{/* --- Add/Edit Item Modal --- */}
				<AddItemModal
					isVisible={showModal}
					onClose={() => setShowModal(false)}
					itemToEdit={selectedItem}
				/>
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: colors.surfaceWhite,
	},
	container: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 18,
		paddingVertical: 16,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
	},
	eyebrow: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
		textTransform: "uppercase",
		marginBottom: 3,
	},
	headerTitle: { fontSize: 24, fontWeight: "900", color: colors.textDark },
	headerSubtitle: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 3,
	},
	headerButton: {
		width: 46,
		height: 46,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.primary,
		borderRadius: 8,
	},
	searchContainer: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		marginHorizontal: 18,
		marginTop: 14,
		marginBottom: 10,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	searchIcon: { marginRight: 10 },
	searchInput: { flex: 1, height: 46, fontSize: 15, color: colors.textDark },
	listWrap: { flex: 1 },
	menuList: {
		paddingHorizontal: 18,
		paddingBottom: 40,
	},
	sectionHeaderContainer: {
		paddingTop: 14,
		paddingBottom: 8,
		backgroundColor: colors.backgroundLight,
	},
	sectionHeaderText: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textDark,
		textTransform: "uppercase",
	},
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 40,
	},
	emptyTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		marginTop: 15,
		textAlign: "center",
	},
	emptySubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 8,
	},
	emptyButton: {
		backgroundColor: colors.primary,
		paddingVertical: 12,
		paddingHorizontal: 30,
		borderRadius: 8,
		marginTop: 25,
	},
	emptyButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold" },
	errorText: { fontSize: 16, color: colors.statusDanger },
});

export default MenuManagementScreen;
