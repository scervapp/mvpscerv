import React, { useState, useEffect, useContext } from "react";
import {
	StyleSheet,
	Text,
	View,
	TextInput,
	Button,
	Switch,
	ScrollView,
	TouchableOpacity,
	Image,
} from "react-native";
import { Picker } from "@react-native-picker/picker";

import { AuthContext } from "../../context/authContext";
import { stateOptions } from "../../utils/data/states";
import colors from "../../utils/styles/appStyles";
import { uploadImage, pickImage } from "../../utils/firebaseUtils";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import app from "../../config/firebase";

const RestaurantProfile = ({ navigation }) => {
	const [restaurantData, setRestaurantData] = useState(null);
	const { isLoading, currentUserData } = useContext(AuthContext);

	const [restaurantName, setRestaurantName] = useState(
		currentUserData.restaurantName || ""
	);
	const [address, setAddress] = useState(currentUserData.address || "");
	const [city, setCity] = useState(currentUserData.city || "");
	const [selectedState, setSelectedState] = useState(
		currentUserData.state || ""
	); // Assuming you use the full state name
	const [zipcode, setZipcode] = useState(currentUserData.zipcode || "");
	const [geoLat, setGeoLat] = useState(currentUserData.geoLat || "");
	const [geoLong, setGeoLong] = useState(currentUserData.geoLong || "");
	const [cuisineType, setCuisineType] = useState(
		currentUserData.cuisineType || ""
	);
	const [website, setWebsite] = useState("");
	const [phone, setPhone] = useState(currentUserData.phoneNumber || "");
	const [isActive, setIsActive] = useState(currentUserData.isActive || false);
	const [isHoursExtended, setIsHoursExtended] = useState(false);
	const [description, setDescription] = useState(
		currentUserData.description || ""
	);
	const [imageUri, setImageUri] = useState(null);
	const [uploadedImageUri, setUploadedImageUri] = useState(null);
	const [isUploading, setIsUploading] = useState(false);

	const db = getFirestore(app);

	//Hours of Operation
	const [hours, setHours] = useState({
		Monday: { open: "", close: "" },
		Tuesday: { open: "", close: "" },
		Wednesday: { open: "", close: "" },
		Thursday: { open: "", close: "" },
		Friday: { open: "", close: "" },
		Saturday: { open: "", close: "" },
		Sunday: { open: "", close: "" },
	});

	const timeRegex = /^([0-1]?[0-9]):([0-5][0-9]) (AM|PM)$/;
	const handleTimeInputChange = (day, newTime) => {
		setHours({
			...hours,
			[day]: { ...hours[day], open: newTime },
		});

		// Perform validation here if needed:
		if (!timeRegex.test(newTime)) {
			// Handle invalid input
		}
	};

	const handleImageUpload = async () => {
		setIsUploading(true);
		try {
			const { success, imageUri } = await pickImage();
			console.log("Image URI before uploaded", imageUri);
			if (success) {
				const downloadUrl = await uploadImage(
					imageUri,
					"restaurantProfileImages"
				);
				setImageUri(downloadUrl);
			} else {
				console.log("Image upload failed");
			}
		} catch (error) {
			console.log("Error uploading image:", error);
			Alert.alert("Upload error", "There was an issue uploading your image.");
		} finally {
			setIsUploading(false);
		}
	};

	const saveRestaurantProfile = async () => {
		const profileData = {
			restaurantName,
			address,
			city,
			state: selectedState,
			zipcode,
			geoLat,
			geoLong,
			cuisineType,
			website,
			phone,
			isActive,
			description,
			hours,
			imageUri: uploadedImageUri,
		};
		try {
			console.log("Before Image Upload", imageUri);
			if (imageUri) {
				const downloadUrl = await uploadImage(
					imageUri,
					"restaurantProfileImages"
				);
				profileData.imageUri = downloadUrl;
			}
			console.log("After Image Upload", imageUri);
			const docRef = doc(db, "restaurants", currentUserData.uid);
			await setDoc(docRef, {
				...currentUserData,
				...profileData,
				completedProfile: true,
			});
			console.log("Restaurant profile saved successfully");
			navigation.navigate("BackOffice");
		} catch (error) {
			console.log("Error saving restaurant profile:", error);
		}
	};

	return (
		<View style={styles.formContainer}>
			{/* Use formContainer as the main container */}
			<ScrollView showsVerticalScrollIndicator={false}>
				{/* Restaurant Name */}
				<View style={styles.inputGroup}>
					<Text style={styles.inputLabel}>Restaurant Name:</Text>
					<TextInput
						style={styles.inputField}
						value={restaurantName}
						onChangeText={setRestaurantName}
						placeholder="Restaurant Name"
					/>
				</View>

				{/* Description */}
				<View style={styles.inputGroup}>
					<Text style={styles.inputLabel}>Description</Text>
					<TextInput
						style={styles.inputField}
						value={description}
						onChangeText={setDescription}
						placeholder="Restaurant description / tagline"
					/>
				</View>

				{/* Cuisine */}
				<View style={styles.inputGroup}>
					<Text style={styles.inputLabel}>Cuisine</Text>
					<TextInput
						style={styles.inputField}
						value={cuisineType}
						onChangeText={setCuisineType}
						placeholder="Cuisine"
					/>
				</View>

				{/* Hours of Operation */}
				<TouchableOpacity
					style={styles.hoursHeader}
					onPress={() => setIsHoursExtended(!isHoursExtended)}
				>
					<Text style={styles.hoursTitle}>Hours of Operation</Text>
				</TouchableOpacity>

				{isHoursExtended && (
					<View style={styles.hoursOfOperation}>
						{Object.keys(hours).map((day) => (
							<View key={day} style={styles.inputRow}>
								<Text style={styles.dayLabel}>{day}</Text>
								<TextInput
									style={styles.timeInput}
									value={hours[day].open}
									keyboardType="numeric"
									onChangeText={(text) => handleTimeInputChange(day, text)}
									placeholder="Open"
								/>
								<TextInput
									style={styles.timeInput}
									value={hours[day].close}
									onChangeText={(text) =>
										setHours({
											...hours,
											[day]: { ...hours[day], close: text },
										})
									}
									placeholder="Close"
								/>
							</View>
						))}
					</View>
				)}

				{/* Address */}
				<View style={styles.inputGroup}>
					<Text style={styles.inputLabel}>Address</Text>
					<TextInput
						style={styles.inputField}
						value={address}
						onChangeText={setAddress}
						placeholder="Address"
					/>
				</View>

				{/* City, State, Zip Code */}
				<View style={styles.addressRow}>
					<TextInput
						style={[styles.cityInput, styles.inputField]}
						value={city}
						onChangeText={setCity}
						placeholder="City"
					/>
					<Picker
						style={styles.stateInput}
						selectedValue={selectedState}
						onValueChange={setSelectedState}
					>
						{stateOptions.map((state) => (
							<Picker.Item
								label={state.label}
								value={state.label}
								key={state.label}
							/>
						))}
					</Picker>
					<TextInput
						style={[styles.zipInput, styles.inputField]}
						value={zipcode}
						onChangeText={setZipcode}
						placeholder="Zipcode"
						keyboardType="number-pad"
					/>
				</View>

				{/* Phone */}
				<View style={styles.inputGroup}>
					<Text style={styles.inputLabel}>Phone</Text>
					<TextInput
						style={styles.inputField}
						value={phone}
						onChangeText={setPhone}
						placeholder="Phone"
						keyboardType="phone-pad"
					/>
				</View>

				{/* Image Upload */}
				<View style={styles.imageContainer}>
					{imageUri && (
						<Image source={{ uri: imageUri }} style={styles.previewImage} />
					)}
					<TouchableOpacity
						onPress={handleImageUpload}
						style={styles.uploadButton}
						disabled={isUploading}
					>
						<Text style={styles.uploadButtonText}>
							{isUploading ? "Uploading..." : "Upload Image"}
						</Text>
					</TouchableOpacity>
				</View>

				{/* Save Button */}
				<TouchableOpacity
					style={styles.saveButton}
					onPress={saveRestaurantProfile}
				>
					<Text style={styles.saveButtonText}>Save</Text>
				</TouchableOpacity>
			</ScrollView>
		</View>
	);
};

