import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
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
  const [selectedItems, setSelectedItems] = useState({});
  const [pips, setPips] = useState([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

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
    setSelectedItems((prevItems) => ({
      ...prevItems,
      [menuItem.id]: {
        item: menuItem,
        selectedPeople: {},
      },
    }));
    setIsModalVisible(true);
  };

  const handlePipSelection = (pipId, itemId) => {
    setSelectedItems((prevItems) => ({
      ...prevItems,
      [itemId]: {
        ...prevItems[itemId],
        selectedPeople: {
          ...prevItems[itemId].selectedPeople,
          [pipId]: !prevItems[itemId].selectedPeople[pipId],
        },
      },
    }));
  };

  const closeModal = () => {
    setIsModalVisible(false);
  };

  const confirmAddToBasket = () => {
    const selectedItem = selectedItems[Object.keys(selectedItems).pop()];
    if (selectedItem) {
      const selectPeopleWithName = Object.keys(selectedItem.selectedPeople)
        .filter((pipId) => selectedItem.selectedPeople[pipId])
        .map((pipId) => {
          const pip = pips.find((pip) => pip.id === pipId);
          return { name: pip.name, id: pipId };
        });

      addItemToBasket(
        selectedItem.item,
        selectPeopleWithName,
        currentUserData.uid
      );
      showSnackbar();
      closeModal();
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
      <Modal visible={isModalVisible} onRequestClose={closeModal}>
        <SelectedItemModal
          selectedItem={selectedItems[Object.keys(selectedItems).pop()]}
          handlePipSelection={handlePipSelection}
          pips={pips}
          handleConfirmSelection={confirmAddToBasket}
        />
        <Button onPress={closeModal}>Close Modal</Button>
      </Modal>
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
  modal: {
    width: "80%",
    height: 300,
    alignSelf: "center",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
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
