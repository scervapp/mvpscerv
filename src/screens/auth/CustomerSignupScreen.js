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
import { useTranslation } from "react-i18next";

const CustomerSignupScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const { requestEmailOtp, verifyEmailOtpAndSignIn, isLoading } =
		useContext(AuthContext);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isCodeSent, setIsCodeSent] = useState(false); // Tracks if we are on Step 1 (Email) or Step 2 (OTP)
	const [verificationCode, setVerificationCode] = useState("");
	const [formValues, setFormValues] = useState(null);
	const [codeError, setCodeError] = useState("");

	// 1. Validate the email format
	const validationSchema = Yup.object().shape({
		email: Yup.string()
			.email(t("invalid_email", "Please enter a valid email address."))
			.required(t("email_is_required", "Email is required.")),
	});

	// 2. Step 1: Send the email code
	const handleSendVerificationCode = async (values) => {
		setIsSubmitting(true);
		try {
			const emailToUse = values.email.toLowerCase().trim();
			const success = await requestEmailOtp(emailToUse);

			if (success) {
				setFormValues({ email: emailToUse });
				setIsCodeSent(true);
			}
		} catch (error) {
			console.error("[DEBUG] Error sending email code:", error);
			Alert.alert(
				t("error", "Error"),
				t(
					"could_not_send_code",
					"Could not send verification code. Please try again.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	// 3. Step 2: Verify the 6-digit code
	const handleConfirmCode = async () => {
		if (isLoading || !isCodeSent) return;

		if (!verificationCode || verificationCode.trim().length !== 6) {
			setCodeError(
				t(
					"please_enter_a_valid_6_digit_code",
					"Please enter a valid 6-digit code.",
				),
			);
			return;
		}

		setCodeError("");
		setIsSubmitting(true);

		try {
			await verifyEmailOtpAndSignIn(formValues.email, verificationCode);
			// If successful, AuthContext will automatically update the user state and navigate away
		} catch (error) {
			console.error("Verification failed:", error);
			setCodeError(
				t("invalid_code_try_again", "Invalid code. Please try again."),
			);
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
							{!isCodeSent
								? t("create_your_account", "Create your account")
								: t("verify_your_email", "Verify your email")}
						</Text>
						<Text style={styles.subtitle}>
							{!isCodeSent
								? t(
										"enter_your_email_to_begin",
										"Enter your email address to begin",
									)
								: t("enter_the_6_digit_code_sent_to", {
										email: formValues?.email,
									})}
							{isCodeSent && formValues?.email && `\n${formValues.email}`}
						</Text>
					</View>

					{!isCodeSent ? (
						/* STEP 1: EMAIL INPUT FORM */
						<Formik
							initialValues={{ email: "" }}
							validationSchema={validationSchema}
							onSubmit={handleSendVerificationCode}
						>
							{({
								handleChange,
								handleSubmit,
								values,
								errors,
								touched,
								handleBlur,
							}) => (
								<View style={styles.form}>
									<TextInput
										style={[
											styles.input,
											touched.email && errors.email && styles.inputError,
										]}
										placeholder={t("email_placeholder", "name@example.com")}
										placeholderTextColor={colors.textMedium}
										value={values.email}
										onChangeText={handleChange("email")}
										onBlur={handleBlur("email")}
										keyboardType="email-address"
										autoCapitalize="none"
										autoCorrect={false}
									/>
									{touched.email && errors.email && (
										<Text style={styles.errorText}>{errors.email}</Text>
									)}

									<Button
										mode="contained"
										onPress={handleSubmit}
										disabled={isSubmitting || isLoading}
										loading={isSubmitting || isLoading}
										style={styles.button}
									>
										{t("send_verification_code", "Send Verification Code")}
									</Button>
								</View>
							)}
						</Formik>
					) : (
						/* STEP 2: OTP VERIFICATION FORM */
						<View style={styles.form}>
							<TextInput
								style={[styles.input, codeError && styles.inputError]}
								placeholder={t("6_digit_code", "6-Digit Code")}
								placeholderTextColor={colors.textMedium}
								value={verificationCode}
								onChangeText={(text) => {
									setVerificationCode(text);
									if (codeError) setCodeError("");
								}}
								keyboardType="number-pad"
								maxLength={6}
								textAlign="center"
								autoFocus={true}
							/>
							{codeError ? (
								<Text style={styles.errorText}>{codeError}</Text>
							) : null}

							<Button
								mode="contained"
								onPress={handleConfirmCode}
								disabled={
									isLoading || isSubmitting || verificationCode.length !== 6
								}
								loading={isLoading || isSubmitting}
								style={styles.button}
							>
								{t("verify_and_continue", "Verify & Continue")}
							</Button>

							<Button
								mode="text"
								onPress={() => {
									setIsCodeSent(false);
									setVerificationCode("");
									setCodeError("");
								}}
								disabled={isSubmitting}
								textColor={colors.primary}
							>
								{t("use_a_different_email", "Use a different email")}
							</Button>
						</View>
					)}

					<View style={styles.footer}>
						<Text style={styles.footerText}>
							{t("already_have_an_account", "Already have an account?")}
						</Text>
						<TouchableOpacity onPress={() => navigation.navigate("Login")}>
							<Text style={styles.linkTextFooter}>
								{" "}
								{t("log_in", "Log In")}
							</Text>
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
		lineHeight: 22,
	},
	form: { width: "100%" },
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
