import React, { useContext, useEffect } from "react";

import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { enableScreens } from "react-native-screens";
import { useTranslation } from "react-i18next";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// Import your screen components and stack navigator functions

import CustomerDashboard from "../screens/customer/CustomerDashboard";
import CustomerProfile from "../screens/customer/CustomerProfile";
import RestaurantDetail from "../components/customer/RestaurantDetail";
import BasketScreen from "../screens/customer/BasketScreen";

import AccountScreen from "../screens/customer/AccountScreen";
import PIPSListScreen from "../screens/customer/PIPScreen";
import CheckoutScreen from "../screens/customer/CheckoutScreen";
import OrderConfirmationScreen from "../screens/customer/OrderConfirmationScreen";
import OrderHistoryScreen from "../screens/customer/OrderHistory";
import { Alert, Platform, TouchableOpacity, View } from "react-native";
import { AuthContext } from "../context/authContext";
import colors from "../utils/styles/appStyles";
import OrderHistoryDetailScreen from "../screens/customer/OrdderHistoryDetailScreen";
// import PartyLobbyScreen from "../screens/customer/PartyLobbyScreen";

import { db } from "../config/firebase";
import { useParty } from "../context/customer/PartyContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PartySessionScreen from "../screens/customer/PartySessionScreen";
import RestaurantDetailScreen from "../components/customer/RestaurantDetail";
import PartyMenuScreen from "../screens/customer/PartyMenuScreen";
import PartyCheckoutScreen from "../screens/customer/PartyCheckoutScreen";
import ManageAccountScreen from "../screens/customer/ManageAccountScreen";
import PartyHubScreen from "../screens/customer/PartyHubScreen";
import PayPalScreen from "../screens/customer/PayPalScreen";
import QRScannerScreen from "../screens/customer/QRScannerScreen";
import TableSetupPrompt from "../screens/customer/TableSetupPrompt";
import PickupCartScreen from "../screens/customer/PickupCartScreen";
import PickupOrderStatusScreen from "../screens/customer/PickupOrderStatusScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const defaultHeaderOptions = {
	headerStyle: {
		backgroundColor: colors.background, // Customize with your theme color
	},
	headerTintColor: "black", // White text color for contrast
	headerTitleStyle: {
		color: "black",
		fontWeight: "bold",
		fontSize: 18,
	},
	headerBackTitleVisible: false, // Hide default back title
};

const BackButton = () => {
	const navigation = useNavigation();
	return (
		<TouchableOpacity
			onPress={() => {
				console.log("BackButtonPress (using hook)");
				if (navigation.canGoBack()) {
					navigation.goBack();
				} else {
					console.log("Cannot go back from this screen.");
				}
			}}
		>
			<Ionicons
				name="arrow-back"
				size={24}
				color="black"
				style={{ marginLeft: 10 }}
			/>
		</TouchableOpacity>
	);
};

// Define separate functions for each screen's content (if not already defined)
const CustomerDashboardStack = () => {
	const { t } = useTranslation();
	return (
		<Stack.Navigator screenOptions={defaultHeaderOptions}>
			<Stack.Screen
				options={{ headerShown: false }}
				name="CustomerDashboardInner"
				component={CustomerDashboard}
				initialParams={{ initialRestaurantData: [] }}
			/>
			<Stack.Screen
				name="RestaurantDetail"
				component={RestaurantDetail}
				options={() => ({
					headerTitle: t("restaurant_details_title"),
				})}
			/>
			<Stack.Screen
				name="QRScannerScreen"
				component={QRScannerScreen}
				options={() => ({
					headerTitle: t("scan_table_qr"), // Or just "Scan to Check In"
					// Optional: Make it present as a modal instead of a card slide
					presentation: "modal",
				})}
			/>
			<Stack.Screen
				name="TableSetupPrompt"
				component={TableSetupPrompt}
				options={{
					presentation: "transparentModal", // This creates the bottom-sheet overlay effect
					animation: "slide_from_bottom",
					headerShown: false, // We built our own drag handle, so no header needed
				}}
			/>
			{/* <Stack.Screen
			name="PartyLobbyScreen"
			component={PartyLobbyScreen}
			options={{ title: "Party Lobby" }} // Or customize header as needed
		/> */}
			{/* Additional nested screens in RestaurantDetail flow */}
			<Stack.Screen
				name="BasketScreen"
				component={BasketScreen}
				options={() => ({
					headerTitle: t("basket_title"),
				})}
			/>
			<Stack.Screen
				name="CheckoutScreen"
				component={CheckoutScreen}
				options={() => ({
					headerTitle: t("checkout_title"),
				})}
			/>
			<Stack.Screen
				name="OrderConfirmation"
				component={OrderConfirmationScreen}
				option={{
					headerTitle: t("order_confirmation_title"),
					headerLeft: () => null,
				}}
			/>

			<Stack.Screen
				name="PayPalScreen"
				component={PayPalScreen}
				options={() => ({
					headerTitle: "Secure Checkout",
					headerBackTitleVisible: false,
				})}
			/>
		</Stack.Navigator>
	);
};

