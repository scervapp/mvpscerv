const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
	buildRestaurantPublicProfile,
	sanitizeRewardsProgram,
} = require("../../functions/restaurantPublicProfile");

test("restaurant public projection removes sensitive root fields", () => {
	const projection = buildRestaurantPublicProfile("rest-a", {
		restaurantName: "Harbor and Ember",
		city: "Brooklyn",
		countryCode: "US",
		isLive: true,
		isTestAccount: true,
		stripeAccountId: "acct_sensitive",
		stripeAccountStatus: "verified",
		featureEntitlements: { reservations: true },
		feePolicy: "internal-policy",
		canAcceptPayments: true,
		features: { reservations: true, qrSelfCheckIn: true },
	});

	assert.equal(projection.restaurantName, "Harbor and Ember");
	assert.equal(projection.canAcceptPayments, true);
	assert.deepEqual(projection.features, {
		reservations: true,
		qrSelfCheckIn: true,
	});
	assert.equal(Object.hasOwn(projection, "stripeAccountId"), false);
	assert.equal(Object.hasOwn(projection, "stripeAccountStatus"), false);
	assert.equal(Object.hasOwn(projection, "featureEntitlements"), false);
	assert.equal(Object.hasOwn(projection, "feePolicy"), false);
	assert.equal(Object.hasOwn(projection, "isTestAccount"), false);
});

test("restaurant public projection omits unpublished restaurants", () => {
	assert.equal(
		buildRestaurantPublicProfile("rest-a", {
			restaurantName: "Hidden Test Restaurant",
			isLive: false,
		}),
		null,
	);
});

test("restaurant rewards program projection drops internal audit fields", () => {
	assert.deepEqual(
		sanitizeRewardsProgram({
			enabled: true,
			name: "Harbor Club",
			updatedBy: "owner-a",
			internalNotes: "private",
			audit: { by: "admin" },
		}),
		{
			enabled: true,
			name: "Harbor Club",
		},
	);
});
