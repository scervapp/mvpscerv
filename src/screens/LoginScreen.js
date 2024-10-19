import React, { useState, useContext, useEffect } from "react";
import {
	View,
	TextInput,
	StyleSheet,
	Button,
	Text,
	ActivityIndicator,
	TouchableOpacity,
	Platform,
	KeyboardAvoidingView,
} from "react-native";
import colors from "../utils/styles/appStyles";
import { AuthContext } from "../context/authContext";
import { Formik } from "formik";
import * as Yup from "yup";

const Login = ({ navigation }) => {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	const { login, isLoading, loginError } = useContext(AuthContext);

	const validationSchema = Yup.object().shape({
		email: Yup.string().email("Invalid email").required("Email is required"),
		password: Yup.string()
			.min(6, "Password must be at least 6 characters")
			.required("Password is required"),
	});

	const handleSimpleLogin = async (values) => {
		await login(values.email, values.password, navigation);
	};

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			style={styles.container}
		>
			<Formik
				initialValues={{ email: "", password: "" }}
				validationSchema={validationSchema}
				onSubmit={handleSimpleLogin}
			>
				{({
					handleChange,
					handleBlur,
					handleSubmit,
					values,
					errors,
					touched,
				}) => (
					<View style={styles.innerContainer}>
						<View style={styles.header}>
							<Text style={styles.headerText}>Login to Scerv</Text>
						</View>
						<View style={styles.form}>
							<View style={styles.inputGroup}>
								<Text style={styles.label}>Email</Text>
								<TextInput
									style={styles.input}
									value={values.email}
									onChangeText={handleChange("email")}
									onBlur={handleBlur("email")}
									autoCapitalize="none"
								/>
							</View>
							{errors.email && touched.email && (
								<Text style={styles.errorText}>{errors.email}</Text>
							)}
							<View style={styles.inputGroup}>
								<Text style={styles.label}>Password</Text>

								<TextInput
									style={styles.input}
									value={values.password}
									onChangeText={handleChange("password")}
									secureTextEntry={true}
									onBlur={handleBlur("password")}
									textContentType={"password"}
								/>
							</View>
							{errors.password && touched.password && (
								<Text style={styles.errorText}>{errors.password}</Text>
							)}
							{isLoading && <ActivityIndicator size="large" />}
							{(errors.general || loginError) && (
								<Text style={styles.errorText}>
									{errors.general || loginError}
								</Text>
							)}
							<TouchableOpacity
								style={styles.loginButton}
								onPress={handleSubmit}
								disabled={isLoading}
							>
								<Text style={styles.loginButtonText}>Login</Text>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={() => navigation.navigate("PasswordReset")}
							>
								<Text style={styles.forgotPasswordLink}>Forgot Password?</Text>
							</TouchableOpacity>
						</View>
					</View>
				)}
			</Formik>
		</KeyboardAvoidingView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
		padding: 30,
		justifyContent: "center",
	},
	innerContainer: {
		width: "100%",
		alignItems: "center",
	},
	header: {
		marginBottom: 40,
		alignItems: "center",
	},
	headerText: {
		fontSize: 28, // Increased font size
		fontWeight: "bold",
		color: colors.primary,
	},
	form: {
		width: "100%",
	},
	inputGroup: {
		marginBottom: 20,
	},
	label: {
		fontSize: 16,
		color: colors.text, // Use a general text color
		marginBottom: 8, // Increased margin
	},
	input: {
		borderWidth: 1,
		borderColor: colors.lightGray,
		borderRadius: 12, // Increased border radius
		padding: 14, // Increased padding
		backgroundColor: colors.inputBackground,
		width: "100%",
		fontSize: 16,
		shadowColor: "#000", // Add shadow for a lifted effect (iOS)
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3, // Add shadow for a lifted effect (Android)
	},
	loginButton: {
		backgroundColor: colors.primary,
		padding: 16, // Increased padding
		borderRadius: 12, // Increased border radius
		alignItems: "center",
		marginTop: 30, // Increased margin
		width: "100%",
	},
	loginButtonText: {
		color: "white",
		fontSize: 18,
		fontWeight: "bold",
	},
	forgotPasswordLink: {
		color: colors.primary,
		marginTop: 15, // Increased margin
		textAlign: "center",
		fontSize: 16,
	},
	errorText: {
		color: "red", // Use an error color from your colors object
		marginBottom: 10,
		textAlign: "center",
	},
});

export default Login;
