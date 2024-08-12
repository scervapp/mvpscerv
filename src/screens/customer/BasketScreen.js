import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
} from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { Ionicons, FontAwesome5, AntDesign } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { Provider, Portal, FAB, IconButton } from "react-native-paper";
import { Button } from "react-native-elements";

const BasketScreen = ({ route, navigation }) => {
  const { restaurant } = route.params;
  const { baskets, basketError } = useBasket(); // Access baskets from the context
  const [filteredBasketData, setFilteredBasketData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState(false);

  // Retrieve the basket for the current restaurant // Get the basket for the current restaurant
  const restaurantBasket = baskets[restaurant.id] || { items: [] };

  useEffect(() => {
    // Transform the basket data and filter out empty groups
    const transformedData = transformBasketData(restaurantBasket.items);
    const filteredData = transformedData.filter(
      (personData) => personData.items && personData.items.length > 0
    );

    setFilteredBasketData(filteredData);
    setIsLoading(false); // Update loading state after data transformation
  }, [baskets, restaurant.id]); // Re-run the effect when baskets or restaurant changes

  const transformBasketData = (basketItems) => {
    const groupedBasketItems = {};

    basketItems.forEach((basketItem) => {
      // Iterate through each selected person for this basket item
      (basketItem.pips || []).forEach((person) => {
        const personId = person.id;
        const personName = person.name;

        // If this person doesn't have a group yet, create one
        if (!groupedBasketItems[personId]) {
          groupedBasketItems[personId] = {
            personId,
            pipName: personName,
            items: [],
            totalPrice: 0,
          };
        }

        // Check if this dish is already in this person's order
        const existingItemIndex = groupedBasketItems[personId].items.findIndex(
          (existing) => existing.dish.id === basketItem.dish.id
        );

        if (existingItemIndex > -1) {
          // If the dish exists, increment its quantity'
          const prevQuantity =
            groupedBasketItems[personId].items[existingItemIndex].quantity;
          groupedBasketItems[personId].items[existingItemIndex].quantity += 1;

          // Update the total price, considering the quantity
          groupedBasketItems[personId].totalPrice +=
            basketItem.dish.price * (basketItem.quantity - prevQuantity); // Multiply price by quantity
        } else {
          // If the dish is new, add it to the person's order
          groupedBasketItems[personId].items.push({
            dish: basketItem.dish,
            quantity: 1,
            specialInstructions: basketItem.specialInstructions || "",
          });
        }

        // Update the total price for this person
        groupedBasketItems[personId].totalPrice += basketItem.dish.price;
      });
    });

    return Object.values(groupedBasketItems);
  };

  // Calculate subtotal and total
  const subtotal = filteredBasketData.reduce(
    (total, personData) => total + personData.totalPrice,
    0
  );
  const tax = subtotal * 0.08; // Example 8% tax (adjust as needed)
  const overallTotal = subtotal + tax;

  return (
    <Provider>
      <View style={styles.container}>
        {/* Header with Restaurant Name */}
        <View style={styles.header}>
          <Text style={styles.restaurantName}>
            {restaurant.restaurantName} Basket
          </Text>
          {basketError && <Text style={styles.errorText}>{basketError}</Text>}
        </View>

        {/* Loading Indicator or Basket Content */}
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : filteredBasketData.length > 0 ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Basket Items Grouped by PIP */}
            {filteredBasketData.map((personData) => (
              <View key={personData.personId} style={styles.personSection}>
                <Text style={styles.personHeader}>
                  {personData.pipName} - ${personData.totalPrice.toFixed(2)}
                </Text>
                {personData.items.map((basketItem) => (
                  <View
                    key={`${personData.personId}_${basketItem.dish.id}`}
                    style={styles.basketItem}
                  >
                    <View style={styles.itemInfoContainer}>
                      <Text style={styles.dishName}>
                        {basketItem.dish.name}
                      </Text>
                      <Text style={styles.quantity}>
                        x {basketItem.quantity}
                      </Text>
                      <Text style={styles.itemPrice}>
                        $
                        {(basketItem.dish.price * basketItem.quantity).toFixed(
                          2
                        )}
                      </Text>
                    </View>

                    {/* Special Instructions (if any) */}
                    {basketItem.specialInstructions && (
                      <Text style={styles.specialInstructions}>
                        {basketItem.specialInstructions}
                      </Text>
                    )}

                    {/* Remove Button */}
                    <Button
                      title="Remove"
                      onPress={() =>
                        handleDeleteItem(
                          personData.personId,
                          basketItem.dish.id
                        )
                      }
                      buttonStyle={styles.removeButton}
                      icon={<AntDesign name="delete" size={14} color="red" />} // Add icon directly
                      iconPosition="left" // Position the icon to the left of the text
                    />
                  </View>
                ))}
              </View>
            ))}

            {/* Overall Order Summary */}
            <View style={styles.orderSummary}>
              <Text>Subtotal: ${subtotal.toFixed(2)}</Text>
              <Text>Tax (8%): ${tax.toFixed(2)}</Text>
              <Text style={styles.totalPrice}>
                Total: ${overallTotal.toFixed(2)}
              </Text>
            </View>

            {/* Send to Chef's Q Button (Conditional Rendering) */}
            {checkInStatus === "accepted" &&
              restaurantBasket.items.length > 0 &&
              !isSendingToChefsQ && (
                <Button
                  mode="contained"
                  onPress={handleSendToChef}
                  loading={isSendingToChefsQ}
                  disabled={isSendingToChefsQ}
                  style={styles.sendButtonActive}
                >
                  Send To Chef's Q
                </Button>
              )}
          </ScrollView>
        ) : (
          <View style={styles.emptyBasketContainer}>
            <Text style={styles.emptyBasketText}>Basket is empty</Text>
          </View>
        )}
      </View>

      {/* Checkout Button (using Portal for positioning) */}
      <Portal>
        <FAB
          icon={() => (
            <FontAwesome5 name="credit-card" size={20} color="white" />
          )}
          style={styles.checkoutButton}
          onPress={() => navigation.navigate("CheckoutScreen")}
          disabled={!checkInStatus === "ACCEPTED" || baskets.length === 0}
        />
      </Portal>
    </Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    flex: 1,
    padding: 8,
    backgroundColor: colors.background, // Use a light background color
  },
  header: {
    marginBottom: 4,
  },
  restaurantName: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    color: colors.primary,
  },
  errorText: {
    color: "red",
    fontSize: 16,
  },
  emptyBasketContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyBasketText: {
    fontSize: 18,
    textAlign: "center",
    color: colors.textLight,
  },
  personSection: {
    marginBottom: 10,
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 10,
  },
  personHeader: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 5,
  },
  basketItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  dishName: {
    fontSize: 12,
    fontWeight: "500", // Slightly less bold than the person header
  },
  quantity: {
    marginHorizontal: 5,
  },
  itemPrice: {
    fontWeight: "bold",
    color: colors.lightGray,
  },
  specialInstructions: {
    fontSize: 14,
    color: colors.textLight,
  },
  removeButton: {
    backgroundColor: colors.danger, // Use a danger color (e.g., red)
    borderRadius: 5,
    padding: 5,
    alighSelf: "flex-start",
  },
  orderSummary: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
    paddingTop: 10,
  },
  totalPrice: {
    fontSize: 18,
    fontWeight: "bold",
  },
  sendButtonActive: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 10,
    marginBottom: 20,
  },
  sendButtonInactive: {
    backgroundColor: colors.gray,
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 10,
    marginBottom: 20,
  },
  sendButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  checkoutButton: {
    position: "absolute",
    bottom: 16,
    right: 16,
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  checkoutButtonContent: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: 80,
  },
  checkoutButtonLabel: {
    marginTop: 8,
    color: "white",
  },
});

export default BasketScreen;
