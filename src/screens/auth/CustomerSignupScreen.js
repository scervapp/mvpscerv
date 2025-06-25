// screens/auth/CustomerSignupScreen.js
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
import { AuthContext } from "../../context/authContext";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "react-native-paper";
import colors from "../../utils/styles/appStyles";

const CustomerSignupScreen = ({ navigation }) => {
	const { signup, isLoading, authError } = useContext(AuthContext);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSignupSubmit = async (values) => {
		if (isLoading) return;
		setIsSubmitting(true);
		try {
			// Call the unified signup function from the context
			await signup(
				values.email,
				values.password,
				"customer", // Explicitly set the role
				{
					firstName: values.firstName,
					lastName: values.lastName,
					phoneNumber: values.phoneNumber,
				}
			);
			// Navigation is now handled automatically by the AppNavigator
			// when the currentUserData state changes.
		} catch (error) {
			// The error is already set in the context and will be displayed by the authError state.
			console.log("Signup failed on screen:", error.message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const validationSchema = Yup.object().shape({
		firstName: Yup.string().required("First name is required"),
		lastName: Yup.string().required("Last name is required"),
		email: Yup.string()
			.email("Please enter a valid email")
			.required("Email is required"),
		phoneNumber: Yup.string()
			.matches(/^[0-9]{10}$/, "Must be a valid 10-digit phone number")
			.required("Phone number is required"),
		password: Yup.string()
			.min(6, "Password must be at least 6 characters")
			.required("Password is required"),
	});

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.container}>
				<View style={styles.header}>
					<Text style={styles.title}>Create Your Account</Text>
					<Text style={styles.subtitle}>
						Join Scerv to start dining smarter.
					</Text>
				</View>

				<Formik
					initialValues={{
						email: "",
						password: "",
						firstName: "",
						lastName: "",
						phoneNumber: "",
					}}
					validationSchema={validationSchema}
					onSubmit={handleSignupSubmit}
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
								onBlur={handleBlur("firstName")}
								placeholderTextColor={colors.textLight}
							/>
							{touched.firstName && errors.firstName && (
								<Text style={styles.errorText}>{errors.firstName}</Text>
							)}

							<TextInput
								style={styles.input}
								placeholder="Last Name"
								value={values.lastName}
								onChangeText={handleChange("lastName")}
								onBlur={handleBlur("lastName")}
								placeholderTextColor={colors.textLight}
							/>
							{touched.lastName && errors.lastName && (
								<Text style={styles.errorText}>{errors.lastName}</Text>
							)}

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
								placeholder="Phone Number"
								value={values.phoneNumber}
								onChangeText={handleChange("phoneNumber")}
								onBlur={handleBlur("phoneNumber")}
								keyboardType="phone-pad"
								maxLength={10}
								placeholderTextColor={colors.textLight}
							/>
							{touched.phoneNumber && errors.phoneNumber && (
								<Text style={styles.errorText}>{errors.phoneNumber}</Text>
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

							<Button
								mode="contained"
								onPress={handleSubmit}
								disabled={isLoading || isSubmitting}
								loading={isLoading || isSubmitting}
								style={styles.button}
								labelStyle={styles.buttonText}
							>
								Sign Up
							</Button>
						</View>
					)}
				</Formik>

				<View style={styles.footer}>
					<Text style={styles.footerText}>Already have an account?</Text>
					<TouchableOpacity onPress={() => navigation.navigate("Login")}>
						<Text style={styles.linkTextFooter}> Log In</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>
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
	buttonText: { fontSize: 16, fontWeight: "bold" },
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
		marginTop: 30,
	},
	footerText: { fontSize: 15, color: colors.textMedium },
	linkTextFooter: { color: colors.primary, fontSize: 15, fontWeight: "bold" },
});

export default CustomerSignupScreen;
