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
      navigation.navigate("RestaurantDashboard");
    } catch (error) {
      console.log("Error saving restaurant profile:", error);
    }
  };

  return (
    <View style={styles.fromContainer}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>Restaurant Profile</Text>
        <Text style={styles.inputLabel}>Restaurant Name:</Text>
        <TextInput
          style={styles.inputField}
          value={restaurantName}
          onChangeText={setRestaurantName}
          placeholder="Restaurant Name"
        />
        <Text style={styles.inputLabel}>Description</Text>
        <TextInput
          style={styles.inputField}
          value={description}
          onChangeText={setDescription}
          placeholder="Restaurant description / tagline"
        />
        <Text style={styles.inputLabel}>Cuisine</Text>
        <TextInput
          style={styles.inputField}
          value={cuisineType}
          onChangeText={setCuisineType}
          placeholder="Cuisine"
        />
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

        <TextInput
          style={[styles.inputField]}
          value={address}
          onChangeText={setAddress}
          placeholder="Address"
        />
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
        <TextInput
          style={styles.inputField}
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone"
          keyboardType="phone-pad"
        />
        <View style={styles.imageContainer}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          )}

          <Button
            title={isUploading ? "Uploading..." : "Upload Image"}
            onPress={handleImageUpload}
            style={styles.button}
            disabled={isUploading}
          />
        </View>

        <Button
          style={styles.saveButton}
          title="Save"
          onPress={saveRestaurantProfile}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fromContainer: {
    padding: 20,
  },

  container: {
    backgroundColor: colors.background,
    marginBottom: 20,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  previewImage: {
    width: 200,
    height: 200,
    borderRadius: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    marginTop: 30,
  },

  inputField: {
    borderColor: "lightgray",
    borderWidth: 1,
    padding: 10,
  },

  inputLabel: {
    paddingTop: 20,
    marginBottom: 1,
    fontWeight: "bold",
  },
  saveButton: {
    backgroundColor: colors.primaryColor,

    // ... other button styles
  },
  addressRow: {
    // Style for the row containing address fields
    flexDirection: "row",
    justifyContent: "space-between", // Distribute elements
    alignItems: "center", // Vertically center in the row
  },

  cityInput: {
    flex: 2.5, // Example distribution - adjust ratios as needed
    borderWidth: 1,
    borderColor: "lightgray",
    padding: 10,
    marginBottom: 10,
  },
  stateInput: {
    flex: 1.5,
    borderWidth: 1,
    borderColor: "lightgray",
    padding: 20,
    marginBottom: 10,
    marginLeft: 10,
    marginRight: 10,
    color: "black",
  },
  zipInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "lightgray",
    padding: 10,
    marginBottom: 10,
  },

  hoursOfOperation: {
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1, // Replace '1px solid' with 'borderWidth'
    borderColor: "lightgray",
    padding: 15,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  dayLabel: {
    fontWeight: "bold",
    marginRight: 10,
  },

  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "lightgray",
    padding: 8,
    marginRight: 8,
  },

  timeInputContainer: {
    flex: 1,
    marginLeft: 10,
    flexDirection: "column",
    justifyContent: "flex-end",
  },
  hoursHeader: {
    backgroundColor: "#f0f0f0", // Light background for contrast
    padding: 15,
    flexDirection: "row", // Arrange title and icon horizontally
    alignItems: "center", // Center vertically
    borderBottomWidth: 1, // Subtle divider
    borderBottomColor: "#ddd",
  },

  hoursTitle: {
    fontSize: 18,
    fontWeight: "600", // Slightly bolder title
    flex: 1, // Text takes up available space
  },

  // Add styles for an expand/collapse icon if you're using one
  expandIcon: {
    fontSize: 20,
  },

  buttonRow: {
    flexDirection: "row", // Arrange buttons horizontally
    justifyContent: "space-around", // Distribute with space between
    marginTop: 20, // Add some spacing
  },
  button: {
    flex: 1, // Buttons take available space
    marginHorizontal: 5, // Small margin between buttons
    padding: 15, // Button padding
  },
  uploadButton: {
    backgroundColor: "green", // Customize the upload button color
  },
});

export default RestaurantProfile;
