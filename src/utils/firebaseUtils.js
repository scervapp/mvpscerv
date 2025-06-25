import React from "react";
import app, { db } from "../config/firebase";
import {
	getDownloadURL,
	getStorage,
	ref,
	uploadBytes,
	uploadString,
} from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import {
	addDoc,
	collection,
	query,
	where,
	getDocs,
	updateDoc,
	onSnapshot,
	orderBy,
} from "firebase/firestore";
import { doc } from "firebase/firestore";

const storage = getStorage(app);
/**
 * Uploads an image file to a specified path in Firebase Storage.
 * @param {string} localUri The local URI of the file to upload.
 * @param {string} path The path in Firebase Storage (e.g., 'menuItemImages').
 * @returns {Promise<string>} The public download URL of the uploaded image.
 */
export const uploadImage = async (localUri, path) => {
	try {
		const response = await fetch(localUri);
		const blob = await response.blob();
		const fileRef = ref(
			storage,
			`${path}/${Date.now()}-${Math.random().toString(36).substring(7)}`
		);

		await uploadBytes(fileRef, blob);

		// We're done with the blob, close and release it
		blob.close();

		const downloadURL = await getDownloadURL(fileRef);
		return downloadURL;
	} catch (error) {
		console.error("Error uploading image to Firebase Storage:", error);
		Alert.alert(
			"Upload Failed",
			"There was a problem uploading your image. Please try again."
		);
		throw error; // Re-throw the error to be caught by the caller
	}
};

/**
 * Opens the user's image library to select an image.
 * This version is more robust and handles different response structures from ImagePicker.
 * @returns {Promise<{success: boolean, uri: string|null}>}
 */
export const pickImage = async () => {
	console.log("Pick Image"); // This confirms the function is called

	try {
		const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (status !== "granted") {
			Alert.alert(
				"Permission Denied",
				"Sorry, we need camera roll permissions to make this work!"
			);
			return { success: false, uri: null };
		}

		let result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.Images,
			allowsEditing: true,
			aspect: [1, 1],
			quality: 0.8,
		});

		if (result.canceled) {
			return { success: false, uri: null };
		}

		// --- THIS IS THE FIX ---
		// Older versions of expo-image-picker return the uri directly on the result object.
		// Newer versions return it in an `assets` array. We will safely check for both.
		const uri =
			result.assets && result.assets.length > 0
				? result.assets[0].uri
				: result.uri;

		if (!uri) {
			console.warn("Image picker did not return a valid URI.", result);
			Alert.alert(
				"Error",
				"Could not get the selected image. Please try another one."
			);
			return { success: false, uri: null };
		}

		return { success: true, uri: uri };
	} catch (error) {
		// This will catch any unexpected errors during the picking process.
		console.error("Error inside pickImage function:", error);
		Alert.alert(
			"Error",
			"An unexpected error occurred while picking the image."
		);
		// We throw the error so the calling function's catch block is triggered
		throw error;
	}
};

/**
 * Clears a table's status after it has been cleaned, making it available again.
 *
 * @param {string} tableId The ID of the table document to clear.
 * @param {string} restaurantId The ID of the restaurant.
 * @returns {Promise<void>}
 */
export const clearTable = async (tableId, restaurantId) => {
	if (!tableId || !restaurantId) {
		console.error("clearTable: Missing tableId or restaurantId.");
		throw new Error("Missing required information to clear the table.");
	}

	// Path to the specific table document in the subcollection
	const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);

	console.log(`clearTable: Resetting table ${tableId} to 'available'.`);

	// Resets the status and clears any active session data
	await updateDoc(tableRef, {
		status: "available",
		currentCheckInId: null,
		currentCustomerId: null,
		// We DO NOT nullify 'capacity' or 'name' as those are permanent properties of the table.
	});
};

/**
 * Sets up a real-time listener for tables for a given restaurant.
 * This is a SYNCHRONOUS function that RETURNS the unsubscribe function.
 *
 * @param {string} restaurantId The ID of the restaurant.
 * @param {function} callback A function to be called with the array of tables whenever data changes.
 * @returns {function} The unsubscribe function from onSnapshot to stop the listener.
 */
