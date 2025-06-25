// navigation/AppNavigator.js
import React, { useContext, useEffect, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator } from "react-native";

import { AuthContext } from "../context/authContext";
import colors from "../utils/styles/appStyles";

// --- Import All Screens ---
// Auth Screens
import WelcomeScreen from "../screens/WelcomeScreen";
import LoginScreen from "../screens/LoginScreen";
import CustomerSignupScreen from "../screens/auth/CustomerSignupScreen";
import RestaurantSignupScreen from "../screens/auth/RestaurantSignupScreen";
import PasswordResetScreen from "../screens/auth/PasswordResetScreen";

// Main App Navigators (These contain your Tab Navigators)
import CustomerBottomNavigation from "./CustomerBottomNav";
import RestaurantBottomNavigation from "./RestaurantBottomNav";

const Stack = createNativeStackNavigator();

// --- NEW: A dedicated navigator for the Authentication Flow ---
// This stack includes all screens a user sees before they are logged in.
const AuthStack = () => (
	<Stack.Navigator
		initialRouteName="Welcome"
		screenOptions={{
			headerStyle: { backgroundColor: colors.backgroundLight },
			headerTintColor: colors.textDark,
			headerTitle: "", // Hides title by default, can be set per screen
			headerShadowVisible: false,
		}}
	>
		<Stack.Screen
			name="Welcome"
			component={WelcomeScreen}
			options={{ headerShown: false }}
		/>
		<Stack.Screen name="Login" component={LoginScreen} />
		<Stack.Screen name="CustomerSignup" component={CustomerSignupScreen} />
		<Stack.Screen name="RestaurantSignup" component={RestaurantSignupScreen} />
		<Stack.Screen name="PasswordReset" component={PasswordResetScreen} />
	</Stack.Navigator>
);

// --- This is now the main App Navigator ---
// Its only job is to decide which major part of the app to show:
// the Auth flow, the Customer app, or the Restaurant app.
const AppNavigator = () => {
	const { currentUserData, isLoading, clearRedirectPath, redirectPath } =
		useContext(AuthContext);
	const navigationRef = useRef();

	useEffect(() => {
		// This effect runs when the user data changes
		if (currentUserData?.requiresOnboarding) {
			console.log(
				"AppNavigator: Onboarding required. Navigating to Employee setup."
			);
			// Navigate directly to the Back Office stack, and then to the EmployeeScreen
			navigationRef.current?.navigate("BackOfficeNavigator", {
				screen: "EmployeeScreen",
			});
		}
	}, [currentUserData?.requiresOnboarding]);

	useEffect(() => {
		if (!isLoading && !currentUserData && redirectPath) {
			console.log(
				`AppNavigator: User logged out. Redirecting to: ${redirectPath}`
			);

			// --- THE FIX IS HERE ---
			// Navigate to the 'Auth' stack first, then specify the 'Login' screen within it.
			navigationRef.current?.navigate("Auth", { screen: redirectPath });

			clearRedirectPath(); // Clear the path so it doesn't run again
		}
	}, [isLoading, currentUserData, redirectPath, clearRedirectPath]);

	// Show a loading spinner while the AuthContext is checking the user's status
	if (isLoading) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<NavigationContainer>
			<Stack.Navigator screenOptions={{ headerShown: false }}>
				{currentUserData ? (
					// --- User is LOGGED IN ---
					// Conditionally render the correct app based on their role
					currentUserData.role === "restaurant" ||
					currentUserData.role === "owner" ||
					currentUserData.role === "manager" ? (
						<Stack.Screen
							name="RestaurantApp"
							component={RestaurantBottomNavigation}
						/>
					) : (
						<Stack.Screen
							name="CustomerApp"
							component={CustomerBottomNavigation}
						/>
					)
				) : (
					// --- User is LOGGED OUT ---
					// Show the entire authentication stack
					<Stack.Screen name="Auth" component={AuthStack} />
				)}
			</Stack.Navigator>
		</NavigationContainer>
	);
};

export default AppNavigator;
