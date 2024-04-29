import React from "react";
import {
  collection,
  getDocs,
  GeoPoint,
  query,
  where,
} from "firebase/firestore";
import app, { db } from "../config/firebase";

const fetchRestaurants = async () => {
  try {
    console.log("Fetching restaurants...");
    const restaurantRef = collection(db, "restaurants");
    const restaurantSnapshot = await getDocs(restaurantRef);

    const restaurants = restaurantSnapshot.docs.map((doc) => {
      if (doc.exists()) {
        console.log("Document ID: ", doc.id);
        const data = doc.data();
        return { id: doc.id, ...data };
      } else {
        console.log("No document found with ID: ", doc.id);
      }
    });

    return restaurants;
  } catch (error) {
    console.log("Error fetching restaurants:", error);
    throw error;
  }
};

const fetchMenu = async (restaurantId) => {
  try {
    const menuItemRef = collection(db, "menuItems");
    const querySnap = query(
      menuItemRef,
      where("restaurantId", "==", restaurantId)
    );
    const menuSnapshot = await getDocs(querySnap);

    const menuItems = menuSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return menuItems;
  } catch (error) {
    console.log("Error fetching menu items:", error);
    throw error;
  }
};

export { fetchRestaurants, fetchMenu };
