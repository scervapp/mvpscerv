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
import RestaurantDashboardScreen from "../screens/restaurant/RestaurantDashboardScreen";
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const BackOfficeStackNavigator = () => {
	return (
		<Stack.Navigator screenOptions={defaultHeaderOptions}>
			<Stack.Screen
				name="BackOffice"
				component={BackOfficeScreen}
				options={{ headerShown: false }} // The grid screen doesn't need a header
			/>
			<Stack.Screen
				name="EmployeeScreen"
				component={EmployeeScreen}
				options={{ headerTitle: "Employee Management" }}
			/>
			<Stack.Screen
				name="SalesReportScreen"
				component={SalesReportScreen}
				options={{ headerTitle: "Daily Sales Summary" }}
			/>
			<Stack.Screen
				name="DailySalesDetails"
				component={DailySalesDetailsScreen}
				options={{ headerTitle: "Daily Sales Details" }}
			/>
			<Stack.Screen
				name="RestaurantProfile"
				component={RestaurantProfile}
				options={{ headerTitle: "Restaurant Profile" }}
			/>
			<Stack.Screen
				name="RestaurantMenu"
				component={MenuManagementScreen}
				options={{ headerTitle: "Menu Management" }}
			/>
			{/* Note: BackOfficeAccess might be part of a separate login/auth flow now */}
		</Stack.Navigator>
	);
};

const RestaurantBottomNavigation = () => {
	return (
		<Tab.Navigator
			screenOptions={({ route }) => ({
				headerShown: false, // Headers are handled by individual stack navigators
				tabBarIcon: ({ focused, color, size }) => {
					let iconName;
					size = focused ? 30 : 26; // Make focused icon slightly larger

					if (route.name === "Dashboard") {
						iconName = focused ? "view-dashboard" : "view-dashboard-outline";
					} else if (route.name === "RestaurantCheckin") {
						iconName = focused ? "account-clock" : "account-clock-outline";
					} else if (route.name === "TableManagement") {
						iconName = focused ? "grid" : "view-grid-outline";
					} else if (route.name === "ChefsQ") {
						iconName = focused
							? "silverware-fork-knife"
							: "silverware-fork-knife";
					} else if (route.name === "BackOfficeNavigator") {
						iconName = focused ? "briefcase" : "briefcase-outline";
					}

					// Use MaterialCommunityIcons for a consistent icon set
					return (
						<MaterialCommunityIcons name={iconName} size={size} color={color} />
					);
				},
				tabBarActiveTintColor: colors.primary,
				tabBarInactiveTintColor: colors.textMedium,
				tabBarShowLabel: true, // Labels are helpful for staff
				tabBarStyle: styles.tabBar,
			})}
		>
			{/* Tab 1: The New Dashboard (Home Base) */}
			<Tab.Screen name="Dashboard" component={RestaurantDashboardScreen} />

			{/* Tab 2: Customers Waiting */}
			<Tab.Screen
				name="RestaurantCheckin"
				component={RestaurantCheckin}
				options={{ title: "Check-ins" }}
			/>

			{/* Tab 3: Chef's Queue */}
			<Tab.Screen
				name="ChefsQ"
				component={ChefsQScreen}
				options={{ title: "Chef's Q" }}
			/>

			{/* Tab 4: Table Management */}
			<Tab.Screen
				name="TableManagement"
				options={{ title: "Table Management" }}
				component={TableManagementScreen}
			/>

			{/* Tab 5: Back Office Settings */}
			<Tab.Screen
				name="BackOfficeNavigator"
				component={BackOfficeStackNavigator}
				options={{ title: "Back Office" }}
			/>
		</Tab.Navigator>
	);
};

// ... your other styles ...

const styles = StyleSheet.create({
	tabBar: {
		height: Platform.OS === "ios" ? 90 : 65,
		paddingBottom: Platform.OS === "ios" ? 30 : 5,
		paddingTop: 5,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
});

export default RestaurantBottomNavigation;
