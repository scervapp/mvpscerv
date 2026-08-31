const auth = require("firebase-tools/lib/auth");
const scopes = require("firebase-tools/lib/scopes");

const PROJECT_ID = "scervmvp-dev";
const DATABASE_ID = "(default)";
const args = new Set(process.argv.slice(2));
const confirmed = args.has("--confirm-dev-community-seed");

if (!confirmed) {
	console.error(
		"Refusing to seed without --confirm-dev-community-seed. This script only targets scervmvp-dev.",
	);
	process.exit(1);
}

function getAccessToken() {
	const account = auth.getGlobalDefaultAccount();
	const refreshToken = account?.tokens?.refresh_token;
	if (!refreshToken) {
		throw new Error(
			"Could not read Firebase refresh token. Run firebase login --reauth.",
		);
	}
	return auth
		.getAccessToken(refreshToken, [scopes.CLOUD_PLATFORM])
		.then((tokenData) => tokenData.access_token);
}

function firestoreBase() {
	return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(
		DATABASE_ID,
	)}/documents`;
}

function encodePath(path) {
	return path.split("/").map(encodeURIComponent).join("/");
}

function toFirestoreValue(value) {
	if (value === null || value === undefined) return { nullValue: null };
	if (value instanceof Date) return { timestampValue: value.toISOString() };
	if (Array.isArray(value)) {
		return { arrayValue: { values: value.map(toFirestoreValue) } };
	}
	if (typeof value === "boolean") return { booleanValue: value };
	if (typeof value === "number") {
		if (Number.isInteger(value)) return { integerValue: String(value) };
		return { doubleValue: value };
	}
	if (typeof value === "object") {
		return {
			mapValue: {
				fields: Object.fromEntries(
					Object.entries(value).map(([key, nestedValue]) => [
						key,
						toFirestoreValue(nestedValue),
					]),
				),
			},
		};
	}
	return { stringValue: String(value) };
}

function toFirestoreDocument(data) {
	return {
		fields: Object.fromEntries(
			Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
		),
	};
}

async function api(method, url, token, body) {
	const response = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`${method} ${url} failed: ${response.status} ${text}`);
	}
	return response.status === 204 ? null : response.json();
}

async function setDoc(token, path, data) {
	const updateMask = Object.keys(data)
		.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
		.join("&");
	const url = `${firestoreBase()}/${encodePath(path)}?${updateMask}`;
	await api("PATCH", url, token, toFirestoreDocument(data));
}

const now = new Date();

const reviewAuthors = [
	["seed_guest_park_01", "Maya R."],
	["seed_guest_park_02", "Jordan P."],
	["seed_guest_park_03", "Priya S."],
	["seed_guest_park_04", "Marcus T."],
	["seed_guest_park_05", "Lena C."],
	["seed_guest_park_06", "Daniel K."],
];

const featureEntitlements = {
	reservations: false,
	reservationWaitlist: false,
	hostCheckInRequests: false,
	reviews: true,
	rewards: false,
	qrSelfCheckIn: false,
	parties: false,
	pickup: false,
	tableScanOrdering: false,
	serviceRequests: false,
	advancedReporting: false,
};

const demoPhotoUrl = (terms, lock) =>
	`https://loremflickr.com/1200/900/${terms}?lock=${lock}`;

function stableLock(value, offset = 0) {
	return (
		String(value || "")
			.split("")
			.reduce((sum, char) => sum + char.charCodeAt(0), 0) + offset
	);
}

