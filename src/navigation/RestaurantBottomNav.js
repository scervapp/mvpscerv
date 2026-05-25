// navigation/RestaurantBottomNavigation.js (or your main restaurant nav file)
import React, { useContext } from "react";
import {
	Platform,
	View,
	StyleSheet,
	Text,
	TouchableOpacity,
} from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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
import BackOfficeAuthGate from "../screens/restaurant/BackOfficeAuthGate.js";

import colors from "../utils/styles/appStyles";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import HistoricalReportsScreen from "../screens/restaurant/HistoricalReportScreen";
import { useRestaurantData } from "../context/restaurant/RestaurantDataContext";
import ManagePartyScreen from "../screens/restaurant/ManagePartyScreen.js";
import ManualSeatScreen from "../screens/restaurant/ManualSeatingScreen.js";
import ServerMenuScreen from "../screens/restaurant/ServerMenuScreen.js";
import { useEmployeeSession } from "../context/restaurant/EmployeeSessionContext.js";
import PickupQueueScreen from "../screens/restaurant/PickupQueueScreen.js";
import OrdersLedgerScreen from "../screens/restaurant/OrdersLedgerScreen.js";
import OrderDetailScreen from "../screens/restaurant/OrderDetailScreen.js";
import ServiceRequestsScreen from "../screens/restaurant/ServiceRequestsScreen.js";
import { getRestaurantPermissions } from "../utils/restaurantPermissions.js";
import RestaurantLockButton from "../components/restaurant/RestaurantLockButton.js";
import { AuthContext } from "../context/authContext.js";
import { isPickupEnabledForRestaurant } from "../config/featureFlags.js";

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
	// 🚨 ADD THIS LINE:
	headerRight: () => <RestaurantLockButton style={styles.headerLockButton} />,
};

const TabBarBadge = ({ count }) => {
	if (!count || count === 0) return null;
	// Display '9+' if the count is higher than 9
	const badgeText = count > 9 ? "9+" : count.toString();
	return (
		<View style={styles.badge}>
			<Text style={styles.badgeText}>{badgeText}</Text>
		</View>
	);
};

// --- This stack is for all the "Back Office" related management screens ---
// It is now protected by the BackOfficeAuthGate as its initial route.
const BackOfficeStackNavigator = () => {
	const { t } = useTranslation();
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
				options={{ headerTitle: t("back_office_title") }}
			/>
			<Stack.Screen
				name="EmployeeScreen"
				component={EmployeeScreen}
				options={{ headerTitle: t("employee_management_title") }}
			/>
			<Stack.Screen
				name="SalesReportScreen"
				component={SalesReportScreen}
				options={{ title: "Business Report" }}
			/>
			<Stack.Screen
				name="OrdersLedgerScreen"
				component={OrdersLedgerScreen}
				options={{ title: "Orders Ledger" }}
			/>
			<Stack.Screen
				name="OrderDetailScreen"
				component={OrderDetailScreen}
				options={{ title: "Order Detail" }}
			/>
			<Stack.Screen
				name="DailySalesDetails"
				component={DailySalesDetailsScreen}
				options={{ headerTitle: t("daily_sales_details_title") }}
			/>
			<Stack.Screen
				name="HistoricalReports"
				component={HistoricalReportsScreen}
				options={{ headerTitle: t("historical_reports_title") }}
			/>
			<Stack.Screen
				name="RestaurantProfile"
				component={RestaurantProfile}
				options={{ headerTitle: t("restaurant_profile_title") }}
			/>
			<Stack.Screen
				name="RestaurantMenu"
				component={MenuManagementScreen}
				options={{ headerTitle: t("menu_management_title") }}
			/>
			<Stack.Screen
				name="Tables"
				component={TableManagementScreen}
				options={{ headerTitle: t("table_management", "Table Management") }}
			/>
		</Stack.Navigator>
	);
};
const ActiveTablesStack = () => (
	<Stack.Navigator screenOptions={defaultHeaderOptions}>
		<Stack.Screen
			name="RestaurantActiveTables"
			component={RestaurantCheckin}
			options={{ headerTitle: "My Tables" }}
		/>

		<Stack.Screen
			name="ManualSeatScreen"
			component={ManualSeatScreen}
			options={{ presentation: "modal" }} // "modal" makes it slide up from the bottom!
		/>
		{/* The detail screen for managing a specific table */}
		<Stack.Screen
			name="ManagePartyScreen"
			component={ManagePartyScreen}
			options={({ navigation }) => ({
				presentation: "card",
				headerLeft: () => (
					<TouchableOpacity
						onPress={() =>
							navigation.reset({
								index: 0,
								routes: [{ name: "RestaurantActiveTables" }],
							})
						}
						style={styles.headerBackButton}
					>
						<MaterialCommunityIcons
							name="arrow-left"
							size={24}
							color={colors.textDark}
						/>
					</TouchableOpacity>
				),
			})}
		/>
		<Stack.Screen
			name="ServerMenuScreen"
			component={ServerMenuScreen}
			options={{ presentation: "modal" }} // Slides up nicely
		/>
		<Stack.Screen
			name="ServiceRequestsScreen"
			component={ServiceRequestsScreen}
			options={{ headerTitle: "Service Requests" }}
		/>
	</Stack.Navigator>
);

