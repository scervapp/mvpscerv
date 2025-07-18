// screens/auth/RestaurantSignupScreen.js
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
	KeyboardAvoidingView, // <<< Import KeyboardAvoidingView
	Platform,
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";
import { AuthContext } from "../../context/authContext"; // Adjust path
import { Button } from "react-native-paper";
import colors from "../../utils/styles/appStyles"; // Adjust path

const RestaurantSignupScreen = ({ navigation }) => {
	const { signup, isLoading, authError } = useContext(AuthContext);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSignupSubmit = async (values) => {
		if (isLoading) return;
		setIsSubmitting(true);
		try {
			await signup(values.email, values.password, "owner", {
				restaurantName: values.restaurantName,
				firstName: values.firstName,
				lastName: values.lastName,
				phoneNumber: values.phoneNumber,
				address: values.address,
				city: values.city,
				state: values.state,
				zipcode: values.zipcode,
			});
		} catch (error) {
			console.log("Restaurant signup failed on screen:", error.message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const validationSchema = Yup.object().shape({
		restaurantName: Yup.string().required("Restaurant name is required"),
		firstName: Yup.string().required("Owner's first name is required"),
		lastName: Yup.string().required("Owner's last name is required"),
		email: Yup.string()
			.email("Please enter a valid email")
			.required("Email is required"),
		phoneNumber: Yup.string()
			.matches(/^[0-9]{10}$/, "Must be a valid 10-digit phone number")
			.required("Phone number is required"),
		password: Yup.string()
			.min(6, "Password must be at least 6 characters")
			.required("Password is required"),
		address: Yup.string().required("Street address is required"),
		city: Yup.string().required("City is required"),
		state: Yup.string().required("State is required"),
		zipcode: Yup.string()
			.matches(/^[0-9]{5}$/, "Must be a valid 5-digit zip code")
			.required("Zip code is required"),
	});

	return (
		// --- THIS IS THE FIX for the keyboard ---
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			style={styles.keyboardAvoidingContainer}
		>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView contentContainerStyle={styles.container}>
					<View style={styles.header}>
						<Text style={styles.title}>Join as a Partner</Text>
						<Text style={styles.subtitle}>
							Create your restaurant's account
						</Text>
					</View>

					<Formik
						initialValues={{
							restaurantName: "",
							firstName: "",
							lastName: "",
							email: "",
							password: "",
							phoneNumber: "",
							address: "",
							city: "",
							state: "",
							zipcode: "",
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
									placeholder="Restaurant Name"
									placeholderTextColor={colors.textMedium}
									value={values.restaurantName}
									onChangeText={handleChange("restaurantName")}
									onBlur={handleBlur("restaurantName")}
								/>
								{touched.restaurantName && errors.restaurantName && (
									<Text style={styles.errorText}>{errors.restaurantName}</Text>
								)}

								<TextInput
									style={styles.input}
									placeholder="Owner's First Name"
									placeholderTextColor={colors.textMedium}
									value={values.firstName}
									onChangeText={handleChange("firstName")}
									onBlur={handleBlur("firstName")}
								/>
								{touched.firstName && errors.firstName && (
									<Text style={styles.errorText}>{errors.firstName}</Text>
								)}

								<TextInput
									style={styles.input}
									placeholder="Owner's Last Name"
									placeholderTextColor={colors.textMedium}
									value={values.lastName}
									onChangeText={handleChange("lastName")}
									onBlur={handleBlur("lastName")}
								/>
								{touched.lastName && errors.lastName && (
									<Text style={styles.errorText}>{errors.lastName}</Text>
								)}

								<TextInput
									style={styles.input}
									placeholder="Business Email"
									placeholderTextColor={colors.textMedium}
									value={values.email}
									onChangeText={handleChange("email")}
									keyboardType="email-address"
									autoCapitalize="none"
								/>
								{touched.email && errors.email && (
									<Text style={styles.errorText}>{errors.email}</Text>
								)}

								<TextInput
									style={styles.input}
									placeholder="Business Phone"
									placeholderTextColor={colors.textMedium}
									value={values.phoneNumber}
									onChangeText={handleChange("phoneNumber")}
									keyboardType="phone-pad"
									maxLength={10}
								/>
								{touched.phoneNumber && errors.phoneNumber && (
									<Text style={styles.errorText}>{errors.phoneNumber}</Text>
								)}

								<TextInput
									style={styles.input}
									placeholder="Password"
									placeholderTextColor={colors.textMedium}
									value={values.password}
									onChangeText={handleChange("password")}
									secureTextEntry
								/>
								{touched.password && errors.password && (
									<Text style={styles.errorText}>{errors.password}</Text>
								)}

								<TextInput
									style={styles.input}
									placeholder="Street Address"
									placeholderTextColor={colors.textMedium}
									value={values.address}
									onChangeText={handleChange("address")}
								/>
								{touched.address && errors.address && (
									<Text style={styles.errorText}>{errors.address}</Text>
								)}

								{/* --- ADDED MISSING FIELDS --- */}
								<View style={styles.row}>
									<View style={styles.cityInput}>
										<TextInput
											style={styles.input}
											placeholder="City"
											placeholderTextColor={colors.textMedium}
											value={values.city}
											onChangeText={handleChange("city")}
										/>
										{touched.city && errors.city && (
											<Text style={styles.errorText}>{errors.city}</Text>
										)}
									</View>
									<View style={styles.stateInput}>
										<TextInput
											style={styles.input}
											placeholder="State"
											placeholderTextColor={colors.textMedium}
											value={values.state}
											onChangeText={handleChange("state")}
											maxLength={2}
											autoCapitalize="characters"
										/>
										{touched.state && errors.state && (
											<Text style={styles.errorText}>{errors.state}</Text>
										)}
									</View>
								</View>

								<TextInput
									style={styles.input}
									placeholder="Zip Code"
									placeholderTextColor={colors.textMedium}
									value={values.zipcode}
									onChangeText={handleChange("zipcode")}
									keyboardType="number-pad"
									maxLength={5}
								/>
								{touched.zipcode && errors.zipcode && (
									<Text style={styles.errorText}>{errors.zipcode}</Text>
								)}
								{/* --- END ADDED FIELDS --- */}

								{authError && <Text style={styles.errorText}>{authError}</Text>}

								<Button
									mode="contained"
									onPress={handleSubmit}
									disabled={isLoading || isSubmitting}
									loading={isLoading || isSubmitting}
									style={styles.button}
									labelStyle={styles.buttonText}
								>
									Create Restaurant Account
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
		</KeyboardAvoidingView>
	);
};

const styles = StyleSheet.create({
	keyboardAvoidingContainer: { flex: 1 },
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
		fontSize: 16,
		backgroundColor: colors.surfaceWhite,
		
	},
	inputGroup: { marginBottom: 15 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 15,
	},
	cityInput: {
		flex: 0.6, // Takes up more space
		marginRight: 10,
	},
	stateInput: {
		flex: 0.35, // Takes up less space
	},
	button: { paddingVertical: 8, borderRadius: 8, marginTop: 10 },
	buttonText: { fontSize: 16, fontWeight: "bold" },
	errorText: {
		color: colors.statusDanger,
		marginTop: -5,
		marginBottom: 10,
		marginLeft: 5,
		fontSize: 13,
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

export default RestaurantSignupScreen;
