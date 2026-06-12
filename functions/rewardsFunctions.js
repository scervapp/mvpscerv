const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

const IGNORED_CUSTOMER_IDS = new Set(["anonymous", "guest", "walk_in"]);
const DEFAULT_POINTS_PER_DOLLAR = 10;

const normalizeCustomerId = (value) => String(value || "").trim();

const isRewardEligibleCustomer = (customerId) => {
	const normalized = normalizeCustomerId(customerId).toLowerCase();
	return normalized && !IGNORED_CUSTOMER_IDS.has(normalized);
};

const normalizeCents = (value) => {
	const numberValue = Number(value || 0);
	if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;
	return Math.round(numberValue);
};

const calculateEarnedPoints = (orderData) => {
	const rewardableSubtotal = normalizeCents(orderData.subtotal);
	const dollars = rewardableSubtotal / 100;
	return Math.floor(dollars * DEFAULT_POINTS_PER_DOLLAR);
};

exports.awardRewardsForPaidOrder = functions.firestore
	.document("orders/{orderId}")
	.onCreate(async (snap, context) => {
		const orderId = context.params.orderId;
		const orderData = snap.data() || {};

		if (orderData.paymentStatus !== "paid") return null;

		const customerId = normalizeCustomerId(orderData.customerId);
		const restaurantId = String(orderData.restaurantId || "").trim();
		if (!isRewardEligibleCustomer(customerId) || !restaurantId) return null;

		const earnedPoints = calculateEarnedPoints(orderData);
		if (earnedPoints <= 0) return null;

		const customerRef = db.collection("customers").doc(customerId);
		const ledgerRef = customerRef.collection("rewardLedger").doc(orderId);
		const restaurantRewardsRef = customerRef
			.collection("restaurantRewards")
			.doc(restaurantId);

		await db.runTransaction(async (transaction) => {
			const ledgerSnap = await transaction.get(ledgerRef);
			if (ledgerSnap.exists) return;

			const now = admin.firestore.FieldValue.serverTimestamp();
			const ledgerEntry = {
				type: "earn",
				orderId,
				restaurantId,
				restaurantName: orderData.restaurantName || null,
				points: earnedPoints,
				rewardableSubtotal: normalizeCents(orderData.subtotal),
				totalPrice: normalizeCents(orderData.totalPrice),
				currency: orderData.currency || "usd",
				createdAt: now,
				status: "available",
				source: "paid_order",
			};

			transaction.set(ledgerRef, ledgerEntry);
			transaction.set(
				customerRef,
				{
					rewardsSummary: {
						availablePoints:
							admin.firestore.FieldValue.increment(earnedPoints),
						lifetimeEarnedPoints:
							admin.firestore.FieldValue.increment(earnedPoints),
						lastEarnedAt: now,
						pointsPerDollar: DEFAULT_POINTS_PER_DOLLAR,
					},
				},
				{ merge: true },
			);
			transaction.set(
				restaurantRewardsRef,
				{
					restaurantId,
					restaurantName: orderData.restaurantName || null,
					availablePoints:
						admin.firestore.FieldValue.increment(earnedPoints),
					lifetimeEarnedPoints:
						admin.firestore.FieldValue.increment(earnedPoints),
					visitCount: admin.firestore.FieldValue.increment(1),
					lastOrderId: orderId,
					lastEarnedAt: now,
					updatedAt: now,
				},
				{ merge: true },
			);
		});

		return null;
	});
