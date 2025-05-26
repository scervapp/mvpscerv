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
		if (!context.auth || !context.auth.uid) {
			console.error("addItemToSharedBasket: Authentication failed.");
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated."
			);
		}
		const currentUserId = context.auth.uid;

		const {
			partyId,
			orderingForUserId,
			orderingForPipName,
			menuItemData, // Expects { id, name, price, quantity, specialInstructions?, category?, imageUri?, restaurantId? }
		} = data;

		if (
			!partyId ||
			!orderingForUserId ||
			!menuItemData ||
			!menuItemData.id ||
			typeof menuItemData.price !== "number" ||
			typeof menuItemData.quantity !== "number" ||
			menuItemData.quantity <= 0
		) {
			console.error("addItemToSharedBasket: Invalid input.", data);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing or invalid required fields."
			);
		}
		// Validate that the restaurantId for the item is present if you intend to store it per item
		if (
			typeof menuItemData.restaurantId !== "string" ||
			!menuItemData.restaurantId
		) {
			console.warn(
				`addItemToSharedBasket: menuItemData.restaurantId is missing or invalid for item ${menuItemData.name}. Storing as null or consider fetching party's restaurantId.`
			);
			// If all items in a party basket must belong to the party's restaurant,
			// you might fetch the party document here to get its restaurantId and use that.
			// For now, we'll proceed, and it will be stored as null if not provided.
		}

		const sharedBasketRef = db.collection("shared_baskets").doc(partyId);
		const partyRef = db.collection("parties").doc(partyId);

		try {
			return await db.runTransaction(async (transaction) => {
				const partyDoc = await transaction.get(partyRef);
				if (!partyDoc.exists) {
					console.error(`addItemToSharedBasket: Party ${partyId} not found.`);
					throw new functions.https.HttpsError("not-found", "Party not found.");
				}

				const basketDoc = await transaction.get(sharedBasketRef);
				if (!basketDoc.exists) {
					console.error(
						`addItemToSharedBasket: Shared basket for partyId ${partyId} not found.`
					);
					throw new functions.https.HttpsError(
						"not-found",
						"Party basket not found."
					);
				}

				const currentBasketData = basketDoc.data();
				const itemsArray = currentBasketData.items || [];

				const basketItemId = db.collection("dummy").doc().id;
				const newItem = {
					id: basketItemId,
					menuItemId: menuItemData.id,
					dishName: menuItemData.name,
					price: menuItemData.price,
					quantity: menuItemData.quantity,
					specialInstructions: menuItemData.specialInstructions || "",
					orderedByUserId: orderingForUserId,
					orderedByPipName: orderingForPipName || null,
					addedByUserId: currentUserId,
					addedAt: new Date(), // <<< Use new Date() here (Cloud Function's server time)
					status: "new",
					category: menuItemData.category || null,
					imageUri: menuItemData.imageUri || null,
					restaurantId: menuItemData.restaurantId || null, // Store what's passed, even if null
				};

				console.log(
					`addItemToSharedBasket: Preparing to add new item to party ${partyId}:`,
					JSON.stringify(newItem, null, (key, value) => {
						// Custom replacer for Date objects if direct stringify is too verbose or problematic for logs
						if (value instanceof Date) {
							return value.toISOString();
						}
						return value;
					})
				);

				const updatedItemsArray = [...itemsArray, newItem];

				transaction.update(sharedBasketRef, {
					items: updatedItemsArray,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(), // serverTimestamp is fine for top-level fields
				});

				console.log(
					`addItemToSharedBasket: Item ${basketItemId} transactionally added to shared basket for party ${partyId}.`
				);
				return { success: true, basketItemId: basketItemId };
			});
		} catch (error) {
			console.error(
				`addItemToSharedBasket: Transaction error for party ${partyId}:`,
				error
			);
			if (error instanceof functions.https.HttpsError) {
				throw error;
			}
			const errorMessage =
				error.message ||
				"Failed to add item to party basket due to an internal error.";
			throw new functions.https.HttpsError(
				"internal",
				errorMessage,
				error.details
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
