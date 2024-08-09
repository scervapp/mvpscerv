import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import React, { createContext, useState, useEffect, useContext } from "react";
import { db } from "../../config/firebase";
import generateOrderId from "../../utils/generateOrder";
import { AuthContext } from "../authContext";
import { Alert } from "react-native";

const BasketContext = createContext({
  baskets: {},
  addItemToBasket: (restaurant, dish, specialInstructions) => [],
  removeItemFromBasket: (restaurantId, dishId) => {},
  clearBasket: (restaurantId) => {},
  basketError: null,
});

export const BasketProvider = ({ children }) => {
  const { currentUser } = useContext(AuthContext);
  const [baskets, setBaskets] = useState({});
  const [basketError, setBasketError] = useState(null);
  const [checkedInStatus, setCheckedInStatus] = useState(false);
  const [basketItems, setBasketItems] = useState([]);
  const [isSendingToChefsQ, setIsSendingToChefsQ] = useState(false);

  // Fetch the basket for the logged in user when the component mounts
  // Fetch basket data when the component mounts or current user changes
  useEffect(() => {
    let unsubscribe; // Declare unsubscribe variable outside to allow cleanup

    const fetchBaskets = async () => {
      if (!currentUser) {
        return;
      }

      try {
        const userBasketRef = doc(db, "baskets", currentUser.uid);

        unsubscribe = onSnapshot(userBasketRef, (docSnapshot) => {
          console.log("checking for baskets...");
          // Use onSnapshot for real-time updates
          if (docSnapshot.exists()) {
            setBaskets(docSnapshot.data());
            console.log("Baskets we fetched", baskets);
          } else {
            // Handle the case where no basket document exists for the user (e.g., new user)
            // You might want to create an empty basket document here if needed
            // await setDoc(userBasketRef, {});
            setBaskets({}); // Set baskets to an empty object if the document doesn't exist
            console.log("No baskets found", baskets);
          }
          //  setIsLoading(false); // Data fetching is complete, set isLoading to false
        });
      } catch (error) {
        console.error("Error fetching baskets:", error);
        setBasketError(error.message); // Set an error state in your context if you have one
        // You might want to display an error message to the user here
        Alert.alert(
          "Error",
          "Failed to fetch your basket. Please try again later."
        );
      }
    };

    fetchBaskets();

    // Cleanup function to unsubscribe from the listener when the component unmounts or currentUserData changes
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  const addItemToBasket = async (
    restaurant,
    dish,
    specialInstructions = ""
  ) => {
    try {
      setBasketError(null); // Clear previous errors
      if (!currentUser) {
        throw new Error("You need to be logged in to add items to the basket.");
      }

      const restaurantId = restaurant.id;

      // Get the user's basket document reference
      const userBasketRef = doc(db, "baskets", currentUser.uid);

      // Get the current basket or create a new one
      let currentBasket = baskets[restaurantId] || { items: [] };

      // Check if the dish is already in the basket
      const existingDishIndex = currentBasket.items.findIndex(
        (item) => item.dish.id === dish.id
      );

      if (existingDishIndex > -1) {
        // If the dish exists, update its quantity
        const updatedItem = {
          ...currentBasket.items[existingDishIndex],
          quantity: currentBasket.items[existingDishIndex].quantity + 1,
        };

        // Update the item in the firestore document
        await updateDoc(userBasketRef, {
          [`<span class="math-inline">\{restaurantId\}\.items\.</span>{existingDishIndex}`]:
            updatedItem,
        });

        // Update the local state
        currentBasket.items[existingDishIndex] = updatedItem;
      } else {
        // If the dish is new, create a new entry
        const newItem = {
          dish: dish,
          quantity: 1,
          specialInstructions: specialInstructions,
        };

        // Update the Firestore document
        await updateDoc(userBasketRef, {
          [`${restaurantId}.items`]: arrayUnion(newItem),
        });

        // Update the local state
        currentBasket.items.push(newItem);
      }

      // Update the overall baskets state
      setBaskets({ ...baskets, [restaurantId]: currentBasket });
    } catch (error) {
      setBasketError(error.message);
      Alert.alert("Error adding to basket:", error.message);
    }
  };

  const removeItemFromBasket = async (restaurantId, dishId) => {
    try {
      if (!currentUser) {
        throw new Error(
          "You need to be logged in to remove items from the basket."
        );
      }

      const userBasketRef = doc(db, "baskets", currentUser.uid);

      // Find the index of the dish to remove
      const currentBasket = baskets[restaurantId];
      const dishIndex = currentBasket.items.findIndex(
        (item) => item.dish.id === dishId
      );

      if (dishIndex === -1) {
        // Dish not found, handle accordingly (maybe log an error)
        return;
      }

      // Remove the dish from the Firestore document
      await updateDoc(userBasketRef, {
        [`${restaurantId}.items`]: arrayRemove(currentBasket.items[dishIndex]),
      });

      // Update the local state
      const updatedItems = currentBasket.items.filter(
        (_, index) => index !== dishIndex
      );
      setBaskets({
        ...baskets,
        [restaurantId]: { ...currentBasket, items: updatedItems },
      });
    } catch (error) {
      setBasketError(error.message);
      Alert.alert("Error removing from basket:", error.message);
    }
  };

  const clearBasket = (restaurantId) => {
    setBaskets((prevBaskets) => {
      const updatedBaskets = { ...prevBaskets };
      delete updatedBaskets[restaurantId];
      return updatedBaskets;
    });
  };

  const sendToChefsQ = async (restaurantId) => {
    try {
      setIsSendingToChefsQ(true);

      // 1. Check if the user is checked in
      if (!customerCheckIn || customerCheckIn.restaurantId !== restaurantId) {
        throw new Error(
          "You must be checked in to this restaurant to place an order."
        );
      }

      // 2. Get the current basket
      const currentBasket = baskets[restaurantId];

      // 3. If the basket is empty, show a message or return
      if (!currentBasket || currentBasket.items.length === 0) {
        throw new Error(
          "Your basket is empty. Please add items before placing an order."
        );
      }

      // 4. Prepare order data
      const orderData = {
        customerId,
        restaurantId,
        tableNumber,
        timestamp: serverTimestamp(),
        items: currentBasket.items.map((basketItem) => ({
          dishId: basketItem.dish.id,
          quantity: basketItem.quantity,
          specialInstructions: basketItem.specialInstructions || "",
          // Add any other necessary order item details
          pips: basketItem.pips || [], // Include PIPs if available in your basket structure
        })),
        orderStatus: "pending",
        paymentStatus: "unpaid",
        sentToChefAt: serverTimestamp(),
      };

      // 5. Check if an order already exists for this check-in (you'll need to adjust the query based on your data structure)
      const existingOrderQuery = query(
        collection(db, "orders"),
        where("customerId", "==", customerId),
        where("restaurantId", "==", restaurantId),
        where("orderStatus", "==", "pending")
      );
      const existingOrderSnapshot = await getDocs(existingOrderQuery);
      let orderRef;

      if (existingOrderSnapshot.empty) {
        // 6a. No existing order, create a new one
        orderData.totalPrice = orderData.items.reduce(
          (total, item) => total + item.dish.price * item.quantity, // Calculate total price
          0
        );
        orderRef = await addDoc(collection(db, "orders"), orderData);

        // Generate unique order ID here (if needed)
        const orderId = generateOrderId(
          customerId,
          restaurantId,
          orderData.timestamp
        );
        orderData.orderId = orderId;
        await setDoc(orderRef, orderData);
      } else {
        // 6b. Existing order found, use its reference
        orderRef = existingOrderSnapshot.docs[0].ref;
        const existingOrderData = existingOrderSnapshot.docs[0].data();

        // Calculate the price of the new items
        const newItemsTotalPrice = orderData.items.reduce(
          (total, item) => total + item.dish.price * item.quantity,
          0
        );

        // 7. Update the order with new items and update total price
        await updateDoc(orderRef, {
          items: arrayUnion(...orderData.items),
          totalPrice: existingOrderData.totalPrice + newItemsTotalPrice,
          sentToChefAt: serverTimestamp(), // Update timestamp
        });
      }

      // 8. Clear the basket for this restaurant
      clearBasket(restaurantId);

      console.log("Order sent to chefs Q successfully!");
      return orderRef.id; // Return the order ID if needed
    } catch (error) {
      console.error("Error sending order to chefs Q:", error);
      // Handle errors here (e.g., show error message)
      throw error; // Re-throw the error to be handled at a higher level if needed
    } finally {
      setIsSendingToChefsQ(false);
    }
  };

  return (
    <BasketContext.Provider
      value={{
        setBaskets,
        checkedInStatus,
        setCheckedInStatus,
        addItemToBasket,
        removeItemFromBasket,
        basketItems,
        baskets,

        sendToChefsQ,
        isSendingToChefsQ,
      }}
    >
      {children}
    </BasketContext.Provider>
  );
};

export const useBasket = () => useContext(BasketContext);
