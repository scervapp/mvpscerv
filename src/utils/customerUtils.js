import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  GeoPoint,
  query,
  where,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import app, { db } from "../config/firebase";

const fetchRestaurants = async () => {
  try {
    console.log("Fetching restaurants...");
    const restaurantRef = collection(db, "restaurants");
    const restaurantSnapshot = await getDocs(restaurantRef);

    const restaurants = restaurantSnapshot.docs.map((doc) => {
      if (doc.exists()) {
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

// Checkin functionality
const checkIn = async (
  restaurantId,
  customerId,
  numberOfPeople,
  customerName
) => {
  try {
    // Set loading state to true

    // Create a new check-in document
    const checkInRef = collection(db, "checkIns");
    const checkInDoc = await addDoc(checkInRef, {
      restaurantId,
      customerId,
      numberOfPeople,
      status: "REQUESTED",
      //firestore time stamp
      timestamp: serverTimestamp(),
      customerName: customerName,
    });

    // create notification for the restaurant
    await addDoc(collection(db, "notifications"), {
      restaurantId,
      customerId,
      checkInId: checkInDoc.id,
      type: "checkIn",
      isRead: false,
      customerName: customerName,
      timestamp: serverTimestamp(),
      status: "pending",
      numberOfPeople: numberOfPeople,
    });

    // Update the local state for immediate UI feedBack
    return { success: true, checkInId: checkInDoc.id };
  } catch (error) {
    console.log("Error checking in:", error);
    throw error;
  }
};

export { fetchRestaurants, fetchMenu, checkIn };
