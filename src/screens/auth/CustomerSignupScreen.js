// screens/auth/CustomerSignupScreen.js
import React, { useState, useContext, useEffect } from "react";
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
	Modal, // 🚨 Added Modal
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";
import { AuthContext } from "../../context/authContext";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons"; // 🚨 Added for modal checkmarks
import colors from "../../utils/styles/appStyles";
import { auth, db } from "../../config/firebase.native"; // 🚨 Added db for Kill Switch
import { useTranslation } from "react-i18next";

// 🚨 Defined supported countries with flags
const SUPPORTED_COUNTRIES = [
	{
		code: "+507",
		name: "Panama",
		flag: "🇵🇦",
		placeholder: "12345678",
		maxLength: 8,
	},
	{
		code: "+1",
		name: "United States",
		flag: "🇺🇸",
		placeholder: "1234567890",
		maxLength: 10,
	},
];

const CustomerSignupScreen = ({ navigation }) => {
	const { t } = useTranslation();

	// 🚨 Pulled bypassPhoneAuth from context
	const { signInWithPhoneCredential, bypassPhoneAuth, isLoading } =
		useContext(AuthContext);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [confirmation, setConfirmation] = useState(null);
	const [verificationCode, setVerificationCode] = useState("");
	const [formValues, setFormValues] = useState(null);
	const [codeError, setCodeError] = useState("");

	const [countryCode, setCountryCode] = useState("+507");
	const [isPickerVisible, setPickerVisible] = useState(false); // 🚨 Modal State
	const [useBypassMode, setUseBypassMode] = useState(true); // 🚨 Kill Switch State

	const selectedCountry = SUPPORTED_COUNTRIES.find(
		(c) => c.code === countryCode,
	);

	// 🚨 Kill Switch Listener
	useEffect(() => {
		const unsubscribe = db
			.collection("bypass")
			.doc("config")
			.onSnapshot((doc) => {
				if (doc.exists) {
					setUseBypassMode(doc.data().smsBypassEnabled === true);
				}
			});
		return () => unsubscribe();
	}, []);

	const validationSchema = Yup.object().shape({
		phoneNumber: Yup.string()
			.test("phone-length", t("invalid_phone_number_length"), function (value) {
				if (!value) return false;
				if (countryCode === "+507") return value.length === 8;
				if (countryCode === "+1") return value.length === 10;
				return false;
			})
			.required(t("phone_number_is_required")),
	});

	const handleSendVerificationCode = async (values) => {
		setIsSubmitting(true);
		try {
			const cleanedNumber = values.phoneNumber.replace(/\D/g, "");
			const fullPhoneNumber = `${countryCode}${cleanedNumber}`;

			// 🚨 Remote Bypass Logic
			if (useBypassMode) {
				const cleanedNumber = values.phoneNumber.replace(/\D/g, "");
				const fullPhoneNumber = `${countryCode}${cleanedNumber}`;

				// Pass the number here so the context has it!
				await bypassPhoneAuth(fullPhoneNumber);
				return;
			}

			// Real SMS Flow
			const confirmationResult =
				await auth.signInWithPhoneNumber(fullPhoneNumber);
			setFormValues({ ...values, phoneNumber: cleanedNumber });
			setConfirmation(confirmationResult);
		} catch (error) {
			console.error("[DEBUG] Error sending code:", error);
			Alert.alert(
				t("error"),
				t(
					"could_not_send_verification_code_please_check_the_console_for_details_code",
					{ code: error.code },
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleConfirmCode = async () => {
		if (isLoading || !confirmation) return;

		if (!verificationCode || verificationCode.trim().length !== 6) {
			setCodeError(t("please_enter_a_valid_6_digit_code"));
			return;
		}

		setCodeError("");
		setIsSubmitting(true);

		try {
			await signInWithPhoneCredential(
				confirmation,
				verificationCode,
				formValues,
			);
		} catch (error) {
			console.error("Verification failed:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={styles.keyboardAvoidingContainer}
			>
				<ScrollView contentContainerStyle={styles.scrollContentContainer}>
					<View style={styles.header}>
						<Text style={styles.title}>
							{!confirmation
								? t("create_your_account")
								: t("verify_your_phone")}
						</Text>
						<Text style={styles.subtitle}>
							{!confirmation
								? t("enter_your_phone_number_to_begin")
								: t("enter_the_6_digit_code_sent_to_1", {
										phoneNumber: formValues?.phoneNumber,
									})}
						</Text>
					</View>

					{!confirmation ? (
						<Formik
							initialValues={{ phoneNumber: "" }}
							validationSchema={validationSchema}
							onSubmit={handleSendVerificationCode}
						>
							{({ handleChange, handleSubmit, values, errors, touched }) => (
								<View style={styles.form}>
									<View style={styles.phoneInputContainer}>
										{/* 🚨 Opens the Modal */}
										<TouchableOpacity
											style={styles.countryCodeSelector}
											onPress={() => setPickerVisible(true)}
										>
											<Text style={styles.countryCodeText}>
												{selectedCountry.flag} {selectedCountry.code}
											</Text>
											<Text style={styles.dropdownArrow}> ▾</Text>
										</TouchableOpacity>

										<TextInput
											style={[styles.input, styles.phoneInputFlex]}
											placeholder={selectedCountry.placeholder}
											placeholderTextColor={colors.textMedium}
											value={values.phoneNumber}
											onChangeText={handleChange("phoneNumber")}
											keyboardType="phone-pad"
											maxLength={selectedCountry.maxLength}
										/>
									</View>

									{touched.phoneNumber && errors.phoneNumber && (
										<Text style={styles.errorText}>{errors.phoneNumber}</Text>
									)}

									<Button
										mode="contained"
										onPress={handleSubmit}
										disabled={isSubmitting || isLoading}
										loading={isSubmitting || isLoading}
										style={styles.button}
									>
										{/* 🚨 Dynamic Button Text */}
										{useBypassMode
											? t("Continue")
											: t("send_verification_code")}
									</Button>

									{/* 🚨 THE CLEAR SELECTION MODAL */}
									<Modal
										visible={isPickerVisible}
										transparent={true}
										animationType="slide"
										onRequestClose={() => setPickerVisible(false)}
									>
										<TouchableOpacity
											style={styles.modalOverlay}
											activeOpacity={1}
											onPress={() => setPickerVisible(false)}
										>
											<View style={styles.modalContent}>
												<Text style={styles.modalTitle}>Select Country</Text>

												{SUPPORTED_COUNTRIES.map((item) => (
													<TouchableOpacity
														key={item.code}
														style={styles.modalOption}
														onPress={() => {
															setCountryCode(item.code);
															handleChange("phoneNumber")(""); // Clear input when switching
															setPickerVisible(false);
														}}
													>
														<Text style={styles.modalOptionText}>
															{item.flag} {item.name} ({item.code})
														</Text>
														{countryCode === item.code && (
															<Ionicons
																name="checkmark"
																size={24}
																color={colors.primary}
															/>
														)}
													</TouchableOpacity>
												))}
											</View>
										</TouchableOpacity>
									</Modal>
								</View>
							)}
						</Formik>
					) : (
						<View style={styles.form}>
							<TextInput
								style={[styles.input, codeError && styles.inputError]}
								placeholder={t("6_digit_code")}
								value={verificationCode}
								onChangeText={(text) => {
									setVerificationCode(text);
									if (codeError) setCodeError("");
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
								{t("verify_and_continue")}
							</Button>

							<Button
								mode="text"
								onPress={() => setConfirmation(null)}
								disabled={isSubmitting}
							>
								{t("use_a_different_number")}
							</Button>
						</View>
					)}

					<View style={styles.footer}>
						<Text style={styles.footerText}>
							{t("already_have_an_account")}
						</Text>
						<TouchableOpacity onPress={() => navigation.navigate("Login")}>
							<Text style={styles.linkTextFooter}> {t("log_in")}</Text>
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

	phoneInputContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 15,
	},
	countryCodeSelector: {
		height: 55,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 15,
		marginRight: 10,
	},
	countryCodeText: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
	},
	dropdownArrow: {
		fontSize: 18,
		color: colors.textMedium,
		marginLeft: 4,
		marginTop: -2,
	},
	phoneInputFlex: {
		flex: 1,
		marginBottom: 0,
	},

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

	// 🚨 MODAL STYLES ADDED
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "flex-end",
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		padding: 25,
		paddingBottom: Platform.OS === "ios" ? 40 : 25,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 20,
		textAlign: "center",
	},
	modalOption: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	modalOptionText: {
		fontSize: 18,
		color: colors.textDark,
	},
});

export default CustomerSignupScreen;
