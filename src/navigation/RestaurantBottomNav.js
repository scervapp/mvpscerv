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
import { Platform, View } from "react-native";
import DailySalesDetailsScreen from "../screens/restaurant/DailySalesDetailsScreen";
import BackOfficeAccess from "../screens/restaurant/BackOfficeAccessScreen";
import colors from "../utils/styles/appStyles";
import { StyleSheet } from "react-native";
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
				options={{ headerShown: true, headerTitle: "Employee Managment" }}
			/>

			<Stack.Screen
				name="SalesReportScreen"
				component={SalesReportScreen}
				options={{ headerShown: true, headerTitle: "Daily Sales Summary" }}
			/>
			<Tab.Screen
				options={{ headerShown: true, headerTitle: "Restaurant Profile" }}
				name="RestaurantProfile"
				component={RestaurantProfile}
			/>
			<Tab.Screen
				options={{ headerShown: true, headerTitle: "Daily Sales Details" }}
				name="DailySalesDetails"
				component={DailySalesDetailsScreen}
			/>
			<Tab.Screen
				options={{ headerShown: true, headerTitle: "Menu Management" }}
				name="RestaurantMenu"
				component={MenuManagementScreen}
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

					if (route.name === "RestaurantCheckin") {
						iconName = focused ? "people" : "people-outline"; // People icon for check-in requests
					} else if (route.name === "Tables") {
						iconName = focused ? "grid" : "grid-outline"; // Table icon for table management
					} else if (route.name === "ChefsQ") {
						iconName = focused ? "restaurant" : "restaurant-outline"; // Chef's hat icon for ChefsQ
					} else if (route.name === "BackOfficeNavigator") {
						iconName = focused ? "briefcase" : "briefcase-outline";
					}

					return (
						<View
							style={[
								styles.iconContainer, // Apply the container style
								focused && styles.activeIconContainer, // Apply active style if focused
							]}
						>
							<Ionicons
								name={iconName}
								size={size * 1.5}
								color={focused ? "white" : colors.primary}
							/>
							{/* Increased size */}
						</View>
					);
				},
				tabBarActiveTintColor: colors.primary,
				tabBarInactiveTintColor: "gray",

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
				name="BackOfficeNavigator"
				component={BackOfficeStackNavigator}
				options={{ headerShown: false }}
			/>
		</Tab.Navigator>
	);
};

const styles = StyleSheet.create({
	// ... your other styles ...

	iconContainer: {
		backgroundColor: "white", // White background for inactive state
		padding: 8, // Add padding around the icon
		borderRadius: 50, // Make it circular
	},
	activeIconContainer: {
		backgroundColor: colors.primary, // Primary color background for active state
	},
});

export default RestaurantBottomNavigation;
