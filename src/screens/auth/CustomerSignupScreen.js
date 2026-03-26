// screens/auth/CustomerSignupScreen.js
import React, { useState, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	TextInput,
	TouchableOpacity,
	Alert,
	SafeAreaView,
	ScrollView,
	Platform,
	KeyboardAvoidingView,
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";
import { AuthContext } from "../../context/authContext";
import { Button } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import { auth } from "../../config/firebase.native";
import { useTranslation } from "react-i18next";

const CustomerSignupScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const { signInWithPhoneCredential, isLoading } = useContext(AuthContext);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [confirmation, setConfirmation] = useState(null);
	const [verificationCode, setVerificationCode] = useState("");
	const [formValues, setFormValues] = useState(null);
	const [codeError, setCodeError] = useState("");

	// NEW: State for country code toggle (Defaults to Panama)
	const [countryCode, setCountryCode] = useState("+507");

	// NEW: Dynamic Validation Schema based on country code
	const validationSchema = Yup.object().shape({
		phoneNumber: Yup.string()
			.test("phone-length", t("invalid_phone_number_length"), function (value) {
				if (!value) return false;
				if (countryCode === "+507") return value.length === 8;
				if (countryCode === "+1") return value.length === 10;
				return false;
			})
			.required(t("phone_number_is_required")),
	});

	const handleSendVerificationCode = async (values) => {
		setIsSubmitting(true);
		try {
			// 1. Strip all non-numeric characters (spaces, dashes, parens) from the user input
			const cleanedNumber = values.phoneNumber.replace(/\D/g, "");

			// 2. Combine the selected country code with the clean number
			const fullPhoneNumber = `${countryCode}${cleanedNumber}`;

			console.log(`[DEBUG] Cleaned SMS target: ${fullPhoneNumber}`);

			// 3. Send to Firebase
			const confirmationResult =
				await auth.signInWithPhoneNumber(fullPhoneNumber);

			// Save the cleaned number into formValues so the rest of the app uses the correct format
			setFormValues({ ...values, phoneNumber: cleanedNumber });
			setConfirmation(confirmationResult);
		} catch (error) {
			console.error("[DEBUG] CRITICAL ERROR sending verification code:", error);
			Alert.alert(
				t("error"),
				t(
					"could_not_send_verification_code_please_check_the_console_for_details_code",
					{ code: error.code },
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleConfirmCode = async () => {
		if (isLoading || !confirmation) return;

		if (!verificationCode || verificationCode.trim().length !== 6) {
			setCodeError(t("please_enter_a_valid_6_digit_code"));
			return;
		}

		setCodeError("");
		setIsSubmitting(true);

		try {
			await signInWithPhoneCredential(
				confirmation,
				verificationCode,
				formValues,
			);
		} catch (error) {
			console.error("Verification failed:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={styles.keyboardAvoidingContainer}
			>
				<ScrollView contentContainerStyle={styles.scrollContentContainer}>
					<View style={styles.header}>
						<Text style={styles.title}>
							{!confirmation
								? t("create_your_account")
								: t("verify_your_phone")}
						</Text>
						<Text style={styles.subtitle}>
							{!confirmation
								? t("enter_your_phone_number_to_begin")
								: t("enter_the_6_digit_code_sent_to_1", {
										phoneNumber: formValues?.phoneNumber,
									})}
						</Text>
					</View>

					{!confirmation ? (
						<Formik
							initialValues={{ firstName: "", lastName: "", phoneNumber: "" }}
							validationSchema={validationSchema}
							onSubmit={handleSendVerificationCode}
						>
							{({ handleChange, handleSubmit, values, errors, touched }) => (
								<View style={styles.form}>
									{/* NEW: Phone Input Container with Country Code Toggle */}
									<View style={styles.phoneInputContainer}>
										<TouchableOpacity
											style={styles.countryCodeSelector}
											onPress={() =>
												setCountryCode(countryCode === "+507" ? "+1" : "+507")
											}
										>
											<Text style={styles.countryCodeText}>{countryCode}</Text>
											{/* Adds a simple, dependency-free dropdown arrow */}
											<Text style={styles.dropdownArrow}> ▾</Text>
										</TouchableOpacity>

										<TextInput
											style={[styles.input, styles.phoneInputFlex]}
											placeholder={
												countryCode === "+507" ? "12345678" : "1234567890"
											}
											placeholderTextColor={colors.textMedium}
											value={values.phoneNumber}
											onChangeText={handleChange("phoneNumber")}
											keyboardType="phone-pad"
											maxLength={countryCode === "+507" ? 8 : 10}
										/>
									</View>

									{touched.phoneNumber && errors.phoneNumber && (
										<Text style={styles.errorText}>{errors.phoneNumber}</Text>
									)}

									<Button
										mode="contained"
										onPress={handleSubmit}
										disabled={isSubmitting}
										loading={isSubmitting}
										style={styles.button}
									>
										{t("send_verification_code")}
									</Button>
								</View>
							)}
						</Formik>
					) : (
						<View style={styles.form}>
							<TextInput
								style={[styles.input, codeError && styles.inputError]}
								placeholder={t("6_digit_code")}
								value={verificationCode}
								onChangeText={(text) => {
									setVerificationCode(text);
									if (codeError) setCodeError("");
								}}
								keyboardType="number-pad"
								maxLength={6}
								textAlign="center"
							/>
							{codeError && <Text style={styles.errorText}>{codeError}</Text>}

							<Button
								mode="contained"
								onPress={handleConfirmCode}
								disabled={
									isLoading || isSubmitting || verificationCode.length !== 6
								}
								loading={isLoading || isSubmitting}
								style={styles.button}
							>
								{t("verify_and_continue")}
							</Button>

							<Button
								mode="text"
								onPress={() => setConfirmation(null)}
								disabled={isSubmitting}
							>
								{t("use_a_different_number")}
							</Button>
						</View>
					)}

					<View style={styles.footer}>
						<Text style={styles.footerText}>
							{t("already_have_an_account")}
						</Text>
						<TouchableOpacity onPress={() => navigation.navigate("Login")}>
							<Text style={styles.linkTextFooter}> {t("log_in")}</Text>
						</TouchableOpacity>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	keyboardAvoidingContainer: { flex: 1 },
	scrollContentContainer: {
		flexGrow: 1,
		justifyContent: "center",
		padding: 25,
	},
	header: { alignItems: "center", marginBottom: 30 },
	title: {
		fontSize: 32,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 20,
	},
	form: { width: "100%" },

	// NEW STYLES FOR PHONE ROW
	phoneInputContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 15,
	},
	countryCodeSelector: {
		height: 55,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		// Ensure items sit side-by-side
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 15,
		marginRight: 10,
	},
	countryCodeText: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
	},
	dropdownArrow: {
		fontSize: 18,
		color: colors.textMedium,
		marginLeft: 4, // Gives a little breathing room between the number and arrow
		marginTop: -2, // Visually centers the arrow with the text
	},
	phoneInputFlex: {
		flex: 1,
		marginBottom: 0, // Override the default marginBottom since the container handles it
	},
	// END NEW STYLES

	input: {
		height: 55,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		marginBottom: 15,
		fontSize: 16,
		backgroundColor: colors.surfaceWhite,
		color: colors.textDark,
	},
	inputError: {
		borderColor: colors.statusDanger,
	},
	button: {
		paddingVertical: 8,
		borderRadius: 8,
		marginTop: 10,
		marginBottom: 10,
	},
	errorText: {
		color: colors.statusDanger,
		marginBottom: 10,
		textAlign: "center",
		fontWeight: "500",
	},
	footer: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		marginTop: 30,
	},
	footerText: { fontSize: 15, color: colors.textMedium },
	linkTextFooter: { color: colors.primary, fontSize: 15, fontWeight: "bold" },
});

export default CustomerSignupScreen;
