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
import MenuItemsList from "../../components/customer/MenuItemsList";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import { fetchMenu } from "../../utils/customerUtils";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const PartyMenuScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();
	const { partyId, restaurantId } = route.params;

	const { addItemToPartyBasket, isLoadingParty, partyDetails } = useParty();

	const { currentUserData } = useContext(AuthContext);

	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);

	// 🚨 STATE: Quick-select checkbox items
	const [selectedItems, setSelectedItems] = useState({});

	// 🚨 NEW STATE: Items customized via the modal (qty, instructions)
	const [customizedItems, setCustomizedItems] = useState([]);

	const [isAddingBulk, setIsAddingBulk] = useState(false);

	useEffect(() => {
		if (
			partyDetails[partyId]?.id === partyId &&
			partyDetails[partyId]?.restaurantName
		) {
			navigation.setOptions({
				title: `${t("add_to_party_at")} ${
					partyDetails[partyId].restaurantName
				}`,
			});
		}
	}, [partyId, partyDetails[partyId]?.restaurantName, navigation]);

	useEffect(() => {
		let isMounted = true;
		const loadMenu = async () => {
			const restId =
				partyDetails[partyId]?.restaurantId || route.params?.restaurantId;
			if (!restId || partyDetails[partyId]?.id !== partyId) {
				if (isMounted) setIsLoadingMenu(false);
				Alert.alert(t("error"), t("restaurant_id_or_party_details_missing"));
				return;
			}
			setIsLoadingMenu(true);
			try {
				const fetchedMenu = await fetchMenu(restId);
				if (isMounted) setMenuItems(fetchedMenu);
			} catch (error) {
				console.error("PartyMenuScreen: Error fetching menu:", error);
				Alert.alert(t("error"), t("could_not_load_menu_items"));
			} finally {
				if (isMounted) setIsLoadingMenu(false);
			}
		};
		loadMenu();
		return () => {
			isMounted = false;
		};
	}, [partyId, partyDetails, route.params?.restaurantId]);

	const toggleItemSelection = useCallback((itemId) => {
		setSelectedItems((prev) => ({
			...prev,
			[itemId]: !prev[itemId],
		}));
	}, []);

	// 🚨 UPDATED: This now ONLY saves to local state! No database writes here.
	const handleConfirmAddItemToPartyContext = useCallback(
		(itemDataFromModal) => {
			setCustomizedItems((prev) => [...prev, itemDataFromModal]);
		},
		[],
	);

	// 🚨 UPDATED: Bulk Add now loops through BOTH arrays and sends them at once
	const handleBulkAddSelectedItems = async () => {
		if (!partyId || !currentUserData?.uid) return;

		const quickAddItems = menuItems.filter((item) => selectedItems[item.id]);

		if (quickAddItems.length === 0 && customizedItems.length === 0) return;

		setIsAddingBulk(true);
		try {
			// 1. Process Quick Add (Checkboxes)
			for (const item of quickAddItems) {
				// 🚨 NEW: Look for fullName first, then firstName, then fallback to "Myself"
				const myName =
					currentUserData?.fullName ||
					currentUserData?.firstName ||
					t("myself", "Myself");

				const partyAddItemData = {
					partyId: partyId,
					orderingForUserId: currentUserData.uid,
					orderingForPipName: myName, // 🚨 Updated
				};

				const itemDetailsForPartyContext = {
					id: item.id,
					name: item.name,
					price: item.price,
					category: item.category,
					quantity: 1,
					specialInstructions: "",
					restaurantId: item.restaurantId,
				};

				await addItemToPartyBasket(
					partyAddItemData,
					itemDetailsForPartyContext,
				);
			}

			// 2. Process Customized Items (Modal)
			for (const customItem of customizedItems) {
				const partyAddItemData = {
					partyId: customItem.partyContextData.partyId,
					orderingForUserId: customItem.partyContextData.currentUserId,
					orderingForPipName: customItem.partyContextData.orderingForPipName,
				};

				const itemDetailsForPartyContext = {
					id: customItem.menuItemDetails.id,
					name: customItem.menuItemDetails.name,
					price: customItem.menuItemDetails.price,
					category: customItem.menuItemDetails.category,
					quantity: customItem.quantity,
					specialInstructions: customItem.specialInstructions,
					restaurantId: customItem.menuItemDetails.restaurantId,
				};

				await addItemToPartyBasket(
					partyAddItemData,
					itemDetailsForPartyContext,
				);
			}

			// 3. Clear State and Navigate
			setSelectedItems({});
			setCustomizedItems([]);

			navigation.goBack();
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
	};

	const partyMembersForModal = useMemo(() => {
		return partyDetails[partyId]?.guestPips || [];
	}, [partyId, partyDetails]);

	if (isLoadingParty || !partyDetails[partyId] || isLoadingMenu) {
		return (
			<SafeAreaView style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary || "#2196F3"} />
				<Text style={styles.loadingText}>
					{isLoadingMenu ? t("loading_menu") : t("syncing_party_details")}...
				</Text>
			</SafeAreaView>
		);
	}

	// 🚨 Calculate the total number of pending items
	const selectedCount = Object.values(selectedItems).filter(Boolean).length;
	const totalPendingCount = selectedCount + customizedItems.length;

	return (
		<SafeAreaView style={styles.screen}>
			<MenuItemsList
				menuItems={menuItems}
				isLoading={isLoadingMenu}
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						<Text style={styles.headerTitle}>{t("order_for_party")}</Text>
						<Text style={styles.headerSubtitle}>
							{t("at")} {partyDetails[partyId].restaurantName}
						</Text>
					</View>
				}
				pips={partyMembersForModal}
				onConfirmAddItemToContext={handleConfirmAddItemToPartyContext}
				orderingMode="party"
				partyData={{
					partyId: partyId,
					currentUserId: currentUserData.uid,
				}}
				selectedItems={selectedItems}
				onToggleItemSelection={toggleItemSelection}
			/>

			{/* 🚨 UPDATED BOTTOM BUTTON */}
			{totalPendingCount > 0 && (
				<View style={styles.bulkAddContainer}>
					<TouchableOpacity
						style={styles.bulkAddButton}
						onPress={handleBulkAddSelectedItems}
						disabled={isAddingBulk}
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
									{t("add_to_basket", "Add to Basket")} ({totalPendingCount})
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
	},
	loadingText: { marginTop: 10, fontSize: 16, color: colors.textMedium },
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
	bulkAddButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
		marginLeft: 10,
	},
});

export default PartyMenuScreen;
