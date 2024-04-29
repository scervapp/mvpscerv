import React, { useState, useContext, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  Button,
  Image,
  Platform,
  Switch,
  Alert,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { pickImage, uploadImage } from "../../utils/firebaseUtils";
import app from "../../config/firebase";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
} from "firebase/firestore";
import { AuthContext } from "../../context/authContext";

const AddItemModal = ({
  isVisible,
  onClose,
  onAddItem,
  isEdit,
  itemData,
  restaurantId,
  updateMenuItem,
}) => {
  const db = getFirestore(app);
  const { isLoading, currentUserData } = useContext(AuthContext);
  const [imageUri, setImageUri] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
    price: "",
    category: "",
    isDailySpecial: false,
  });

  handleBackButton = () => {
    navigation.goBack();
  };

  useEffect(() => {
    console.log("This is the item data", isEdit);
    if (isEdit && itemData) {
      // Populate form with itemData
      setFormData(itemData); // assuming you have a form state
      setImageUri(itemData.imageUri);
    } else {
      setFormData({
        name: "",
        price: "",
        description: "",
        price: "",
        category: "",
        isDailySpecial: false,
      });
      setImageUri(null);
    }
  }, [isEdit, itemData]);

  // Add Menu Item
  const addMenuItem = async (restaurantId, menuItemData) => {
    try {
      const menuItemsRef = collection(db, "menuItems");
      const newMenuItemRef = await addDoc(menuItemsRef, {
        ...menuItemData,
        restaurantId: restaurantId,
      });

      console.log("Menu Item added successfully with ID", menuItemsRef.id);
    } catch (error) {
      console.log("Error adding menu item:", error);
      Alert.alert("Error", "There was an error adding the menu item.");
    }
  };

  const handleSubmit = async () => {
    try {
      const newItemData = {
        ...formData,
        imageUri,
      };

      if (isEdit) {
        await updateMenuItem(currentUserData.uid, itemData.id, newItemData);
      } else {
        await addMenuItem(currentUserData.uid, newItemData);
        setFormData({
          name: "",
          price: "",
          description: "",
          price: "",
          category: "",
          isDailySpecial: false,
        });

        setImageUri(null);
      }
    } catch (error) {
      console.log("Error adding menu item:", error);
      Alert.alert("Error", "There was an error adding the menu item.");
    }
    onClose();
  };
  const handleImageUpload = async () => {
    setIsUploading(true);
    try {
      const { success, imageUri } = await pickImage();
      console.log("Image URI before uploaded", imageUri);
      if (success) {
        const downloadUrl = await uploadImage(imageUri, "menuItemImages");
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
  return (
    <Modal
      style={styles.modalContent}
      visible={isVisible}
      animationType="slide"
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.modalContent}>
          <View style={styles.formData}>
            <Text style={styles.modalTitle}>Add Item</Text>
            <TextInput
              value={formData.name}
              placeholder="Name"
              style={styles.input}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
            />
            <TextInput
              value={formData.description}
              onChangeText={(text) =>
                setFormData({ ...formData, description: text })
              }
              placeholder="Description"
              style={(styles.input, styles.descriptionInput)}
              multiline
              numberOfLines={4}
            />
            <TextInput
              value={formData.price}
              placeholder="Price"
              style={styles.input}
              onChangeText={(text) => setFormData({ ...formData, price: text })}
            />
            <Picker
              style={styles.input}
              selectedValue={formData.category}
              onValueChange={(itemValue, itemIndex) =>
                setFormData({ ...formData, category: itemValue })
              }
            >
              <Picker.Item label="Select Category" value="" />
              <Picker.Item label="Appetizer" value="appetizer" />
              <Picker.Item label="Entree" value="entree" />
              <Picker.Item label="Dessert" value="dessert" />
              <Picker.Item label="Beverage" value="beverage" />
              <Picker.Item
                label="Alcoholi Beverage"
                value="alcoholic beverage"
              />
            </Picker>
            <View style={styles.switchContainer}>
              <Text style={styles.label}>Daily Special</Text>
              <Switch
                value={formData.isDailySpecial}
                onValueChange={() => {
                  setFormData({
                    ...formData,
                    isDailySpecial: !formData.isDailySpecial,
                  });
                  trackColor = { false: "#767577", true: "#81b0ff" };
                }}
              />
            </View>

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
            <View style={styles.buttonRow}>
              <Button
                style={styles.cancelButton}
                title="Cancel"
                onPress={onClose}
              />
              <Button
                style={styles.addItemButton}
                title={isEdit ? "Update" : "Add"}
                onPress={handleSubmit}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
};
const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
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
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  descriptionInput: {
    height: 100,
    textAlignVertical: "top", // For multiline alignment
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 15,
  },
  label: {
    marginBottom: 5,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 15, // Optional: Add top margin for spacing
    padding: 10, // Optional: Add padding for spacing
  },
  cancelButton: {
    // backgroundColor: Platform.OS === "ios" ? "#FF0000" : "#d63031", // Adjust for Android
    color: "white",
    backgroundColor: "red",

    // Add padding, margin etc. if needed
  },
  addItemButton: {
    backgroundColor: Platform.OS === "ios" ? "#008000" : "#4CAF50", // Adjust for Android
    color: "white",
    // Add padding, margin etc. if needed
  },
});
export default AddItemModal;
