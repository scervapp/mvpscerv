const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { assertRestaurantPermission } = require("./restaurantAccess");

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
			"User must be authenticated.",
		);
	}
	// Ensure the userId in data matches the authenticated user, or allow admin override if needed
	if (context.auth.uid !== data.userId) {
		// Potentially check for admin role if you want admins to add to other users' baskets
		console.error(
			"addItemToBasket: Authenticated user does not match userId in data.",
		);
		throw new functions.https.HttpsError(
			"permission-denied",
			"User can only add items to their own basket.",
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
			"Missing or invalid required fields (userId, restaurantId, dish details, quantity).",
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
				`addItemToBasket: Adding items for ${selectedPIPs.length} selected targets (PIPs/Myself). Quantity per target: ${quantity}`,
			);

			for (const pipTarget of selectedPIPs) {
				if (!pipTarget || !pipTarget.id || !pipTarget.name) {
					console.warn(
						"addItemToBasket: Skipping invalid pipTarget in selectedPIPs array:",
						pipTarget,
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
					`addItemToBasket: Queued item for PIP: ${pipTarget.name} (ID: ${pipTarget.id}) with quantity ${quantity}`,
				);
			}
		} else {
			// Scenario 2: Item is for the current user, no specific PIPs selected (or "Myself" was the only implicit target)
			console.log(
				`addItemToBasket: Adding single item for user ${userId}. Quantity: ${quantity}`,
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
			createdBasketItemIds,
		);
		return { success: true, basketItemIds: createdBasketItemIds };
	} catch (error) {
		console.error(
			`addItemToBasket: Error processing request for user ${userId}:`,
			error,
		);
		if (error instanceof functions.https.HttpsError) {
			throw error; // Re-throw HttpsErrors
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to add item(s) to basket.",
			error.message,
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
				"User not authenticated",
			);
		}

		if (!restaurantId || !basketItemId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided",
			);
		}

		// 2. Get the basket item document reference
		const basketItemRef = db.collection("baskets").doc(basketItemId);

		// 3. Check if the basket item exists
		const basketItemSnapshot = await basketItemRef.get();

		if (!basketItemSnapshot.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Basket item not found",
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
				"User not authenticated",
			);
		}

		if (!basketItemId || isNaN(newQuantity) || newQuantity < 0) {
			// Basic validation for newQuantity
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided",
			);
		}

		// 2. Get the basket item document reference
		const basketItemRef = db.collection("baskets").doc(basketItemId);

		// 3. Check if the basket item exists
		const basketItemSnapshot = await basketItemRef.get();

		if (!basketItemSnapshot.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Basket item not found",
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
				"User not authenticated",
			);
		}

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided",
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
				"Invalid data provided",
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
 * Finds all 'new' items for a specific user within a party's shared basket
 * and updates their status to 'sent', adding a timestamp.
 *
 * @param {object} data - The data object.
 * @param {string} data.partyId - The ID of the party.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, itemsSent: number, error?: string}>}
 */
exports.sendItemsToChefsQ = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated.",
		);
	}
	const requestingUserId = context.auth.uid;
	const { partyId } = data;

	if (!partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID is required.",
		);
	}

	const sharedBasketRef = db.collection("shared_baskets").doc(partyId);
	const partyRef = db.collection("parties").doc(partyId);

	try {
		return await db.runTransaction(async (transaction) => {
			const partyDoc = await transaction.get(partyRef);
			if (!partyDoc.exists || partyDoc.data().status !== "active") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Party must be active to send items to the kitchen.",
				);
			}

			const basketDoc = await transaction.get(sharedBasketRef);
			if (!basketDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Party basket not found.",
				);
			}

			const basketData = basketDoc.data();
			const itemsArray = basketData.items || [];
			let itemsSentCount = 0;

			const updatedItemsArray = itemsArray.map((item) => {
				// Find items that belong to the requesting user and are still 'new'
				if (
					item.orderedByUserId === requestingUserId &&
					item.status === "new"
				) {
					itemsSentCount++;
					return {
						...item,
						status: "sent", // Update the status
						sentToKitchenAt: new Date(), // Add a timestamp for when it was sent
					};
				}
				return item; // Return all other items unchanged
			});

			if (itemsSentCount === 0) {
				// This can happen if the user's client is out of sync.
				// It's not an error, just an informational result.
				console.log(
					`sendItemsToChefsQ: User ${requestingUserId} had no new items to send for party ${partyId}.`,
				);
				return {
					success: true,
					itemsSent: 0,
					message: "No new items to send.",
				};
			}

			// Update the document with the modified items array
			transaction.update(sharedBasketRef, {
				items: updatedItemsArray,
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			});

			console.log(
				`sendItemsToChefsQ: Successfully sent ${itemsSentCount} item(s) to kitchen for user ${requestingUserId} in party ${partyId}.`,
			);
			return { success: true, itemsSent: itemsSentCount };
		});
	} catch (error) {
		console.error(
			`Error sending items to kitchen for party ${partyId}:`,
			error,
		);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not send items to kitchen.",
			error.message,
		);
	}
});

