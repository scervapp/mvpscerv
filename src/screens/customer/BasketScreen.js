import React, { useContext } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { Ionicons } from "@expo/vector-icons";

const BasketScreen = ({ route, navigation }) => {
  const { restaurant } = route.params;
  const { baskets } = useBasket(); // Access baskets from the context

  // Retrieve the basket for the current restaurant

  const restaurantBasket = baskets[restaurant.id] || { items: [] };

  return (
    <View style={styles.container}>
      <Text style={styles.restaurantName}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        {restaurant.restaurantName} - Basket
      </Text>

      {/* Conditionally render basket content or empty message */}
      {restaurantBasket.items.length > 0 ? (
        <View>{/* ... (We'll add basket items display here later) */}</View>
      ) : (
        <View style={styles.emptyBasketContainer}>
          <Text style={styles.emptyBasketText}>Basket is empty</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  restaurantName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  emptyBasketContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyBasketText: {
    fontSize: 18,
    textAlign: "center",
    color: "gray",
  },
});

export default BasketScreen;
