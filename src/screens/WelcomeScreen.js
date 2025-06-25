// screens/WelcomeScreen.js
import React, { useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	SafeAreaView,
	Image,
	ActivityIndicator,
} from "react-native";
import { AuthContext } from "../context/authContext";
import colors from "../utils/styles/appStyles";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

const WelcomeScreen = ({ navigation }) => {
	const { continueAsGuest, isLoading } = useContext(AuthContext);

	const handleContinueAsGuest = async () => {
		try {
			await continueAsGuest(navigation);
		} catch (error) {
			console.error("Error continuing as guest", error);
			// Optionally, show an alert to the user
		}
	};

	return (
		<LinearGradient
			colors={[colors.backgroundLight, colors.primary + "20"]} // A subtle gradient from light to a hint of your primary color
			style={styles.gradientContainer}
		>
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.contentContainer}>
					<View style={styles.header}>
						<Image
							source={require("../../assets/scerv_logo.png")} // Make sure this path is correct
							style={styles.logo}
						/>
						<Text style={styles.title}>Welcome to Scerv</Text>
						<Text style={styles.subtitle}>
							Your seamless dining experience starts here.
						</Text>
					</View>

					{isLoading ? (
						<ActivityIndicator size="large" color={colors.primary} />
					) : (
						<View style={styles.actionsContainer}>
							<Button
								mode="contained"
								onPress={() => navigation.navigate("CustomerSignup")}
								style={styles.button}
								labelStyle={styles.buttonText}
								icon="account-plus-outline"
							>
								Create Account
							</Button>

							<Button
								mode="outlined"
								onPress={() => navigation.navigate("Login")}
								style={[styles.button, styles.loginButton]}
								labelStyle={styles.loginButtonText}
								icon="login"
							>
								Log In
							</Button>

							<TouchableOpacity onPress={handleContinueAsGuest}>
								<Text style={styles.guestLink}>Continue as Guest</Text>
							</TouchableOpacity>
						</View>
					)}
				</View>

				<View style={styles.footer}>
					<TouchableOpacity
						style={styles.restaurantPromptContainer}
						onPress={() => navigation.navigate("RestaurantSignup")}
					>
						<Text style={styles.restaurantPrompt}>Are you a restaurant?</Text>
						<Text style={styles.restaurantLink}>Sign up here</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</LinearGradient>
	);
};

const styles = StyleSheet.create({
	gradientContainer: {
		flex: 1,
	},
	safeArea: {
		flex: 1,
		justifyContent: "space-between",
	},
	contentContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 20,
	},
	header: {
		alignItems: "center",
		marginBottom: 60,
	},
	logo: {
		width: 120,
		height: 120,
		resizeMode: "contain",
		marginBottom: 20,
	},
	title: {
		fontSize: 32,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
	},
	subtitle: {
		fontSize: 18,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 8,
	},
	actionsContainer: {
		width: "90%",
		maxWidth: 400,
	},
	button: {
		paddingVertical: 8,
		borderRadius: 8,
		marginBottom: 15,
		backgroundColor: colors.primary,
	},
	buttonText: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textOnPrimaryBrand,
	},
	loginButton: {
		backgroundColor: "transparent",
		borderColor: colors.primary,
		borderWidth: 1.5,
	},
	loginButtonText: {
		color: colors.primary,
		fontSize: 16,
		fontWeight: "bold",
	},
	guestLink: {
		fontSize: 15,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 15,
		textDecorationLine: "underline",
	},
	footer: {
		paddingBottom: 40,
		alignItems: "center",
	},
	restaurantPromptContainer: {
		alignItems: "center",
	},
	restaurantPrompt: {
		fontSize: 15,
		color: colors.textDark,
	},
	restaurantLink: {
		fontSize: 15,
		color: colors.primary,
		fontWeight: "bold",
		marginTop: 4,
	},
});

export default WelcomeScreen;
