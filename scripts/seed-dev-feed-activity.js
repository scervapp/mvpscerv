const auth = require("firebase-tools/lib/auth");
const scopes = require("firebase-tools/lib/scopes");

const PROJECT_ID = "scervmvp-dev";
const DATABASE_ID = "(default)";
const args = new Set(process.argv.slice(2));
const confirmed = args.has("--confirm-dev-feed-seed");

if (!confirmed) {
	console.error(
		"Refusing to seed without --confirm-dev-feed-seed. This script only targets scervmvp-dev.",
	);
	process.exit(1);
}

function getAccessToken() {
	const account = auth.getGlobalDefaultAccount();
	const refreshToken = account && account.tokens && account.tokens.refresh_token;
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
const demoPhotoUrl = (terms, lock) =>
	`https://loremflickr.com/1200/900/${terms}?lock=${lock}`;

const featuredDiners = [
	{
		id: "feed_featured_maya",
		firstName: "Maya",
		lastName: "Rivera",
		handle: "mayaeatsbk",
		style: "Seafood, crisp textures, and date-night rooms",
	},
	{
		id: "feed_featured_jordan",
		firstName: "Jordan",
		lastName: "Price",
		handle: "jordantastes",
		style: "Ramen, cocktails, burgers, and late-night comfort",
	},
	{
		id: "feed_featured_priya",
		firstName: "Priya",
		lastName: "Shah",
		handle: "priyabites",
		style: "Spice, balance, vegetarian dishes, and hidden gems",
	},
	{
		id: "feed_featured_marcus",
		firstName: "Marcus",
		lastName: "Taylor",
		handle: "marcusorders",
		style: "Steak, fried chicken, raw bar, and group dinners",
	},
];

const palateProfiles = {
	feed_featured_maya: {
		dishTypes: ["calamari", "oysters", "lobster_roll", "seafood", "fish"],
		flavors: ["briny", "crispy", "citrus", "savory", "fresh"],
		ingredients: ["oysters", "lobster", "fish", "lemon", "chile"],
		cuisines: ["new_american_seafood", "thai", "american_bistro"],
		categories: ["appetizer", "seafood", "entree"],
		dietary: ["pescatarian"],
	},
	feed_featured_jordan: {
		dishTypes: ["ramen", "burger", "fried_chicken", "karaage", "cocktail"],
		flavors: ["spicy", "savory", "umami", "crispy", "smoky"],
		ingredients: ["noodles", "chicken", "beef", "miso", "chile"],
		cuisines: ["japanese", "american_bistro", "new_american_seafood"],
		categories: ["ramen", "burger", "appetizer", "alcoholic_drink"],
		dietary: [],
	},
	feed_featured_priya: {
		dishTypes: ["thai", "green_curry", "salad", "dessert", "vegetarian"],
		flavors: ["spicy", "herby", "coconut", "bright", "balanced"],
		ingredients: ["basil", "coconut", "mango", "eggplant", "lime"],
		cuisines: ["thai", "japanese", "american_bistro"],
		categories: ["entree", "salad", "dessert"],
		dietary: ["vegetarian", "pescatarian"],
	},
	feed_featured_marcus: {
		dishTypes: ["steak", "burger", "pizza", "oysters", "fried_chicken"],
		flavors: ["smoky", "savory", "crispy", "rich", "charred"],
		ingredients: ["beef", "fries", "cheese", "chicken", "oysters"],
		cuisines: ["american_bistro", "new_american_seafood", "japanese"],
		categories: ["entree", "burger", "pizza", "appetizer"],
		dietary: [],
	},
};

const feedReviews = [
	{
		customerId: "feed_featured_maya",
		menuItemId: "dev_item_harbor_calamari",
		restaurantId: "dev_restaurant_harbor",
		ratingValue: 4.9,
		reviewText:
			"Light, crisp, and clean. The kind of calamari you order for the table before anyone argues.",
		reviewTags: ["crispy", "seafood", "shareable"],
		photoTerms: "fried-calamari,seafood,restaurant",
		minutesAgo: 28,
	},
	{
		customerId: "feed_featured_jordan",
		menuItemId: "dev_item_sora_daily_miso",
		restaurantId: "dev_restaurant_sora",
		ratingValue: 4.8,
		reviewText:
			"Deep miso, real heat, and noodles with bounce. This is exactly the bowl I wanted.",
		reviewTags: ["ramen", "spicy", "umami"],
		photoTerms: "spicy-ramen,noodles,japanese-food",
		minutesAgo: 54,
	},
	{
		customerId: "feed_featured_priya",
		menuItemId: "community_item_lantern_green_curry",
		restaurantId: "community_greenpoint_lantern_thai",
		ratingValue: 4.7,
		reviewText:
			"Fragrant curry, generous shrimp, and enough chile to keep the sweetness honest.",
		reviewTags: ["green curry", "shrimp", "spicy"],
		photoTerms: "green-curry,shrimp,thai-food",
		minutesAgo: 88,
	},
	{
		customerId: "feed_featured_marcus",
		menuItemId: "dev_item_harbor_steak_frites",
		restaurantId: "dev_restaurant_harbor",
		ratingValue: 4.6,
		reviewText:
			"Steak came out with a proper crust, fries stayed crisp, and the sauce carried the plate.",
		reviewTags: ["steak", "fries", "savory"],
		photoTerms: "steak-frites,restaurant,fries",
		minutesAgo: 132,
	},
	{
		customerId: "feed_featured_jordan",
		menuItemId: "dev_item_harbor_burger",
		restaurantId: "dev_restaurant_harbor",
		ratingValue: 4.5,
		reviewText:
			"Juicy, salty, and built right. A burger that makes sense even at a seafood spot.",
		reviewTags: ["burger", "savory", "comfort"],
		photoTerms: "smash-burger,burger,restaurant",
		minutesAgo: 190,
	},
	{
		customerId: "feed_featured_maya",
		menuItemId: "dev_item_harbor_oysters",
		restaurantId: "dev_restaurant_harbor",
		ratingValue: 4.9,
		reviewText:
			"Cold, briny, and beautifully handled. This is the raw bar move.",
		reviewTags: ["oysters", "raw bar", "fresh"],
		photoTerms: "oysters,raw-bar,seafood",
		minutesAgo: 244,
	},
	{
		customerId: "feed_featured_priya",
		menuItemId: "community_item_lantern_pad_krapow",
		restaurantId: "community_greenpoint_lantern_thai",
		ratingValue: 4.9,
		reviewText:
			"That basil-chile hit is serious. Crispy fish, heat, rice, egg. Perfect rhythm.",
		reviewTags: ["thai", "fish", "spicy"],
		photoTerms: "thai-fish,basil,rice",
		minutesAgo: 310,
	},
	{
		customerId: "feed_featured_marcus",
		menuItemId: "dev_item_sora_karaage",
		restaurantId: "dev_restaurant_sora",
		ratingValue: 4.7,
		reviewText:
			"Crunchy outside, juicy inside, and the dipping sauce wakes the whole thing up.",
		reviewTags: ["fried chicken", "crispy", "shareable"],
		photoTerms: "karaage,fried-chicken,japanese-food",
		minutesAgo: 390,
	},
	{
		customerId: "feed_featured_maya",
		menuItemId: "dev_item_maribel_snapper",
		restaurantId: "dev_restaurant_maribel",
		ratingValue: 4.6,
		reviewText:
			"Bright, flaky, and easy to recommend if you want seafood without going heavy.",
		reviewTags: ["fish", "bright", "seafood"],
		photoTerms: "snapper,fish,restaurant-food",
		minutesAgo: 470,
	},
	{
		customerId: "feed_featured_jordan",
		menuItemId: "dev_item_sora_sake_highball",
		restaurantId: "dev_restaurant_sora",
		ratingValue: 4.4,
		reviewText:
			"Clean, cold, and dangerously easy with ramen. Good second-round drink.",
		reviewTags: ["cocktail", "cold", "balanced"],
		photoTerms: "sake-highball,cocktail,bar",
		minutesAgo: 555,
	},
	{
		customerId: "feed_featured_marcus",
		menuItemId: "dev_item_maribel_daily_octopus",
		restaurantId: "dev_restaurant_maribel",
		ratingValue: 4.5,
		reviewText:
			"Smoky edges, tender bite, and enough acid to make it feel sharp.",
		reviewTags: ["smoky", "seafood", "charred"],
		photoTerms: "grilled-octopus,seafood,restaurant",
		minutesAgo: 690,
	},
	{
		customerId: "feed_featured_priya",
		menuItemId: "community_item_lantern_mango_sticky",
		restaurantId: "community_greenpoint_lantern_thai",
		ratingValue: 4.8,
		reviewText:
			"Simple dessert, done right. Coconut, mango, warm rice, no extra drama.",
		reviewTags: ["dessert", "mango", "coconut"],
		photoTerms: "mango-sticky-rice,thai-dessert",
		minutesAgo: 840,
	},
];

function buildSignalCounts(profileSignals) {
	const signalCounts = {};
	Object.keys(profileSignals).forEach((namespace) => {
		signalCounts[namespace] = {};
		profileSignals[namespace].forEach((signal, index) => {
			const normalized = signal.toLowerCase().replace(/[^a-z0-9]+/g, "_");
			signalCounts[namespace][normalized] = {
				count: 3 + (index % 3),
				ratingSum: Number((13.4 + index * 0.4).toFixed(1)),
				positiveCount: 3 + (index % 3),
			};
		});
	});
	return signalCounts;
}

async function seedFeaturedDiner(token, diner) {
	await setDoc(token, `customers/${diner.id}`, {
		id: diner.id,
		firstName: diner.firstName,
		lastName: diner.lastName,
		displayName: `${diner.firstName} ${diner.lastName.charAt(0)}.`,
		handle: diner.handle,
		role: "customer",
		isTestAccount: true,
		isDemoSeed: true,
		isScervApprovedInfluencer: true,
		scervApprovedInfluencer: true,
		publicInfluencer: true,
		creatorStatus: "scerv_approved",
		bio: diner.style,
		createdAt: now,
		updatedAt: now,
	});

	const profileSignals = palateProfiles[diner.id];
	await setDoc(token, `customerPalateProfiles/${diner.id}`, {
		customerId: diner.id,
		totalDishRatings: 12,
		totalRatingValue: 56,
		positiveDishRatings: 11,
		lastRatingSentiment: "positive",
		signalCounts: buildSignalCounts(profileSignals),
		isDemoSeed: true,
		updatedAt: now,
	});
}

async function seedFeedReview(token, review, index) {
	const timestamp = new Date(now.getTime() - review.minutesAgo * 60000);
	const mediaUrl = demoPhotoUrl(review.photoTerms, 8800 + index);
	const ratingId = `${review.customerId}_${review.menuItemId}_feed`;
	const ratingPayload = {
		menuItemId: review.menuItemId,
		restaurantId: review.restaurantId,
		customerId: review.customerId,
		customerName: null,
		customerDisplayName: null,
		ratingValue: review.ratingValue,
		comment: review.reviewText,
		reviewText: review.reviewText,
		reviewTags: review.reviewTags,
		media: [
			{
				id: `${ratingId}_photo`,
				type: "photo",
				url: mediaUrl,
				thumbnailUrl: mediaUrl,
				source: "customer",
				status: "published",
			},
		],
		orderId: `feed_demo_order_${index + 1}`,
		origin: "dev_feed_seed",
		isIndividual: true,
		status: "published",
		verificationLevel: index % 3 === 0 ? "receipt_verified" : "location_verified",
		wasOrderedThroughScerv: false,
		incentiveDisclosure: "demo_seed",
		timestamp,
	};

	await setDoc(
		token,
		`menuItems/${review.menuItemId}/ratings/${ratingId}`,
		ratingPayload,
	);
	await setDoc(
		token,
		`customerPalateProfiles/${review.customerId}/ratingEvents/${ratingId}`,
		{
			customerId: review.customerId,
			menuItemId: review.menuItemId,
			restaurantId: review.restaurantId,
			ratingValue: review.ratingValue,
			reviewTags: review.reviewTags,
			origin: "dev_feed_seed",
			verificationLevel: ratingPayload.verificationLevel,
			createdAt: timestamp,
		},
	);
}

async function main() {
	const token = await getAccessToken();

	for (const diner of featuredDiners) {
		console.log(`Seeding featured diner ${diner.firstName}...`);
		await seedFeaturedDiner(token, diner);
	}

	for (let index = 0; index < feedReviews.length; index += 1) {
		const review = feedReviews[index];
		console.log(`Seeding feed review ${index + 1}/${feedReviews.length}...`);
		await seedFeedReview(token, review, index);
	}

	console.log(
		`Seed complete: ${featuredDiners.length} featured diners and ${feedReviews.length} feed reviews.`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
