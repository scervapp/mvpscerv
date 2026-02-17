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
	KeyboardAvoidingView,
	Platform,
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";
import { AuthContext } from "../../context/authContext";
import { Button } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons"; // Ensure you have this installed

const RestaurantSignupScreen = ({ navigation }) => {
	const { t } = useTranslation();
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
				country: values.country, // Pass the selected country
			});
		} catch (error) {
			console.log("Restaurant signup failed on screen:", error.message);
		} finally {
			setIsSubmitting(false);
		}
	};

	// --- UPDATED VALIDATION SCHEMA ---
	const validationSchema = Yup.object().shape({
		restaurantName: Yup.string().required(t("restaurant_name_is_required")),
		firstName: Yup.string().required(t("owners_first_name_is_required")),
		lastName: Yup.string().required(t("owners_last_name_is_required")),
		email: Yup.string()
			.email(t("please_enter_a_valid_email"))
			.required(t("email_is_required")),
		phoneNumber: Yup.string()
			// Updated: Accepts 7 to 15 digits to cover US (10) and Panama (7-8)
			.matches(/^[0-9]{7,15}$/, t("must_be_a_valid_phone_number"))
			.required(t("phone_number_is_required")),
		password: Yup.string()
			.min(6, t("password_must_be_at_least_6_characters"))
			.required(t("password_is_required")),
		address: Yup.string().required(t("street_address_is_required")),
		city: Yup.string().required(t("city_is_required")),
		// Updated: Removed length restriction for international provinces
		state: Yup.string().required(t("state_is_required")),
		// Updated: Allows alphanumeric for international postal codes
		zipcode: Yup.string()
			.matches(/^[0-9a-zA-Z\s-]{3,10}$/, t("must_be_a_valid_zip_code"))
			.required(t("zip_code_is_required")),
		country: Yup.string().required(),
	});

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			style={styles.keyboardAvoidingContainer}
		>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView contentContainerStyle={styles.container}>
					<View style={styles.header}>
						<Text style={styles.title}>{t("join_as_a_partner")}</Text>
						<Text style={styles.subtitle}>
							{t("create_your_restaurants_account")}
						</Text>
					</View>

					<Formik
						initialValues={{
							country: "US", // Default to US
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
							setFieldValue, // Needed for custom country toggle
							values,
							errors,
							touched,
						}) => (
							<View style={styles.form}>
								{/* --- NEW: COUNTRY SELECTOR --- */}
								<View style={styles.countrySelectorContainer}>
									<Text style={styles.label}>{t("country")}</Text>
									<View style={styles.countryToggleWrapper}>
										<TouchableOpacity
											style={[
												styles.countryButton,
												values.country === "US" && styles.countryButtonActive,
											]}
											onPress={() => setFieldValue("country", "US")}
										>
											<Text
												style={[
													styles.countryText,
													values.country === "US" && styles.countryTextActive,
												]}
											>
												🇺🇸 United States
											</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={[
												styles.countryButton,
												values.country === "PA" && styles.countryButtonActive,
											]}
											onPress={() => setFieldValue("country", "PA")}
										>
											<Text
												style={[
													styles.countryText,
													values.country === "PA" && styles.countryTextActive,
												]}
											>
												🇵🇦 Panamá
											</Text>
										</TouchableOpacity>
									</View>
								</View>

								<TextInput
									style={styles.input}
									placeholder={t("restaurant_name")}
									placeholderTextColor={colors.textMedium}
									value={values.restaurantName}
									onChangeText={handleChange("restaurantName")}
									onBlur={handleBlur("restaurantName")}
								/>
								{touched.restaurantName && errors.restaurantName && (
									<Text style={styles.errorText}>{errors.restaurantName}</Text>
								)}

								<View style={styles.row}>
									<View style={styles.halfInput}>
										<TextInput
											style={styles.input}
											placeholder={t("owners_first_name")}
											placeholderTextColor={colors.textMedium}
											value={values.firstName}
											onChangeText={handleChange("firstName")}
											onBlur={handleBlur("firstName")}
										/>
										{touched.firstName && errors.firstName && (
											<Text style={styles.errorText}>{errors.firstName}</Text>
										)}
									</View>
									<View style={styles.halfInput}>
										<TextInput
											style={styles.input}
											placeholder={t("owners_last_name")}
											placeholderTextColor={colors.textMedium}
											value={values.lastName}
											onChangeText={handleChange("lastName")}
											onBlur={handleBlur("lastName")}
										/>
										{touched.lastName && errors.lastName && (
											<Text style={styles.errorText}>{errors.lastName}</Text>
										)}
									</View>
								</View>

								<TextInput
									style={styles.input}
									placeholder={t("business_email")}
									placeholderTextColor={colors.textMedium}
									value={values.email}
									onChangeText={handleChange("email")}
									keyboardType="email-address"
									autoCapitalize="none"
								/>
								{touched.email && errors.email && (
									<Text style={styles.errorText}>{errors.email}</Text>
								)}

								<View style={styles.phoneInputContainer}>
									{/* Show Country Code Prefix */}
									<View style={styles.countryCodeBadge}>
										<Text style={styles.countryCodeText}>
											{values.country === "US" ? "+1" : "+507"}
										</Text>
									</View>
									<TextInput
										style={[styles.input, styles.phoneInput]}
										placeholder={t("business_phone")}
										placeholderTextColor={colors.textMedium}
										value={values.phoneNumber}
										onChangeText={handleChange("phoneNumber")}
										keyboardType="phone-pad"
										maxLength={15} // Increased length
									/>
								</View>
								{touched.phoneNumber && errors.phoneNumber && (
									<Text style={styles.errorText}>{errors.phoneNumber}</Text>
								)}

								<TextInput
									style={styles.input}
									placeholder={t("password")}
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
									placeholder={t("street_address")}
									placeholderTextColor={colors.textMedium}
									value={values.address}
									onChangeText={handleChange("address")}
								/>
								{touched.address && errors.address && (
									<Text style={styles.errorText}>{errors.address}</Text>
								)}

								<View style={styles.row}>
									<View style={styles.cityInput}>
										<TextInput
											style={styles.input}
											placeholder={t("city")}
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
											// Dynamic Placeholder
											placeholder={
												values.country === "US" ? "State (FL)" : "Provincia"
											}
											placeholderTextColor={colors.textMedium}
											value={values.state}
											onChangeText={handleChange("state")}
											// Removed maxLength={2} to allow Panama Provinces
											autoCapitalize="words"
										/>
										{touched.state && errors.state && (
											<Text style={styles.errorText}>{errors.state}</Text>
										)}
									</View>
								</View>

								<TextInput
									style={styles.input}
									placeholder={t("zip_code")}
									placeholderTextColor={colors.textMedium}
									value={values.zipcode}
									onChangeText={handleChange("zipcode")}
									// Default numeric, but allow normal if needed
									keyboardType="default"
								/>
								{touched.zipcode && errors.zipcode && (
									<Text style={styles.errorText}>{errors.zipcode}</Text>
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
									{t("create_restaurant_account")}
								</Button>
							</View>
						)}
					</Formik>

					<View style={styles.footer}>
						<Text style={styles.footerText}>
							{t("already_have_an_account")}
						</Text>
						<TouchableOpacity onPress={() => navigation.navigate("Login")}>
							<Text style={styles.linkTextFooter}>{t("log_in")}</Text>
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
	header: { alignItems: "center", marginBottom: 20 },
	title: {
		fontSize: 32,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: { fontSize: 16, color: colors.textMedium, textAlign: "center" },
	form: { width: "100%" },

	// Country Selector Styles
	countrySelectorContainer: { marginBottom: 15 },
	label: { marginBottom: 8, fontWeight: "600", color: colors.textDark },
	countryToggleWrapper: {
		flexDirection: "row",
		justifyContent: "space-between",
	},
	countryButton: {
		flex: 0.48,
		paddingVertical: 10,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		alignItems: "center",
	},
	countryButtonActive: {
		borderColor: colors.primary,
		backgroundColor: colors.primary + "15", // Light opacity primary
	},
	countryText: { fontSize: 14, color: colors.textMedium },
	countryTextActive: { fontWeight: "bold", color: colors.primary },

	input: {
		height: 55,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		fontSize: 16,
		backgroundColor: colors.surfaceWhite,
		color: colors.textDark,
		marginBottom: 8,
	},

	// Phone Input Styles
	phoneInputContainer: { flexDirection: "row", marginBottom: 8 },
	countryCodeBadge: {
		width: 60,
		height: 55,
		backgroundColor: "#eee",
		borderTopLeftRadius: 8,
		borderBottomLeftRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRightWidth: 0,
		justifyContent: "center",
		alignItems: "center",
	},
	countryCodeText: { fontSize: 16, fontWeight: "bold", color: "#555" },
	phoneInput: {
		flex: 1,
		borderTopLeftRadius: 0,
		borderBottomLeftRadius: 0,
	},

	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 8, // Reduced margin since individual inputs have margin
	},
	halfInput: {
		flex: 0.48,
	},
	cityInput: {
		flex: 0.6,
		marginRight: 10,
	},
	stateInput: {
		flex: 0.35,
	},
	button: { paddingVertical: 8, borderRadius: 8, marginTop: 15 },
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
		marginBottom: 20,
	},
	footerText: { fontSize: 15, color: colors.textMedium },
	linkTextFooter: { color: colors.primary, fontSize: 15, fontWeight: "bold" },
});

export default RestaurantSignupScreen;
