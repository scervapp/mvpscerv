const BASE_FEATURES = {
	reservations: false,
	hostCheckInRequests: false,
	qrSelfCheckIn: true,
	parties: true,
	pickup: false,
	tableScanOrdering: true,
	serviceRequests: true,
	loyaltyClub: true,
};

const OPERATIONAL_FEATURES = [
	"reservations",
	"hostCheckInRequests",
	"qrSelfCheckIn",
	"parties",
	"pickup",
	"tableScanOrdering",
	"serviceRequests",
	"loyaltyClub",
];

const STYLE_DEFAULTS = {
	standard: {},
	quick_service: {
		pickup: true,
		qrSelfCheckIn: false,
		tableScanOrdering: false,
		serviceRequests: false,
	},
	casual_dining: {
		reservations: true,
		hostCheckInRequests: true,
	},
	full_service: {
		reservations: true,
		hostCheckInRequests: true,
	},
	fine_dining: {
		reservations: true,
		hostCheckInRequests: true,
		qrSelfCheckIn: false,
		pickup: false,
	},
	hotel_concierge: {
		reservations: true,
		hostCheckInRequests: true,
		qrSelfCheckIn: false,
		pickup: false,
	},
};

const FEATURE_ALIASES = {
	pickup: ["pickup", "pickupEnabled"],
	reservations: ["reservations", "reservationsEnabled"],
	hostCheckInRequests: ["hostCheckInRequests", "walkInCheckInRequests"],
	qrSelfCheckIn: ["qrSelfCheckIn", "qrSelfCheckInEnabled"],
	parties: ["parties", "partiesEnabled"],
	tableScanOrdering: ["tableScanOrdering", "tableScanOrderingEnabled"],
	serviceRequests: ["serviceRequests", "serviceRequestsEnabled"],
	loyaltyClub: ["loyaltyClub", "loyaltyClubEnabled"],
};

const ENTITLEMENT_SOURCES = [
	"featureEntitlements",
	"subscriptionFeatures",
	"planFeatures",
	"platformFeatures",
	"entitlements",
];

const normalizeStatus = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");

export const getRestaurantListingStatus = (restaurant = {}) => {
	const rawStatus = normalizeStatus(
		restaurant.scervStatus ||
			restaurant.listingStatus ||
			restaurant.profileStatus ||
			restaurant.claimStatus,
	);

	if (
		["scerv_enabled", "enabled", "active_partner", "partner"].includes(rawStatus)
	) {
		return "scerv_enabled";
	}
	if (["claimed", "verified", "restaurant_claimed"].includes(rawStatus)) {
		return "claimed";
	}
	if (
		restaurant.isCommunityProfile === true ||
		restaurant.isClaimed === false ||
		[
			"community",
			"community_listed",
			"unclaimed",
			"discovery",
			"discovery_only",
		].includes(rawStatus)
	) {
		return "community";
	}

	// Existing production restaurant docs did not have a listing status, so we
	// keep them fully enabled unless Scerv explicitly marks them as community.
	return "scerv_enabled";
};

export const isScervEnabledRestaurant = (restaurant = {}) =>
	getRestaurantListingStatus(restaurant) === "scerv_enabled";

export const isCommunityListedRestaurant = (restaurant = {}) =>
	getRestaurantListingStatus(restaurant) === "community";

const readFeatureOverride = (restaurant, featureKey) => {
	const keys = FEATURE_ALIASES[featureKey] || [featureKey];
	const source = restaurant?.features || {};

	for (const key of keys) {
		if (typeof source[key] === "boolean") return source[key];
		if (typeof restaurant?.[key] === "boolean") return restaurant[key];
		if (typeof restaurant?.[`features.${key}`] === "boolean") {
			return restaurant[`features.${key}`];
		}
	}

	return undefined;
};

export const isRestaurantFeatureAllowed = (restaurant, featureKey) => {
	const keys = FEATURE_ALIASES[featureKey] || [featureKey];
	const allKeys = [featureKey, ...keys];

	return !ENTITLEMENT_SOURCES.some((sourceKey) => {
		const source = restaurant?.[sourceKey] || {};
		return allKeys.some((key) => source[key] === false);
	});
};

export const getRestaurantExperienceConfig = (restaurant) => {
	const hospitalityStyle =
		restaurant?.hospitalityStyle ||
		restaurant?.restaurantStyle ||
		restaurant?.serviceStyle ||
		"standard";
	const defaults = STYLE_DEFAULTS[hospitalityStyle] || STYLE_DEFAULTS.standard;
	const features = { ...BASE_FEATURES, ...defaults };

	// Restaurant overrides live in one place so future paid entitlements can clamp
	// premium features without every screen learning billing rules.
	Object.keys(features).forEach((featureKey) => {
		const override = readFeatureOverride(restaurant, featureKey);
		if (typeof override === "boolean") {
			features[featureKey] = override;
		}
		if (!isRestaurantFeatureAllowed(restaurant, featureKey)) {
			features[featureKey] = false;
		}
	});

	if (!isScervEnabledRestaurant(restaurant)) {
		OPERATIONAL_FEATURES.forEach((featureKey) => {
			features[featureKey] = false;
		});
		features.reviews = isRestaurantFeatureAllowed(restaurant, "reviews");
	}

	return {
		hospitalityStyle,
		listingStatus: getRestaurantListingStatus(restaurant),
		isScervEnabled: isScervEnabledRestaurant(restaurant),
		features,
		isFeatureAllowed: (featureKey) =>
			isRestaurantFeatureAllowed(restaurant, featureKey),
	};
};
