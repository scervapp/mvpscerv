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
export const uploadImage = async (imageUri, storagePath = "default") => {
	if (!imageUri) return null; // check for valid image
	try {
		const response = await fetch(imageUri);
		const blob = await response.blob();
		const filename = imageUri.substring(imageUri.lastIndexOf("/") + 1);
		const storageRef = ref(storage, `${storagePath}/${filename}`);
		//onst imageRef = storageRef.child(`${storagePath}/${filename}`);

		await uploadBytes(storageRef, blob);
		const downloadURL = await getDownloadURL(storageRef);
		return downloadURL;
	} catch (error) {
		console.log("Image upload error", error);
		throw error; // Re throw the error to allow error handling
	}
};

export const pickImage = async () => {
	// Request camera roll permission if needed
	const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
	if (status !== "granted") {
		alert("Permission to access camera roll is required");
		return;
	}

	let result = await ImagePicker.launchImageLibraryAsync({
		mediaTypes: ImagePicker.MediaTypeOptions.Images,
		allowsEditing: false,
		aspect: [4, 3],
		quality: 1,
	});

	if (!result.canceled) {
		return { success: true, imageUri: result.assets[0].uri };
	} else {
		return {
			success: false,
			imageUri: null,
		};
	}
};

// Generates a table for the restaurant if their are none
// This is only for demo purposes
export const generateTables = async (restaurantId) => {
	const tablesRef = collection(db, "restaurants", restaurantId, "tables");
	for (let i = 1; i <= 50; i++) {
		const tableData = {
			name: `Table ${i}`,
			status: "available",
			capacity: 4,
			restaurantId: restaurantId,
		};
		await addDoc(tablesRef, tableData);
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
