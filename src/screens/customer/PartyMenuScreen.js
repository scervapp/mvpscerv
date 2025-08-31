// screens/customer/PartyMenuScreen.js (NEW FILE)
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
	ScrollView,
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
	const { partyId } = route.params;

	const { addItemToPartyBasket, isLoadingParty, partyDetails, currentPartyId } =
		useParty(); // isLoadingParty for context actions
	const { currentUserData } = useContext(AuthContext);

	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);

	useEffect(() => {
		// Update header with restaurant name from the live party details
		if (partyDetails?.id === partyId && partyDetails?.restaurantName) {
			navigation.setOptions({
				title: `Add to Party @ ${partyDetails.restaurantName}`,
			});
		}
	}, [partyId, partyDetails?.restaurantName, navigation]);

	// This effect fetches the menu, but only if the context has loaded the correct party details.
	useEffect(() => {
		let isMounted = true;
		const loadMenu = async () => {
			if (partyDetails?.id !== partyId || !partyDetails?.restaurantId) {
				if (isMounted) setIsLoadingMenu(false);
				Alert.alert("Error", "Restaurant ID is missing.");
				return;
			}
			setIsLoadingMenu(true);
			try {
				const fetchedMenu = await fetchMenu(partyDetails.restaurantId);
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
	}, [partyId, partyDetails.restaurantId]);

	const handleConfirmAddItemToPartyContext = useCallback(
		async (itemDataFromModal) => {
			// Log 1: Confirm this function is now being entered

			if (!partyId || !currentUserData?.uid || !addItemToPartyBasket) {
				console.error(
					"PartyMenuScreen: Missing critical data for add item call.",
					{
						partyId,
						uid: currentUserData?.uid,
						funcExists: !!addItemToPartyBasket,
					}
				);
				Alert.alert(
					"Error",
					"Cannot add item at this time. Party information is missing."
				);
				return;
			}

			const {
				menuItemDetails,
				quantity,
				specialInstructions,
				partyContextData,
			} = itemDataFromModal;

		

			const partyAddItemData = {
				partyId: partyContextData.partyId,
				orderingForUserId: partyContextData.currentUserId,
				orderingForPipName: partyContextData.orderingForPipName, // Now correctly accessed from the nested object
			};

			const itemDetailsForPartyContext = {
				id: menuItemDetails.id,
				name: menuItemDetails.name,
				price: menuItemDetails.price,
				category: menuItemDetails.category,
				quantity,
				specialInstructions,
				restaurantId: menuItemDetails.restaurantId,
			};

			// Log 2: Log the data just before calling the context
			console.log(
				"PartyMenuScreen: About to call PartyContext.addItemToPartyBasket with partyData:",
				JSON.stringify(partyAddItemData, null, 2)
			);

			try {
				await addItemToPartyBasket(
					partyAddItemData,
					itemDetailsForPartyContext
				);
			} catch (error) {
				// Context function should handle alerts, but we can log here
				console.error(
					"PartyMenuScreen: Error returned from addItemToPartyBasket context call:",
					error
				);
			}
		},
		[
			partyId, // The ID from the route, this is stable
			currentUserData?.uid, // The current user's ID
			addItemToPartyBasket, // The function from the context
		]
	); // Dependency array ensures function is recreated only if these values change

	// Construct the list of people to order for from the current party members
	const partyMembersForModal = useMemo(() => {
		// Only provide the member list if the context's party matches this screen's party
		if (partyDetails?.id !== partyId) return [];
		return partyDetails.guestPips || [];
	}, [partyId, partyDetails?.guestPips]);

	// Show a loading indicator if the context is loading OR if the context's party ID
	// does not match the one this screen was opened for.
	if (isLoadingParty || currentPartyId !== partyId) {
		return (
			<SafeAreaView style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>Syncing Party Details...</Text>
			</SafeAreaView>
		);
	}

	// Once context is synced, we might still be loading the menu
	if (isLoadingMenu) {
		return (
			<SafeAreaView style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>Loading Menu...</Text>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.screen}>
			<MenuItemsList
				// Data
				menuItems={menuItems}
				isLoading={isLoadingMenu}
				// Header (can be simple text or a more complex component)
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						<Text style={styles.headerTitle}>Order for Party</Text>
						<Text style={styles.headerSubtitle}>
							at {partyDetails.restaurantName}
						</Text>
					</View>
				}
				// Props for Functionality
				pips={partyMembersForModal}
				onConfirmAddItemToContext={handleConfirmAddItemToPartyContext}
				orderingMode="party" // CRITICAL: This tells the modal how to behave
				// This is the data the modal needs to correctly add an item to the party
				partyData={{
					partyId: partyId,
					currentUserId: currentUserData.uid,
				}}
			/>
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
	// Add any other specific styles for PartyMenuScreen if needed
});

export default PartyMenuScreen;
