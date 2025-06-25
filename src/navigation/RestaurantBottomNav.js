// navigation/RestaurantBottomNavigation.js (or your main restaurant nav file)
import React, { use } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// --- Import all your screens ---
// 1. Import your NEW operational dashboard and auth gate
import RestaurantDashboardScreen from "../screens/restaurant/RestaurantDashboardScreen";

// 2. Import the screens for your other operational tabs
import RestaurantCheckin from "../screens/restaurant/RestaurantCheckin";
import TableManagementScreen from "../screens/restaurant/TableManagementScreen";
import ChefsQScreen from "../screens/restaurant/ChefsQScreen";

// 3. Import your existing Back Office and its related screens
import BackOfficeScreen from "../screens/restaurant/BackOfficeScreen";
import EmployeeScreen from "../screens/restaurant/EmployeeScreen";
import SalesReportScreen from "../screens/restaurant/SalesReportScreen";
import DailySalesDetailsScreen from "../screens/restaurant/DailySalesDetailsScreen";
import RestaurantProfile from "../screens/restaurant/RestaurantProfile";
import MenuManagementScreen from "../screens/restaurant/MenuManagementScreen";

import colors from "../utils/styles/appStyles";
import BackOfficeAuthGate from "../screens/restaurant/BackOfficeAuthGate.";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// This is defined once at the top level to be accessible by any stack navigator that needs it.
const defaultHeaderOptions = {
	headerShown: true,
	headerStyle: {
		backgroundColor: colors.surfaceWhite,
	},
	headerTintColor: colors.textDark,
	headerTitleStyle: {
		fontWeight: "bold",
	},
};

// --- This stack is for all the "Back Office" related management screens ---
// It is now protected by the BackOfficeAuthGate as its initial route.
const BackOfficeStackNavigator = () => {
	return (
		<Stack.Navigator
			screenOptions={defaultHeaderOptions}
			initialRouteName="BackOfficeAuthGate"
		>
			<Stack.Screen
				name="BackOfficeAuthGate"
				component={BackOfficeAuthGate}
				options={{ headerShown: false }} // The gate screen is seamless
			/>
			<Stack.Screen
				name="BackOffice"
				component={BackOfficeScreen}
				options={{ headerTitle: "Back Office" }}
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
		</Stack.Navigator>
	);
};

// --- This is the main Tab Navigator for the restaurant app ---
const RestaurantBottomNavigation = () => {
	const insets = useSafeAreaInsets();

	return (
		<Tab.Navigator
			screenOptions={({ route }) => ({
				headerShown: false, // Headers are handled by the inner stack navigators
				tabBarIcon: ({ focused, color, size }) => {
					let iconName;
					size = focused ? 30 : 26;

					if (route.name === "Dashboard") {
						iconName = focused ? "view-dashboard" : "view-dashboard-outline";
					} else if (route.name === "Checkins") {
						iconName = focused ? "account-clock" : "account-clock-outline";
					} else if (route.name === "Tables") {
						iconName = focused ? "table-chair" : "table-chair";
					} else if (route.name === "ChefsQ") {
						iconName = focused
							? "silverware-fork-knife"
							: "silverware-fork-knife";
					}

					return (
						<MaterialCommunityIcons name={iconName} size={size} color={color} />
					);
				},
				tabBarActiveTintColor: colors.primary,
				tabBarInactiveTintColor: colors.textMedium,
				tabBarShowLabel: true,
				tabBarStyle: {
					backgroundColor: colors.surfaceWhite,
					borderTopWidth: 1,
					borderTopColor: colors.borderLight,
					paddingTop: 10,
					paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
					height: 60 + insets.bottom, // total height adjusts based on device
				},
			})}
		>
			{/* Tab 1: The New Dashboard (Home Base) */}
			<Tab.Screen
				name="Dashboard"
				// The Dashboard will have its own StackNavigator to contain itself and the BackOffice stack
				component={RestaurantDashboardStack}
			/>
			{/* Tab 2: Customers Waiting */}
			<Tab.Screen
				name="Checkins" // Renamed for clarity if needed
				component={RestaurantCheckin}
			/>
			{/* Tab 3: Chef's Queue */}
			<Tab.Screen
				name="ChefsQ"
				component={ChefsQScreen}
				options={{ title: "Chef's Q" }}
			/>
			{/* Tab 4: Table Management */}
			<Tab.Screen
				name="Tables"
				component={TableManagementScreen}
				options={{ title: "Tables" }}
			/>
		</Tab.Navigator>
	);
};

// --- This new stack navigator will be the component for the "Dashboard" tab ---
// This allows you to navigate from the Dashboard to the Back Office while staying in the same tab.
const RestaurantDashboardStack = () => (
	<Stack.Navigator screenOptions={{ headerShown: false }}>
		<Stack.Screen name="DashboardHome" component={RestaurantDashboardScreen} />
		<Stack.Screen
			name="BackOfficeNavigator"
			component={BackOfficeStackNavigator}
		/>
	</Stack.Navigator>
);

const styles = StyleSheet.create({
	tabBar: {
		paddingBottom: Platform.OS === "ios" ? 30 : 10,
		paddingTop: 10,

		// Keep existing styles
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,

		// Setting an explicit height is still possible if needed after testing,
		// but often dynamic padding is better.
		// If you need a fixed height, you can try increasing the Android value:
		height: Platform.OS === "ios" ? 90 : 70,
	},
});

export default RestaurantBottomNavigation;
