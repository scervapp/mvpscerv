import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	FlatList,
	TouchableOpacity,
	Linking,
	Alert,
	Dimensions,
	ActivityIndicator,
	SafeAreaView,
} from "react-native";
import { functions } from "../../config/firebase.native";
import { AuthContext } from "../../context/authContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { httpsCallable } from "@react-native-firebase/functions";
import { StatusIndicator } from "./StatusIndicator";
import { useTranslation } from "react-i18next";
import i18n from "../../config/i18n";

const BackOfficeScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const { currentUserData, logout } = useContext(AuthContext);
	const [isStripeLoading, setIsStripeLoading] = useState(false);
	const [isLogoutLoading, setIsLogoutLoading] = useState(false);

	const isTestMode = currentUserData?.isTestAccount !== false;

	const toggleLanguage = () => {
		const nextLanguage = i18n.language === "en" ? "es" : "en";
		i18n.changeLanguage(nextLanguage);
	};

	const [screens, setScreens] = useState([]);

	useEffect(() => {
		let dynamicScreens = [
			{
				id: "1",
				name: "RestaurantMenu",
				label: t("menu"),
				iconName: "book-open-variant",
				color: "#6366f1",
				desc: "Items & Pricing",
			},
			{
				id: "2",
				name: "EmployeeScreen",
				label: t("employee"),
				iconName: "account-tie",
				color: "#8b5cf6",
				desc: "Staff & PINs",
			},
			{
				id: "3",
				name: "Tables",
				label: t("tables"),
				iconName: "table-furniture",
				color: "#ec4899",
				desc: "Floor Plan & QR Setup",
			},
			{
				id: "4",
				name: "SalesReportScreen",
				label: t("sales"),
				iconName: "finance",
				color: "#10b981",
				desc: "Revenue & Stats",
			},
			{
				id: "5",
				name: "RestaurantProfile",
				label: t("profile"),
				iconName: "cog",
				color: "#64748b",
				desc: "Shop Settings",
			},
		];

		const country =
			currentUserData?.country || currentUserData?.countryCode || "";
		const isPanama =
			country.toUpperCase() === "PA" || country.toLowerCase() === "panama";

		if (!isPanama) {
			if (!currentUserData?.stripeAccountId) {
				dynamicScreens.push({
					id: "6",
					name: "CreateStripeAccount",
					label: t("payouts"),
					iconName: "credit-card-plus",
					color: "#0ea5e9",
					desc: "Initialize Stripe Payouts",
					action: handleCreateConnectedAccount,
				});
			} else {
				dynamicScreens.push({
					id: "6",
					name: "ConnectAccount",
					label: t("stripe"),
					iconName: "wallet",
					color: "#0ea5e9",
					desc: "View Payout Dashboard",
					action: handleCheckOnboardingStatus,
				});
			}
		}
		setScreens(dynamicScreens);
	}, [currentUserData, t]);

	/* ──────────────────────────────
       STRIPE & LOGOUT FUNCTIONS
    ────────────────────────────── */

	const handleCreateConnectedAccount = async () => {
		try {
			const createAccount = httpsCallable(functions, "createConnectedAccount");
			const response = await createAccount({ restaurantId: currentUserData.uid });
			if (response.data?.accountLinkUrl || response.data?.url) {
				await Linking.openURL(response.data.accountLinkUrl || response.data.url);
			}
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
				handleConnectAccount();
			} else {
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
				throw new Error("Login link not returned.");
			}
		} catch (error) {
			console.error("Error creating Stripe login link:", error);
			Alert.alert(t("error"), t("could_not_open_the_stripe_dashboard"));
		} finally {
			setIsStripeLoading(false);
		}
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

	/* ──────────────────────────────
       RENDER
    ────────────────────────────── */

	const renderItem = ({ item }) => (
		<TouchableOpacity
			style={styles.card}
			onPress={() =>
				item.action ? item.action() : navigation.navigate(item.name)
			}
			activeOpacity={0.8}
			disabled={isStripeLoading}
		>
			<View style={[styles.iconBox, { backgroundColor: item.color + "15" }]}>
				{isStripeLoading &&
				(item.name === "CreateStripeAccount" ||
					item.name === "ConnectAccount") ? (
					<ActivityIndicator size="small" color={item.color} />
				) : (
					<MaterialCommunityIcons
						name={item.iconName}
						size={28}
						color={item.color}
					/>
				)}
			</View>
			<View style={styles.cardInfo}>
				<Text style={styles.cardLabel}>{item.label}</Text>
				<Text style={styles.cardDesc}>{item.desc}</Text>
			</View>
			<MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
		</TouchableOpacity>
	);

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.header}>
				<View>
					<Text style={styles.headerSubtitle}>{t("ADMINISTRATION")}</Text>
					<Text style={styles.headerTitle}>{t("Back Office")}</Text>
				</View>
				<TouchableOpacity onPress={toggleLanguage} style={styles.langToggle}>
					<Text style={styles.langText}>
						{i18n.language === "en" ? "🇺🇸 EN" : "🇵🇦 ES"}
					</Text>
				</TouchableOpacity>
			</View>

			<View style={styles.mainContainer}>
				<View style={styles.statusRow}>
					<StatusIndicator isTestMode={isTestMode} />
				</View>

				<FlatList
					data={screens}
					renderItem={renderItem}
					keyExtractor={(item) => item.id}
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.listContent}
				/>

				<TouchableOpacity
					style={styles.logoutBtn}
					onPress={handleLogout}
					disabled={isLogoutLoading}
				>
					{isLogoutLoading ? (
						<ActivityIndicator color="#FFF" />
					) : (
						<>
							<MaterialCommunityIcons name="logout" size={20} color="#FFF" />
							<Text style={styles.logoutText}>{t("Exit Admin Mode")}</Text>
						</>
					)}
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 24,
		paddingVertical: 20,
		backgroundColor: "#FFF",
	},
	headerSubtitle: {
		fontSize: 10,
		fontWeight: "800",
		color: "#94A3B8",
		letterSpacing: 1.5,
	},
	headerTitle: { fontSize: 24, fontWeight: "800", color: "#1E293B" },
	langToggle: {
		backgroundColor: "#F1F5F9",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 12,
	},
	langText: { fontSize: 13, fontWeight: "700", color: "#475569" },
	mainContainer: { flex: 1, paddingHorizontal: 20 },
	statusRow: { marginVertical: 15 },
	listContent: { paddingBottom: 100 },
	card: {
		backgroundColor: "#FFF",
		borderRadius: 16,
		padding: 16,
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
		elevation: 2,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 15,
	},
	iconBox: {
		width: 50,
		height: 50,
		borderRadius: 14,
		justifyContent: "center",
		alignItems: "center",
	},
	cardInfo: { flex: 1, marginLeft: 16 },
	cardLabel: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
	cardDesc: { fontSize: 12, color: "#64748B", marginTop: 2 },
	logoutBtn: {
		position: "absolute",
		bottom: 30,
		left: 20,
		right: 20,
		backgroundColor: "#EF4444",
		height: 56,
		borderRadius: 16,
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		elevation: 5,
	},
	logoutText: {
		color: "#FFF",
		fontWeight: "800",
		fontSize: 16,
		marginLeft: 10,
	},
});

export default BackOfficeScreen;