function getItemMedia(item, restaurant, menuIndex) {
	const tags = Array.isArray(item.tags) ? item.tags : [];
	const primaryTerms = tags.slice(0, 3).join(",") || item.discoveryLabel || item.name;
	const contextTerms = [item.discoveryLabel, restaurant.cuisine, "restaurant-food"]
		.filter(Boolean)
		.join(",");
	const fallbackTerms = [item.category, "dish", restaurant.area]
		.filter(Boolean)
		.join(",");

	return [
		{
			id: `${item.id}_official_1`,
			type: "photo",
			url: item.imageUri,
			thumbnailUrl: item.imageUri,
			source: "admin",
			caption: item.name,
			status: "published",
		},
		{
			id: `${item.id}_official_2`,
			type: "photo",
			url: demoPhotoUrl(primaryTerms, stableLock(item.id, 700 + menuIndex)),
			thumbnailUrl: demoPhotoUrl(primaryTerms, stableLock(item.id, 700 + menuIndex)),
			source: "admin",
			caption: `${item.discoveryLabel || item.name} close-up`,
			status: "published",
		},
		{
			id: `${item.id}_guest_preview`,
			type: "photo",
			url: demoPhotoUrl(contextTerms || fallbackTerms, stableLock(item.id, 900 + menuIndex)),
			thumbnailUrl: demoPhotoUrl(
				contextTerms || fallbackTerms,
				stableLock(item.id, 900 + menuIndex),
			),
			source: "customer",
			caption: "Guest review photo",
			status: "published",
		},
	];
}

function getReviewMedia(item, reviewIndex) {
	if (reviewIndex > 1) return [];
	const tags = Array.isArray(item.tags) ? item.tags : [];
	const terms = [item.discoveryLabel, ...tags.slice(0, 2), "restaurant-food"]
		.filter(Boolean)
		.join(",");
	const url = demoPhotoUrl(terms, stableLock(`${item.id}_${reviewIndex}`, 1100));

	return [
		{
			id: `${item.id}_review_media_${reviewIndex + 1}`,
			type: "photo",
			url,
			thumbnailUrl: url,
			source: "customer",
			status: "published",
		},
	];
}

