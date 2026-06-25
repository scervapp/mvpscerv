import React, { useContext, useEffect, useMemo, useState } from "react";

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
import ReservationRequestScreen from "../screens/customer/ReservationRequestScreen";
import CustomerReservationsScreen from "../screens/customer/CustomerReservationsScreen";
import HostCheckInRequestScreen from "../screens/customer/HostCheckInRequestScreen";
import CustomerRewardsScreen from "../screens/customer/CustomerRewardsScreen";
import BasketScreen from "../screens/customer/BasketScreen";

import AccountScreen from "../screens/customer/AccountScreen";
import PIPSListScreen from "../screens/customer/PIPScreen";
import CheckoutScreen from "../screens/customer/CheckoutScreen";
import OrderConfirmationScreen from "../screens/customer/OrderConfirmationScreen";
import OrderHistoryScreen from "../screens/customer/OrderHistory";
import {
	Alert,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
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
import { PICKUP_FLOW_ENABLED } from "../config/featureFlags";

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

const BackButton = ({ fallbackRoute, fallbackParams, label }) => {
	const navigation = useNavigation();
	return (
		<TouchableOpacity
			onPress={() => {
				console.log("BackButtonPress (using hook)");
				if (navigation.canGoBack()) {
					navigation.goBack();
				} else if (fallbackRoute) {
					navigation.navigate(fallbackRoute, fallbackParams);
				} else {
					navigation.popToTop();
					console.log("Cannot go back from this screen.");
				}
			}}
			style={{
				flexDirection: "row",
				alignItems: "center",
				paddingHorizontal: 10,
				paddingVertical: 8,
				minHeight: 44,
			}}
			hitSlop={{ top: 8, right: 12, bottom: 8, left: 8 }}
			accessibilityRole="button"
			accessibilityLabel={label || "Go back"}
		>
			<Ionicons
				name="arrow-back"
				size={24}
				color="black"
				style={{ marginRight: 4 }}
			/>
			<Text style={{ color: "black", fontSize: 16, fontWeight: "600" }}>
				{label || "Back"}
			</Text>
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
				name="ReservationRequest"
				component={ReservationRequestScreen}
				options={{ headerTitle: "Request Reservation" }}
			/>
			<Stack.Screen
				name="HostCheckInRequest"
				component={HostCheckInRequestScreen}
				options={{ headerTitle: "Request Check-In" }}
			/>
			<Stack.Screen
				name="CustomerRewardsScreen"
				component={CustomerRewardsScreen}
				options={{
					headerTitle: t("scerv_wallet", "Scerv Wallet"),
				}}
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
				options={({ route }) => ({
					headerTitle: t("basket_title"),
					headerLeft: () => (
						<BackButton
							label={t("back", "Back")}
							fallbackRoute={
								route.params?.restaurant ? "RestaurantDetail" : undefined
							}
							fallbackParams={
								route.params?.restaurant
									? { restaurant: route.params.restaurant }
									: undefined
							}
						/>
					),
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
			{PICKUP_FLOW_ENABLED && (
				<Stack.Screen
					name="PickupCart"
					component={PickupCartScreen}
					options={{ headerShown: false }} // We built a custom header inside the file
				/>
			)}
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
				name="HostCheckInRequest"
				component={HostCheckInRequestScreen}
				options={{ headerTitle: "Request Check-In" }}
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
			{PICKUP_FLOW_ENABLED && (
				<Stack.Screen
					name="PickupOrderStatus"
					component={PickupOrderStatusScreen}
					options={{ headerTitle: t("order_status", "Order Status") }}
				/>
			)}
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
				name="CustomerReservationsScreen"
				component={CustomerReservationsScreen}
				options={{
					headerTitle: t("my_reservations", "My Reservations"),
				}}
			/>
			<Stack.Screen
				name="CustomerRewardsScreen"
				component={CustomerRewardsScreen}
				options={{
					headerTitle: t("scerv_wallet", "Scerv Wallet"),
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

const WalletStackScreen = () => {
	const { t } = useTranslation();
	return (
		<Stack.Navigator screenOptions={defaultHeaderOptions}>
			<Stack.Screen
				name="CustomerWallet"
				component={CustomerRewardsScreen}
				options={{
					headerTitle: t("scerv_wallet", "Scerv Wallet"),
				}}
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

const getBasketItemCount = (basket) => {
	const items = Array.isArray(basket?.items) ? basket.items : [];
	return items.reduce((total, item) => total + Number(item.quantity || 1), 0);
};

const getActiveRouteName = (state) => {
	if (!state || !Array.isArray(state.routes) || state.routes.length === 0) {
		return null;
	}

	const activeRoute = state.routes[state.index || 0];
	if (activeRoute?.state) {
		return getActiveRouteName(activeRoute.state) || activeRoute.name;
	}

	return activeRoute?.name || null;
};

const LIVE_ORDER_BUTTON_HIDDEN_ROUTES = new Set([
	"PartyTab",
	"PartyHub",
	"PartySession",
	"PartyMenu",
	"PartyCheckout",
	"PickupCart",
	"PickupOrderStatus",
	"CheckoutScreen",
	"PayPalScreen",
	"OrderConfirmation",
]);

const LiveOrderButton = ({
	currentPartyId,
	partyDetails,
	sharedBaskets,
	navigation,
	bottomOffset,
	activeRouteName,
	t,
}) => {
	const activeParty = currentPartyId ? partyDetails?.[currentPartyId] : null;
	const basketCount = getBasketItemCount(sharedBaskets?.[currentPartyId]);

	if (!currentPartyId || !activeParty) return null;
	if (LIVE_ORDER_BUTTON_HIDDEN_ROUTES.has(activeRouteName)) return null;

	const isPickup = activeParty.orderMode === "pickup";
	const label = isPickup
		? t("pickup_order", "Pickup Order")
		: activeParty.status === "AWAITING_TABLE"
			? t("waiting_for_table", "Waiting")
			: t("live_order", "Live Order");

	const handlePress = () => {
		navigation.navigate("CustomerApp", {
			screen: "PartyTab",
			params: {
				screen: "PartySession",
				params: { partyId: currentPartyId },
			},
		});
	};

	return (
		<TouchableOpacity
			style={[styles.liveOrderButton, { bottom: bottomOffset }]}
			onPress={handlePress}
			activeOpacity={0.9}
			accessibilityRole="button"
			accessibilityLabel={t("open_live_order", "Open live order")}
		>
			<MaterialCommunityIcons
				name={isPickup ? "bag-personal-outline" : "silverware-fork-knife"}
				size={22}
				color={colors.surfaceWhite}
			/>
			<View style={styles.liveOrderTextWrap}>
				<Text style={styles.liveOrderLabel}>{label}</Text>
				<Text style={styles.liveOrderSubLabel} numberOfLines={1}>
					{basketCount > 0
						? t("items_count", "{{count}} items", { count: basketCount })
						: activeParty.restaurantName || t("view_order", "View order")}
				</Text>
			</View>
			<MaterialCommunityIcons
				name="chevron-right"
				size={20}
				color={colors.surfaceWhite}
			/>
		</TouchableOpacity>
	);
};

const CustomerBottomNavigation = () => {
	const insets = useSafeAreaInsets();
	const internalTabBarContentHeight = 50;
	const originalPaddingTop = 10;

	const { t } = useTranslation();
	const { currentUserData, logout } = useContext(AuthContext);
	const { joinParty, currentPartyId, partyDetails, sharedBaskets } = useParty();
	const navigation = useNavigation();
	const [activeRouteName, setActiveRouteName] = useState(null);
	const liveOrderBottomOffset = useMemo(
		() =>
			originalPaddingTop +
			internalTabBarContentHeight +
			(insets.bottom > 0 ? insets.bottom : 12) +
			14,
		[insets.bottom],
	);

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
										const joinResult = await joinParty({
											partyId: notification.partyId,
											inviteCode: notification.inviteCode,
										});
										const joinedPartyId =
											joinResult?.partyId || notification.partyId;
										if (joinedPartyId) {
											navigation.navigate("CustomerApp", {
												screen: "PartyTab",
												params: {
													screen: "PartySession",
													params: { partyId: joinedPartyId },
												},
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
		<View style={styles.customerShell}>
			<Tab.Navigator
			screenListeners={{
				state: (event) => {
					setActiveRouteName(getActiveRouteName(event.data.state));
				},
			}}
			screenOptions={({ route }) => ({
				tabBarIcon: ({ focused, color, size }) => {
					let iconName;
					if (route.name === "CustomerDashboard")
						iconName = focused ? "home" : "home-outline";
					else if (route.name === "WalletTab")
						iconName = focused ? "wallet" : "wallet-outline";
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
				name="WalletTab"
				component={WalletStackScreen}
				options={{
					headerShown: false,
					tabBarIcon: ({ focused }) => (
						<Ionicons
							name={focused ? "wallet" : "wallet-outline"}
							size={34}
							color={focused ? colors.primary : "black"}
						/>
					),
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
			<LiveOrderButton
				currentPartyId={currentPartyId}
				partyDetails={partyDetails}
				sharedBaskets={sharedBaskets}
				navigation={navigation}
				bottomOffset={liveOrderBottomOffset}
				activeRouteName={activeRouteName}
				t={t}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	customerShell: {
		flex: 1,
	},
	liveOrderButton: {
		position: "absolute",
		right: 16,
		flexDirection: "row",
		alignItems: "center",
		maxWidth: 230,
		minHeight: 56,
		paddingLeft: 14,
		paddingRight: 10,
		paddingVertical: 9,
		borderRadius: 28,
		backgroundColor: colors.primary,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.22,
		shadowRadius: 8,
		elevation: 8,
		zIndex: 50,
	},
	liveOrderTextWrap: {
		marginLeft: 10,
		marginRight: 4,
		maxWidth: 145,
	},
	liveOrderLabel: {
		color: colors.surfaceWhite,
		fontSize: 13,
		fontWeight: "900",
	},
	liveOrderSubLabel: {
		color: colors.surfaceWhite,
		fontSize: 11,
		fontWeight: "700",
		opacity: 0.88,
		marginTop: 1,
	},
});

export default CustomerBottomNavigation;
