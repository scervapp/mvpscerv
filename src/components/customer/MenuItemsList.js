import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { Button, Snackbar } from "react-native-paper";
import { AuthContext } from "../../context/authContext";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import SelectedItemModal from "./SelectedItemModal";

const MenuItemsList = ({ menuItems, isLoading }) => {
  const { currentUserData } = useContext(AuthContext);
  const { addItemToBasket } = useBasket();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedPIPs, setSelectedPIPs] = useState([]);
  const [pips, setPips] = useState([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState("");

  const showSnackbar = () => {
    setSnackbarVisible(true);
    setTimeout(() => {
      setSnackbarVisible(false);
    }, 2000);
  };

  useEffect(() => {
    const fetchPips = async () => {
      const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
      const unsubscribe = onSnapshot(pipsRef, (snapshot) => {
        const pipsArray = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPips(pipsArray);
      });
      return () => unsubscribe();
    };
    fetchPips();
  }, [currentUserData.uid]);

  const handleAddToBasket = (menuItem) => {
    setSelectedItem(menuItem);
    setSelectedPIPs([]);
    setIsModalVisible(true);
  };

  const handlePipSelection = (pipId) => {
    setSelectedPIPs((prevSelectedPIPs) => {
      if (prevSelectedPIPs.some((selectedPip) => selectedPip.id === pipId)) {
        // If already selected, remove it
        return prevSelectedPIPs.filter(
          (selectedPip) => selectedPip.id !== pipId
        );
      } else {
        // If not selected, add it along with the name
        const selectedPip = pips.find((pip) => pip.id === pipId);
        return [...prevSelectedPIPs, { id: pipId, name: selectedPip.name }];
      }
    });
  };

  const closeModal = () => {
    setIsModalVisible(false);
  };
  const confirmAddToBasket = async () => {
    if (selectedItem) {
      try {
        addItemToBasket(
          selectedItem.restaurantId,
          selectedItem,
          selectedPIPs,
          specialInstructions
        ); // Pass selectedPIPs to addItemToBasket
        showSnackbar();
        closeModal();
      } catch (error) {
        console.error("Error adding to basket:", error);
        Alert.alert("Error", "Failed to add item to basket. Please try again.");
      }
    }
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="small" color="#FF6C44" />
      ) : menuItems.length === 0 ? (
        <Text>No menu items found.</Text>
      ) : (
        menuItems.map((item) => (
          <TouchableOpacity
            onPress={() => handleAddToBasket(item)}
            style={styles.menuItem}
            key={item.id}
          >
            <View style={styles.imageContainer}>
              <Image source={{ uri: item.imageUri }} style={styles.image} />
            </View>
            <View style={styles.contentContainer}>
              <Text style={styles.name}>
                {item.name} ${item.price}
              </Text>
              <Text>{item.category}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
      {selectedItem && (
        <SelectedItemModal
          visible={isModalVisible}
          selectedItem={selectedItem}
          handlePIPSelection={handlePipSelection}
          pips={pips}
          selectedPIPs={selectedPIPs}
          onClose={closeModal}
          confirmAddToBasket={confirmAddToBasket}
        />
      )}

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
      >
        <Text>Added to basket</Text>
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: "row",
    padding: 5,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
    marginBottom: 10, // Add margin between items
  },
  imageContainer: {
    width: 75,
    height: 75,
    marginRight: 10,
    borderRadius: 10,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  price: {
    color: "#FF6C44",
  },
  description: {
    fontSize: 14,
    color: "#666666",
  },
  addButton: {
    backgroundColor: "#FF6C44",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
  },
  addButtonText: {
    color: "white",
  },

  checkboxGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  addPersonText: {
    fontSize: 24,
  },
  pipsSelection: {
    marginTop: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  pipWithCheckbox: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export default MenuItemsList;
