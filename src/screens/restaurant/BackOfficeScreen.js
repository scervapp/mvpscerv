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
} from "react-native";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";

import { collection, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import colors from "../../utils/styles/appStyles";

const BackOfficeScreen = ({ navigation }) => {
	const { currentUserData, logout } = useContext(AuthContext);
	const [restaurantData, setRestaurantData] = useState(null);
	const [isLoading, setIsLoading] = useState(false);

	// Define an array of screen names and their display labels
	const screens = [
		{ name: "RestaurantDashboard", label: "Dashboard" },
		{ name: "OrdersScreen", label: "Orders" },
		{ name: "RestaurantMenu", label: "Menu Management" },
		{ name: "RestaurantProfile", label: "Profile" },
		{ name: "EmployeeScreen", label: "Employee" },
		{ name: "SalesReportScreen", label: "Daily Sales Report" },

		// Add more screens as needed
	];

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
		setIsLoading(true);
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

	// Conditionally add the Connect Account Screen if no stripe account is found
	if (!currentUserData?.stripeAccountId) {
		screens.push({
			name: "CreateStripeAccount",
			label: "Setup Account",
		});
	}

	if (currentUserData?.stripeAccountId) {
		screens.push({
			name: "ConnectAccount",
			label: "Connect Account",
		});
	}

	const handleScreenPress = (screenName) => {
		navigation.navigate(screenName); // Navigate to the selected screen
	};

	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Back Office</Text>

			{isLoading ? (
				<Text style={styles.loadingText}>Loading...</Text>
			) : (
				<FlatList
					data={screens}
					keyExtractor={(item) => item.name}
					numColumns={2} // Display items in two columns
					renderItem={({ item }) => (
						<TouchableOpacity
							onPress={() => {
								if (item.name === "ConnectAccount") {
									handleCheckOnboardingStatus();
								} else if (item.name === "CreateStripeAccount") {
									handleCreateConnectedAccount();
								} else {
									handleScreenPress(item.name);
								}
							}}
							style={styles.card}
						>
							<Image source={item.icon} style={styles.icon} />
							<Text style={styles.cardLabel}>{item.label}</Text>
						</TouchableOpacity>
					)}
				/>
			)}
			<View style={styles.logoutButtonContainer}>
				<Button title="Logout" onPress={logout} color="red" />
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
		backgroundColor: colors.background,
	},
	heading: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.primary,
	},
	loadingText: {
		textAlign: "center",
		marginTop: 20,
	},
	card: {
		flex: 1,
		margin: 10,
		backgroundColor: colors.lightGray,
		borderRadius: 10,
		padding: 20,
		alignItems: "center",
		justifyContent: "center",
		elevation: 3, // For Android shadow
		shadowColor: "#000", // For iOS shadow
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.2,
		shadowRadius: 1,
	},
	icon: {
		width: 50,
		height: 50,
		marginBottom: 10,
	},
	cardLabel: {
		fontSize: 16,
		fontWeight: "bold",
		textAlign: "center",
	},
	logoutButtonContainer: {
		alignSelf: "center", // Align the button horizontally in the center
		marginBottom: 20, // Add space at the bottom
		width: "100%", // Makes the button take up the full width
	},
});

export default BackOfficeScreen;
