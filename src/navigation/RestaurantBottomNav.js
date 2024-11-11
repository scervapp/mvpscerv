import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import RestaurantProfile from "../screens/restaurant/RestaurantProfile";
import RestaurantDashboard from "../screens/restaurant/RestaurantDashboard";
import MenuManagementScreen from "../screens/restaurant/MenuManagementScreen";
import RestaurantCheckin from "../screens/restaurant/RestaurantCheckin";
import TableManagementScreen from "../screens/restaurant/TableManagementScreen";
import ChefsQScreen from "../screens/restaurant/ChefsQScreen";
import BackOfficeScreen from "../screens/restaurant/BackOfficeScreen";
import EmployeeScreen from "../screens/restaurant/EmployeeScreen";

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SalesReportScreen from "../screens/restaurant/SalesReportScreen";
import { Platform } from "react-native";
import DailySalesDetailsScreen from "../screens/restaurant/DailySalesDetailsScreen";
import BackOfficeAccess from "../screens/restaurant/BackOfficeAccessScreen";
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const BackOfficeStackNavigator = () => {
	return (
		<Stack.Navigator>
			<Stack.Screen
				name="BackOfficeAccess"
				component={BackOfficeAccess}
				options={{ headerShown: false }}
			/>
			<Stack.Screen
				name="BackOffice"
				component={BackOfficeScreen}
				options={{ headerShown: false }}
			/>

			<Stack.Screen
				name="EmployeeScreen"
				component={EmployeeScreen}
				options={{ headerShown: false }}
			/>

			<Stack.Screen
				name="SalesReportScreen"
				component={SalesReportScreen}
				options={{ headerShown: false }}
			/>
			<Tab.Screen
				options={{ headerShown: true }}
				name="RestaurantProfile"
				component={RestaurantProfile}
			/>
			<Tab.Screen
				options={{ headerShown: true }}
				name="DailySalesDetails"
				component={DailySalesDetailsScreen}
			/>
		</Stack.Navigator>
	);
};

const RestaurantBottomNavigation = () => {
	return (
		<Tab.Navigator
			screenOptions={({ route }) => ({
				tabBarIcon: ({ focused, color, size }) => {
					let iconName;

					if (route.name === "RestaurantDashboard") {
						iconName = focused ? "home" : "home-outline";
					} else if (route.name === "RestaurantProfile") {
						iconName = focused ? "person" : "person-outline";
					} else if (route.name === "ChefsQ") {
						iconName = focused ? "cog" : "cog-outline";
					} else if (route.name === "RestaurantCheckin") {
						iconName = focused
							? "checkmark-circle"
							: "checkmark-circle-outline";
					} else if (route.name === "Tables") {
						iconName = focused ? "restaurant-outline" : "restaurant-outline";
					} else if (route.name === "BackOfficeNavigator") {
						iconName = focused ? "briefcase" : "briefcase-outline";
					}

					return <Ionicons name={iconName} size={size} color={color} />;
				},
				tabBarActiveTintColor: "tomato",
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
			<Tab.Screen
				options={{ headerShown: false }}
				name="RestaurantCheckin"
				component={RestaurantCheckin}
			/>
			<Tab.Screen
				options={{ headerShown: false }}
				name="Tables"
				component={TableManagementScreen}
			/>
			<Tab.Screen
				options={{ headerShown: false }}
				name="ChefsQ"
				component={ChefsQScreen}
			/>

			<Tab.Screen
				options={{ headerShown: false }}
				name="RestaurantDashboard"
				component={RestaurantDashboard}
			/>

			<Tab.Screen
				options={{ headerShown: false }}
				name="RestaurantMenu"
				component={MenuManagementScreen}
			/>

			<Tab.Screen
				name="BackOfficeNavigator"
				component={BackOfficeStackNavigator}
				options={{ headerShown: false }}
			/>
		</Tab.Navigator>
	);
};

export default RestaurantBottomNavigation;
