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
import { Picker } from "@react-native-picker/picker";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons"; // Ensure you have this installed

export const COUNTRY_OPTIONS = [
	["US", "United States"],
	["AF", "Afghanistan"],
	["AX", "Aland Islands"],
	["AL", "Albania"],
	["DZ", "Algeria"],
	["AS", "American Samoa"],
	["AD", "Andorra"],
	["AO", "Angola"],
	["AI", "Anguilla"],
	["AQ", "Antarctica"],
	["AG", "Antigua and Barbuda"],
	["AR", "Argentina"],
	["AM", "Armenia"],
	["AW", "Aruba"],
	["AU", "Australia"],
	["AT", "Austria"],
	["AZ", "Azerbaijan"],
	["BS", "Bahamas"],
	["BH", "Bahrain"],
	["BD", "Bangladesh"],
	["BB", "Barbados"],
	["BY", "Belarus"],
	["BE", "Belgium"],
	["BZ", "Belize"],
	["BJ", "Benin"],
	["BM", "Bermuda"],
	["BT", "Bhutan"],
	["BO", "Bolivia"],
	["BQ", "Bonaire, Sint Eustatius and Saba"],
	["BA", "Bosnia and Herzegovina"],
	["BW", "Botswana"],
	["BR", "Brazil"],
	["IO", "British Indian Ocean Territory"],
	["BN", "Brunei Darussalam"],
	["BG", "Bulgaria"],
	["BF", "Burkina Faso"],
	["BI", "Burundi"],
	["KH", "Cambodia"],
	["CM", "Cameroon"],
	["CA", "Canada"],
	["CV", "Cape Verde"],
	["KY", "Cayman Islands"],
	["CF", "Central African Republic"],
	["TD", "Chad"],
	["CL", "Chile"],
	["CN", "China"],
	["CX", "Christmas Island"],
	["CC", "Cocos Islands"],
	["CO", "Colombia"],
	["KM", "Comoros"],
	["CG", "Congo"],
	["CD", "Congo, Democratic Republic"],
	["CK", "Cook Islands"],
	["CR", "Costa Rica"],
	["CI", "Cote d'Ivoire"],
	["HR", "Croatia"],
	["CU", "Cuba"],
	["CW", "Curacao"],
	["CY", "Cyprus"],
	["CZ", "Czech Republic"],
	["DK", "Denmark"],
	["DJ", "Djibouti"],
	["DM", "Dominica"],
	["DO", "Dominican Republic"],
	["EC", "Ecuador"],
	["EG", "Egypt"],
	["SV", "El Salvador"],
	["GQ", "Equatorial Guinea"],
	["ER", "Eritrea"],
	["EE", "Estonia"],
	["SZ", "Eswatini"],
	["ET", "Ethiopia"],
	["FK", "Falkland Islands"],
	["FO", "Faroe Islands"],
	["FJ", "Fiji"],
	["FI", "Finland"],
	["FR", "France"],
	["GF", "French Guiana"],
	["PF", "French Polynesia"],
	["TF", "French Southern Territories"],
	["GA", "Gabon"],
	["GM", "Gambia"],
	["GE", "Georgia"],
	["DE", "Germany"],
	["GH", "Ghana"],
	["GI", "Gibraltar"],
	["GR", "Greece"],
	["GL", "Greenland"],
	["GD", "Grenada"],
	["GP", "Guadeloupe"],
	["GU", "Guam"],
	["GT", "Guatemala"],
	["GG", "Guernsey"],
	["GN", "Guinea"],
	["GW", "Guinea-Bissau"],
	["GY", "Guyana"],
	["HT", "Haiti"],
	["VA", "Holy See"],
	["HN", "Honduras"],
	["HK", "Hong Kong"],
	["HU", "Hungary"],
	["IS", "Iceland"],
	["IN", "India"],
	["ID", "Indonesia"],
	["IR", "Iran"],
	["IQ", "Iraq"],
	["IE", "Ireland"],
	["IM", "Isle of Man"],
	["IL", "Israel"],
	["IT", "Italy"],
	["JM", "Jamaica"],
	["JP", "Japan"],
	["JE", "Jersey"],
	["JO", "Jordan"],
	["KZ", "Kazakhstan"],
	["KE", "Kenya"],
	["KI", "Kiribati"],
	["KP", "Korea, North"],
	["KR", "Korea, South"],
	["KW", "Kuwait"],
	["KG", "Kyrgyzstan"],
	["LA", "Laos"],
	["LV", "Latvia"],
	["LB", "Lebanon"],
	["LS", "Lesotho"],
	["LR", "Liberia"],
	["LY", "Libya"],
	["LI", "Liechtenstein"],
	["LT", "Lithuania"],
	["LU", "Luxembourg"],
	["MO", "Macao"],
	["MG", "Madagascar"],
	["MW", "Malawi"],
	["MY", "Malaysia"],
	["MV", "Maldives"],
	["ML", "Mali"],
	["MT", "Malta"],
	["MH", "Marshall Islands"],
	["MQ", "Martinique"],
	["MR", "Mauritania"],
	["MU", "Mauritius"],
	["YT", "Mayotte"],
	["MX", "Mexico"],
	["FM", "Micronesia"],
	["MD", "Moldova"],
	["MC", "Monaco"],
	["MN", "Mongolia"],
	["ME", "Montenegro"],
	["MS", "Montserrat"],
	["MA", "Morocco"],
	["MZ", "Mozambique"],
	["MM", "Myanmar"],
	["NA", "Namibia"],
	["NR", "Nauru"],
	["NP", "Nepal"],
	["NL", "Netherlands"],
	["NC", "New Caledonia"],
	["NZ", "New Zealand"],
	["NI", "Nicaragua"],
	["NE", "Niger"],
	["NG", "Nigeria"],
	["NU", "Niue"],
	["NF", "Norfolk Island"],
	["MK", "North Macedonia"],
	["MP", "Northern Mariana Islands"],
	["NO", "Norway"],
	["OM", "Oman"],
	["PK", "Pakistan"],
	["PW", "Palau"],
	["PS", "Palestine"],
	["PA", "Panama"],
	["PG", "Papua New Guinea"],
	["PY", "Paraguay"],
	["PE", "Peru"],
	["PH", "Philippines"],
	["PN", "Pitcairn"],
	["PL", "Poland"],
	["PT", "Portugal"],
	["PR", "Puerto Rico"],
	["QA", "Qatar"],
	["RE", "Reunion"],
	["RO", "Romania"],
	["RU", "Russian Federation"],
	["RW", "Rwanda"],
	["BL", "Saint Barthelemy"],
	["SH", "Saint Helena"],
	["KN", "Saint Kitts and Nevis"],
	["LC", "Saint Lucia"],
	["MF", "Saint Martin"],
	["PM", "Saint Pierre and Miquelon"],
	["VC", "Saint Vincent and the Grenadines"],
	["WS", "Samoa"],
	["SM", "San Marino"],
	["ST", "Sao Tome and Principe"],
	["SA", "Saudi Arabia"],
	["SN", "Senegal"],
	["RS", "Serbia"],
	["SC", "Seychelles"],
	["SL", "Sierra Leone"],
	["SG", "Singapore"],
	["SX", "Sint Maarten"],
	["SK", "Slovakia"],
	["SI", "Slovenia"],
	["SB", "Solomon Islands"],
	["SO", "Somalia"],
	["ZA", "South Africa"],
	["GS", "South Georgia and Sandwich Islands"],
	["SS", "South Sudan"],
	["ES", "Spain"],
	["LK", "Sri Lanka"],
	["SD", "Sudan"],
	["SR", "Suriname"],
	["SJ", "Svalbard and Jan Mayen"],
	["SE", "Sweden"],
	["CH", "Switzerland"],
	["SY", "Syrian Arab Republic"],
	["TW", "Taiwan"],
	["TJ", "Tajikistan"],
	["TZ", "Tanzania"],
	["TH", "Thailand"],
	["TL", "Timor-Leste"],
	["TG", "Togo"],
	["TK", "Tokelau"],
	["TO", "Tonga"],
	["TT", "Trinidad and Tobago"],
	["TN", "Tunisia"],
	["TR", "Turkey"],
	["TM", "Turkmenistan"],
	["TC", "Turks and Caicos Islands"],
	["TV", "Tuvalu"],
	["UG", "Uganda"],
	["UA", "Ukraine"],
	["AE", "United Arab Emirates"],
	["GB", "United Kingdom"],
	["UM", "United States Minor Outlying Islands"],
	["UY", "Uruguay"],
	["UZ", "Uzbekistan"],
	["VU", "Vanuatu"],
	["VE", "Venezuela"],
	["VN", "Viet Nam"],
	["VG", "Virgin Islands, British"],
	["VI", "Virgin Islands, U.S."],
	["WF", "Wallis and Futuna"],
	["EH", "Western Sahara"],
	["YE", "Yemen"],
	["ZM", "Zambia"],
	["ZW", "Zimbabwe"],
].map(([code, label]) => ({ code, label }));

