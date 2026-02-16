import React, { useContext, useEffect, useLayoutEffect, useState } from "react";
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
import { db, functions } from "../../config/firebase.native";
import { AuthContext } from "../../context/authContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import colors from "../../utils/styles/appStyles";
import { httpsCallable } from "@react-native-firebase/functions";
import { StatusIndicator } from "./StatusIndicator";
import { useTranslation } from "react-i18next";

// --- 1. IMPORT i18n DIRECTLY (The Fix) ---
import i18n from "../../config/i18n";

const { width } = Dimensions.get("window");
const cardMargin = 10;
const numColumns = 2;
const cardWidth = width / numColumns - cardMargin * (numColumns + 1);

const BackOfficeScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const { currentUserData, logout } = useContext(AuthContext);
	const [restaurantData, setRestaurantData] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isStripeLoading, setIsStripeLoading] = useState(false);
	const [isLogoutLoading, setIsLogoutLoading] = useState(false);

	const isTestMode = currentUserData?.isTestAccount !== false;

	// --- 2. ADD TOGGLE FUNCTION ---
	const toggleLanguage = () => {
		const nextLanguage = i18n.language === "en" ? "es" : "en";
		i18n.changeLanguage(nextLanguage);
	};

	const baseScreens = [
		{
			name: "RestaurantMenu",
			label: t("menu"),
			iconName: "silverware-fork-knife",
		},
		{
			name: "RestaurantProfile",
			label: t("profile"),
			iconName: "store-settings-outline",
		},
		{
			name: "EmployeeScreen",
			label: t("employee"),
			iconName: "account-group-outline",
		},
		{
			name: "SalesReportScreen",
			label: t("daily_sales_report"),
			iconName: "chart-line",
		},
	];

	const [screens, setScreens] = useState(baseScreens);

	// Update screens when language changes or user data changes
	useEffect(() => {
		let dynamicScreens = [
			{
				name: "RestaurantMenu",
				label: t("menu"),
				iconName: "silverware-fork-knife",
			},
			{
				name: "RestaurantProfile",
				label: t("profile"),
				iconName: "store-settings-outline",
			},
			{
				name: "EmployeeScreen",
				label: t("employee"),
				iconName: "account-group-outline",
			},
			{
				name: "SalesReportScreen",
				label: t("daily_sales_report"),
				iconName: "chart-line",
			},
		];

		if (!currentUserData?.stripeAccountId) {
			dynamicScreens.push({
				name: "CreateStripeAccount",
				label: t("setup_payouts"),
				iconName: "credit-card-plus-outline",
				action: handleCreateConnectedAccount,
			});
		} else {
			dynamicScreens.push({
				name: "ConnectAccount",
				label: t("payouts_dashboard"),
				iconName: "open-in-new",
				action: handleCheckOnboardingStatus,
			});
		}
		setScreens(dynamicScreens);
	}, [currentUserData?.stripeAccountId, t]); // Added 't' dependency so labels update

	const handleCreateConnectedAccount = async () => {
		try {
			const createAccount = httpsCallable(functions, "createConnectedAccount");
			await createAccount(currentUserData);
			Alert.alert(t("successfully_initialized"));
		} catch (error) {
			console.error("Error creating connected account:", error);
			Alert.alert(t("failed_to_initialize_please_try_again"));
		}
	};

	const handleCheckOnboardingStatus = async () => {
		if (isStripeLoading || !currentUserData?.stripeAccountId) return;
		setIsStripeLoading(true);

		try {
			const checkOnboardingStatus = httpsCallable(
				functions,
				"checkOnboardingStatus",
			);
			const response = await checkOnboardingStatus({
				accountId: currentUserData.stripeAccountId,
				restaurantId: currentUserData.uid,
			});

			if (response.data.isOnboarded) {
				console.log("Account is onboarded");
				handleConnectAccount();
			} else {
				console.log("Account is not onboarded");
				Linking.openURL(response.data.accountLinkUrl);
			}
		} catch (error) {
			console.error("Error checking onboarding status:", error);
			Alert.alert(
				t("error"),
				t("failed_to_check_onboarding_status_please_try_again"),
			);
		} finally {
			setIsStripeLoading(false);
		}
	};

	const handleConnectAccount = async () => {
		try {
			const createLoginLink = httpsCallable(functions, "createLoginLink");
			const response = await createLoginLink({
				accountId: currentUserData.stripeAccountId,
				restaurantId: currentUserData.uid,
			});

			if (response.data.url) {
				await Linking.openURL(response.data.url);
			} else {
				throw new Error("Login link was not returned from the server.");
			}
		} catch (error) {
			console.error("Error creating Stripe login link:", error);
			Alert.alert(t("error"), t("could_not_open_the_stripe_dashboard"));
		} finally {
			setIsStripeLoading(false);
		}
	};

	const handleScreenPress = (screenName) => {
		navigation.navigate(screenName);
	};

	const handleLogout = async () => {
		setIsLogoutLoading(true);
		try {
			await logout();
		} catch (error) {
			console.error("Logout failed:", error);
			Alert.alert(t("logout_error"), t("could_not_log_out_please_try_again"));
			setIsLogoutLoading(false);
		}
	};

	const renderGridItem = ({ item }) => (
		<TouchableOpacity
			onPress={() => {
				if (item.action) {
					item.action();
				} else {
					handleScreenPress(item.name);
				}
			}}
			style={styles.card}
			disabled={isStripeLoading}
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
			{/* --- 3. LANGUAGE TOGGLE (Top Right) --- */}
			<View
				style={{
					flexDirection: "row",
					justifyContent: "flex-end",
					marginBottom: 5,
				}}
			>
				<TouchableOpacity
					onPress={toggleLanguage}
					style={styles.languageButton}
				>
					<Text
						style={{ fontSize: 13, fontWeight: "bold", color: colors.textDark }}
					>
						{i18n.language === "en" ? "🇺🇸 EN" : "🇵🇦 ES"}
					</Text>
				</TouchableOpacity>
			</View>

			<Text style={styles.welcomeText}>
				{t("welcome")}, {currentUserData?.firstName || t("admin")}!
			</Text>
			<Text style={styles.heading}>{t("back_office")}</Text>

			<View style={styles.indicatorContainer}>
				<StatusIndicator isTestMode={isTestMode} />
			</View>

			{isLoading ? (
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

			<TouchableOpacity
				style={[styles.button, styles.logoutButton]}
				onPress={handleLogout}
				disabled={isLogoutLoading}
			>
				{isLogoutLoading ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.buttonText}>{t("logout")}</Text>
				)}
			</TouchableOpacity>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: cardMargin,
		backgroundColor: colors.background || "#f8f9fa",
	},
	// --- NEW STYLE FOR LANGUAGE BUTTON ---
	languageButton: {
		backgroundColor: "#fff",
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: "#ddd",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 1,
		elevation: 2,
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
		color: colors.primary || "#007bff",
		textAlign: "center",
	},
	indicatorContainer: {
		marginBottom: 15, // Added some spacing
	},
	listContainer: {
		paddingBottom: 20,
	},
	card: {
		flex: 1,
		margin: cardMargin,
		width: cardWidth,
		aspectRatio: 1,
		backgroundColor: "#ffffff",
		borderRadius: 15,
		padding: 15,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 3.84,
		elevation: 5,
	},
	iconContainer: {
		width: 60,
		height: 60,
		marginBottom: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	cardLabel: {
		fontSize: 15,
		fontWeight: "600",
		textAlign: "center",
		color: colors.text || "#343a40",
	},
	button: {
		paddingVertical: 12,
		paddingHorizontal: 30,
		borderRadius: 25,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 20,
	},
	logoutButton: {
		backgroundColor: colors.danger || "#dc3545",
		alignSelf: "center",
		width: "80%",
		marginBottom: 20,
	},
	buttonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default BackOfficeScreen;
