const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { calculateScervDiscoveryScore } = require("./discoveryScoring");

const db = admin.firestore();

const normalizeSignal = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s_-]/g, " ")
		.replace(/[\s-]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 60);

const normalizeSignalList = (value, limit = 12) => {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(value.map(normalizeSignal).filter((signal) => signal.length > 0)),
	].slice(0, limit);
};

const chunkArray = (items, size) => {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

const buildMenuItemSignals = (menuItem = {}, restaurant = {}) => ({
	dishTypes: normalizeSignalList([
		menuItem.discoveryLabel,
		menuItem.displayCategory,
		menuItem.name,
		...(Array.isArray(menuItem.dishTypeTags) ? menuItem.dishTypeTags : []),
		...(Array.isArray(menuItem.dishAliases) ? menuItem.dishAliases : []),
	]),
	categories: normalizeSignalList([
		menuItem.standardCategory,
		menuItem.category,
		menuItem.subcategory,
		menuItem.menuSection,
	]),
	cuisines: normalizeSignalList([
		restaurant.cuisineType,
		restaurant.cuisine,
		...(Array.isArray(menuItem.cuisineTags) ? menuItem.cuisineTags : []),
	]),
	ingredients: normalizeSignalList([
		...(Array.isArray(menuItem.ingredientTags) ? menuItem.ingredientTags : []),
		...(Array.isArray(menuItem.ingredients) ? menuItem.ingredients : []),
	], 18),
	flavors: normalizeSignalList(menuItem.flavorTags, 14),
	dietary: normalizeSignalList([
		...(Array.isArray(menuItem.dietaryTags) ? menuItem.dietaryTags : []),
		menuItem.isVegetarian ? "vegetarian" : "",
		menuItem.isVegan ? "vegan" : "",
		menuItem.isGlutenFree ? "gluten_free" : "",
	]),
});

const getSignalAffinity = (profile = {}, namespace, values = []) => {
	const signalCounts = profile.signalCounts || {};
	const namespaceCounts = signalCounts[namespace] || {};
	let score = 0;
	let strongestSignal = null;
	let strongestAverage = 0;

	values.forEach((value) => {
		const key = normalizeSignal(value);
		const stats = namespaceCounts[key];
		if (!stats) return;

		const count = Math.max(0, Number(stats.count || 0));
		const ratingSum = Number(stats.ratingSum || 0);
		if (!count || !Number.isFinite(ratingSum)) return;

		const average = ratingSum / count;
		const confidence = Math.min(1, Math.log1p(count) / Math.log1p(5));
		const contribution = (average - 3) * confidence;
		score += contribution;

		if (average > strongestAverage) {
			strongestAverage = average;
			strongestSignal = key.replace(/_/g, " ");
		}
	});

	return { score, strongestSignal, strongestAverage };
};

const serializeMenuItem = (doc, restaurant, matchScore, matchReasons) => {
	const data = doc.data() || {};
	const scervScore = calculateScervDiscoveryScore(data);

	return {
		id: doc.id,
		restaurantId: data.restaurantId,
		name: data.name || data.dishName || "Menu item",
		dishName: data.dishName || data.name || "Menu item",
		description: data.description || "",
		price: Number(data.price || 0),
		category: data.category || "",
		standardCategory: data.standardCategory || "",
		discoveryLabel: data.discoveryLabel || data.displayCategory || "",
		imageUri: data.imageUri || data.imageUrl || data.thumbnailUri || "",
		media: Array.isArray(data.media) ? data.media.slice(0, 8) : [],
		averageRating: Number(data.averageRating || data.rating || 0),
		ratingCount: Number(data.ratingCount || 0),
		reviewCount: Number(data.reviewCount || 0),
		scervScore: data.scervScore || scervScore.score,
		discoveryScore: data.discoveryScore || scervScore.score,
		flavorTags: Array.isArray(data.flavorTags) ? data.flavorTags.slice(0, 8) : [],
		ingredientTags: Array.isArray(data.ingredientTags)
			? data.ingredientTags.slice(0, 8)
			: [],
		dietaryTags: Array.isArray(data.dietaryTags)
			? data.dietaryTags.slice(0, 8)
			: [],
		matchScore: Number(matchScore.toFixed(2)),
		matchReasons,
		restaurant: {
			id: restaurant.id,
			restaurantName: restaurant.restaurantName || restaurant.name || "Restaurant",
			name: restaurant.name || restaurant.restaurantName || "Restaurant",
			cuisineType: restaurant.cuisineType || restaurant.cuisine || "",
			area: restaurant.area || restaurant.neighborhood || "",
			city: restaurant.city || "",
			state: restaurant.state || "",
			imageUri: restaurant.imageUri || restaurant.imageUrl || "",
			listingStatus: restaurant.listingStatus || restaurant.scervStatus || "",
			scervStatus: restaurant.scervStatus || restaurant.listingStatus || "",
			isCommunityProfile: restaurant.isCommunityProfile === true,
		},
	};
};

exports.getScervTasteRecommendations = functions.https.onCall(
	async (data, context) => {
		const uid = context.auth && context.auth.uid;
		if (!uid) {
			throw new functions.https.HttpsError("unauthenticated", "Login required.");
		}

		const countryCode = String((data && data.countryCode) || "US")
			.trim()
			.toUpperCase()
			.slice(0, 8);
		const limit = Math.min(Math.max(Number((data && data.limit) || 8), 1), 12);

		const profileSnap = await db.collection("customerPalateProfiles").doc(uid).get();
		if (!profileSnap.exists) {
			return { recommendations: [], profileStatus: "not_enough_ratings" };
		}

		const profile = profileSnap.data() || {};
		const totalDishRatings = Number(profile.totalDishRatings || 0);
		if (totalDishRatings < 1) {
			return { recommendations: [], profileStatus: "not_enough_ratings" };
		}

		const restaurantSnap = await db
			.collection("restaurants")
			.where("countryCode", "==", countryCode)
			.where("isLive", "==", true)
			.limit(120)
			.get();
		const restaurants = restaurantSnap.docs
			.map((doc) => ({ id: doc.id, ...doc.data() }))
			.filter((restaurant) => restaurant.isActive !== false);
		const restaurantsById = new Map(
			restaurants.map((restaurant) => [restaurant.id, restaurant]),
		);
		const restaurantIds = restaurants.map((restaurant) => restaurant.id);

		if (restaurantIds.length === 0) {
			return { recommendations: [], profileStatus: "no_market_restaurants" };
		}

		const menuSnapshots = await Promise.all(
			chunkArray(restaurantIds, 10).map((chunk) =>
				db.collection("menuItems").where("restaurantId", "in", chunk).limit(120).get(),
			),
		);
		const menuDocs = menuSnapshots.flatMap((snapshot) => snapshot.docs);
		const scoredItems = [];

		menuDocs.forEach((doc) => {
			const item = doc.data() || {};
			const restaurant = restaurantsById.get(item.restaurantId);
			if (!restaurant || item.isAvailable === false || item.isArchived === true) {
				return;
			}

			const signals = buildMenuItemSignals(item, restaurant);
			const affinities = [
				["dishTypes", signals.dishTypes, 14],
				["flavors", signals.flavors, 12],
				["ingredients", signals.ingredients, 9],
				["cuisines", signals.cuisines, 8],
				["categories", signals.categories, 6],
				["dietary", signals.dietary, 5],
			].map(([namespace, values, weight]) => {
				const affinity = getSignalAffinity(profile, namespace, values);
				return { namespace, weight, ...affinity };
			});

			const affinityScore = affinities.reduce(
				(total, affinity) => total + affinity.score * affinity.weight,
				0,
			);
			const discoveryScore = Number(
				item.discoveryScore ||
					item.scervScore ||
					calculateScervDiscoveryScore(item).score ||
					0,
			);
			const rating = Number(item.averageRating || item.rating || 0);
			const reviewCount = Number(item.reviewCount || 0);
			const matchScore =
				affinityScore + discoveryScore * 0.35 + rating * 3 + Math.log1p(reviewCount);

			const matchReasons = affinities
				.filter(
					(affinity) =>
						affinity.strongestSignal && affinity.strongestAverage >= 3.8,
				)
				.sort((a, b) => b.score * b.weight - a.score * a.weight)
				.map((affinity) => affinity.strongestSignal)
				.slice(0, 3);

			scoredItems.push(
				serializeMenuItem(doc, restaurant, matchScore, matchReasons),
			);
		});

		// Keep one item per restaurant near the top so recommendations feel varied.
		const usedRestaurants = new Set();
		const sorted = scoredItems.sort((a, b) => b.matchScore - a.matchScore);
		const diverse = [];
		sorted.forEach((item) => {
			if (diverse.length >= limit) return;
			if (usedRestaurants.has(item.restaurantId)) return;
			diverse.push(item);
			usedRestaurants.add(item.restaurantId);
		});
		sorted.forEach((item) => {
			if (diverse.length >= limit) return;
			if (!diverse.some((selected) => selected.id === item.id)) {
				diverse.push(item);
			}
		});

		return {
			recommendations: diverse,
			profileStatus: "ready",
			totalDishRatings,
		};
	},
);
