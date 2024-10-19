import React from "react";

import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

// Import your screen components and stack navigator functions

import CustomerDashboard from "../screens/customer/CustomerDashboard";
import CustomerProfile from "../screens/customer/CustomerProfile";
import RestaurantDetail from "../components/customer/RestaurantDetail";
import BasketScreen from "../screens/customer/BasketScreen";
import BackButton from "../utils/BackButton";
import AccountScreen from "../screens/customer/AccountScreen";
import PIPSListScreen from "../screens/customer/PIPScreen";
import CheckoutScreen from "../screens/customer/CheckoutScreen";
import OrderConfirmationScreen from "../screens/customer/OrderConfirmationScreen";
import OrderHistoryScreen from "../screens/customer/OrderHistory";
import { Platform, TouchableOpacity, View } from "react-native";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Define separate functions for each screen's content (if not already defined)
const CustomerDashboardStack = () => (
	<Stack.Navigator>
		<Stack.Screen
			options={{ headerShown: false }}
			name="CustomerDashboardInner"
			component={CustomerDashboard}
		/>
	</Stack.Navigator>
);

const CustomerProfileStack = () => (
	<Stack.Navigator>
		<Stack.Screen
			options={{ headerShown: false }}
			name="CustomerProfileInner"
			component={CustomerProfile}
		/>
	</Stack.Navigator>
);

const RestaurantDetailStack = ({ navigation }) => (
	<Stack.Navigator>
		{/* <Stack.Screen
      options={{ headerShown: false }}
      name="RestaurantList" // Or whatever your restaurant list screen is called
      component={RestaurantDetail} // Assuming this is your restaurant list screen
    /> */}
		<Stack.Screen
			name="RestaurantDetail" // Give it a unique name
			component={RestaurantDetail}
			options={{ headerShown: false }}
		/>

		<Stack.Screen
			name="BasketScreen"
			component={BasketScreen}
			options={{
				headerTitle: "Basket",
				headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
				headerShown: false,
			}}
		/>
		<Stack.Screen
			name="CheckoutScreen"
			component={CheckoutScreen}
			options={{ headerTitle: "Checkout", headerShown: false }}
		/>
		<Stack.Screen
			name="OrderConfirmation"
			component={OrderConfirmationScreen}
		/>
	</Stack.Navigator>
);

const AccountScreenStack = () => (
	<Stack.Navigator>
		<Stack.Screen
			options={{
				headerShown: false,
			}}
			name="AccountScreenInner"
			component={AccountScreen}
		/>
		<Stack.Screen
			options={{ headerShown: false }}
			name="PipsScreenInner"
			component={PIPSListScreen}
		/>
		<Stack.Screen
			options={{ headerShown: false }}
			name="OrderHistoryScreenInner"
			component={OrderHistoryScreen}
		/>
		<Stack.Screen
			name="OrderConfirmation"
			options={{ headerShown: false }}
			component={OrderConfirmationScreen}
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
	const navigation = useNavigation();

	return (
		<Tab.Navigator
			screenOptions={({ route }) => ({
				tabBarIcon: ({ focused, color, size }) => {
					let iconName;

					if (route.name === "CustomerDashboard") {
						iconName = focused ? "home" : "home-outline";
					} else if (route.name === "AccountScreen") {
						iconName = focused ? "person" : "person-outline";
					}

					return (
						<View
							style={{
								flex: 1,
								alignItems: "center",
								justifyContent: "center",
								backgroundColor: focused ? "#007788" : "#555", // Turquoise or gray background
								paddingVertical: 10,
								width: "100%",
							}}
						>
							<Ionicons
								name={iconName}
								size={size}
								color={focused ? "white" : "white"}
							/>
						</View>
					);
				},
				tabBarActiveTintColor: "#007bff", // Example active color
				tabBarInactiveTintColor: "gray",
				tabBarShowLabel: false,
				tabBarStyle: {
					backgroundColor: "#fff", // White background for the overall tab bar
					borderTopWidth: 0,
					elevation: Platform.OS === "android" ? 4 : 0,
					height: 60,
					paddingBottom: Platform.OS === "ios" ? 10 : 0,
					justifyContent: "space-between",
					paddingHorizontal: 0, // Remove any horizontal padding on the tab bar itself
					marginHorizontal: -10, // Negative margin to overlap the icons slightly
				},
			})}
		>
			{/* Use the separate functions for each Tab.Screen */}
			<Tab.Screen
				name="CustomerDashboard"
				options={{ headerShown: false }}
				component={CustomerDashboardStack}
			/>
			<Tab.Screen
				options={{ headerShown: false }}
				name="RestaurantDetails"
				component={RestaurantDetailStack}
			/>
			{/* //<Tab.Screen name="ActiveOrders" component={ActiveOrdersStack} /> */}
			<Tab.Screen
				options={{ headerShown: false }}
				name="AccountScreen"
				component={AccountScreenStack}
			/>
		</Tab.Navigator>
	);
};

export default CustomerBottomNavigation;