const getCountryOption = (countryCode) =>
	COUNTRY_OPTIONS.find((country) => country.code === countryCode) ||
	COUNTRY_OPTIONS[0];

const RestaurantSignupScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const { signup, isLoading, authError } = useContext(AuthContext);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const normalizePhoneNumber = (value) => {
		const cleaned = String(value || "")
			.trim()
			.replace(/[^\d+]/g, "");
		if (!cleaned) return "";
		return cleaned.startsWith("+")
			? `+${cleaned.replace(/[^\d]/g, "")}`
			: cleaned.replace(/[^\d]/g, "");
	};

	const handleSignupSubmit = async (values) => {
		if (isLoading) return;
		setIsSubmitting(true);
		try {
			const email = String(values.email || "").trim().toLowerCase();
			const selectedCountry = getCountryOption(values.countryCode);
			await signup(email, values.password, "owner", {
				restaurantName: values.restaurantName.trim(),
				firstName: values.firstName.trim(),
				lastName: values.lastName.trim(),
				phoneNumber: normalizePhoneNumber(values.phoneNumber),
				address: values.address.trim(),
				area: values.area.trim(),
				city: values.city.trim(),
				state: values.state.trim(),
				zipcode: values.zipcode.trim(),
				country: selectedCountry.label,
				countryCode: selectedCountry.code,
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
			.matches(/^\+?[0-9\s().-]{7,24}$/, t("must_be_a_valid_phone_number"))
			.required(t("phone_number_is_required")),
		password: Yup.string()
			.min(
				8,
				t(
					"password_must_be_at_least_8_characters",
					"Password must be at least 8 characters.",
				),
			)
			.required(t("password_is_required")),
		address: Yup.string().required(t("street_address_is_required")),
		area: Yup.string().max(
			80,
			t("area_must_be_short", "Area or neighborhood must be 80 characters or less."),
		),
		city: Yup.string().required(t("city_is_required")),
		state: Yup.string().required(t("state_is_required")),
		zipcode: Yup.string()
			.matches(/^[0-9a-zA-Z\s-]{2,20}$/, t("must_be_a_valid_zip_code"))
			.required(t("zip_code_is_required")),
		countryCode: Yup.string()
			.oneOf(
				COUNTRY_OPTIONS.map((country) => country.code),
				t("country_is_required", "Country is required."),
			)
			.required(t("country_is_required", "Country is required.")),
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
							{t(
								"restaurant_signup_subtitle",
								"Create your owner account. You can finish menu, staff, payments, and profile setup after sign in.",
							)}
						</Text>
					</View>

					<View style={styles.stepPanel}>
						<View style={styles.stepItem}>
							<Ionicons
								name="person-check-outline"
								size={18}
								color={colors.primary}
							/>
							<Text style={styles.stepText}>
								{t("owner_account_step", "Owner account")}
							</Text>
						</View>
						<View style={styles.stepItem}>
							<Ionicons
								name="storefront-outline"
								size={18}
								color={colors.primary}
							/>
							<Text style={styles.stepText}>
								{t("restaurant_profile_step", "Restaurant profile")}
							</Text>
						</View>
						<View style={styles.stepItem}>
							<Ionicons name="card-outline" size={18} color={colors.primary} />
							<Text style={styles.stepText}>
								{t("payments_later_step", "Payments later")}
							</Text>
						</View>
					</View>

					<Formik
						initialValues={{
							countryCode: "US",
							restaurantName: "",
							firstName: "",
							lastName: "",
							email: "",
							password: "",
							phoneNumber: "",
							address: "",
							area: "",
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
							setFieldValue,
						}) => (
							<View style={styles.form}>
								<View style={styles.pickerShell}>
									<Picker
										selectedValue={values.countryCode}
										onValueChange={(selectedCode) =>
											setFieldValue("countryCode", selectedCode)
										}
										style={styles.picker}
									>
										{COUNTRY_OPTIONS.map((country) => (
											<Picker.Item
												key={country.code}
												label={country.label}
												value={country.code}
											/>
										))}
									</Picker>
								</View>
								{touched.countryCode && errors.countryCode && (
									<Text style={styles.errorText}>{errors.countryCode}</Text>
								)}

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
									autoCorrect={false}
								/>
								{touched.email && errors.email && (
									<Text style={styles.errorText}>{errors.email}</Text>
								)}

								<View style={styles.phoneInputContainer}>
									<TextInput
										style={[styles.input, styles.phoneInput]}
										placeholder={t(
											"business_phone_international",
											"Business phone, including country code",
										)}
										placeholderTextColor={colors.textMedium}
										value={values.phoneNumber}
										onChangeText={handleChange("phoneNumber")}
										keyboardType="phone-pad"
										maxLength={24}
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
									autoCapitalize="none"
									autoCorrect={false}
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

								<TextInput
									style={styles.input}
									placeholder={t(
										"area_neighborhood_optional",
										"Area or neighborhood, optional",
									)}
									placeholderTextColor={colors.textMedium}
									value={values.area}
									onChangeText={handleChange("area")}
								/>
								{touched.area && errors.area && (
									<Text style={styles.errorText}>{errors.area}</Text>
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
											placeholder={t(
												"state_region_province",
												"State, region, or province",
											)}
											placeholderTextColor={colors.textMedium}
											value={values.state}
											onChangeText={handleChange("state")}
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
									keyboardType="default"
								/>
								{touched.zipcode && errors.zipcode && (
									<Text style={styles.errorText}>{errors.zipcode}</Text>
								)}

								{authError && <Text style={styles.errorText}>{authError}</Text>}
								<Text style={styles.securityNote}>
									{t(
										"restaurant_signup_security_note",
										"We will send setup guidance to this email. Use an address your owner team controls.",
									)}
								</Text>

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
	stepPanel: {
		flexDirection: "row",
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		padding: 10,
		marginBottom: 18,
		gap: 8,
	},
	stepItem: {
		flex: 1,
		alignItems: "center",
		gap: 5,
	},
	stepText: {
		fontSize: 11,
		fontWeight: "800",
		color: colors.textDark,
		textAlign: "center",
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
		marginBottom: 8,
	},
	pickerShell: {
		height: 55,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		marginBottom: 8,
		justifyContent: "center",
		overflow: "hidden",
	},
	picker: {
		color: colors.textDark,
		backgroundColor: colors.surfaceWhite,
	},

	// Phone Input Styles
	phoneInputContainer: { flexDirection: "row", marginBottom: 8 },
	phoneInput: {
		flex: 1,
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
	securityNote: {
		fontSize: 12,
		fontWeight: "600",
		color: colors.textMedium,
		lineHeight: 17,
		marginTop: 2,
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
