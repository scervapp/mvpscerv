const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

// Helper function to generate a unique and trackable order ID
async function generateOrderId(restaurantId, customerId) {
	try {
		const today = new Date();
		const year = today.getFullYear().toString().slice(-2); // Last two digits of the year
		const month = (today.getMonth() + 1).toString().padStart(2, "0"); // Month (01-12)
		const day = today.getDate().toString().padStart(2, "0"); // Day (01-31)

		// Calculate start and end of the current day (00:00:00 to 23:59:59)
		const startOfDay = new Date(
			Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
		);

		const endOfDay = new Date(
			Date.UTC(
				today.getFullYear(),
				today.getMonth(),
				today.getDate(),
				23,
				59,
				59
			)
		);

		// Get the last order for this restaurant today
		// Get the last order for this restaurant today
		const lastOrderQuery = db
			.collection("orders")
			.where("restaurantId", "==", restaurantId)
			.where("timestamp", ">=", admin.firestore.Timestamp.fromDate(startOfDay)) // Start of today
			.where("timestamp", "<=", admin.firestore.Timestamp.fromDate(endOfDay)) // End of today
			.orderBy("timestamp", "desc")
			.limit(1);

		const lastOrderSnapshot = await lastOrderQuery.get();

		let orderNumber = 1;
		//let orderNumber = 1; // Default to 1 if no previous orders today
		if (!lastOrderSnapshot.empty) {
			const lastOrderData = lastOrderSnapshot.docs[0].data();

			// --- THIS IS THE FIX ---
			// Safely check if lastOrderId exists and is a string before trying to split it.
			const lastOrderId = lastOrderData.orderId;
			if (
				lastOrderId &&
				typeof lastOrderId === "string" &&
				lastOrderId.includes("-")
			) {
				const parts = lastOrderId.split("-");
				// Ensure there are enough parts to prevent another crash
				if (parts.length > 2) {
					const lastOrderNumber = parseInt(parts[2], 10);
					if (!isNaN(lastOrderNumber)) {
						orderNumber = lastOrderNumber + 1;
					}
				}
			}
			// If the last order was malformed, we will safely default to '1'.
		}

		const formattedOrderNumber = orderNumber.toString().padStart(3, "0");
		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const restaurantSnapshot = await restaurantRef.get();

		if (!restaurantSnapshot.exists) {
			throw new Error("Restaurant not found");
		}
		const restaurantNumber = restaurantSnapshot.data().restaurantNumber;

		const orderId = `${restaurantNumber}-${year}${month}${day}-${formattedOrderNumber}`;

		// Optionally, include the customer ID (or part of it) in the order ID
		// const orderIdWithCustomer = `${orderId}-${customerId.slice(-4)}`;
		// return orderIdWithCustomer;

		return orderId;
	} catch (error) {
		console.error("Error generating orderId:", error);
		// You might want to handle the error more gracefully here,
		// depending on your app's requirements (e.g., retry, generate a temporary ID, etc.)
		throw error;
	}
}

exports.createOrder = functions.https.onCall(async (data, context) => {
	const {
		userId,
		restaurantId,
		table,
		items,
		totalPrice,
		server,
		gratuity,
		subtotal,
		tax,
		fee,
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
			items.length === 0 ||
			isNaN(totalPrice) ||
			totalPrice <= 0
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided"
			);
		}

		let platformFeeShouldBeWaived = false;
		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const restaurantSnapshot = await restaurantRef.get();
		if (!restaurantSnapshot.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found");
		} else {
			const restaurantData = restaurantSnapshot.data();

			if (restaurantData.waivePlatformFee) {
				platformFeeShouldBeWaived = true;
				console.log(
					`Platform fee waived for restaurant ${restaurantId} based on settings.`
				);
			}
		}

		// 2. Generate OrderId
		const orderId = await generateOrderId(restaurantId, userId);
		//3. Create the order document
		const orderRef = await db.collection("orders").add({
			orderId,
			customerId: userId,
			table,
			items,
			orderStatus: "pending",
			paymentStatus: "paid",
			totalPrice,
			server,
			gratuity,
			subtotal,
			tax,
			fee,
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
			restaurantId,
			platformFeeWaived: platformFeeShouldBeWaived,
		});

		const tableRef = await db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc(table.id);

		tableRef.update({
			status: "checkedOut",
		});

		return { success: true, orderId, orderRef: orderRef.id };
	} catch (error) {
		console.error("Error creating order: ", error);
		throw new functions.https.HttpsError("Internal Error", error.message);
	}
});

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
