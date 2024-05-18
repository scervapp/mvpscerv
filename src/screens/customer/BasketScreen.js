import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { useBasket } from "../../context/customer/BasketContext";
import { AuthContext } from "../../context/authContext";

const BasketScreen = ({ route }) => {
  const { restaurant } = route.params;
  const { currentUserData } = useContext(AuthContext);
  const { basketItems, fetchBasket, removeItemFromBasket } = useBasket();
  const [filteredBasketData, setFilteredBasketData] = useState([]);

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
    if (filteredBasketData.length > 0) {
      console.log("Sending to chef's queue");
    }
  };

  return (
    <ScrollView style={styles.container}>
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
                  <TouchableOpacity
                    onPress={() =>
                      handleDeleteItem(
                        personData.personId,
                        basketItem.menuItems.id
                      )
                    }
                  >
                    <AntDesign name="delete" size={24} color="red" />
                  </TouchableOpacity>
                  <Text style={styles.itemName}>
                    {basketItem.menuItems.name} x {basketItem.quantity} $
                    {(basketItem.menuItems.price * basketItem.quantity).toFixed(
                      2
                    )}
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
      <TouchableOpacity
        style={[
          styles.sendButton,
          filteredBasketData.length > 0
            ? styles.sendButtonActive
            : styles.sendButtonInactive,
        ]}
        onPress={handleSendToChef}
        disabled={filteredBasketData.length === 0}
      >
        <Text style={styles.sendButtonText}>Send To Chef's Q</Text>
      </TouchableOpacity>
    </ScrollView>
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
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 10,
  },
  sendButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  sendButtonActive: {
    backgroundColor: "#008000",
  },
  sendButtonInactive: {},
});

export default BasketScreen;
