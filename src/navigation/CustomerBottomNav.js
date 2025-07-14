import React, { useContext, useEffect } from "react";

import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { enableScreens } from "react-native-screens";

import { Ionicons } from "@expo/vector-icons";

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
import PartyLobbyScreen from "../screens/customer/PartyLobbyScreen";

import { db } from "../config/firebase";
import { useParty } from "../context/customer/PartyContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PartySessionScreen from "../screens/customer/PartySessionScreen";
import RestaurantDetailScreen from "../components/customer/RestaurantDetail";
import PartyMenuScreen from "../screens/customer/PartyMenuScreen";
import PartyCheckoutScreen from "../screens/customer/PartyCheckoutScreen";
import ManageAccountScreen from "../screens/customer/ManageAccountScreen";

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
const CustomerDashboardStack = () => (
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
				headerTitle: "Restaurant Details",
			})}
		/>
		<Stack.Screen
			name="PartyLobbyScreen"
			component={PartyLobbyScreen}
			options={{ title: "Party Lobby" }} // Or customize header as needed
		/>
		{/* Additional nested screens in RestaurantDetail flow */}
		<Stack.Screen
			name="BasketScreen"
			component={BasketScreen}
			options={() => ({
				headerTitle: "Basket",
			})}
		/>
		<Stack.Screen
			name="CheckoutScreen"
			component={CheckoutScreen}
			options={() => ({
				headerTitle: "Checkout",
			})}
		/>
		<Stack.Screen
			name="OrderConfirmation"
			component={OrderConfirmationScreen}
			option={{
				headerTitle: "Order Confirmation",
				headerLeft: () => null,
			}}
		/>
	</Stack.Navigator>
);

const PartyStackScreen = () => (
	<Stack.Navigator screenOptions={defaultHeaderOptions}>
		<Stack.Screen
			name="PartySession" // This is your new hub/lobby screen
			component={PartySessionScreen} // Make sure to import PartySessionScreen
			options={{ headerTitle: "My Party" }} // Title can be dynamic
		/>
		<Stack.Screen // NEW SCREEN FOR PARTY MENU
			name="PartyMenu"
			component={PartyMenuScreen}
			// Options can be dynamic, e.g., set by PartyMenuScreen itself using navigation.setOptions
			// options={({ route }) => ({ title: `Menu: ${route.params?.restaurantName || 'Menu'}` })}
		/>
		<Stack.Screen
			name="RestaurantDetailForPartyCreation" // If you navigate here from SelectRestaurantForParty
			component={RestaurantDetailScreen} // Reusing RestaurantDetail
			options={{ headerTitle: "Confirm Party Restaurant" }}
		/>
		{/* Add other screens if needed directly in the party flow, e.g., a dedicated menu screen for adding party items */}
		<Stack.Screen
			name="PartyCheckout" // This name must match the one used in navigation.navigate()
			component={PartyCheckoutScreen}
			options={{ headerTitle: "Checkout Your Items" }}
		/>
		<Stack.Screen
			name="OrderConfirmation"
			component={OrderConfirmationScreen}
			option={{
				headerTitle: "Order Confirmation",
				headerLeft: () => null,
			}}
		/>
	</Stack.Navigator>
);

const AccountScreenStack = () => (
	<Stack.Navigator screenOptions={defaultHeaderOptions}>
		<Stack.Screen
			name="AccountScreenInner"
			component={AccountScreen}
			options={{
				headerTitle: "Account",
				headerLeft: () => null,
			}}
		/>
		<Stack.Screen
			name="PipsScreenInner"
			component={PIPSListScreen}
			options={{
				headerTitle: "PIP's List",
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
				headerTitle: "Order History",
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
				headerTitle: "Order Details", // Set a title
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
			options={{ headerTitle: "Manage Account" }}
		/>
	</Stack.Navigator>
);

const ActiveOrdersStack = () => (
	<Stack.Navigator>
		<Stack.Screen
			name="ActiveOrdersList"
			component={CheckoutScreen} // Use CheckoutScreen here
			options={{ title: "Active Orders" }}
		/>
		{/* You might not need other screens here if CheckoutScreen handles everything */}
	</Stack.Navigator>
);

const CustomerBottomNavigation = () => {
	const insets = useSafeAreaInsets();
	const internalTabBarContentHeight = 50;
	const originalPaddingTop = 10;

	const { currentUserData } = useContext(AuthContext);
	const { joinParty, currentPartyId } = useParty();
	const navigation = useNavigation();

	useEffect(() => {
		if (!currentUserData?.uid || currentPartyId) {
			console.log(
				"Notification Listener: Skipping setup (no user or already in party)."
			);
			return;
		}
		console.log(
			`Notification Listener: Setting up for user ${currentUserData.uid}`
		);
		const notificationsRef = db.collection("notifications");
		const q = notificationsRef.where("recipientUserId", "==", currentUserData.uid)
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
							"Party Invitation",
							`${
								notification.hostName || "Someone"
							} invited you to a party at ${
								notification.restaurantName || "a restaurant"
							}. Join now?`,
							[
								{
									text: "Decline",
									onPress: async () => {
										const notifRef = db.collection("notifications").doc(notification.id);
										await notifRef.update({ isRead: true });
									},
									style: "cancel",
								},
								{
									text: "Join Party",
									onPress: async () => {
										const notifRef = db.collection("notifications").doc(notification.id);
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
							]
						);
					}
				});
			},
			(error) => {
				console.error("Error listening to notifications:", error);
			}
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
					else if (route.name === "AccountScreen")
						iconName = focused ? "person" : "person-outline";

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
				name="PartyTab" // Name for the route
				component={PartyStackScreen} // The stack containing PartySessionScreen
				options={{
					headerShown: false,
					tabBarIcon: ({ focused, color, size }) => (
						<Ionicons
							name={focused ? "people" : "people-outline"}
							size={30}
							color={color}
						/>
					),
					// tabBarBadge: currentPartyId ? '●' : undefined, // Simple dot badge
					// tabBarBadgeStyle: { backgroundColor: colors.success, color: colors.success, fontSize: 9, top: -2, left:2 },
				}}
			/>
			<Tab.Screen
				name="AccountScreen"
				component={AccountScreenStack}
				listeners={({ navigation }) => ({
					tabPress: (e) => {
						e.preventDefault(); // Prevent default navigation
						handleAccountScreenPress(navigation);
					},
				})}
				options={{ headerShown: false }}
			/>
		</Tab.Navigator>
	);
};

export default CustomerBottomNavigation;

