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
  removeItemFromBasket: (restaurantId, basketItemId) => {},
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
  const [isLoading, setIsLoading] = useState(false);

  // Fetch the basket for the logged in user when the component mounts
  // Fetch basket data when the component mounts or current user changes
  useEffect(() => {
    let unsubscribe;

    const fetchBasketItems = async () => {
      if (!currentUser) {
        setIsLoading(false);
        return;
      }

      try {
        const basketItemsRef = collection(
          db,
          "baskets",
          currentUser.uid,
          "basketItems"
        );

        unsubscribe = onSnapshot(basketItemsRef, (querySnapshot) => {
          const items = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          // Organize items into baskets by restaurantId
          const newBaskets = {};
          items.forEach((item) => {
            const restaurantId = item.restaurantId;
            if (!newBaskets[restaurantId]) {
              newBaskets[restaurantId] = { items: [] };
            }
            newBaskets[restaurantId].items.push(item);
          });

          setBaskets(newBaskets);
          setIsLoading(false);
        });
      } catch (error) {
        console.error("Error fetching basket items:", error);
        setBasketError(error.message);
        Alert.alert(
          "Error",
          "Failed to fetch your basket. Please try again later."
        );
      }
    };

    fetchBasketItems();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  // const addItemToBasket = async (
  //   dish,
  //   selectedPIPs = [],
  //   specialInstructions
  // ) => {
  //   try {
  //     setBasketError(null); // Clear any previous errors

  //     // 1. Validate Input
  //     if (!currentUser) {
  //       throw new Error("You need to be logged in to add items to the basket.");
  //     }

  //     if (!dish.restaurantId) {
  //       throw new Error("Invalid restaurant data.");
  //     }

  //     if (!dish || !dish.id) {
  //       throw new Error("Invalid dish data.");
  //     }

  //     // 2. Prepare Data
  //     const restaurantId = dish.restaurantId;
  //     const userBasketRef = doc(db, "baskets", currentUser.uid);

  //     // Check if the basket document exists
  //     const basketSnapshot = await getDoc(userBasketRef);

  //     if (basketSnapshot.exists()) {
  //       let currentBasket = baskets[restaurantId] || { items: [] };
  //       // 3. Check for Existing Item with the Same PIPs
  //       const existingDishIndex = currentBasket.items.findIndex(
  //         (item) =>
  //           item.dish.id === dish.id &&
  //           JSON.stringify(item.pips) === JSON.stringify(selectedPIPs)
  //       );

  //       if (existingDishIndex > -1) {
  //         // 4a. If the dish with the same PIPs exists, update its quantity
  //         const updatedItem = {
  //           ...currentBasket.items[existingDishIndex],
  //           quantity: currentBasket.items[existingDishIndex].quantity + 1,
  //         };

  //         await updateDoc(userBasketRef, {
  //           [`${restaurantId}.items.${existingDishIndex}`]: updatedItem,
  //         });

  //         currentBasket.items[existingDishIndex] = updatedItem;
  //       } else {
  //         // 4b. If the dish is new or has different PIPs, create a new entry
  //         const newItem = {
  //           dish: dish,
  //           quantity: 1,
  //           specialInstructions: specialInstructions, // You can add special instructions handling here if needed
  //           pips: selectedPIPs,
  //         };

  //         await updateDoc(userBasketRef, {
  //           [`${restaurantId}.items`]: arrayUnion(newItem),
  //         });

  //         currentBasket.items.push(newItem);

  //         // 5. Update the overall baskets state
  //         setBaskets({ ...baskets, [restaurantId]: currentBasket });
  //       }
  //     } else {
  //       // If the basket document doesnt exists, create a new one with the first item
  //       const newBasket = {
  //         [restaurantId]: {
  //           items: [
  //             {
  //               dish,
  //               quantity: 1,
  //               specialInstructions: specialInstructions,
  //               pips: selectedPIPs,
  //             },
  //           ],
  //         },
  //       };
  //       console.log("Trying to add this to basket...", newBasket);
  //       await setDoc(userBasketRef, newBasket);
  //       // Update the localState
  //       setBaskets(newBasket);
  //       console.log("Basket added", newBasket);
  //     }
  //   } catch (error) {
  //     console.error("Error adding to basket:", error);
  //     setBasketError(error.message);
  //     Alert.alert("Error", "Failed to add item to basket. Please try again.");
  //   }
  // };

  const addItemToBasket = async (restaurantId, dish, selectedPIPs = []) => {
    try {
      setBasketError(null);
      if (!currentUser) {
        throw new Error("You need to be logged in to add items to the basket.");
      }

      if (!restaurantId) {
        throw new Error("Invalid restaurant data.");
      }

      if (!dish || !dish.id) {
        throw new Error("Invalid dish data.");
      }

      // Get the user's basketItems subcollection reference
      const basketItemsRef = collection(
        db,
        "baskets",
        currentUser.uid,
        "basketItems"
      );

      // Create a new document for each selected PIP
      const batch = writeBatch(db); // Use a batch write for efficiency
      selectedPIPs.forEach((pip) => {
        const newItemRef = doc(basketItemsRef); // Create a new document reference
        batch.set(newItemRef, {
          restaurantId,
          dish,
          quantity: 1,
          specialInstructions: "",
          pip, // Associate the PIP object with the item
        });
      });

      await batch.commit(); // Execute the batch write

      // Refetch basket data to update the local state (or you can manually update the state if you prefer)
      const userBasketRef = doc(db, "baskets", currentUser.uid);
      const basketSnapshot = await getDoc(userBasketRef);
      if (basketSnapshot.exists()) {
        setBaskets(basketSnapshot.data());
      }
    } catch (error) {
      setBasketError(error.message);
      Alert.alert("Error adding to basket:", error.message);
    }
  };

  const removeItemFromBasket = async (basketItemId) => {
    try {
      if (!currentUser) {
        throw new Error(
          "You need to be logged in to remove items from the basket."
        );
      }

      // Get the basket item document reference
      const basketItemRef = doc(
        db,
        "baskets",
        currentUser.uid,
        "basketItems",
        basketItemId
      );

      // Delete the basket item document
      await deleteDoc(basketItemRef);

      // Refetch basket data to update the local state
      const userBasketRef = doc(db, "baskets", currentUser.uid);
      const basketSnapshot = await getDoc(userBasketRef);
      if (basketSnapshot.exists()) {
        setBaskets(basketSnapshot.data());
      }
    } catch (error) {
      setBasketError(error.message);
      Alert.alert("Error removing from basket:", error.message);
      console.error("Error removing from basket", error);
    }
  };

  const clearBasket = (restaurantId) => {
    setBaskets((prevBaskets) => {
      const updatedBaskets = { ...prevBaskets };
      delete updatedBaskets[restaurantId];
      return updatedBaskets;
    });
  };

  // Handle Quantity Change
  const handleQuantityChange = async (basketItemId, newQuantity) => {
    console.log("New Quantity", newQuantity);
    try {
      if (newQuantity === 0) {
        removeItemFromBasket(basketItemId);
      } else {
        // Ensure newQuantity is within a valid range
        newQuantity = Math.max(0, Math.min(20, newQuantity));

        // Get the basket item document reference
        const basketItemRef = doc(
          db,
          "baskets",
          currentUser.uid,
          "basketItems",
          basketItemId
        );

        // Update the quantity in fireStore
        await updateDoc(basketItemRef, { quantity: newQuantity });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to update item quantity");
      console.error("Error updating quantity", error);
    }
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
        handleQuantityChange,
        basketItems,
        baskets,
        basketError,
        sendToChefsQ,
        isSendingToChefsQ,
      }}
    >
      {children}
    </BasketContext.Provider>
  );
};

export const useBasket = () => useContext(BasketContext);
