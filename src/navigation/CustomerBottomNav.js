import React, { useContext } from "react";

import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const defaultHeaderOptions = {
	headerStyle: {
		backgroundColor: "#007788", // Customize with your theme color
	},
	headerTintColor: "#fff", // White text color for contrast
	headerTitleStyle: {
		fontWeight: "bold",
		fontSize: 18,
	},
	headerBackTitleVisible: false, // Hide default back title
};

const BackButton = () => {
	const navigation = useNavigation();
	return (
		<Ionicons
			name="arrow-back"
			size={24}
			color="#fff"
			onPress={() => navigation.goBack()}
			style={{ marginLeft: 10 }}
		/>
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
			options={{ headerTitle: "Restaurant Details" }}
		/>
		{/* Additional nested screens in RestaurantDetail flow */}
		<Stack.Screen
			name="BasketScreen"
			component={BasketScreen}
			options={{ headerTitle: "Basket" }}
		/>
		<Stack.Screen
			name="CheckoutScreen"
			component={CheckoutScreen}
			options={{ headerTitle: "Checkout" }}
		/>
		<Stack.Screen
			name="OrderConfirmation"
			component={OrderConfirmationScreen}
			options={{ headerTitle: "Order Confirmation" }}
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

const RestaurantDetailStack = ({ navigation }) => (
	<Stack.Navigator screenOptions={defaultHeaderOptions}>
		{/* <Stack.Screen
      options={{ headerShown: false }}
      name="RestaurantList" // Or whatever your restaurant list screen is called
      component={RestaurantDetail} // Assuming this is your restaurant list screen
    /> */}
		<Stack.Screen
			name="RestaurantDetails" // Give it a unique name
			component={RestaurantDetail}
			options={{
				headerTitle: "Restaurant Detail",
				headerLeft: () => <BackButton />,
			}}
		/>

		<Stack.Screen
			name="BasketScreen"
			component={BasketScreen}
			options={{
				headerTitle: "Basket",
				headerLeft: () => <BackButton />,
			}}
		/>
		<Stack.Screen
			name="CheckoutScreen"
			component={CheckoutScreen}
			options={{ headerTitle: "Checkout", headerLeft: () => <BackButton /> }}
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

const AccountScreenStack = () => (
	<Stack.Navigator screenOptions={defaultHeaderOptions}>
		<Stack.Screen
			name="AccountScreenInner"
			component={AccountScreen}
			options={{ headerTitle: "Account", headerLeft: () => <BackButton /> }}
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
	const navigation = useNavigation();

	const handleAccountScreenPress = () => {
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

					return (
						<View
							style={{
								alignItems: "center",
								justifyContent: "center",
								backgroundColor: focused ? "#007788" : "#555",
								paddingVertical: 10,
								width: "100%",
							}}
						>
							<Ionicons name={iconName} size={size} color="white" />
						</View>
					);
				},
				tabBarShowLabel: false,
				tabBarStyle: {
					backgroundColor: "#fff",
					borderTopWidth: 0,
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
				listeners={{
					tabPress: (e) => {
						e.preventDefault();
						handleAccountScreenPress();
					},
				}}
				options={{ headerShown: false }}
			/>
		</Tab.Navigator>
	);
};

export default CustomerBottomNavigation;
