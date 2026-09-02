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

const timestampToMillis = (value) => {
	if (!value) return 0;
	if (typeof value.toMillis === "function") return value.toMillis();
	if (value instanceof Date) return value.getTime();
	return Number(value) || 0;
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

const SIGNAL_NAMESPACES = [
	"dishTypes",
	"flavors",
	"ingredients",
	"cuisines",
	"categories",
	"dietary",
];

const getPositiveSignalMap = (profile = {}) => {
	const signalCounts = profile.signalCounts || {};
	const positiveSignals = {};

	SIGNAL_NAMESPACES.forEach((namespace) => {
		const namespaceCounts = signalCounts[namespace] || {};
		positiveSignals[namespace] = new Map();

		Object.keys(namespaceCounts).forEach((signal) => {
			const stats = namespaceCounts[signal] || {};
			const count = Number(stats.count || 0);
			const ratingSum = Number(stats.ratingSum || 0);
			if (!count || !Number.isFinite(ratingSum)) return;

			const average = ratingSum / count;
			if (average < 3.8) return;

			positiveSignals[namespace].set(signal, {
				average,
				count,
			});
		});
	});

	return positiveSignals;
};

const calculateProfileSimilarity = (basePositiveSignals, candidateProfile = {}) => {
	const candidateSignals = getPositiveSignalMap(candidateProfile);
	let score = 0;
	let sharedSignalCount = 0;
	const sharedSignals = [];

	SIGNAL_NAMESPACES.forEach((namespace) => {
		const baseNamespace = basePositiveSignals[namespace] || new Map();
		const candidateNamespace = candidateSignals[namespace] || new Map();

		candidateNamespace.forEach((candidateStats, signal) => {
			const baseStats = baseNamespace.get(signal);
			if (!baseStats) return;

			const confidence = Math.min(
				1,
				Math.log1p(baseStats.count + candidateStats.count) / Math.log1p(8),
			);
			const contribution =
				(baseStats.average - 3) * (candidateStats.average - 3) * confidence;
			score += contribution;
			sharedSignalCount += 1;

			if (sharedSignals.length < 4) {
				sharedSignals.push(signal.replace(/_/g, " "));
			}
		});
	});

	return {
		score,
		sharedSignalCount,
		sharedSignals,
	};
};

const getTasteTwinsForProfile = async (uid, profile) => {
	const positiveSignals = getPositiveSignalMap(profile);
	const profileCandidatesSnap = await db
		.collection("customerPalateProfiles")
		.limit(80)
		.get();

	return profileCandidatesSnap.docs
		.filter((doc) => doc.id !== uid)
		.map((doc) => {
			const candidateProfile = doc.data() || {};
			const similarity = calculateProfileSimilarity(
				positiveSignals,
				candidateProfile,
			);
			return {
				uid: doc.id,
				...similarity,
			};
		})
		.filter(
			(candidate) =>
				candidate.score > 0 && candidate.sharedSignalCount >= 2,
		)
		.sort((a, b) => b.score - a.score)
		.slice(0, 12);
};

const serializeMenuItem = (
	doc,
	restaurant,
	matchScore,
	matchReasons,
	matchConfidence,
	tasteTwinData,
) => {
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
		matchConfidence,
		matchBasis: tasteTwinData ? "taste_twins" : "profile",
		tasteTwinCount: tasteTwinData ? tasteTwinData.count : 0,
		tasteTwinAverageRating: tasteTwinData
			? Number(tasteTwinData.averageRating.toFixed(1))
			: 0,
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

		const profileRef = db.collection("customerPalateProfiles").doc(uid);
		const profileSnap = await profileRef.get();
		if (!profileSnap.exists) {
			return { recommendations: [], profileStatus: "not_enough_ratings" };
		}

		const profile = profileSnap.data() || {};
		const totalDishRatings = Number(profile.totalDishRatings || 0);
		if (totalDishRatings < 1) {
			return { recommendations: [], profileStatus: "not_enough_ratings" };
		}

		const recentRatingEventsSnap = await profileRef
			.collection("ratingEvents")
			.orderBy("createdAt", "desc")
			.limit(100)
			.get();
		const ratedMenuItemIds = new Set(
			recentRatingEventsSnap.docs
				.map((doc) => {
					const eventData = doc.data() || {};
					return eventData.menuItemId;
				})
				.filter(Boolean),
		);
		const tasteTwins = await getTasteTwinsForProfile(uid, profile);
		const tasteTwinSignals = [
			...new Set(tasteTwins.flatMap((candidate) => candidate.sharedSignals || [])),
		].slice(0, 4);
		const tasteTwinItemScores = new Map();

		await Promise.all(
			tasteTwins.slice(0, 8).map(async (candidate) => {
				const candidateEventsSnap = await db
					.collection("customerPalateProfiles")
					.doc(candidate.uid)
					.collection("ratingEvents")
					.orderBy("createdAt", "desc")
					.limit(25)
					.get();

				candidateEventsSnap.docs.forEach((eventDoc) => {
					const event = eventDoc.data() || {};
					const menuItemId = event.menuItemId;
					const ratingValue = Number(event.ratingValue || 0);
					if (!menuItemId || ratedMenuItemIds.has(menuItemId) || ratingValue < 4) {
						return;
					}

					const current = tasteTwinItemScores.get(menuItemId) || {
						count: 0,
						ratingSum: 0,
						similaritySum: 0,
					};
					current.count += 1;
					current.ratingSum += ratingValue;
					current.similaritySum += candidate.score;
					tasteTwinItemScores.set(menuItemId, current);
				});
			}),
		);

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
			if (ratedMenuItemIds.has(doc.id)) {
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
			const tasteTwinScoreData = tasteTwinItemScores.get(doc.id);
			const tasteTwinBonus = tasteTwinScoreData
				? tasteTwinScoreData.count * 7 + tasteTwinScoreData.similaritySum * 2
				: 0;
			const matchScore =
				affinityScore +
				discoveryScore * 0.35 +
				rating * 3 +
				Math.log1p(reviewCount) +
				tasteTwinBonus;

			const matchReasons = affinities
				.filter(
					(affinity) =>
						affinity.strongestSignal && affinity.strongestAverage >= 3.8,
				)
				.sort((a, b) => b.score * b.weight - a.score * a.weight)
				.map((affinity) => affinity.strongestSignal)
				.slice(0, 3);
			const matchConfidence = Math.min(
				98,
				Math.max(
					62,
					Math.round(
						64 +
							Math.min(totalDishRatings, 12) * 1.6 +
							matchReasons.length * 4 +
							(tasteTwinScoreData ? tasteTwinScoreData.count * 3 : 0) +
							Math.min(reviewCount, 30) * 0.25,
					),
				),
			);
			const tasteTwinData = tasteTwinScoreData
				? {
						count: tasteTwinScoreData.count,
						averageRating:
							tasteTwinScoreData.ratingSum / tasteTwinScoreData.count,
					}
				: null;

			scoredItems.push(
				serializeMenuItem(
					doc,
					restaurant,
					matchScore,
					matchReasons,
					matchConfidence,
					tasteTwinData,
				),
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
			tasteTwinCount: tasteTwins.length,
			tasteTwinSignals,
		};
	},
);

const getCustomerDisplayName = (customer = {}, fallback = "Scerv guest") => {
	const firstName = String(customer.firstName || "").trim();
	const lastName = String(customer.lastName || "").trim();
	const fullName = String(customer.fullName || customer.name || "").trim();

	if (firstName && lastName) return `${firstName} ${lastName.charAt(0)}.`;
	if (firstName) return firstName;
	if (fullName) {
		const parts = fullName.split(/\s+/).filter(Boolean);
		return parts.length > 1 ? `${parts[0]} ${parts[1].charAt(0)}.` : parts[0];
	}
	return fallback;
};

const isApprovedInfluencer = (customer = {}) =>
	customer.isScervApprovedInfluencer === true ||
	customer.scervApprovedInfluencer === true ||
	customer.publicInfluencer === true ||
	customer.creatorStatus === "scerv_approved";

exports.getScervFeed = functions.https.onCall(async (data, context) => {
	const uid = context.auth && context.auth.uid;
	if (!uid) {
		throw new functions.https.HttpsError("unauthenticated", "Login required.");
	}

	const countryCode = String((data && data.countryCode) || "US")
		.trim()
		.toUpperCase()
		.slice(0, 8);
	const limit = Math.min(Math.max(Number((data && data.limit) || 30), 5), 50);

	const [profileSnap, pipsSnap, feedActivitySnap] = await Promise.all([
		db.collection("customerPalateProfiles").doc(uid).get(),
		db.collection("customers").doc(uid).collection("pips").get(),
		db.collection("scervFeedActivity").orderBy("timestamp", "desc").limit(160).get(),
	]);

	const profile = profileSnap.exists ? profileSnap.data() || {} : {};
	const tasteTwins = profileSnap.exists
		? await getTasteTwinsForProfile(uid, profile)
		: [];
	const tasteTwinUserIds = new Set(tasteTwins.map((candidate) => candidate.uid));
	const pipNameByUserId = new Map();
	pipsSnap.docs.forEach((doc) => {
		const pip = doc.data() || {};
		if (pip.isUser && pip.userId) {
			pipNameByUserId.set(pip.userId, pip.name || "Your PIP");
		}
	});

	let recentRatingDocs = feedActivitySnap.docs;

	if (recentRatingDocs.length === 0) {
		try {
			// Fallback keeps older rating data useful while the dedicated feed rail fills in.
			const recentRatingsSnap = await db.collectionGroup("ratings")
				.orderBy("timestamp", "desc")
				.limit(160)
				.get();
			recentRatingDocs = recentRatingsSnap.docs;
		} catch (error) {
			functions.logger.warn("Scerv feed fallback query failed.", error);
		}
	}

	const recentRatings = recentRatingDocs
		.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
		.filter((rating) => {
			if (rating.status && rating.status !== "published") return false;
			return rating.menuItemId && rating.restaurantId && rating.ratingValue >= 4;
		});
	const menuItemIds = [...new Set(recentRatings.map((rating) => rating.menuItemId))];
	const restaurantIds = [
		...new Set(recentRatings.map((rating) => rating.restaurantId)),
	];
	const customerIds = [
		...new Set(recentRatings.map((rating) => rating.customerId).filter(Boolean)),
	];

	const [menuItemDocs, restaurantDocs, customerDocs] = await Promise.all([
		Promise.all(
			menuItemIds.map((id) => db.collection("menuItems").doc(id).get()),
		),
		Promise.all(
			restaurantIds.map((id) => db.collection("restaurants").doc(id).get()),
		),
		Promise.all(customerIds.map((id) => db.collection("customers").doc(id).get())),
	]);
	const menuItemsById = new Map(
		menuItemDocs
			.filter((doc) => doc.exists)
			.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]),
	);
	const restaurantsById = new Map(
		restaurantDocs
			.filter((doc) => doc.exists)
			.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]),
	);
	const customersById = new Map(
		customerDocs
			.filter((doc) => doc.exists)
			.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]),
	);

	const feedItems = [];
	const seenKeys = new Set();

	recentRatings.forEach((rating) => {
		const menuItem = menuItemsById.get(rating.menuItemId);
		const restaurant = restaurantsById.get(rating.restaurantId);
		if (!menuItem || !restaurant || restaurant.isLive !== true) return;
		if (restaurant.countryCode && restaurant.countryCode !== countryCode) return;

		const customer = customersById.get(rating.customerId) || {};
		const authorIsInfluencer = isApprovedInfluencer(customer);
		const isFeaturedActivity =
			rating.feedVisibility === "featured" ||
			rating.feedType === "featured_diner";
		const isPip = pipNameByUserId.has(rating.customerId);
		const isTasteTwin = tasteTwinUserIds.has(rating.customerId);
		const isOwnActivity = rating.customerId === uid;
		const shouldInclude =
			isOwnActivity ||
			isPip ||
			isTasteTwin ||
			authorIsInfluencer ||
			isFeaturedActivity;
		if (!shouldInclude) return;

		const key = `${rating.customerId || "guest"}_${rating.menuItemId}`;
		if (seenKeys.has(key)) return;
		seenKeys.add(key);

		const feedType = authorIsInfluencer || isFeaturedActivity
			? "influencer"
			: isPip
				? "pip"
				: isOwnActivity
					? "you"
					: "taste_twin";
		const anonymous = feedType === "taste_twin";
		const authorName = anonymous
			? "A Taste Twin"
			: feedType === "pip"
				? pipNameByUserId.get(rating.customerId)
				: getCustomerDisplayName(customer, rating.customerDisplayName || "Scerv guest");
		const media = Array.isArray(rating.media) ? rating.media.slice(0, 4) : [];
		const primaryMedia = media[0] || {};
		const imageUri =
			primaryMedia.thumbnailUrl ||
			primaryMedia.url ||
			menuItem.imageUri ||
			menuItem.imageUrl ||
			restaurant.imageUri ||
			restaurant.imageUrl ||
			"";

		feedItems.push({
			id: rating.id,
			type: feedType,
			anonymous,
			authorName,
			authorLabel:
				feedType === "influencer"
					? "Featured Diner"
					: feedType === "pip"
						? "Friend"
						: feedType === "you"
							? "You"
							: "Taste Twin",
			ratingValue: Number(rating.ratingValue || 0),
			reviewText: rating.reviewText || rating.comment || "",
			reviewTags: Array.isArray(rating.reviewTags)
				? rating.reviewTags.slice(0, 4)
				: [],
			verificationLevel: rating.verificationLevel || "",
			timestampMillis: timestampToMillis(rating.timestamp),
			menuItem: {
				id: menuItem.id,
				name: menuItem.name || menuItem.dishName || "Menu item",
				dishName: menuItem.dishName || menuItem.name || "Menu item",
				description: menuItem.description || "",
				price: menuItem.price || 0,
				category: menuItem.category || "",
				displayCategory: menuItem.displayCategory || "",
				discoveryLabel: menuItem.discoveryLabel || menuItem.displayCategory || "",
				restaurantId: restaurant.id,
				restaurantName:
					restaurant.restaurantName || restaurant.name || "Restaurant",
				imageUri,
				imageUrl: imageUri,
				media: Array.isArray(menuItem.media) ? menuItem.media.slice(0, 6) : [],
				averageRating: Number(menuItem.averageRating || menuItem.rating || 0),
				ratingCount: Number(menuItem.ratingCount || 0),
				reviewCount: Number(menuItem.reviewCount || 0),
				scervScore: Number(menuItem.scervScore || menuItem.discoveryScore || 0),
				discoveryScore: Number(
					menuItem.discoveryScore || menuItem.scervScore || 0,
				),
				topReviewTags: Array.isArray(menuItem.topReviewTags)
					? menuItem.topReviewTags.slice(0, 8)
					: [],
			},
			restaurant: {
				id: restaurant.id,
				name: restaurant.restaurantName || restaurant.name || "Restaurant",
				area: restaurant.area || restaurant.neighborhood || "",
				city: restaurant.city || "",
				state: restaurant.state || "",
				cuisineType: restaurant.cuisineType || restaurant.cuisine || "",
			},
			media,
		});
	});

	return {
		feedItems: feedItems
			.sort((a, b) => b.timestampMillis - a.timestampMillis)
			.slice(0, limit),
		tasteTwinCount: tasteTwins.length,
		hasPips: pipNameByUserId.size > 0,
	};
});
