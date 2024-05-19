import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Button, FAB, Portal, Provider } from "react-native-paper";
import { AntDesign, FontAwesome5 } from "@expo/vector-icons";
import { useBasket } from "../../context/customer/BasketContext";
import { AuthContext } from "../../context/authContext";
import { checkinStatus } from "../../utils/customerUtils";

const BasketScreen = ({ route, navigation }) => {
  const { restaurant } = route.params;
  const { currentUserData } = useContext(AuthContext);
  const {
    basketItems,
    fetchBasket,
    removeItemFromBasket,
    sendToChefsQ,
    isSendingToChefsQ,
  } = useBasket();
  const [filteredBasketData, setFilteredBasketData] = useState([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkinDetails, setCheckinDetails] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Helper function to check if there are unsent items
  const hasUnsentItems = () => {
    return filteredBasketData.some((personData) =>
      personData.items.some((item) => !item.menuItems.sentToChefQ)
    );
  };

  // Check the status of the checkin
  useEffect(() => {
    const unsubscribeCheckinStatus = checkinStatus(
      restaurant.uid,
      currentUserData.uid,
      (status) => {
        setIsCheckedIn(status.isCheckedIn);
        setCheckinDetails(status);
      }
    );

    return () => {
      if (typeof unsubscribeCheckinStatus === "function") {
        unsubscribeCheckinStatus();
      } // Clean up the listner
    };
  }, [restaurant.uid, currentUserData.uid]);

  useEffect(() => {
    const fetchBasketData = async () => {
      await fetchBasket(restaurant.uid, currentUserData.uid);
    };

    fetchBasketData();
  }, [restaurant.uid, currentUserData.uid]);

  useEffect(() => {
    const transformBasketData = (basketItems) => {
      const groupedBasketItems = {};

      basketItems.forEach((basketItem) => {
        basketItem.selectedPeople.forEach((person) => {
          const personId = person.id;
          const personName = person.name;

          if (!groupedBasketItems[personId]) {
            groupedBasketItems[personId] = {
              personId: personId,
              pipName: personName,
              items: [],
              totalPrice: 0,
            };
          }

          const existingItemIndex = groupedBasketItems[
            personId
          ].items.findIndex(
            (existing) => existing.menuItems.id === basketItem.itemId
          );

          if (existingItemIndex > -1) {
            groupedBasketItems[personId].items[existingItemIndex].quantity += 1;
          } else {
            groupedBasketItems[personId].items.push({
              menuItems: {
                id: basketItem.itemId,
                name: basketItem.itemName,
                price: basketItem.itemPrice,
                sentToChefQ: basketItem.sentToChefQ,
                tableNumber: basketItem.tableNumber,
              },
              quantity: 1,
            });
          }

          groupedBasketItems[personId].totalPrice += basketItem.itemPrice;
        });
      });

      return Object.values(groupedBasketItems);
    };

    const transformedData = transformBasketData(basketItems);
    const filteredData = transformedData.filter(
      (personData) => personData.items && personData.items.length > 0
    );
    setFilteredBasketData(filteredData);
  }, [basketItems]);

  const handleDeleteItem = async (personId, itemId) => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to remove this item?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            await removeItemFromBasket(
              restaurant.uid,
              currentUserData.uid,
              personId,
              itemId
            );
          },
        },
      ]
    );
  };

  const handleSendToChef = async () => {
    if (filteredBasketData.length > 0 && isCheckedIn) {
      try {
        setIsLoading(true);

        // Send the order to the chef's queue and get the order ID
        const orderId = await sendToChefsQ(
          restaurant.uid,
          currentUserData.uid,
          checkinDetails.tableNumber,
          isCheckedIn
        );

        // Navigate to OrderConfirmationScreen, passing the order ID
        navigation.navigate("CheckoutScreen", { orderId });
      } catch (error) {
        console.error("Error sending to chef's queue:", error);
      } finally {
        setIsLoading(false);
      }
    } else if (!isCheckedIn) {
      Alert.alert("Not Checked In", "Please check in to place an order.");
    }
  };

  return (
    <Provider>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.container}>
        {filteredBasketData.length > 0 ? (
          filteredBasketData.map((personData) => {
            return (
              <View key={personData.personId}>
                <Text style={styles.personHeader}>
                  {personData.pipName} - {personData.totalPrice.toFixed(2)}
                </Text>
                {personData.items.map((basketItem, index) => (
                  <View
                    key={`${personData.personId}_${basketItem.menuItems.id}`}
                    style={styles.menuItemContainer}
                  >
                    {/* Check if the item is sent to the chefs q */}

                    {basketItem.menuItems.sentToChefQ ? (
                      <AntDesign
                        name="checkcircle"
                        size={20}
                        color="green"
                        style={styles.sentToChefsQIcon}
                      />
                    ) : (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() =>
                          handleDeleteItem(
                            personData.personId,
                            basketItem.menuItems.id
                          )
                        }
                      >
                        <AntDesign name="delete" size={20} color="red" />
                      </TouchableOpacity>
                    )}

                    <Text style={styles.itemName}>
                      {basketItem.menuItems.name} x {basketItem.quantity} $
                      {(
                        basketItem.menuItems.price * basketItem.quantity
                      ).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })
        ) : (
          <Text>
            {filteredBasketData.length === 0 ? "Basket is empty" : "Loading..."}
          </Text>
        )}
        {isSendingToChefsQ ? (
          <ActivityIndicator size="large" />
        ) : (
          <TouchableOpacity
            style={[
              styles.sendButton,
              isCheckedIn && hasUnsentItems() && filteredBasketData.length > 0
                ? styles.sendButtonActive
                : styles.sendButtonInactive,
            ]}
            onPress={handleSendToChef}
            disabled={
              filteredBasketData.length === 0 ||
              !isCheckedIn ||
              !hasUnsentItems()
            }
          >
            <Text style={styles.sendButtonText}>Send To Chef's Q</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Portal>
        {/* Use Portal for correct positioning */}
        <Button
          icon={() => (
            <FontAwesome5 name="credit-card" size={20} color="white" />
          )}
          mode="contained"
          style={styles.checkoutButton}
          contentStyle={styles.checkoutButtonContent}
          labelStyle={styles.checkoutButtonLabel}
          onPress={() => navigation.navigate("CheckoutScreen")}
          disabled={!isCheckedIn || filteredBasketData.length === 0} // Disable if not checked in or basket is empty
        >
          Checkout
        </Button>
      </Portal>
    </Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  menuItemContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  personHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 15,
    marginBottom: 5,
  },
  itemName: {
    fontSize: 16,
  },
  sendButton: {
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
  sendButtonActive: {
    backgroundColor: "#008000",
  },
  sendButtonInactive: {
    backgroundColor: "#CCCCCC",
    marginBottom: 20,
  },
  deleteButton: {
    marginRight: 5,
  },
  sentToChefsQIcon: {
    marginRight: 5,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: "#FF6C44", // Example color
  },
  checkoutButton: {
    position: "absolute",
    bottom: 16,
    right: 16,
    alignSelf: "flex-end",
  },
  checkoutButtonContent: {
    flexDirection: "column",
    alignItems: "center", // Center horizontally
    justifyContent: "center", // Center vertically
    height: 80, // Adjust height as needed
  },
  checkoutButtonLabel: {
    marginTop: 8,
  },
});

export default BasketScreen;
