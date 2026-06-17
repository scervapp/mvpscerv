const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {
	assertFeatureAllowed,
	isFeatureAllowed,
} = require("./featureEntitlements");

const db = admin.firestore();

const IGNORED_CUSTOMER_IDS = new Set(["anonymous", "guest", "walk_in"]);
const DEFAULT_SCERV_POINTS_PER_DOLLAR = 10;
const DEFAULT_RESTAURANT_CLUB_POINTS_PER_DOLLAR = 1;
const ALLOWED_THRESHOLD_TYPES = ["visits", "spend", "points"];
const ALLOWED_REWARD_TYPES = [
	"perk",
	"discount_percent",
	"discount_amount",
	"free_item",
	"vip_access",
];
const ALLOWED_PROMOTION_TYPES = [
	"free_item",
	"discount_percent",
	"discount_amount",
	"perk",
];

const normalizeCustomerId = (value) => String(value || "").trim();

const sanitizeString = (value, maxLength = 240) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, maxLength);

const isRewardEligibleCustomer = (customerId) => {
	const normalized = normalizeCustomerId(customerId).toLowerCase();
	return normalized && !IGNORED_CUSTOMER_IDS.has(normalized);
};

const normalizeCents = (value) => {
	const numberValue = Number(value || 0);
	if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;
	return Math.round(numberValue);
};

const normalizePromotionType = (value) => {
	const type = sanitizeString(value, 60);
	return ALLOWED_PROMOTION_TYPES.includes(type) ? type : "perk";
};

const isExpiredTimestamp = (timestamp) => {
	if (!timestamp || typeof timestamp.toMillis !== "function") return false;
	return timestamp.toMillis() <= Date.now();
};

const isPromotionAvailableAtRestaurant = (promotion, restaurantId) => {
	const promoRestaurantId = sanitizeString(promotion.restaurantId, 120);
	const allowedRestaurantIds = Array.isArray(promotion.allowedRestaurantIds)
		? promotion.allowedRestaurantIds.map((id) => sanitizeString(id, 120))
		: [];

	return (
		!promoRestaurantId ||
		promoRestaurantId === "global" ||
		promoRestaurantId === restaurantId ||
		allowedRestaurantIds.includes(restaurantId)
	);
};

const requireAuth = (context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Authentication is required.",
		);
	}
	return context.auth.uid;
};

const assertRestaurantAccess = async (uid, restaurantId, authToken = {}) => {
	const restaurantSnap = await db.collection("restaurants").doc(restaurantId).get();
	if (!restaurantSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}

	const restaurantData = restaurantSnap.data() || {};
	const ownerIds = [
		restaurantId,
		restaurantData.uid,
		restaurantData.ownerId,
		restaurantData.restaurantOwnerId,
	].filter(Boolean);
	const tokenRestaurantId =
		authToken && typeof authToken.restaurantId === "string"
			? authToken.restaurantId
			: "";

	if (!ownerIds.includes(uid) && tokenRestaurantId !== restaurantId) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You do not have permission to manage this restaurant.",
		);
	}

	return { id: restaurantSnap.id, ...restaurantData };
};

const calculateEarnedPoints = (orderData) => {
	const rewardableSubtotal = normalizeCents(orderData.subtotal);
	const dollars = rewardableSubtotal / 100;
	return Math.floor(dollars * DEFAULT_SCERV_POINTS_PER_DOLLAR);
};

const normalizeTier = (tier, index) => ({
	id: String(tier.id || `tier_${index + 1}`).trim(),
	name: String(tier.name || `Tier ${index + 1}`).trim(),
	thresholdType: ALLOWED_THRESHOLD_TYPES.includes(
		String(tier.thresholdType || "visits").trim(),
	)
		? String(tier.thresholdType || "visits").trim()
		: "visits",
	thresholdValue: Number(tier.thresholdValue || 0),
	rewardType: ALLOWED_REWARD_TYPES.includes(tier.rewardType)
		? tier.rewardType
		: "perk",
	rewardValue: tier.rewardValue || null,
	rewardLabel: sanitizeString(tier.rewardLabel || tier.name || "", 160) || null,
	maxDiscountCents: normalizeCents(tier.maxDiscountCents || tier.maxValueCents),
});

const getRewardKey = (reward) =>
	String(
		(reward && (reward.id || reward.tierId || reward.rewardLabel)) || "",
	).trim();

