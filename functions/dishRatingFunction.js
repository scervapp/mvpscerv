// functions/ratingFunctions.js (Create a new file or add to an existing one like orderFunctions.js)

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

const makeSafeDocId = (value) =>
	String(value || "")
		.replace(/[^a-zA-Z0-9_-]/g, "_")
		.slice(0, 500);

/**
 * Submits a rating for a specific dish within a completed order.
 * Marks the item in the order as rated.
 * Triggers the aggregation function via the new document in dishRatings.
 */
exports.submitDishRating = functions.https.onCall(async (data, context) => {
	// 1. Authentication Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to submit a rating."
		);
	}
	const customerId = context.auth.uid;

	// 2. Input Validation
	const {
		orderDocId, // Firestore Document ID of the order
		dishId, // ID of the dish being rated
		restaurantId, // ID of the restaurant
		ratingValue, // The numeric rating (e.g., 1-5)
		comment, // Optional text comment
		// We need a way to identify the specific item *within* the order's items array.
		// Option A: Pass the index of the item in the array.
		// Option B: Pass a unique identifier stored within the item object itself (if you have one).
		// Let's assume we pass the index for now. Adjust if needed.
		itemIndexInOrder,
	} = data;

	if (
		!orderDocId ||
		!dishId ||
		!restaurantId ||
		typeof ratingValue !== "number" ||
		ratingValue < 1 || // Assuming a 1-5 scale
		ratingValue > 5 ||
		typeof itemIndexInOrder !== "number" || // Validate index
		itemIndexInOrder < 0
	) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing or invalid data provided for rating submission."
		);
	}

	const orderRef = db.collection("orders").doc(orderDocId);
	const ratingRef = db.collection("dishRatings").doc(); // Auto-generate ID for the new rating

	// 3. Run as Transaction
	try {
		await db.runTransaction(async (transaction) => {
			// 3a. Get the order document
			const orderDoc = await transaction.get(orderRef);
			if (!orderDoc.exists) {
				throw new functions.https.HttpsError("not-found", "Order not found.");
			}
			const orderData = orderDoc.data();

			// 3b. Verify ownership and order status
			if (orderData.customerId !== customerId) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"You can only rate items from your own orders."
				);
			}
			if (orderData.paymentStatus !== "paid") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Order must be paid before rating items."
				);
			}

			// 3c. Check if the specific item exists and hasn't been rated yet
			if (!orderData.items || itemIndexInOrder >= orderData.items.length) {
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Invalid item index provided."
				);
			}
			const itemToUpdate = orderData.items[itemIndexInOrder];

			// --- IMPORTANT: Check the dishId matches ---
			if (itemToUpdate.dish.id !== dishId) {
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Dish ID mismatch for the specified item index."
				);
			}

			if (itemToUpdate.ratedByUser === true) {
				// Item already rated, maybe return success silently or specific code?
				console.log(
					`Item at index ${itemIndexInOrder} in order ${orderDocId} already rated.`
				);
				// Depending on desired UX, you might throw an error or just not create a new rating.
				// For now, let's prevent duplicate rating entries.
				throw new functions.https.HttpsError(
					"already-exists",
					"This item has already been rated."
				);
			}

			// 3d. Create the new rating document
			transaction.set(ratingRef, {
				dishId: dishId,
				restaurantId: restaurantId,
				orderId: orderDocId, // Store the order's Firestore ID
				customerId: customerId,
				ratingValue: ratingValue,
				comment: comment || null, // Store null if comment is empty/undefined
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
			});

			// 3e. Update the specific item in the order's items array
			// Firestore requires updating the entire array field
			const updatedItems = [...orderData.items]; // Create a copy
			updatedItems[itemIndexInOrder] = {
				...itemToUpdate,
				ratedByUser: true, // Mark as rated
			};
			transaction.update(orderRef, { items: updatedItems });
		});

		console.log(
			`Rating submitted successfully for dish ${dishId} in order ${orderDocId}`
		);
		return { success: true, ratingId: ratingRef.id };
	} catch (error) {
		console.error("Error submitting dish rating:", error);
		// Re-throw HttpsErrors or wrap others
		if (error.code && error.httpErrorCode) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to submit rating.",
			error.message
		);
	}
});

// functions/ratingFunctions.js (or wherever you put the previous function)

/**
 * Triggered when a new document is created in dishRatings.
 * Updates the aggregate rating fields (totalRatingSum, ratingCount, averageRating)
 * on the corresponding document in the 'dishes' collection.
 */
exports.aggregateDishRating = functions.firestore
	.document("dishRatings/{ratingId}")
	.onCreate(async (snap, context) => {
		const ratingData = snap.data();
		const { dishId, ratingValue } = ratingData;

		if (!dishId || typeof ratingValue !== "number") {
			console.error(
				`Invalid data in rating ${context.params.ratingId}: Missing dishId or invalid ratingValue.`
			);
			return null; // Exit gracefully
		}

		const dishRef = db.collection("dishes").doc(dishId);

		try {
			await db.runTransaction(async (transaction) => {
				const dishDoc = await transaction.get(dishRef);

				if (!dishDoc.exists) {
					console.warn(
						`Dish document ${dishId} not found. Cannot aggregate rating ${context.params.ratingId}.`
					);
					// Optionally create the dish doc here if that's desired behavior,
					// but usually, it should exist. For now, we just warn and exit.
					return; // Stop the transaction for this rating
				}

				// Get current aggregates, defaulting to 0 if they don't exist yet
				const currentSum = dishDoc.data().totalRatingSum || 0;
				const currentCount = dishDoc.data().ratingCount || 0;

				// Calculate new aggregates
				const newSum = currentSum + ratingValue;
				const newCount = currentCount + 1;
				const newAverage = newSum / newCount; // Floating point average

				// Update the dish document within the transaction
				transaction.update(dishRef, {
					totalRatingSum: newSum,
					ratingCount: newCount,
					averageRating: newAverage, // Store the calculated average
				});
			});

			console.log(
				`Aggregated rating for dish ${dishId}. New average: ${newAverage.toFixed(
					2
				)}`
			);
			return null; // Indicate success
		} catch (error) {
			console.error(
				`Error aggregating rating for dish ${dishId} (Rating ID: ${context.params.ratingId}):`,
				error
			);
			// Don't re-throw here, as it might cause infinite retries for triggered functions.
			// Log the error for monitoring.
			return null;
		}
	});

