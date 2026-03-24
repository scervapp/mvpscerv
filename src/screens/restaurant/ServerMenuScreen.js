// screens/restaurant/ServerMenuScreen.js
import React, { useState, useEffect, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	SafeAreaView,
	Alert,
	TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { db } from "../../config/firebase";
import { doc, updateDoc, arrayUnion } from "@react-native-firebase/firestore";
import { AuthContext } from "../../context/authContext";
import { fetchMenu } from "../../utils/customerUtils"; // Reusing your existing fetch function
import MenuItemsList from "../../components/customer/MenuItemsList";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { functions } from "../../config/firebase.native";
import { httpsCallable } from "@react-native-firebase/functions";

const ServerMenuScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();

	// Get the party ID and Restaurant ID passed from the ManagePartyScreen
	const { partyId, restaurantId, tableName } = route.params;
	const { currentUserData } = useContext(AuthContext);

	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);

	useEffect(() => {
		const handleServerAddItem = async (itemDataFromModal) => {
			const { menuItemDetails, quantity, specialInstructions } =
				itemDataFromModal;
			const { tableId, serverObj } = route.params; // Get the extra params we passed

			const serverName =
				`${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`.trim() ||
				"Server";

			const basketRef = doc(db, "shared_baskets", partyId);

			// 1. Structure the item EXACTLY how the Cloud Function expects it
			const newItem = {
				id: Math.random().toString(36).substr(2, 9),
				menuItemId: menuItemDetails.id,
				name: menuItemDetails.name,
				dishName: menuItemDetails.name, // Failsafe for the CF
				price: menuItemDetails.price,
				category: menuItemDetails.category || "Uncategorized",
				quantity: quantity,
				specialInstructions: specialInstructions || "",
				orderedByUserId: currentUserData.uid, // MUST be orderedByUserId for the CF filter!
				orderedByPipName: `Server: ${serverName}`,
				restaurantId: restaurantId, // MUST be here so the CF knows where to send the ticket!
				status: "new", // MUST be "new" so the CF picks it up
				addedAt: new Date().toISOString(),
			};

			try {
				// 2. Add the item to the basket as "new"
				await updateDoc(basketRef, {
					items: arrayUnion(newItem),
					lastUpdated: new Date(),
				});

				// 3. IMMEDIATELY call the Cloud Function to send it to the kitchen!
				const sendOrderToKitchen = httpsCallable(
					functions,
					"sendOrderToKitchen",
				);
				await sendOrderToKitchen({
					sourceId: partyId,
					table: { id: tableId, name: tableName },
					server: serverObj || { id: currentUserData.uid, name: serverName }, // Fallback to current user if table has no server yet
					allowedUserIds: [currentUserData.uid], // Only process the item the server JUST added
				});

				Alert.alert(
					t("success", "Success"),
					`${quantity}x ${menuItemDetails.name} sent to kitchen!`,
					[{ text: "OK" }],
				);
			} catch (error) {
				console.error("Error adding item or sending to kitchen: ", error);
				Alert.alert(
					t("error", "Error"),
					t("failed_to_add", "Failed to send item to the kitchen."),
				);
			}
		};

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
	}, [restaurantId]);

	// This handles the payload coming back from your MenuItemsList modal
	const handleServerAddItem = async (itemDataFromModal) => {
		const { menuItemDetails, quantity, specialInstructions } =
			itemDataFromModal;
		const { tableId, serverObj } = route.params; // Get the extra params we passed

		const serverName =
			`${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`.trim() ||
			"Server";

		const basketRef = doc(db, "shared_baskets", partyId);

		// 1. Structure the item EXACTLY how the Cloud Function expects it
		const newItem = {
			id: Math.random().toString(36).substr(2, 9),
			menuItemId: menuItemDetails.id,
			name: menuItemDetails.name,
			dishName: menuItemDetails.name, // Failsafe for the CF
			price: menuItemDetails.price,
			category: menuItemDetails.category || "Uncategorized",
			quantity: quantity,
			specialInstructions: specialInstructions || "",
			orderedByUserId: currentUserData.uid, // MUST be orderedByUserId for the CF filter!
			orderedByPipName: `Server: ${serverName}`,
			restaurantId: restaurantId, // MUST be here so the CF knows where to send the ticket!
			status: "new", // MUST be "new" so the CF picks it up
			addedAt: new Date().toISOString(),
		};

		try {
			// 2. Add the item to the basket as "new"
			await updateDoc(basketRef, {
				items: arrayUnion(newItem),
				lastUpdated: new Date(),
			});

			// 3. IMMEDIATELY call the Cloud Function to send it to the kitchen!
			const sendOrderToKitchen = httpsCallable(functions, "sendOrderToKitchen");
			await sendOrderToKitchen({
				sourceId: partyId,
				table: { id: tableId, name: tableName },
				server: serverObj || { id: currentUserData.uid, name: serverName }, // Fallback to current user if table has no server yet
				allowedUserIds: [currentUserData.uid], // Only process the item the server JUST added
			});

			Alert.alert(
				t("success", "Success"),
				`${quantity}x ${menuItemDetails.name} sent to kitchen!`,
				[{ text: "OK" }],
			);
		} catch (error) {
			console.error("Error adding item or sending to kitchen: ", error);
			Alert.alert(
				t("error", "Error"),
				t("failed_to_add", "Failed to send item to the kitchen."),
			);
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
				// We fake the pips so the server can just select "Server" or "Guest"
				// when prompted "Who is this for?" by your modal.
				pips={[{ userId: currentUserData.uid, name: "Table Share" }]}
				onConfirmAddItemToContext={handleServerAddItem}
				orderingMode="party"
				partyData={{
					partyId: partyId,
					currentUserId: currentUserData.uid,
				}}
			/>
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
		justifyContent: "flex-end", // Puts the Done button on the right
		paddingHorizontal: 20,
		paddingVertical: 12,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		elevation: 2,
		zIndex: 10, // Keeps it above the scrolling menu
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
});

export default ServerMenuScreen;
