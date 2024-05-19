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
} from "firebase/firestore";
import React, { createContext, useState, useEffect, useContext } from "react";
import { db } from "../../config/firebase";

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
    const basketItems = await fetchBasket(restaurantId, customerId);

    if (!isCheckedIn) return;

    try {
      setIsSendingToChefsQ(true);
      const batch = writeBatch(db);
      const unsentBasketItems = basketItems.filter((item) => !item.sentToChefQ);

      // Only process unsent items
      if (unsentBasketItems.length > 0) {
        unsentBasketItems.forEach((item) => {
          const itemRef = doc(db, "baskets", item.id);
          batch.update(itemRef, {
            sentToChefQ: true,
            tableNumber: tableNumber,
          });
        });
        await batch.commit();
        console.log("Order sent to chefs Q successfully!");
      }

      // basketItems.forEach((item) => {
      //   const itemRef = doc(db, "baskets", item.id);
      //   batch.update(itemRef, { sentToChefQ: true, tableNumber: tableNumber });
      // });
      // await batch.commit();
      // console.log("Order sent to chefs Q successfully!");
    } catch (error) {
      console.error("Error sending order to chefs Q:", error);
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
