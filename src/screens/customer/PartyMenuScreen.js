// screens/customer/PartyMenuScreen.js (NEW FILE)
import React, { useState, useEffect, useContext, useCallback } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	SafeAreaView,
	Alert,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import MenuItemsList from "../../components/customer/MenuItemsList";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import { fetchMenu } from "../../utils/customerUtils";
import colors from "../../utils/styles/appStyles";

const PartyMenuScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const {
		restaurantId,
		restaurantName,
		partyContextData, // { partyId, orderingForUserId, orderingForPipName (initial) }
		userPips, // Current user's local PIPs list
	} = route.params;

	const { addItemToPartyBasket, isLoadingParty } = useParty(); // isLoadingParty for context actions
	const { currentUserData } = useContext(AuthContext);

	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);

	useEffect(() => {
		navigation.setOptions({ title: `Menu: ${restaurantName}` });
		let isMounted = true;
		const loadMenu = async () => {
			if (!restaurantId) {
				if (isMounted) setIsLoadingMenu(false);
				Alert.alert("Error", "Restaurant ID is missing.");
				return;
			}
			setIsLoadingMenu(true);
			try {
				const fetchedMenu = await fetchMenu(restaurantId);
				if (isMounted) setMenuItems(fetchedMenu);
			} catch (error) {
				console.error("PartyMenuScreen: Error fetching menu:", error);
				Alert.alert("Error", "Could not load menu items.");
			} finally {
				if (isMounted) setIsLoadingMenu(false);
			}
		};
		loadMenu();
		return () => {
			isMounted = false;
		};
	}, [restaurantId, restaurantName, navigation]);

	const handleConfirmAddItemToPartyBasket = useCallback(
		async (itemDataFromModal) => {
			// itemDataFromModal from SelectedItemModal contains:
			// { selectedItem (core menu item), quantity, specialInstructions,
			//   chosenPartyTargetName (if party mode from SelectedItemModal) }

			if (!currentUserData?.uid) {
				Alert.alert("Login Required", "Please log in to add items.");
				return;
			}
			if (!partyContextData || !partyContextData.partyId) {
				Alert.alert("Error", "Party information is missing.");
				return;
			}

			const { menuItemDetails, quantity } = itemDataFromModal; // menuItemDetails is the new structure

			try {
				const partyAddItemData = {
					partyId: partyContextData.partyId,
					orderingForUserId: partyContextData.orderingForUserId, // Logged-in user
					orderingForPipName: itemDataFromModal.chosenPartyTargetName, // From SelectedItemModal
				};
				const itemDetailsForPartyContext = {
					// Structure for PartyContext.addItemToPartyBasket
					id: menuItemDetails.id, // This is the menuItemId
					name: menuItemDetails.name,
					price: menuItemDetails.price,
					quantity: quantity,
					specialInstructions: itemDataFromModal.specialInstructions, // From SelectedItemModal (per target)
					// Include any other fields from menuItemDetails your CF needs
					category: menuItemDetails.category,
					imageUri: menuItemDetails.imageUri,
				};

				console.log(
					"PartyMenuScreen: Calling PartyContext.addItemToPartyBasket with:",
					partyAddItemData,
					itemDetailsForPartyContext
				);
				const addedPartyItemId = await addItemToPartyBasket(
					partyAddItemData,
					itemDetailsForPartyContext
				);

				if (addedPartyItemId) {
					console.log(
						"PartyMenuScreen: Item added to party basket successfully:",
						addedPartyItemId
					);
					// MenuItemsList will show its own snackbar.
					// You could navigate back to PartySessionScreen or allow adding more items.
					// For now, let's assume they stay on the menu.
				} else {
					// Error alert likely handled by PartyContext
					console.log(
						"PartyMenuScreen: Failed to add item to party basket (context likely handled error)."
					);
				}
			} catch (error) {
				console.error(
					"PartyMenuScreen: Error in addItemToPartyBasket call:",
					error
				);
				Alert.alert("Error", "Could not add item to party basket.");
			}
		},
		[currentUserData?.uid, partyContextData, addItemToPartyBasket]
	);

	if (isLoadingMenu && menuItems.length === 0) {
		// Show loader only if menu is truly empty and loading
		return (
			<SafeAreaView style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text>Loading menu...</Text>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.screen}>
			<MenuItemsList
				menuItems={menuItems}
				isLoading={isLoadingMenu} // Let MenuItemsList handle its internal display based on this
				pips={userPips} // Pass current user's PIPs for "Order For" dropdown in modal
				onConfirmAddItemToContext={handleConfirmAddItemToPartyBasket}
				orderingMode="party" // Explicitly set to party mode
				partyContextData={partyContextData} // Pass the necessary party context
				// restaurantId is not strictly needed by MenuItemsList if onConfirm handles everything,
				// but SelectedItemModal might use it if it were for individual mode.
				// For party mode, partyContextData.partyId is key.
			/>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.backgroundLight, // Use your theme
	},
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	// Add any other specific styles for PartyMenuScreen if needed
});

export default PartyMenuScreen;
