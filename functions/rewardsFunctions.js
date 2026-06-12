const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

const IGNORED_CUSTOMER_IDS = new Set(["anonymous", "guest", "walk_in"]);
const DEFAULT_SCERV_POINTS_PER_DOLLAR = 10;
const DEFAULT_RESTAURANT_CLUB_POINTS_PER_DOLLAR = 1;

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
	return Math.floor(dollars * DEFAULT_SCERV_POINTS_PER_DOLLAR);
};

const normalizeTier = (tier, index) => ({
	id: String(tier.id || `tier_${index + 1}`).trim(),
	name: String(tier.name || `Tier ${index + 1}`).trim(),
	thresholdType: String(tier.thresholdType || "visits").trim(),
	thresholdValue: Number(tier.thresholdValue || 0),
	rewardType: tier.rewardType || null,
	rewardValue: tier.rewardValue || null,
	rewardLabel: tier.rewardLabel || tier.name || null,
});

const getEnabledLoyaltyProgram = (restaurantData) => {
	const program = restaurantData.loyaltyProgram || restaurantData.rewardsProgram;
	if (!program || program.enabled !== true) return null;

	const tiers = Array.isArray(program.tiers)
		? program.tiers.map(normalizeTier).filter((tier) => {
				return tier.id && tier.thresholdValue > 0;
			})
		: [];

	return {
		enabled: true,
		name: program.name || "Restaurant Club",
		programType: program.programType || "hybrid",
		clubPointsPerDollar:
			Number(program.pointsPerDollar) ||
			DEFAULT_RESTAURANT_CLUB_POINTS_PER_DOLLAR,
		tiers,
	};
};

const getProgressValue = (progress, thresholdType) => {
	if (thresholdType === "spend") return progress.lifetimeSpend;
	if (thresholdType === "points") return progress.clubPoints;
	return progress.visitCount;
};

const evaluateRestaurantClub = (program, nextProgress) => {
	if (!program || program.tiers.length === 0) {
		return {
			currentTier: null,
			unlockedRewards: [],
		};
	}

	const unlockedTiers = program.tiers
		.filter((tier) => getProgressValue(nextProgress, tier.thresholdType) >= tier.thresholdValue)
		.sort((a, b) => a.thresholdValue - b.thresholdValue);
	const unlockedRewards = unlockedTiers
		.filter((tier) => tier.rewardLabel || tier.rewardType)
		.map((tier) => ({
			id: tier.id,
			tierId: tier.id,
			tierName: tier.name,
			rewardType: tier.rewardType,
			rewardValue: tier.rewardValue,
			rewardLabel: tier.rewardLabel,
			status: "available",
		}));

	return {
		currentTier: unlockedTiers[unlockedTiers.length - 1] || null,
		unlockedRewards,
	};
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
		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const scervLedgerRef = customerRef
			.collection("scervRewardsLedger")
			.doc(orderId);
		const legacyLedgerRef = customerRef.collection("rewardLedger").doc(orderId);
		const restaurantClubRef = customerRef
			.collection("restaurantClubs")
			.doc(restaurantId);

		await db.runTransaction(async (transaction) => {
			const ledgerSnap = await transaction.get(scervLedgerRef);
			const legacyLedgerSnap = await transaction.get(legacyLedgerRef);
			const restaurantSnap = await transaction.get(restaurantRef);
			const restaurantClubSnap = await transaction.get(restaurantClubRef);
			if (ledgerSnap.exists || legacyLedgerSnap.exists) return;

			const now = admin.firestore.FieldValue.serverTimestamp();
			const rewardableSubtotal = normalizeCents(orderData.subtotal);
			const ledgerEntry = {
				type: "earn",
				orderId,
				restaurantId,
				restaurantName: orderData.restaurantName || null,
				points: earnedPoints,
				rewardCurrency: "scerv_points",
				rewardableSubtotal,
				totalPrice: normalizeCents(orderData.totalPrice),
				currency: orderData.currency || "usd",
				createdAt: now,
				status: "available",
				source: "paid_order",
			};

			transaction.set(scervLedgerRef, ledgerEntry);
			transaction.set(legacyLedgerRef, ledgerEntry);
			transaction.set(
				customerRef,
				{
					rewardsSummary: {
						scervAvailablePoints:
							admin.firestore.FieldValue.increment(earnedPoints),
						scervLifetimeEarnedPoints:
							admin.firestore.FieldValue.increment(earnedPoints),
						availablePoints:
							admin.firestore.FieldValue.increment(earnedPoints),
						lifetimeEarnedPoints:
							admin.firestore.FieldValue.increment(earnedPoints),
						lastEarnedAt: now,
						pointsPerDollar: DEFAULT_SCERV_POINTS_PER_DOLLAR,
						rewardCurrency: "scerv_points",
					},
				},
				{ merge: true },
			);

			const restaurantData = restaurantSnap.exists ? restaurantSnap.data() || {} : {};
			const program = getEnabledLoyaltyProgram(restaurantData);
			if (!program) return;

			const currentClub = restaurantClubSnap.exists
				? restaurantClubSnap.data() || {}
				: {};
			const clubPointsEarned = Math.floor(
				(rewardableSubtotal / 100) * program.clubPointsPerDollar,
			);
			const nextProgress = {
				visitCount: Number(currentClub.visitCount || 0) + 1,
				lifetimeSpend: Number(currentClub.lifetimeSpend || 0) + rewardableSubtotal,
				clubPoints: Number(currentClub.clubPoints || 0) + clubPointsEarned,
			};
			const clubResult = evaluateRestaurantClub(program, nextProgress);

			transaction.set(
				restaurantClubRef,
				{
					restaurantId,
					restaurantName:
						orderData.restaurantName || restaurantData.restaurantName || null,
					programName: program.name,
					programType: program.programType,
					...nextProgress,
					lastOrderId: orderId,
					lastVisitAt: now,
					updatedAt: now,
					currentTierId: clubResult.currentTier
						? clubResult.currentTier.id
						: null,
					currentTierName: clubResult.currentTier
						? clubResult.currentTier.name
						: null,
					unlockedRewards: clubResult.unlockedRewards,
				},
				{ merge: true },
			);
		});

		return null;
	});
