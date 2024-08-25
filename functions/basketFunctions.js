const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();
// Add Item to Basket
async function addItemToBasket(data, context) {
	const { userId, restaurantId, dish, selectedPIPs } = data;

	try {
		// 1. Input Validation
		if (!context.auth || !context.auth.uid || context.auth.uid !== userId) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated"
			);
		}

		if (!restaurantId || !dish || !dish.id) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided"
			);
		}

		// 2. Get Basket Items Reference
		const basketItemsRef = db
			.collection("baskets")
			.doc(userId)
			.collection("basketItems");

		// 3. Check for Existing Item with the Same PIPs
		const existingItemsQuery = basketItemsRef
			.where("restaurantId", "==", restaurantId)
			.where("dish.id", "==", dish.id)
			.where(
				"pip.id",
				"in",
				selectedPIPs.map((pip) => pip.id)
			);
		const existingItemsSnapshot = await existingItemsQuery.get();

		if (!existingItemsSnapshot.empty) {
			// 4a. If the dish exists for any of the selected PIPs, update its quantity in the first matching instance or create new documents for the rest
			const batch = db.batch();
			let existingItemUpdated = false;

			for (const pip of selectedPIPs) {
				const existingItemForPIP = existingItemsSnapshot.docs.find(
					(doc) => doc.data().pip.id === pip.id
				);

				if (existingItemForPIP && !existingItemUpdated) {
					// Update the quantity of the first matching instance
					batch.update(existingItemForPIP.ref, {
						quantity: admin.firestore.FieldValue.increment(1),
					});
					existingItemUpdated = true;
				} else {
					// Create a new basket item document for this PIP
					const newItemRef = basketItemsRef.doc();
					batch.set(newItemRef, {
						restaurantId,
						dish,
						quantity: 1,
						specialInstructions: "",
						pip,
					});
				}
			}

			await batch.commit();
		} else {
			// 4b. If the dish is new for all selected PIPs, create a new entry for each PIP
			const batch = db.batch();
			selectedPIPs.forEach((pip) => {
				const newItemRef = basketItemsRef.doc();
				batch.set(newItemRef, {
					restaurantId,
					dish,
					quantity: 1,
					specialInstructions: "",
					pip,
				});
			});
			await batch.commit();
		}

		return { success: true };
	} catch (error) {
		console.error("Error adding to basket:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
}

// Remove Item from Basket
async function removeItemFromBasket(data, context) {
	const { userId, restaurantId, basketItemId } = data;

	try {
		// 1. Input Validation
		if (!context.auth || !context.auth.uid || context.auth.uid !== userId) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated"
			);
		}

		if (!restaurantId || !basketItemId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided"
			);
		}

		// 2. Get the basket item document reference
		const basketItemRef = db
			.collection("baskets")
			.doc(userId)
			.collection("basketItems")
			.doc(basketItemId);

		// 3. Check if the basket item exists
		const basketItemSnapshot = await basketItemRef.get();

		if (!basketItemSnapshot.exists()) {
			throw new functions.https.HttpsError(
				"not-found",
				"Basket item not found"
			);
		}

		// 4. If quantity is more than 1, decrement it
		if (basketItemSnapshot.data().quantity > 1) {
			await basketItemRef.update({
				quantity: admin.firestore.FieldValue.increment(-1),
			});
		} else {
			// 5. If quantity is 1, delete the document
			await basketItemRef.delete();
		}

		return { success: true };
	} catch (error) {
		console.error("Error removing from basket:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
}

// Update Basket Item Quantity
async function updateBasketItemQuantity(data, context) {
	const { userId, basketItemId, newQuantity } = data;

	try {
		// 1. Input Validation
		if (!context.auth || !context.auth.uid || context.auth.uid !== userId) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated"
			);
		}

		if (!basketItemId || isNaN(newQuantity) || newQuantity < 0) {
			// Basic validation for newQuantity
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided"
			);
		}

		// 2. Get the basket item document reference
		const basketItemRef = db
			.collection("baskets")
			.doc(userId)
			.collection("basketItems")
			.doc(basketItemId);

		// 3. Check if the basket item exists
		const basketItemSnapshot = await basketItemRef.get();

		if (!basketItemSnapshot.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Basket item not found"
			);
		}

		// 4. If newQuantity is 0, delete the document
		if (newQuantity === 0) {
			await basketItemRef.delete();
		} else {
			// 5. Otherwise, update the quantity
			await basketItemRef.update({ quantity: newQuantity });
		}

		return { success: true };
	} catch (error) {
		console.error("Error updating basket item quantity:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
}

// Clear Basket
async function clearBasket(data, context) {
	const { userId, restaurantId } = data;

	try {
		// 1. Input Validation
		if (!context.auth || !context.auth.uid || context.auth.uid !== userId) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated"
			);
		}

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided"
			);
		}

		// 2. Get the basketItems subcollection reference
		const basketItemsRef = db
			.collection("baskets")
			.doc(userId)
			.collection("basketItems");

		// 3. Query for all basket items for the specified restaurant
		const q = basketItemsRef.where("restaurantId", "==", restaurantId);
		const querySnapshot = await q.get();

		// 4. Delete all matching basket item documents in a batch write
		const batch = db.batch();
		querySnapshot.forEach((doc) => {
			batch.delete(doc.ref);
		});
		await batch.commit();

		return { success: true };
	} catch (error) {
		console.error("Error clearing basket:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
}

exports.addItemToBasket = functions.https.onCall(addItemToBasket);
exports.removeItemFromBasket = functions.https.onCall(removeItemFromBasket);
exports.updateBasketItemQuantity = functions.https.onCall(
	updateBasketItemQuantity
);
exports.clearBasket = functions.https.onCall(clearBasket);
