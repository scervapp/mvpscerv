const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

const {
	getStartDateForPeriod,
	normalizeOrderForReporting,
} = require("./reportingHelpers");

exports.getOrdersLedger = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const {
			restaurantId,
			period,
			paymentMethod,
			orderMode,
			fulfillmentType,
			serverId,
			searchText,
			limit = 100,
		} = data;

		if (!restaurantId || !period) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID and period are required.",
			);
		}

		try {
			const startDate = getStartDateForPeriod(period, "America/Panama");

			const snapshot = await db
				.collection("orders")
				.where("restaurantId", "==", restaurantId)
				.where("paymentStatus", "==", "paid")
				.where(
					"fulfilledAt",
					">=",
					admin.firestore.Timestamp.fromDate(startDate),
				)
				.orderBy("fulfilledAt", "desc")
				.limit(Math.min(Number(limit) || 100, 300))
				.get();

			let orders = snapshot.docs.map((doc) => normalizeOrderForReporting(doc));

			if (paymentMethod) {
				orders = orders.filter((o) => o.paymentMethod === paymentMethod);
			}

			if (orderMode) {
				orders = orders.filter((o) => o.orderMode === orderMode);
			}

			if (fulfillmentType) {
				orders = orders.filter((o) => o.fulfillmentType === fulfillmentType);
			}

			if (serverId) {
				orders = orders.filter((o) => o.server && o.server.id === serverId);
			}

			if (searchText) {
				const q = String(searchText).trim().toLowerCase();
				orders = orders.filter((o) => {
					const haystack = [
						o.id,
						o.readableOrderId,
						o.customerName,
						o.customerEmail,
						o.table && o.table.name,
						o.server && o.server.name,
						o.paymentMethod,
						o.orderMode,
					]
						.filter(Boolean)
						.join(" ")
						.toLowerCase();

					return haystack.includes(q);
				});
			}

			return {
				orders: orders.map((o) => ({
					id: o.id,
					readableOrderId: o.readableOrderId,
					restaurantName: o.restaurantName,
					paymentMethod: o.paymentMethod,
					paymentProcessor: o.paymentProcessor,
					orderMode: o.orderMode,
					fulfillmentType: o.fulfillmentType,
					subtotal: o.subtotal,
					taxAmount: o.taxAmount,
					gratuityAmount: o.gratuityAmount,
					platformFee: o.platformFee,
					processorFee: o.processorFee,
					totalPrice: o.totalPrice,
					customerName: o.customerName,
					customerEmail: o.customerEmail,
					table: o.table,
					server: o.server,
					fulfilledAt: o.fulfilledAt ? o.fulfilledAt.toISOString() : null,
					turnaroundTimeMinutes: o.turnaroundTimeMinutes,
					itemCount: Array.isArray(o.items) ? o.items.length : 0,
				})),
				count: orders.length,
			};
		} catch (error) {
			console.error("getOrdersLedger error:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to load orders ledger.",
			);
		}
	});
