const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Generates a human-readable, sequential order ID for a restaurant.
 * The format is: {restaurantNumber}-{YYMMDD}-{sequence}, e.g., "1005-250812-001".
 * @param {string} restaurantId The Firestore document ID of the restaurant.
 * @returns {Promise<string>} The new human-readable order ID.
 */
async function generateOrderId(restaurantId) {
	try {
		const today = new Date();
		const year = today.getFullYear().toString().slice(-2);
		const month = (today.getMonth() + 1).toString().padStart(2, "0");
		const day = today.getDate().toString().padStart(2, "0");

		// Set the query to look for orders created today for this specific restaurant
		const startOfDay = new Date(today.setHours(0, 0, 0, 0));
		const endOfDay = new Date(today.setHours(23, 59, 59, 999));

		const lastOrderQuery = db
			.collection("orders")
			.where("restaurantId", "==", restaurantId)
			.where(
				"fulfilledAt",
				">=",
				admin.firestore.Timestamp.fromDate(startOfDay)
			)
			.where("fulfilledAt", "<=", admin.firestore.Timestamp.fromDate(endOfDay))
			.orderBy("fulfilledAt", "desc")
			.limit(1);

		const lastOrderSnapshot = await lastOrderQuery.get();

		let orderNumber = 1;
		if (!lastOrderSnapshot.empty) {
			const lastOrderData = lastOrderSnapshot.docs[0].data();
			const lastReadableId = lastOrderData.readableOrderId; // Parse the human-readable ID

			if (
				lastReadableId &&
				typeof lastReadableId === "string" &&
				lastReadableId.includes("-")
			) {
				const parts = lastReadableId.split("-"); // e.g., ["1005", "250812", "001"]
				if (parts.length > 2) {
					const lastOrderNumber = parseInt(parts[2], 10);
					if (!isNaN(lastOrderNumber)) {
						orderNumber = lastOrderNumber + 1;
					}
				}
			}
		}

		const restaurantDoc = await db
			.collection("restaurants")
			.doc(restaurantId)
			.get();
		if (!restaurantDoc.exists) {
			throw new Error("Restaurant not found when generating order ID");
		}
		const restaurantNumber = restaurantDoc.data().restaurantNumber;

		const formattedOrderNumber = orderNumber.toString().padStart(3, "0");
		return `${restaurantNumber}-${year}${month}${day}-${formattedOrderNumber}`;
	} catch (error) {
		console.error("Error generating readable orderId:", error);
		// Fallback to a non-sequential ID in case of error
		return `ERROR-${Date.now()}`;
	}
}

// Renamed and Modified Function
exports.createPendingOrder = functions.https.onCall(async (data, context) => {
	const {
		userId,
		restaurantId,
		table,
		items,
		// No totalPrice, tax from client needed here
		server,
		gratuity, // Pre-calculated gratuity (cents)
		subtotal, // Pre-calculated subtotal after discounts (cents)
		fee, // Pre-calculated potential platform fee (cents)
		originalSubtotal, // Optional: store pre-discount total
		totalDiscount, // Optional: store total discount
		restaurantName,
		checkInTimestamp,

		checkInId,
	} = data;

	try {
		// Input validation
		if (!context.auth || !context.auth.uid || context.auth.uid !== userId) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated"
			);
		}
		if (
			!restaurantId ||
			!items ||
			!Array.isArray(items) ||
			items.length === 0
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided (restaurantId, items)"
			);
		}
		if (
			typeof subtotal !== "number" ||
			typeof gratuity !== "number" ||
			typeof fee !== "number"
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Subtotal, gratuity, and fee must be numbers."
			);
		}

		// Determine waiver status (same as before)
		let platformFeeShouldBeWaived = false;
		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const restaurantSnapshot = await restaurantRef.get();
		if (!restaurantSnapshot.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found");
		} else {
			const restaurantData = restaurantSnapshot.data();
			if (restaurantData.waivePlatformFee === true) {
				// Use your actual field name
				platformFeeShouldBeWaived = true;
			}
		}
		const workDaysRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("work_days");
		const openWorkDayQuery = workDaysRef.where("status", "==", "OPEN").limit(1);
		const openWorkDaySnapshot = await openWorkDayQuery.get();

		let activeWorkDayId = null;
		if (!openWorkDaySnapshot.empty) {
			activeWorkDayId = openWorkDaySnapshot.docs[0].id;
			console.log(
				`Found active workday ${activeWorkDayId} for this pending order.`
			);
		} else {
			// This is a critical failure because an individual should not be able to order
			// if the restaurant isn't open.
			console.error(
				`CRITICAL: User ${userId} tried to create an order but no active workday was found for restaurant ${restaurantId}.`
			);
			throw new functions.https.HttpsError(
				"failed-precondition",
				"The restaurant is currently not open for orders."
			);
		}

		// Generate OrderId
		const generatedOrderId = await generateOrderId(restaurantId, userId);

		// Create the *pending* order document
		const orderData = {
			orderId: generatedOrderId, // Your human-readable ID
			customerId: userId,
			restaurantId,
			checkInId: checkInId,
			restaurantName,
			table,
			items,
			server,
			gratuity, // Store pre-calculated gratuity
			subtotal, // Store pre-calculated subtotal
			fee, // Store potential platform fee
			platformFeeWaived: platformFeeShouldBeWaived,
			// --- Set initial status ---
			orderStatus: "pending_payment",
			paymentStatus: "pending",
			// --- Initialize financial fields to be updated by webhook ---
			totalPrice: 0, // Final total charged by Stripe
			taxActual: 0, // Actual tax calculated by Stripe
			stripeFeeActual: 0, // Actual Stripe processing fee
			platformFeeActual: 0, // Actual platform fee collected
			// --- Store optional calculation inputs if needed ---
			originalSubtotal: originalSubtotal || 0,
			totalDiscount: totalDiscount || 0,
			// --- Timestamp ---
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
			// Add other initial fields as needed
			checkInTimestamp: checkInTimestamp || null,
		};

		console.log(
			`Creating pending order document for orderId: ${generatedOrderId}`
		);
		const orderDocRef = await db.collection("orders").add(orderData); // Use add() to get auto-ID
		console.log(
			`Pending order document created with Firestore ID: ${orderDocRef.id}`
		);

		// --- DO NOT UPDATE TABLE STATUS HERE ---

		// Return the IDs needed by the client
		return {
			success: true,
			orderId: generatedOrderId, // Your generated ID (e.g., 5-...)
			firestoreDocId: orderDocRef.id, // The unique Firestore document ID
		};
	} catch (error) {
		console.error("Error creating pending order: ", error);
		if (error.code && error.httpErrorCode) {
			throw error;
		} // Re-throw HttpsErrors
		throw new functions.https.HttpsError(
			"internal",
			"Failed to create pending order.",
			error.message
		);
	}
});

exports.generateOrderId = generateOrderId;
