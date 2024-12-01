import React, { useContext } from "react";

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
import { Platform, TouchableOpacity, View } from "react-native";
import { AuthContext } from "../context/authContext";
import colors from "../utils/styles/appStyles";

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

const BackButton = ({ navigation }) => {
	return (
		<TouchableOpacity
			onPress={() => {
				console.log("BackButtonPress");
				navigation.goBack();
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
		/>
		<Stack.Screen
			name="RestaurantDetail"
			component={RestaurantDetail}
			options={() => ({
				headerTitle: "Restaurant Details",
			})}
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
			options={{ headerTitle: "Checkout", headerLeft: () => <BackButton /> }}
		/>
		<Stack.Screen
			name="OrderConfirmation"
			component={OrderConfirmationScreen}
		/>
	</Stack.Navigator>
);

const CustomerProfileStack = () => (
	<Stack.Navigator>
		<Stack.Screen
			options={{ headerTitle: "Profile" }}
			name="CustomerProfileInner"
			component={CustomerProfile}
		/>
	</Stack.Navigator>
);

const AccountScreenStack = () => (
	<Stack.Navigator screenOptions={defaultHeaderOptions}>
		<Stack.Screen
			name="AccountScreenInner"
			component={AccountScreen}
			options={({ navigation }) => ({
				headerTitle: () => (
					<TouchableOpacity
						onPress={() => navigation.navigate("CustomerDashboard")}
					>
						<Ionicons
							name="arrow-back"
							size={24}
							color="black"
							style={{ marginLeft: 10 }}
						/>
					</TouchableOpacity>
				),
			})}
		/>
		<Stack.Screen
			name="PipsScreenInner"
			component={PIPSListScreen}
			options={{ headerTitle: "PIP List", headerLeft: () => <BackButton /> }}
		/>
		<Stack.Screen
			name="OrderHistoryScreenInner"
			component={OrderHistoryScreen}
			options={{
				headerTitle: "Order History",
				headerLeft: () => <BackButton />,
			}}
		/>
		<Stack.Screen
			name="OrderConfirmation"
			component={OrderConfirmationScreen}
			options={{
				headerTitle: "Order Confirmation",
				headerLeft: () => <BackButton />,
			}}
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
	const { currentUserData } = useContext(AuthContext);

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
					paddingTop: 10,
					elevation: Platform.OS === "android" ? 4 : 0,
					height: 60,
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
