// screens/auth/ManageAccountScreen.js
import React, { useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	Alert,
	SafeAreaView,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";

// Reusable component for the destructive action row
const DestructiveActionRow = ({ label, iconName, onPress }) => (
	<TouchableOpacity style={styles.listItem} onPress={onPress}>
		<Ionicons
			name={iconName}
			size={24}
			color={colors.statusDanger}
			style={styles.icon}
		/>
		<Text style={[styles.listItemText, styles.destructiveText]}>{label}</Text>
	</TouchableOpacity>
);

const ManageAccountScreen = () => {
	const { deleteUserFunction } = useContext(AuthContext);

	const handleDeleteAccount = () => {
		Alert.alert(
			"Delete Account",
			"Are you sure you want to permanently delete your account? This action cannot be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							if (deleteUserFunction) {
								await deleteUserFunction();
								// Navigation is handled by the AuthContext listener
							} else {
								throw new Error("Delete function not available.");
							}
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

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				<View style={styles.card}>
					{/* You can add other settings here in the future, like "Change Phone Number" */}
					<DestructiveActionRow
						label="Delete Account"
						iconName="trash-outline"
						onPress={handleDeleteAccount}
					/>
				</View>
				<Text style={styles.footerText}>
					Deleting your account will permanently remove all of your data,
					including order history and saved PIPs.
				</Text>
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
	},
	container: {
		flex: 1,
		padding: 20,
	},
	card: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		overflow: "hidden",
	},
	listItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 18,
		paddingHorizontal: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	icon: {
		marginRight: 15,
	},
	listItemText: {
		fontSize: 16,
		color: colors.textDark,
	},
	destructiveText: {
		color: colors.statusDanger,
		fontWeight: "600",
	},
	footerText: {
		marginTop: 20,
		textAlign: "center",
		color: colors.textLight,
		fontSize: 14,
		paddingHorizontal: 10,
	},
});

export default ManageAccountScreen;
