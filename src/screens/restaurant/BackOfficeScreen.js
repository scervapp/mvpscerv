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
import { db, functions } from "../../config/firebase.native";
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
	const [setupCounts, setSetupCounts] = useState({
		employees: 0,
		tables: 0,
		menuItems: 0,
	});

	const isTestMode = currentUserData?.isTestAccount !== false;
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
	const country = currentUserData?.country || currentUserData?.countryCode || "";
	const isPanama =
		country.toUpperCase() === "PA" || country.toLowerCase() === "panama";
	const stripeVerified = currentUserData?.stripeAccountStatus === "verified";
	const stripeStarted = !!currentUserData?.stripeAccountId;
	const profileComplete = [
		currentUserData?.restaurantName,
		currentUserData?.phone,
		currentUserData?.address,
		currentUserData?.city,
		currentUserData?.state,
		currentUserData?.zipcode,
		currentUserData?.countryCode || currentUserData?.country,
	].every((value) => String(value || "").trim().length > 0);
	const employeeSetupComplete =
		currentUserData?.hasSetupEmployees === true || setupCounts.employees > 0;
	const tableSetupComplete = setupCounts.tables > 0;
	const menuSetupComplete = setupCounts.menuItems > 0;
	const payoutSetupComplete = isPanama || stripeVerified;

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

	useEffect(() => {
		if (!restaurantId) return undefined;

		const employeesUnsubscribe = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.onSnapshot(
				(snapshot) =>
					setSetupCounts((previous) => ({
						...previous,
						employees: snapshot.size,
					})),
				(error) => console.error("BackOffice employee count error:", error),
			);

		const tablesUnsubscribe = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.onSnapshot(
				(snapshot) =>
					setSetupCounts((previous) => ({
						...previous,
						tables: snapshot.size,
					})),
				(error) => console.error("BackOffice table count error:", error),
			);

		const menuUnsubscribe = db
			.collection("menuItems")
			.where("restaurantId", "==", restaurantId)
			.onSnapshot(
				(snapshot) =>
					setSetupCounts((previous) => ({
						...previous,
						menuItems: snapshot.size,
					})),
				(error) => console.error("BackOffice menu count error:", error),
			);

		return () => {
			employeesUnsubscribe();
			tablesUnsubscribe();
			menuUnsubscribe();
		};
	}, [restaurantId]);

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

	const onboardingSteps = [
		{
			id: "owner-pin",
			label: t("owner_pin_setup", "Owner PIN"),
			desc: t("owner_pin_setup_desc", "Create the owner POS profile and PIN"),
			iconName: "shield-key-outline",
			complete: employeeSetupComplete,
			action: () => navigation.navigate("EmployeeScreen"),
		},
		{
			id: "profile",
			label: t("restaurant_profile_step", "Restaurant profile"),
			desc: t(
				"restaurant_profile_setup_desc",
				"Confirm address, phone, tax, and profile details",
			),
			iconName: "storefront-outline",
			complete: profileComplete,
			action: () => navigation.navigate("RestaurantProfile"),
		},
		{
			id: "tables",
			label: t("tables", "Tables"),
			desc: t("table_setup_desc", "Add dining areas and table capacities"),
			iconName: "table-furniture",
			complete: tableSetupComplete,
			action: () => navigation.navigate("Tables"),
		},
		{
			id: "menu",
			label: t("menu", "Menu"),
			desc: t("menu_setup_desc", "Add the first sellable menu items"),
			iconName: "book-open-variant",
			complete: menuSetupComplete,
			action: () => navigation.navigate("RestaurantMenu"),
		},
		{
			id: "payouts",
			label: isPanama ? t("payments", "Payments") : t("payouts", "Payouts"),
			desc: isPanama
				? t(
						"panama_payments_ready_desc",
						"Stripe is not required for this country",
					)
				: stripeStarted
					? t(
							"finish_stripe_setup_desc",
							"Finish Stripe onboarding before live card payments",
						)
					: t(
							"create_stripe_setup_desc",
							"Create the payout account for card payments",
						),
			iconName: "credit-card-check-outline",
			complete: payoutSetupComplete,
			action: stripeStarted
				? handleCheckOnboardingStatus
				: handleCreateConnectedAccount,
		},
	];

	const completedStepCount = onboardingSteps.filter((step) => step.complete).length;
	const allSetupComplete = completedStepCount === onboardingSteps.length;

	const renderOnboardingGuide = () => (
		<View style={styles.onboardingPanel}>
			<View style={styles.onboardingHeader}>
				<View>
					<Text style={styles.onboardingEyebrow}>
						{t("launch_checklist", "Launch Checklist")}
					</Text>
					<Text style={styles.onboardingTitle}>
						{allSetupComplete
							? t("ready_for_live_operations", "Ready for operations")
							: t("finish_restaurant_setup", "Finish restaurant setup")}
					</Text>
				</View>
				<View style={styles.progressBadge}>
					<Text style={styles.progressText}>
						{completedStepCount}/{onboardingSteps.length}
					</Text>
				</View>
			</View>
			<View style={styles.progressTrack}>
				<View
					style={[
						styles.progressFill,
						{
							width: `${Math.round(
								(completedStepCount / onboardingSteps.length) * 100,
							)}%`,
						},
					]}
				/>
			</View>
			{onboardingSteps.map((step) => (
				<TouchableOpacity
					key={step.id}
					style={styles.setupStep}
					onPress={
						step.complete && step.id !== "payouts" ? undefined : step.action
					}
					activeOpacity={step.complete && step.id !== "payouts" ? 1 : 0.75}
					disabled={
						isStripeLoading || (step.complete && step.id !== "payouts")
					}
				>
					<View
						style={[
							styles.setupIcon,
							step.complete ? styles.setupIconComplete : styles.setupIconOpen,
						]}
					>
						<MaterialCommunityIcons
							name={step.complete ? "check" : step.iconName}
							size={22}
							color={step.complete ? "#FFF" : colors.primary}
						/>
					</View>
					<View style={styles.setupInfo}>
						<Text style={styles.setupLabel}>{step.label}</Text>
						<Text style={styles.setupDesc}>{step.desc}</Text>
					</View>
					{isStripeLoading && step.id === "payouts" ? (
						<ActivityIndicator size="small" color={colors.primary} />
					) : (
						<MaterialCommunityIcons
							name={step.complete ? "check-circle" : "chevron-right"}
							size={22}
							color={step.complete ? colors.statusSuccess : colors.textMedium}
						/>
					)}
				</TouchableOpacity>
			))}
		</View>
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
					ListHeaderComponent={renderOnboardingGuide}
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
	onboardingPanel: {
		backgroundColor: "#FFF",
		borderRadius: 14,
		padding: 16,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: "#E2E8F0",
	},
	onboardingHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	onboardingEyebrow: {
		fontSize: 10,
		fontWeight: "900",
		color: "#64748B",
		letterSpacing: 1.2,
		textTransform: "uppercase",
	},
	onboardingTitle: {
		fontSize: 19,
		fontWeight: "900",
		color: "#0F172A",
		marginTop: 3,
	},
	progressBadge: {
		backgroundColor: colors.primary + "18",
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	progressText: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.primary,
	},
	progressTrack: {
		height: 7,
		borderRadius: 999,
		backgroundColor: "#E2E8F0",
		overflow: "hidden",
		marginBottom: 12,
	},
	progressFill: {
		height: "100%",
		borderRadius: 999,
		backgroundColor: colors.statusSuccess,
	},
	setupStep: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 11,
		borderTopWidth: 1,
		borderTopColor: "#F1F5F9",
	},
	setupIcon: {
		width: 38,
		height: 38,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
		marginRight: 12,
	},
	setupIconComplete: {
		backgroundColor: colors.statusSuccess,
	},
	setupIconOpen: {
		backgroundColor: colors.primary + "14",
	},
	setupInfo: {
		flex: 1,
		paddingRight: 8,
	},
	setupLabel: {
		fontSize: 14,
		fontWeight: "900",
		color: "#1E293B",
	},
	setupDesc: {
		fontSize: 12,
		fontWeight: "600",
		color: "#64748B",
		marginTop: 2,
		lineHeight: 16,
	},
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