const communityRestaurants = [
	{
		id: "community_greenpoint_lantern_thai",
		restaurantName: "Lantern Thai Greenpoint",
		description:
			"Fictional community-listed Thai restaurant for testing Scerv dish discovery in Greenpoint.",
		cuisine: "Thai",
		category: "Community Listed",
		area: "Greenpoint",
		city: "Brooklyn",
		state: "NY",
		address: "931 Manhattan Ave, Brooklyn, NY",
		phoneNumber: "+1 718-555-0310",
		priceLevel: "$$",
		imageUrl:
			"https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=1400&q=80",
		location: { latitude: 40.7308, longitude: -73.9542 },
		menu: [
			{
				id: "community_item_lantern_pad_krapow",
				name: "Pad Krapow Crispy Fish",
				discoveryLabel: "Thai",
				description:
					"Crispy white fish, Thai basil, garlic, bird chile, jasmine rice, fried egg.",
				category: "Entrees",
				price: 24,
				averageRating: 4.88,
				ratingCount: 61,
				reviewCount: 36,
				orderCount: 124,
				tags: ["thai", "fish", "spicy", "savory", "basil", "crispy"],
				dietaryTags: ["pescatarian"],
				imageUri: demoPhotoUrl("thai-fish,basil,rice", 5101),
				reviews: [
					[5, "Spicy, crispy, and loaded with basil. This is the order.", ["spicy", "fish", "crispy"]],
					[4.9, "The fried egg and basil make it feel complete.", ["thai", "savory"]],
					[4.7, "Real heat, but still balanced.", ["spicy", "basil"]],
				],
			},
			{
				id: "community_item_lantern_green_curry",
				name: "Green Curry Shrimp",
				discoveryLabel: "Green Curry",
				description:
					"Shrimp, coconut green curry, Thai eggplant, bamboo, basil, jasmine rice.",
				category: "Entrees",
				price: 22,
				averageRating: 4.64,
				ratingCount: 43,
				reviewCount: 25,
				orderCount: 97,
				tags: ["thai", "green curry", "shrimp", "coconut", "spicy", "seafood"],
				dietaryTags: ["pescatarian"],
				imageUri: demoPhotoUrl("green-curry,shrimp,thai-food", 5102),
				reviews: [
					[4.8, "Creamy curry with enough spice to keep it interesting.", ["green curry", "shrimp"]],
					[4.5, "Good coconut flavor and plenty of shrimp.", ["seafood", "coconut"]],
				],
			},
			{
				id: "community_item_lantern_mango_sticky",
				name: "Mango Sticky Rice",
				discoveryLabel: "Desserts",
				description:
					"Sweet coconut sticky rice, ripe mango, sesame, salted coconut cream.",
				category: "Desserts",
				price: 11,
				averageRating: 4.71,
				ratingCount: 38,
				reviewCount: 21,
				orderCount: 76,
				tags: ["thai", "dessert", "mango", "coconut", "sweet"],
				imageUri: demoPhotoUrl("mango-sticky-rice,dessert", 5103),
				reviews: [
					[4.9, "Classic, sweet, and the coconut cream is perfect.", ["dessert", "mango"]],
					[4.4, "Simple finish after spicy food.", ["sweet", "coconut"]],
				],
			},
		],
	},
	{
		id: "community_dumbo_slice_oyster",
		restaurantName: "DUMBO Slice & Oyster",
		description:
			"Fictional community-listed waterfront spot for testing pizza, oysters, and seafood rankings.",
		cuisine: "Pizza Seafood",
		category: "Community Listed",
		area: "DUMBO",
		city: "Brooklyn",
		state: "NY",
		address: "42 Water St, Brooklyn, NY",
		phoneNumber: "+1 718-555-0442",
		priceLevel: "$$",
		imageUrl:
			"https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1400&q=80",
		location: { latitude: 40.7033, longitude: -73.9903 },
		menu: [
			{
				id: "community_item_dumbo_clam_pizza",
				name: "White Clam Pizza",
				discoveryLabel: "Pizza",
				description:
					"Thin crust, chopped clams, garlic cream, mozzarella, parsley, lemon.",
				category: "Pizza",
				price: 23,
				averageRating: 4.83,
				ratingCount: 72,
				reviewCount: 44,
				orderCount: 188,
				tags: ["pizza", "clam", "seafood", "garlic", "crispy", "white pizza"],
				dietaryTags: ["pescatarian"],
				imageUri: demoPhotoUrl("clam-pizza,white-pizza", 5201),
				reviews: [
					[5, "Garlicky, crisp, and way better than a plain slice.", ["pizza", "garlic", "seafood"]],
					[4.8, "The lemon keeps the clam pizza bright.", ["clam", "crispy"]],
					[4.6, "Great if you want pizza but still want seafood.", ["white pizza", "pescatarian"]],
				],
			},
			{
				id: "community_item_dumbo_oysters",
				name: "East River Oyster Flight",
				discoveryLabel: "Oysters",
				description:
					"Six East Coast oysters, chili mignonette, lemon, horseradish.",
				category: "Raw Bar",
				price: 25,
				averageRating: 4.67,
				ratingCount: 49,
				reviewCount: 31,
				orderCount: 110,
				tags: ["oysters", "seafood", "raw bar", "fresh", "briny"],
				dietaryTags: ["pescatarian"],
				imageUri: demoPhotoUrl("oysters,raw-bar", 5202),
				reviews: [
					[4.9, "Cold, briny, and clean. Great start.", ["oysters", "fresh"]],
					[4.5, "The chili mignonette gives it a little spark.", ["raw bar", "spicy"]],
				],
			},
			{
				id: "community_item_dumbo_calamari",
				name: "Pepper Lemon Calamari",
				discoveryLabel: "Calamari",
				description:
					"Fried calamari, lemon pepper, banana peppers, basil aioli.",
				category: "Appetizers",
				price: 18,
				averageRating: 4.42,
				ratingCount: 41,
				reviewCount: 23,
				orderCount: 99,
				tags: ["calamari", "seafood", "fried", "lemon", "pepper", "crispy"],
				dietaryTags: ["pescatarian"],
				imageUri: demoPhotoUrl("fried-calamari,seafood", 5203),
				reviews: [
					[4.6, "Good crunch and the peppers help.", ["calamari", "crispy"]],
					[4.2, "Solid calamari, though I liked the pizza more.", ["fried", "seafood"]],
				],
			},
		],
	},
	{
		id: "community_midtown_jerk_sea",
		restaurantName: "Midtown Jerk & Sea",
		description:
			"Fictional community-listed Caribbean seafood kitchen for testing cuisine and palate discovery.",
		cuisine: "Caribbean Seafood",
		category: "Community Listed",
		area: "Midtown",
		city: "New York",
		state: "NY",
		address: "148 W 46th St, New York, NY",
		phoneNumber: "+1 212-555-0488",
		priceLevel: "$$",
		imageUrl:
			"https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1400&q=80",
		location: { latitude: 40.758, longitude: -73.9845 },
		menu: [
			{
				id: "community_item_midtown_jerk_salmon",
				name: "Jerk Salmon Plate",
				discoveryLabel: "Jerk Salmon",
				description:
					"Jerk-spiced salmon, coconut rice and peas, cabbage slaw, mango pepper sauce.",
				category: "Entrees",
				price: 26,
				averageRating: 4.9,
				ratingCount: 58,
				reviewCount: 39,
				orderCount: 142,
				tags: ["jamaican", "jerk", "salmon", "fish", "spicy", "savory"],
				dietaryTags: ["pescatarian"],
				imageUri: demoPhotoUrl("jerk-salmon,caribbean-food", 5301),
				reviews: [
					[5, "Big jerk flavor, flaky fish, and the mango sauce is fire.", ["jerk", "salmon", "spicy"]],
					[4.9, "This is exactly what I want before a show.", ["jamaican", "fish"]],
					[4.7, "Spice is serious but not painful.", ["savory", "spicy"]],
				],
			},
			{
				id: "community_item_midtown_escovitch_snapper",
				name: "Escovitch Snapper",
				discoveryLabel: "Snapper",
				description:
					"Crispy snapper, pickled peppers, carrots, onions, festival, lime.",
				category: "Entrees",
				price: 31,
				averageRating: 4.76,
				ratingCount: 46,
				reviewCount: 28,
				orderCount: 101,
				tags: ["jamaican", "snapper", "fish", "escovitch", "vinegar", "crispy"],
				dietaryTags: ["pescatarian"],
				imageUri: demoPhotoUrl("escovitch-snapper,jamaican-food", 5302),
				reviews: [
					[4.9, "The pickle cuts through the fried fish perfectly.", ["snapper", "crispy"]],
					[4.6, "Bright, spicy, and very Caribbean.", ["escovitch", "jamaican"]],
				],
			},
			{
				id: "community_item_midtown_rum_punch",
				name: "Sorrel Rum Punch",
				discoveryLabel: "Cocktails",
				description:
					"Dark rum, sorrel, citrus, ginger, allspice, grated nutmeg.",
				category: "Cocktails",
				price: 15,
				averageRating: 4.62,
				ratingCount: 37,
				reviewCount: 22,
				orderCount: 85,
				tags: ["cocktail", "rum", "sorrel", "ginger", "caribbean", "spiced"],
				imageUri: demoPhotoUrl("rum-punch,cocktail", 5303),
				reviews: [
					[4.8, "Spiced, strong, and not too sweet.", ["rum", "ginger"]],
					[4.4, "Great with the jerk salmon.", ["cocktail", "caribbean"]],
				],
			},
		],
	},
];

