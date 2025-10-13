// screens/auth/CustomerSignupScreen.js
import React, { useState, useContext, useRef } from "react";
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

const CustomerSignupScreen = ({ navigation }) => {
	const { signInWithPhoneCredential, isLoading } = useContext(AuthContext);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [confirmation, setConfirmation] = useState(null);
	const [verificationCode, setVerificationCode] = useState("");
	const [formValues, setFormValues] = useState(null);
	const [codeError, setCodeError] = useState("");

	const handleSendVerificationCode = async (values) => {
		setIsSubmitting(true);
		console.log(
			"[DEBUG] 1. handleSendVerificationCode called with values:",
			values
		);
		try {
			const phoneNumber = `+1${values.phoneNumber}`;
			console.log(`[DEBUG] 2. Attempting to send SMS to: ${phoneNumber}`);

			// This is the core Firebase call
			const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber);

			console.log(
				"[DEBUG] 3. Successfully received confirmation object from Firebase:",
				confirmationResult
			);

			setFormValues(values);
			setConfirmation(confirmationResult);
		} catch (error) {
			// This will now print the full, detailed error object from Firebase.
			console.error(
				"[DEBUG] 3. CRITICAL ERROR sending verification code:",
				error
			);
			Alert.alert(
				"Error",
				`Could not send verification code. Please check the console for details. Code: ${error.code}`
			);
		} finally {
			setIsSubmitting(false);
			console.log("[DEBUG] 4. handleSendVerificationCode finished.");
		}
	};

	const handleConfirmCode = async () => {
		if (isLoading || !confirmation) return;

		// **NEW VALIDATION**: Check code length before attempting
		if (!verificationCode || verificationCode.trim().length !== 6) {
			setCodeError("Please enter a valid 6-digit code");
			return;
		}

		setCodeError(""); // Clear previous errors
		setIsSubmitting(true);

		try {
			await signInWithPhoneCredential(
				confirmation,
				verificationCode,
				formValues
			);
			// If successful, navigation happens in AuthContext's listener
		} catch (error) {
			// Error is already set in context, but we can show it here too
			console.error("Verification failed:", error);
		} finally {
			setIsSubmitting(false);
		}
	};
	const validationSchema = Yup.object().shape({
		firstName: Yup.string().required("First name is required"),
		lastName: Yup.string().required("Last name is required"),
		phoneNumber: Yup.string()
			.matches(/^[0-9]{10}$/, "Must be a valid 10-digit phone number")
			.required("Phone number is required"),
	});

	return (
		<SafeAreaView style={styles.safeArea}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={styles.keyboardAvoidingContainer}
			>
				<ScrollView contentContainerStyle={styles.scrollContentContainer}>
					<View style={styles.header}>
						<Text style={styles.title}>
							{!confirmation ? "Create Your Account" : "Verify Your Phone"}
						</Text>
						<Text style={styles.subtitle}>
							{!confirmation
								? "Enter your name and phone number to begin."
								: `Enter the 6-digit code sent to +1 ${formValues?.phoneNumber}`}
						</Text>
					</View>

					{/* STEP 1: Name & Phone Number Form */}
					{!confirmation ? (
						<Formik
							initialValues={{ firstName: "", lastName: "", phoneNumber: "" }}
							validationSchema={validationSchema}
							onSubmit={handleSendVerificationCode}
						>
							{({ handleChange, handleSubmit, values, errors, touched }) => (
								<View style={styles.form}>
									{/* First Name Input */}
									<TextInput
										style={styles.input}
										placeholder="First Name"
										placeholderTextColor={colors.textMedium}
										value={values.firstName}
										onChangeText={handleChange("firstName")}
									/>
									{touched.firstName && errors.firstName && (
										<Text style={styles.errorText}>{errors.firstName}</Text>
									)}

									{/* Last Name Input */}
									<TextInput
										style={styles.input}
										placeholder="Last Name"
										placeholderTextColor={colors.textMedium}
										value={values.lastName}
										onChangeText={handleChange("lastName")}
									/>
									{touched.lastName && errors.lastName && (
										<Text style={styles.errorText}>{errors.lastName}</Text>
									)}

									{/* Phone Number Input */}
									<TextInput
										style={styles.input}
										placeholder="10-Digit Phone Number"
										placeholderTextColor={colors.textMedium}
										value={values.phoneNumber}
										onChangeText={handleChange("phoneNumber")}
										keyboardType="phone-pad"
										maxLength={10}
									/>
									{touched.phoneNumber && errors.phoneNumber && (
										<Text style={styles.errorText}>{errors.phoneNumber}</Text>
									)}

									{/* Send Code Button */}
									<Button
										mode="contained"
										onPress={handleSubmit}
										disabled={isSubmitting}
										loading={isSubmitting}
										style={styles.button}
									>
										Send Verification Code
									</Button>
								</View>
							)}
						</Formik>
					) : (
						/* STEP 2: Verification Code Input */
						<View style={styles.form}>
							<TextInput
								style={[styles.input, codeError && styles.inputError]}
								placeholder="6-Digit Code"
								value={verificationCode}
								onChangeText={(text) => {
									setVerificationCode(text);
									if (codeError) setCodeError(""); // Clear error on typing
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
								Verify & Continue
							</Button>

							<Button
								mode="text"
								onPress={() => setConfirmation(null)}
								disabled={isSubmitting}
							>
								Use a different number
							</Button>
						</View>
					)}

					{/* Footer (Always Visible) */}
					<View style={styles.footer}>
						<Text style={styles.footerText}>Already have an account?</Text>
						<TouchableOpacity onPress={() => navigation.navigate("Login")}>
							<Text style={styles.linkTextFooter}> Log In</Text>
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
		// NEW: Error styling for code input
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
