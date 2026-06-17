import React, { useState, useEffect, useContext, useCallback } from "react";
import {
	StyleSheet,
	Text,
	View,
	TextInput,
	ScrollView,
	TouchableOpacity,
	Image,
	Switch,
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AuthContext } from "../../context/authContext";
import { uploadImageAndGetDownloadURL, pickImage } from "../../utils/firebaseUtils";
import colors from "../../utils/styles/appStyles";
import { db } from "../../config/firebase";
import { useTranslation } from "react-i18next";
import { COUNTRY_OPTIONS } from "../auth/RestaurantSignupScreen";
import PlatformSelect from "../../components/global/PlatformSelect";
// A reusable card component for sectioning the form
const InfoCard = ({ title, children }) => (
	<View style={styles.card}>
		<Text style={styles.cardTitle}>{title}</Text>
		{children}
	</View>
);

// A reusable input component
const LabeledInput = ({
	label,
	value,
	onChangeText,
	placeholder,
	containerStyle,
	...props
}) => (
	<View style={[styles.inputGroup, containerStyle]}>
		<Text style={styles.inputLabel}>{label}</Text>
		<TextInput
			style={styles.inputField}
			value={value}
			onChangeText={onChangeText}
			placeholder={placeholder}
			placeholderTextColor={colors.textDark}
			{...props}
		/>
	</View>
);

const getCountryOption = (countryCode) =>
	COUNTRY_OPTIONS.find((country) => country.code === countryCode) ||
	COUNTRY_OPTIONS[0];

const cleanString = (value) => String(value || "").trim().replace(/\s+/g, " ");

const normalizeWebsite = (value) => {
	const cleaned = cleanString(value).toLowerCase();
	if (!cleaned) return "";
	if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
		return cleaned;
	}
	return `https://${cleaned}`;
};

