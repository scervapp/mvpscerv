import React, { useEffect, useContext } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Button } from "react-native";
import { AuthContext } from "../context/authContext";
import colors from "../utils/styles/appStyles";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "react-native";

const WelcomeScreen = ({ navigation }) => {
	const { continueAsGuest, currentUser } = useContext(AuthContext);

	const handleContinueAsGuest = async () => {
		try {
			await continueAsGuest(navigation);
		} catch (error) {
			console.error("Error continuing as guest", error);
		}
	};

	return (
		<View style={styles.container}>
			{/* Use a regular View as the outer container */}

			<Image
				source={require("../../assets/scerv_logo.png")}
				style={styles.logo}
			/>
			<Text style={styles.title}>Welcome to Scerv</Text>
			{/* Customer Signup Section */}
			<TouchableOpacity
				style={styles.customerButton}
				onPress={() => navigation.navigate("CustomerSignup")}
			>
				<Text style={styles.customerButtonText}>Sign Up</Text>
			</TouchableOpacity>
			<View style={styles.loginContainer}>
				<Text style={styles.existingAccount}>Already have an account? </Text>
				<TouchableOpacity onPress={() => navigation.navigate("Login")}>
					<Text style={styles.loginLink}>Log In</Text>
				</TouchableOpacity>
			</View>
			<TouchableOpacity
				onPress={() => handleContinueAsGuest()}
				style={styles.guestButton}
			>
				{/* Call the function */}
				<Text style={styles.guestButtonText}>Continue as Guest</Text>
			</TouchableOpacity>
			{/* Restaurants Section */}
			<TouchableOpacity
				style={styles.restaurantPromptContainer}
				onPress={() => navigation.navigate("RestaurantSignup")}
			>
				<Text style={styles.restaurantPrompt}>Restaurants? Go Here</Text>
			</TouchableOpacity>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
		backgroundColor: colors.background, // Use your background color here
	},
	logo: {
		width: 125,
		height: 125,
		resizeMode: "contain",
		marginBottom: 40,
	},
	title: {
		fontSize: 32,
		fontWeight: "bold",
		marginBottom: 40,
		color: colors.primary, // Use your primary color for the title
	},
	customerButton: {
		backgroundColor: colors.primary, // Primary color for the button background
		padding: 15,
		borderRadius: 8,
		width: "80%",
		alignItems: "center",
	},
	customerButtonText: {
		fontSize: 18,
		fontWeight: "bold",
		color: "white", // White text for contrast
	},
	loginContainer: {
		flexDirection: "row",
		marginTop: 20,
	},
	existingAccount: {
		fontSize: 16,
		color: colors.text, // Use a color from your colors object
	},
	loginLink: {
		fontSize: 16,
		color: colors.primary, // Use your primary color for the link
		fontWeight: "bold",
		textDecorationLine: "underline",
	},
	restaurantPromptContainer: {
		position: "absolute",
		bottom: 20,
		alignSelf: "center",
	},
	restaurantPrompt: {
		fontSize: 16,
		color: colors.primary,
		textDecorationLine: "underline",
	},
	guestButton: {
		backgroundColor: colors.secondary, // Or any suitable color that contrasts with the background
		padding: 15,
		borderRadius: 8,
		marginTop: 20,
		alignItems: "center",
		width: "60%", // Adjust width as needed
	},
	guestButtonText: {
		color: "black",
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default WelcomeScreen;
