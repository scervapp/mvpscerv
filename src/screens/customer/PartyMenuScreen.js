// screens/customer/PartyMenuScreen.js
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
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import MenuItemsList from "../../components/customer/MenuItemsList";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import { fetchMenu } from "../../utils/customerUtils";
import colors from "../../utils/styles/appStyles";

const PartyMenuScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();

	const partyId = route.params?.partyId || null;
	const fallbackRestaurantId = route.params?.restaurantId || null;

	const { addItemToPartyBasket, isLoadingParty, partyDetails } = useParty();
	const { currentUserData } = useContext(AuthContext);

	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);
	const [selectedItems, setSelectedItems] = useState({});
	const [customizedItems, setCustomizedItems] = useState([]);
	const [isAddingBulk, setIsAddingBulk] = useState(false);

	const activeParty = partyId ? partyDetails?.[partyId] || null : null;
	const isPickupMode = activeParty?.orderMode === "pickup";
	const resolvedRestaurantId =
		activeParty?.restaurantId || fallbackRestaurantId || null;
	const restaurantName =
		activeParty?.restaurantName ||
		route.params?.restaurantName ||
		t("restaurant", "Restaurant");

	const getItbmsRateFromCategory = (categoryValue) => {
		const category = String(categoryValue || "")
			.trim()
			.toLowerCase();

		const isAlcohol =
			category === "beer" ||
			category === "wine" ||
			category === "cocktails" ||
			category === "spirits" ||
			category === "alcoholic drinks";

		return isAlcohol ? 10 : 7;
	};

	useEffect(() => {
		if (!partyId) {
			navigation.setOptions({
				title: t("menu", "Menu"),
			});
			return;
		}

		if (isPickupMode) {
			navigation.setOptions({
				title: t("pickup_order", "Pickup Order"),
			});
			return;
		}

		if (activeParty?.restaurantName) {
			navigation.setOptions({
				title: `${t("add_to_party_at", "Add to Party at")} ${activeParty.restaurantName}`,
			});
			return;
		}

		navigation.setOptions({
			title: t("menu", "Menu"),
		});
	}, [partyId, isPickupMode, activeParty?.restaurantName, navigation, t]);

	useEffect(() => {
		let isMounted = true;

		const loadMenu = async () => {
			if (!partyId) {
				if (isMounted) {
					setIsLoadingMenu(false);
					Alert.alert(
						t("error", "Error"),
						t("party_details_missing", "Party details are missing."),
					);
				}
				return;
			}

			// For pickup, allow loading as soon as we know the restaurant ID.
			// For dine-in, require the full party object to be present in context.
			// ✅ Pickup: only need restaurantId
			if (!partyId) {
				setIsLoadingMenu(false);
				return;
			}

			if (isPickupMode) {
				// For pickup: only need restaurantId
				if (!resolvedRestaurantId) {
					// ⛔ WAIT instead of erroring
					return;
				}
			} else {
				// For dine-in: wait for full party hydration
				if (!resolvedRestaurantId || !activeParty) {
					return;
				}
			}

			setIsLoadingMenu(true);

			try {
				const fetchedMenu = await fetchMenu(resolvedRestaurantId);

				if (!isMounted) return;

				setMenuItems(Array.isArray(fetchedMenu) ? fetchedMenu : []);
			} catch (error) {
				console.error("PartyMenuScreen: Error fetching menu:", error);

				if (isMounted) {
					Alert.alert(
						t("error", "Error"),
						t("could_not_load_menu_items", "Could not load menu items."),
					);
				}
			} finally {
				if (isMounted) {
					setIsLoadingMenu(false);
				}
			}
		};

		loadMenu();

		return () => {
			isMounted = false;
		};
	}, [partyId, resolvedRestaurantId, isPickupMode, activeParty, t]);

	const toggleItemSelection = useCallback((itemId) => {
		setSelectedItems((prev) => ({
			...prev,
			[itemId]: !prev[itemId],
		}));
	}, []);

	const handleConfirmAddItemToPartyContext = useCallback(
		(itemDataFromModal) => {
			setCustomizedItems((prev) => [...prev, itemDataFromModal]);
		},
		[],
	);

	const handleBulkAddSelectedItems = useCallback(async () => {
		if (!partyId || !currentUserData?.uid) return;

		const quickAddItems = menuItems.filter((item) => selectedItems[item.id]);

		if (quickAddItems.length === 0 && customizedItems.length === 0) return;

		setIsAddingBulk(true);

		try {
			const myName =
				currentUserData?.fullName ||
				currentUserData?.firstName ||
				t("myself", "Myself");

			// 1. Quick-select items (simple items, no custom modifier selections)
			for (const item of quickAddItems) {
				const partyAddItemData = {
					partyId,
					orderingForUserId: currentUserData.uid,
					orderingForPipName: myName,
				};

				const itemDetailsForPartyContext = {
					id: item.id,
					name: item.name,
					price: item.price,
					basePrice: item.price || 0,
					modifiersTotal: 0,
					selectedModifiers: [],
					category: item.category,
					quantity: 1,
					specialInstructions: "",
					restaurantId: item.restaurantId || resolvedRestaurantId,
					imageUri: item.imageUri || item.image || null,
					itbmsRate: getItbmsRateFromCategory(item.category),
				};

				await addItemToPartyBasket(
					partyAddItemData,
					itemDetailsForPartyContext,
				);
			}

			// 2. Customized items from modal
			for (const customItem of customizedItems) {
				const partyAddItemData = {
					partyId: customItem?.partyContextData?.partyId || partyId,
					orderingForUserId:
						customItem?.partyContextData?.currentUserId || currentUserData.uid,
					orderingForPipName:
						customItem?.partyContextData?.orderingForPipName || myName,
				};

				const itemDetailsForPartyContext = {
					id: customItem?.menuItemDetails?.id,
					name: customItem?.menuItemDetails?.name,

					price:
						customItem?.menuItemDetails?.finalUnitPrice !== undefined &&
						customItem?.menuItemDetails?.finalUnitPrice !== null
							? customItem.menuItemDetails.finalUnitPrice
							: customItem?.menuItemDetails?.price,

					basePrice:
						customItem?.menuItemDetails?.basePrice !== undefined &&
						customItem?.menuItemDetails?.basePrice !== null
							? customItem.menuItemDetails.basePrice
							: customItem?.menuItemDetails?.price || 0,

					modifiersTotal:
						customItem?.menuItemDetails?.modifiersTotal !== undefined &&
						customItem?.menuItemDetails?.modifiersTotal !== null
							? customItem.menuItemDetails.modifiersTotal
							: 0,

					selectedModifiers: Array.isArray(
						customItem?.menuItemDetails?.selectedModifiers,
					)
						? customItem.menuItemDetails.selectedModifiers
						: [],

					category: customItem?.menuItemDetails?.category,
					quantity: customItem?.quantity || 1,
					specialInstructions: customItem?.specialInstructions || "",
					restaurantId:
						customItem?.menuItemDetails?.restaurantId || resolvedRestaurantId,
					imageUri:
						customItem?.menuItemDetails?.imageUri ||
						customItem?.menuItemDetails?.image ||
						null,
					itbmsRate: getItbmsRateFromCategory(
						customItem?.menuItemDetails?.category,
					),
				};

				await addItemToPartyBasket(
					partyAddItemData,
					itemDetailsForPartyContext,
				);
			}

			setSelectedItems({});
			setCustomizedItems([]);

			if (isPickupMode) {
				navigation.navigate("PickupCart", {
					partyId,
					restaurantId: resolvedRestaurantId,
				});
			} else {
				navigation.goBack();
			}
		} catch (error) {
			console.error("Error bulk adding items:", error);
			Alert.alert(
				t("error", "Error"),
				t(
					"could_not_add_all_items",
					"Could not add all items. Please try again.",
				),
			);
		} finally {
			setIsAddingBulk(false);
		}
	}, [
		partyId,
		currentUserData?.uid,
		currentUserData?.fullName,
		currentUserData?.firstName,
		menuItems,
		selectedItems,
		customizedItems,
		addItemToPartyBasket,
		isPickupMode,
		navigation,
		resolvedRestaurantId,
		t,
	]);

	const partyMembersForModal = useMemo(() => {
		if (isPickupMode) return [];
		return activeParty?.guestPips || [];
	}, [isPickupMode, activeParty?.guestPips]);

	const selectedCount = useMemo(() => {
		return Object.values(selectedItems).filter(Boolean).length;
	}, [selectedItems]);

	const totalPendingCount = selectedCount + customizedItems.length;

	// Only use the full-screen party loader before the party is hydrated.
	// Basket writes also flip the party action loading flag, but the menu should stay
	// visible while an item is being added so the experience feels immediate.
	const shouldShowInitialLoader =
		isLoadingMenu || (!isPickupMode && !activeParty && isLoadingParty);

	if (shouldShowInitialLoader) {
		return (
			<SafeAreaView style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary || "#2196F3"} />
				<Text style={styles.loadingText}>
					{isLoadingMenu
						? `${t("loading_menu", "Loading menu")}...`
						: `${t("getting_party_ready", "Getting your party ready")}...`}
				</Text>
			</SafeAreaView>
		);
	}

	if (!partyId || !resolvedRestaurantId) {
		return (
			<SafeAreaView style={styles.centeredScreen}>
				<MaterialCommunityIcons
					name="alert-circle-outline"
					size={52}
					color={colors.statusDanger}
				/>
				<Text style={styles.errorTitle}>{t("error", "Error")}</Text>
				<Text style={styles.errorText}>
					{t(
						"restaurant_id_or_party_details_missing",
						"Restaurant or party details are missing.",
					)}
				</Text>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.screen}>
			<MenuItemsList
				menuItems={menuItems}
				isLoading={isLoadingMenu}
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						<Text style={styles.headerTitle}>
							{isPickupMode
								? t("pickup_order", "Pickup Order")
								: t("add_food", "Add food")}
						</Text>
						<Text style={styles.headerSubtitle}>
							{t("at", "At")} {restaurantName}
						</Text>
					</View>
				}
				pips={partyMembersForModal}
				onConfirmAddItemToContext={handleConfirmAddItemToPartyContext}
				orderingMode="party"
				partyData={{
					partyId,
					currentUserId: currentUserData?.uid,
				}}
				selectedItems={selectedItems}
				onToggleItemSelection={toggleItemSelection}
			/>

			{totalPendingCount > 0 && (
				<View style={styles.bulkAddContainer}>
					<TouchableOpacity
						style={[
							styles.bulkAddButton,
							isAddingBulk && styles.bulkAddButtonDisabled,
						]}
						onPress={handleBulkAddSelectedItems}
						disabled={isAddingBulk}
						activeOpacity={0.85}
					>
						{isAddingBulk ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<>
								<MaterialCommunityIcons
									name="basket-plus"
									size={24}
									color="#fff"
								/>
								<Text style={styles.bulkAddButtonText}>
									{t("add_to_order", "Add to order")} ({totalPendingCount})
								</Text>
							</>
						)}
					</TouchableOpacity>
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
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 24,
	},
	loadingText: {
		marginTop: 10,
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
	},
	errorTitle: {
		marginTop: 12,
		fontSize: 20,
		fontWeight: "700",
		color: colors.textDark,
		textAlign: "center",
	},
	errorText: {
		marginTop: 8,
		fontSize: 15,
		color: colors.textMedium,
		textAlign: "center",
	},
	headerContainer: {
		padding: 20,
	},
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
		backgroundColor: colors.primary,
		padding: 16,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
	},
	bulkAddButtonDisabled: {
		opacity: 0.8,
	},
	bulkAddButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
		marginLeft: 10,
	},
});

export default PartyMenuScreen;
