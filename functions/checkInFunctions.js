const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.handleCheckIn = functions.firestore
	.document("checkIns/{checkInId}")
	.onCreate(async (snapshot, context) => {
		const checkInData = snapshot.data();

		try {
			// 1. Validate check-in request (you'll need to implement this logic)
			// - Check if the restaurant is at capacity
			// - Check if the restaurant is currently open
			// - ... other validation checks as needed

			// 2. Update check-in status to 'requested' (or another suitable initial status)
			await snapshot.ref.update({ status: "REQUESTED" });

			// 3. Create notification for the restaurant
			await db.collection("notifications").add({
				restaurantId: checkInData.restaurantId,
				customerId: checkInData.customerId,
				checkInId: context.params.checkInId,
				type: "checkIn",
				isRead: false,
				customerName: checkInData.customerName,
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
				status: "PENDING", // Or another initial status for the notification
				numberOfPeople: checkInData.numberOfPeople,
			});

			// 4. Optionally, send a push notification to the restaurant staff
			// ... (implementation depends on your notification system)

			return null; // Indicate successful function execution
		} catch (error) {
			console.error("Error handling check-in:", error);
			// If there's an error, you might want to update the check-in status to 'error' or 'failed'
			await snapshot.ref.update({ status: "error" });
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

// Cancel Check-In
exports.cancelCheckIn = functions.https.onCall(async (data, context) => {
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

		// 2. Query for the check-in document to cancel (using admin SDK)
		const checkInsRef = db.collection("checkIns");
		const q = checkInsRef
			.where("restaurantId", "==", restaurantId)
			.where("customerId", "==", userId)
			.where("status", "in", ["PENDING", "REQUESTED"]);

		const querySnapshot = await q.get(); // Use q.get() to execute the query

		if (!querySnapshot.empty) {
			const checkInDoc = querySnapshot.docs[0];

			// 3. Delete the check-in document
			await checkInDoc.ref.delete();

			// 4. Delete the associated notification document (using admin SDK)
			const notificationsRef = db.collection("notifications");
			const notificationQuery = notificationsRef.where(
				"checkInId",
				"==",
				checkInDoc.id
			);
			const notificationSnapshot = await notificationQuery.get();

			if (!notificationSnapshot.empty) {
				const notificationDoc = notificationSnapshot.docs[0];
				await notificationDoc.ref.delete();
			}

			// 5. Optionally, perform any additional actions (e.g., update table availability, send notifications)
			// ...

			return { success: true };
		} else {
			// No pending or requested check-in found for this user and restaurant
			return {
				success: false,
				error: "No pending check-in request found to cancel.",
			};
		}
	} catch (error) {
		console.error("Error canceling check-in:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
});

// Handle Checkin-In Response (Accept or Decline)
exports.handleCheckInResponse = functions.https.onCall(
	async (data, context) => {
		const { checkInId, action, tableNumber, employeeName, serverId } = data;

		try {
			if (!checkInId || !action || (action === "accept" && !tableNumber)) {
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Invalid data provided"
				);
			}

			// 2. Get the checkin document reference
			const checkInRef = db.collection("checkIns").doc(checkInId);

			const checkInSnapshot = await checkInRef.get();
			if (!checkInSnapshot.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Check-in request not found"
				);
			}

			// 4. Update teh checkin status optionally assign talbe number
			let updatedData = { status: action }; // Default update
			if (action === "ACCEPTED") {
				updatedData = {
					...updatedData,
					tableNumber: tableNumber,
					employeeName: employeeName,
					employeeId: serverId,
				};
			}

			await checkInRef.update(updatedData);

			// 6. Delete the associated notification document
			const notificationsRef = db.collection("notifications");
			const notificationQuery = notificationsRef.where(
				"checkInId",
				"==",
				checkInId
			);
			const notificationSnapshot = await notificationQuery.get();

			if (!notificationSnapshot.empty) {
				const notificationDoc = notificationSnapshot.docs[0];
				await notificationDoc.ref.delete();
			}

			return { success: true };
		} catch (error) {
			console.error("Error handling checkin response", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	}
);