const getSafeDocId = (value, fallback = "reward") =>
	(sanitizeString(value, 160) || fallback).replace(/[\/#?\[\]]/g, "_");

const getAutomaticRestaurantRewardDiscount = (orderData = {}) => {
	const discount = orderData.activePromotionDiscount || null;
	if (!discount || discount.source !== "automatic_restaurant_reward") return null;

	const rewardId = getRewardKey({
		id: discount.rewardId,
		tierId: discount.tierId,
		rewardLabel: discount.rewardLabel,
	});
	if (!rewardId) return null;

	return {
		...discount,
		rewardId,
	};
};

const getEnabledLoyaltyProgram = (restaurantData) => {
	if (!isFeatureAllowed(restaurantData, "rewards")) return null;

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
			nextTier: null,
			nextTierProgress: null,
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
			maxDiscountCents: tier.maxDiscountCents || 0,
			status: "available",
		}));
	const currentTier = unlockedTiers[unlockedTiers.length - 1] || null;
	const nextTier = program.tiers.find((tier) => {
		return getProgressValue(nextProgress, tier.thresholdType) < tier.thresholdValue;
	}) || null;
	const nextTierProgress = nextTier
		? {
				tierId: nextTier.id,
				tierName: nextTier.name,
				thresholdType: nextTier.thresholdType,
				thresholdValue: nextTier.thresholdValue,
				currentValue: getProgressValue(nextProgress, nextTier.thresholdType),
				remainingValue: Math.max(
					0,
					nextTier.thresholdValue -
						getProgressValue(nextProgress, nextTier.thresholdType),
				),
				rewardLabel: nextTier.rewardLabel || nextTier.name,
			}
		: null;

	return {
		currentTier,
		nextTier,
		nextTierProgress,
		unlockedRewards,
	};
};

exports.saveRestaurantLoyaltyProgram = functions.https.onCall(
	async (data, context) => {
		const uid = requireAuth(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 120);
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const restaurantData = await assertRestaurantAccess(
			uid,
			restaurantId,
			context.auth.token || {},
		);
		const requestedProgram = (data && data.program) || {};
		if (requestedProgram.enabled === true) {
			assertFeatureAllowed(
				restaurantData,
				"rewards",
				"Rewards are not enabled for this restaurant plan.",
			);
		}

		const tiers = Array.isArray(requestedProgram.tiers)
			? requestedProgram.tiers
					.slice(0, 8)
					.map(normalizeTier)
					.filter((tier) => tier.name && tier.thresholdValue > 0)
					.sort((a, b) => a.thresholdValue - b.thresholdValue)
			: [];
		const program = {
			enabled: requestedProgram.enabled === true,
			name:
				sanitizeString(requestedProgram.name, 80) ||
				`${restaurantData.restaurantName || "Restaurant"} Club`,
			programType: "hybrid",
			pointsPerDollar: Math.max(
				0,
				Number(
					requestedProgram.pointsPerDollar ||
						DEFAULT_RESTAURANT_CLUB_POINTS_PER_DOLLAR,
				),
			),
			tiers,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedBy: uid,
		};

		// Store the same program under both names while the app migrates. Older
		// code reads rewardsProgram; newer hospitality copy reads loyaltyProgram.
		await db.collection("restaurants").doc(restaurantId).set(
			{
				loyaltyProgram: program,
				rewardsProgram: program,
				"features.loyaltyClub": program.enabled,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		return { success: true, program };
	},
);

exports.redeemRestaurantReward = functions.https.onCall(async (data, context) => {
	const uid = requireAuth(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 120);
	const customerId = sanitizeString(data && data.customerId, 120);
	const rewardId = sanitizeString(data && data.rewardId, 160);
	const partyId = sanitizeString(data && data.partyId, 120) || null;

	if (!restaurantId || !customerId || !rewardId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant, customer, and reward are required.",
		);
	}

	const restaurantData = await assertRestaurantAccess(
		uid,
		restaurantId,
		context.auth.token || {},
	);
	assertFeatureAllowed(
		restaurantData,
		"rewards",
		"Rewards are not enabled for this restaurant plan.",
	);

	const clubRef = db
		.collection("customers")
		.doc(customerId)
		.collection("restaurantClubs")
		.doc(restaurantId);
	const redemptionRef = clubRef.collection("redemptions").doc();

	return db.runTransaction(async (transaction) => {
		const clubSnap = await transaction.get(clubRef);
		if (!clubSnap.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"This guest has not earned rewards at this restaurant yet.",
			);
		}

		const clubData = clubSnap.data() || {};
		const rewards = Array.isArray(clubData.unlockedRewards)
			? clubData.unlockedRewards
			: [];
		const rewardIndex = rewards.findIndex(
			(reward) => getRewardKey(reward) === rewardId,
		);
		if (rewardIndex < 0) {
			throw new functions.https.HttpsError(
				"not-found",
				"Reward is no longer available.",
			);
		}

		const reward = rewards[rewardIndex] || {};
		if (reward.status === "redeemed") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Reward has already been redeemed.",
			);
		}

		const now = admin.firestore.FieldValue.serverTimestamp();
		const redemption = {
			id: redemptionRef.id,
			rewardId,
			tierId: reward.tierId || reward.id || null,
			tierName: reward.tierName || null,
			rewardType: reward.rewardType || null,
			rewardValue: reward.rewardValue || null,
			rewardLabel: reward.rewardLabel || reward.tierName || "Restaurant perk",
			status: "redeemed",
			restaurantId,
			customerId,
			partyId,
			redeemedBy: uid,
			redeemedAt: now,
		};
		const nextRewards = rewards.map((item, index) => {
			if (index !== rewardIndex) return item;
			return {
				...item,
				status: "redeemed",
				redemptionId: redemptionRef.id,
				redeemedAt: now,
				redeemedBy: uid,
				partyId,
			};
		});

		transaction.set(redemptionRef, redemption);
		transaction.set(
			clubRef,
			{
				unlockedRewards: nextRewards,
				lastRedeemedReward: redemption,
				updatedAt: now,
			},
			{ merge: true },
		);

		return { success: true, redemptionId: redemptionRef.id };
	});
});

