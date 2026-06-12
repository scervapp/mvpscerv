import React from "react";
import { Alert } from "react-native";

import * as ImagePicker from "expo-image-picker";
import { nativeStorage, db } from "../config/firebase.native";
import { updateDoc } from "@react-native-firebase/firestore";

/* Uploads an image file to Firebase Storage and returns the download URL.

 *
 * @param {string} uri The local file URI of the image (e.g., from the image picker).
 * @param {string} path The desired path in Firebase Storage (e.g., 'profile-pictures/user123.jpg').
 * @returns {Promise<string>} A promise that resolves with the public download URL of the uploaded image.
 */
export const uploadImageAndGetDownloadURL = async (uri, path) => {
	if (!uri || !path) {
		throw new Error("Image URI and storage path are required.");
	}

	try {
		// --- REFACTORED STORAGE UPLOAD ---
		// 1. Create a reference directly from the storage object.
		const storageRef = nativeStorage.ref(path);

		// 2. Upload the file from the local URI using .putFile().
		// This automatically handles the file type and upload process on native.
		await storageRef.putFile(uri);

		// 3. Get the public download URL for the file.
		const url = await storageRef.getDownloadURL();

		console.log("Successfully uploaded image. URL:", url);
		return url;
	} catch (error) {
		console.error("Error uploading image:", error);
		// Handle specific storage errors if needed
		if (error.code === "storage/unauthorized") {
			throw new Error("You do not have permission to upload to this location.");
		}
		throw new Error("Image upload failed. Please try again.");
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
			mediaTypes:
				ImagePicker.MediaTypeOptions?.Images || ImagePicker.MediaType?.Images,
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
	const tableRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("tables")
		.doc(tableId);

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
		const tablesQuery = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.orderBy("name", "asc");

		const unsubscribe = tablesQuery.onSnapshot(
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
 * Fetches employees from a restaurant's subcollection based on their permission ROLE.
 * This is used for security checks, like seeing if any managers exist.
 * @param {string} restaurantId - The UID of the restaurant.
 * @param {string[]} roles - An array of roles to search for (e.g., ['manager', 'owner']).
 * @returns {Promise<object[]>} A promise that resolves to an array of employee objects.
 */
export const fetchEmployeesByRole = async (restaurantId, roles) => {
	console.log(
		`Fetching employees for restaurant "${restaurantId}" with roles: "${roles.join(
			", "
		)}"`
	);
	if (!restaurantId || !Array.isArray(roles) || roles.length === 0) {
		console.error(
			"fetchEmployeesByRole: restaurantId and a non-empty array of roles are required."
		);
		return [];
	}

	try {
		const employeesRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees");

		// Use the 'in' operator to find any employee whose role is in the provided array
		const snapshot = await employeesRef.where("role", "in", roles).get();
		const employeesList = snapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		}));

		console.log(`Found ${employeesList.length} employees with matching roles.`);
		return employeesList;
	} catch (error) {
		console.error("Error fetching employees by role:", error);
		return [];
	}
};

/**
 * Fetches employees from a restaurant's subcollection based on their operational JOB TITLE.
 * This is used for operational tasks, like assigning a server to a table.
 * @param {string} restaurantId - The UID of the restaurant.
 * @param {string} jobTitle - A specific job title string to filter by (e.g., 'Server').
 * @returns {Promise<object[]>} A promise that resolves to an array of employee objects.
 */
export const fetchEmployeesByJobTitle = async (restaurantId, jobTitle) => {
	console.log(
		`Fetching employees for restaurant "${restaurantId}" with job title: "${jobTitle}"`
	);
	if (!restaurantId || !jobTitle) {
		console.error(
			"fetchEmployeesByJobTitle: restaurantId and jobTitle are required."
		);
		return [];
	}

	try {
		const employeesRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees");

		// Use the '==' operator to find all employees with a specific job title
		const snapshot = await employeesRef.where("jobTitle", "==", jobTitle).get();
		const employeesList = snapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		}));

		console.log(
			`Found ${employeesList.length} employees with matching job title.`
		);
		return employeesList;
	} catch (error) {
		console.error("Error fetching employees by job title:", error);
		return [];
	}
};
/**
 * Fetches employees for a given restaurant, optionally filtering by a single job title or an array of job titles.
 * This function now uses the @react-native- API.
 *
 * @param {string} restaurantId The ID of the restaurant.
 * @param {string|Array<string>} [jobTitles] Optional. A single job title string or an array of job title strings to filter by.
 * @returns {Promise<Array>} A promise that resolves with an array of employee objects.
 */
export const fetchEmployees = async (restaurantId, jobTitles) => {
	console.log(
		`firebaseUtils.fetchEmployees: Fetching for restaurant "${restaurantId}" with jobTitles: "${
			jobTitles || "any"
		}"`
	);

	if (!restaurantId) {
		console.error("fetchEmployees: restaurantId is required.");
		return [];
	}

	try {
		const employeesSubcollectionRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees");
		let employeesQuery;

		// The logic for building the query remains the same.
		if (Array.isArray(jobTitles) && jobTitles.length > 0) {
			console.log("... using 'in' query for multiple job titles.");
			employeesQuery = employeesSubcollectionRef.where(
				"jobTitle",
				"in",
				jobTitles
			);
		} else if (typeof jobTitles === "string" && jobTitles) {
			console.log("... using '==' query for a single job title.");
			employeesQuery = employeesSubcollectionRef.where(
				"jobTitle",
				"==",
				jobTitles
			);
		} else {
			console.log("... no job title filter, fetching all employees.");
			employeesQuery = employeesSubcollectionRef;
		}

		// --- REFACTORED QUERY EXECUTION ---

		const snapshot = await employeesQuery.get();

		// The logic for mapping the results remains the same.
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
		// will provide a direct link to create the necessary Firestore index for `jobTitle`.
		return []; // Return empty array on error
	}
};

// Updatea check-in document with the table information
export const updateCheckIn = async (checkInId, tableId) => {
	console.log("Updating checkin with checkin id", checkInId);
	console.log("Updating checkin with table id", tableId);
	try {
		// --- REFACTORED FIRESTORE UPDATE ---
		// Create the document reference using the native SDK's chained methods
		const checkInRef = db.collection("checkIns").doc(checkInId);
		// Call .update() directly on the reference
		await checkInRef.update({
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
		// --- REFACTORED FIRESTORE UPDATE ---
		const tableRef = db.collection("tables").doc(tableId);
		await tableRef.update({
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
		// --- REFACTORED FIRESTORE QUERY ---
		// Build the query using chained .where() calls
		const notificationQuery = db
			.collection("notifications")
			.where("customerId", "==", customerId)
			.where("type", "==", "checkIn");

		// Execute the query by calling .get()
		const notificationSnapshot = await notificationQuery.get();

		// The loop logic remains the same, but doc.ref is already a valid reference
		notificationSnapshot.forEach(async (doc) => {
			await doc.ref.update({
				tableId: tableId,
				status: "confirmed",
			});
		});
	} catch (error) {
		console.log("Error sending notification", error);
	}
};

