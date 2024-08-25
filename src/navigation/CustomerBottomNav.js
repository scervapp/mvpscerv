import React from "react";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

// Import your screen components and stack navigator functions
import RestaurantProfile from "../screens/restaurant/RestaurantProfile";
import RestaurantDashboard from "../screens/restaurant/RestaurantDashboard";
import MenuManagementScreen from "../screens/restaurant/MenuManagementScreen";
import CustomerDashboard from "../screens/customer/CustomerDashboard";
import CustomerProfile from "../screens/customer/CustomerProfile";
import RestaurantDetail from "../components/customer/RestaurantDetail";
import BasketScreen from "../screens/customer/BasketScreen";
import BackButton from "../utils/BackButton";
import AccountScreen from "../screens/customer/AccountScreen";
import PIPSListScreen from "../screens/customer/PIPScreen";
import CheckoutScreen from "../screens/customer/CheckoutScreen";

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
	</Stack.Navigator>
);

const AccountScreenStack = () => (
	<Stack.Navigator>
		<Stack.Screen
			options={{ headerShown: false }}
			name="AccountScreenInner"
			component={AccountScreen}
		/>
	</Stack.Navigator>
);

const PipsScreenStack = () => (
	<Stack.Navigator>
		<Stack.Screen
			options={{ headerShown: false }}
			name="PipsScreenInner"
			component={PIPSListScreen}
		/>
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
					} else if (route.name === "CustomerMenu") {
						iconName = focused ? "menu" : "menu-outline";
					}

					return <Ionicons name={iconName} size={size} color={color} />;
				},
				tabBarActiveTintColor: "tomato",
				tabBarInactiveTintColor: "gray",
				tabBarShowLabel: false,
				tabBarStyle: [{ display: "flex" }, null],
			})}
		>
			{/* Use the separate functions for each Tab.Screen */}
			<Tab.Screen name="CustomerDashboard" component={CustomerDashboardStack} />
			<Tab.Screen name="CustomerProfile" component={CustomerProfileStack} />
			<Tab.Screen
				options={{ headerShown: false }}
				name="RestaurantDetails"
				component={RestaurantDetailStack}
			/>
			<Tab.Screen name="AccountScreen" component={AccountScreenStack} />
			<Tab.Screen name="PipsScreen" component={PipsScreenStack} />
		</Tab.Navigator>
	);
};

export default CustomerBottomNavigation;
