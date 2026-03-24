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
	Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AddItemModal from "../../components/restaurant/AddItemModal";
import app, { db } from "../../config/firebase";

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
			t("daily_special"),
			t("appetizers"),
			t("entrees"),
			t("desserts"),
			t("drinks"),
			t("beer"),
			t("wine"),
			t("cocktails"),
			t("spirits"),
			t("non_alcoholic_drinks"),
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
					<Text style={styles.headerTitle}>{t("manage_menu")}</Text>
					<TouchableOpacity style={styles.headerButton} onPress={handleAddItem}>
						<Ionicons name="add" size={24} color={colors.primary} />
						<Text style={styles.headerButtonText}>{t("add_item")}</Text>
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

				<View style={{ flex: 1 }}>
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
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
	},
	headerTitle: { fontSize: 24, fontWeight: "bold", color: colors.textDark },
	headerButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary + "20",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
	},
	headerButtonText: {
		color: colors.primary,
		fontWeight: "bold",
		fontSize: 14,
		marginLeft: 4,
	},
	searchContainer: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		marginHorizontal: 20,
		marginVertical: 15,
		paddingHorizontal: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	searchIcon: { marginRight: 10 },
	searchInput: { flex: 1, height: 45, fontSize: 16, color: colors.textDark },
	menuList: {
		paddingHorizontal: 20,
		paddingBottom: 40,
	},
	sectionHeaderContainer: {
		paddingTop: 10,
		paddingBottom: 10,
		backgroundColor: colors.backgroundLight,
	},
	sectionHeaderText: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
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
		borderRadius: 25,
		marginTop: 25,
	},
	emptyButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold" },
	errorText: { fontSize: 16, color: colors.statusDanger },
});

export default MenuManagementScreen;