// --- This is the main Tab Navigator for the restaurant app ---
const RestaurantBottomNavigation = () => {
	const { t } = useTranslation();
	const {
		newCheckInCount,
		newKitchenOrderCount,
		serviceRequestCount,
		pickupOrderCount,
	} = useRestaurantData();
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const permissions = getRestaurantPermissions(activeSession);
	const pickupEnabled = isPickupEnabledForRestaurant(currentUserData);
	const insets = useSafeAreaInsets();

	return (
		<Tab.Navigator
			screenOptions={({ route }) => ({
				...defaultHeaderOptions, // Headers are handled by the inner stack navigators
				headerShown: false,
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
				tabBarIcon: ({ focused, color, size }) => {
					let iconName;
					let badgeCount = 0;

					switch (route.name) {
						case "Dashboard":
							iconName = focused ? "view-dashboard" : "view-dashboard-outline";
							break;
						case "Checkins":
							iconName = focused ? "clipboard-text" : "clipboard-text-outline";
							badgeCount = newCheckInCount + serviceRequestCount;
							break;
						case "ChefsQ":
							iconName = focused
								? "silverware-fork-knife"
								: "silverware-fork-knife";
							badgeCount = newKitchenOrderCount;
							break;
						// 🚨 NEW: Added the Pickups Case
						case "Pickups":
							iconName = focused ? "bag-personal" : "bag-personal-outline";
							badgeCount = pickupEnabled ? pickupOrderCount || 0 : 0;
							break;

						default:
							iconName = "help-circle";
							break;
					}

					return (
						<View style={styles.iconWrapper}>
							<MaterialCommunityIcons
								name={iconName}
								size={focused ? 30 : 26}
								color={color}
							/>
							<TabBarBadge count={badgeCount} />
						</View>
					);
				},
				tabBarLabel: ({ focused, color }) => {
					let label;
					switch (route.name) {
						case "Dashboard":
							label = t("dashboard_tab");
							break;
						case "Checkins":
							label = t("tickets_tab");
							break;
						case "ChefsQ":
							label = t("chefs_q_tab");
							break;
						// 🚨 NEW: Added the Pickups Label
						case "Pickups":
							label = t("pickups_tab", "Pickups");
							break;
						case "BackOfficeNavigator":
							label = t("back_office_tab");
							break;
					}
					return <Text style={{ color: color, fontSize: 12 }}>{label}</Text>;
				},
			})}
		>
			{/* Tab 1: The New Dashboard (Home Base) */}
			{permissions.canViewDashboard && (
				<Tab.Screen name="Dashboard" component={RestaurantDashboardStack} />
			)}
			{/* Tab 2: Customers Waiting */}
			{permissions.canViewTickets && (
				<Tab.Screen name="Checkins" component={ActiveTablesStack} />
			)}

			{/* Tab 3: Chef's Queue */}
			{permissions.canViewKitchen && (
				<Tab.Screen name="ChefsQ" component={ChefsQScreen} />
			)}
			{/* 🚨 NEW Tab 4: Pickup Queue */}
			{pickupEnabled && permissions.canViewPickupQueue && (
				<Tab.Screen name="Pickups" component={PickupQueueScreen} />
			)}
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
	iconWrapper: {
		width: 30,
		height: 30,
		alignItems: "center",
		justifyContent: "center",
	},
	headerLockButton: {
		marginRight: 10,
	},
	headerBackButton: {
		minWidth: 44,
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: -8,
	},
	badge: {
		position: "absolute",
		right: -10,
		top: -4,
		backgroundColor: colors.statusDanger, // A bright, attention-grabbing color
		borderRadius: 10, // Makes it a perfect circle
		width: 20, // Ensures a consistent size
		height: 20,
		justifyContent: "center",
		alignItems: "center",
		// Add a border to make it "pop" off the icon
		borderWidth: 2,
		borderColor: colors.surfaceWhite,
	},
	badgeText: {
		color: "white",
		fontSize: 10,
		fontWeight: "bold",
	},
});

export default RestaurantBottomNavigation;
