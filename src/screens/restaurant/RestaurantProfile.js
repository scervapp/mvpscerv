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
import { stateOptions } from "../../utils/data/states"; // Assuming you have this
import { Picker } from "@react-native-picker/picker";
import { db } from "../../config/firebase";

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
	...props
}) => (
	<View style={styles.inputGroup}>
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

const RestaurantProfile = () => {
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
		state: "California",
		zipcode: "",
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
				Alert.alert("Error", "Could not load your profile.");
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
		if (!formData.restaurantName) {
			Alert.alert("Missing Name", "Please enter your restaurant's name.");
			return;
		}
		setIsSaving(true);
		let finalData = { ...formData };

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

			Alert.alert("Success", "Your profile has been saved.");
		} catch (error) {
			console.error("Error saving restaurant profile:", error);
			Alert.alert("Error", "There was an issue saving your profile.");
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
					<InfoCard title="Profile Image">
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
								<Text style={styles.imageButtonText}>Change Image</Text>
							</TouchableOpacity>
						</View>
					</InfoCard>

					<InfoCard title="Basic Info">
						<LabeledInput
							label="Restaurant Name"
							value={formData.restaurantName}
							onChangeText={(val) => handleInputChange("restaurantName", val)}
							placeholder="Your Restaurant's Name"
						/>
						<LabeledInput
							label="Cuisine Type"
							value={formData.cuisineType}
							onChangeText={(val) => handleInputChange("cuisineType", val)}
							placeholder="e.g., Italian, Mexican, etc."
						/>
						<LabeledInput
							label="Short Description"
							value={formData.description}
							onChangeText={(val) => handleInputChange("description", val)}
							placeholder="A short, catchy tagline"
							multiline
						/>
					</InfoCard>

					<InfoCard title="Contact & Location">
						<LabeledInput
							label="Phone Number"
							value={formData.phone}
							onChangeText={(val) => handleInputChange("phone", val)}
							placeholder="(555) 123-4567"
							keyboardType="phone-pad"
						/>
						<LabeledInput
							label="Website"
							value={formData.website}
							onChangeText={(val) => handleInputChange("website", val)}
							placeholder="www.your-restaurant.com"
							keyboardType="url"
						/>
						<LabeledInput
							label="Address"
							value={formData.address}
							onChangeText={(val) => handleInputChange("address", val)}
							placeholder="123 Main St"
						/>
						<View style={styles.row}>
							<LabeledInput
								label="City"
								value={formData.city}
								onChangeText={(val) => handleInputChange("city", val)}
								containerStyle={{ flex: 1, marginRight: 10 }}
							/>
							<LabeledInput
								label="Zip"
								value={formData.zipcode}
								onChangeText={(val) => handleInputChange("zipcode", val)}
								keyboardType="number-pad"
								containerStyle={{ flex: 0.5 }}
							/>
						</View>
						<Text style={styles.inputLabel}>State</Text>
						<View style={styles.pickerContainer}>
							<Picker
								selectedValue={formData.state}
								onValueChange={(val) => handleInputChange("state", val)}
								style={styles.picker}
								placeHolderTextColor={colors.textDark}
							>
								{stateOptions.map((state) => (
									<Picker.Item
										label={state.label}
										value={state.value}
										key={state.value}
										style={{ color: colors.textDark }}
									/>
								))}
							</Picker>
						</View>
					</InfoCard>

					<InfoCard title="Hours of Operation">
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
									placeholder="Open"
									editable={formData.hours[day].active}
								/>
								<Text
									style={!formData.hours[day].active && styles.dayLabelInactive}
								>
									to
								</Text>
								<TextInput
									value={formData.hours[day].close}
									onChangeText={(val) => handleHoursChange(day, "close", val)}
									style={[
										styles.timeInput,
										!formData.hours[day].active && styles.timeInputInactive,
									]}
									placeholder="Close"
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
							<Text style={styles.saveButtonText}>Save Changes</Text>
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
