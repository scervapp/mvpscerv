import React, { useState, useEffect, useContext } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AddItemModal from "../../components/restaurant/AddItemModal";
import app from "../../config/firebase";
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
  where,
  query,
} from "firebase/firestore";
import { AuthContext } from "../../context/authContext";
import MenuItem from "../../components/restaurant/MenuItem";

const MenuManagementScreen = () => {
  const [showModal, setShowModal] = useState(false);
  const [menuItems, setMenuItems] = useState([]);

  const { isLoading, currentUserData } = useContext(AuthContext);
  const db = getFirestore(app);

  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        // Reference the ssubcollection of the restaurant's menuItems collection
        console.log("Current User Data", currentUserData.uid);
        const menuItemsRef = collection(db, "menuItems");
        const queryRest = query(
          menuItemsRef,
          where("restaurantId", "==", currentUserData.uid)
        );
        const unsubscribe = onSnapshot(queryRest, (snapshot) => {
          let menuItemsData = [];
          snapshot.forEach((doc) => {
            menuItemsData.push({ id: doc.id, ...doc.data() });
          });
          // set the menuItemsData array as the state
          setMenuItems(menuItemsData);
        });

        // Clean up the listener when the component unmounts
        return () => unsubscribe();
      } catch (error) {
        console.log("Error fetching menu items:", error);
        Alert.alert("Error", "There was an error fetching the menu items.");
      }
    };
    fetchMenuItems();
  }, []);

  return (
    <View style={styles.container}>
      {isLoading ? (
        <Text>Loading...</Text>
      ) : (
        <FlatList
          data={menuItems}
          renderItem={({ item }) => {
            console.log("item", item);
            return <MenuItem item={item} restaurantId={currentUserData.uid} />;
          }}
          keyExtractor={(item) => item.id}
        />
      )}
      <TouchableOpacity style={styles.addButton}>
        <MaterialCommunityIcons
          onPress={() => setShowModal(true)}
          name="plus-thick"
          size={40}
          color="green"
        />
      </TouchableOpacity>
      <AddItemModal isVisible={showModal} onClose={() => setShowModal(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },

  addButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "white",
    borderRadius: 50, // For a circular button
    padding: 10,
    // Consider adding shadow for a floating effect (iOS: shadowColor, shadowOffset, etc. | Android: elevation)
  },
});
export default MenuManagementScreen;
