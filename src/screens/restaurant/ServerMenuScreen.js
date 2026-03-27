// screens/restaurant/ServerMenuScreen.js
import React, { useState, useEffect, useContext, useCallback } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	SafeAreaView,
	Alert,
	TouchableOpacity,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { db } from "../../config/firebase";
import { doc, updateDoc, arrayUnion } from "@react-native-firebase/firestore";
import { AuthContext } from "../../context/authContext";
import { fetchMenu } from "../../utils/customerUtils";
import MenuItemsList from "../../components/customer/MenuItemsList";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { functions } from "../../config/firebase.native";
import { httpsCallable } from "@react-native-firebase/functions";

const ServerMenuScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();

	const { partyId, restaurantId, tableName, tableId, serverObj } = route.params;
	const { currentUserData } = useContext(AuthContext);

	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);

	// 🚨 STATE: Quick-select checkbox items
	const [selectedItems, setSelectedItems] = useState({});

	// 🚨 NEW STATE: Items customized via the modal (qty, instructions)
	const [customizedItems, setCustomizedItems] = useState([]);

	const [isAddingBulk, setIsAddingBulk] = useState(false);

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
				setMenuItems(fetchedMenu);
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

	const toggleItemSelection = useCallback((itemId) => {
		setSelectedItems((prev) => ({
			...prev,
			[itemId]: !prev[itemId],
		}));
	}, []);

	// 🚨 UPDATED: This now ONLY saves to local state, just like checkboxes!
	const handleServerAddItem = async (itemDataFromModal) => {
		// Save the customized item to our local array.
		// MenuItemsList will automatically close the modal and show a success snackbar.
		setCustomizedItems((prev) => [...prev, itemDataFromModal]);

		// Notice we REMOVED the database write and navigation.goBack() from here!
	};

	// 🚨 UPDATED: The Bulk Add Function now processes BOTH arrays
	const handleBulkServerAddItem = async () => {
		const quickAddItems = menuItems.filter((item) => selectedItems[item.id]);

		if (quickAddItems.length === 0 && customizedItems.length === 0) return;

		setIsAddingBulk(true);

		// 🚨 THE FIX: Explicitly define displayName using the guestName from route.params
		const { guestName, serverObj } = route.params;
		const displayName = guestName || "Server";

		const basketRef = doc(db, "shared_baskets", partyId);

		try {
			// 1. Map the quick-select checkbox items
			const newItemsArray = quickAddItems.map((item) => ({
				id: Math.random().toString(36).substr(2, 9),
				menuItemId: item.id,
				name: item.name,
				dishName: item.name,
				price: item.price,
				category: item.category || "Uncategorized",
				quantity: 1,
				specialInstructions: "",
				orderedByUserId: currentUserData.uid,
				orderedByPipName: displayName, // 🚨 Successfully uses displayName
				restaurantId: restaurantId,
				status: "new",
				addedAt: new Date().toISOString(),
			}));

			// 2. Map the customized items from the modal
			const customItemsArray = customizedItems.map((customItem) => ({
				id: Math.random().toString(36).substr(2, 9),
				menuItemId: customItem.menuItemDetails.id,
				name: customItem.menuItemDetails.name,
				dishName: customItem.menuItemDetails.name,
				price: customItem.menuItemDetails.price,
				category: customItem.menuItemDetails.category || "Uncategorized",
				quantity: customItem.quantity,
				specialInstructions: customItem.specialInstructions || "",
				orderedByUserId: currentUserData.uid,
				orderedByPipName: displayName, // 🚨 Successfully uses displayName
				restaurantId: restaurantId,
				status: "new",
				addedAt: new Date().toISOString(),
			}));

			// 3. Combine both arrays into one giant ticket
			const allItemsToFire = [...newItemsArray, ...customItemsArray];

			// 4. Push ALL items to Firestore in one atomic operation
			await updateDoc(basketRef, {
				items: arrayUnion(...allItemsToFire),
				lastUpdated: new Date(),
			});

			// 5. Fire the Cloud Function ONE time
			const serverName =
				`${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`.trim() ||
				"Server";
			const sendOrderToKitchen = httpsCallable(functions, "sendOrderToKitchen");

			await sendOrderToKitchen({
				sourceId: partyId,
				table: { id: tableId, name: tableName },
				server: serverObj || { id: currentUserData.uid, name: serverName },
				allowedUserIds: [currentUserData.uid],
			});

			// Clean up state
			setSelectedItems({});
			setCustomizedItems([]);

			Alert.alert(
				t("success", "Success"),
				`${allItemsToFire.length} items sent to kitchen!`,
				[{ text: "OK" }],
			);

			navigation.goBack();
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

	// Combine the count of checked items AND customized modal items
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

			<MenuItemsList
				menuItems={menuItems}
				isLoading={isLoadingMenu}
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						<Text style={styles.headerTitle}>Server Ordering</Text>
						<Text style={styles.headerSubtitle}>{tableName}</Text>
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

			{/* 🚨 THE BULK "FIRE TO KITCHEN" BUTTON */}
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
									Fire to Kitchen ({totalPendingCount})
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
	screen: { flex: 1, backgroundColor: colors.backgroundLight },
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	loadingText: { marginTop: 10, fontSize: 16, color: colors.textMedium },
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
});

export default ServerMenuScreen;