exports.redeemCustomerPromotion = functions.https.onCall(async (data, context) => {
	const uid = requireAuth(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 120);
	const customerId = sanitizeString(data && data.customerId, 120);
	const promotionId = sanitizeString(data && data.promotionId, 160);
	const partyId = sanitizeString(data && data.partyId, 120) || null;
	const orderId = sanitizeString(data && data.orderId, 120) || null;

	if (!restaurantId || !customerId || !promotionId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant, customer, and promotion are required.",
		);
	}

	await assertRestaurantAccess(uid, restaurantId, context.auth.token || {});

	const promotionRef = db
		.collection("customers")
		.doc(customerId)
		.collection("promotions")
		.doc(promotionId);
	const basketRef = partyId ? db.collection("shared_baskets").doc(partyId) : null;
	const customerRedemptionRef = promotionRef.collection("redemptions").doc();
	const reconciliationRef = db.collection("promotionRedemptions").doc();

	return db.runTransaction(async (transaction) => {
		const promotionSnap = await transaction.get(promotionRef);
		const basketSnap = basketRef ? await transaction.get(basketRef) : null;
		if (!promotionSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Promotion not found.");
		}
		if (basketRef && !basketSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Party basket not found.");
		}

		const promotion = promotionSnap.data() || {};
		const basket = basketSnap && basketSnap.exists ? basketSnap.data() || {} : {};
		const activeDiscount = basket.activePromotionDiscount || null;
		if (activeDiscount && activeDiscount.status === "active") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Only one discount can be active on a party at a time.",
			);
		}
		const hasItemDiscount = Array.isArray(basket.items)
			? basket.items.some((item) => {
					const discount = Number(item.discount || 0);
					const hasDiscountedPrice =
						item.discountedPrice !== undefined &&
						item.discountedPrice !== null &&
						Number(item.discountedPrice) < Number(item.price || 0);
					return discount > 0 || hasDiscountedPrice;
				})
			: false;
		if (hasItemDiscount) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This party already has a discount. Remove it before redeeming a promotion.",
			);
		}
		if (promotion.status === "redeemed") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Promotion has already been redeemed.",
			);
		}
		if (promotion.status && promotion.status !== "available") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Promotion is not available.",
			);
		}
		if (isExpiredTimestamp(promotion.expiresAt)) {
			throw new functions.https.HttpsError(
				"deadline-exceeded",
				"Promotion has expired.",
			);
		}
		if (!isPromotionAvailableAtRestaurant(promotion, restaurantId)) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"This promotion cannot be redeemed at this restaurant.",
			);
		}

		const now = admin.firestore.FieldValue.serverTimestamp();
		const redemption = {
			id: reconciliationRef.id,
			customerPromotionId: promotionId,
			campaignId: sanitizeString(promotion.campaignId, 160) || null,
			title: sanitizeString(promotion.title, 160) || "Scerv promotion",
			promotionType: normalizePromotionType(promotion.promotionType || promotion.type),
			promotionValue: promotion.promotionValue || promotion.value || null,
			appliedDiscountCents: normalizeCents(data && data.appliedDiscountCents),
			eligibleSubtotalCents: normalizeCents(data && data.eligibleSubtotalCents),
			maxDiscountCents: normalizeCents(
				promotion.maxDiscountCents || promotion.maxValueCents,
			),
			fundedBy: sanitizeString(promotion.fundedBy, 80) || "scerv",
			reimbursementPolicy:
				sanitizeString(promotion.reimbursementPolicy, 120) || "reconcile",
			status: "redeemed",
			restaurantId,
			customerId,
			partyId,
			orderId,
			redeemedBy: uid,
			redeemedAt: now,
		};

		transaction.set(reconciliationRef, redemption);
		transaction.set(customerRedemptionRef, redemption);
		if (basketRef) {
			transaction.set(
				basketRef,
				{
					activePromotionDiscount: {
						...redemption,
						status: "active",
						redemptionId: reconciliationRef.id,
					},
					updatedAt: now,
				},
				{ merge: true },
			);
		}
		transaction.set(
			promotionRef,
			{
				status: "redeemed",
				redemptionId: reconciliationRef.id,
				redeemedAt: now,
				redeemedBy: uid,
				redeemedRestaurantId: restaurantId,
				partyId,
				orderId,
				updatedAt: now,
			},
			{ merge: true },
		);

		return { success: true, redemptionId: reconciliationRef.id };
	});
});

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
			const existingRewards = Array.isArray(currentClub.unlockedRewards)
				? currentClub.unlockedRewards
				: [];
			const existingRewardsByKey = new Map(
				existingRewards.map((reward) => [getRewardKey(reward), reward]),
			);
			const automaticRewardDiscount =
				getAutomaticRestaurantRewardDiscount(orderData);
			const automaticRewardId = automaticRewardDiscount
				? automaticRewardDiscount.rewardId
				: "";
			const automaticRedemptionRef = automaticRewardId
				? restaurantClubRef
						.collection("redemptions")
						.doc(`${getSafeDocId(orderId, "order")}_${getSafeDocId(automaticRewardId)}`)
				: null;
			const automaticReconciliationRef = automaticRewardId
				? db
						.collection("restaurantRewardRedemptions")
						.doc(`${getSafeDocId(orderId, "order")}_${getSafeDocId(automaticRewardId)}`)
				: null;
			let automaticRedemption = null;

			// Preserve redemption state across future paid orders while allowing
			// newly earned rewards to appear from the current loyalty program.
			const nextUnlockedRewards = clubResult.unlockedRewards.map((reward) => {
				const rewardKey = getRewardKey(reward);
				const existingReward = existingRewardsByKey.get(rewardKey) || null;

				if (automaticRewardId && rewardKey === automaticRewardId) {
					automaticRedemption = {
						id: automaticRedemptionRef.id,
						rewardId: automaticRewardId,
						tierId:
							automaticRewardDiscount.tierId ||
							automaticRewardDiscount.rewardId ||
							reward.tierId ||
							reward.id ||
							null,
						tierName:
							automaticRewardDiscount.tierName ||
							reward.tierName ||
							null,
						rewardType:
							automaticRewardDiscount.rewardType ||
							reward.rewardType ||
							null,
						rewardValue:
							automaticRewardDiscount.rewardValue ||
							reward.rewardValue ||
							null,
						rewardLabel:
							automaticRewardDiscount.rewardLabel ||
							reward.rewardLabel ||
							reward.tierName ||
							"Restaurant perk",
						status: "redeemed",
						restaurantId,
						customerId,
						partyId: orderData.partyId || null,
						orderId,
						programName:
							automaticRewardDiscount.programName || program.name,
						source: "automatic_checkout",
						redeemedBy: "automatic_checkout",
						redeemedAt: now,
						discountAmountCents: normalizeCents(
							automaticRewardDiscount.appliedDiscountCents,
						),
						eligibleSubtotalCents: normalizeCents(
							automaticRewardDiscount.eligibleSubtotalCents ||
								rewardableSubtotal,
						),
						visitNumber:
							Number(automaticRewardDiscount.visitNumber) ||
							nextProgress.visitCount,
					};

					return {
						...reward,
						status: "redeemed",
						redemptionId: automaticRedemptionRef.id,
						redeemedAt: now,
						redeemedBy: "automatic_checkout",
						partyId: orderData.partyId || null,
						orderId,
						appliedDiscountCents:
							automaticRedemption.discountAmountCents,
						autoApplied: true,
					};
				}

				if (
					existingReward &&
					(existingReward.status === "redeemed" ||
						existingReward.status === "consumed")
				) {
					return {
						...reward,
						...existingReward,
					};
				}

				return {
					...reward,
					status: existingReward ? existingReward.status || reward.status : reward.status,
				};
			});

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
					nextTierId: clubResult.nextTier ? clubResult.nextTier.id : null,
					nextTierName: clubResult.nextTier ? clubResult.nextTier.name : null,
					nextTierProgress: clubResult.nextTierProgress,
					unlockedRewards: nextUnlockedRewards,
					...(automaticRedemption
						? { lastRedeemedReward: automaticRedemption }
						: {}),
				},
				{ merge: true },
			);

			if (automaticRedemption) {
				transaction.set(automaticRedemptionRef, automaticRedemption, {
					merge: true,
				});
				transaction.set(automaticReconciliationRef, automaticRedemption, {
					merge: true,
				});
			}
		});

		return null;
	});
