import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import RestaurantProfile from "../screens/restaurant/RestaurantProfile";
import RestaurantDashboard from "../screens/restaurant/RestaurantDashboard";
import MenuManagementScreen from "../screens/restaurant/MenuManagementScreen";
import CustomerDashboard from "../screens/customer/CustomerDashboard";
import CustomerProfile from "../screens/customer/CustomerProfile";
import RestaurantDetail from "../components/customer/RestaurantDetail";

const Tab = createBottomTabNavigator();

const CustomerBottomNavigation = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "CustomerDashboard") {
            iconName = focused ? "home" : "home-outline";
          } else if (route.name === "CustomerProfile") {
            iconName = focused ? "person" : "person-outline";
          } else if (route.name === "CustomerMenu") {
            iconName = focused ? "menu" : "menu-outline";
          } else if (route.name === "RestaurantCheckin") {
            iconName = focused
              ? "checkmark-circle"
              : "checkmark-circle-outline";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "tomato",
        tabBarInactiveTintColor: "gray",
        tabBarShowLabel: false,
        tabBarStyle: [{ display: "flex" }, null],
      })}
    >
      <Tab.Screen
        options={{ headerShown: false }}
        name="CustomerDashboard"
        component={CustomerDashboard}
      />
      <Tab.Screen
        options={{ headerShown: false }}
        name="CustomerProfile"
        component={CustomerProfile}
      />
      <Tab.Screen
        options={{ headerShown: false }}
        name="RestaurantDetail"
        component={RestaurantDetail}
      />
    </Tab.Navigator>
  );
};

export default CustomerBottomNavigation;
