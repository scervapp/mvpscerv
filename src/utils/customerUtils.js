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
    console.error("Error fetching menu items:", error);
    // Handle errors based on Firebase error codes
    if (error.code === "permission-denied") {
      throw new Error("You do not have permission to access this menu.");
    } else if (error.code === "unavailable") {
      throw new Error(
        "The menu is currently unavailable. Please try again later."
      );
    } else {
      throw new Error(
        "An error occurred while fetching the menu. Please try again."
      );
    }
  }
};

const useCheckInStatus = (restaurantId, customerId) => {
  const [checkInStatus, setCheckInStatus] = useState(null);
  const [tableNumber, setTableNumber] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCheckInStatus = async () => {
      try {
        setIsLoading(true);

        // Query Firestore for check-ins that match the restaurant and user
        const q = query(
          collection(db, "checkIns"),
          where("restaurantId", "==", restaurantId),
          where("customerId", "==", customerId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            // If a matching check-in is found (regardless of its status)
            const checkInData = snapshot.docs[0].data();
            setCheckInStatus(checkInData.status);

            // Only set tableNumber if the status is "accepted"
            if (checkInData.status === "accepted") {
              setTableNumber(checkInData.tableNumber);
            } else {
              setTableNumber(null); // Reset tableNumber if not accepted
            }
          } else {
            setCheckInStatus("notCheckedIn");
            setTableNumber(null); // Reset tableNumber if no check-in found
          }
        });

        return () => unsubscribe();
      } catch (error) {
        console.error("Error fetching checkin status:", error);
        // Handle the error here (e.g., set an error state or display a message)
      } finally {
        setIsLoading(false);
      }
    };

    fetchCheckInStatus();
  }, [restaurantId, customerId]);
  return { checkInStatus, isLoading };
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
      console.warn("No pending check-in requestg found to cancel.");
      return false; // Indicate no pending request found
    }
  } catch (error) {
    console.error("Error cancelling check-in:", error);
    // You might want to throw the error here to handle it in the calling component
    throw error;
  }
};

export {
  fetchRestaurants,
  fetchMenu,
  checkIn,
  cancelCheckIn,
  useCheckInStatus,
};
