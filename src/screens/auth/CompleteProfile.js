// screens/auth/CompleteProfileScreen.js
import React, { useState, useContext } from "react";
import {
	View,
	Text,
	TextInput,
	Button,
	Alert,
	StyleSheet,
	ActivityIndicator,
	TouchableOpacity,
	Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { doc, setDoc } from "@react-native-firebase/firestore";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";

export default function CompleteProfileScreen() {
	const { t } = useTranslation();
	const [fullName, setFullName] = useState("");
	const [loading, setLoading] = useState(false);
	const { currentUser, currentUserData } = useContext(AuthContext);

	const saveProfile = async () => {
		if (!fullName.trim()) {
			return Alert.alert(
				t("required") || "Required",
				t("please_enter_your_name_to_continue") ||
					"Please enter your name to continue.",
			);
		}

		setLoading(true);
		try {
			await setDoc(
				doc(db, "customers", currentUser.uid),
				{
					...currentUserData, // ← Keeps phoneNumber + all existing data
					fullName: fullName.trim(),
					updatedAt: new Date(),
					profileCompleted: true,
				},
				{ merge: true },
			);

			console.log("✅ Minimal profile saved (only name + phone preserved)");
		} catch (e) {
			console.error("Error saving profile:", e);
			Alert.alert("Error", "Failed to save profile. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>{t("almost_there") || "Almost there!"}</Text>
			<Text style={styles.subtitle}>
				{t("just_tell_us_your_name_to_get_started") ||
					"Just tell us your name to get started."}
			</Text>

			<TextInput
				style={styles.input}
				placeholder={t("your_name") || "Your Name"}
				value={fullName}
				onChangeText={setFullName}
				placeholderTextColor={colors.textMedium}
				selectionColor={colors.primary}
				cursorColor={colors.primary}
				autoFocus
			/>

			{loading ? (
				<ActivityIndicator size="large" color={colors.primary} />
			) : (
				<Button
					color={colors.primary}
					title={t("continue") || "Continue"}
					onPress={saveProfile}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
		justifyContent: "center",
		backgroundColor: "#fff",
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 16,
		marginBottom: 30,
		textAlign: "center",
		color: colors.textDark,
	},
	input: {
		borderWidth: 1,
		borderColor: "#ccc",
		padding: 15,
		marginBottom: 20,
		borderRadius: 8,
		fontSize: 18,
		color: colors.textDark,
	},
});
