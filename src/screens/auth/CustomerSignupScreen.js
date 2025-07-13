// screens/auth/CustomerSignupScreen.js
import React, { useState, useContext, useRef } from "react";
import {
	View,
	Text,
	StyleSheet,
	TextInput,
	TouchableOpacity,
	Alert,
	ActivityIndicator,
	SafeAreaView,
	ScrollView,
	Platform,
	KeyboardAvoidingView,
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";
import { AuthContext } from "../../context/authContext";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import auth from "@react-native-firebase/auth";

import app from "../../config/firebase";

const CustomerSignupScreen = ({ navigation }) => {
	const { signInWithPhoneCredential, isLoading } = useContext(AuthContext);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [confirmation, setConfirmation] = useState(null); // This will store the confirmation object
	const [verificationCode, setVerificationCode] = useState("");
	const [formValues, setFormValues] = useState(null);

	// Step 1: Send the verification code to the user's phone
	const handleSendVerificationCode = async (values) => {
		setIsSubmitting(true);
		try {
			const phoneNumber = `+1${values.phoneNumber}`;
			const confirmationResult = await auth().signInWithPhoneNumber(
				phoneNumber
			);
			setFormValues(values);
			setConfirmation(confirmationResult);
		} catch (error) {
			Alert.alert(
				"Error",
				`Could not send verification code: ${error.message}`
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Step 2: Confirm the code and sign in/up
	const handleConfirmCode = async () => {
		if (isLoading || !confirmation) return;
		setIsSubmitting(true);
		try {
			// The context function now receives the confirmation object and the code
			await signInWithPhoneCredential(confirmation, verificationCode, {
				firstName: formValues.firstName,
				lastName: formValues.lastName,
				phoneNumber: formValues.phoneNumber,
			});
		} catch (error) {
			Alert.alert("Error", `Could not verify code: ${error.message}`);
		} finally {
			setIsSubmitting(false);
		}
	};

	// The validation schema no longer includes email or password
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
							{!verificationId ? "Create Your Account" : "Verify Your Phone"}
						</Text>
						<Text style={styles.subtitle}>
							{!verificationId
								? "Enter your name and phone number to begin."
								: `Enter the 6-digit code sent to +1 ${formValues?.phoneNumber}`}
						</Text>
					</View>

					{!verificationId ? (
						<Formik
							initialValues={{ firstName: "", lastName: "", phoneNumber: "" }}
							validationSchema={validationSchema}
							onSubmit={handleSendVerificationCode}
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
										style={styles.input}
										placeholder="First Name"
										value={values.firstName}
										onChangeText={handleChange("firstName")}
									/>
									{touched.firstName && errors.firstName && (
										<Text style={styles.errorText}>{errors.firstName}</Text>
									)}
									<TextInput
										style={styles.input}
										placeholder="Last Name"
										value={values.lastName}
										onChangeText={handleChange("lastName")}
									/>
									{touched.lastName && errors.lastName && (
										<Text style={styles.errorText}>{errors.lastName}</Text>
									)}
									<TextInput
										style={styles.input}
										placeholder="10-Digit Phone Number"
										value={values.phoneNumber}
										onChangeText={handleChange("phoneNumber")}
										keyboardType="phone-pad"
										maxLength={10}
									/>
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
										Send Verification Code
									</Button>
								</View>
							)}
						</Formik>
					) : (
						<View style={styles.form}>
							<TextInput
								style={styles.input}
								placeholder="6-Digit Code"
								value={verificationCode}
								onChangeText={setVerificationCode}
								keyboardType="number-pad"
								maxLength={6}
								textAlign="center"
							/>
							<Button
								mode="contained"
								onPress={handleConfirmCode}
								disabled={
									isLoading || isSubmitting || verificationCode.length < 6
								}
								loading={isLoading || isSubmitting}
								style={styles.button}
							>
								Verify & Continue
							</Button>
							<Button mode="text" onPress={() => setVerificationId(null)}>
								Use a different number
							</Button>
						</View>
					)}

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
	container: { flexGrow: 1, justifyContent: "center", padding: 25 },
	header: { alignItems: "center", marginBottom: 30 },
	title: {
		fontSize: 32,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginBottom: 8,
	},
	keyboardAvoidingContainer: {
		flex: 1,
	},
	scrollView: {
		flex: 1,
	},
	scrollContentContainer: {
		flexGrow: 1,
		justifyContent: "center",
		padding: 25,
	},
	subtitle: { fontSize: 16, color: colors.textMedium, textAlign: "center" },
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
	},
	button: { paddingVertical: 8, borderRadius: 8, marginTop: 10 },
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