const PartyStackScreen = () => {
	const { t } = useTranslation();
	return (
		<Stack.Navigator screenOptions={defaultHeaderOptions}>
			<Stack.Screen
				name="PartyHub" // New hub screen
				component={PartyHubScreen}
				options={{ headerTitle: t("party_hub_title") }}
			/>
			{/* <Stack.Screen
			name="PartyLobby"
			component={PartyLobbyScreen}
			options={{ headerTitle: "Party Lobby" }}
		/> */}
			<Stack.Screen
				name="PartySession" // This is your new hub/lobby screen
				component={PartySessionScreen} // Make sure to import PartySessionScreen
				options={{ headerTitle: t("my_party_title") }} // Title can be dynamic
			/>
			<Stack.Screen // NEW SCREEN FOR PARTY MENU
				name="PartyMenu"
				component={PartyMenuScreen}
				// Options can be dynamic, e.g., set by PartyMenuScreen itself using navigation.setOptions
				// options={({ route }) => ({ title: `Menu: ${route.params?.restaurantName || 'Menu'}` })}
			/>
			<Stack.Screen
				name="PickupCart"
				component={PickupCartScreen}
				options={{ headerShown: false }} // We built a custom header inside the file
			/>
			{/* 🚨 THE FIX: Add the QR Scanner natively to the Party flow! */}
			<Stack.Screen
				name="QRScannerScreen"
				component={QRScannerScreen}
				options={() => ({
					headerTitle: t("scan_table_qr", "Scan Table QR"),
					presentation: "modal",
				})}
			/>
			<Stack.Screen
				name="RestaurantDetailForPartyCreation" // If you navigate here from SelectRestaurantForParty
				component={RestaurantDetailScreen} // Reusing RestaurantDetail
				options={{ headerTitle: t("confirm_party_restaurant_title") }}
			/>
			{/* Add other screens if needed directly in the party flow, e.g., a dedicated menu screen for adding party items */}
			<Stack.Screen
				name="PartyCheckout" // This name must match the one used in navigation.navigate()
				component={PartyCheckoutScreen}
				options={{ headerTitle: t("checkout_your_items_title") }}
			/>
			<Stack.Screen
				name="PickupOrderStatus"
				component={PickupOrderStatusScreen}
				options={{ headerTitle: t("order_status", "Order Status") }}
			/>
			<Stack.Screen
				name="OrderConfirmation"
				component={OrderConfirmationScreen}
				options={{
					headerTitle: t("order_confirmation_title"),
					headerLeft: () => null,
				}}
			/>
		</Stack.Navigator>
	);
};

const AccountScreenStack = () => {
	const { t } = useTranslation();
	return (
		<Stack.Navigator screenOptions={defaultHeaderOptions}>
			<Stack.Screen
				name="AccountScreenInner"
				component={AccountScreen}
				options={{
					headerTitle: t("account_title"),
					headerLeft: () => null,
				}}
			/>
			<Stack.Screen
				name="PipsScreenInner"
				component={PIPSListScreen}
				options={{
					headerTitle: t("pips_list_title"),
					headerLeft: () => {
						<Ionicons
							name="arrow-back"
							size={24}
							color="black"
							style={{ marginLeft: 10 }}
						/>;
					},
				}}
			/>
			<Stack.Screen
				name="OrderHistoryScreenInner"
				component={OrderHistoryScreen}
				options={{
					headerTitle: t("order_history_title"),
					headerLeft: () => {
						<Ionicons
							name="arrow-back"
							size={24}
							color="black"
							style={{ marginLeft: 10 }}
						/>;
					},
				}}
			/>
			<Stack.Screen
				name="OrderHistoryDetail" // New screen name for details
				component={OrderHistoryDetailScreen}
				options={{
					headerTitle: t("order_details_title"), // Set a title
					headerLeft: () => {
						<Ionicons
							name="arrow-back"
							size={24}
							color="black"
							style={{ marginLeft: 10 }}
						/>;
					},
				}}
			/>
			<Stack.Screen
				name="ManageAccountScreen"
				component={ManageAccountScreen}
				options={{ headerTitle: t("manage_account_title") }}
			/>
		</Stack.Navigator>
	);
};

const ActiveOrdersStack = () => {
	const { t } = useTranslation();
	return (
		<Stack.Navigator>
			<Stack.Screen
				name="ActiveOrdersList"
				component={CheckoutScreen} // Use CheckoutScreen here
				options={{ title: t("active_orders_title") }}
			/>
			{/* You might not need other screens here if CheckoutScreen handles everything */}
		</Stack.Navigator>
	);
};