/**
 * Consolidates items from a user or party and creates a single order document
 * for the kitchen to view. It also updates the source items' status.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.type - The type of order, either 'individual' or 'party'.
 * @param {string} data.sourceId - The ID of the document to get items from
 * (either the checkInId for an individual order or the partyId for a party order).
 * @param {string} data.table - The table object {id, name} for the order.
 * @param {string} data.server - The server object {id, name} for the order.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, orderId?: string, error?: string}>}
 *
 *
 */

const DRINK_CATEGORIES = [
	"Beer",
	"Wine",
	"Cocktails",
	"Spirits",
	"Sodas",
	"Drinks",
	"Juices",
	"Non-Alcoholic Drinks",
	"Alcoholic Drinks",
	"Beverages",
	"Coffee",
	"Tea",
];

const isBarCategory = (category) => {
	const normalized = String(category || "")
		.trim()
		.toLowerCase();

	return DRINK_CATEGORIES.some(
		(cat) =>
			String(cat || "")
				.trim()
				.toLowerCase() === normalized,
	);
};

const getLocalizedModifierName = (modifier) => {
	if (!modifier) return "Modifier";

	if (typeof modifier.name === "string") return modifier.name;

	if (modifier.name && typeof modifier.name === "object") {
		return (
			modifier.name.en ||
			modifier.name.es ||
			modifier.name.original ||
			"Modifier"
		);
	}

	return "Modifier";
};

const getItbmsRateFromCategory = (categoryValue) => {
	const category = String(categoryValue || "")
		.trim()
		.toLowerCase();

	const isAlcohol =
		category === "beer" ||
		category === "wine" ||
		category === "cocktails" ||
		category === "spirits" ||
		category === "alcoholic drinks";

	return isAlcohol ? 10 : 7;
};

const normalizeSelectedModifiers = (requestedModifiers, menuItemData) => {
	const modifierGroups = Array.isArray(menuItemData.modifierGroups)
		? menuItemData.modifierGroups
		: [];
	const optionLookup = new Map();

	modifierGroups.forEach((group) => {
		const groupId = group.id || null;
		const groupName =
			typeof group.name === "string"
				? group.name
				: group.name && typeof group.name === "object"
					? group.name.en || group.name.es || group.name.original || ""
					: "";

		(Array.isArray(group.options) ? group.options : []).forEach((option) => {
			if (!option || !option.id) return;
			optionLookup.set(`${groupId}:${option.id}`, {
				groupId,
				groupName,
				optionId: option.id,
				name:
					typeof option.name === "string"
						? option.name
						: option.name && typeof option.name === "object"
							? option.name.en ||
								option.name.es ||
								option.name.original ||
								"Modifier"
							: "Modifier",
				price:
					option.price !== undefined && option.price !== null
						? Number(option.price)
						: 0,
				category: option.category || "Extras",
			});
		});
	});

	return (Array.isArray(requestedModifiers) ? requestedModifiers : [])
		.map((modifier) => {
			const groupId = modifier && modifier.groupId ? modifier.groupId : null;
			const optionId = modifier && modifier.optionId ? modifier.optionId : null;
			const matchedOption = optionLookup.get(`${groupId}:${optionId}`);
			return matchedOption || null;
		})
		.filter(Boolean);
};

