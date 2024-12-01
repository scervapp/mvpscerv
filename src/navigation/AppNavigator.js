import React, { useContext, useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaView, View, ActivityIndicator } from "react-native";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

import { AuthContext } from "../context/authContext";
import { BasketProvider } from "../context/customer/BasketContext";
import { db } from "../config/firebase";

// Import your screen components
import WelcomeScreen from "../screens/WelcomeScreen";
import CustomerSignup from "../screens/auth/CustomerSignupScreen";
import RestaurantSignup from "../screens/auth/RestaurantSignupScreen";
import Login from "../screens/LoginScreen";
import CustomerDashboard from "../screens/customer/CustomerDashboard";
import RestaurantDashboard from "../screens/restaurant/RestaurantDashboard";
import RestaurantProfile from "../screens/restaurant/RestaurantProfile";
import RestaurantBottomNavigation from "./RestaurantBottomNav";
import CustomerBottomNavigation from "./CustomerBottomNav";
import PasswordResetScreen from "../screens/auth/PasswordResetScreen";
import colors from "../utils/styles/appStyles";
import RestaurantDetail from "../components/customer/RestaurantDetail";
import { enableScreens } from "react-native-screens";

enableScreens();
const Stack = createNativeStackNavigator();
const navigationRef = React.createRef();

const AppNavigator = () => {
	const { currentUserData } = useContext(AuthContext);
	const [isLoading, setIsLoading] = useState(true);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
			<NavigationContainer ref={navigationRef}>
				<Stack.Navigator initialRouteName="Welcome">
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
							{currentUserData.role === "guest" && (
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
									<Stack.Screen
										name="PasswordReset"
										component={PasswordResetScreen}
										options={{ headerShown: false }}
									/>
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
							<Stack.Screen
								name="PasswordReset"
								component={PasswordResetScreen}
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
