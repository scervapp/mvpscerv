import React, { useContext, useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

const PasswordResetScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const { sendPasswordResetEmail, isLoading, authError } =
		useContext(AuthContext);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submittedEmail, setSubmittedEmail] = useState("");

	const validationSchema = Yup.object().shape({
		email: Yup.string()
			.email(t("invalid_email", "Please enter a valid email address."))
			.required(t("email_is_required", "Email is required.")),
	});

	const handlePasswordReset = async ({ email }) => {
		const normalizedEmail = email.toLowerCase().trim();
		setIsSubmitting(true);
		try {
			await sendPasswordResetEmail(normalizedEmail);
			setSubmittedEmail(normalizedEmail);
		} catch (error) {
			console.log("Password reset failed:", error.message);
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
					contentContainerStyle={styles.container}
					keyboardShouldPersistTaps="handled"
				>
					<TouchableOpacity
						style={styles.backButton}
						onPress={() => navigation.goBack()}
					>
						<Ionicons name="arrow-back" size={22} color={colors.textDark} />
					</TouchableOpacity>

					<View style={styles.header}>
						<Ionicons name="key-outline" size={52} color={colors.primary} />
						<Text style={styles.title}>
							{t("reset_password", "Reset password")}
						</Text>
						<Text style={styles.subtitle}>
							{submittedEmail
								? t(
										"password_reset_sent_message",
										"Check your inbox and follow the secure reset link to choose a new password.",
									)
								: t(
										"password_reset_intro",
										"Enter the business email for your restaurant account.",
									)}
						</Text>
					</View>

					{submittedEmail ? (
						<View style={styles.successBox}>
							<Ionicons
								name="mail-check-outline"
								size={26}
								color={colors.statusSuccess}
							/>
							<Text style={styles.successTitle}>
								{t("reset_email_sent", "Reset email sent")}
							</Text>
							<Text style={styles.successText}>{submittedEmail}</Text>
							<Button
								mode="contained"
								style={styles.button}
								onPress={() => navigation.navigate("Login")}
							>
								{t("back_to_login", "Back to login")}
							</Button>
							<Button
								mode="text"
								textColor={colors.primary}
								onPress={() => setSubmittedEmail("")}
							>
								{t("send_to_different_email", "Use a different email")}
							</Button>
						</View>
					) : (
						<Formik
							initialValues={{ email: "" }}
							validationSchema={validationSchema}
							onSubmit={handlePasswordReset}
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
										placeholder={t(
											"business_email",
											"Business email",
										)}
										placeholderTextColor={colors.textMedium}
										onChangeText={handleChange("email")}
										onBlur={handleBlur("email")}
										value={values.email}
										keyboardType="email-address"
										autoCapitalize="none"
										autoCorrect={false}
									/>
									{touched.email && errors.email ? (
										<Text style={styles.errorText}>{errors.email}</Text>
									) : null}
									{authError ? (
										<Text style={styles.errorText}>{authError}</Text>
									) : null}

									<Button
										mode="contained"
										onPress={handleSubmit}
										disabled={isLoading || isSubmitting}
										loading={isLoading || isSubmitting}
										style={styles.button}
									>
										{t("send_reset_link", "Send reset link")}
									</Button>
								</View>
							)}
						</Formik>
					)}
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	keyboardAvoidingContainer: { flex: 1 },
	container: {
		flexGrow: 1,
		justifyContent: "center",
		padding: 24,
	},
	backButton: {
		position: "absolute",
		top: 20,
		left: 20,
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	header: { alignItems: "center", marginBottom: 28 },
	title: {
		fontSize: 30,
		fontWeight: "900",
		color: colors.textDark,
		textAlign: "center",
		marginTop: 14,
	},
	subtitle: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textMedium,
		textAlign: "center",
		lineHeight: 21,
		marginTop: 8,
	},
	form: { width: "100%" },
	input: {
		height: 55,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		fontSize: 16,
		backgroundColor: colors.surfaceWhite,
		color: colors.textDark,
		marginBottom: 12,
	},
	inputError: { borderColor: colors.statusDanger },
	button: { paddingVertical: 8, borderRadius: 8, marginTop: 10 },
	errorText: {
		color: colors.statusDanger,
		fontSize: 13,
		fontWeight: "600",
		marginBottom: 10,
	},
	successBox: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		padding: 20,
		alignItems: "center",
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	successTitle: {
		fontSize: 18,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 10,
	},
	successText: {
		fontSize: 14,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 4,
		textAlign: "center",
	},
});

export default PasswordResetScreen;
