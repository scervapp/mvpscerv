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
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");

	// Gender & DOB State
	const [gender, setGender] = useState("");
	const [dob, setDob] = useState(new Date());
	const [isDobSelected, setIsDobSelected] = useState(false);
	const [showPicker, setShowPicker] = useState(false);

	const [loading, setLoading] = useState(false);
	const { currentUser, currentUserData } = useContext(AuthContext);

	const onChangeDate = (event, selectedDate) => {
		const currentDate = selectedDate || dob;
		if (Platform.OS === "android") {
			setShowPicker(false);
		}
		if (event.type === "set" || selectedDate) {
			setDob(currentDate);
			setIsDobSelected(true);
		} else {
			setShowPicker(false);
		}
	};

	const saveProfile = async () => {
		if (!firstName.trim() || !lastName.trim() || !gender || !isDobSelected) {
			return Alert.alert(
				t("required") || "Required",
				t("please_fill_out_all_fields_to_continue") ||
					"Please fill out all fields to continue.",
			);
		}

		setLoading(true);
		try {
			const formattedDob = dob.toLocaleDateString("en-US");

			await setDoc(
				doc(db, "customers", currentUser.uid),
				{
					...currentUserData, // ← THIS IS THE MAGIC (preserves phoneNumber + everything else)
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					gender: gender,
					dateOfBirth: formattedDob,
					updatedAt: new Date(),
					profileCompleted: true,
				},
				{ merge: true },
			);

			console.log("✅ Profile completed successfully. Phone number preserved!");
		} catch (e) {
			console.error("Error saving profile:", e);
			Alert.alert("Error", "Failed to save profile. Please try again.");
		} finally {
			setLoading(false); // ← you were missing this (loading spinner would stay forever on error)
		}
	};
	return (
		<View style={styles.container}>
			<Text style={styles.title}>{t("almost_there")}</Text>
			<Text style={styles.subtitle}>
				{t("please_confirm_your_details_to_finish_setup") ||
					"Please confirm your details to finish setup."}
			</Text>

			<TextInput
				style={styles.input}
				placeholder={t("first_name") || "First Name"}
				value={firstName}
				onChangeText={setFirstName}
				placeholderTextColor={colors.textMedium}
				selectionColor={colors.primary} // Sets caret/highlight color on iOS & Android
				cursorColor={colors.primary} // Explicitly sets caret color on Android 10+
			/>
			<TextInput
				style={styles.input}
				placeholder={t("last_name") || "Last Name"}
				value={lastName}
				onChangeText={setLastName}
				placeholderTextColor={colors.textMedium}
				selectionColor={colors.primary}
				cursorColor={colors.primary}
			/>

			{/* Native Gender Picker */}
			<View
				style={[
					styles.input,
					styles.mockInputContainer,
					{ position: "relative" },
				]}
			>
				{/* 1. This text and icon are just for show (UI only) */}
				<Text
					style={{
						color: gender ? colors.textDark : colors.textMedium,
						fontSize: 16,
						flex: 1,
					}}
				>
					{gender
						? gender === "Male"
							? t("male")
							: gender === "Female"
								? t("female")
								: t("other")
						: t("select_gender")}
				</Text>
				<Ionicons
					name="chevron-down-outline"
					size={20}
					color={colors.textMedium}
				/>

				{/* 2. This invisible Picker sits ON TOP of everything */}
				<Picker
					selectedValue={gender}
					onValueChange={(itemValue) => setGender(itemValue)}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						opacity: 0, // 🚨 Makes it invisible but still TAPPABLE
						backgroundColor: "transparent",
					}}
				>
					<Picker.Item label={t("select_gender")} value="" />
					<Picker.Item label={t("male")} value="Male" />
					<Picker.Item label={t("female")} value="Female" />
					<Picker.Item label={t("other")} value="Other" />
				</Picker>
			</View>

			{/* 🚨 THE UPDATED DATE PICKER BUTTON */}
			<TouchableOpacity
				style={[styles.input, styles.mockInputContainer]} // Applies the new flex row styling
				onPress={() => setShowPicker(true)}
				activeOpacity={0.7}
			>
				<Text
					style={{
						color: isDobSelected ? colors.textDark : colors.textMedium,
						fontSize: 16,
						flex: 1, // Pushes text to the left, icon to the right
					}}
				>
					{isDobSelected
						? dob.toLocaleDateString()
						: t("date_of_birth") || "Select Date of Birth"}
				</Text>
				{/* Visual Indicator on the right */}
				<Ionicons name="calendar-outline" size={20} color={colors.textMedium} />
			</TouchableOpacity>

			{showPicker && (
				<DateTimePicker
					value={dob}
					mode="date"
					display="spinner"
					onChange={onChangeDate}
					maximumDate={new Date()}
				/>
			)}

			{showPicker && Platform.OS === "ios" && (
				<Button title="Done" onPress={() => setShowPicker(false)} />
			)}

			{loading ? (
				<ActivityIndicator size="large" color="#0000ff" />
			) : (
				<View style={{ marginTop: 10 }}>
					<Button
						color={colors.primary}
						title={t("complete_setup") || "Complete Setup"}
						onPress={saveProfile}
					/>
				</View>
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
		marginBottom: 15,
		borderRadius: 8,
		justifyContent: "center",
		minHeight: 54,
		color: colors.textDark, // Added to fix the white text issue
	},
	pickerContainer: {
		borderWidth: 1,
		borderColor: "#ccc",
		marginBottom: 15,
		borderRadius: 8,
		justifyContent: "center",
		paddingVertical: Platform.OS === "ios" ? 0 : 2,
		overflow: "hidden",
	},
	mockInputContainer: {
		flexDirection: "row",
		justifyContent: "space-between", // Pushes text left, icon right
		alignItems: "center", // Vertically centers them
		paddingRight: 15, // Adds breathing room for the icon
	},
});