exports.addStaffItemsToPartyAndSendToKitchen = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const {
			partyId,
			restaurantId,
			table,
			server,
			items,
			orderedForName = "Table",
			orderedForSeat = null,
			staff = {},
		} = data || {};

		if (
			!partyId ||
			!restaurantId ||
			!table ||
			!Array.isArray(items) ||
			items.length === 0
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing required staff order data.",
			);
		}

		const staffMember = await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staff.id,
			allowedRoles: ["owner", "manager"],
			allowedJobTitles: ["server"],
			action: "enter restaurant orders",
		});

		const partyRef = db.collection("parties").doc(partyId);
		const basketRef = db.collection("shared_baskets").doc(partyId);
		const partyDoc = await partyRef.get();

		if (!partyDoc.exists) {
			throw new functions.https.HttpsError("not-found", "Party not found.");
		}

		const partyData = partyDoc.data() || {};
		if (partyData.restaurantId !== restaurantId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Party does not belong to this restaurant.",
			);
		}

		if (!["active", "pending", "AWAITING_TABLE"].includes(partyData.status)) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Party is not open for staff ordering.",
			);
		}

		const menuItemIds = [
			...new Set(
				items
					.map((item) => item && item.menuItemId)
					.filter((id) => typeof id === "string" && id.trim()),
			),
		];

		if (menuItemIds.length === 0) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"No valid menu items were provided.",
			);
		}

		const menuItemMap = new Map();
		for (let i = 0; i < menuItemIds.length; i += 10) {
			const chunk = menuItemIds.slice(i, i + 10);
			const menuItemsSnapshot = await db
				.collection("menuItems")
				.where(admin.firestore.FieldPath.documentId(), "in", chunk)
				.get();

			menuItemsSnapshot.forEach((doc) => {
				menuItemMap.set(doc.id, { id: doc.id, ...doc.data() });
			});
		}

		const staffName =
			String(staff.name || "").trim() || staffMember.name || "Staff";
		const staffId = staffMember.id || staff.id || context.auth.uid;
		const normalizedOrderedForName =
			String(
				(orderedForSeat && orderedForSeat.name) || orderedForName || "",
			).trim() ||
			partyData.hostName ||
			(partyData.table && partyData.table.name) ||
			"Table";
		const normalizedSeatId =
			orderedForSeat && orderedForSeat.id
				? String(orderedForSeat.id).trim()
				: normalizedOrderedForName
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "_")
					.replace(/^_+|_+$/g, "") || "table_share";
		const normalizedSeat = {
			id: normalizedSeatId,
			name: normalizedOrderedForName,
			source: "restaurant_pos",
		};

		const staffBasketItems = items.map((requestedItem) => {
			const itemOrderedForSeat =
				requestedItem && requestedItem.orderedForSeat
					? requestedItem.orderedForSeat
					: orderedForSeat;
			const itemOrderedForName =
				String(
					(itemOrderedForSeat && itemOrderedForSeat.name) ||
						orderedForName ||
						"",
				).trim() ||
				partyData.hostName ||
				(partyData.table && partyData.table.name) ||
				"Table";
			const itemSeatId =
				itemOrderedForSeat && itemOrderedForSeat.id
					? String(itemOrderedForSeat.id).trim()
					: itemOrderedForName
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "_")
						.replace(/^_+|_+$/g, "") || "table_share";
			const itemSeat = {
				id: itemSeatId,
				name: itemOrderedForName,
				source: "restaurant_pos",
			};
			const menuItemId = requestedItem && requestedItem.menuItemId;
			const menuItem = menuItemMap.get(menuItemId);

			if (!menuItem) {
				throw new functions.https.HttpsError(
					"not-found",
					`Menu item ${menuItemId} was not found.`,
				);
			}

			if (menuItem.restaurantId && menuItem.restaurantId !== restaurantId) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"Menu item does not belong to this restaurant.",
				);
			}

			if (menuItem.isAvailable === false) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					`${menuItem.name || "This item"} is not available.`,
				);
			}

			const selectedModifiers = normalizeSelectedModifiers(
				requestedItem.selectedModifiers,
				menuItem,
			);
			const modifiersTotal = selectedModifiers.reduce(
				(sum, modifier) => sum + Number(modifier.price || 0),
				0,
			);
			const basePrice = Number(menuItem.price || 0);
			const quantity = Math.max(
				1,
				Math.min(99, Number(requestedItem.quantity || 1)),
			);
			const specialInstructions =
				typeof requestedItem.specialInstructions === "string"
					? requestedItem.specialInstructions.trim().slice(0, 500)
					: "";

			return {
				id: db.collection("dummy").doc().id,
				menuItemId,
				name: menuItem.name || "Item",
				dishName: menuItem.name || "Item",
				price: Number((basePrice + modifiersTotal).toFixed(2)),
				basePrice: Number(basePrice.toFixed(2)),
				modifiersTotal: Number(modifiersTotal.toFixed(2)),
				selectedModifiers,
				category: menuItem.category || "Uncategorized",
				quantity,
				specialInstructions,
				orderedByUserId: context.auth.uid,
				orderedByPipName: itemSeat.name,
				orderedForName: itemSeat.name,
				seatId: itemSeat.id,
				seatName: itemSeat.name,
				orderedForSeatId: itemSeat.id,
				orderedForSeatName: itemSeat.name,
				source: "restaurant_pos",
				orderEntryMode: "staff",
				paymentResponsibility: "restaurant_pos",
				enteredByStaffId: staffId,
				enteredByStaffName: staffName,
				enteredByAuthUserId: context.auth.uid,
				restaurantId,
				status: "new",
				addedAt: new Date().toISOString(),
				itbmsRate: getItbmsRateFromCategory(menuItem.category),
			};
		});
		const staffOrderSeatMap = new Map();
		staffBasketItems.forEach((item) => {
			if (!item.seatId) return;
			staffOrderSeatMap.set(item.seatId, {
				id: item.seatId,
				name: item.seatName || item.orderedForName || "Seat",
				source: "restaurant_pos",
			});
		});
		if (staffOrderSeatMap.size === 0) {
			staffOrderSeatMap.set(normalizedSeat.id, normalizedSeat);
		}
		const staffOrderSeats = Array.from(staffOrderSeatMap.values());

		const batch = db.batch();
		const basketDoc = await basketRef.get();
		const existingBasketItems =
			basketDoc.exists && Array.isArray(basketDoc.data().items)
				? basketDoc.data().items
				: [];
		const updatedBasketItems = [...existingBasketItems, ...staffBasketItems];

		const kitchenOrderRef = db.collection("kitchen_orders").doc();
		const orderId = kitchenOrderRef.id;
		const menuItemDetailsMap = new Map(
			staffBasketItems.map((item) => [item.menuItemId, menuItemMap.get(item.menuItemId)]),
		);

		let hasKitchen = false;
		let hasBar = false;

		const kitchenItems = staffBasketItems.map((item) => {
			const details = menuItemDetailsMap.get(item.menuItemId) || {};
			const category = details.category || item.category || "Other";
			const destination = isBarCategory(category) ? "bar" : "kitchen";
			const kitchenModifiers = [];
			const barModifiers = [];

			(Array.isArray(item.selectedModifiers)
				? item.selectedModifiers
				: []
			).forEach((modifier) => {
				if (isBarCategory(modifier.category)) {
					barModifiers.push(modifier);
				} else {
					kitchenModifiers.push(modifier);
				}
			});

			if (destination === "kitchen") hasKitchen = true;
			if (destination === "bar") hasBar = true;
			if (kitchenModifiers.length > 0) hasKitchen = true;
			if (barModifiers.length > 0) hasBar = true;

			return {
				id: item.id,
				dishName: item.dishName,
				quantity: item.quantity,
				specialInstructions: item.specialInstructions || "",
				orderedFor: item.orderedForName || "Table",
				seatId: item.seatId || null,
				seatName: item.seatName || null,
				source: item.source,
				orderEntryMode: item.orderEntryMode,
				paymentResponsibility: item.paymentResponsibility,
				enteredByStaffId: item.enteredByStaffId,
				enteredByStaffName: item.enteredByStaffName,
				destination,
				selectedModifiers: item.selectedModifiers,
				kitchenModifiers,
				barModifiers,
			};
		});

		const initialStationStatuses = {};
		if (hasKitchen) initialStationStatuses.kitchen = "new";
		if (hasBar) initialStationStatuses.bar = "new";

		const sentBasketItems = updatedBasketItems.map((item) =>
			staffBasketItems.some((staffItem) => staffItem.id === item.id)
				? { ...item, status: "sent", ticketId: orderId, sentAt: new Date() }
				: item,
		);

		if (basketDoc.exists) {
			batch.update(basketRef, {
				items: sentBasketItems,
				[`ticketStatuses.${orderId}`]: initialStationStatuses,
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			});
		} else {
			batch.set(basketRef, {
				partyId,
				restaurantId,
				items: sentBasketItems,
				[`ticketStatuses.${orderId}`]: initialStationStatuses,
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			});
		}

		batch.set(kitchenOrderRef, {
			restaurantId,
			orderId,
			partyId,
			table,
			server: server || { id: staffId, name: staffName },
			orderEntryMode: "staff",
			items: kitchenItems,
			stationStatuses: initialStationStatuses,
			overallStatus: "active",
			status: "new",
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		batch.set(
			partyRef,
			{
				staffOrderSeats:
					admin.firestore.FieldValue.arrayUnion(...staffOrderSeats),
				hasSeatBasedStaffOrders: true,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		await batch.commit();

		return {
			success: true,
			orderId,
			itemsSent: kitchenItems.length,
		};
	},
);
exports.sendOrderToKitchen = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated.",
		);
	}

	const { sourceId, table, server, allowedUserIds } = data;
	const userId = context.auth.uid;

	if (!sourceId || !table) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required data.",
		);
	}

	const idsToProcess =
		Array.isArray(allowedUserIds) && allowedUserIds.length > 0
			? allowedUserIds
			: [userId];

	try {
		const batch = db.batch();
		const menuItemDetailsMap = new Map();

		// 1. Strictly pull from the shared_baskets collection
		const basketRef = db.collection("shared_baskets").doc(sourceId);
		const basketDoc = await basketRef.get();

		if (!basketDoc.exists) {
			throw new Error(`Shared basket for party ${sourceId} not found.`);
		}

		const allItems = basketDoc.data().items || [];

		// 2. Filter items using the array of PIP IDs
		const itemsFromSource = allItems.filter(
			(item) =>
				idsToProcess.includes(item.orderedByUserId) && item.status === "new",
		);

		if (itemsFromSource.length === 0) {
			return { success: true, message: "No new items to send.", itemsSent: 0 };
		}

		const restaurantIdForOrder = itemsFromSource[0].restaurantId;

		// 3. Fetch menu details
		const menuItemIds = [
			...new Set(itemsFromSource.map((item) => item.menuItemId)),
		];
		if (menuItemIds.length > 0) {
			for (let i = 0; i < menuItemIds.length; i += 10) {
				const chunk = menuItemIds.slice(i, i + 10);
				const menuItemsQuery = db
					.collection("menuItems")
					.where(admin.firestore.FieldPath.documentId(), "in", chunk);
				const menuItemsSnapshot = await menuItemsQuery.get();

				menuItemsSnapshot.forEach((doc) => {
					menuItemDetailsMap.set(doc.id, doc.data());
				});
			}
		}

		// 🚨 ENTERPRISE UPDATE: Generate the Ticket ID early!
		const kitchenOrderRef = db.collection("kitchen_orders").doc();
		const orderId = kitchenOrderRef.id;

		// 🚨 ENTERPRISE UPDATE: Build the smart station routing map
		let hasKitchen = false;
		let hasBar = false;

		const kitchenItems = itemsFromSource.map((item) => {
			const details = menuItemDetailsMap.get(item.menuItemId) || {};
			const category = details.category || item.category || "Other";
			const dishName =
				details.name ||
				item.dishName ||
				(item.dish && item.dish.name) ||
				"Unknown Item";

			const selectedModifiers = Array.isArray(item.selectedModifiers)
				? item.selectedModifiers
				: [];

			const kitchenModifiers = [];
			const barModifiers = [];

			selectedModifiers.forEach((modifier) => {
				const modifierCategory = modifier.category || "Extras";
				const modifierName = getLocalizedModifierName(modifier);

				const normalizedModifier = {
					optionId: modifier.optionId || null,
					groupId: modifier.groupId || null,
					groupName: modifier.groupName || "",
					name: modifierName,
					price:
						modifier.price !== undefined && modifier.price !== null
							? Number(modifier.price)
							: 0,
					category: modifierCategory,
				};

				if (isBarCategory(modifierCategory)) {
					barModifiers.push(normalizedModifier);
				} else {
					kitchenModifiers.push(normalizedModifier);
				}
			});

			const destination = isBarCategory(category) ? "bar" : "kitchen";

			if (destination === "kitchen") hasKitchen = true;
			if (destination === "bar") hasBar = true;

			if (kitchenModifiers.length > 0) hasKitchen = true;
			if (barModifiers.length > 0) hasBar = true;

			return {
				id: item.id,
				dishName: dishName,
				quantity: item.quantity,
				specialInstructions: item.specialInstructions || "",
				orderedFor:
					item.orderedForName ||
					item.orderedByPipName ||
					item.pipName ||
					item.customerName ||
					"Guest",
				source: item.source || "customer_app",
				orderEntryMode: item.orderEntryMode || "customer",
				paymentResponsibility:
					item.paymentResponsibility || "customer_app",
				enteredByStaffId: item.enteredByStaffId || null,
				enteredByStaffName: item.enteredByStaffName || null,
				destination: destination,
				selectedModifiers: selectedModifiers,
				kitchenModifiers: kitchenModifiers,
				barModifiers: barModifiers,
			};
		});

		const initialStationStatuses = {};
		if (hasKitchen) initialStationStatuses.kitchen = "new";
		if (hasBar) initialStationStatuses.bar = "new";

		// 4. Update the basket AND inject the real-time customer tracker
		const updatedSourceItems = allItems.map((item) =>
			idsToProcess.includes(item.orderedByUserId) && item.status === "new"
				? // 🚨 ADD ticketId HERE so the app can link the item to the kitchen's status!
					{ ...item, status: "sent", ticketId: orderId, sentAt: new Date() }
				: item,
		);

		batch.update(basketRef, {
			items: updatedSourceItems,
			[`ticketStatuses.${orderId}`]: initialStationStatuses, // Customer UI listens to this!
			lastUpdated: new Date(),
		});

		batch.set(
			db.collection("parties").doc(sourceId),
			{
				hasCustomerAppOrder: true,
				customerServiceFeeEligible: true,
				lastCustomerAppOrderAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		// 5. Create the official kitchen order with separate station statuses
		const kitchenOrderData = {
			restaurantId: restaurantIdForOrder,
			orderId: orderId,
			partyId: sourceId,
			table: table,
			server: server || { id: "unassigned", name: "Unassigned" },
			orderEntryMode: data.orderEntryMode || "customer",
			items: kitchenItems,
			stationStatuses: initialStationStatuses, // Independent Bar/Kitchen tracking
			overallStatus: "active", // The main switch
			status: "new", // 🚨 THE FIX: Add this back for your audio listener!
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		};

		batch.set(kitchenOrderRef, kitchenOrderData);
		await batch.commit();
		console.log(
			"[SEND TO KITCHEN MODIFIER DEBUG]",
			JSON.stringify(kitchenItems, null, 2),
		);

		return {
			success: true,
			orderId: orderId,
			itemsSent: kitchenItems.length,
		};
	} catch (error) {
		console.error(
			`Error sending order to kitchen for party ${sourceId}:`,
			error,
		);
		throw new functions.https.HttpsError(
			"internal",
			"Could not send order to kitchen.",
		);
	}
});