export const fetchTables = (restaurantId, callback, onError) => {
	console.log(
		`firebaseUtils.fetchTables: Setting up listener for subcollection at "restaurants/${restaurantId}/tables"`
	);

	if (!restaurantId) {
		console.error("fetchTables: restaurantId is missing.");
		if (onError) onError("Restaurant ID is missing.");
		return () => {};
	}

	try {
		// --- CORRECTED PATH TO SUBCOLLECTION ---
		// Instead of collection(db, "tables"), we point to the subcollection.
		const tablesSubcollectionRef = collection(
			db,
			"restaurants",
			restaurantId,
			"tables"
		);

		// The 'where("restaurantId", "==",...)' clause is no longer needed as we are already inside the correct restaurant doc.
		const tablesQuery = query(tablesSubcollectionRef, orderBy("name", "asc")); // Example: order by table name

		const unsubscribe = onSnapshot(
			tablesQuery,
			(snapshot) => {
				const allTables = snapshot.docs
					.map((doc) => ({
						id: doc.id,
						...doc.data(),
					}))
					.filter(Boolean);
				console.log(
					`firebaseUtils.fetchTables: Snapshot received. Found ${allTables.length} tables for restaurant ${restaurantId}.`
				);
				callback(allTables);
			},
			(error) => {
				console.error("Error fetching tables in real-time:", error);
				if (onError) onError("Failed to load tables in real-time.");
				callback([]);
			}
		);

		return unsubscribe;
	} catch (error) {
		console.error("Error setting up table query:", error);
		if (onError)
			onError(
				"An unexpected error occurred while setting up the table listener."
			);
		return () => {};
	}
};
/**
 * Fetches employees for a given restaurant, optionally filtering by a single role or an array of roles.
 *
 * @param {string} restaurantId The ID of the restaurant.
 * @param {string|Array<string>} [roles] Optional. A single role string or an array of role strings to filter by.
 * @returns {Promise<Array>} A promise that resolves with an array of employee objects.
 */
export const fetchEmployees = async (restaurantId, roles) => {
	console.log(
		`firebaseUtils.fetchEmployees: Fetching for restaurant "${restaurantId}" with roles: "${
			roles || "any"
		}"`
	);

	if (!restaurantId) {
		console.error("fetchEmployees: restaurantId is required.");
		return [];
	}

	try {
		const employeesSubcollectionRef = collection(
			db,
			"restaurants",
			restaurantId,
			"employees"
		);
		let employeesQuery;

		// --- THIS IS THE NEW ROBUST LOGIC ---
		if (Array.isArray(roles) && roles.length > 0) {
			// If 'roles' is a non-empty array, use the 'in' operator for the query.
			// This is needed for fetching managers and owners together.
			console.log("... using 'in' query for multiple roles.");
			employeesQuery = query(
				employeesSubcollectionRef,
				where("role", "in", roles)
			);
		} else if (typeof roles === "string" && roles) {
			// If 'roles' is a single string, use the '==' operator for backward compatibility.
			console.log("... using '==' query for a single role.");
			employeesQuery = query(
				employeesSubcollectionRef,
				where("role", "==", roles)
			);
		} else {
			// If no roles are specified, fetch all employees for the restaurant.
			console.log("... no role filter, fetching all employees.");
			employeesQuery = query(employeesSubcollectionRef);
		}
		// --- END OF NEW LOGIC ---

		const snapshot = await getDocs(employeesQuery);
		const employeesList = snapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		}));

		console.log(
			`firebaseUtils.fetchEmployees: Found ${employeesList.length} employees matching query.`
		);
		return employeesList;
	} catch (error) {
		console.error(
			"firebaseUtils.fetchEmployees: Error fetching employees:",
			error
		);
		// This could be a missing index error. The error message in the console
		// will provide a direct link to create the necessary Firestore index.
		return []; // Return empty array on error
	}
};

// Updatea check-in document with the table information
export const updateCheckIn = async (checkInId, tableId) => {
	console.log("Updating checkin with checkin id", checkInId);
	console.log("Updating checkin with table id", tableId);
	try {
		const checkInRef = doc(db, "checkIns", checkInId);
		await updateDoc(checkInRef, {
			status: "ACCEPTED",
			tableId: tableId,
		});
	} catch (error) {
		console.log("Error updating check-in", error);
	}
};

// Update a table document
export const updateTableStatus = async (tableId) => {
	try {
		const tableRef = doc(db, "tables", tableId);
		await updateDoc(tableRef, {
			status: "OCCUPIED",
		});
	} catch (error) {
		console.log("Error updating table", error);
	}
};

export const sendNotification = async (customerId, tableId) => {
	console.log(
		`Sending notifications with this customerId: ${customerId} and TableID: ${tableId}`
	);
	try {
		const notificationQuery = query(
			collection(db, "notifications"),
			where("customerId", "==", customerId),
			where("type", "==", "checkIn")
		);

		const notificationSnapshot = await getDocs(notificationQuery);

		notificationSnapshot.forEach(async (doc) => {
			await updateDoc(doc.ref, {
				tableId: tableId,
				status: "confirmed",
			});
		});
	} catch (error) {
		console.log("Error sending notification", error);
	}
};
