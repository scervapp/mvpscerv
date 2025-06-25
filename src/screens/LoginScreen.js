// screens/LoginScreen.js
import React, { useState, useContext } from "react";
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
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";
import { AuthContext } from "../context/authContext";
import { Ionicons } from "@expo/vector-icons";
import colors from "../utils/styles/appStyles";

const LoginScreen = ({ navigation }) => {
	const { login, isLoading, authError } = useContext(AuthContext);

	// Local loading state for the button to provide instant feedback
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleLogin = async (values) => {
		setIsSubmitting(true);
		try {
			await login(values.email, values.password);
			// Navigation will be handled automatically by the main AppNavigator
			// which listens to the currentUserData state.
		} catch (error) {
			// The error is already set in the context and will be displayed by the authError state.
			console.log("Login failed on screen:", error.message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const validationSchema = Yup.object().shape({
		email: Yup.string()
			.email("Please enter a valid email")
			.required("Email is required"),
		password: Yup.string().required("Password is required"),
	});

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.container}>
				<View style={styles.header}>
					<Ionicons
						name="restaurant-outline"
						size={60}
						color={colors.primary}
					/>
					<Text style={styles.title}>Welcome Back</Text>
					<Text style={styles.subtitle}>Sign in to access your account</Text>
				</View>

				<Formik
					initialValues={{ email: "", password: "" }}
					validationSchema={validationSchema}
					onSubmit={handleLogin}
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
								placeholder="Email Address"
								value={values.email}
								onChangeText={handleChange("email")}
								onBlur={handleBlur("email")}
								keyboardType="email-address"
								autoCapitalize="none"
								placeholderTextColor={colors.textLight}
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
								placeholderTextColor={colors.textLight}
							/>
							{touched.password && errors.password && (
								<Text style={styles.errorText}>{errors.password}</Text>
							)}

							{authError && <Text style={styles.errorText}>{authError}</Text>}

							<TouchableOpacity
								style={[
									styles.button,
									(isLoading || isSubmitting) && styles.buttonDisabled,
								]}
								onPress={handleSubmit}
								disabled={isLoading || isSubmitting}
							>
								{isLoading || isSubmitting ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.buttonText}>Sign In</Text>
								)}
							</TouchableOpacity>
						</View>
					)}
				</Formik>

				<TouchableOpacity onPress={() => navigation.navigate("PasswordReset")}>
					<Text style={styles.linkText}>Forgot Password?</Text>
				</TouchableOpacity>

				<View style={styles.footer}>
					<Text style={styles.footerText}>Don't have a customer account?</Text>
					<TouchableOpacity
						onPress={() => navigation.navigate("CustomerSignup")}
					>
						<Text style={styles.linkTextFooter}> Sign Up</Text>
					</TouchableOpacity>
				</View>
				<View style={styles.footer}>
					<Text style={styles.footerText}>Are you a restaurant?</Text>
					<TouchableOpacity
						onPress={() => navigation.navigate("RestaurantSignup")}
					>
						<Text style={styles.linkTextFooter}> Sign Up Here</Text>
					</TouchableOpacity>
				</View>
				<TouchableOpacity
					onPress={() => navigation.goBack()}
					style={{ marginTop: 20 }}
				>
					<Text style={styles.linkText}>Back to Welcome</Text>
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flexGrow: 1, justifyContent: "center", padding: 25 },
	header: { alignItems: "center", marginBottom: 40 },
	title: {
		fontSize: 32,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginTop: 15,
		marginBottom: 8,
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
	button: {
		height: 55,
		backgroundColor: colors.primary,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 10,
	},
	buttonDisabled: { backgroundColor: colors.textLight },
	buttonText: { color: "white", fontSize: 18, fontWeight: "bold" },
	linkText: {
		color: colors.primary,
		textAlign: "center",
		marginTop: 20,
		fontWeight: "600",
		fontSize: 15,
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
		marginTop: 20,
	},
	footerText: { fontSize: 15, color: colors.textMedium },
	linkTextFooter: { color: colors.primary, fontSize: 15, fontWeight: "bold" },
});

export default LoginScreen;
