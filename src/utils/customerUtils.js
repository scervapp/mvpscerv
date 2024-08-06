import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  GeoPoint,
  query,
  where,
  serverTimestamp,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import app, { db } from "../config/firebase";

const fetchRestaurants = async () => {
  try {
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

// Get the checkin Status from firestore
const checkinStatus = async (restaurantId, customerId, onStatusChange) => {
  try {
    const checkinRef = collection(db, "checkIns");
    const q = query(
      checkinRef,
      where("restaurantId", "==", restaurantId),
      where("customerId", "==", customerId)
    );
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      if (!querySnapshot.empty) {
        const checkInDoc = querySnapshot.docs[0];
        const checkInData = checkInDoc.data();

        onStatusChange({
          isCheckedIn: checkInData.status === "ACCEPTED",
          checkInId: checkInDoc.id,
          tableNumber: checkInData.tableNumber,
        });
      } else {
        onStatusChange({ isCheckedIn: false });
      }
    });
    return unsubscribe;
  } catch (error) {}
};

// Checkin functionality
const checkIn = async (restaurantId, customerId, partySize, customerName) => {
  try {
    // 1. Query Firestore to find any existing check-in requests for this user and restaurant
    const checkInsRef = collection(db, "checkIns");
    const q = query(
      checkInsRef,
      where("restaurantId", "==", restaurantId),
      where("customerId", "==", customerId)
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // If a check-in request already exists, update it
      const checkInDoc = querySnapshot.docs[0];
      await updateDoc(checkInDoc.ref, {
        partySize: parseInt(partySize, 10), // Convert to number
        status: "REQUESTED",
        timestamp: new Date(),
      });
      return { success: true, checkInId: checkInDoc.id };
    } else {
      // If no check-in request exists, create a new one
      const checkInRef = doc(collection(db, "checkIns"));
      await setDoc(checkInRef, {
        restaurantId: restaurantId,
        customerId: customerId,
        partySize: parseInt(partySize, 10),
        customerName,
        status: "REQUESTED",
        timestamp: new Date(),
      });
      return { success: true, checkInId: checkInRef.id };
    }
  } catch (error) {
    console.error("Error checking in:", error);
    throw error;
  }
};
// Function to cancel a check-in request
const cancelCheckIn = async (restaurantId, customerId) => {
  try {
    // 1. Query Firestore to find the check-in document
    const checkInsRef = collection(db, "checkIns");
    const q = query(
      checkInsRef,
      where("restaurantId", "==", restaurantId),
      where("customerId", "==", customerId),
      where("status", "==", "REQUESTED") // Only cancel if status is "requested"
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const checkInDoc = querySnapshot.docs[0];

      // 2. Delete the check-in document
      await deleteDoc(doc(db, "checkIns", checkInDoc.id));

      console.log("Check-in request cancelled successfully!");
      return true; // Indicate success
    } else {
      console.warn("No pending check-in request found to cancel.");
      return false; // Indicate no pending request found
    }
  } catch (error) {
    console.error("Error cancelling check-in:", error);
    // You might want to throw the error here to handle it in the calling component
    throw error;
  }
};

export { fetchRestaurants, fetchMenu, checkIn, checkinStatus, cancelCheckIn };
