const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();
/**
 * Adds item(s) to a user's individual basket.
 * If selectedPIPs are provided, creates an item for each.
 * Otherwise, creates one item for the current user.
 *
 * @param {object} data - The data object.
 * @param {string} data.userId - The Firebase UID of the user whose basket it is.
 * @param {string} data.restaurantId - The ID of the restaurant this basket is for.
 * @param {object} data.dish - Core details of the menu item being added.
 * Expected: { id: string (menuItemId), name: string, price: number, category?: string, imageUri?: string, restaurantId: string (original item's restaurant) }
 * @param {number} data.quantity - The quantity for EACH item instance being created.
 * @param {Array<{id: string, name: string, specialInstructions: string}>} [data.selectedPIPs] - Optional. Array of PIPs this item is for.
 * If a PIP object has an ID matching data.userId, it's considered for "Myself".
 * @param {string} [data.generalSpecialInstructions] - Optional. General notes if no PIPs or for "Myself" if not in selectedPIPs.
 * @param {object} [data.table] - Optional table information.
 * @param {object} [data.server] - Optional server information.
 * @param {object} context - The Firebase Functions context object.
 * @param {object} context.auth - The authenticated user information.
 * @returns {Promise<{success: boolean, basketItemIds?: string[], error?: string}>}
 */
