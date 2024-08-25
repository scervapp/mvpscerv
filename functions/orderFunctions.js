const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

// Helper function to generate a unique and trackable order ID
async function generateOrderId(restaurantId, customerId) {
	const today = new Date();
	const year = today.getFullYear().toString().slice(-2);
	const month = (today.getMonth() + 1).toString().padStart(2, "0");
	const day = today.getDate().toString().padStart(2, "0");

	const lastOrderQuery = db
		.collection("orders")
		.where("restaurantId", "==", restaurantId)
		.where("timestamp", ">=", today)
		.orderBy("timestamp", "desc")
		.limit(1);
	const lastOrderSnapshot = await lastOrderQuery.get();

	let orderNumber = 1;
	if (!lastOrderSnapshot.empty) {
		const lastOrderData = lastOrderSnapshot.docs[0].data();
		const lastOrderId = lastOrderData.orderId;
		const lastOrderNumber = parseInt(lastOrderId.split("-")[2], 10);
		orderNumber = lastOrderNumber + 1;
	}

	const formattedOrderNumber = orderNumber.toString().padStart(3, "0");

	const orderId = `${restaurantId}-${year}${month}${day}-${formattedOrderNumber}`;

	// Optionally, include the customer ID
	// const orderIdWithCustomer = `${orderId}-${customerId.slice(-4)}`;
	// return orderIdWithCustomer;

	return orderId;
}

exports.sendToChefsQ = functions.https.onCall(async (data, context) => {
	const { restaurantId, customerId, tableNumber, items } = data;

	try {
		// 1. Input Validation
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated"
			);
		}

		if (
			!restaurantId ||
			!customerId ||
			!tableNumber ||
			!items ||
			!Array.isArray(items) ||
			items.length === 0
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid data provided"
			);
		}

		// 2. Check if an order already exists for this check-in and is pending
		const existingOrderQuery = db
			.collection("orders")
			.where("customerId", "==", customerId)
			.where("restaurantId", "==", restaurantId)
			.where("orderStatus", "==", "PENDING"); // Or any other initial status you're using
		const existingOrderSnapshot = await existingOrderQuery.get();

		let orderRef;

		if (existingOrderSnapshot.empty) {
			// 3a. No existing order, create a new one
			const orderData = {
				customerId,
				restaurantId,
				tableNumber,
				items,
				orderStatus: "PENDING", // Or your preferred initial status
				paymentStatus: "unpaid",
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			};

			// Calculate total price
			orderData.totalPrice = items.reduce((total, item) => {
				return total + item.dish.price * item.quantity;
			}, 0);

			orderRef = await db.collection("orders").add(orderData);

			// Generate a unique order ID (you can implement your own logic here)
			const orderId = await generateOrderId(restaurantId, customerId); // Or use your custom generateOrderId function
			await orderRef.update({ orderId });
		} else {
			// 3b. Existing order found, update it with new items
			orderRef = existingOrderSnapshot.docs[0].ref;
			const existingOrderData = existingOrderSnapshot.docs[0].data();

			// Calculate the price of the new items
			const newItemsTotalPrice = items.reduce((total, item) => {
				return total + item.dish.price * item.quantity;
			}, 0);

			await orderRef.update({
				items: admin.firestore.FieldValue.arrayUnion(...items),
				totalPrice: existingOrderData.totalPrice + newItemsTotalPrice,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
		}

		// 4. Optionally, send notifications to the restaurant staff
		// ... (Implementation depends on your notification system)

		return { success: true, orderId: orderRef.id };
	} catch (error) {
		console.error("Error sending order to chef's queue:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
});
