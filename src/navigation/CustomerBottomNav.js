import React from "react";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
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
        headerShown: route.name === "BasketScreen",
        headerTItle: "Basket",
        headerLeft: () => {
          <BackButton onPress={() => navigation.goBack()} />;
        },
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
      <Tab.Screen
        options={{
          headerTitle: "Basket",
          headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
        }}
        name="BasketScreen"
        component={BasketScreen}
      />
      <Tab.Screen
        options={{
          headerShown: false,
        }}
        name="CheckoutScreen"
        component={CheckoutScreen}
      />
      <Tab.Screen
        options={{ headerShown: false }}
        name="AccountScreen"
        component={AccountScreen}
      />
      <Tab.Screen
        options={{ headerShown: false }}
        name="PipsScreen"
        component={PIPSListScreen}
      />
    </Tab.Navigator>
  );
};

export default CustomerBottomNavigation;
