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
} from "react-native";

import { doc, setDoc } from "@react-native-firebase/firestore";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";

export default function CompleteProfileScreen() {
	const { t } = useTranslation();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");

	// ✅ FIX: Default gender to "Other"
	const [gender, setGender] = useState("Other");

	// ✅ FIX: Manual DOB input
	const [dobInput, setDobInput] = useState("");

	const [loading, setLoading] = useState(false);
	const { currentUser, currentUserData } = useContext(AuthContext);

	const isValidDate = (dateStr) => {
		const regex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d{2}$/;
		return regex.test(dateStr);
	};

	const formatDOB = (value) => {
		// Remove all non-numeric
		let cleaned = value.replace(/\D/g, "");

		// Limit to 8 digits (MMDDYYYY)
		cleaned = cleaned.substring(0, 8);

		let formatted = "";

		if (cleaned.length >= 1) {
			formatted = cleaned.substring(0, 2);
		}
		if (cleaned.length >= 3) {
			formatted += "/" + cleaned.substring(2, 4);
		}
		if (cleaned.length >= 5) {
			formatted += "/" + cleaned.substring(4, 8);
		}

		return formatted;
	};

	const handleDobChange = (text) => {
		const formatted = formatDOB(text);
		setDobInput(formatted);
	};

	const saveProfile = async () => {
		if (!firstName.trim() || !lastName.trim() || !dobInput) {
			return Alert.alert(
				t("required"),
				t("please_fill_out_all_fields_to_continue"),
			);
		}

		if (!isValidDate(dobInput)) {
			return Alert.alert("Invalid Date", "Please use MM/DD/YYYY format");
		}

		setLoading(true);

		try {
			await setDoc(
				doc(db, "customers", currentUser.uid),
				{
					...currentUserData,
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					gender: gender,
					dateOfBirth: dobInput,
					updatedAt: new Date(),
					profileCompleted: true,
				},
				{ merge: true },
			);

			console.log("✅ Profile completed");
		} catch (e) {
			console.error("Error saving profile:", e);
			Alert.alert("Error", "Failed to save profile.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>{t("almost_there")}</Text>

			<TextInput
				style={styles.input}
				placeholder={t("first_name")}
				value={firstName}
				onChangeText={setFirstName}
				placeholderTextColor={colors.textMedium}
			/>

			<TextInput
				style={styles.input}
				placeholder={t("last_name")}
				value={lastName}
				onChangeText={setLastName}
				placeholderTextColor={colors.textMedium}
			/>

			{/* ✅ FIXED GENDER UI */}
			<Text style={styles.label}>{t("gender")}</Text>
			<View style={styles.genderRow}>
				{["Male", "Female", "Other"].map((g) => (
					<TouchableOpacity
						key={g}
						style={[styles.genderButton, gender === g && styles.genderSelected]}
						onPress={() => setGender(g)}
					>
						<Text
							style={[
								styles.genderText,
								gender === g && styles.genderTextSelected,
							]}
						>
							{t(g.toLowerCase())}
						</Text>
					</TouchableOpacity>
				))}
			</View>

			{/* ✅ FIXED DOB INPUT */}
			<TextInput
				style={styles.input}
				placeholder="MM/DD/YYYY"
				value={dobInput}
				onChangeText={handleDobChange}
				keyboardType="number-pad"
				maxLength={10}
				placeholderTextColor={colors.textMedium}
			/>

			{loading ? (
				<ActivityIndicator size="large" color={colors.primary} />
			) : (
				<Button
					color={colors.primary}
					title={t("complete_setup")}
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
		marginBottom: 20,
		textAlign: "center",
		color: colors.textDark,
	},
	input: {
		borderWidth: 1,
		borderColor: "#ccc",
		padding: 15,
		marginBottom: 15,
		borderRadius: 8,
		color: colors.textDark,
	},
	label: {
		fontSize: 14,
		marginBottom: 8,
		color: colors.textMedium,
	},
	genderRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 20,
	},
	genderButton: {
		flex: 1,
		padding: 12,
		borderWidth: 1,
		borderColor: "#ccc",
		borderRadius: 8,
		marginHorizontal: 4,
		alignItems: "center",
	},
	genderSelected: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	genderText: {
		color: colors.textDark,
		fontWeight: "600",
	},
	genderTextSelected: {
		color: "#fff",
	},
});
