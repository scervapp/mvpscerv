import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { createContext, useState, useEffect, useContext } from "react";
import { db } from "../../config/firebase";

const BasketContext = createContext();

export const BasketProvider = ({ children }) => {
  const [basket, setBasket] = useState([]);
  const [checkedInStatus, setCheckedInStatus] = useState(false);
  const [basketItems, setBasketItems] = useState([]);

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
      }}
    >
      {children}
    </BasketContext.Provider>
  );
};

export const useBasket = () => useContext(BasketContext);
