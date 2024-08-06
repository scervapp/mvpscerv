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
  const [isCheckedin, setIsCheckedin] = useState(false);
  const [isSendingToChefsQ, setIsSendingToChefsQ] = useState(false);

  // Fetch the basket for the logged in user when the component mounts
  useEffect(() => {
    if (currentUser) {
      const fetchBaskets = async () => {
        try {
          const basketsRef = collection(db, "baskets");
          const querySnapshot = await getDoc(doc(basketsRef, currentUser.uid));

          if (querySnapshot.exists()) {
            setBaskets(querySnapshot.data());
          }
        } catch (error) {
          console.error("Error Fetching baskets", error);
          setBasketError(error.message);
        }
      };
      fetchBaskets();
    }
  }, [currentUser]);

  const addItemToBasket = async (
    restaurant,
    dish,
    specialInstructions = ""
  ) => {
    try {
      setBasketError(null); // clear any previous errors
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
        //If the dish exists, update its quantity
        const updatedItem = {
          ...currentBasket.items[existingDishIndex],
          quantity: currentBasket.items[existingDishIndex].quantity + 1,
        };

        // Update the item in the firestore document
        await updateDoc(userBasketRef, {
          [`${restaurantId}.items.${existingDishIndex}`]: updatedItem,
        });

        // update the local state
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

        // Update teh local state
        currentBasket.items.push(newItem);
      }

      // UPdate the overall baskets state
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

      // find the idnex of the dish to remove
      const currentBasket = baskets[restaurantId];
      const dishIndex = currentBasket.items.findIndex(
        (item) => item.dish.id === dishId
      );

      if (dishIndex === -1) {
        // Dish not found. handle accordingly
        setBasketError("Dish not found in basket.");

        console.log("Dish not found in basket.");
        return;
      }

      // Remove the dish from the firestore document
      await updateDoc(userBasketRef, {
        [`${restaurantId}.items`]: arrayRemove(currentBasket.items[dishIndex]),
      });

      // Update the lcoal state
      const updatedItems = currentBasket.items.filter(
        (_, index) => index !== dishIndex
      );
      setBaskets({
        baskfets,
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

  const sendToChefsQ = async (
    restaurantId,
    customerId,
    tableNumber,
    isCheckedIn
  ) => {
    try {
      setIsSendingToChefsQ(true);

      // 1. Check if user is checked in
      if (!isCheckedIn) {
        throw new Error(
          "You must be checked in to this restaurant to place an order."
        );
      }

      // 2. Get the current basket from the BasketContext (assuming you have a way to access it)
      const currentBasket = baskets[restaurantId];

      // 3. If there are no items in the basket, show a message or return
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

  // const fetchBasket = async (restaurantId, customerId) => {
  //   const basketsRef = collection(db, "baskets");
  //   const q = query(
  //     basketsRef,
  //     where("customerId", "==", customerId),
  //     where("restaurantId", "==", restaurantId)
  //   );
  //   const querySnapshot = await getDocs(q);
  //   const fetchedBasketItems = querySnapshot.docs.map((doc) => ({
  //     id: doc.id,
  //     itemId: doc.id,
  //     itemName: doc.data().itemName,
  //     itemPrice: doc.data().itemPrice,
  //     selectedPeople: doc.data().selectedPeople,
  //     sentToChefQ: doc.data().sentToChefQ,
  //     tableNumber: doc.data().tableNumber,
  //     restaurantId: doc.data().restaurantId,
  //     customerId: doc.data().customerId,
  //     timestamp: doc.data().timestamp,
  //   }));

  //   setBasketItems(fetchedBasketItems);
  //   return fetchedBasketItems;
  // };

  // const addItemToBasket = async (menuItem, selectedPeople, customerId) => {
  //   const basketItem = {
  //     itemId: menuItem.id,
  //     itemName: menuItem.name,
  //     itemPrice: menuItem.price,
  //     selectedPeople,
  //     customerId: customerId,
  //     restaurantId: menuItem.restaurantId,
  //   };

  //   await addDoc(collection(db, "baskets"), basketItem);
  //   await fetchBasket(menuItem.restaurantId, customerId);
  // };

  // const removeItemFromBasket = async (
  //   restaurantId,
  //   customerId,
  //   personId,
  //   itemId
  // ) => {
  //   try {
  //     const docRef = doc(db, "baskets", itemId);
  //     await deleteDoc(docRef);
  //     await fetchBasket(restaurantId, customerId);
  //   } catch (error) {
  //     console.error("Error removing item from basket:", error);
  //   }
  // };

  // useEffect(() => {
  //   const unsubscribe = onSnapshot(
  //     collection(db, "baskets"),
  //     (querySnapshot) => {
  //       querySnapshot.docs.forEach(async (doc) => {
  //         const data = doc.data();
  //         await fetchBasket(data.restaurantId, data.customerId);
  //       });
  //     }
  //   );
  //   return () => unsubscribe();
  // }, []);

  // Sends the order to the chefs Q
  // const sendToChefsQ = async (
  //   restaurantId,
  //   customerId,
  //   tableNumber,
  //   isCheckedIn
  // ) => {
  //   try {
  //     setIsSendingToChefsQ(true);

  //     // 1. Fetch all items associated with the customer and restaurant
  //     const basketItems = await fetchBasket(restaurantId, customerId);

  //     // 2. Check if user is checked in (optional, based on your requirements)
  //     if (!isCheckedIn) {
  //       console.warn("User is not checked in. Cannot send order.");
  //       return;
  //     }

  //     // 3. Filter basketItems for unsent items
  //     const unsentBasketItems = basketItems.filter((item) => !item.sentToChefQ);

  //     // 4. If there are no unsent items, show a message or return
  //     if (unsentBasketItems.length === 0) {
  //       console.log("No new items to send to chef's queue.");
  //       return;
  //     }

  //     // 5. Combine unsent basket items into a single order object (sentToChefAt is now at the top level)
  //     const orderData = {
  //       customerId,

  //       restaurantId,
  //       tableNumber,
  //       timestamp: serverTimestamp(),
  //       items: unsentBasketItems.flatMap((item) => {
  //         return Object.keys(item.selectedPeople)
  //           .filter((personId) => item.selectedPeople[personId])
  //           .map((personId) => {
  //             const pip = item.selectedPeople.find((p) => p.id === personId);
  //             return {
  //               itemId: item.itemId,
  //               itemName: item.itemName,
  //               itemPrice: item.itemPrice,
  //               quantity: 1, // Assuming each document represents one quantity
  //               specialInstructions: item.specialInstructions || "",
  //               pipName: pip?.name || "Guest",
  //             };
  //           });
  //       }),
  //       orderStatus: "pending",
  //       paymentStatus: "unpaid",
  //       sentToChefAt: serverTimestamp(), // Add the timestamp here
  //     };

  //     // 6. Check if an order already exists for this check-in
  //     const existingOrderQuery = query(
  //       collection(db, "orders"),
  //       where("customerId", "==", customerId),
  //       where("restaurantId", "==", restaurantId),
  //       where("orderStatus", "==", "pending")
  //     );
  //     const existingOrderSnapshot = await getDocs(existingOrderQuery);
  //     let orderRef; // Reference to the order document

  //     if (existingOrderSnapshot.empty) {
  //       orderData.totalPrice = orderData.items.reduce(
  //         (total, item) => total + item.itemPrice,
  //         0
  //       );
  //       // 7a. No existing order, create a new one
  //       orderRef = addDoc(collection(db, "orders"), orderData); // Create a new document reference

  //       // Generate unique order ID here
  //       const orderId = generateOrderId(customerId, restaurantId);
  //       orderData.orderId = orderId;
  //       await setDoc(orderRef, orderData); // Include generated order ID
  //     } else {
  //       // 7b. Existing order found, use its reference
  //       orderRef = existingOrderSnapshot.docs[0].ref;
  //       const orderSnap = await getDoc(orderRef); // Get the data of the existing order
  //       orderData.totalPrice = orderData.items.reduce(
  //         (total, item) => total + item.itemPrice,
  //         0
  //       );

  //       // 8. Update the order with new items and update total price
  //       await updateDoc(orderRef, {
  //         items: arrayUnion(...orderData.items),
  //         totalPrice: orderSnap.data().totalPrice + orderData.totalPrice,
  //       });
  //     }

  //     // 9. Update basketItems in Firestore to mark them as sentToChefQ = true
  //     const batch = writeBatch(db); // Use a batch write for efficiency
  //     unsentBasketItems.forEach((item) => {
  //       const itemRef = doc(db, "baskets", item.id);
  //       batch.update(itemRef, { sentToChefQ: true, tableNumber: tableNumber });
  //     });
  //     await batch.commit();

  //     // 10. Clear the basket (or just remove the sent items)
  //     setBasketItems(basketItems.filter((item) => item.sentToChefQ));

  //     const orderSnap = await getDoc(orderRef);

  //     const orderId = generateOrderId(
  //       orderData.customerId,
  //       orderData.restaurantId,
  //       orderSnap.data().timestamp
  //     );
  //     await updateDoc(orderRef, { orderId });
  //     console.log("Order sent to chefs Q successfully!");
  //     return orderRef.id;
  //   } catch (error) {
  //     console.error("Error sending order to chefs Q:", error);
  //     // Handle errors here (e.g., show error message)
  //   } finally {
  //     setIsSendingToChefsQ(false);
  //   }
  // };

  return (
    <BasketContext.Provider
      value={{
        setBaskets,
        checkedInStatus,
        setCheckedInStatus,
        addItemToBasket,
        removeItemFromBasket,
        basketItems,

        sendToChefsQ,
        isSendingToChefsQ,
      }}
    >
      {children}
    </BasketContext.Provider>
  );
};

export const useBasket = () => useContext(BasketContext);
