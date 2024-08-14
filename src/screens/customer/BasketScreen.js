import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { Ionicons, FontAwesome5, AntDesign } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { Provider, Portal, FAB, Snackbar } from "react-native-paper";
import { Button } from "react-native-elements";
import { useCheckInStatus } from "../../utils/customerUtils";
import { AuthContext } from "../../context/authContext";

const BasketScreen = ({ route, navigation }) => {
  const { currentUserData } = useContext(AuthContext);
  const { restaurant } = route.params;
  const { baskets, basketError, removeItemFromBasket } = useBasket(); // Access baskets from the context
  const [filteredBasketData, setFilteredBasketData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteSnackbar, setShowDeleteSnackbar] = useState(false);
  const { checkInStatus, tableNumber } = useCheckInStatus(
    restaurant.uid,
    currentUserData.uid
  );
  // Retrieve the basket for the current restaurant // Get the basket for the current restaurant
  const restaurantBasket = baskets[restaurant.id] || { items: [] };

  useEffect(() => {
    // Get basket items for the current restaurant
    const restaurantBasketItems = baskets[restaurant.id]?.items || [];

    const transformedData = transformBasketData(restaurantBasketItems);
    const filteredData = transformedData.filter(
      (personData) => personData.items && personData.items.length > 0
    );
    setFilteredBasketData(filteredData);
  }, [baskets, restaurant.id]);

  // Transform basket data to group items by PIP
  const transformBasketData = (basketItems) => {
    const groupedBasketItems = {};

    basketItems.forEach((basketItem) => {
      const pipId = basketItem.pip.id;
      const pipName = basketItem.pip.name;

      if (!groupedBasketItems[pipId]) {
        groupedBasketItems[pipId] = {
          personId: pipId,
          pipName: pipName,
          items: [],
          totalPrice: 0,
        };
      }

      groupedBasketItems[pipId].items.push({
        ...basketItem,
        id: basketItem.id,
      });
      groupedBasketItems[pipId].totalPrice +=
        basketItem.dish.price * basketItem.quantity;
    });

    return Object.values(groupedBasketItems);
  };

  const handleDeleteItem = (basketItem) => {
    setIsLoading(true);
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to remove this item from your basket? ${basketItem.dish.name} for ${basketItem.pip.name}`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          onPress: async () => {
            try {
              await removeItemFromBasket(restaurant.id, basketItem.id);
            } catch (error) {
              console.error("Error deleting item:", error);
              Alert.alert("Error", "Failed to remove item from basket.");
            } finally {
              setIsLoading(false);
              setShowDeleteSnackbar(true); // Show the snackbar
              setTimeout(() => setShowDeleteSnackbar(false), 2000); // Hide after 2 seconds
            }
          },
          style: "destructive", // Use a visually distinct style for the delete action
        },
      ]
    );
    setIsLoading(false);
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
          <Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>
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
                    key={basketItem.id} // Use the basketItem's ID as the key
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
                    <TouchableOpacity
                      icon={<AntDesign name="delete" size={14} color="red" />}
                      onPress={() => handleDeleteItem(basketItem)}
                      style={styles.removeButton}
                    >
                      <AntDesign name="delete" size={16} color="red" />
                    </TouchableOpacity>
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
            <Snackbar
              visible={showDeleteSnackbar}
              onDismiss={() => setShowSnackbar(false)}
            >
              Item removed from basket
            </Snackbar>

            {/* Send to Chef's Q Button (Conditional Rendering) */}
            {checkInStatus === "ACCEPTED" &&
              restaurantBasket.items.length > 0 &&
              !isSendingToChefsQ && (
                <Button
                  mode="contained"
                  onPress={handleSendToChef}
                  loading={isSendingToChefsQ}
                  disabled={isSendingToChefsQ || checkInStatus !== "ACCEPTED"}
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
          disabled={checkInStatus !== "ACCEPTED" || baskets.length === 0}
        />
      </Portal>
    </Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: 20,
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
    marginBottom: 20,
    backgroundColor: colors.lightGray, // Use a light background color for sections
    borderRadius: 8,
    padding: 10,
  },
  personHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  basketItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5, // Reduced margin for tighter spacing
    padding: 10,
  },
  itemInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  dishName: {
    fontSize: 16,
    fontWeight: "500",
  },
  quantity: {
    marginHorizontal: 5,
  },
  itemPrice: {
    fontWeight: "bold",
  },
  specialInstructions: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 5,
  },
  removeButton: {
    backgroundColor: colors.danger,
    borderRadius: 5,
    padding: 5,
    alignSelf: "flex-start",
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