exports.submitMenuItemRating = functions.https.onCall(async (data, context) => {
	const uid = context.auth && context.auth.uid;
	if (!uid)
		throw new functions.https.HttpsError("unauthenticated", "Login required.");

	const {
		menuItemId,
		restaurantId,
		ratingValue,
		comment = "",
		reviewText = "",
		reviewTags = [],
		orderId = null,
		origin = null,
		isIndividual = null,
	} = data;
	const cleanReviewText = String(reviewText || comment || "").trim().slice(0, 800);
	const cleanReviewTags = Array.isArray(reviewTags)
		? [
				...new Set(
					reviewTags
						.map((tag) =>
							String(tag || "")
								.trim()
								.toLowerCase()
								.replace(/\s+/g, " ")
						)
						.filter(Boolean)
						.slice(0, 8)
				),
			]
		: [];

	if (!menuItemId || !restaurantId || ratingValue < 1 || ratingValue > 5) {
		throw new functions.https.HttpsError("invalid-argument", "Invalid data.");
	}

	const ratingDocId = makeSafeDocId(
		`${uid}_${menuItemId}_${orderId || "single"}`
	);
	const ratingRef = db
		.collection("menuItems")
		.doc(menuItemId)
		.collection("ratings")
		.doc(ratingDocId);

	try {
		await db.runTransaction(async (t) => {
			const ratingDoc = await t.get(ratingRef);
			if (ratingDoc.exists) {
				throw new functions.https.HttpsError(
					"already-exists",
					"This item has already been reviewed."
				);
			}

			t.set(ratingRef, {
				menuItemId,
				restaurantId,
				customerId: uid,
				ratingValue,
				comment: cleanReviewText || null,
				reviewText: cleanReviewText || null,
				reviewTags: cleanReviewTags,
				orderId,
				origin,
				isIndividual,
				status: "published",
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
			});
		});

		return { success: true };
	} catch (error) {
		console.error("Rating error:", error);
		if (error.code) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Failed to submit rating."
		);
	}
});

exports.aggregateMenuItemRating = functions.firestore
	.document("menuItems/{itemId}/ratings/{ratingId}")
	.onCreate(async (snap, context) => {
		const { itemId } = context.params;
		const { ratingValue, reviewText, reviewTags = [] } = snap.data();

		const itemRef = db.collection("menuItems").doc(itemId);

		try {
			await db.runTransaction(async (t) => {
				const doc = await t.get(itemRef);
				const currentSum = doc.data().totalRatingSum || 0;
				const currentCount = doc.data().ratingCount || 0;
				const currentReviewCount = doc.data().reviewCount || 0;

				const newCount = currentCount + 1;
				const newSum = currentSum + ratingValue;
				const newAverage = newCount > 0 ? newSum / newCount : 0;
				const newReviewCount = reviewText
					? currentReviewCount + 1
					: currentReviewCount;
				const globalAverage = 4.2;
				const minimumConfidenceRatings = 10;
				const confidenceAdjustedRating =
					(newCount / (newCount + minimumConfidenceRatings)) * newAverage +
					(minimumConfidenceRatings /
						(newCount + minimumConfidenceRatings)) *
						globalAverage;
				const popularityWeight = Math.min(newCount / 50, 1) * 0.25;
				const discoveryScore = Number(
					(confidenceAdjustedRating + popularityWeight).toFixed(4)
				);
				const topReviewTags = Array.isArray(reviewTags)
					? [...new Set(reviewTags)].slice(0, 8)
					: [];

				t.set(
					itemRef,
					{
						totalRatingSum: newSum,
						ratingCount: newCount,
						averageRating: newAverage,
						reviewCount: newReviewCount,
						confidenceAdjustedRating,
						discoveryScore,
						...(topReviewTags.length > 0
							? {
									topReviewTags:
										admin.firestore.FieldValue.arrayUnion(...topReviewTags),
								}
							: {}),
					},
					{ merge: true }
				);
			});
		} catch (error) {
			console.error("Aggregation failed:", error);
		}
	});

exports.aggregateMenuItemOrderStats = functions.firestore
	.document("orders/{orderId}")
	.onCreate(async (snap) => {
		const orderData = snap.data() || {};
		const items = Array.isArray(orderData.items) ? orderData.items : [];
		const itemCounts = new Map();

	items.forEach((item) => {
			const dish = item.dish || {};
			const menuItemId = item.menuItemId || dish.id || item.dishId;
			if (!menuItemId) return;
			const quantity = Math.max(1, Number(item.quantity || 1));
			itemCounts.set(menuItemId, (itemCounts.get(menuItemId) || 0) + quantity);
		});

		if (itemCounts.size === 0) return null;

		const batch = db.batch();
		itemCounts.forEach((quantity, menuItemId) => {
			batch.set(
				db.collection("menuItems").doc(menuItemId),
				{
					orderCount: admin.firestore.FieldValue.increment(quantity),
					updatedStatsAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true }
			);
		});

		await batch.commit();
		return null;
	});
