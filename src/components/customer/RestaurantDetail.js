import React, { useEffect, useState, useContext } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Button,
  ScrollView,
} from "react-native";
import { checkIn, fetchMenu } from "../../utils/customerUtils";
import MenuItemsList from "./MenuItemsList";
import { AuthContext } from "../../context/authContext";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useBasket } from "../../context/customer/BasketContext";

const RestaurantDetail = ({ route, navigation }) => {
  const { currentUserData } = useContext(AuthContext);

  // Extract the restaurant data from the route parameters
  const { restaurant } = route.params;
  const [isLoading, setIsLoading] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState("INITIAL");
  const [currentCheckInId, setCurrentCheckInId] = useState(null);
  const [hasPendingCheckIn, setHasPendingCheckIn] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [partySize, setPartySize] = useState("");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [basketCount, setBasketCount] = useState(4);
  const [tableNumber, setTableNumber] = useState(null);

  const { addItemToBasket } = useBasket();

  const openModal = () => setIsModalVisible(true);
  const closeModal = () => setIsModalVisible(false);
  const handleCheckin = async () => {
    const customerName = `${currentUserData.firstName} ${currentUserData.lastName}`;
    try {
      setIsLoading(true);

      const { success, checkInId } = await checkIn(
        restaurant.id,
        currentUserData.uid,
        partySize,
        customerName
      );
      if (success) {
        setCurrentCheckInId(checkInId);
        setCheckInStatus("REQUESTED");
      } else {
        return;
      }
    } catch (error) {
      console.log("Error checking in:", error);
    } finally {
      setIsLoading(false);
    }
    closeModal();
  };

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const fetchedMenu = await fetchMenu(restaurant.id);
        setMenuItems(fetchedMenu);
      } catch (error) {
        console.log("Error fetching menu:", error);
      }
    };
    loadMenu();
  }, [restaurant.id]);

  // Monitor checkin status for the customer
  useEffect(() => {
    try {
      setIsLoading(true);
      const q = query(
        collection(db, "checkIns"),
        where("restaurantId", "==", restaurant.id),
        where("customerId", "==", currentUserData.uid)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const updateStatus = change.doc.data();
          if (updateStatus.status !== checkInStatus) {
            setCurrentCheckInId(updateStatus.status);
          }
          setCheckInStatus(updateStatus.status);
          setTableNumber(updateStatus.tableNumber);
        });
      });
      return () => unsubscribe();
    } catch (error) {
      console.log("Error monitoring checkin status:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserData.uid, restaurant.id]);

  const navigateToBasketScreen = () => {
    console.log("navigateToBasketScreen");
    navigation.navigate("BasketScreen", {
      restaurant,
      checkInId: currentCheckInId,
    });
  };

  // Floating basket button
  const FloatingBasketButton = () => {
    return (
      <TouchableOpacity
        style={{ backgroundColor: "blue" }}
        onPress={() => navigateToBasketScreen()}
      >
        <View style={styles.fabContainer}>
          <MaterialCommunityIcons name="basket" size={32} color="white" />
          {basketCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{basketCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={[
            styles.checkInButton,
            checkInStatus === "ACCEPTED" && styles.checkInButtonCheckedIn,
          ]}
          onPress={() => openModal()}
          disabled={
            checkInStatus === "ACCEPTED" ||
            isLoading ||
            checkInStatus === "REQUESTED"
          }
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              {checkInStatus === "INITIAL" && (
                <Text style={styles.checkInButtonText}>Check In</Text>
              )}
              {checkInStatus === "REQUESTED" && (
                <>
                  <ActivityIndicator size="small" color="white" />
                  <Text style={styles.checkInButtonText}>
                    Waiting on Restaurant...
                  </Text>
                </>
              )}
              {checkInStatus === "ACCEPTED" && (
                <Text style={styles.checkInButtonText}>
                  You Are Checked In!
                </Text>
              )}
              {checkInStatus === "DECLINED" && (
                <Text style={styles.checkInButtonText}>Check In Declined</Text>
              )}
            </>
          )}
        </TouchableOpacity>
        {isModalVisible && (
          <Modal
            transparent={true}
            style={styles.modalContainer}
            onRequestClose={closeModal}
            isVisible={isModalVisible}
            animationType="fade"
          >
            <View style={styles.modalContent}>
              <Text style={styles.questionText}>How many in your party?</Text>
              <TextInput
                style={styles.input}
                onChangeText={setPartySize}
                keyboardType="numeric"
                placeholder="5"
              />
              <View style={styles.buttonRow}>
                <Button title="Cancel" onPress={closeModal} />
                <Button title="Confirm" onPress={handleCheckin} />
              </View>
            </View>
          </Modal>
        )}

        <Image source={{ uri: restaurant.imageUri }} style={styles.image} />
        <View style={styles.infoContainer}>
          <Text style={styles.name}>{restaurant.restaurantName}</Text>
          <Text style={styles.address}>
            {restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
            {restaurant.zipcode}
          </Text>
          <Text style={styles.cuisine}>Cuisine: {restaurant.cuisineType}</Text>
        </View>
        <Text style={styles.name}>Menu</Text>
        <MenuItemsList menuItems={menuItems} isLoading={isLoading} />
      </ScrollView>
      <FloatingBasketButton />
      <Button
        title="Navigate To Screen"
        onPress={() => navigateToBasketScreen()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 5,
    paddingTop: 20,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
  },
  infoContainer: {
    marginBottom: 20,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 5,
  },
  address: {
    marginBottom: 5,
  },
  cuisine: {
    color: "#666666",
  },

  checkInButton: {
    backgroundColor: "#FF6C44",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },

  checkInButtonCheckedIn: {
    backgroundColor: "green",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  checkInButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },

  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    margin: 0,
  },
  modalContent: {
    alignSelf: "center",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    // Adjust width as needed
    width: "80%",
    // Center the modal
    alignItems: "center",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between", // Space between the buttons
    width: "100%", // Occupy full width of modal
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    borderRadius: 5,
    marginBottom: 20,
    marginTop: 20,
    textAlign: "center",
    fontSize: 18,
  },
  questionText: {
    fontSize: 18, // Adjust the size as desired
    fontWeight: "bold",
    marginBottom: 10, // Add spacing below the text
  },
  fabContainer: {
    backgroundColor: "red", // Your FAB color
    borderRadius: 50,
    padding: 16,
    position: "absolute",
    bottom: 16,
    right: 16,
  },
  badge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "black",
    borderRadius: 10,
    padding: 4,
  },
  badgeText: {
    color: "white",
    fontSize: 12,
  },
});

export default RestaurantDetail;
