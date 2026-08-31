// functions/ratingFunctions.js (Create a new file or add to an existing one like orderFunctions.js)

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { assertFeatureAllowed } = require("./featureEntitlements");
const db = admin.firestore();

const makeSafeDocId = (value) =>
	String(value || "")
		.replace(/[^a-zA-Z0-9_-]/g, "_")
		.slice(0, 500);

// Store review photos/videos in a future-ready shape while upload moderation evolves separately.
const normalizeReviewMediaList = (value) => {
	if (!Array.isArray(value)) return [];
	const seenUrls = new Set();

	return value
		.map((entry) => {
			const rawUrl =
				typeof entry === "string"
					? entry
					: entry && (entry.url || entry.imageUrl || entry.imageUri || entry.thumbnailUrl);
			const url = String(rawUrl || "").trim().slice(0, 1000);
			if (!url || seenUrls.has(url)) return null;
			seenUrls.add(url);

			const rawType =
				typeof entry === "object" && entry ? String(entry.type || "").trim() : "";
			const type =
				rawType.toLowerCase() === "video" ||
				/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)
					? "video"
					: "photo";

			return {
				id:
					(typeof entry === "object" &&
						entry &&
						String(entry.id || entry.mediaId || "").trim().slice(0, 120)) ||
					`review_media_${seenUrls.size}`,
				type,
				url,
				thumbnailUrl:
					typeof entry === "object" && entry
						? String(
								entry.thumbnailUrl || entry.thumbnailUri || entry.posterUrl || url
							)
								.trim()
								.slice(0, 1000)
						: url,
				source: "customer",
				status:
					typeof entry === "object" && entry
						? String(entry.status || "published").trim().slice(0, 40)
						: "published",
			};
		})
		.filter(Boolean)
		.slice(0, 8);
};

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
		customerName = "",
		customerDisplayName = "",
		media = [],
		verificationLevel = "",
	} = data;
	const cleanReviewText = String(reviewText || comment || "").trim().slice(0, 800);
	const cleanClientName = String(customerDisplayName || customerName || "")
		.trim()
		.slice(0, 80);
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
	const cleanReviewMedia = normalizeReviewMediaList(media);
	const cleanOrigin = String(origin || "").trim();
	const allowedVerificationLevels = [
		"community_guest",
		"unverified_guest",
		"location_verified",
		"receipt_verified",
		"scerv_order_verified",
	];
	const requestedVerificationLevel = String(verificationLevel || "")
		.trim()
		.toLowerCase();
	const cleanVerificationLevel = allowedVerificationLevels.includes(
		requestedVerificationLevel,
	)
		? requestedVerificationLevel
		: orderId
			? "scerv_order_verified"
			: cleanOrigin === "community_discovery_review"
				? "community_guest"
				: "unverified_guest";

	if (!menuItemId || !restaurantId || ratingValue < 1 || ratingValue > 5) {
		throw new functions.https.HttpsError("invalid-argument", "Invalid data.");
	}

	const restaurantSnap = await db.collection("restaurants").doc(restaurantId).get();
	if (!restaurantSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}
	assertFeatureAllowed(
		restaurantSnap.data() || {},
		"reviews",
		"Reviews are not enabled for this restaurant plan.",
	);
	const customerSnap = cleanClientName
		? null
		: await db.collection("customers").doc(uid).get();
	const customerData = customerSnap && customerSnap.exists ? customerSnap.data() : {};
	const profileFirstName = String(customerData.firstName || "").trim();
	const profileLastName = String(customerData.lastName || "").trim();
	const profileFullName = String(
		customerData.fullName || customerData.name || ""
	).trim();
	let safeCustomerName = cleanClientName;
	if (!safeCustomerName && profileFirstName && profileLastName) {
		safeCustomerName = `${profileFirstName} ${profileLastName.charAt(0)}.`;
	} else if (!safeCustomerName && profileFirstName) {
		safeCustomerName = profileFirstName;
	} else if (!safeCustomerName && profileFullName) {
		const nameParts = profileFullName.split(/\s+/).filter(Boolean);
		safeCustomerName =
			nameParts.length > 1
				? `${nameParts[0]} ${nameParts[1].charAt(0)}.`
				: nameParts[0];
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
				media: cleanReviewMedia,
				customerName: safeCustomerName || null,
				customerDisplayName: safeCustomerName || null,
				orderId,
				origin: cleanOrigin || null,
				isIndividual,
				status: "published",
				verificationLevel: cleanVerificationLevel,
				wasOrderedThroughScerv: Boolean(orderId),
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

exports.submitServerRating = functions.https.onCall(async (data, context) => {
	const uid = context.auth && context.auth.uid;
	if (!uid) {
		throw new functions.https.HttpsError("unauthenticated", "Login required.");
	}

	const {
		restaurantId,
		serverId,
		serverName = "",
		ratingValue,
		feedbackText = "",
		feedbackTags = [],
		orderId = null,
		partyId = null,
		checkInId = null,
		origin = null,
		customerName = "",
	} = data || {};

	const cleanRestaurantId = String(restaurantId || "").trim();
	const cleanServerId = String(serverId || "").trim();
	const cleanServerName = String(serverName || "Server").trim().slice(0, 120);
	const numericRating = Number(ratingValue);
	const cleanFeedbackText = String(feedbackText || "").trim().slice(0, 600);
	const cleanCustomerName = String(customerName || "").trim().slice(0, 80);
	const cleanFeedbackTags = Array.isArray(feedbackTags)
		? [
				...new Set(
					feedbackTags
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

	if (
		!cleanRestaurantId ||
		!cleanServerId ||
		cleanServerId.toLowerCase() === "unassigned" ||
		numericRating < 1 ||
		numericRating > 5
	) {
		throw new functions.https.HttpsError("invalid-argument", "Invalid data.");
	}

	const restaurantRef = db.collection("restaurants").doc(cleanRestaurantId);
	const restaurantSnap = await restaurantRef.get();
	if (!restaurantSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}
	assertFeatureAllowed(
		restaurantSnap.data() || {},
		"reviews",
		"Service feedback is not enabled for this restaurant plan.",
	);

	const ratingScope = orderId || partyId || checkInId || "service";
	const ratingDocId = makeSafeDocId(`${uid}_${cleanServerId}_${ratingScope}`);
	const ratingRef = restaurantRef.collection("serverRatings").doc(ratingDocId);
	const employeeRef = restaurantRef.collection("employees").doc(cleanServerId);
	const serverStatsRef = restaurantRef
		.collection("serverRatingStats")
		.doc(cleanServerId);

	try {
		await db.runTransaction(async (t) => {
			const [ratingDoc, employeeDoc, serverStatsDoc] = await Promise.all([
				t.get(ratingRef),
				t.get(employeeRef),
				t.get(serverStatsRef),
			]);

			if (ratingDoc.exists) {
				throw new functions.https.HttpsError(
					"already-exists",
					"This server has already been rated for this visit."
				);
			}

			const statsData = serverStatsDoc.exists ? serverStatsDoc.data() || {} : {};
			const currentSum = Number(statsData.serviceRatingSum || 0);
			const currentCount = Number(statsData.serviceRatingCount || 0);
			const nextSum = currentSum + numericRating;
			const nextCount = currentCount + 1;
			const nextAverage = nextCount > 0 ? nextSum / nextCount : 0;
			const timestamp = admin.firestore.FieldValue.serverTimestamp();

			t.set(ratingRef, {
				restaurantId: cleanRestaurantId,
				serverId: cleanServerId,
				serverName: cleanServerName,
				customerId: uid,
				customerName: cleanCustomerName || null,
				ratingValue: numericRating,
				feedbackText: cleanFeedbackText || null,
				feedbackTags: cleanFeedbackTags,
				orderId,
				partyId,
				checkInId,
				origin,
				status: "published",
				createdAt: timestamp,
			});

			const aggregatePayload = {
				serverId: cleanServerId,
				serverName: cleanServerName,
				serviceRatingSum: nextSum,
				serviceRatingCount: nextCount,
				serviceAverageRating: nextAverage,
				lastServiceRatingAt: timestamp,
				...(cleanFeedbackTags.length > 0
					? {
							serviceFeedbackTags:
								admin.firestore.FieldValue.arrayUnion(...cleanFeedbackTags),
						}
					: {}),
			};

			// Keep a durable stats document even if an employee profile is later edited.
			t.set(serverStatsRef, aggregatePayload, { merge: true });

			if (employeeDoc.exists) {
				t.set(employeeRef, aggregatePayload, { merge: true });
			}
		});

		return { success: true };
	} catch (error) {
		console.error("Server rating error:", error);
		if (error.code) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Failed to submit server rating."
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
