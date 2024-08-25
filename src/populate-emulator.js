import admin from "firebase-admin";
import { getFirestore } from "firebase/firestore";

// Import your Firebase app instance from firebase.js
import { db } from "./config/firebase.js";

async function populateEmulator() {
	try {
		// Clear existing data in the emulator (optional)
		// await clearEmulatorData();

		// Populate collections and documents
		for (const collectionName in sampleEmulatorData) {
			// Handle nested collections
			if (collectionName.includes("/")) {
				const [parentCollection, subcollection] = collectionName.split("/");
				const parentDocRef = db.collection(parentCollection).doc(restaurant.id); // Assuming 'restaurant.id' is available
				const subcollectionRef = parentDocRef.collection(subcollection);

				for (const docId in sampleEmulatorData[collectionName]) {
					const docData = sampleEmulatorData[collectionName][docId];
					await subcollectionRef.doc(docId).set(docData);
				}
			} else {
				// Handle top-level collections
				const collectionRef = db.collection(collectionName);
				for (const docId in sampleEmulatorData[collectionName]) {
					const docData = sampleEmulatorData[collectionName][docId];
					await collectionRef.doc(docId).set(docData);
				}
			}
		}

		console.log("Firestore emulator populated successfully!");
	} catch (error) {
		console.error("Error populating Firestore emulator:", error);
	}
}

// Optional function to clear existing emulator data
// ... (you can include the clearEmulatorData function from the previous response if needed)

populateEmulator();