const styles = StyleSheet.create({
	formContainer: {
		flex: 1,
		backgroundColor: colors.background, // Use your background color
		padding: 20,
	},
	header: {
		fontSize: 28,
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.primary,
		textAlign: "center",
	},
	inputGroup: {
		marginBottom: 20, // Increased margin for better spacing
	},
	inputLabel: {
		fontSize: 16,
		marginBottom: 5,
		color: colors.text,
	},
	inputField: {
		borderWidth: 0.5,
		borderColor: "gray",
		borderRadius: 8, // Use a more modern rounded corner
		padding: 12, // Increased padding
		fontSize: 16,
		backgroundColor: colors.inputBackground, // Use a subtle background color for input fields
	},
	hoursHeader: {
		backgroundColor: colors.lightGray,
		padding: 15,
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 15,
		borderRadius: 8,
	},
	hoursTitle: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.text,
		flex: 1,
	},
	hoursOfOperation: {
		marginBottom: 20,
		borderWidth: 1,
		borderColor: colors.lightGray,
		padding: 15,
		borderRadius: 8,
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 10,
	},
	dayLabel: {
		fontSize: 16,
		fontWeight: "bold",
		marginRight: 10,
		width: 80,
	},
	timeInput: {
		flex: 1,
		borderWidth: 1,
		borderColor: colors.lightGray,
		padding: 8,
		marginRight: 8,
		borderRadius: 5,
	},
	addressRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 20, // Increased margin
	},
	cityInput: {
		flex: 2.5,
		borderWidth: 1,
		borderColor: colors.lightGray,
		padding: 10,
		borderRadius: 8,
		marginRight: 10,
	},
	stateInput: {
		flex: 1.5,
		borderWidth: 1,
		borderColor: colors.lightGray,
		padding: 10,
		borderRadius: 8,
		marginRight: 10,
	},
	zipInput: {
		flex: 1,
		borderWidth: 1,
		borderColor: colors.lightGray,
		padding: 10,
		borderRadius: 8,
	},
	imageContainer: {
		alignItems: "center",
		marginVertical: 20,
	},
	previewImage: {
		width: 200,
		height: 200,
		borderRadius: 10,
		marginBottom: 10,
	},
	uploadButton: {
		backgroundColor: colors.primary,
		padding: 12, // Increased padding
		borderRadius: 8, // More rounded corners
		alignItems: "center",
	},
	uploadButtonText: {
		color: "white",
		fontSize: 16, // Increased font size
		fontWeight: "bold",
	},
	saveButton: {
		backgroundColor: colors.primary,
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 20,
	},
	saveButtonText: {
		// Added style for the button text
		color: "white",
		fontSize: 18,
		fontWeight: "bold",
	},
});

export default RestaurantProfile;
