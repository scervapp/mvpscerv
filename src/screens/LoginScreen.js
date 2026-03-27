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
import { AuthContext } from "../context/authContext";
import { Ionicons } from "@expo/vector-icons";
import colors from "../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { Button } from "react-native-paper";
import { auth, db } from "../config/firebase";

// 🚨 Define our supported countries with flags
const SUPPORTED_COUNTRIES = [
    { code: "+507", name: "Panama", flag: "🇵🇦", placeholder: "12345678", maxLength: 8 },
    { code: "+1", name: "United States", flag: "🇺🇸", placeholder: "1234567890", maxLength: 10 },
];

const CustomerLoginForm = ({
    confirmation,
    setConfirmation,
    phoneNumber,
    setPhoneNumber,
    handleSendCode,
    verificationCode,
    setVerificationCode,
    handleConfirmCode,
    isSubmitting,
    isLoading,
    countryCode,
    setCountryCode,
    useBypassMode,
}) => {
    const { t } = useTranslation();
    
    // 🚨 NEW: State to control the dropdown modal
    const [isPickerVisible, setPickerVisible] = useState(false);

    // Find the currently selected country object to grab its flag and placeholder
    const selectedCountry = SUPPORTED_COUNTRIES.find(c => c.code === countryCode);

    return (
        <View style={styles.form}>
            {!confirmation ? (
                <>
                    <View style={styles.phoneInputContainer}>
                        {/* 🚨 Tapping this now opens the Modal */}
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
                            placeholderTextColor={colors.textLight}
                            value={phoneNumber}
                            onChangeText={setPhoneNumber}
                            keyboardType="phone-pad"
                            maxLength={selectedCountry.maxLength}
                        />
                    </View>

                    <Button
                        mode="contained"
                        onPress={handleSendCode}
                        disabled={isSubmitting}
                        loading={isSubmitting}
                        style={styles.button}
                    >
                        {useBypassMode ? t("Continue") : t("send_code")}
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
                                            setPhoneNumber(""); // Reset number when switching formats
                                            setPickerVisible(false);
                                        }}
                                    >
                                        <Text style={styles.modalOptionText}>
                                            {item.flag} {item.name} ({item.code})
                                        </Text>
                                        {countryCode === item.code && (
                                            <Ionicons name="checkmark" size={24} color={colors.primary} />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </TouchableOpacity>
                    </Modal>
                </>
            ) : (
                <>
                    <TextInput
                        style={styles.input}
                        placeholder={t("6_digit_code")}
                        placeholderTextColor={colors.textLight}
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
                        {t("sign_in")}
                    </Button>
                    <Button
                        mode="text"
                        onPress={() => {
                            setConfirmation(null);
                            setVerificationCode("");
                        }}
                    >
                        {t("use_a_different_number")}
                    </Button>
                </>
            )}
        </View>
    );
};

const RestaurantLoginForm = ({ handleEmailLogin, isSubmitting, isLoading }) => {
    const { t } = useTranslation();

    const emailValidationSchema = Yup.object().shape({
        email: Yup.string()
            .email(t("validation.invalid_email"))
            .required(t("validation.email_required")),
        password: Yup.string().required(t("validation.password_required")),
    });
    return (
        <Formik
            initialValues={{ email: "", password: "" }}
            validationSchema={emailValidationSchema}
            onSubmit={handleEmailLogin}
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
                        placeholder={t("email_address_placeholder")}
                        value={values.email}
                        onChangeText={handleChange("email")}
                        onBlur={handleBlur("email")}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholderTextColor={colors.textMedium}
                    />
                    {touched.email && errors.email && (
                        <Text style={styles.errorText}>{errors.email}</Text>
                    )}
                    <TextInput
                        style={styles.input}
                        placeholder={t("password_placeholder")}
                        value={values.password}
                        onChangeText={handleChange("password")}
                        onBlur={handleBlur("password")}
                        secureTextEntry
                        placeholderTextColor={colors.textMedium}
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
                        {t("sign_in_button")}
                    </Button>
                </View>
            )}
        </Formik>
    );
};

