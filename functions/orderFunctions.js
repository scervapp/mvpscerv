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

		// Get the last order for this restaurant today
		const lastOrderQuery = db
			.collection("orders")
			.where("restaurantId", "==", restaurantId)
			.where(
				"timestamp",
				">=",
				admin.firestore.Timestamp.fromDate(
					new Date(today.getFullYear(), today.getMonth(), today.getDate())
				)
			) // Start of today
			.where(
				"timestamp",
				"<",
				admin.firestore.Timestamp.fromDate(
					new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
				)
			) // End of today
			.orderBy("timestamp", "desc")
			.limit(1);
		const lastOrderSnapshot = await lastOrderQuery.get();

		let orderNumber = 1; // Default to 1 if no previous orders today
		if (!lastOrderSnapshot.empty) {
			const lastOrderData = lastOrderSnapshot.docs[0].data();
			const lastOrderId = lastOrderData.orderId;
			const lastOrderNumber = parseInt(lastOrderId.split("-")[2], 10);
			orderNumber = lastOrderNumber + 1;
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

// exports.sendToChefsQ = functions.https.onCall(async (data, context) => {
// 	const { restaurantId, customerId, tableNumber, items } = data;

// 	try {
// 		// 1. Input Validation
// 		if (!context.auth || !context.auth.uid) {
// 			throw new functions.https.HttpsError(
// 				"unauthenticated",
// 				"User not authenticated"
// 			);
// 		}

// 		if (
// 			!restaurantId ||
// 			!customerId ||
// 			!tableNumber ||
// 			!items ||
// 			!Array.isArray(items) ||
// 			items.length === 0
// 		) {
// 			throw new functions.https.HttpsError(
// 				"invalid-argument",
// 				"Invalid data provided"
// 			);
// 		}

// 		// 2. Check if an order already exists for this check-in and is pending
// 		const existingOrderQuery = db
// 			.collection("orders")
// 			.where("customerId", "==", customerId)
// 			.where("restaurantId", "==", restaurantId)
// 			.where("orderStatus", "==", "PENDING");
// 		const existingOrderSnapshot = await existingOrderQuery.get();

// 		let orderRef;
// 		let orderId;

// 		if (existingOrderSnapshot.empty) {
// 			// 3a. No existing order, create a new one
// 			const orderData = {
// 				customerId,
// 				restaurantId,
// 				tableNumber,
// 				items: items.map((item) => ({ ...item, sentToChefQ: true })), // Mark items as sent
// 				orderStatus: "PENDING",
// 				paymentStatus: "unpaid",
// 				createdAt: admin.firestore.FieldValue.serverTimestamp(),
// 				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
// 			};

// 			// Calculate total price
// 			orderData.totalPrice = items.reduce((total, item) => {
// 				return total + item.dish.price * item.quantity;
// 			}, 0);

// 			orderRef = await db.collection("orders").add(orderData);

// 			orderId = await generateOrderId(restaurantId, customerId);
// 			await orderRef.update({ orderId });
// 		} else {
// 			// 3b. Existing order found, update it with new items
// 			orderRef = existingOrderSnapshot.docs[0].ref;
// 			const existingOrderData = existingOrderSnapshot.docs[0].data();

// 			// Calculate the price of the new items
// 			const newItemsTotalPrice = items.reduce((total, item) => {
// 				return total + item.dish.price * item.quantity;
// 			}, 0);

// 			// Mark new items as sent and add them to the existing order
// 			const updatedItems = items.map((item) => ({
// 				...item,
// 				sentToChefQ: true,
// 			}));

// 			await orderRef.update({
// 				items: admin.firestore.FieldValue.arrayUnion(...updatedItems),
// 				totalPrice: existingOrderData.totalPrice + newItemsTotalPrice,
// 				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
// 			});

// 			orderId = existingOrderData.orderId;
// 		}

// 		// 4. Update basketItems in Firestore to mark them as sentToChefQ = true
// 		const batch = db.batch();
// 		items.forEach((item) => {
// 			const basketItemRef = db
// 				.collection("baskets")
// 				.doc(userId)
// 				.collection("basketItems")
// 				.doc(item.id);
// 			batch.update(basketItemRef, { sentToChefQ: true });
// 		});
// 		await batch.commit();

// 		// 5. Optionally, send notifications to the restaurant staff
// 		// ...

// 		return { success: true, orderId };
// 	} catch (error) {
// 		console.error("Error sending order to chef's queue:", error);
// 		throw new functions.https.HttpsError("internal", error.message);
// 	}
// });