const CustomerBottomNavigation = () => {
	const insets = useSafeAreaInsets();
	const internalTabBarContentHeight = 50;
	const originalPaddingTop = 10;

	const { t } = useTranslation();
	const { currentUserData, logout } = useContext(AuthContext);
	const { joinParty, currentPartyId } = useParty();
	const navigation = useNavigation();

	const isGuest = currentUserData?.role === "guest";

	useEffect(() => {
		if (!currentUserData?.uid || currentPartyId) {
			console.log(
				"Notification Listener: Skipping setup (no user or already in party).",
			);
			return;
		}
		console.log(
			`Notification Listener: Setting up for user ${currentUserData.uid}`,
		);
		const notificationsRef = db.collection("notifications");
		const q = notificationsRef
			.where("recipientUserId", "==", currentUserData.uid)
			.where("type", "==", "partyInvite")
			.where("isRead", "==", false);
		const unsubscribe = q.onSnapshot(
			(snapshot) => {
				snapshot.docChanges().forEach(async (change) => {
					if (change.type === "added") {
						const notification = { id: change.doc.id, ...change.doc.data() };
						console.log("New Party Invite Received:", notification);
						if (currentPartyId) return; // Check again inside loop
						Alert.alert(
							t("party_invitation_title"),
							t("party_invitation_message", {
								hostName: notification.hostName || t("someone"),
								restaurantName:
									notification.restaurantName || t("a_restaurant"),
							}),
							[
								{
									text: t("decline_button"),
									onPress: async () => {
										const notifRef = db
											.collection("notifications")
											.doc(notification.id);
										await notifRef.update({ isRead: true });
									},
									style: "cancel",
								},
								{
									text: t("join_party_button"),
									onPress: async () => {
										const notifRef = db
											.collection("notifications")
											.doc(notification.id);
										await notifRef.update({ isRead: true });
										const joinedPartyId = await joinParty({
											partyId: notification.partyId,
										});
										if (joinedPartyId) {
											// Navigate to lobby - ensure PartyLobby is in a stack accessible from here
											// Might need to navigate to the specific stack first if nested
											navigation.navigate("CustomerDashboard", {
												screen: "PartyLobby", // Navigate to the screen within the stack
												params: { partyId: joinedPartyId },
											});
										}
									},
								},
							],
						);
					}
				});
			},
			(error) => {
				console.error("Error listening to notifications:", error);
			},
		);
		return () => {
			console.log("Notification Listener: Cleaning up.");
			unsubscribe();
		};
	}, [currentUserData?.uid, currentPartyId, joinParty, navigation]);

	const handleAccountScreenPress = (navigation) => {
		if (currentUserData.role === "guest") {
			navigation.navigate("Welcome"); // Navigate to WelcomeScreen for guest users
		} else {
			// Navigate to the actual AccountScreen for authenticated users
			navigation.navigate("AccountScreen");
		}
	};

	return (
		<Tab.Navigator
			screenOptions={({ route }) => ({
				tabBarIcon: ({ focused, color, size }) => {
					let iconName;
					if (route.name === "CustomerDashboard")
						iconName = focused ? "home" : "home-outline";
					else if (route.name === "AccountScreen") {
						// If the user is a guest, show a login icon.
						// Otherwise, show the person icon.
						if (isGuest) {
							iconName = focused ? "log-in" : "log-in-outline";
						} else {
							iconName = focused ? "person" : "person-outline";
						}
					}
					const iconSize = 34;

					return <Ionicons name={iconName} size={iconSize} color="black" />;
				},
				tabBarShowLabel: false,
				tabBarStyle: {
					backgroundColor: colors.background,
					borderWidth: 2,
					borderColor: "black",
					borderTopWidth: 0,
					paddingTop: originalPaddingTop,
					paddingBottom: insets.bottom,
					elevation: Platform.OS === "android" ? 4 : 0,
					height:
						originalPaddingTop + internalTabBarContentHeight + insets.bottom,
					paddingBottom: Platform.OS === "ios" ? 10 : 0,
				},
			})}
		>
			<Tab.Screen
				name="CustomerDashboard"
				component={CustomerDashboardStack}
				options={{ headerShown: false }}
			/>

			<Tab.Screen
				name="PartyTab"
				component={PartyStackScreen}
				options={{
					headerShown: false,
					tabBarIcon: ({ focused }) => (
						<MaterialCommunityIcons
							name="party-popper"
							size={32}
							color={focused ? colors.primary : "#888"}
						/>
					),
					tabBarBadge: currentPartyId ? "●" : undefined,
					tabBarBadgeStyle: { backgroundColor: colors.success },
				}}
			/>
			<Tab.Screen
				name="AccountScreen"
				component={AccountScreenStack}
				listeners={({}) => ({
					tabPress: (e) => {
						if (isGuest) {
							// Prevent default navigation for guests
							e.preventDefault();
							// Send them back to the login/signup screen
							logout();
						}
					},
				})}
				options={{ headerShown: false }}
			/>
		</Tab.Navigator>
	);
};

export default CustomerBottomNavigation;
