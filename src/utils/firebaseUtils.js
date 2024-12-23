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

// Fetches the tables for the restaurant
export const fetchTables = async (restaurantId, onTablesFetched) => {
	try {
		const tablesRef = collection(db, "restaurants", restaurantId, "tables");
		const queryTable = query(
			tablesRef,
			where("restaurantId", "==", restaurantId)
		);
		const unsubscribe = onSnapshot(queryTable, (querySnapshot) => {
			const fetchedTables = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));

			// Sort tables by number (assuming table names contain numbers)
			const sortedTables = fetchedTables.sort((a, b) => {
				const numA = parseInt(a.name.match(/\d+/)[0], 10); // Extract numeric value from name
				const numB = parseInt(b.name.match(/\d+/)[0], 10); // Extract numeric value from name
				return numA - numB; // Compare numeric values
			});
			onTablesFetched(sortedTables);
		});
		return unsubscribe;
	} catch (error) {
		console.log("Error fetching tables", error);
	}
};

export const clearTable = async (tableId, restaurantId) => {
	const tableRef = doc(db, `restaurants/${restaurantId}/tables`, tableId);
	await updateDoc(tableRef, {
		status: "available",
		capacity: null,
		numInParty: null,
	});
};

// Fetch employees
export const fetchEmployees = async (restaurantId) => {
	try {
		const employeeRef = collection(
			db,
			"restaurants",
			restaurantId,
			"employees"
		);
		const querySnapshot = await getDocs(employeeRef);
		const fetchedEmployees = querySnapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		}));

		return fetchedEmployees;
	} catch (error) {
		console.error("Error fetching employees:", error);
		throw new Error("Failed to fetch employees. Please try again.");
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
