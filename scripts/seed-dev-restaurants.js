const { execFileSync } = require("child_process");

const PROJECT_ID = "scervmvp-dev";
const DATABASE_ID = "(default)";
const args = new Set(process.argv.slice(2));
const confirmed = args.has("--confirm-dev-seed");

if (!confirmed) {
	console.error(
		"Refusing to seed without --confirm-dev-seed. This script only targets scervmvp-dev.",
	);
	process.exit(1);
}

function getAccessToken() {
	const raw = execFileSync(
		"cmd.exe",
		["/d", "/c", "npx.cmd firebase login:list --json"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	const parsed = JSON.parse(raw);
	const token =
		parsed && parsed.result && parsed.result[0] && parsed.result[0].tokens
			? parsed.result[0].tokens.access_token
			: null;
	if (!token) {
		throw new Error("Could not read Firebase CLI access token.");
	}
	return token;
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
	const url = `${firestoreBase()}/${encodePath(path)}`;
	await api("PATCH", url, token, toFirestoreDocument(data));
}

const reviewAuthors = [
	["demo_customer_001", "Maya R."],
	["demo_customer_002", "Jordan P."],
	["demo_customer_003", "Lena C."],
	["demo_customer_004", "Chris W."],
	["demo_customer_005", "Amara J."],
	["demo_customer_006", "Daniel K."],
	["demo_customer_007", "Sofia N."],
	["demo_customer_008", "Marcus T."],
	["demo_customer_009", "Priya S."],
	["demo_customer_010", "Evan B."],
];

const restaurants = [
	{
		id: "dev_restaurant_maribel",
		restaurantName: "Maribel Coastal Kitchen",
		name: "Maribel Coastal Kitchen",
		description:
			"Modern coastal dining with charcoal seafood, bright citrus, and a polished dinner service.",
		cuisine: "Coastal Latin",
		category: "Fine Dining",
		city: "Miami",
		state: "FL",
		country: "US",
		area: "Brickell",
		address: "901 Brickell Bay Dr, Miami, FL",
		phoneNumber: "+1 305-555-0141",
		imageUrl:
			"https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1400&q=80",
		rating: 4.8,
		averageRating: 4.8,
		ratingCount: 238,
		priceLevel: "$$$",
		isActive: true,
		hospitalityStyle: "fine_dining",
		features: {
			reservations: true,
			hostCheckInRequests: true,
			qrSelfCheckIn: false,
			parties: true,
			tableScanOrdering: true,
			serviceRequests: true,
			loyaltyClub: true,
		},
		location: { latitude: 25.7617, longitude: -80.1918 },
		tables: ["Chef's Counter", "Table 12", "Patio 4", "Booth 7"],
		menu: [
			{
				id: "dev_item_maribel_calamari",
				name: "Crispy Calamari with Charred Lime",
				description:
					"Tender calamari, arroz crisp, charred lime aioli, pickled Fresno chile.",
				category: "Starters",
				price: 18,
				averageRating: 4.92,
				ratingCount: 38,
				reviewCount: 25,
				orderCount: 142,
				tags: ["calamari", "crispy", "seafood", "citrus", "garlic"],
				reviews: [
					[5, "Best calamari I have had in Miami. Crisp, bright, and not greasy.", ["crispy", "citrus", "seafood"]],
					[5, "The charred lime aioli makes this ridiculous.", ["garlic", "sauce", "shareable"]],
					[4.8, "Perfect starter for the table. Light heat and great crunch.", ["shareable", "spicy", "crispy"]],
				],
			},
			{
				id: "dev_item_maribel_snapper",
				name: "Whole Yellowtail Snapper",
				description:
					"Wood-fired snapper, mojo verde, shaved fennel, crispy capers.",
				category: "Mains",
				price: 42,
				averageRating: 4.74,
				ratingCount: 29,
				reviewCount: 17,
				orderCount: 88,
				tags: ["snapper", "seafood", "wood-fired", "mojo", "fennel"],
				reviews: [
					[5, "Clean, smoky, and beautifully cooked.", ["seafood", "smoky"]],
					[4.6, "Great for two people if you order a few starters.", ["shareable", "fresh"]],
				],
			},
			{
				id: "dev_item_maribel_guava_flancake",
				name: "Guava Flancake",
				description:
					"Custard flan, guava caramel, vanilla sponge, sea salt crumble.",
				category: "Dessert",
				price: 14,
				averageRating: 4.81,
				ratingCount: 24,
				reviewCount: 16,
				orderCount: 77,
				tags: ["guava", "dessert", "caramel", "custard"],
				reviews: [
					[5, "Sweet, salty, and very Miami.", ["dessert", "sweet"]],
					[4.7, "The guava caramel is the star.", ["guava", "caramel"]],
				],
			},
		],
	},
	{
		id: "dev_restaurant_ember",
		restaurantName: "Ember & Rye Social House",
		name: "Ember & Rye Social House",
		description:
			"Upscale casual steakhouse energy with craft cocktails, live fire, and group-friendly plates.",
		cuisine: "American Steakhouse",
		category: "Upscale Casual",
		city: "Charlotte",
		state: "NC",
		country: "US",
		area: "South End",
		address: "2140 Camden Rd, Charlotte, NC",
		phoneNumber: "+1 704-555-0178",
		imageUrl:
			"https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=80",
		rating: 4.6,
		averageRating: 4.6,
		ratingCount: 184,
		priceLevel: "$$",
		isActive: true,
		hospitalityStyle: "full_service",
		features: {
			reservations: true,
			hostCheckInRequests: true,
			qrSelfCheckIn: true,
			parties: true,
			tableScanOrdering: true,
			serviceRequests: true,
			loyaltyClub: true,
		},
		location: { latitude: 35.2114, longitude: -80.8598 },
		tables: ["Table 1", "Table 2", "High Top 5", "Patio 3"],
		menu: [
			{
				id: "dev_item_ember_burger",
				name: "Dry-Aged Smash Burger",
				description:
					"Two dry-aged patties, smoked cheddar, onion jam, house pickles, brioche.",
				category: "Mains",
				price: 21,
				averageRating: 4.67,
				ratingCount: 44,
				reviewCount: 31,
				orderCount: 210,
				tags: ["burger", "dry-aged", "cheddar", "savory", "comfort"],
				reviews: [
					[5, "Big flavor without being too heavy. Onion jam is elite.", ["burger", "savory"]],
					[4.5, "Messy in the right way.", ["comfort", "cheesy"]],
					[4.7, "One of the better burgers in South End.", ["burger", "favorite"]],
				],
			},
			{
				id: "dev_item_ember_calamari",
				name: "Pepper-Crusted Calamari",
				description:
					"Flash fried calamari, lemon pepper crust, chili honey, ranch verde.",
				category: "Starters",
				price: 16,
				averageRating: 4.38,
				ratingCount: 21,
				reviewCount: 13,
				orderCount: 66,
				tags: ["calamari", "pepper", "fried", "chili honey", "shareable"],
				reviews: [
					[4.5, "More bold than classic calamari. Loved the chili honey.", ["spicy", "shareable"]],
					[4.2, "Good crunch, a little sweeter than expected.", ["crispy", "sweet heat"]],
				],
			},
			{
				id: "dev_item_ember_ribeye",
				name: "Coffee-Rubbed Ribeye",
				description:
					"14 oz ribeye, espresso rub, roasted garlic butter, charred scallions.",
				category: "Steaks",
				price: 46,
				averageRating: 4.71,
				ratingCount: 27,
				reviewCount: 18,
				orderCount: 95,
				tags: ["ribeye", "steak", "coffee rub", "garlic", "smoky"],
				reviews: [
					[4.8, "Great crust and the coffee rub really works.", ["steak", "smoky"]],
					[4.6, "Rich, tender, and cooked exactly medium rare.", ["steak", "garlic"]],
				],
			},
		],
	},
	{
		id: "dev_restaurant_sora",
		restaurantName: "Sora Noodle Bar",
		name: "Sora Noodle Bar",
		description:
			"Fast casual ramen, rice bowls, and crispy snacks built for quick ordering and repeat visits.",
		cuisine: "Japanese",
		category: "Fast Casual",
		city: "Austin",
		state: "TX",
		country: "US",
		area: "East Austin",
		address: "1501 E 6th St, Austin, TX",
		phoneNumber: "+1 512-555-0194",
		imageUrl:
			"https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=1400&q=80",
		rating: 4.5,
		averageRating: 4.5,
		ratingCount: 129,
		priceLevel: "$$",
		isActive: true,
		hospitalityStyle: "quick_service",
		features: {
			reservations: false,
			hostCheckInRequests: false,
			qrSelfCheckIn: false,
			parties: true,
			pickup: true,
			tableScanOrdering: false,
			serviceRequests: false,
			loyaltyClub: true,
		},
		location: { latitude: 30.2622, longitude: -97.7257 },
		tables: ["Counter 1", "Counter 2", "Table 3", "Table 4"],
		menu: [
			{
				id: "dev_item_sora_tonkotsu",
				name: "Black Garlic Tonkotsu",
				description:
					"Pork broth, black garlic oil, chashu, ajitama, scallion, nori.",
				category: "Ramen",
				price: 17,
				averageRating: 4.79,
				ratingCount: 51,
				reviewCount: 36,
				orderCount: 240,
				tags: ["ramen", "tonkotsu", "black garlic", "pork", "umami"],
				reviews: [
					[5, "Deep broth, perfect egg, and the garlic oil hits hard.", ["umami", "garlic"]],
					[4.8, "Comfort bowl. I would reorder weekly.", ["comfort", "ramen"]],
					[4.6, "Rich but balanced.", ["pork", "savory"]],
				],
			},
			{
				id: "dev_item_sora_karaage",
				name: "Yuzu Kosho Karaage",
				description:
					"Crispy chicken thigh, yuzu kosho mayo, lemon, shichimi.",
				category: "Snacks",
				price: 12,
				averageRating: 4.58,
				ratingCount: 33,
				reviewCount: 20,
				orderCount: 130,
				tags: ["karaage", "crispy", "chicken", "yuzu", "spicy"],
				reviews: [
					[4.8, "Crunchy, juicy, and the yuzu mayo is excellent.", ["crispy", "chicken"]],
					[4.3, "Nice little heat from the yuzu kosho.", ["spicy", "citrus"]],
				],
			},
			{
				id: "dev_item_sora_miso_corn",
				name: "Miso Butter Corn Ramen",
				description:
					"Chicken miso broth, buttered corn, roasted mushroom, chili crisp.",
				category: "Ramen",
				price: 16,
				averageRating: 4.41,
				ratingCount: 18,
				reviewCount: 11,
				orderCount: 74,
				tags: ["ramen", "miso", "corn", "butter", "vegetarian"],
				reviews: [
					[4.5, "Cozy and a little sweet from the corn.", ["comfort", "miso"]],
					[4.2, "The chili crisp keeps it interesting.", ["spicy", "vegetarian"]],
				],
			},
		],
	},
];

const now = new Date();

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
	return Number((confidence + popularityWeight).toFixed(4));
}

async function seedRestaurant(token, restaurant) {
	const restaurantData = {
		id: restaurant.id,
		restaurantName: restaurant.restaurantName,
		name: restaurant.name,
		description: restaurant.description,
		cuisine: restaurant.cuisine,
		category: restaurant.category,
		city: restaurant.city,
		state: restaurant.state,
		country: restaurant.country,
		countryCode: restaurant.country,
		area: restaurant.area,
		address: restaurant.address,
		phoneNumber: restaurant.phoneNumber,
		imageUrl: restaurant.imageUrl,
		imageUri: restaurant.imageUrl,
		rating: restaurant.rating,
		averageRating: restaurant.averageRating,
		ratingCount: restaurant.ratingCount,
		priceLevel: restaurant.priceLevel,
		isActive: restaurant.isActive,
		isLive: true,
		isTestAccount: true,
		isDemoSeed: true,
		hospitalityStyle: restaurant.hospitalityStyle,
		features: restaurant.features,
		location: restaurant.location,
		searchKeywords: [
			restaurant.restaurantName,
			restaurant.cuisine,
			restaurant.category,
			restaurant.city,
			restaurant.area,
		].map((value) => String(value || "").toLowerCase()),
		createdAt: now,
		updatedAt: now,
	};

	await setDoc(token, `restaurants/${restaurant.id}`, restaurantData);

	await setDoc(
		token,
		`restaurants/${restaurant.id}/reservationSettings/general`,
		{
			enabled: restaurant.features.reservations === true,
			approvalMode: "manual",
			slotIntervalMinutes: 30,
			defaultTurnTimeMinutes: 90,
			minPartySize: 1,
			maxPartySize: 8,
			cancellationWindowHours: 4,
			emailConfirmationsEnabled: true,
			weeklySchedule: {
				sunday: [{ start: "17:00", end: "21:00", maxReservationsPerSlot: 2 }],
				monday: [],
				tuesday: [{ start: "17:00", end: "21:00", maxReservationsPerSlot: 2 }],
				wednesday: [{ start: "17:00", end: "21:00", maxReservationsPerSlot: 2 }],
				thursday: [{ start: "17:00", end: "22:00", maxReservationsPerSlot: 2 }],
				friday: [{ start: "17:00", end: "22:30", maxReservationsPerSlot: 2 }],
				saturday: [{ start: "16:30", end: "22:30", maxReservationsPerSlot: 2 }],
			},
			blackoutDates: [],
			updatedAt: now,
			updatedBy: "dev_seed",
		},
	);

	for (let i = 0; i < restaurant.tables.length; i += 1) {
		const tableName = restaurant.tables[i];
		const tableId = tableName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
		await setDoc(token, `restaurants/${restaurant.id}/tables/${tableId}`, {
			id: tableId,
			name: tableName,
			tableNumber: i + 1,
			status: "available",
			capacity: i === 0 ? 2 : 4,
			isDemoSeed: true,
			createdAt: now,
			updatedAt: now,
		});
	}

	for (const item of restaurant.menu) {
		const tags = item.tags || [];
		const totalRatingSum = Number(
			(item.averageRating * item.ratingCount).toFixed(2),
		);
		await setDoc(token, `menuItems/${item.id}`, {
			id: item.id,
			restaurantId: restaurant.id,
			canonicalDishId: `${restaurant.id}_${item.category
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "_")}_${item.name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "_")}`.slice(0, 240),
			normalizedName: item.name.toLowerCase().replace(/\s+/g, " ").trim(),
			normalizedCategory: item.category.toLowerCase().replace(/\s+/g, " ").trim(),
			reputationSourceMenuItemId: item.id,
			relistedFromMenuItemId: null,
			previousNames: [],
			restaurantName: restaurant.restaurantName,
			name: item.name,
			description: item.description,
			category: item.category,
			price: item.price,
			isAvailable: true,
			isDemoSeed: true,
			imageUri: restaurant.imageUrl,
			imageUrl: restaurant.imageUrl,
			ingredientTags: tags.slice(0, 5),
			flavorTags: tags.slice(1, 6),
			cuisineTags: [restaurant.cuisine.toLowerCase()],
			dietaryTags: tags.includes("vegetarian") ? ["vegetarian"] : [],
			searchKeywords: [
				item.name,
				item.description,
				item.category,
				restaurant.restaurantName,
				...tags,
			].map((value) => String(value || "").toLowerCase()),
			topReviewTags: [...new Set(item.reviews.flatMap((review) => review[2]))],
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
			createdAt: now,
			updatedAt: now,
		});

		for (let i = 0; i < item.reviews.length; i += 1) {
			const [ratingValue, reviewText, reviewTags] = item.reviews[i];
			const [customerId, customerName] =
				reviewAuthors[(i + item.id.length) % reviewAuthors.length];
			await setDoc(
				token,
				`menuItems/${item.id}/ratings/${customerId}_${item.id}`,
				{
					menuItemId: item.id,
					restaurantId: restaurant.id,
					customerId,
					customerName,
					ratingValue,
					comment: reviewText,
					reviewText,
					reviewTags,
					orderId: `dev_order_${restaurant.id}_${i + 1}`,
					origin: "dev_seed",
					isIndividual: true,
					status: "published",
					timestamp: new Date(now.getTime() - (i + 1) * 86400000),
				},
			);
		}
	}
}

async function main() {
	const token = getAccessToken();
	for (const restaurant of restaurants) {
		console.log(`Seeding ${restaurant.restaurantName}...`);
		await seedRestaurant(token, restaurant);
	}
	console.log(
		`Seed complete: ${restaurants.length} restaurants, ${restaurants.reduce(
			(total, restaurant) => total + restaurant.menu.length,
			0,
		)} menu items.`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
