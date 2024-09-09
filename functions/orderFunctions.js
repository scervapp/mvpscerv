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

exports.createOrder = functions.https.onCall(async (data, context) => {
	const { userId, restaurantId, tableNumber, items, totalPrice } = data;
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

		// 2. Generate OrderId
		const orderId = await generateOrderId(restaurantId, userId);

		//3. Create the order document
		const orderRef = await db.collection("orders").add({
			orderId,
			customerId: userId,
			tableNumber,
			items,
			orderStatus: "pending",
			paymentStatus: "paid",
			totalPrice,
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		});

		console.log("Order created with ID:", orderId);

		return { success: true, orderId };
	} catch (error) {
		console.error("Error creating order: ", error);
		throw new functions.https.HttpsError("Internal Error", error.message);
	}
});
