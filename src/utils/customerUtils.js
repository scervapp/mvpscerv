import React, { useState, useEffect } from "react";
import {
	collection,
	getDocs,
	query,
	where,
	onSnapshot,
	doc,
	setDoc,
	getDoc,
	updateDoc,
	limit,
} from "firebase/firestore";
import app, { db, functions } from "../config/firebase";
import { Alert } from "react-native";
import { httpsCallable } from "firebase/functions";

const fetchRestaurants = async () => {
	try {
		const restaurantRef = collection(db, "restaurants");
		const restaurantSnapshot = await getDocs(restaurantRef);

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

const useCheckInStatus = (restaurantId, userId) => {
	console.log(
		`--- useCheckInStatus Hook: Initial Call --- R_ID: ${restaurantId}, U_ID: ${userId}`
	); // Log 1: Hook called

	const [checkInStatus, setStatus] = useState("NONE"); // e.g., NONE, REQUESTED, ACCEPTED, ERROR
	const [tableNumber, setTableNumber] = useState(null);
	const [isLoading, setIsLoading] = useState(true); // Start as true when hook is called with valid IDs
	const [checkInObj, setCheckInObj] = useState(null); // Store the full check-in document
	const [error, setError] = useState(null);

	useEffect(() => {
		console.log(
			`useCheckInStatus Effect: Running. R_ID: ${restaurantId}, U_ID: ${userId}`
		); // Log 2: Effect runs

		// --- Handle null inputs gracefully ---
		if (!userId || !restaurantId) {
			console.log(
				"useCheckInStatus Effect: userId or restaurantId is null/undefined. Resetting state and exiting effect."
			); // Log 3
			setStatus("NONE");
			setTableNumber(null);
			setIsLoading(false); // No loading if no IDs
			setCheckInObj(null);
			setError(null);
			return; // Don't proceed to query if IDs are missing
		}
		// --- End null input handling ---

		setIsLoading(true); // Set loading true when we are about to query
		setError(null); // Clear previous errors
		console.log(
			`useCheckInStatus Effect: Setting up Firestore listener for R: ${restaurantId}, U: ${userId}`
		); // Log 4

		const checkInsRef = collection(db, "checkIns");
		// Query for active check-ins (REQUESTED or ACCEPTED) for this user at this restaurant
		const q = query(
			checkInsRef,
			where("restaurantId", "==", restaurantId),
			where("customerId", "==", userId),
			where("status", "in", ["REQUESTED", "ACCEPTED"]), // Only look for active ones
			limit(1) // Should only be one active check-in per user per restaurant
		);

		const unsubscribe = onSnapshot(
			q,
			(querySnapshot) => {
				console.log(
					`useCheckInStatus Snapshot: Received update. Found ${querySnapshot.size} matching check-ins.`
				); // Log 5

				if (!querySnapshot.empty) {
					const checkInDoc = querySnapshot.docs[0];
					const checkInData = { id: checkInDoc.id, ...checkInDoc.data() };
					console.log(
						"useCheckInStatus Snapshot: Check-in found:",
						checkInData
					); // Log 6

					setStatus(checkInData.status || "ERROR"); // Use status from doc, fallback to ERROR
					setTableNumber(checkInData.table?.name || null); // Assuming table is an object with a name
					setCheckInObj(checkInData);
					setError(null);
				} else {
					console.log(
						"useCheckInStatus Snapshot: No active check-in found (REQUESTED or ACCEPTED)."
					); // Log 7
					setStatus("NONE"); // No active check-in means user is not checked in or request was denied/cancelled
					setTableNumber(null);
					setCheckInObj(null);
				}
				setIsLoading(false); // Finished processing snapshot
				console.log("useCheckInStatus Snapshot: setIsLoading(false)"); // Log 8
			},
			(err) => {
				console.error("useCheckInStatus Snapshot Error:", err); // Log 9
				setError("Failed to get check-in status.");
				setStatus("ERROR");
				setTableNumber(null);
				setCheckInObj(null);
				setIsLoading(false);
			}
		);

		// Cleanup function
		return () => {
			console.log(
				`useCheckInStatus Effect Cleanup: Unsubscribing listener for R: ${restaurantId}, U: ${userId}`
			); // Log 10
			unsubscribe();
		};
	}, [restaurantId, userId]); // Dependencies: re-run effect if these change

	// Log the state being returned by the hook
	console.log(
		`--- useCheckInStatus Hook: Returning State --- Status: ${checkInStatus}, Table: ${tableNumber}, Loading: ${isLoading}, Error: ${error}`
	); // Log 11

	return { checkInStatus, tableNumber, isLoading, checkInObj, error };
};

const checkIn = async (
	restaurantId,
	customerId,
	partySize,
	customerName,
	partyId = null
) => {
	// --- Suggestion: Add more validation ---
	if (!restaurantId || !customerId || !partySize || !customerName) {
		throw new Error("Missing required check-in information.");
	}
	if (isNaN(parseInt(partySize, 10)) || parseInt(partySize, 10) <= 0) {
		throw new Error("Invalid party size.");
	}
	try {
		const checkInRef = doc(collection(db, "checkIns"));
		const checkInData = {
			restaurantId,
			customerId,

			numberOfPeople: parseInt(partySize, 10),
			customerName,
			status: "REQUESTING",
			timestamp: new Date(),
			...(partyId && { partyId: partyId }),
		};

		await setDoc(checkInRef, checkInData);

		console.log(`checkIn: Document ${checkInRef.id} created.`);

		// Update user's active checkInStatus
		const userRef = doc(db, "customers", customerId);

		try {
			await updateDoc(userRef, {
				activeCheckIn: {
					restaurantId,
					status: "REQUESTED",
					checkInId: checkInRef.id,
				},
			});
			console.log(`checkIn: Updated activeCheckIn for user ${customerId}.`);
		} catch (userUpdateError) {
			// Log error but don't necessarily fail the whole check-in
			console.error(
				`checkIn: Failed to update activeCheckIn for user ${customerId}:`,
				userUpdateError
			);
		}

		return { success: true, checkInId: checkInRef.id };
	} catch (error) {
		console.error("Error in checkIn utility:", error);
		throw new Error(`Failed to create check-in request: ${error.message}`);
	}
};
// Function to handle canceling a check-in request
const handleCancelCheckIn = async (restaurantId, userId) => {
	// --- Suggestion: Add validation ---
	if (!restaurantId || !userId) {
		Alert.alert("Error", "Missing information to cancel check-in.");
		return false; // Indicate failure
	}
	try {
		// Call the cancelCheckIn Cloud Function
		const cancelCheckInFunction = httpsCallable(functions, "cancelCheckIn");
		const result = await cancelCheckInFunction({
			userId: userId,
			restaurantId: restaurantId,
		});

		if (result.data.success) {
			// Update local state to reflect cancellation
			// --- Client-side update (Optional but good UX) ---
			// Immediately remove the activeCheckIn field from the user's doc locally.
			// The Cloud Function should ALSO do this reliably on the backend.
			try {
				const userRef = doc(db, "customers", userId);
				await updateDoc(userRef, {
					activeCheckIn: FieldValue.delete(),
				});
				console.log(`Client-side: Cleared activeCheckIn for user ${userId}`);
			} catch (clientUpdateError) {
				// Log this error but don't necessarily fail the whole operation,
				// as the backend function is the source of truth.
				console.warn(
					"Client-side activeCheckIn clear failed:",
					clientUpdateError
				);
			}

			Alert.alert("Success", "Your check-in request has been cancelled.");
			return true;
		} else {
			// Handle cancellation failure
			Alert.alert(
				"Cancellation Failed",
				result.data.error ||
					"Unable to cancel check-in request. Please try again."
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
export const handlePartyCheckInRequest = async (
	currentUserData,
	restaurantId,
	partySize,
	currentPartyId,
	partyStatus
) => {
	// --- Validation ---
	if (!currentUserData?.uid || !restaurantId) {
		Alert.alert("Error", "User or restaurant data missing.");
		return false;
	}
	if (!currentPartyId || partyStatus !== "pending") {
		Alert.alert("Error", "Cannot check in: No pending party found.");
		return false;
	}

	// --- Check for existing check-ins at other restaurants (Copied from original handleCheckin) ---
	const userRef = doc(db, "customers", currentUserData.uid);
	try {
		const userSnap = await getDoc(userRef);
		if (userSnap.exists() && userSnap.data().activeCheckIn) {
			// Check BOTH user exists AND activeCheckIn field exists
			const activeCheckInData = userSnap.data().activeCheckIn;
			// Now it's safe to access properties of activeCheckInData
			if (activeCheckInData.restaurantId !== restaurantId) {
				// Fetch the other restaurant's name for a better message
				let otherRestaurantName = "another restaurant";
				try {
					const otherRestRef = doc(
						db,
						"restaurants",
						activeCheckInData.restaurantId
					);
					const otherRestSnap = await getDoc(otherRestRef);
					if (otherRestSnap.exists()) {
						otherRestaurantName =
							otherRestSnap.data().restaurantName || otherRestaurantName;
					}
				} catch (e) {
					/* ignore name fetch error */
				}
				Alert.alert(
					"Check-in Blocked",
					`You already have an active check-in request at ${otherRestaurantName}. Please cancel it or wait for it to complete before checking in here.`
				);
				return false; // Indicate failure
			}
		}
	} catch (error) {
		console.error("Error checking user's active check-in:", error);
		Alert.alert("Error", "Could not verify current check-in status.");
		return false;
	}
	// --- End check ---

	const customerName = `${currentUserData.firstName || ""} ${
		currentUserData.lastName || ""
	}`.trim();

	try {
		// --- Step 1: Call the core checkIn utility, passing partyId ---
		console.log(
			`handlePartyCheckInRequest: Calling core checkIn for party ${currentPartyId}`
		);
		const { success, checkInId } = await checkIn(
			restaurantId,
			currentUserData.uid,
			partySize,
			customerName,
			currentPartyId // <<< Pass partyId to core checkIn
		);

		if (success && checkInId) {
			// --- Step 2: Activate party using the context function ---
			// Note: The checkIn utility already set status to REQUESTED and updated user's activeCheckIn
			console.log(
				`handlePartyCheckInRequest: Check-in ${checkInId} created, attempting to activate party ${currentPartyId}...`
			);

			return { success: true, checkInId: checkInId }; // Indicate overall success
		} else {
			// checkIn utility failed (should have thrown an error, but handle just in case)
			Alert.alert("Check-In Failed", "Could not create check-in request.");
			return false; // Indicate failure
		}
	} catch (error) {
		// Catch errors from checkIn or activatePartyCheckIn
		console.error("Error during party check-in request:", error);
		Alert.alert(
			"Error",
			`An error occurred while checking in the party: ${error.message}`
		);
		return { success: false, checkInId: null }; // Indicate failure
	}
};

// Function to transform basket data, grouping items by PIP and calculating totals
// Transform basket data to group items by PIP
// --- NOTE: This will likely need significant changes for the party feature ---
// --- It currently assumes items are grouped by HOST'S placeholder PIPs ---
const transformBasketData = (basketItems) => {
	const groupedBasketItems = {};

	// --- Guard against non-array input ---
	if (!Array.isArray(basketItems)) {
		console.warn("transformBasketData received non-array:", basketItems);
		return [];
	}

	basketItems.forEach((basketItem) => {
		// --- Safer Access to PIP data ---
		const pipId = basketItem.pip?.id; // Use optional chaining
		const pipName = basketItem.pip?.name; // Use optional chaining

		// --- Handle items potentially missing PIP data ---
		if (!pipId || !pipName) {
			console.warn("Basket item missing valid PIP data:", basketItem);
			// Decide how to handle: skip, group under 'Unknown', or use userId?
			// For now, let's skip items without proper PIP info for grouping.
			return;
		}

		if (!groupedBasketItems[pipId]) {
			groupedBasketItems[pipId] = {
				personId: pipId, // Use pipId as personId for consistency
				pipName: pipName,
				items: [],
				// totalPrice: 0, // Recalculate later if needed
			};
		}

		// --- Simplified Logic: Just add the item ---
		// The previous logic for merging quantities might be incorrect
		// if items can have different statuses (sent/unsent) or special instructions.
		// Let's just add each basketItem instance for now. Display logic can handle summing.
		groupedBasketItems[pipId].items.push({ ...basketItem });

		// --- Remove total price calculation here - do it in useMemo where needed ---
	});

	// Sort by PIP name for consistent display order
	const sortedData = Object.values(groupedBasketItems).sort((a, b) =>
		a.pipName.localeCompare(b.pipName)
	);
	return sortedData;
};

// --- Updated Export List ---
export {
	fetchRestaurants,
	fetchMenu,
	checkIn, // Core check-in creator
	handleCancelCheckIn,
	useCheckInStatus,
	transformBasketData,
};
