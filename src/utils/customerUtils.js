import React, { useState, useEffect } from "react";
import { Alert } from "react-native";

import { db, functions } from "../config/firebase";

const fetchRestaurants = async () => {
	try {
		const restaurantRef = db.collection("restaurants");
		const restaurantSnapshot = await restaurantRef.get();

		const restaurants = restaurantSnapshot.docs
			.map((doc) => {
				if (doc.exists()) {
					const data = doc.data();
					return { id: doc.id, ...data };
				} else {
					console.log("No document found with ID: ", doc.id);
					return null;
				}
			})
			.filter(Boolean);

		return restaurants;
	} catch (error) {
		console.log("Error fetching restaurants:", error);
		throw error;
	}
};

const fetchMenu = async (restaurantId) => {
	try {
		const menuItemRef = db.collection("menuItems");
		const querySnap = menuItemRef.where("restaurantId", "==", restaurantId);
		const menuSnapshot = await querySnap.get();

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

const useCheckInStatus = (restaurantId, userId) => {
	const [checkInStatus, setStatus] = useState("NONE"); // e.g., NONE, REQUESTED, ACCEPTED, ERROR
	const [tableNumber, setTableNumber] = useState(null);
	const [isLoading, setIsLoading] = useState(true); // Start as true when hook is called with valid IDs
	const [checkInObj, setCheckInObj] = useState(null); // Store the full check-in document
	const [error, setError] = useState(null);

	useEffect(() => {
		if (!userId || !restaurantId) {
			setStatus("NONE");
			setTableNumber(null);
			setIsLoading(false);
			setCheckInObj(null);
			setError(null);
			return;
		}

		setIsLoading(true);
		setError(null);

		// --- REFACTORED FIRESTORE QUERY ---
		const checkInsQuery = db
			.collection("checkIns")
			.where("restaurantId", "==", restaurantId)
			.where("customerId", "==", userId)
			.where("status", "in", ["REQUESTED", "ACCEPTED"])
			.limit(1);

		const unsubscribe = checkInsQuery.onSnapshot(
			(querySnapshot) => {
				if (!querySnapshot.empty) {
					const checkInDoc = querySnapshot.docs[0];
					const checkInData = { id: checkInDoc.id, ...checkInDoc.data() };
					setStatus(checkInData.status || "ERROR");
					setTableNumber(checkInData.table?.name || null);
					setCheckInObj(checkInData);
					setError(null);
				} else {
					setStatus("NONE");
					setTableNumber(null);
					setCheckInObj(null);
				}
				setIsLoading(false);
			},
			(err) => {
				console.error("useCheckInStatus Snapshot Error:", err);
				setError("Failed to get check-in status.");
				setStatus("ERROR");
				setIsLoading(false);
			}
		);

		return () => unsubscribe();
	}, [restaurantId, userId]);

	return { checkInStatus, tableNumber, isLoading, checkInObj, error };
};

const checkIn = async (
	restaurantId,
	customerId,
	partySize,
	customerName,
	partyId = null
) => {
	if (!restaurantId || !customerId || !partySize || !customerName) {
		throw new Error("Missing required check-in information.");
	}
	if (isNaN(parseInt(partySize, 10)) || parseInt(partySize, 10) <= 0) {
		throw new Error("Invalid party size.");
	}
	try {
		// --- REFACTORED DOCUMENT CREATION ---
		const checkInRef = db.collection("checkIns").doc(); // Auto-generate ID
		const checkInData = {
			restaurantId,
			customerId,
			numberOfPeople: parseInt(partySize, 10),
			customerName,
			status: "REQUESTED",
			timestamp: firestore.FieldValue.serverTimestamp(), // Use native server timestamp
			type: partyId ? "party" : "individual",
		};

		if (partyId) {
			checkInData.associatedPartyId = partyId;
		}

		await checkInRef.set(checkInData); // Use .set() on the document reference

		const userRef = db.collection("customers").doc(customerId);
		await userRef.update({
			activeCheckIn: {
				restaurantId,
				status: "REQUESTED",
				checkInId: checkInRef.id,
			},
		});

		return { success: true, checkInId: checkInRef.id };
	} catch (error) {
		console.error("Error in checkIn utility:", error);
		throw new Error(`Failed to create check-in request: ${error.message}`);
	}
};
// Function to handle canceling a check-in request
const handleCancelCheckIn = async (restaurantId, userId) => {
	if (!restaurantId || !userId) {
		Alert.alert("Error", "Missing information to cancel check-in.");
		return false;
	}
	try {
		// --- REFACTORED CLOUD FUNCTION CALL ---
		const cancelCheckInFunction = functions.httpsCallable("cancelCheckIn");
		const result = await cancelCheckInFunction({
			userId: userId,
			restaurantId: restaurantId,
		});

		if (result.data.success) {
			// --- REFACTORED FIRESTORE UPDATE ---
			const userRef = db.collection("customers").doc(userId);
			await userRef.update({
				activeCheckIn: firestore.FieldValue.delete(), // Use native delete field value
			});
			Alert.alert("Success", "Your check-in request has been cancelled.");
			return true;
		} else {
			Alert.alert(
				"Cancellation Failed",
				result.data.error || "Unable to cancel check-in request."
			);
			return false;
		}
	} catch (error) {
		console.error("Error canceling check-in:", error);
		Alert.alert(
			"Error",
			`An error occurred: ${error.message || "Please try again."}`
		);
		return false;
	}
};

/**
 * Handles the process of initiating a check-in request, specifically for parties.
 * Calls the core checkIn utility and then activates the party via context function.
 *
 * @param {object} currentUserData - The current user's data object.
 * @param {string} restaurantId - The ID of the restaurant.
 * @param {string|number} partySize - The size of the party.
 * @param {string|null} currentPartyId - The ID of the current party, if any.
 * @param {string|null} partyStatus - The status of the current party, if any.
 * @param {function} activatePartyCheckIn - Function from PartyContext to activate the party.
 * @returns {Promise<boolean>} - True if the check-in request was successfully created, false otherwise.
 *
 */
/**
 * Handles the process of initiating a check-in request for a party.
 * This function has been refactored to use the native Firestore API.
 */
export const handlePartyCheckInRequest = async (
	currentUserData,
	restaurantId,
	partySize,
	currentPartyId,
	partyStatus
) => {
	if (!currentUserData?.uid || !restaurantId) {
		Alert.alert("Error", "User or restaurant data missing.");
		return false;
	}
	if (!currentPartyId || partyStatus !== "pending") {
		Alert.alert("Error", "Cannot check in: No pending party found.");
		return false;
	}

	// --- REFACTORED FIRESTORE READ ---
	const userRef = db.collection("customers").doc(currentUserData.uid);
	try {
		const userSnap = await userRef.get(); // Use .get()
		if (userSnap.exists && userSnap.data().activeCheckIn) {
			const activeCheckInData = userSnap.data().activeCheckIn;
			if (activeCheckInData.restaurantId !== restaurantId) {
				Alert.alert(
					"Check-in Blocked",
					"You already have an active check-in at another restaurant."
				);
				return false;
			}
		}
	} catch (error) {
		console.error("Error checking user's active check-in:", error);
		Alert.alert("Error", "Could not verify current check-in status.");
		return false;
	}

	const customerName = `${currentUserData.firstName || ""} ${
		currentUserData.lastName || ""
	}`.trim();

	try {
		const { success, checkInId } = await checkIn(
			restaurantId,
			currentUserData.uid,
			partySize,
			customerName,
			currentPartyId
		);
		if (success && checkInId) {
			return { success: true, checkInId: checkInId };
		} else {
			Alert.alert("Check-In Failed", "Could not create check-in request.");
			return false;
		}
	} catch (error) {
		console.error("Error during party check-in request:", error);
		Alert.alert(
			"Error",
			`An error occurred while checking in the party: ${error.message}`
		);
		return { success: false, checkInId: null };
	}
};

/**
 * Creates a check-in document in Firestore specifically for a party.
 * @param {string} restaurantId - The ID of the restaurant.
 * @param {string} hostUserId - The Firebase UID of the host creating the check-in.
 * @param {string} hostName - The name of the host.
 * @param {number} partySize - The number of people in the party.
 * @param {string} partyId - The ID of the party this check-in is associated with.
 * @returns {Promise<{success: boolean, checkInId?: string, error?: string}>}
 */
const requestPartyTableCheckIn = async (
	restaurantId,
	hostUserId,
	hostName,
	partySize,
	partyId
) => {
	if (!restaurantId || !hostUserId || !hostName || !partySize || !partyId) {
		return {
			success: false,
			error: "Missing required information for party check-in.",
		};
	}
	if (isNaN(parseInt(partySize, 10)) || parseInt(partySize, 10) <= 0) {
		return { success: false, error: "Invalid party size provided." };
	}

	try {
		// --- REFACTORED DOCUMENT CREATION ---
		const checkInRef = db.collection("checkIns").doc();
		const checkInData = {
			restaurantId: restaurantId,
			customerId: hostUserId,
			customerName: hostName,
			numberOfPeople: parseInt(partySize, 10),
			status: "REQUESTED",
			timestamp: firestore.FieldValue.serverTimestamp(), // Use native server timestamp
			type: "party",
			associatedPartyId: partyId,
		};
		await checkInRef.set(checkInData); // Use .set()
		return { success: true, checkInId: checkInRef.id };
	} catch (error) {
		console.error(
			"requestPartyTableCheckIn: Error creating party check-in document:",
			error
		);
		return {
			success: false,
			error: error.message || "Could not request table for the party.",
		};
	}
};

// Function to transform basket data, grouping items by PIP and calculating totals
// Transform basket data to group items by PIP
// --- NOTE: This will likely need significant changes for the party feature ---
// --- It currently assumes items are grouped by HOST'S placeholder PIPs ---
const transformBasketData = (
	basketItems,
	currentUserId,
	currentUserName = "Your Items"
) => {
	const groupedByPerson = {};

	if (!Array.isArray(basketItems)) {
		console.warn(
			"transformBasketData: basketItems is not an array or is undefined.",
			basketItems
		);
		return [];
	}
	if (!currentUserId) {
		console.warn(
			"transformBasketData: currentUserId is undefined. Items for 'yourself' might not be grouped correctly."
		);
	}

	basketItems.forEach((item) => {
		let personId;
		let personDisplayName;

		if (item.pipId && item.pipName) {
			// Item is for a specific PIP
			personId = item.pipId;
			personDisplayName = item.pipName;
		} else if (item.userId === currentUserId) {
			// Item is for the current logged-in user (no specific PIP assigned)
			personId = currentUserId; // Use current user's ID as the key for their items
			personDisplayName = currentUserName; // e.g., "Baxter's Items" or "Your Items"
		} else {
			// Fallback or unassigned items (should ideally not happen if data is clean)
			console.warn(
				"transformBasketData: Item cannot be clearly assigned to current user or a PIP",
				item
			);
			personId = "unassigned_" + Math.random().toString(); // Avoid collisions
			personDisplayName = "Unassigned";
		}

		if (!groupedByPerson[personId]) {
			groupedByPerson[personId] = {
				personId: personId, // This is the key for the group (either pipId or currentUserId)
				pipName: personDisplayName, // This is the name to display for the section header
				isCurrentUserSection: personId === currentUserId,
				items: [],
				subtotal: 0, // Initialize subtotal for this person
			};
		}

		// Add item to the correct group
		groupedByPerson[personId].items.push(item);

		// Calculate item total and add to person's subtotal
		const itemPrice = item.discount
			? parseFloat(item.discountedPrice) * 100
			: (Number(item.dish?.price) || 0) * 100;
		const quantity = Number(item.quantity) || 1;
		groupedByPerson[personId].subtotal += Math.round(itemPrice) * quantity;
	});

	const result = Object.values(groupedByPerson);

	// Optional: Sort to ensure "Your Items" (current user's section) appears first
	result.sort((a, b) => {
		if (a.isCurrentUserSection && !b.isCurrentUserSection) return -1;
		if (!a.isCurrentUserSection && b.isCurrentUserSection) return 1;
		// Then sort by pipName alphabetically
		if (a.pipName < b.pipName) return -1;
		if (a.pipName > b.pipName) return 1;
		return 0;
	});

	return result;
};

// --- Updated Export List ---
export {
	fetchRestaurants,
	fetchMenu,
	checkIn, // Core check-in creator
	handleCancelCheckIn,
	useCheckInStatus,
	transformBasketData,
	requestPartyTableCheckIn,
};

