// navigation/AppNavigator.js
import React, { useContext, useEffect, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../context/authContext";
import { useEmployeeSession } from "../context/restaurant/EmployeeSessionContext"; // 🚨 NEW: Import the session context
import colors from "../utils/styles/appStyles";

// --- Import All Screens ---
// Auth Screens
import WelcomeScreen from "../screens/WelcomeScreen";
import LoginScreen from "../screens/LoginScreen";
import CustomerSignupScreen from "../screens/auth/CustomerSignupScreen";
import RestaurantSignupScreen from "../screens/auth/RestaurantSignupScreen";
import PasswordResetScreen from "../screens/auth/PasswordResetScreen";

// Main App Navigators
import CustomerBottomNavigation from "./CustomerBottomNav";
import RestaurantBottomNavigation from "./RestaurantBottomNav";
import PosLockScreen from "../screens/restaurant/PosLockScreen";

const Stack = createNativeStackNavigator();

// --- Auth Stack ---
const AuthStack = () => (
	<Stack.Navigator
		initialRouteName="Welcome"
		screenOptions={{
			headerStyle: { backgroundColor: colors.backgroundLight },
			headerTintColor: colors.textDark,
			headerTitle: "",
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

// --- 🚨 NEW: The Enterprise POS Wrapper ---
// This acts as a physical gate in front of the Restaurant Bottom Navigation
const RestaurantFlow = () => {
	const { activeSession } = useEmployeeSession();

	// If no one has entered a PIN, show the Lock Screen
	if (!activeSession) {
		return <PosLockScreen />;
	}

	// Once a PIN is verified, reveal the POS
	return <RestaurantBottomNavigation />;
};

const AppNavigator = () => {
	const { t } = useTranslation();
	const { currentUserData, isLoading, clearRedirectPath, redirectPath } =
		useContext(AuthContext);
	const navigationRef = useRef();

	useEffect(() => {
		if (currentUserData?.requiresOnboarding) {
			console.log(
				"AppNavigator: Onboarding required. Navigating to Employee setup.",
			);
			navigationRef.current?.navigate("BackOfficeNavigator", {
				screen: "EmployeeScreen",
			});
		}
	}, [currentUserData?.requiresOnboarding]);

	useEffect(() => {
		if (!isLoading && !currentUserData && redirectPath) {
			console.log(
				`AppNavigator: User logged out. Redirecting to: ${redirectPath}`,
			);
			navigationRef.current?.navigate("Auth", { screen: redirectPath });
			clearRedirectPath();
		}
	}, [isLoading, currentUserData, redirectPath, clearRedirectPath]);

	if (isLoading) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<NavigationContainer ref={navigationRef}>
			<Stack.Navigator screenOptions={{ headerShown: false }}>
				{currentUserData ? (
					// --- User is LOGGED IN ---
					currentUserData.role === "restaurant" ||
					currentUserData.role === "owner" ||
					currentUserData.role === "manager" ? (
						<Stack.Screen
							name="RestaurantApp"
							component={RestaurantFlow} // 🚨 FIX: Replaced BottomNavigation with our new Wrapper
						/>
					) : (
						<Stack.Screen
							name="CustomerApp"
							component={CustomerBottomNavigation}
						/>
					)
				) : (
					// --- User is LOGGED OUT ---
					<Stack.Screen name="Auth" component={AuthStack} />
				)}
			</Stack.Navigator>
		</NavigationContainer>
	);
};

export default AppNavigator;
