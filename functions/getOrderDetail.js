const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { normalizeOrderForReporting } = require("./reportingHelpers");
const db = admin.firestore();

exports.getOrderDetail = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { orderId } = data;
		if (!orderId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Order ID is required.",
			);
		}

		try {
			const doc = await db.collection("orders").doc(orderId).get();

			if (!doc.exists) {
				throw new functions.https.HttpsError("not-found", "Order not found.");
			}

			const o = normalizeOrderForReporting(doc);

			return {
				id: o.id,
				readableOrderId: o.readableOrderId,
				restaurantId: o.restaurantId,
				restaurantName: o.restaurantName,

				paymentProcessor: o.paymentProcessor,
				paymentMethod: o.paymentMethod,
				paymentStatus: o.paymentStatus,
				orderStatus: o.orderStatus,

				orderMode: o.orderMode,
				fulfillmentType: o.fulfillmentType,
				type: o.type,

				subtotal: o.subtotal,
				originalSubtotal: o.originalSubtotal,
				discountTotal: o.discountTotal,
				taxAmount: o.taxAmount,
				gratuityAmount: o.gratuityAmount,
				platformFee: o.platformFee,
				processorFee: o.processorFee,
				totalPrice: o.totalPrice,

				table: o.table,
				server: o.server,
				customerId: o.customerId,
				customerEmail: o.customerEmail,
				customerName: o.customerName,

				openedAt: o.openedAt ? o.openedAt.toISOString() : null,
				fulfilledAt: o.fulfilledAt ? o.fulfilledAt.toISOString() : null,
				turnaroundTimeMinutes: o.turnaroundTimeMinutes,

				items: o.items,
			};
		} catch (error) {
			if (error instanceof functions.https.HttpsError) throw error;
			console.error("getOrderDetail error:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to load order detail.",
			);
		}
	});
