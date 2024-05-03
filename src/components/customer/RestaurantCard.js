import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";

const RestaurantCard = ({ restaurant, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.card}>
      <Image source={{ uri: restaurant.imageUri }} style={styles.thumbnail} />
      <View style={styles.infoContainer}>
        <Text style={styles.name}>{restaurant.restaurantName}</Text>
        <Text style={styles.address}>
          {restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
          {restaurant.zipcode}
        </Text>
        <Text style={styles.cuisine}>Cuisine: {restaurant.cuisineType}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    marginBottom: 10,
    elevation: 3, // Add shadow for Android
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
  thumbnail: {
    width: 100,
    height: 100,
    borderRadius: 10,
  },
  infoContainer: {
    flex: 1,
    padding: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
  },
  address: {
    fontSize: 14,
    color: "#666666",
  },
  cuisine: {
    fontSize: 14,
    color: "#666666",
  },
});

export default RestaurantCard;
