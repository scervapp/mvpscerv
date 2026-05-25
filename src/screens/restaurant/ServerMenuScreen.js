// screens/restaurant/ServerMenuScreen.js
import React, {
	useState,
	useEffect,
	useContext,
	useCallback,
	useMemo,
} from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	SafeAreaView,
	Alert,
	TouchableOpacity,
	ScrollView,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { AuthContext } from "../../context/authContext";
import { fetchMenu } from "../../utils/customerUtils";
import MenuItemsList from "../../components/customer/MenuItemsList";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { functions } from "../../config/firebase.native";
import { httpsCallable } from "@react-native-firebase/functions";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { formatCurrencyFromDollars } from "../../utils/currencyFormatter";

const ServerMenuScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();

	const { partyId, restaurantId, tableName, tableId, serverObj } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();

	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);
	const [selectedItems, setSelectedItems] = useState({});
	const [customizedItems, setCustomizedItems] = useState([]);
	const [isAddingBulk, setIsAddingBulk] = useState(false);
	const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

	// ✅ NEW: selected category
	const [selectedCategory, setSelectedCategory] = useState("All");

	useEffect(() => {
		const loadMenu = async () => {
			if (!restaurantId) {
				Alert.alert(
					t("error", "Error"),
					t("missing_restaurant_id", "Missing Restaurant ID"),
				);
				navigation.goBack();
				return;
			}

			try {
				const fetchedMenu = await fetchMenu(restaurantId);
				setMenuItems(Array.isArray(fetchedMenu) ? fetchedMenu : []);
			} catch (error) {
				console.error("ServerMenuScreen: Error fetching menu:", error);
				Alert.alert(
					t("error", "Error"),
					t("could_not_load_menu_items", "Could not load menu."),
				);
			} finally {
				setIsLoadingMenu(false);
			}
		};

		loadMenu();
	}, [restaurantId, navigation, t]);

	// ✅ NEW: category list
	const categories = useMemo(() => {
		const uniqueCategories = Array.from(
			new Set(
				(menuItems || [])
					.map((item) => item?.category || "Other")
					.filter(Boolean),
			),
		).sort((a, b) => String(a).localeCompare(String(b)));

		return ["All", ...uniqueCategories];
	}, [menuItems]);

	// ✅ NEW: filtered list passed into MenuItemsList
	const filteredMenuItems = useMemo(() => {
		if (selectedCategory === "All") return menuItems || [];

		return (menuItems || []).filter(
			(item) => (item?.category || "Other") === selectedCategory,
		);
	}, [menuItems, selectedCategory]);

	const getCategoryCount = useCallback(
		(category) => {
			if (category === "All") return menuItems.length;
			return menuItems.filter(
				(item) => (item?.category || "Other") === category,
			).length;
		},
		[menuItems],
	);

	// ✅ NEW: generic category styling helpers
	const getCategoryVisual = useCallback((category) => {
		const normalized = String(category || "")
			.trim()
			.toLowerCase();

		if (normalized === "all") {
			return {
				icon: "apps-outline",
				bg: "#E8F1FF",
				iconColor: "#2563EB",
			};
		}

		if (
			[
				"beer",
				"wine",
				"cocktails",
				"spirits",
				"alcoholic drinks",
				"beverages",
				"drinks",
				"juices",
				"non-alcoholic drinks",
				"sodas",
				"coffee",
				"tea",
			].includes(normalized)
		) {
			return {
				icon: "wine-outline",
				bg: "#FFF1F2",
				iconColor: "#E11D48",
			};
		}

		if (
			["appetizers", "entrees", "mains", "main dishes"].includes(normalized)
		) {
			return {
				icon: "restaurant-outline",
				bg: "#ECFDF5",
				iconColor: "#059669",
			};
		}

		if (["desserts"].includes(normalized)) {
			return {
				icon: "ice-cream-outline",
				bg: "#FFF7ED",
				iconColor: "#EA580C",
			};
		}

		if (["sides"].includes(normalized)) {
			return {
				icon: "fast-food-outline",
				bg: "#FEFCE8",
				iconColor: "#CA8A04",
			};
		}

		if (["extras", "sauces", "add-ons", "addons"].includes(normalized)) {
			return {
				icon: "add-circle-outline",
				bg: "#F5F3FF",
				iconColor: "#7C3AED",
			};
		}

		if (["specials", "combos"].includes(normalized)) {
			return {
				icon: "star-outline",
				bg: "#EFF6FF",
				iconColor: "#1D4ED8",
			};
		}

		return {
			icon: "grid-outline",
			bg: "#F3F4F6",
			iconColor: "#4B5563",
		};
	}, []);

	const removeCustomizedItem = useCallback((indexToRemove) => {
		setCustomizedItems((prev) =>
			prev.filter((_, index) => index !== indexToRemove),
		);
	}, []);

	const removeQuickSelectedItem = useCallback((itemId) => {
		setSelectedItems((prev) => ({
			...prev,
			[itemId]: false,
		}));
	}, []);

	const pendingPreviewItems = useMemo(() => {
		const quickPreview = menuItems
			.filter((item) => selectedItems[item.id])
			.map((item) => ({
				type: "quick",
				key: `quick-${item.id}`,
				id: item.id,
				name: item.name,
				quantity: 1,
				modifiers: [],
				price: item.price || 0,
			}));

		const customPreview = customizedItems.map((customItem, index) => ({
			type: "custom",
			key: `custom-${index}`,
			index,
			id: customItem?.menuItemDetails?.id || `custom-${index}`,
			name: customItem?.menuItemDetails?.name || t("item", "Item"),
			quantity: customItem?.quantity || 1,
			modifiers: Array.isArray(customItem?.menuItemDetails?.selectedModifiers)
				? customItem.menuItemDetails.selectedModifiers
				: [],
			price:
				customItem?.menuItemDetails?.finalUnitPrice !== undefined &&
				customItem?.menuItemDetails?.finalUnitPrice !== null
					? customItem.menuItemDetails.finalUnitPrice
					: customItem?.menuItemDetails?.price || 0,
		}));

		return [...quickPreview, ...customPreview];
	}, [menuItems, selectedItems, customizedItems, t]);

	const toggleItemSelection = useCallback((itemId) => {
		setSelectedItems((prev) => ({
			...prev,
			[itemId]: !prev[itemId],
		}));
	}, []);

	const handleServerAddItem = async (itemDataFromModal) => {
		setCustomizedItems((prev) => [...prev, itemDataFromModal]);
	};

	const handleBulkServerAddItem = async () => {
		const quickAddItems = menuItems.filter((item) => selectedItems[item.id]);

		if (quickAddItems.length === 0 && customizedItems.length === 0) return;

		setIsAddingBulk(true);

		const { guestName } = route.params;
		const staffName =
			activeSession?.name ||
			`${activeSession?.firstName || ""} ${
				activeSession?.lastName || ""
			}`.trim() ||
			`${currentUserData?.firstName || ""} ${
				currentUserData?.lastName || ""
			}`.trim() ||
			"Server";
		const displayName = guestName || tableName || "Table";
		try {
			const quickItemsPayload = quickAddItems.map((item) => ({
				menuItemId: item.id,
				selectedModifiers: [],
				quantity: 1,
				specialInstructions: "",
			}));

			const customItemsPayload = customizedItems.map((customItem) => ({
				menuItemId: customItem?.menuItemDetails?.id,
				selectedModifiers: Array.isArray(
					customItem?.menuItemDetails?.selectedModifiers,
				)
					? customItem.menuItemDetails.selectedModifiers
					: [],
				quantity: customItem?.quantity || 1,
				specialInstructions: customItem?.specialInstructions || "",
			}));

			const allItemsToFire = [...quickItemsPayload, ...customItemsPayload];

			console.log(
				"[SERVER MENU STAFF ORDER PAYLOAD]",
				JSON.stringify(allItemsToFire, null, 2),
			);

			const addStaffItemsToPartyAndSendToKitchen = httpsCallable(
				functions,
				"addStaffItemsToPartyAndSendToKitchen",
			);

			await addStaffItemsToPartyAndSendToKitchen({
				partyId,
				restaurantId,
				table: { id: tableId, name: tableName },
				server: serverObj || {
					id: activeSession?.id || currentUserData.uid,
					name: staffName,
				},
				staff: {
					id: activeSession?.id || currentUserData.uid,
					name: staffName,
				},
				orderedForName: displayName,
				items: allItemsToFire,
			});

			setSelectedItems({});
			setCustomizedItems([]);

			setSnackbar({
				visible: true,
				message: t("items_sent_to_kitchen_success", {
					count: allItemsToFire.length,
					defaultValue: `${allItemsToFire.length} items sent to kitchen!`,
				}),
			});

			setTimeout(() => {
				navigation.goBack();
			}, 700);
		} catch (error) {
			console.error("Error batch adding items: ", error);
			Alert.alert(
				t("error", "Error"),
				t("failed_to_add", "Failed to send items to the kitchen."),
			);
		} finally {
			setIsAddingBulk(false);
		}
	};

	if (isLoadingMenu) {
		return (
			<SafeAreaView style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>
					{t("loading_menu", "Loading Menu...")}
				</Text>
			</SafeAreaView>
		);
	}

	const selectedCount = Object.values(selectedItems).filter(Boolean).length;
	const totalPendingCount = selectedCount + customizedItems.length;

	return (
		<SafeAreaView style={styles.screen}>
			<View style={styles.topNav}>
				<TouchableOpacity
					onPress={() => navigation.goBack()}
					style={styles.closeBtn}
				>
					<Ionicons name="chevron-down" size={28} color={colors.textDark} />
					<Text style={styles.closeText}>{t("done", "Done")}</Text>
				</TouchableOpacity>
			</View>

			{/* ✅ NEW: category cards */}
			<View style={styles.categorySection}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.categoryScrollContent}
				>
					{categories.map((category) => {
						const visual = getCategoryVisual(category);
						const isActive = selectedCategory === category;
						const count = getCategoryCount(category);

						return (
							<TouchableOpacity
								key={category}
								style={[
									styles.categoryCard,
									{ backgroundColor: visual.bg },
									isActive && styles.categoryCardActive,
								]}
								onPress={() => setSelectedCategory(category)}
								activeOpacity={0.85}
							>
								<View style={styles.categoryCardTop}>
									<Ionicons
										name={visual.icon}
										size={22}
										color={visual.iconColor}
									/>
									<Text style={styles.categoryCount}>{count}</Text>
								</View>
								<Text
									style={[
										styles.categoryCardText,
										isActive && styles.categoryCardTextActive,
									]}
									numberOfLines={2}
								>
									{category}
								</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>
			</View>

			<MenuItemsList
				menuItems={filteredMenuItems}
				isLoading={isLoadingMenu}
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						<Text style={styles.headerTitle}>
							{t("server_ordering_title", "Server Ordering")}
						</Text>
						<Text style={styles.headerSubtitle}>{tableName}</Text>
						<Text style={styles.categoryLabel}>
							{t("category", "Category")}: {selectedCategory}
						</Text>
					</View>
				}
				pips={[{ userId: currentUserData.uid, name: "Table Share" }]}
				onConfirmAddItemToContext={handleServerAddItem}
				orderingMode="party"
				partyData={{
					partyId: partyId,
					currentUserId: currentUserData.uid,
				}}
				selectedItems={selectedItems}
				onToggleItemSelection={toggleItemSelection}
			/>

			{pendingPreviewItems.length > 0 && (
				<View style={styles.pendingTray}>
					<Text style={styles.pendingTrayTitle}>
						{t("pending_items_title", "Pending Items")}
					</Text>

					<ScrollView
						style={styles.pendingTrayScroll}
						showsVerticalScrollIndicator={true}
						nestedScrollEnabled={true}
					>
						{pendingPreviewItems.map((pendingItem, itemIndex) => {
							const isLastItem = itemIndex === pendingPreviewItems.length - 1;

							return (
								<View
									key={pendingItem.key}
									style={[
										styles.pendingItemRow,
										isLastItem && styles.pendingItemRowLast,
									]}
								>
									<View style={styles.pendingItemDetails}>
										<Text style={styles.pendingItemName}>
											{pendingItem.quantity}x {pendingItem.name}
										</Text>

										{Array.isArray(pendingItem.modifiers) &&
											pendingItem.modifiers.length > 0 && (
												<View style={styles.pendingModifiersWrap}>
													{pendingItem.modifiers.map((modifier, modIndex) => (
														<Text
															key={`${modifier.optionId || modifier.name || "mod"}-${modIndex}`}
															style={styles.pendingModifierText}
														>
															•{" "}
															{typeof modifier.name === "string"
																? modifier.name
																: modifier.name?.en ||
																	modifier.name?.es ||
																	modifier.name?.original ||
																	""}
															{Number(modifier.price || 0) > 0
																? ` (+${formatCurrencyFromDollars(modifier.price)})`
																: ""}
														</Text>
													))}
												</View>
											)}
									</View>

									<TouchableOpacity
										onPress={() => {
											if (pendingItem.type === "quick") {
												removeQuickSelectedItem(pendingItem.id);
											} else {
												removeCustomizedItem(pendingItem.index);
											}
										}}
										style={styles.removePendingButton}
									>
										<Ionicons
											name="trash-outline"
											size={18}
											color={colors.statusDanger}
										/>
									</TouchableOpacity>
								</View>
							);
						})}
					</ScrollView>
				</View>
			)}

			{totalPendingCount > 0 && (
				<View style={styles.bulkAddContainer}>
					<TouchableOpacity
						style={styles.bulkAddButton}
						onPress={handleBulkServerAddItem}
						disabled={isAddingBulk}
					>
						{isAddingBulk ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<>
								<MaterialCommunityIcons name="fire" size={24} color="#fff" />
								<Text style={styles.bulkAddButtonText}>
									{t("fire_to_kitchen", "Fire to Kitchen")} ({totalPendingCount}
									)
								</Text>
							</>
						)}
					</TouchableOpacity>
				</View>
			)}

			{snackbar.visible && (
				<View pointerEvents="none" style={styles.toast}>
					<Text style={styles.toastText} numberOfLines={2}>
						{snackbar.message}
					</Text>
				</View>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.backgroundLight },
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	loadingText: { marginTop: 10, fontSize: 16, color: colors.textMedium },

	topNav: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		paddingHorizontal: 20,
		paddingVertical: 12,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		elevation: 2,
		zIndex: 10,
	},
	closeBtn: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.backgroundMedium,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
	},
	closeText: {
		fontSize: 16,
		color: colors.textDark,
		marginLeft: 4,
		fontWeight: "bold",
	},

	// ✅ NEW category styles
	categorySection: {
		backgroundColor: colors.surfaceWhite,
		paddingTop: 12,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	categoryScrollContent: {
		paddingHorizontal: 16,
	},
	categoryCard: {
		width: 124,
		height: 86,
		borderRadius: 14,
		marginRight: 10,
		padding: 12,
		justifyContent: "space-between",
		borderWidth: 1,
		borderColor: "transparent",
	},
	categoryCardActive: {
		borderColor: colors.primary,
	},
	categoryCardTop: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	categoryCount: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
	},
	categoryCardText: {
		fontSize: 14,
		fontWeight: "700",
		color: colors.textDark,
		lineHeight: 18,
	},
	categoryCardTextActive: {
		color: colors.primary,
	},

	headerContainer: { padding: 20 },
	headerTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
	},
	headerSubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 4,
	},
	categoryLabel: {
		fontSize: 14,
		color: colors.primary,
		textAlign: "center",
		marginTop: 8,
		fontWeight: "700",
	},

	bulkAddContainer: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: 20,
		paddingBottom: 35,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderColor: colors.borderLight,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.1,
		shadowRadius: 5,
		elevation: 10,
	},
	bulkAddButton: {
		flexDirection: "row",
		backgroundColor: colors.statusDanger || "#dc3545",
		padding: 16,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
	},
	bulkAddButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
		marginLeft: 10,
	},

	pendingTray: {
		marginHorizontal: 16,
		marginTop: 10,
		marginBottom: 110,
		padding: 14,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	pendingTrayTitle: {
		fontSize: 16,
		fontWeight: "700",
		color: colors.textDark,
		marginBottom: 10,
	},
	pendingTrayScroll: {
		maxHeight: 220,
	},
	pendingItemRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	pendingItemRowLast: {
		borderBottomWidth: 0,
	},
	pendingItemDetails: {
		flex: 1,
		paddingRight: 10,
	},
	pendingItemName: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textDark,
	},
	pendingModifiersWrap: {
		marginTop: 4,
	},
	pendingModifierText: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	removePendingButton: {
		padding: 6,
	},
	toast: {
		position: "absolute",
		left: 18,
		right: 18,
		bottom: 108,
		backgroundColor: colors.statusSuccess || "#16A34A",
		borderRadius: 10,
		paddingHorizontal: 16,
		paddingVertical: 13,
		elevation: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.18,
		shadowRadius: 8,
	},
	toastText: {
		color: "#FFFFFF",
		fontWeight: "700",
		fontSize: 15,
		textAlign: "center",
	},
});

export default ServerMenuScreen;
