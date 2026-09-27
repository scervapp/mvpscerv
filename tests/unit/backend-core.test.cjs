const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
	calculateConfidenceAdjustedRating,
	calculateScervDiscoveryScore,
	getVerificationStatsFromReviews,
} = require("../../functions/discoveryScoring");
const {
	clampFeaturesToEntitlements,
	isFeatureAllowed,
} = require("../../functions/featureEntitlements");

test("community-listed restaurants cannot use operational features", () => {
	const restaurant = {
		isCommunityProfile: true,
		featureEntitlements: { reservations: true, rewards: true },
	};

	assert.equal(isFeatureAllowed(restaurant, "reservations"), false);
	assert.equal(isFeatureAllowed(restaurant, "rewards"), false);
});

test("restaurant feature toggles are clamped to platform entitlements", () => {
	const restaurant = {
		scervStatus: "scerv_enabled",
		featureEntitlements: {
			reservations: true,
			qrSelfCheckIn: false,
			hostCheckInRequests: true,
		},
	};

	assert.deepEqual(
		clampFeaturesToEntitlements(
			{
				reservations: true,
				qrSelfCheckIn: true,
				hostCheckInRequests: true,
			},
			restaurant,
		),
		{
			reservations: true,
			qrSelfCheckIn: false,
			hostCheckInRequests: true,
		},
	);
});

test("discovery scoring rewards rating volume without trusting one perfect rating", () => {
	const onePerfectRating = calculateScervDiscoveryScore({
		averageRating: 5,
		ratingCount: 1,
		reviewCount: 1,
	});
	const manyStrongRatings = calculateScervDiscoveryScore({
		averageRating: 4.7,
		ratingCount: 80,
		reviewCount: 35,
		verificationStats: {
			scervOrderVerifiedCount: 20,
			receiptVerifiedCount: 8,
		},
		mediaCount: 5,
		orderCount: 90,
	});

	assert.ok(manyStrongRatings.score > onePerfectRating.score);
	assert.ok(manyStrongRatings.confidenceAdjustedRating < 4.8);
	assert.ok(calculateConfidenceAdjustedRating(5, 1) < 4.3);
});

test("review verification stats classify trusted and community signals", () => {
	assert.deepEqual(
		getVerificationStatsFromReviews([
			{ wasOrderedThroughScerv: true },
			{ verificationLevel: "receipt" },
			{ data: () => ({ origin: "location" }) },
			{ origin: "community" },
		]),
		{
			scervOrderVerifiedCount: 1,
			receiptVerifiedCount: 1,
			locationVerifiedCount: 1,
			communityReviewCount: 1,
		},
	);
});