function uniqueLowerStrings(values) {
	return [
		...new Set(
			values
				.map((value) =>
					String(value || "")
						.trim()
						.toLowerCase(),
				)
				.filter(Boolean),
		),
	];
}

function confidenceAdjustedRating(averageRating, ratingCount) {
	const globalAverage = 4.2;
	const minimumConfidenceRatings = 10;
	return (
		(ratingCount / (ratingCount + minimumConfidenceRatings)) * averageRating +
		(minimumConfidenceRatings / (ratingCount + minimumConfidenceRatings)) *
			globalAverage
	);
}

function discoveryScore(item) {
	const confidence = confidenceAdjustedRating(item.averageRating, item.ratingCount);
	const popularityWeight = Math.min(item.ratingCount / 50, 1) * 0.25;
	const reviewWeight = Math.min(item.reviewCount / 25, 1) * 0.15;
	return Number((confidence + popularityWeight + reviewWeight).toFixed(4));
}

function standardMenuCategory(category, item = {}) {
	if (item.isDailySpecial) return "daily_special";
	const normalized = String(category || "")
		.trim()
		.toLowerCase();
	if (["appetizers", "appetizer", "starters", "starter", "snacks"].includes(normalized)) return "appetizer";
	if (["raw bar"].includes(normalized)) return "seafood";
	if (["burgers", "burger"].includes(normalized)) return "burger";
	if (["pizza"].includes(normalized)) return "pizza";
	if (["cocktails", "cocktail", "beer", "wine", "spirits"].includes(normalized)) return "alcoholic_drink";
	if (["desserts", "dessert"].includes(normalized)) return "dessert";
	if (["entrees", "entree", "mains", "main"].includes(normalized)) return "entree";
	return normalized.replace(/[^a-z0-9]+/g, "_") || "other";
}

