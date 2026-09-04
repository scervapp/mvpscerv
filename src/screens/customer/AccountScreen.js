import { useNavigation } from "@react-navigation/native";
import React, { useContext, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	Pressable,
	Alert,
	SafeAreaView,
	ScrollView,
	Linking,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";

import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "../../config/i18n";

const AccountRow = ({ label, iconName, onPress, isDestructive = false }) => (
	<TouchableOpacity style={styles.listItem} onPress={onPress}>
		<Ionicons
			name={iconName}
			size={24}
			color={isDestructive ? colors.statusDanger : colors.primary}
			style={styles.icon}
		/>
		<Text
			style={[styles.listItemText, isDestructive && styles.destructiveText]}
		>
			{label}
		</Text>
		{!isDestructive && (
			<Ionicons
				name="chevron-forward-outline"
				size={22}
				color={colors.textLight}
			/>
		)}
	</TouchableOpacity>
);

const SettingsCard = ({ children }) => (
	<View style={styles.card}>{children}</View>
);

const AccountScreen = () => {
	const { t } = useTranslation();
	const { logout, deleteUserFunction, currentUserData } =
		useContext(AuthContext);
	const [showDelete, setShowDelete] = useState(false);
	const navigation = useNavigation();

	const handleSignOut = async () => {
		try {
			// The logout function in your context should handle navigation after sign out
			await logout();
		} catch (error) {
			console.log("error signing out: ", error);
			Alert.alert(t("error"), t("could_not_sign_out_please_try_again"));
		}
	};

	const handleShowDelete = () => {
		setShowDelete(!showDelete);
	};

	const toggleLanguage = async () => {
		const nextLanguage = i18n.language === "en" ? "es" : "en";
		await i18n.changeLanguage(nextLanguage);
		// The persistence is handled automatically by our new i18n.js detector!
	};

	const handleDeleteAccount = async () => {
		Alert.alert(
			t("delete_account"),
			t(
				"are_you_sure_you_want_to_delete_your_account_this_action_cannot_be_undone",
			),
			[
				{ text: t("cancel"), style: "cancel" },
				{
					text: t("delete"),
					style: "destructive",
					onPress: async () => {
						try {
							// 1. Delete the user's account from Firebase Authentication
							await deleteUserFunction();
							navigation.navigate("Welcome");
						} catch (error) {
							console.error("Error deleting account:", error);
							Alert.alert(
								t("error"),
								t("failed_to_delete_account_please_try_again"),
							);
						}
					},
				},
			],
		);
	};

	// Render the account settings screen
	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.container}>
				<View style={styles.profileHeader}>
					<View style={styles.avatar}>
						<Ionicons name="person" size={50} color={colors.primary} />
					</View>
					<Text style={styles.userName}>
						{currentUserData?.firstName || ""} {currentUserData?.lastName || ""}
					</Text>
					<Text style={styles.userPhone}>{currentUserData?.phoneNumber}</Text>
				</View>
				{/* Main customer account shortcuts */}
				<SettingsCard>
					<AccountRow
						label={t("my_pips_people_in_party")}
						iconName="people-outline"
						onPress={() => navigation.navigate("PipsScreenInner")}
					/>
					<View style={styles.divider} />
					<AccountRow
						label={t("order_history")}
						iconName="receipt-outline"
						onPress={() => navigation.navigate("OrderHistoryScreenInner")}
					/>
					<View style={styles.divider} />
					<AccountRow
						label={t("my_reservations", "My Reservations")}
						iconName="calendar-outline"
						onPress={() => navigation.navigate("CustomerReservationsScreen")}
					/>
					<View style={styles.divider} />
					<AccountRow
						label={t("scerv_wallet", "Rewards Wallet")}
						iconName="wallet-outline"
						onPress={() => navigation.navigate("CustomerRewardsScreen")}
					/>
				</SettingsCard>
				<SettingsCard>
					<AccountRow
						label={t("manage_account")}
						iconName="settings-outline"
						onPress={() => navigation.navigate("ManageAccountScreen")} // Navigate to the new screen
					/>
					<TouchableOpacity
						style={{
							flexDirection: "row",
							alignItems: "center",
							justifyContent: "space-between",
							paddingVertical: 15,
							paddingHorizontal: 15, // Matches standard list padding
						}}
						onPress={toggleLanguage}
					>
						<View style={{ flexDirection: "row", alignItems: "center" }}>
							{/* Globe Icon */}
							<Ionicons
								name="globe-outline"
								size={24}
								color={colors.primary}
								style={{ marginRight: 15 }}
							/>
							<Text style={{ fontSize: 16, color: "black" }}>
								{t("language_settings_label")}
							</Text>
						</View>

						{/* Current Language Display (e.g. 🇺🇸 English) */}
						<View style={{ flexDirection: "row", alignItems: "center" }}>
							<Text style={{ fontSize: 14, color: "#666", marginRight: 8 }}>
								{i18n.language === "en" ? "🇺🇸 English" : "🇵🇦 Español"}
							</Text>
							{/* Small arrow to indicate it's clickable */}
							<Ionicons name="swap-horizontal" size={18} color="#ccc" />
						</View>
					</TouchableOpacity>
				</SettingsCard>
				<SettingsCard>
					<AccountRow
						label={t("contact_support")}
						iconName="mail-outline"
						onPress={() => Linking.openURL("mailto:support@scerv.com")}
					/>
				</SettingsCard>
				<TouchableOpacity onPress={handleSignOut} style={styles.logoutButton}>
					<Text style={styles.logoutButtonText}>{t("sign_out")}</Text>
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
};

// Add styles
const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { padding: 20 },
	profileHeader: { alignItems: "center", marginBottom: 30, marginTop: 20 },
	avatar: {
		width: 100,
		height: 100,
		borderRadius: 50,
		backgroundColor: colors.primary + "20",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 15,
	},
	userName: { fontSize: 22, fontWeight: "bold", color: colors.textDark },
	userPhone: { fontSize: 16, color: colors.textMedium, marginTop: 4 },
	card: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		marginBottom: 20,
		overflow: "hidden",
	},
	listItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 18,
		paddingHorizontal: 15,
	},
	icon: { marginRight: 15 },
	listItemText: { fontSize: 16, color: colors.textDark, flex: 1 },
	divider: { height: 1, backgroundColor: colors.borderLight, marginLeft: 54 },
	logoutButton: {
		backgroundColor: colors.primary,
		padding: 15,
		borderRadius: 12,
		alignItems: "center",
		marginTop: 20,
	},
	logoutButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
});

export default AccountScreen;

//AccountScreen