const LoginScreen = ({ navigation }) => {
    const { t } = useTranslation();
    const { login, isLoading, authError, signInWithPhoneCredential, bypassPhoneAuth } =
        useContext(AuthContext);
        
    const [activeTab, setActiveTab] = useState("customer");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmation, setConfirmation] = useState(null);
    const [verificationCode, setVerificationCode] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    
    const [countryCode, setCountryCode] = useState("+507");
    const [useBypassMode, setUseBypassMode] = useState(true);

    useEffect(() => {
        const unsubscribe = db.collection("bypass").doc("config")
            .onSnapshot((doc) => {
                if (doc.exists) {
                    setUseBypassMode(doc.data().smsBypassEnabled === true);
                }
            });
        return () => unsubscribe();
    }, []);

    const handleSendCode = async () => {
        const cleanedNumber = phoneNumber.replace(/\D/g, "");
        const isValidLength = countryCode === "+507" ? cleanedNumber.length === 8 : cleanedNumber.length === 10;

        if (!isValidLength) {
            Alert.alert(
                t("alert.invalid_number_title"),
                t("invalid_phone_number_length") || "Please enter a valid phone number length."
            );
            return;
        }

        setIsSubmitting(true);
        try {
            const fullPhoneNumber = `${countryCode}${cleanedNumber}`;

            if (useBypassMode) {
                console.log(`[DEBUG] BYPASS ON: Silently logging in ${fullPhoneNumber}`);
                await bypassPhoneAuth(fullPhoneNumber);
                return;
            }

            const confirmationResult = await auth.signInWithPhoneNumber(fullPhoneNumber);
            setConfirmation(confirmationResult);
        } catch (error) {
            Alert.alert(
                t("alert.error_title"),
                `${t("alert.could_not_send_code_message")}: ${error.message}`,
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmCode = async () => {
        if (isLoading || !confirmation) return;
        setIsSubmitting(true);
        try {
            await signInWithPhoneCredential(confirmation, verificationCode, null);
        } catch (error) {
            Alert.alert(
                t("alert.login_failed_title"),
                `${t("alert.could_not_verify_code_message")}: ${error.message}`,
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEmailLogin = async (values) => {
        setIsSubmitting(true);
        try {
            await login(values.email, values.password);
        } catch (error) {
            // Error handled in context
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
                        <Text style={styles.title}>{t("welcome_back_title")}</Text>
                        <Text style={styles.subtitle}>
                            {t("sign_in_to_access_account_subtitle")}
                        </Text>
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
                                {t("customer_tab")}
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
                                {t("restaurant_tab")}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {authError && <Text style={styles.errorText}>{authError}</Text>}

                    {activeTab === "customer" ? (
                        <CustomerLoginForm
                            confirmation={confirmation}
                            setConfirmation={setConfirmation}
                            phoneNumber={phoneNumber}
                            setPhoneNumber={setPhoneNumber}
                            handleSendCode={handleSendCode}
                            verificationCode={verificationCode}
                            setVerificationCode={setVerificationCode}
                            handleConfirmCode={handleConfirmCode}
                            isSubmitting={isSubmitting}
                            isLoading={isLoading}
                            countryCode={countryCode}
                            setCountryCode={setCountryCode}
                            useBypassMode={useBypassMode}
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
                        <Text style={styles.linkText}>{t("forgot_password_link")}</Text>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>{t("dont_have_account_text")}</Text>
                        <TouchableOpacity
                            onPress={() =>
                                navigation.navigate(
                                    activeTab === "customer"
                                        ? "CustomerSignup"
                                        : "RestaurantSignup",
                                )
                            }
                        >
                            <Text style={styles.linkTextFooter}> {t("signup_link")}</Text>
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
    subtitle: { fontSize: 16, color: colors.textMedium, textAlign: "center" },
    tabContainer: {
        flexDirection: "row",
        justifyContent: "center",
        marginBottom: 20,
        backgroundColor: colors.surfaceWhite,
        borderRadius: 8,
        padding: 4,
    },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 6 },
    activeTab: { backgroundColor: colors.primary },
    tabText: { textAlign: "center", fontWeight: "600", color: colors.textMedium },
    activeTabText: { color: colors.surfaceWhite },
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

    // 🚨 NEW STYLES FOR THE MODAL
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end", // Aligns modal to bottom
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

export default LoginScreen;