function categorySortOrder(category, item = {}) {
	if (item.isDailySpecial) return 0;
	const standardCategory = standardMenuCategory(category, item);
	if (standardCategory === "appetizer" || standardCategory === "seafood") return 10;
	if (standardCategory === "entree" || standardCategory === "pizza") return 30;
	if (standardCategory === "alcoholic_drink") return 50;
	if (standardCategory === "dessert") return 60;
	return 900;
}

async function seedRestaurant(token, restaurant) {
	const restaurantData = {
		id: restaurant.id,
		uid: null,
		ownerUid: null,
		role: "community_profile",
		restaurantName: restaurant.restaurantName,
		name: restaurant.restaurantName,
		description: restaurant.description,
		cuisine: restaurant.cuisine,
		cuisineType: restaurant.cuisine,
		category: restaurant.category,
		city: restaurant.city,
		state: restaurant.state,
		country: "US",
		countryCode: "US",
		area: restaurant.area,
		address: restaurant.address,
		phoneNumber: restaurant.phoneNumber,
		imageUrl: restaurant.imageUrl,
		imageUri: restaurant.imageUrl,
		priceLevel: restaurant.priceLevel,
		averageRating:
			restaurant.menu.reduce((sum, item) => sum + item.averageRating, 0) /
			restaurant.menu.length,
		rating:
			restaurant.menu.reduce((sum, item) => sum + item.averageRating, 0) /
			restaurant.menu.length,
		ratingCount: restaurant.menu.reduce(
			(total, item) => total + item.ratingCount,
			0,
		),
		isActive: true,
		isLive: true,
		isTestAccount: true,
		isDemoSeed: true,
		isCommunityProfile: true,
		isClaimed: false,
		listingStatus: "community",
		scervStatus: "community",
		claimStatus: "unclaimed",
		onboardingStatus: "community_listed_unclaimed",
		hospitalityStyle: "standard",
		featureEntitlements,
		subscriptionFeatures: featureEntitlements,
		features: {
			reservations: false,
			reservationWaitlist: false,
			hostCheckInRequests: false,
			reviews: true,
			loyaltyClub: false,
			qrSelfCheckIn: false,
			parties: false,
			pickup: false,
			tableScanOrdering: false,
			serviceRequests: false,
		},
		reservationSettings: {
			enabled: false,
			reservationsEnabled: false,
			waitlistEnabled: false,
		},
		experienceSettings: {
			hostCheckInRequestsEnabled: false,
			qrSelfCheckInEnabled: false,
		},
		location: restaurant.location,
		searchKeywords: uniqueLowerStrings([
			restaurant.restaurantName,
			restaurant.cuisine,
			restaurant.category,
			restaurant.city,
			restaurant.area,
			"community listed",
			"food discovery",
		]),
		createdAt: now,
		updatedAt: now,
	};

	await setDoc(token, `restaurants/${restaurant.id}`, restaurantData);

	for (let menuIndex = 0; menuIndex < restaurant.menu.length; menuIndex += 1) {
		const item = restaurant.menu[menuIndex];
		const standardCategory = standardMenuCategory(item.category, item);
		const sectionSortOrder = categorySortOrder(item.category, item);
		const totalRatingSum = Number(
			(item.averageRating * item.ratingCount).toFixed(2),
		);
		const topReviewTags = [...new Set(item.reviews.flatMap((review) => review[2]))];
		const itemMedia = getItemMedia(item, restaurant, menuIndex);

		await setDoc(token, `menuItems/${item.id}`, {
			id: item.id,
			restaurantId: restaurant.id,
			restaurantName: restaurant.restaurantName,
			name: item.name,
			description: item.description,
			category: item.category,
			standardCategory,
			discoveryLabel: item.discoveryLabel,
			canonicalDishName: item.discoveryLabel,
			categorySortOrder: sectionSortOrder,
			menuSortOrder: sectionSortOrder * 100 + menuIndex,
			isDailySpecial: item.isDailySpecial === true,
			price: item.price,
			isAvailable: true,
			isActive: true,
			isDemoSeed: true,
			imageUri: item.imageUri,
			imageUrl: item.imageUri,
			media: itemMedia,
			ingredientTags: uniqueLowerStrings(item.tags).slice(0, 8),
			flavorTags: uniqueLowerStrings(item.tags).slice(1, 9),
			dishTypeTags: uniqueLowerStrings([
				item.discoveryLabel,
				standardCategory,
				item.category,
				...item.tags,
			]),
			cuisineTags: uniqueLowerStrings([restaurant.cuisine, ...item.tags]),
			dietaryTags: item.dietaryTags || [],
			allergenTags: item.allergenTags || [],
			searchKeywords: uniqueLowerStrings([
				item.name,
				item.discoveryLabel,
				item.description,
				item.category,
				standardCategory,
				restaurant.restaurantName,
				restaurant.cuisine,
				restaurant.city,
				restaurant.area,
				...item.tags,
			]),
			topReviewTags,
			reviewHighlight: item.reviews[0] ? item.reviews[0][1] : "",
			topReview: item.reviews[0] ? item.reviews[0][1] : "",
			totalRatingSum,
			ratingCount: item.ratingCount,
			averageRating: item.averageRating,
			reviewCount: item.reviewCount,
			confidenceAdjustedRating: confidenceAdjustedRating(
				item.averageRating,
				item.ratingCount,
			),
			discoveryScore: discoveryScore(item),
			orderCount: item.orderCount,
			verificationStats: {
				locationVerifiedCount: Math.round(item.ratingCount * 0.45),
				scervOrderVerifiedCount: 0,
				receiptVerifiedCount: Math.round(item.ratingCount * 0.12),
			},
			createdAt: now,
			updatedAt: now,
		});

		for (let reviewIndex = 0; reviewIndex < item.reviews.length; reviewIndex += 1) {
			const [ratingValue, reviewText, reviewTags] = item.reviews[reviewIndex];
			const [customerId, customerName] =
				reviewAuthors[(menuIndex + reviewIndex) % reviewAuthors.length];
			await setDoc(
				token,
				`menuItems/${item.id}/ratings/${customerId}_${item.id}`,
				{
					menuItemId: item.id,
					restaurantId: restaurant.id,
					customerId,
					customerName,
					customerDisplayName: customerName,
					ratingValue,
					comment: reviewText,
					reviewText,
					reviewTags,
					media: getReviewMedia(item, reviewIndex),
					orderId: `community_seed_${restaurant.id}_${menuIndex}_${reviewIndex}`,
					origin: "community_discovery_seed",
					isIndividual: true,
					status: "published",
					verificationLevel:
						reviewIndex === 0 ? "receipt_verified" : "location_verified",
					wasOrderedThroughScerv: false,
					incentiveDisclosure: "demo_seed",
					timestamp: new Date(now.getTime() - (reviewIndex + menuIndex + 1) * 86400000),
				},
			);
		}
	}
}

async function main() {
	const token = await getAccessToken();
	for (const restaurant of communityRestaurants) {
		console.log(`Seeding community profile: ${restaurant.restaurantName}`);
		await seedRestaurant(token, restaurant);
	}
	console.log(
		`Seed complete: ${communityRestaurants.length} community restaurants, ${communityRestaurants.reduce(
			(total, restaurant) => total + restaurant.menu.length,
			0,
		)} menu items.`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
