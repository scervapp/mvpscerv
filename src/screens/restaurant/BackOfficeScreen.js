import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	FlatList,
	TouchableOpacity,
	Linking,
	Alert,
	Image,
	Button,
	Dimensions,
	ActivityIndicator,
} from "react-native";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { collection, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import colors from "../../utils/styles/appStyles";

const { width } = Dimensions.get("window");
const cardMargin = 10;
const numColumns = 2;
const cardWidth = width / numColumns - cardMargin * (numColumns + 1);

const BackOfficeScreen = ({ navigation }) => {
	const { currentUserData, logout } = useContext(AuthContext);
	const [restaurantData, setRestaurantData] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isStripeLoading, setIsStripeLoading] = useState(false); // Specific loading for Stripe actions
	const [isLogoutLoading, setIsLogoutLoading] = useState(false); // Specific loading for logout

	// Define an array of screen names and their display labels
	const baseScreens = [
		{
			name: "RestaurantMenu",
			label: "Menu",
			iconName: "silverware-fork-knife",
		},
		{
			name: "RestaurantProfile",
			label: "Profile",
			iconName: "store-settings-outline",
		},
		{
			name: "EmployeeScreen",
			label: "Employee",
			iconName: "account-group-outline",
		},
		{
			name: "SalesReportScreen",
			label: "Daily Sales Report",
			iconName: "chart-line",
		},

		// Add more screens as needed
	];

	const [screens, setScreens] = useState(baseScreens);

	useEffect(() => {
		let dynamicScreens = [...baseScreens];
		if (!currentUserData?.stripeAccountId) {
			dynamicScreens.push({
				name: "CreateStripeAccount",
				label: "Setup Payouts",
				iconName: "credit-card-plus-outline",
				action: handleCreateConnectedAccount, // Assign action directly
			});
		} else {
			dynamicScreens.push({
				name: "ConnectAccount",
				label: "Payouts Dashboard",
				iconName: "open-in-new", // Or 'link-variant'
				action: handleCheckOnboardingStatus, // Assign action directly
			});
		}
		setScreens(dynamicScreens);
	}, [currentUserData?.stripeAccountId]);

	const handleCreateConnectedAccount = async () => {
		try {
			const createAccount = httpsCallable(functions, "createConnectedAccount");
			await createAccount(currentUserData);
			Alert.alert("Successfully Initialized");
		} catch (error) {
			console.error("Error creating connected account:", error);
			Alert.alert("Failed to initialize. Please try again.");
		}
	};

	const handleCheckOnboardingStatus = async () => {
		if (isStripeLoading || !currentUserData?.stripeAccountId) return;
		setIsStripeLoading(true);

		try {
			const checkOnboardingStatus = httpsCallable(
				functions,
				"checkOnboardingStatus"
			);
			const response = await checkOnboardingStatus({
				accountId: currentUserData.stripeAccountId,
			});

			if (response.data.isOnboarded) {
				// Account is onboarded, proceed with your logic
				console.log("Account is onboarded");
				handleConnectAccount();
				// Proceed to create login link or other actions
			} else {
				// Account is not onboarded, prompt user to complete onboarding
				console.log("Account is not onboarded");
				Linking.openURL(response.data.accountLinkUrl);
			}
		} catch (error) {
			console.error("Error checking onboarding status:", error);
			Alert.alert(
				"Error",
				"Failed to check onboarding status. Please try again."
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleConnectAccount = async () => {
		// Redirect to Stripe onboarding URL
		const createLoginLink = httpsCallable(functions, "createLoginLink");
		const response = await createLoginLink({
			accountId: currentUserData.stripeAccountId,
		});
		await Linking.openURL(response.data.url);
	};

	// // Conditionally add the Connect Account Screen if no stripe account is found
	// if (!currentUserData?.stripeAccountId) {
	// 	screens.push({
	// 		name: "CreateStripeAccount",
	// 		label: "Setup Account",
	// 	});
	// }

	// if (currentUserData?.stripeAccountId) {
	// 	screens.push({
	// 		name: "ConnectAccount",
	// 		label: "Connect Account",
	// 	});
	// }

	const handleScreenPress = (screenName) => {
		navigation.navigate(screenName); // Navigate to the selected screen
	};

	// --- Logout Function ---
	const handleLogout = async () => {
		setIsLogoutLoading(true);
		try {
			await logout();
			// Navigation will likely be handled by your AuthContext/Navigator setup
		} catch (error) {
			console.error("Logout failed:", error);
			Alert.alert("Logout Error", "Could not log out. Please try again.");
			setIsLogoutLoading(false);
		}
		// No finally needed if navigation takes over
	};

	// --- Render Item Function for FlatList ---
	const renderGridItem = ({ item }) => (
		<TouchableOpacity
			onPress={() => {
				if (item.action) {
					// If an action is defined (like Stripe actions)
					item.action();
				} else {
					// Otherwise, navigate
					handleScreenPress(item.name);
				}
			}}
			style={styles.card}
			disabled={isStripeLoading} // Disable card during Stripe loading
		>
			<View style={styles.iconContainer}>
				{isStripeLoading &&
				(item.name === "CreateStripeAccount" ||
					item.name === "ConnectAccount") ? (
					<ActivityIndicator size="large" color={colors.primary} />
				) : (
					<MaterialCommunityIcons
						name={item.iconName}
						size={40}
						color={colors.primary}
					/>
				)}
			</View>
			<Text style={styles.cardLabel}>{item.label}</Text>
		</TouchableOpacity>
	);

	return (
		<View style={styles.container}>
			<Text style={styles.welcomeText}>
				Welcome, {currentUserData?.firstName || "Admin"}!
			</Text>
			<Text style={styles.heading}>Back Office</Text>

			{isLoading ? ( // Use this for initial screen loading if needed
				<ActivityIndicator size="large" color={colors.primary} />
			) : (
				<FlatList
					data={screens}
					keyExtractor={(item) => item.name}
					numColumns={numColumns}
					renderItem={renderGridItem}
					contentContainerStyle={styles.listContainer}
				/>
			)}

			{/* More prominent Logout Button */}
			<TouchableOpacity
				style={[styles.button, styles.logoutButton]}
				onPress={handleLogout}
				disabled={isLogoutLoading}
			>
				{isLogoutLoading ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.buttonText}>Logout</Text>
				)}
			</TouchableOpacity>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: cardMargin, // Use cardMargin for consistent padding
		backgroundColor: colors.background || "#f8f9fa", // Default background
	},
	welcomeText: {
		fontSize: 18,
		fontWeight: "500",
		color: colors.textDark || "#495057",
		marginBottom: 10,
		textAlign: "center",
	},
	heading: {
		fontSize: 28,
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.primary || "#007bff", // Use primary color
		textAlign: "center",
	},
	listContainer: {
		paddingBottom: 20, // Add padding at the bottom of the list
	},
	card: {
		flex: 1, // Take up equal space
		margin: cardMargin,
		width: cardWidth, // Calculated width
		aspectRatio: 1, // Make cards square-ish
		backgroundColor: "#ffffff", // White background for cards
		borderRadius: 15, // More rounded corners
		padding: 15,
		alignItems: "center",
		justifyContent: "center",
		// iOS Shadow
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 3.84,
		// Android Shadow
		elevation: 5,
	},
	iconContainer: {
		width: 60, // Fixed size container for icon or loader
		height: 60,
		marginBottom: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	cardLabel: {
		fontSize: 15,
		fontWeight: "600", // Semi-bold
		textAlign: "center",
		color: colors.text || "#343a40", // Default text color
	},
	button: {
		paddingVertical: 12,
		paddingHorizontal: 30,
		borderRadius: 25, // Rounded button
		alignItems: "center",
		justifyContent: "center",
		marginTop: 20,
	},
	logoutButton: {
		backgroundColor: colors.danger || "#dc3545", // Use a danger color for logout
		alignSelf: "center", // Center the button
		width: "80%", // Make it reasonably wide
		marginBottom: 20,
	},
	buttonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default BackOfficeScreen;
