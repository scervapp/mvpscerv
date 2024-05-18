import React, { useState } from "react";
import { View, Text, StyleSheet, Image, Button, Alert } from "react-native";
import AddItemModal from "./AddItemModal";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  updateDoc,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import app from "../../config/firebase";
import { deleteDoc } from "firebase/firestore";

const MenuItem = ({ item, restaurantId }) => {
  const db = getFirestore(app);
  const [showModal, setShowModal] = useState(false);

  const handleEdit = () => {
    setShowModal(true);
  };
  const handleDelete = () => {
    console.log("Delete button clicked");
    try {
      Alert.alert(
        "Delete Menu Item",
        "Are you sure you want to delete this menu item?",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            onPress: () => deleteMenuItem(restaurantId, item),
          },
        ]
      );
    } catch (error) {
      console.log("Error deleting menu item:", error);
    }
    // Handle delete logic here
  };

  const deleteMenuItem = async (restaurantId, menuItem) => {
    try {
      const menuItemRef = doc(
        db,
        "restaurants",
        restaurantId,
        "menuItems",
        menuItem.id
      );
      await deleteDoc(menuItemRef);
      console.log("Menu Item deleted successfully");
    } catch (error) {
      console.log("Error deleting menu item:", error);
      Alert.alert("Error", "There was an error deleting the menu item.");
    }
  };

  // Handle item update
  const updateMenuItem = async (restaurantId, menuItemId, menuItemData) => {
    try {
      const menuItemRef = doc(db, "menuItems", menuItemId);
      const menuItemSnapshot = await getDoc(menuItemRef);
      if (!menuItemSnapshot.exists()) {
        throw new Error("Menu Item not found");
      }

      if (menuItemData.restaurantId !== restaurantId) {
        throw new Error("Menu Item not found");
      }
      await updateDoc(menuItemRef, menuItemData);
      console.log("Menu Item updated successfully");
    } catch (error) {
      console.log("Error updating menu item:", error);
      Alert.alert("Error", "There was an error updating the menu item.");
    }
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: item.imageUri }} style={styles.image} />
      <View style={styles.infoContainer}>
        <Text style={styles.title}>
          {item.name} {item.price.toString()}
        </Text>
        <Text>{item.category}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
      <Button title="Edit" onPress={handleEdit} />
      <Button title="Delete" onPress={handleDelete} />
      <AddItemModal
        isVisible={showModal}
        onClose={() => setShowModal(false)}
        itemData={item} // Pass item pre-population
        isEdit={true} // Set to true to enable edit mode
        updateMenuItem={updateMenuItem}
        restaurantId={restaurantId}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
  },
  infoContainer: {
    flex: 1, // Allow text content to take up remaining space
    paddingLeft: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
  },
  price: {
    fontSize: 16,
    color: "#888",
  },
  description: {
    fontSize: 12,
    color: "#666",
  },
  image: {
    width: 50,
    height: 50,
  },
});

export default MenuItem;
