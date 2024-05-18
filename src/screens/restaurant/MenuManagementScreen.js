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

  const mockMenuItems = [
    // Appetizers
    {
      name: "Bruschetta",
      description: "Grilled bread with tomatoes, basil, and balsamic",
      price: 8.99,
      category: "Appetizer",
      imageUri: "https://picsum.photos/300/200?food",
    },
    {
      name: "Garlic Knots",
      description: "Baked dough knots with garlic butter",
      price: 6.99,
      category: "Appetizer",
      imageUri: "https://picsum.photos/300/200?food",
    },
    {
      name: "Fried Calamari",
      description: "Lightly breaded and fried squid",
      price: 10.99,
      category: "Appetizer",
      imageUri: "https://picsum.photos/300/200?food",
    },

    // Entrees
    {
      name: "Spaghetti Bolognese",
      description: "Classic meat sauce with spaghetti",
      price: 16.99,
      category: "Entree",
      imageUri: "https://picsum.photos/300/200?food",
    },
    {
      name: "Chicken Parmesan",
      description: "Breaded chicken cutlet, marinara, mozzarella",
      price: 18.99,
      category: "Entree",
      imageUri: "https://picsum.photos/300/200?food",
    },
    {
      name: "Grilled Salmon",
      description: "With lemon herb butter, seasonal vegetables",
      price: 21.99,
      category: "Entree",
      imageUri: "https://picsum.photos/300/200?food",
    },

    // Desserts
    {
      name: "Tiramisu",
      description: "Classic Italian layered dessert",
      price: 7.99,
      category: "Desserts",
      imageUri: "https://picsum.photos/300/200?food",
    },
    {
      name: "Chocolate Lava Cake",
      description: "Warm molten chocolate cake",
      price: 8.99,
      category: "Desserts",
      imageUri: "https://picsum.photos/300/200?food",
    },
    {
      name: "Gelato",
      description: "Assorted flavors of Italian ice cream",
      price: 6.99,
      category: "Desserts",
      imageUri: "https://picsum.photos/300/200?food",
    },

    // Drinks (Non-Alcoholic)
    {
      name: "Iced Tea",
      description: "Sweet or unsweetened",
      price: 3.5,
      category: "Drinks Non-Alcoholic",
      imageUri: "https://picsum.photos/300/200?drinks",
    },
    {
      name: "Lemonade",
      description: "Freshly squeezed",
      price: 4.5,
      category: "Drinks Non-Alcoholic",
      imageUri: "https://picsum.photos/300/200?drinks",
    },
    {
      name: "Sparkling Water",
      description: "With or without a citrus twist",
      price: 3.99,
      category: "Drinks Non-Alcoholic",
      imageUri: "https://picsum.photos/300/200?drinks",
    },

    // Drinks (Alcoholic)
    {
      name: "Chianti",
      description: "Italian red wine",
      price: 9.99,
      category: "Drinks Alcoholic",
      imageUri: "https://picsum.photos/300/200?wine",
    },
    {
      name: "Pinot Grigio",
      description: "Italian white wine",
      price: 9.99,
      category: "Drinks Alcoholic",
      imageUri: "https://picsum.photos/300/200?wine",
    },
    {
      name: "House Margarita",
      description: "Classic tequila cocktail",
      price: 10.99,
      category: "Drinks Alcoholic",
      imageUri: "https://picsum.photos/300/200?drinks",
    },
  ];

  // // Add mockdata to firestore db
  // const addMockData = async () => {
  //   try {
  //     for (const item of mockMenuItems) {
  //       const menuRef = await addDoc(collection(db, "menuItems"), {
  //         ...item,
  //         restaurantId: currentUserData.uid,
  //       });
  //       console.log(`Menu item added: ${menuRef}`);
  //     }
  //   } catch (error) {
  //     console.error("Error adding mock menu items:", error);
  //   }
  // };

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
      {/* <TouchableOpacity onPress={addMockData}>
        <Text>Run Add Mock data</Text>
      </TouchableOpacity> */}
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
