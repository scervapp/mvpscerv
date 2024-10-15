import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	FlatList,
	TouchableOpacity,
	Linking,
	Alert,
} from "react-native";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";

import { collection, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const BackOfficeScreen = ({ navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const [restaurantData, setRestaurantData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

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

	const showOnboardingInstructions = (requirements) => {
		// You can customize this function to display the onboarding requirements to the user
		Alert.alert(
			"Onboarding Required",
			"Please complete the onboarding process to access your account.",
			[
				{
					text: "OK",
					onPress: () =>
						Linking.openURL(
							"https://stripe.com/docs/connect/connect-onboarding"
						),
				},
			]
		);
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
	if (!isLoading || !currentUserData?.stripeAccountId) {
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

			<FlatList
				data={screens}
				keyExtractor={(item) => item.name}
				renderItem={({ item }) => (
					<TouchableOpacity
						onPress={() => {
							if (item.name === "CreateStripeAccount") {
								handleCreateConnectedAccount();
							} else if (item.name === "ConnectAccount") {
								handleCheckOnboardingStatus();
							} else {
								handleScreenPress(item.name);
							}
						}}
						style={styles.screenItem}
					>
						<Text>{item.label}</Text>
					</TouchableOpacity>
				)}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
	},
	heading: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 10,
	},
	screenItem: {
		padding: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#ccc",
	},
});

export default BackOfficeScreen;
