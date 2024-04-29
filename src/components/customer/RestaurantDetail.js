import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { fetchMenu } from "../../utils/customerUtils";
import MenuItemsList from "./MenuItemsList";

const RestaurantDetail = ({ route }) => {
  // Extract the restaurant data from the route parameters
  const { restaurant } = route.params;
  const [isLoading, setIsLoading] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState("INITIAL");
  const [currentCheckInId, setCurrentCheckInId] = useState(null);
  const [hasPendingCheckIn, setHasPendingCheckIn] = useState(false);
  const [menuItems, setMenuItems] = useState([]);

  const handleCheckin = () => {
    console.log("Checkin button pressed");
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

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.checkInButton}
        onPress={handleCheckin}
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
              <Text style={styles.checkInButtonText}>You Are Checked In!</Text>
            )}
            {checkInStatus === "DECLINED" && (
              <Text style={styles.checkInButtonText}>Check In Declined</Text>
            )}
          </>
        )}
      </TouchableOpacity>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
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
  checkInButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});

export default RestaurantDetail;
