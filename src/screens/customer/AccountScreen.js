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
			Alert.alert("Error", "Could not sign out. Please try again.");
		}
	};

	const handleShowDelete = () => {
		setShowDelete(!showDelete);
	};

	const handleDeleteAccount = async () => {
		Alert.alert(
			"Delete Account",
			"Are you sure you want to delete your account? This action cannot be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							// 1. Delete the user's account from Firebase Authentication
							await deleteUserFunction();
							navigation.navigate("Welcome");
						} catch (error) {
							console.error("Error deleting account:", error);
							Alert.alert(
								"Error",
								"Failed to delete account. Please try again."
							);
						}
					},
				},
			]
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
				{/* --- THIS IS THE FIX (PART 1) --- */}
				{/* The main screen now has clearer sections */}
				<SettingsCard>
					<AccountRow
						label="My PIPs (People In Party)"
						iconName="people-outline"
						onPress={() => navigation.navigate("PipsScreenInner")}
					/>
					<View style={styles.divider} />
					<AccountRow
						label="Order History"
						iconName="receipt-outline"
						onPress={() => navigation.navigate("OrderHistoryScreenInner")}
					/>
				</SettingsCard>
				<SettingsCard>
					<AccountRow
						label="Manage Account"
						iconName="settings-outline"
						onPress={() => navigation.navigate("ManageAccountScreen")} // Navigate to the new screen
					/>
				</SettingsCard>
				<SettingsCard>
					<AccountRow
						label="Contact Support"
						iconName="mail-outline"
						onPress={() => Linking.openURL("mailto:support@scerv.com")}
					/>
				</SettingsCard>
				{/* --- END OF FIX --- */}
				{/* --- END OF FIX --- */}
				<TouchableOpacity onPress={handleSignOut} style={styles.logoutButton}>
					<Text style={styles.logoutButtonText}>Sign Out</Text>
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

