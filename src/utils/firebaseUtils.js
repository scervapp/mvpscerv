import React from "react";
import app from "../config/firebase";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
  uploadString,
} from "firebase/storage";
import * as ImagePicker from "expo-image-picker";

const storage = getStorage(app);
export const uploadImage = async (imageUri, storagePath = "default") => {
  if (!imageUri) return null; // check for valid image
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const filename = imageUri.substring(imageUri.lastIndexOf("/") + 1);
    const storageRef = ref(storage, `${storagePath}/${filename}`);
    //onst imageRef = storageRef.child(`${storagePath}/${filename}`);

    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    console.log("Image upload error", error);
    throw error; // Re throw the error to allow error handling
  }
};
export const pickImage = async () => {
  // Request camera roll permission if needed
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    alert("Permission to access camera roll is required");
    return;
  }

  let result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    aspect: [4, 3],
    quality: 1,
  });

  if (!result.canceled) {
    return { success: true, imageUri: result.assets[0].uri };
  } else {
    return {
      success: false,
      imageUri: null,
    };
  }
};
