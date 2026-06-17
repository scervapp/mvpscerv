const functions = require("firebase-functions");

const FEATURE_ALIASES = {
	reservations: ["reservations", "reservationsEnabled"],
	reservationWaitlist: [
		"reservationWaitlist",
		"waitlist",
		"reservations",
		"reservationsEnabled",
	],
	hostCheckInRequests: [
		"hostCheckInRequests",
		"walkInCheckInRequests",
		"hostCheckIn",
	],
	reviews: ["reviews", "ratings", "menuReviews"],
	rewards: ["rewards", "loyaltyClub", "loyaltyClubEnabled"],
	loyaltyClub: ["loyaltyClub", "loyaltyClubEnabled", "rewards"],
	qrSelfCheckIn: ["qrSelfCheckIn", "qrSelfCheckInEnabled"],
	parties: ["parties", "partiesEnabled"],
	pickup: ["pickup", "pickupEnabled"],
	tableScanOrdering: ["tableScanOrdering", "tableScanOrderingEnabled"],
	serviceRequests: ["serviceRequests", "serviceRequestsEnabled"],
};

const ENTITLEMENT_SOURCES = [
	"featureEntitlements",
	"subscriptionFeatures",
	"planFeatures",
	"platformFeatures",
	"entitlements",
];

const getFeatureKeys = (featureKey) => {
	const aliases = FEATURE_ALIASES[featureKey] || [];
	return [featureKey].concat(aliases);
};

const hasExplicitDeny = (source, featureKey) => {
	if (!source || typeof source !== "object") return false;
	const keys = getFeatureKeys(featureKey);
	return keys.some((key) => source[key] === false);
};

const isFeatureAllowed = (restaurantData, featureKey) => {
	const data = restaurantData || {};
	return !ENTITLEMENT_SOURCES.some((sourceKey) => {
		return hasExplicitDeny(data[sourceKey], featureKey);
	});
};

const assertFeatureAllowed = (restaurantData, featureKey, message) => {
	if (isFeatureAllowed(restaurantData, featureKey)) return;
	throw new functions.https.HttpsError(
		"failed-precondition",
		message || "This feature is not enabled for this restaurant.",
	);
};

const clampFeaturesToEntitlements = (features, restaurantData) => {
	const cleanFeatures = {};
	Object.keys(features || {}).forEach((featureKey) => {
		if (typeof features[featureKey] === "boolean") {
			// Scerv controls paid/platform access. Restaurants can only toggle
			// features that their current entitlement allows.
			cleanFeatures[featureKey] = isFeatureAllowed(restaurantData, featureKey)
				? features[featureKey]
				: false;
		}
	});
	return cleanFeatures;
};

module.exports = {
	assertFeatureAllowed,
	clampFeaturesToEntitlements,
	isFeatureAllowed,
};
