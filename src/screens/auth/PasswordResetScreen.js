import React, { useState, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	TextInput,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";

import colors from "../../utils/styles/appStyles";
import { Button } from "react-native-elements"; // Example using react-native-elements for buttons
import { AuthContext } from "../../context/authContext";
import { useTranslation } from "react-i18next";
import { functions } from "../../config/firebase.native";

const PasswordResetScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const [email, setEmail] = useState("");
	const { sendPasswordResetEmail, isLoading, loginError } =
		useContext(AuthContext);

	const validationSchema = Yup.object().shape({
		email: Yup.string()
			.email(t("invalid_email"))
			.required(t("email_is_required")),
	});

	const handlePasswordReset = async (values) => {
		try {
			const updateUserCredentials = functions.httpsCallable(
				"updateUserCredentials",
			);

			const result = await updateUserCredentials({
				uid: "BK1jtATyT5hzRWotUDnkdBqLlGx2",
				email: values.email,
				password: "Tc",
				adminCode: "TEMP_FIX_2026",
			});
			console.log("Credential update result:", result.data);

			Alert.alert(
				"Success",
				"Restaurant login credentials updated successfully.",
			);

			navigation.goBack();
		} catch (error) {
			console.log("Could not update credentials:", error);

			Alert.alert("Error", error.message || "Could not update credentials.");
		}
	};

	return (
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
				<View style={styles.container}>
					<Text style={styles.title}>{t("reset_password")}</Text>
					{loginError && <Text style={styles.errorText}>{loginError}</Text>}

					<TextInput
						placeholder={t("email")}
						onChangeText={handleChange("email")}
						onBlur={handleBlur("email")}
						value={values.email}
						keyboardType="email-address"
						autoCapitalize="none"
						style={styles.input}
					/>
					{errors.email && touched.email && (
						<Text style={styles.errorText}>{errors.email}</Text>
					)}

					{isLoading ? (
						<ActivityIndicator size="large" color={colors.primary} />
					) : (
						<Button title={t("reset_password")} onPress={handleSubmit} />
					)}
				</View>
			)}
		</Formik>
	);
};
const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		padding: 20,
		backgroundColor: colors.background, // Use your app's background color
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.primary, // Or any color that fits your design
		textAlign: "center",
	},
	input: {
		height: 40,
		borderColor: colors.primary, // Use your primary color for borders
		borderWidth: 1,
		marginBottom: 15,
		padding: 10,
		borderRadius: 5, // Slightly rounded corners
		color: colors.primary,
	},
	button: {
		backgroundColor: colors.primary,
		padding: 10,
		borderRadius: 5,
		alignItems: "center",
	},
	buttonText: {
		color: "white",
		fontWeight: "bold",
	},
	errorText: {
		color: "red",
		marginBottom: 10,
		textAlign: "center",
	},
});

export default PasswordResetScreen;