const buildSearchTokens = (profile) => {
	const words = [
		profile.restaurantName,
		profile.cuisineType,
		profile.description,
		profile.address,
		profile.city,
		profile.state,
		profile.zipcode,
		profile.country,
		profile.countryCode,
		profile.area,
		profile.neighborhood,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase()
		.split(/[^a-z0-9]+/i)
		.filter((word) => word.length >= 2);

	return [...new Set(words)].slice(0, 80);
};

const parseOptionalCoordinate = (value, min, max) => {
	if (value === "" || value === null || value === undefined) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined;
	return parsed;
};

const RestaurantProfile = () => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const insets = useSafeAreaInsets();

	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [formData, setFormData] = useState({
		restaurantName: "",
		description: "",
		cuisineType: "",
		phone: "",
		website: "",
		address: "",
		city: "",
		state: "",
		zipcode: "",
		country: "United States",
		countryCode: "US",
		area: "",
		neighborhood: "",
		latitude: "",
		longitude: "",
		hours: {
			Monday: { open: "9:00 AM", close: "10:00 PM", active: true },
			Tuesday: { open: "9:00 AM", close: "10:00 PM", active: true },
			Wednesday: { open: "9:00 AM", close: "10:00 PM", active: true },
			Thursday: { open: "9:00 AM", close: "10:00 PM", active: true },
			Friday: { open: "9:00 AM", close: "11:00 PM", active: true },
			Saturday: { open: "10:00 AM", close: "11:00 PM", active: true },
			Sunday: { open: "10:00 AM", close: "9:00 PM", active: false },
		},
		imageUri: null,
	});

	// Fetch existing profile data when the screen loads
	useEffect(() => {
		const fetchProfile = async () => {
			if (!currentUserData?.uid) return;
			const docRef = db.collection("restaurants").doc(currentUserData.uid);
			try {
				const docSnap = await docRef.get();
				if (docSnap.exists()) {
					setFormData((prev) => ({ ...prev, ...docSnap.data() }));
				} else {
					// Pre-fill with any data from the auth context if no profile exists
					setFormData((prev) => ({ ...prev, ...currentUserData }));
				}
			} catch (error) {
				console.error("Error fetching restaurant profile:", error);
				Alert.alert(t("error"), t("could_not_load_your_profile"));
			} finally {
				setIsLoading(false);
			}
		};

		fetchProfile();
	}, [currentUserData?.uid]);

	// Generic handler for text input changes
	const handleInputChange = (field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	// Specific handler for hours changes
	const handleHoursChange = (day, field, value) => {
		setFormData((prev) => ({
			...prev,
			hours: { ...prev.hours, [day]: { ...prev.hours[day], [field]: value } },
		}));
	};

	const handleImageUpload = async () => {
		const result = await pickImage();
		if (result.success) {
			handleInputChange("imageUri", result.uri); // Store local URI temporarily
		}
	};

	const saveRestaurantProfile = async () => {
		const selectedCountry = getCountryOption(formData.countryCode);
		const latitude = parseOptionalCoordinate(formData.latitude, -90, 90);
		const longitude = parseOptionalCoordinate(formData.longitude, -180, 180);

		if (!cleanString(formData.restaurantName)) {
			Alert.alert(
				t("missing_name"),
				t("please_enter_your_restaurants_name")
			);
			return;
		}
		if (
			!cleanString(formData.cuisineType) ||
			!cleanString(formData.address) ||
			!cleanString(formData.city) ||
			!cleanString(formData.state) ||
			!cleanString(formData.zipcode) ||
			!selectedCountry?.code
		) {
			Alert.alert(
				t("missing_information", "Missing information"),
				t(
					"complete_restaurant_location_profile",
					"Please complete cuisine, address, city, region, postal code, and country.",
				),
			);
			return;
		}
		if (latitude === undefined || longitude === undefined) {
			Alert.alert(
				t("invalid_location", "Invalid location"),
				t(
					"latitude_longitude_invalid",
					"Latitude must be between -90 and 90, and longitude must be between -180 and 180.",
				),
			);
			return;
		}
		setIsSaving(true);
		let finalData = {
			...formData,
			restaurantName: cleanString(formData.restaurantName),
			description: cleanString(formData.description),
			cuisineType: cleanString(formData.cuisineType),
			phone: cleanString(formData.phone),
			website: normalizeWebsite(formData.website),
			address: cleanString(formData.address),
			city: cleanString(formData.city),
			state: cleanString(formData.state),
			zipcode: cleanString(formData.zipcode),
			country: selectedCountry.label,
			countryCode: selectedCountry.code,
			area: cleanString(formData.area),
			neighborhood: cleanString(formData.neighborhood),
		};

		finalData.fullAddress = [
			finalData.address,
			finalData.city,
			finalData.state,
			finalData.zipcode,
			finalData.country,
		]
			.filter(Boolean)
			.join(", ");
		finalData.searchTokens = buildSearchTokens(finalData);

		if (latitude !== null && longitude !== null) {
			finalData.latitude = latitude;
			finalData.longitude = longitude;
			finalData.location = { latitude, longitude };
		} else {
			finalData.latitude = null;
			finalData.longitude = null;
			finalData.location = null;
		}

		try {
			// Check if the imageUri is a local file (starts with 'file://')
			if (finalData.imageUri && finalData.imageUri.startsWith("file://")) {
				const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
				const path = `restaurantProfileImages/${currentUserData.uid}/${uniqueId}.jpg`;
				const downloadUrl = await uploadImageAndGetDownloadURL(
					finalData.imageUri,
					path
				);
				finalData.imageUri = downloadUrl;
			}

			const docRef = db.collection("restaurants").doc(currentUserData.uid);
			await docRef.set(finalData, { merge: true }); // Use merge to avoid overwriting other fields

			Alert.alert(t("success"), t("your_profile_has_been_saved"));
		} catch (error) {
			console.error("Error saving restaurant profile:", error);
			Alert.alert(t("error"), t("there_was_an_issue_saving_your_profile"));
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<KeyboardAvoidingView
			style={{ flex: 1 }}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
		>
			<View style={[styles.container, { paddingTop: insets.top }]}>
				<ScrollView
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}
				>
					<InfoCard title={t("profile_image")}>
						<View style={styles.imagePickerContainer}>
							{formData.imageUri ? (
								<Image
									source={{ uri: formData.imageUri }}
									style={styles.imagePreview}
								/>
							) : (
								<View style={[styles.imagePreview, styles.imagePlaceholder]}>
									<Ionicons
										name="business-outline"
										size={60}
										color={colors.textLight}
									/>
								</View>
							)}
							<TouchableOpacity
								style={styles.imageButton}
								onPress={handleImageUpload}
							>
								<Ionicons name="camera" size={20} color={colors.primary} />
								<Text style={styles.imageButtonText}>
									{t("change_image")}
								</Text>
							</TouchableOpacity>
						</View>
					</InfoCard>

					<InfoCard title={t("basic_info")}>
						<LabeledInput
							label={t("restaurant_name")}
							value={formData.restaurantName}
							onChangeText={(val) => handleInputChange("restaurantName", val)}
							placeholder={t("your_restaurants_name")}
						/>
						<LabeledInput
							label={t("cuisine_type")}
							value={formData.cuisineType}
							onChangeText={(val) => handleInputChange("cuisineType", val)}
							placeholder={t("e_g_italian_mexican_etc")}
						/>
						<LabeledInput
							label={t("short_description")}
							value={formData.description}
							onChangeText={(val) => handleInputChange("description", val)}
							placeholder={t("a_short_catchy_tagline")}
							multiline
						/>
					</InfoCard>

					<InfoCard title={t("contact_location")}>
						<LabeledInput
							label={t("phone_number")}
							value={formData.phone}
							onChangeText={(val) => handleInputChange("phone", val)}
							placeholder="(555) 123-4567"
							keyboardType="phone-pad"
						/>
						<LabeledInput
							label={t("website")}
							value={formData.website}
							onChangeText={(val) => handleInputChange("website", val)}
							placeholder="www.your-restaurant.com"
							keyboardType="url"
						/>
						<LabeledInput
							label={t("address")}
							value={formData.address}
							onChangeText={(val) => handleInputChange("address", val)}
							placeholder="123 Main St"
						/>
						<LabeledInput
							label={t("area_neighborhood", "Area or neighborhood")}
							value={formData.area}
							onChangeText={(val) => handleInputChange("area", val)}
							placeholder={t(
								"area_neighborhood_placeholder",
								"Downtown, Casco Viejo, Midtown, etc.",
							)}
						/>
						<View style={styles.row}>
							<LabeledInput
								label={t("city")}
								value={formData.city}
								onChangeText={(val) => handleInputChange("city", val)}
								containerStyle={{ flex: 1, marginRight: 10 }}
							/>
							<LabeledInput
								label={t("zip")}
								value={formData.zipcode}
								onChangeText={(val) => handleInputChange("zipcode", val)}
								keyboardType="number-pad"
								containerStyle={{ flex: 0.5 }}
							/>
						</View>
						<LabeledInput
							label={t("state_region_province", "State, region, or province")}
							value={formData.state}
							onChangeText={(val) => handleInputChange("state", val)}
							placeholder={t("state_region_province", "State, region, or province")}
						/>
						<Text style={styles.inputLabel}>{t("country", "Country")}</Text>
						<View style={styles.pickerContainer}>
							<PlatformSelect
								value={formData.countryCode}
								onValueChange={(val) => {
									const country = getCountryOption(val);
									handleInputChange("countryCode", country.code);
									handleInputChange("country", country.label);
								}}
								title={t("country", "Country")}
								options={COUNTRY_OPTIONS.map((country) => ({
									label: country.label,
									value: country.code,
								}))}
								pickerStyle={styles.picker}
							/>
						</View>
						<View style={styles.row}>
							<LabeledInput
								label={t("latitude_optional", "Latitude (optional)")}
								value={
									formData.latitude === null || formData.latitude === undefined
										? ""
										: String(formData.latitude)
								}
								onChangeText={(val) => handleInputChange("latitude", val)}
								keyboardType="decimal-pad"
								containerStyle={{ flex: 1, marginRight: 10 }}
							/>
							<LabeledInput
								label={t("longitude_optional", "Longitude (optional)")}
								value={
									formData.longitude === null || formData.longitude === undefined
										? ""
										: String(formData.longitude)
								}
								onChangeText={(val) => handleInputChange("longitude", val)}
								keyboardType="decimal-pad"
								containerStyle={{ flex: 1 }}
							/>
						</View>
					</InfoCard>

					<InfoCard title={t("hours_of_operation")}>
						{Object.keys(formData.hours).map((day) => (
							<View key={day} style={styles.dayRow}>
								<Switch
									value={formData.hours[day].active}
									onValueChange={(val) => handleHoursChange(day, "active", val)}
									trackColor={{ false: "#767577", true: colors.primary }}
									thumbColor={"#f4f3f4"}
								/>
								<Text
									style={[
										styles.dayLabel,
										!formData.hours[day].active && styles.dayLabelInactive,
									]}
								>
									{day}
								</Text>
								<TextInput
									value={formData.hours[day].open}
									onChangeText={(val) => handleHoursChange(day, "open", val)}
									style={[
										styles.timeInput,
										!formData.hours[day].active && styles.timeInputInactive,
									]}
									placeholder={t("open")}
									editable={formData.hours[day].active}
								/>
								<Text
									style={!formData.hours[day].active && styles.dayLabelInactive}
								>
									{t("to")}
								</Text>
								<TextInput
									value={formData.hours[day].close}
									onChangeText={(val) => handleHoursChange(day, "close", val)}
									style={[
										styles.timeInput,
										!formData.hours[day].active && styles.timeInputInactive,
									]}
									placeholder={t("close")}
									editable={formData.hours[day].active}
								/>
							</View>
						))}
					</InfoCard>
				</ScrollView>

				<View style={[styles.footer, { paddingBottom: insets.bottom || 15 }]}>
					<TouchableOpacity
						style={[styles.saveButton, isSaving && { opacity: 0.7 }]}
						onPress={saveRestaurantProfile}
						disabled={isSaving}
					>
						{isSaving ? (
							<ActivityIndicator color="#FFFFFF" />
						) : (
							<Text style={styles.saveButtonText}>{t("save_changes")}</Text>
						)}
					</TouchableOpacity>
				</View>
			</View>
		</KeyboardAvoidingView>
	);
};

const styles = StyleSheet.create({
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.background,
	},
	container: { flex: 1, backgroundColor: colors.background },
	scrollContent: { paddingHorizontal: 15, paddingBottom: 100 },
	card: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 20,
		marginBottom: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 5,
		elevation: 2,
	},
	cardTitle: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		paddingBottom: 10,
	},
	inputGroup: { marginBottom: 15 },
	inputLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.textMedium,
		marginBottom: 8,
	},
	inputField: {
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		paddingVertical: 12,
		fontSize: 16,
		color: colors.textDark,
	},
	row: { flexDirection: "row", justifyContent: "space-between" },
	pickerContainer: {
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		justifyContent: "center",
		color: colors.textDark,
	},
	picker: { height: 50 },
	dayRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
	dayLabel: {
		fontSize: 16,
		fontWeight: "500",
		color: colors.textDark,
		width: 95,
		marginLeft: 10,
	},
	dayLabelInactive: { color: colors.textLight },
	timeInput: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		padding: 10,
		marginHorizontal: 5,
		textAlign: "center",
		color: colors.textDark,
	},
	timeInputInactive: {
		backgroundColor: colors.background,
		color: colors.textLight,
	},
	imagePickerContainer: { alignItems: "center" },
	imagePreview: {
		width: 120,
		height: 120,
		borderRadius: 60,
		marginBottom: 15,
		backgroundColor: colors.backgroundMedium,
		// Add these two lines
		justifyContent: "center",
		alignItems: "center",
	},
	imageButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary + "20",
		paddingHorizontal: 15,
		paddingVertical: 8,
		borderRadius: 20,
	},
	imageButtonText: { color: colors.primary, fontWeight: "bold", marginLeft: 8 },
	footer: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: colors.surfaceWhite,
		padding: 15,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	saveButton: {
		backgroundColor: colors.primary,
		padding: 15,
		borderRadius: 12,
		alignItems: "center",
	},
	saveButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
});

export default RestaurantProfile;
