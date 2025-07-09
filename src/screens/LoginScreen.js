// screens/LoginScreen.js
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
import { AuthContext } from "../context/authContext";
import { Ionicons } from "@expo/vector-icons";
import colors from "../utils/styles/appStyles";
import { FirebaseRecaptchaVerifierModal } from "expo-firebase-recaptcha";
import app from "../config/firebase";
import { Button } from "react-native-paper";
import { PhoneAuthProvider } from "firebase/auth";

const CustomerLoginForm = ({
	verificationId,
	setVerificationId,
	phoneNumber,
	setPhoneNumber,
	handleSendCode,
	verificationCode,
	setVerificationCode,
	handleConfirmCode,
	isSubmitting,
	isLoading,
}) => (
	<View style={styles.form}>
		{!verificationId ? (
			<>
				<TextInput
					style={styles.input}
					placeholder="10-Digit Phone Number"
					value={phoneNumber}
					onChangeText={setPhoneNumber}
					keyboardType="phone-pad"
					maxLength={10}
				/>
				<Button
					mode="contained"
					onPress={handleSendCode}
					disabled={isSubmitting}
					loading={isSubmitting}
					style={styles.button}
				>
					Send Code
				</Button>
			</>
		) : (
			<>
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
					disabled={isLoading || isSubmitting || verificationCode.length < 6}
					loading={isLoading || isSubmitting}
					style={styles.button}
				>
					Sign In
				</Button>
				<Button
					mode="text"
					onPress={() => {
						setVerificationId(null);
						setVerificationCode("");
					}}
				>
					Use a different number
				</Button>
			</>
		)}
	</View>
);

const emailValidationSchema = Yup.object().shape({
	email: Yup.string()
		.email("Please enter a valid email")
		.required("Email is required"),
	password: Yup.string().required("Password is required"),
});

const RestaurantLoginForm = ({ handleEmailLogin, isSubmitting, isLoading }) => (
	<Formik
		initialValues={{ email: "", password: "" }}
		validationSchema={emailValidationSchema}
		onSubmit={handleEmailLogin}
	>
		{({ handleChange, handleBlur, handleSubmit, values, errors, touched }) => (
			<View style={styles.form}>
				<TextInput
					style={styles.input}
					placeholder="Email Address"
					value={values.email}
					onChangeText={handleChange("email")}
					onBlur={handleBlur("email")}
					keyboardType="email-address"
					autoCapitalize="none"
				/>
				{touched.email && errors.email && (
					<Text style={styles.errorText}>{errors.email}</Text>
				)}
				<TextInput
					style={styles.input}
					placeholder="Password"
					value={values.password}
					onChangeText={handleChange("password")}
					onBlur={handleBlur("password")}
					secureTextEntry
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
					Sign In
				</Button>
			</View>
		)}
	</Formik>
);

const LoginScreen = ({ navigation }) => {
	const { login, isLoading, authError, signInWithPhoneCredential, auth } =
		useContext(AuthContext);
	const [activeTab, setActiveTab] = useState("customer"); // 'customer' or 'restaurant'
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [verificationId, setVerificationId] = useState(null);
	const [verificationCode, setVerificationCode] = useState("");
	const [phoneNumber, setPhoneNumber] = useState("");
	const recaptchaVerifier = useRef(null);

	// --- Handlers for Phone (Customer) Login ---
	const handleSendCode = async () => {
		if (!/^[0-9]{10}$/.test(phoneNumber)) {
			Alert.alert(
				"Invalid Number",
				"Please enter a valid 10-digit phone number."
			);
			return;
		}
		setIsSubmitting(true);
		try {
			const fullPhoneNumber = `+1${phoneNumber}`;
			const phoneProvider = new PhoneAuthProvider(auth);
			const verId = await phoneProvider.verifyPhoneNumber(
				fullPhoneNumber,
				recaptchaVerifier.current
			);
			setVerificationId(verId);
		} catch (error) {
			Alert.alert("Error", `Could not send code: ${error.message}`);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleConfirmCode = async () => {
		if (isLoading) return;
		setIsSubmitting(true);
		try {
			// Call the context function to handle the sign-in logic
			await signInWithPhoneCredential(verificationId, verificationCode);
			// Navigation is handled by the AuthContext
		} catch (error) {
			Alert.alert("Login Failed", `Could not verify code: ${error.message}`);
		} finally {
			setIsSubmitting(false);
		}
	};

	// --- Handler for Email (Restaurant) Login ---
	const handleEmailLogin = async (values) => {
		setIsSubmitting(true);
		try {
			await login(values.email, values.password);
		} catch (error) {
			// Error is set in context and displayed automatically
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<FirebaseRecaptchaVerifierModal
				ref={recaptchaVerifier}
				firebaseConfig={app.options}
				attemptInvisibleVerification={true}
			/>
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
						<Text style={styles.title}>Welcome Back</Text>
						<Text style={styles.subtitle}>Sign in to access your account</Text>
					</View>

					<View style={styles.tabContainer}>
						<TouchableOpacity
							style={[styles.tab, activeTab === "customer" && styles.activeTab]}
							onPress={() => setActiveTab("customer")}
						>
							<Text
								style={[
									styles.tabText,
									activeTab === "customer" && styles.activeTabText,
								]}
							>
								Customer
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
								Restaurant
							</Text>
						</TouchableOpacity>
					</View>

					{authError && <Text style={styles.errorText}>{authError}</Text>}

					{/* --- THIS IS THE FIX (PART 2) --- */}
					{/* We now render the standalone components and pass the state down as props. */}
					{activeTab === "customer" ? (
						<CustomerLoginForm
							verificationId={verificationId}
							setVerificationId={setVerificationId}
							phoneNumber={phoneNumber}
							setPhoneNumber={setPhoneNumber}
							handleSendCode={handleSendCode}
							verificationCode={verificationCode}
							setVerificationCode={setVerificationCode}
							handleConfirmCode={handleConfirmCode}
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

					<TouchableOpacity
						onPress={() => navigation.navigate("PasswordReset")}
					>
						<Text style={styles.linkText}>Forgot Password?</Text>
					</TouchableOpacity>

					<View style={styles.footer}>
						<Text style={styles.footerText}>Don't have an account?</Text>
						<TouchableOpacity
							onPress={() =>
								navigation.navigate(
									activeTab === "customer"
										? "CustomerSignup"
										: "RestaurantSignup"
								)
							}
						>
							<Text style={styles.linkTextFooter}> Sign Up</Text>
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
		marginTop: 15,
		marginBottom: 8,
	},
	subtitle: { fontSize: 16, color: colors.textMedium, textAlign: "center" },
	tabContainer: {
		flexDirection: "row",
		backgroundColor: colors.backgroundMedium,
		borderRadius: 25,
		padding: 5,
		marginBottom: 20,
	},
	tab: { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: "center" },
	activeTab: {
		backgroundColor: colors.surfaceWhite,
		elevation: 2,
		shadowColor: "#000",
		shadowOpacity: 0.1,
	},
	tabText: { fontSize: 16, fontWeight: "600", color: colors.textMedium },
	activeTabText: { color: colors.primary },
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
	linkText: {
		color: colors.primary,
		textAlign: "center",
		marginTop: 20,
		fontWeight: "600",
		fontSize: 15,
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
