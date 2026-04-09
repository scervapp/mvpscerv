// screens/auth/LoginScreen.js
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
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Button } from "react-native-paper";
import { AuthContext } from "../context/authContext";
import colors from "../utils/styles/appStyles";

// 🚨 NEW: Clean, Two-Step Email OTP Form for Customers
const CustomerLoginForm = ({
	email,
	setEmail,
	isCodeSent,
	setIsCodeSent,
	handleSendEmailCode,
	verificationCode,
	setVerificationCode,
	handleConfirmOtp,
	isSubmitting,
	isLoading,
}) => {
	const { t } = useTranslation();
	const [emailError, setEmailError] = useState("");

	const onSend = () => {
		// Basic email validation before hitting the server
		if (!email || !email.includes("@") || !email.includes(".")) {
			setEmailError(t("invalid_email", "Please enter a valid email address."));
			return;
		}
		setEmailError("");
		handleSendEmailCode(email);
	};

	return (
		<View style={styles.form}>
			{!isCodeSent ? (
				/* Step 1: Request Code */
				<>
					<TextInput
						style={[styles.input, emailError && styles.inputError]}
						placeholder={t("email_address_placeholder", "name@example.com")}
						placeholderTextColor={colors.textMedium}
						value={email}
						onChangeText={(text) => {
							setEmail(text);
							if (emailError) setEmailError("");
						}}
						keyboardType="email-address"
						autoCapitalize="none"
						autoCorrect={false}
					/>
					{emailError ? (
						<Text style={styles.errorText}>{emailError}</Text>
					) : null}

					<Button
						mode="contained"
						onPress={onSend}
						disabled={isSubmitting || isLoading}
						loading={isSubmitting || isLoading}
						style={styles.button}
					>
						{t("send_login_code", "Send Login Code")}
					</Button>
				</>
			) : (
				/* Step 2: Verify Code */
				<>
					<TextInput
						style={styles.input}
						placeholder={t("6_digit_code", "6-Digit Code")}
						placeholderTextColor={colors.textMedium}
						value={verificationCode}
						onChangeText={setVerificationCode}
						keyboardType="number-pad"
						maxLength={6}
						textAlign="center"
						autoFocus={true}
					/>
					<Button
						mode="contained"
						onPress={handleConfirmOtp}
						disabled={
							isLoading || isSubmitting || verificationCode.length !== 6
						}
						loading={isLoading || isSubmitting}
						style={styles.button}
					>
						{t("sign_in_button", "Sign In")}
					</Button>
					<Button
						mode="text"
						onPress={() => {
							setIsCodeSent(false);
							setVerificationCode("");
							setEmailError("");
						}}
						disabled={isSubmitting}
						textColor={colors.primary}
					>
						{t("use_a_different_email", "Use a different email")}
					</Button>
				</>
			)}
		</View>
	);
};

// 🚨 UNTOUCHED: Restaurant standard email/password login
const RestaurantLoginForm = ({ handleEmailLogin, isSubmitting, isLoading }) => {
	const { t } = useTranslation();
	const emailValidationSchema = Yup.object().shape({
		email: Yup.string()
			.email(t("validation.invalid_email"))
			.required(t("validation.email_required")),
		password: Yup.string().required(t("validation.password_required")),
	});

	return (
		<Formik
			initialValues={{ email: "", password: "" }}
			validationSchema={emailValidationSchema}
			onSubmit={handleEmailLogin}
		>
			{({
				handleChange,
				handleBlur,
				handleSubmit,
				values,
				errors,
				touched,
			}) => (
				<View style={styles.form}>
					<TextInput
						style={[
							styles.input,
							touched.email && errors.email && styles.inputError,
						]}
						placeholder={t("email_address_placeholder")}
						value={values.email}
						onChangeText={handleChange("email")}
						onBlur={handleBlur("email")}
						keyboardType="email-address"
						autoCapitalize="none"
						placeholderTextColor={colors.textMedium}
					/>
					{touched.email && errors.email && (
						<Text style={styles.errorText}>{errors.email}</Text>
					)}
					<TextInput
						style={[
							styles.input,
							touched.password && errors.password && styles.inputError,
						]}
						placeholder={t("password_placeholder")}
						value={values.password}
						onChangeText={handleChange("password")}
						onBlur={handleBlur("password")}
						secureTextEntry
						placeholderTextColor={colors.textMedium}
					/>
					{touched.password && errors.password && (
						<Text style={styles.errorText}>{errors.password}</Text>
					)}
					<Button
						mode="contained"
						onPress={handleSubmit}
						disabled={isLoading || isSubmitting}
						loading={isLoading || isSubmitting}
						style={styles.button}
					>
						{t("sign_in_button")}
					</Button>
				</View>
			)}
		</Formik>
	);
};

const LoginScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const {
		login, // Handles Restaurant Login
		requestEmailOtp, // NEW: Handles Customer Email OTP request
		verifyEmailOtpAndSignIn, // NEW: Handles Customer Email OTP verification
		isLoading,
		authError,
	} = useContext(AuthContext);

	const [activeTab, setActiveTab] = useState("customer");
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Customer Auth State
	const [isCodeSent, setIsCodeSent] = useState(false);
	const [email, setEmail] = useState("");
	const [verificationCode, setVerificationCode] = useState("");

	// Step 1: Fire the Email API
	const handleSendEmailCode = async (emailToUse) => {
		setIsSubmitting(true);
		try {
			const success = await requestEmailOtp(emailToUse.toLowerCase().trim());
			if (success) {
				setIsCodeSent(true);
			}
		} catch (error) {
			Alert.alert(
				t("alert.error_title", "Error"),
				t(
					"alert.could_not_send_code_message",
					"Could not send verification code.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Step 2: Verify the Code
	const handleConfirmOtp = async () => {
		setIsSubmitting(true);
		try {
			await verifyEmailOtpAndSignIn(
				email.toLowerCase().trim(),
				verificationCode,
			);
			// AuthContext automatically updates the user state and redirects
		} catch (error) {
			Alert.alert(
				t("alert.login_failed_title", "Login Failed"),
				t(
					"alert.could_not_verify_code_message",
					"Invalid code. Please try again.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Restaurant Standard Login
	const handleEmailLogin = async (values) => {
		setIsSubmitting(true);
		try {
			await login(values.email.toLowerCase().trim(), values.password);
		} catch (error) {
			// Error handled visually by authError from Context
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
				<ScrollView
					contentContainerStyle={styles.scrollContentContainer}
					keyboardShouldPersistTaps="handled"
				>
					<View style={styles.header}>
						<Ionicons
							name="restaurant-outline"
							size={60}
							color={colors.primary}
						/>
						<Text style={styles.title}>{t("welcome_back_title")}</Text>
						<Text style={styles.subtitle}>
							{t("sign_in_to_access_account_subtitle")}
						</Text>
					</View>

					<View style={styles.tabContainer}>
						<TouchableOpacity
							style={[styles.tab, activeTab === "customer" && styles.activeTab]}
							onPress={() => {
								setActiveTab("customer");
								// Reset customer state if they switch back and forth
								setIsCodeSent(false);
								setVerificationCode("");
							}}
						>
							<Text
								style={[
									styles.tabText,
									activeTab === "customer" && styles.activeTabText,
								]}
							>
								{t("customer_tab")}
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.tab,
								activeTab === "restaurant" && styles.activeTab,
							]}
							onPress={() => setActiveTab("restaurant")}
						>
							<Text
								style={[
									styles.tabText,
									activeTab === "restaurant" && styles.activeTabText,
								]}
							>
								{t("restaurant_tab")}
							</Text>
						</TouchableOpacity>
					</View>

					{authError ? (
						<Text style={styles.errorTextContext}>{authError}</Text>
					) : null}

					{activeTab === "customer" ? (
						<CustomerLoginForm
							email={email}
							setEmail={setEmail}
							isCodeSent={isCodeSent}
							setIsCodeSent={setIsCodeSent}
							handleSendEmailCode={handleSendEmailCode}
							verificationCode={verificationCode}
							setVerificationCode={setVerificationCode}
							handleConfirmOtp={handleConfirmOtp}
							isSubmitting={isSubmitting}
							isLoading={isLoading}
						/>
					) : (
						<RestaurantLoginForm
							handleEmailLogin={handleEmailLogin}
							isSubmitting={isSubmitting}
							isLoading={isLoading}
						/>
					)}

					{activeTab === "restaurant" && (
						<TouchableOpacity
							onPress={() => navigation.navigate("PasswordReset")}
						>
							<Text style={styles.linkText}>{t("forgot_password_link")}</Text>
						</TouchableOpacity>
					)}

					<View style={styles.footer}>
						<Text style={styles.footerText}>{t("dont_have_account_text")}</Text>
						<TouchableOpacity
							onPress={() =>
								navigation.navigate(
									activeTab === "customer"
										? "CustomerSignup"
										: "RestaurantSignup",
								)
							}
						>
							<Text style={styles.linkTextFooter}> {t("signup_link")}</Text>
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
	subtitle: { fontSize: 16, color: colors.textMedium, textAlign: "center" },
	tabContainer: {
		flexDirection: "row",
		justifyContent: "center",
		marginBottom: 20,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		padding: 4,
	},
	tab: { flex: 1, paddingVertical: 10, borderRadius: 6 },
	activeTab: { backgroundColor: colors.primary },
	tabText: { textAlign: "center", fontWeight: "600", color: colors.textMedium },
	activeTabText: { color: colors.surfaceWhite },
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
	button: { paddingVertical: 8, borderRadius: 8, marginTop: 10 },
	errorText: {
		color: colors.statusDanger,
		marginBottom: 10,
		textAlign: "left",
		fontWeight: "500",
		marginTop: -10,
		paddingLeft: 5,
	},
	errorTextContext: {
		color: colors.statusDanger,
		marginBottom: 15,
		textAlign: "center",
		fontWeight: "bold",
	},
	linkText: {
		color: colors.primary,
		textAlign: "center",
		marginTop: 20,
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

export default LoginScreen;
