import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import RestaurantProfile from "../screens/restaurant/RestaurantProfile";
import RestaurantDashboard from "../screens/restaurant/RestaurantDashboard";
import MenuManagementScreen from "../screens/restaurant/MenuManagementScreen";
import RestaurantCheckin from "../screens/restaurant/RestaurantCheckin";
import TableManagementScreen from "../screens/restaurant/TableManagementScreen";

const Tab = createBottomTabNavigator();

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
          } else if (route.name === "RestaurantMenu") {
            iconName = focused ? "menu" : "menu-outline";
          } else if (route.name === "RestaurantCheckin") {
            iconName = focused
              ? "checkmark-circle"
              : "checkmark-circle-outline";
          } else if (route.name === "Tables") {
            iconName = focused ? "restaurant-outline" : "restaurant-outline";
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
        name="RestaurantDashboard"
        component={RestaurantDashboard}
      />
      <Tab.Screen
        options={{ headerShown: false }}
        name="RestaurantProfile"
        component={RestaurantProfile}
      />
      <Tab.Screen
        options={{ headerShown: false }}
        name="RestaurantMenu"
        component={MenuManagementScreen}
      />
    </Tab.Navigator>
  );
};

export default RestaurantBottomNavigation;