async function addItemToBasket(data, context) {
	// 1. Authentication Check
	if (!context.auth || !context.auth.uid) {
		console.error("addItemToBasket: Authentication failed.");
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	// Ensure the userId in data matches the authenticated user, or allow admin override if needed
	if (context.auth.uid !== data.userId) {
		// Potentially check for admin role if you want admins to add to other users' baskets
		console.error(
			"addItemToBasket: Authenticated user does not match userId in data."
		);
		throw new functions.https.HttpsError(
			"permission-denied",
			"User can only add items to their own basket."
		);
	}

	// 2. Input Validation
	const {
		userId,
		restaurantId, // The ID of the restaurant this basket is associated with
		dish,
		quantity,
		selectedPIPs = [], // Default to empty array
		generalSpecialInstructions = "",
		table, // Optional
		server, // Optional
	} = data;

	if (
		!userId ||
		!restaurantId ||
		!dish ||
		!dish.id ||
		typeof dish.price !== "number" ||
		typeof quantity !== "number" ||
		quantity <= 0
	) {
		console.error("addItemToBasket: Invalid input.", {
			userId,
			restaurantId,
			dish,
			quantity,
		});
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing or invalid required fields (userId, restaurantId, dish details, quantity)."
		);
	}

	const basketCollectionRef = db.collection("baskets");
	const timestamp = admin.firestore.FieldValue.serverTimestamp();
	const createdBasketItemIds = [];

	try {
		const batch = db.batch(); // Use a batch for multiple writes if selectedPIPs is used

		if (selectedPIPs && selectedPIPs.length > 0) {
			// Scenario 1: Items are for specific PIPs (or "Myself" if included in selectedPIPs)
			console.log(
				`addItemToBasket: Adding items for ${selectedPIPs.length} selected targets (PIPs/Myself). Quantity per target: ${quantity}`
			);

			for (const pipTarget of selectedPIPs) {
				if (!pipTarget || !pipTarget.id || !pipTarget.name) {
					console.warn(
						"addItemToBasket: Skipping invalid pipTarget in selectedPIPs array:",
						pipTarget
					);
					continue; // Skip malformed PIP objects
				}

				const basketItemRef = basketCollectionRef.doc(); // Generate new unique ID for each basket item
				createdBasketItemIds.push(basketItemRef.id);

				const basketItemData = {
					userId: userId, // The main user who owns this basket/order
					restaurantId: restaurantId, // Restaurant this basket is for
					menuItemId: dish.id,
					dish: {
						// Store a denormalized copy of essential dish info
						name: dish.name,
						price: dish.price, // Price per unit at time of adding
						category: dish.category || null,
						// imageUri: dish.imageUri || null, // Optional
					},
					quantity: quantity,
					pipId: pipTarget.id, // ID of the PIP (or currentUserId if it's for "Myself")
					pipName: pipTarget.name, // Name of the PIP (or "Myself")
					specialInstructions: pipTarget.specialInstructions || "", // PIP-specific instructions
					table: table || null,
					server: server || null,
					createdAt: timestamp,
					updatedAt: timestamp,
					status: "new", // Or your default status for newly added items
					sentToChefQ: false, // Default for new items
					// Add originalRestaurantId from dish if it's different from the basket's restaurantId (e.g. virtual kitchen)
					originalDishRestaurantId: dish.restaurantId || restaurantId,
				};
				batch.set(basketItemRef, basketItemData);
				console.log(
					`addItemToBasket: Queued item for PIP: ${pipTarget.name} (ID: ${pipTarget.id}) with quantity ${quantity}`
				);
			}
		} else {
			// Scenario 2: Item is for the current user, no specific PIPs selected (or "Myself" was the only implicit target)
			console.log(
				`addItemToBasket: Adding single item for user ${userId}. Quantity: ${quantity}`
			);
			const basketItemRef = basketCollectionRef.doc();
			createdBasketItemIds.push(basketItemRef.id);

			const basketItemData = {
				userId: userId,
				restaurantId: restaurantId,
				menuItemId: dish.id,
				dish: {
					name: dish.name,
					price: dish.price,
					category: dish.category || null,
					// imageUri: dish.imageUri || null,
				},
				quantity: quantity,
				pipId: null, // No specific PIP
				pipName: null, // No specific PIP
				specialInstructions: generalSpecialInstructions || "", // General instructions
				table: table || null,
				server: server || null,
				createdAt: timestamp,
				updatedAt: timestamp,
				status: "new",
				sentToChefQ: false,
				originalDishRestaurantId: dish.restaurantId || restaurantId,
			};
			batch.set(basketItemRef, basketItemData);
		}

		await batch.commit();
		console.log(
			`addItemToBasket: Successfully committed ${createdBasketItemIds.length} item(s) to basket for user ${userId}. IDs:`,
			createdBasketItemIds
		);
		return { success: true, basketItemIds: createdBasketItemIds };
	} catch (error) {
		console.error(
			`addItemToBasket: Error processing request for user ${userId}:`,
			error
		);
		if (error instanceof functions.https.HttpsError) {
			throw error; // Re-throw HttpsErrors
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to add item(s) to basket.",
			error.message
		);
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
		const basketItemRef = db.collection("baskets").doc(basketItemId);

		// 3. Check if the basket item exists
		const basketItemSnapshot = await basketItemRef.get();

		if (!basketItemSnapshot.exists) {
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
		const basketItemRef = db.collection("baskets").doc(basketItemId);

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
			.where("userId", "==", userId)
			.where("restaurantId", "==", restaurantId);

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

async function sendToChefsQ(data, context) {
	const { userId, restaurantId, items, server, table } = data;

	try {
		if (
			!restaurantId ||
			!items ||
			!Array.isArray(items) ||
			items.length === 0
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided"
			);
		}

		const unsentItems = items.filter((item) => !item.sentToChefQ);

		// 2. Update basketItems in Firestore to mark them as sentToChefQ = true
		const batch = db.batch();
		unsentItems.forEach((item) => {
			const basketItemRef = db.collection("baskets").doc(item.id);
			batch.update(basketItemRef, {
				sentToChefQ: true,
				server: server,
				table: table,
				sentToChefQAt: admin.firestore.FieldValue.serverTimestamp(),
				itemStatus: "pending",
			});
		});
		await batch.commit();

		// 3. Optionally, send notifications to the restaurant staff
		// ...

		return { success: true };
	} catch (error) {
		console.error("Error sending items to chef's queue:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
}

/**
 * Adds a menu item to a shared party basket.
 *
 * @param {object} data - The data object.
 * @param {string} data.partyId - The ID of the party.
 * @param {string} data.orderingForUserId - The Firebase UID of the user ordering the item.
 * @param {string} [data.orderingForPipName] - The name of the PIP if the host is ordering for them.
 * @param {object} data.menuItemData - The details of the menu item being added.
 * Expected structure: {
 * id: string, // menuItemId from your menu
 * name: string, // dishName
 * price: number,
 * quantity: number,
 * specialInstructions?: string,
 * // any other relevant menuItem fields you want to store
 * }
 * @param {object} context - The Firebase Functions context object.
 * @param {object} context.auth - The authenticated user information.
 * @returns {Promise<{success: boolean, basketItemId?: string, error?: string}>}
 */
exports.addItemToSharedBasket = functions.https.onCall(
	async (data, context) => {
		// 1. Authentication Check
		if (!context.auth || !context.auth.uid) {
			console.error(
				"addItemToSharedBasket: Authentication failed. User not logged in."
			);
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated to add items to a party basket."
			);
		}
		const currentUserId = context.auth.uid; // User calling the function

		// 2. Input Validation
		const {
			partyId,
			orderingForUserId, // This is who the item is for
			orderingForPipName, // Optional: if host adds for a local PIP
			menuItemData,
		} = data;

		if (!partyId || typeof partyId !== "string") {
			console.error(
				"addItemToSharedBasket: Invalid input - partyId missing or invalid.",
				data
			);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID is required."
			);
		}
		if (!orderingForUserId || typeof orderingForUserId !== "string") {
			console.error(
				"addItemToSharedBasket: Invalid input - orderingForUserId missing or invalid.",
				data
			);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Ordering user ID is required."
			);
		}
		if (
			!menuItemData ||
			typeof menuItemData.id !== "string" ||
			typeof menuItemData.name !== "string" ||
			typeof menuItemData.price !== "number" ||
			typeof menuItemData.quantity !== "number" ||
			menuItemData.quantity <= 0
		) {
			console.error(
				"addItemToSharedBasket: Invalid input - menuItemData is incomplete or invalid.",
				data
			);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Valid menu item data (id, name, price, quantity) is required."
			);
		}

		const sharedBasketRef = db.collection("shared_baskets").doc(partyId);

		try {
			// 3. Check if the party and shared basket exist (optional, but good practice)
			const basketDoc = await sharedBasketRef.get();
			if (!basketDoc.exists) {
				console.error(
					`addItemToSharedBasket: Shared basket for partyId ${partyId} not found.`
				);
				throw new functions.https.HttpsError(
					"not-found",
					"Party basket not found. The party may have ended or not exist."
				);
			}

			// 4. Construct the new basket item
			const basketItemId = db.collection("dummy").doc().id; // Generate a unique ID for the basket item
			const newItem = {
				id: basketItemId, // Unique ID for this instance in the basket
				menuItemId: menuItemData.id,
				dishName: menuItemData.name, // Store essential details directly
				price: menuItemData.price, // Price per unit at the time of adding
				quantity: menuItemData.quantity,
				specialInstructions: menuItemData.specialInstructions || "",
				orderedByUserId: orderingForUserId,
				orderedByPipName: orderingForPipName || null, // Store PIP name if provided
				addedByUserId: currentUserId, // Who actually performed the add action (could be host adding for someone else)
				addedAt: admin.firestore.FieldValue.serverTimestamp(),
				status: "new", // Initial status (e.g., 'new', 'sentToChefQ', 'confirmedByKitchen')
				// You might want to copy other relevant details from menuItemData if needed
				// e.g., category, description (if short), imageUri (if small/thumbnail)
			};

			console.log(
				`addItemToSharedBasket: Adding new item to party ${partyId}:`,
				newItem
			);

			// 5. Atomically add the new item to the 'items' array in the shared basket
			await sharedBasketRef.update({
				items: admin.firestore.FieldValue.arrayUnion(newItem),
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			});

			console.log(
				`addItemToSharedBasket: Item ${basketItemId} successfully added to shared basket for party ${partyId}.`
			);
			return { success: true, basketItemId: basketItemId };
		} catch (error) {
			console.error(
				`addItemToSharedBasket: Error adding item to party ${partyId}:`,
				error
			);
			if (error instanceof functions.https.HttpsError) {
				throw error; // Re-throw HttpsErrors
			}
			throw new functions.https.HttpsError(
				"internal",
				"Failed to add item to party basket.",
				error.message
			);
		}
	}
);

exports.addItemToBasket = functions.https.onCall(addItemToBasket);
exports.removeItemFromBasket = functions.https.onCall(removeItemFromBasket);
exports.updateBasketItemQuantity = functions.https.onCall(
	updateBasketItemQuantity
);
exports.clearBasket = functions.https.onCall(clearBasket);
exports.sendToChefsQ = functions.https.onCall(sendToChefsQ);
