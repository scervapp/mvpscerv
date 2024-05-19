import React, { useContext, useEffect, useRef, useState } from "react";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import WelcomeScreen from "../screens/WelcomeScreen";
import CustomerSignup from "../screens/auth/CustomerSignupScreen";
import RestaurantSignup from "../screens/auth/RestaurantSignupScreen";

import colors from "../utils/styles/appStyles";
import { SafeAreaView } from "react-native";
import Login from "../screens/LoginScreen";
import CustomerDashboard from "../screens/customer/CustomerDashboard";
import RestaurantDashboard from "../screens/restaurant/RestaurantDashboard";
import { AuthContext } from "../context/authContext";
import RestaurantProfile from "../screens/restaurant/RestaurantProfile";
import RestaurantBottomNavigation from "./RestaurantBottomNav";
import CustomerBottomNavigation from "./CustomerBottomNav";
import BackButton from "../utils/BackButton";
import BasketScreen from "../screens/customer/BasketScreen";
import MenuItemsList from "../components/customer/MenuItemsList";

//import CustomerVerification from "../screens/CustomerVerification";

// import Login from "../screens/Login";
// import decodeIdToken from "../utils/decodedIdToken";
// import { checkAuthStatus } from "../service/authService";
// import { useAuth } from "../context/authContext";
// import RestaurantProfile from "../screens/RestaurantProfile";
// import { SafeAreaView } from "react-native";
// import colors from "../styles/appStyles";
// import RestaurantDetail from "../components/Customer/RestaurantDetail";

const Stack = createNativeStackNavigator();
const navigationRef = React.createRef();

const AppNavigator = () => {
  const { currentUser, isLoading, currentUserData } = useContext(AuthContext);

  return (
    <SafeAreaView
      style={{ flex: 1, padding: 10, backgroundColor: colors.background }}
    >
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator initialRouteName={WelcomeScreen}>
          {currentUserData ? (
            <>
              {currentUserData.role === "restaurant" && (
                <>
                  <Stack.Screen
                    name="RestaurantHome"
                    component={RestaurantBottomNavigation}
                    options={{ headerShown: false }}
                  ></Stack.Screen>
                </>
              )}
              {currentUserData.role === "customer" && (
                <>
                  <Stack.Screen
                    name="CustomerHome"
                    component={CustomerBottomNavigation}
                    options={{ headerShown: false }}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <Stack.Screen
                name="Welcome"
                component={WelcomeScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Login"
                component={Login}
                options={{ headerShown: false }}
              />

              <Stack.Screen
                name="RestaurantSignup"
                component={RestaurantSignup}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="CustomerSignup"
                component={CustomerSignup}
                options={{ headerShown: false }}
              />
            </>
          )}

          {/*
      
          <Stack.Screen
            name="RestaurantDetail"
            component={RestaurantDetail}
            options={{ headerShown: false }}
          /> */}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
};
export default AppNavigator;
