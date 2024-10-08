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
import app, { db, functions } from "../config/firebase";
import { Alert } from "react-native";
import { httpsCallable } from "firebase/functions";

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
	const [checkInObj, setCheckInObj] = useState(null);

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
						if (checkInData.status === "ACCEPTED") {
							setTableNumber(checkInData.tableNumber);
						} else {
							setTableNumber(null); // Reset tableNumber if not accepted
						}
						if (checkInData) {
							setCheckInObj(checkInData);
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
	return { checkInStatus, isLoading, tableNumber, checkInObj };
};

const checkIn = async (restaurantId, customerId, partySize, customerName) => {
	try {
		const checkInRef = doc(collection(db, "checkIns"));
		await setDoc(checkInRef, {
			restaurantId,
			customerId,
			numberOfPeople: parseInt(partySize, 10),
			customerName,
			status: "pending", // Or any other initial status you prefer
			timestamp: new Date(),
		});

		return { success: true, checkInId: checkInRef.id };
	} catch (error) {
		console.error("Error checking in:", error);
		throw error;
	}
};
// Function to handle canceling a check-in request
const handleCancelCheckIn = async (restaurantId, userId) => {
	try {
		// Call the cancelCheckIn Cloud Function
		const cancelCheckInFunction = httpsCallable(functions, "cancelCheckIn");
		const result = await cancelCheckInFunction({
			userId: userId,
			restaurantId: restaurantId,
		});

		if (result.data.success) {
			// Update local state to reflect cancellation

			Alert.alert("Success", "Your check-in request has been cancelled.");
		} else {
			// Handle cancellation failure
			Alert.alert(
				"Cancellation Failed",
				result.data.error ||
					"Unable to cancel check-in request. Please try again."
			);
		}
	} catch (error) {
		console.error("Error canceling check-in:", error);
		Alert.alert(
			"Error",
			"An error occurred while canceling your check-in request."
		);
	} finally {
	}
};

// Function to transform basket data, grouping items by PIP and calculating totals
// Transform basket data to group items by PIP
const transformBasketData = (basketItems) => {
	const groupedBasketItems = {};

	basketItems.forEach((basketItem) => {
		const pipId = basketItem.pip.id;
		const pipName = basketItem.pip.name;

		if (!groupedBasketItems[pipId]) {
			groupedBasketItems[pipId] = {
				personId: pipId,
				pipName: pipName,
				items: [],
				totalPrice: 0,
			};
		}

		// Check if this dish is already in this person's UNSENT orders
		const existingItemIndex = groupedBasketItems[pipId].items.findIndex(
			(existing) =>
				existing.dish.id === basketItem.dish.id && !existing.sentToChefQ
		);

		if (existingItemIndex > -1 && !basketItem.sentToChefQ) {
			// If the UNSENT dish exists, increment its quantity
			groupedBasketItems[pipId].items[existingItemIndex].quantity += 1;
		} else {
			// If the dish is new or has been sent to the chef's queue, add it as a new entry
			groupedBasketItems[pipId].items.push({ ...basketItem });
		}

		// Update the total price for this person (only for unsent items)
		if (!basketItem.sentToChefQ) {
			groupedBasketItems[pipId].totalPrice +=
				basketItem.dish.price * basketItem.quantity;
		}
	});

	const sortedData = Object.values(groupedBasketItems).sort((a, b) =>
		a.personId.localeCompare(b.personId)
	);
	return sortedData;
};

export {
	fetchRestaurants,
	fetchMenu,
	checkIn,
	handleCancelCheckIn,
	useCheckInStatus,
	transformBasketData,
};
