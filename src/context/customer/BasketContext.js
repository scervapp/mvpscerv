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
} from "firebase/firestore";
import React, { createContext, useState, useEffect, useContext } from "react";
import { db } from "../../config/firebase";
import generateOrderId from "../../utils/generateOrder";

const BasketContext = createContext();

export const BasketProvider = ({ children }) => {
  const [basket, setBasket] = useState([]);
  const [checkedInStatus, setCheckedInStatus] = useState(false);
  const [basketItems, setBasketItems] = useState([]);
  const [isCheckedin, setIsCheckedin] = useState(false);
  const [isSendingToChefsQ, setIsSendingToChefsQ] = useState(false);

  // Fetch the basket items from Firestore

  const fetchBasket = async (restaurantId, customerId) => {
    const basketsRef = collection(db, "baskets");
    const q = query(
      basketsRef,
      where("customerId", "==", customerId),
      where("restaurantId", "==", restaurantId)
    );
    const querySnapshot = await getDocs(q);
    const fetchedBasketItems = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      itemId: doc.id,
      itemName: doc.data().itemName,
      itemPrice: doc.data().itemPrice,
      selectedPeople: doc.data().selectedPeople,
      sentToChefQ: doc.data().sentToChefQ,
      tableNumber: doc.data().tableNumber,
      restaurantId: doc.data().restaurantId,
      customerId: doc.data().customerId,
      timestamp: doc.data().timestamp,
    }));

    setBasketItems(fetchedBasketItems);
    return fetchedBasketItems;
  };

  const addItemToBasket = async (menuItem, selectedPeople, customerId) => {
    const basketItem = {
      itemId: menuItem.id,
      itemName: menuItem.name,
      itemPrice: menuItem.price,
      selectedPeople,
      customerId: customerId,
      restaurantId: menuItem.restaurantId,
    };

    await addDoc(collection(db, "baskets"), basketItem);
    await fetchBasket(menuItem.restaurantId, customerId);
  };

  const removeItemFromBasket = async (
    restaurantId,
    customerId,
    personId,
    itemId
  ) => {
    try {
      const docRef = doc(db, "baskets", itemId);
      await deleteDoc(docRef);
      await fetchBasket(restaurantId, customerId);
    } catch (error) {
      console.error("Error removing item from basket:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "baskets"),
      (querySnapshot) => {
        querySnapshot.docs.forEach(async (doc) => {
          const data = doc.data();
          await fetchBasket(data.restaurantId, data.customerId);
        });
      }
    );
    return () => unsubscribe();
  }, []);

  // Sends the order to the chefs Q
  const sendToChefsQ = async (
    restaurantId,
    customerId,
    tableNumber,
    isCheckedIn
  ) => {
    try {
      setIsSendingToChefsQ(true);

      // 1. Fetch all items associated with the customer and restaurant
      const basketItems = await fetchBasket(restaurantId, customerId);

      // 2. Check if user is checked in (optional, based on your requirements)
      if (!isCheckedIn) {
        console.warn("User is not checked in. Cannot send order.");
        return;
      }

      // 3. Filter basketItems for unsent items
      const unsentBasketItems = basketItems.filter((item) => !item.sentToChefQ);

      // 4. If there are no unsent items, show a message or return
      if (unsentBasketItems.length === 0) {
        console.log("No new items to send to chef's queue.");
        return;
      }

      // 5. Combine unsent basket items into a single order object (sentToChefAt is now at the top level)
      const orderData = {
        customerId,

        restaurantId,
        tableNumber,
        timestamp: serverTimestamp(),
        items: unsentBasketItems.flatMap((item) => {
          return Object.keys(item.selectedPeople)
            .filter((personId) => item.selectedPeople[personId])
            .map((personId) => {
              const pip = item.selectedPeople.find((p) => p.id === personId);
              return {
                itemId: item.itemId,
                itemName: item.itemName,
                itemPrice: item.itemPrice,
                quantity: 1, // Assuming each document represents one quantity
                specialInstructions: item.specialInstructions || "",
                pipName: pip?.name || "Guest",
              };
            });
        }),
        orderStatus: "pending",
        paymentStatus: "unpaid",
        sentToChefAt: serverTimestamp(), // Add the timestamp here
      };

      // 6. Check if an order already exists for this check-in
      const existingOrderQuery = query(
        collection(db, "orders"),
        where("customerId", "==", customerId),
        where("restaurantId", "==", restaurantId),
        where("orderStatus", "==", "pending")
      );
      const existingOrderSnapshot = await getDocs(existingOrderQuery);
      let orderRef; // Reference to the order document

      if (existingOrderSnapshot.empty) {
        orderData.totalPrice = orderData.items.reduce(
          (total, item) => total + item.itemPrice,
          0
        );
        // 7a. No existing order, create a new one
        orderRef = addDoc(collection(db, "orders"), orderData); // Create a new document reference

        // Generate unique order ID here
        const orderId = generateOrderId(customerId, restaurantId);
        orderData.orderId = orderId;
        await setDoc(orderRef, orderData); // Include generated order ID
      } else {
        // 7b. Existing order found, use its reference
        orderRef = existingOrderSnapshot.docs[0].ref;
        const orderSnap = await getDoc(orderRef); // Get the data of the existing order
        orderData.totalPrice = orderData.items.reduce(
          (total, item) => total + item.itemPrice,
          0
        );

        // 8. Update the order with new items and update total price
        await updateDoc(orderRef, {
          items: arrayUnion(...orderData.items),
          totalPrice: orderSnap.data().totalPrice + orderData.totalPrice,
        });
      }

      // 9. Update basketItems in Firestore to mark them as sentToChefQ = true
      const batch = writeBatch(db); // Use a batch write for efficiency
      unsentBasketItems.forEach((item) => {
        const itemRef = doc(db, "baskets", item.id);
        batch.update(itemRef, { sentToChefQ: true, tableNumber: tableNumber });
      });
      await batch.commit();

      // 10. Clear the basket (or just remove the sent items)
      setBasketItems(basketItems.filter((item) => item.sentToChefQ));

      const orderSnap = await getDoc(orderRef);

      const orderId = generateOrderId(
        orderData.customerId,
        orderData.restaurantId,
        orderSnap.data().timestamp
      );
      await updateDoc(orderRef, { orderId });
      console.log("Order sent to chefs Q successfully!");
      return orderRef.id;
    } catch (error) {
      console.error("Error sending order to chefs Q:", error);
      // Handle errors here (e.g., show error message)
    } finally {
      setIsSendingToChefsQ(false);
    }
  };

  return (
    <BasketContext.Provider
      value={{
        setBasket,
        checkedInStatus,
        setCheckedInStatus,
        addItemToBasket,
        removeItemFromBasket,
        basketItems,
        fetchBasket,
        sendToChefsQ,
        isSendingToChefsQ,
      }}
    >
      {children}
    </BasketContext.Provider>
  );
};

export const useBasket = () => useContext(BasketContext);