/**
 * Links all of a user's current basket items for a specific restaurant
 * to their active check-in ID. This prepares them to be sent to the kitchen.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.restaurantId - The ID of the restaurant.
 * @param {string} data.checkInId - The ID of the active check-in to link to.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, linkedItems: number}>}
 */
exports.linkBasketToCheckIn = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated.",
		);
	}
	const userId = context.auth.uid;
	const { restaurantId, checkInId } = data;

	if (!restaurantId || !checkInId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID and Check-In ID are required.",
		);
	}

	try {
		const basketItemsQuery = db
			.collection("baskets")
			.where("userId", "==", userId)
			.where("restaurantId", "==", restaurantId)
			.where("sentToChefQ", "==", false); // Only link unsent items

		const snapshot = await basketItemsQuery.get();

		if (snapshot.empty) {
			console.log(
				`linkBasketToCheckIn: No basket items found for user ${userId} at restaurant ${restaurantId} to link.`,
			);
			return { success: true, linkedItems: 0 };
		}

		// Use a batch to update all found documents
		const batch = db.batch();
		snapshot.docs.forEach((doc) => {
			batch.update(doc.ref, { checkInId: checkInId });
		});
		await batch.commit();

		console.log(
			`linkBasketToCheckIn: Successfully linked ${snapshot.size} items to checkInId ${checkInId}.`,
		);
		return { success: true, linkedItems: snapshot.size };
	} catch (error) {
		console.error(`Error in linkBasketToCheckIn for user ${userId}:`, error);
		throw new functions.https.HttpsError(
			"internal",
			"Could not link items to check-in.",
			error.message,
		);
	}
});

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
				"User must be authenticated.",
			);
		}
		const currentUserId = context.auth.uid;

		const {
			partyId,
			orderingForUserId,
			orderingForPipName,
			menuItemData, // Expects { id, name, price, basePrice?, modifiersTotal?, selectedModifiers?, quantity, specialInstructions?, category?, imageUri?, restaurantId?, itbmsRate? }
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
				"Missing or invalid required fields.",
			);
		}

		if (
			typeof menuItemData.restaurantId !== "string" ||
			!menuItemData.restaurantId
		) {
			console.warn(
				`addItemToSharedBasket: menuItemData.restaurantId is missing or invalid for item ${menuItemData.name}.`,
			);
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
						`addItemToSharedBasket: Shared basket for partyId ${partyId} not found.`,
					);
					throw new functions.https.HttpsError(
						"not-found",
						"Party basket not found.",
					);
				}

				const currentBasketData = basketDoc.data();
				const itemsArray = currentBasketData.items || [];
				const basketItemId = db.collection("dummy").doc().id;

				const normalizedItbmsRate =
					menuItemData.itbmsRate !== undefined &&
					menuItemData.itbmsRate !== null
						? Number(menuItemData.itbmsRate)
						: 7;

				if (isNaN(normalizedItbmsRate)) {
					throw new functions.https.HttpsError(
						"invalid-argument",
						"Invalid ITBMS rate.",
					);
				}

				const normalizedBasePrice =
					menuItemData.basePrice !== undefined &&
					menuItemData.basePrice !== null
						? Number(menuItemData.basePrice)
						: Number(menuItemData.price);

				const normalizedModifiersTotal =
					menuItemData.modifiersTotal !== undefined &&
					menuItemData.modifiersTotal !== null
						? Number(menuItemData.modifiersTotal)
						: 0;

				const normalizedSelectedModifiers = Array.isArray(
					menuItemData.selectedModifiers,
				)
					? menuItemData.selectedModifiers
					: [];

				const newItem = {
					id: basketItemId,
					menuItemId: menuItemData.id,
					dishName: menuItemData.name,

					// final unit price customer is paying
					price: Number(menuItemData.price),

					// base menu item price before modifiers
					basePrice: isNaN(normalizedBasePrice)
						? Number(menuItemData.price)
						: normalizedBasePrice,

					// total added by modifiers per unit
					modifiersTotal: isNaN(normalizedModifiersTotal)
						? 0
						: normalizedModifiersTotal,

					// structured modifier selections
					selectedModifiers: normalizedSelectedModifiers,

					quantity: menuItemData.quantity,
					specialInstructions: menuItemData.specialInstructions || "",
					orderedByUserId: orderingForUserId,
					orderedByPipName: orderingForPipName || null,
					addedByUserId: currentUserId,
					addedAt: new Date(),
					status: "new",
					category: menuItemData.category || null,
					imageUri: menuItemData.imageUri || null,
					restaurantId: menuItemData.restaurantId || null,
					itbmsRate: normalizedItbmsRate,
				};

				console.log("[BASKET MODIFIER DEBUG]", {
					name: newItem.dishName,
					price: newItem.price,
					basePrice: newItem.basePrice,
					modifiersTotal: newItem.modifiersTotal,
					selectedModifiers: newItem.selectedModifiers,
				});

				console.log(
					`addItemToSharedBasket: Preparing to add new item to party ${partyId}:`,
					JSON.stringify(newItem, null, (key, value) => {
						if (value instanceof Date) {
							return value.toISOString();
						}
						return value;
					}),
				);

				const updatedItemsArray = [...itemsArray, newItem];

				transaction.update(sharedBasketRef, {
					items: updatedItemsArray,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});

				console.log(
					`addItemToSharedBasket: Item ${basketItemId} transactionally added to shared basket for party ${partyId}.`,
				);

				return { success: true, basketItemId: basketItemId };
			});
		} catch (error) {
			console.error(
				`addItemToSharedBasket: Transaction error for party ${partyId}:`,
				error,
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
				error.details,
			);
		}
	},
);

exports.addItemToBasket = functions.https.onCall(addItemToBasket);
exports.removeItemFromBasket = functions.https.onCall(removeItemFromBasket);
exports.updateBasketItemQuantity = functions.https.onCall(
	updateBasketItemQuantity,
);
exports.clearBasket = functions.https.onCall(clearBasket);
exports.sendToChefsQ = functions.https.onCall(sendToChefsQ);

