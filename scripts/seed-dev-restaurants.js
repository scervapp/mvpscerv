const auth = require("firebase-tools/lib/auth");
const scopes = require("firebase-tools/lib/scopes");
const {
	calculateScervDiscoveryScore,
} = require("../functions/discoveryScoring");

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
	// Merge seeded demo fields so operational settings like Stripe, staff, and feature flags survive reseeds.
	const updateMask = Object.keys(data)
		.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
		.join("&");
	const url = `${firestoreBase()}/${encodePath(path)}?${updateMask}`;
	await api("PATCH", url, token, toFirestoreDocument(data));
}

async function deleteDoc(token, path) {
	const url = `${firestoreBase()}/${encodePath(path)}`;
	const response = await fetch(url, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
	if (!response.ok && response.status !== 404) {
		const text = await response.text();
		throw new Error(`DELETE ${url} failed: ${response.status} ${text}`);
	}
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

const demoPhotoUrl = (terms, lock) =>
	`https://loremflickr.com/1200/900/${terms}?lock=${lock}`;

// Keep demo menu item photos dish-specific so customer discovery does not fall back to restaurant hero images.
const menuItemImages = {
	dev_item_maribel_daily_octopus: demoPhotoUrl("double-cheeseburger,burger", 1101),
	dev_item_maribel_calamari:
		demoPhotoUrl("buffalo-wings,chicken", 1102),
	dev_item_maribel_snapper:
		demoPhotoUrl("pizza,vodka-sauce", 1103),
	dev_item_maribel_tuna_tostada:
		demoPhotoUrl("italian-salad,chopped-salad", 1104),
	dev_item_maribel_arroz_negro:
		demoPhotoUrl("cheeseburger,fries", 1105),
	dev_item_maribel_guava_flancake:
		demoPhotoUrl("tiramisu,dessert", 1106),
	dev_item_maribel_tostones: demoPhotoUrl("parmesan-fries,french-fries", 1107),
	dev_item_maribel_mojito:
		demoPhotoUrl("mojito,cocktail", 1108),
	dev_item_maribel_passion_margarita:
		demoPhotoUrl("margarita,cocktail", 1109),
	dev_item_harbor_daily_tower: demoPhotoUrl("seafood-tower,oysters", 1201),
	dev_item_harbor_calamari:
		demoPhotoUrl("fried-calamari,seafood", 1202),
	dev_item_harbor_oysters:
		demoPhotoUrl("oysters,raw-bar", 1203),
	dev_item_harbor_lobster_roll:
		demoPhotoUrl("lobster-roll,seafood", 1204),
	dev_item_harbor_salmon:
		demoPhotoUrl("salmon,seafood", 1205),
	dev_item_harbor_steak_frites:
		demoPhotoUrl("steak,fries", 1206),
	dev_item_harbor_pasta:
		demoPhotoUrl("crab-pasta,pasta", 1207),
	dev_item_harbor_burger: demoPhotoUrl("smash-burger,burger", 1212),
	dev_item_harbor_clam_pizza: demoPhotoUrl("clam-pizza,pizza", 1213),
	dev_item_harbor_chocolate_torte:
		demoPhotoUrl("chocolate-cake,dessert", 1208),
	dev_item_harbor_fries: demoPhotoUrl("french-fries", 1209),
	dev_item_harbor_martini:
		demoPhotoUrl("dirty-martini,cocktail", 1210),
	dev_item_harbor_spritz:
		demoPhotoUrl("spritz,cocktail", 1211),
	dev_item_sora_daily_miso: demoPhotoUrl("spicy-ramen,noodles", 1301),
	dev_item_sora_tonkotsu:
		demoPhotoUrl("tonkotsu-ramen,noodles", 1302),
	dev_item_sora_karaage:
		demoPhotoUrl("karaage,fried-chicken", 1303),
	dev_item_sora_miso_corn:
		demoPhotoUrl("miso-ramen,corn", 1304),
	dev_item_sora_spicy_tuna_bowl:
		demoPhotoUrl("tuna-bowl,sushi", 1305),
	dev_item_sora_dragon_roll: demoPhotoUrl("dragon-roll,sushi", 1310),
	dev_item_sora_omakase: demoPhotoUrl("sushi,omakase", 1311),
	dev_item_sora_matcha_cheesecake:
		demoPhotoUrl("matcha-cheesecake,dessert", 1306),
	dev_item_sora_sunomono: demoPhotoUrl("cucumber-salad,japanese-food", 1307),
	dev_item_sora_yuzu_lemonade:
		demoPhotoUrl("lemonade,yuzu", 1308),
	dev_item_sora_sake_highball:
		demoPhotoUrl("highball,cocktail", 1309),
};

const restaurants = [
	{
		id: "dev_restaurant_maribel",
		restaurantName: "Park Slope Social",
		name: "Park Slope Social",
		description:
			"Neighborhood restaurant in Park Slope with burgers, pizza, wings, salads, cocktails, and easy group dining.",
		cuisine: "American Bistro",
		category: "Full Service",
		city: "Brooklyn",
		state: "NY",
		country: "US",
		area: "Park Slope",
		address: "284 5th Ave, Brooklyn, NY",
		phoneNumber: "+1 718-555-0141",
		imageUrl:
			"https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1400&q=80",
		rating: 4.6,
		averageRating: 4.6,
		ratingCount: 238,
		priceLevel: "$$",
		isActive: true,
		hospitalityStyle: "full_service",
		features: {
			reservations: true,
			hostCheckInRequests: true,
			qrSelfCheckIn: false,
			parties: true,
			tableScanOrdering: true,
			serviceRequests: true,
			loyaltyClub: true,
		},
		location: { latitude: 40.6728, longitude: -73.9815 },
		tables: ["Bar 3", "Table 12", "Patio 4", "Booth 7"],
		menu: [
			{
				id: "dev_item_maribel_daily_octopus",
				name: "Daily Special: Park Slope Double Burger",
				description:
					"Two dry-aged patties, American cheese, caramelized onions, pickles, house sauce, brioche.",
				category: "Daily Special",
				isDailySpecial: true,
				price: 22,
				averageRating: 4.88,
				ratingCount: 44,
				reviewCount: 29,
				orderCount: 132,
				tags: ["daily special", "burger", "cheeseburger", "beef", "brioche", "fries"],
				reviews: [
					[5, "Juicy, salty, and exactly the burger I wanted.", ["burger", "cheeseburger", "favorite"]],
					[4.8, "The onions and house sauce make it feel special.", ["daily special", "beef"]],
				],
			},
			{
				id: "dev_item_maribel_calamari",
				name: "Crispy Buffalo Wings",
				description:
					"Crispy chicken wings, house buffalo sauce, celery, blue cheese dip.",
				category: "Appetizers",
				price: 16,
				averageRating: 4.72,
				ratingCount: 38,
				reviewCount: 25,
				orderCount: 142,
				tags: ["wings", "chicken", "buffalo", "crispy", "appetizer", "spicy"],
				reviews: [
					[4.8, "Crispy wings with real buffalo heat.", ["wings", "spicy", "crispy"]],
					[4.7, "The blue cheese dip is strong in the best way.", ["chicken", "appetizer"]],
					[4.6, "Good shareable starter before pizza.", ["shareable", "buffalo"]],
				],
			},
			{
				id: "dev_item_maribel_snapper",
				name: "Vodka Sauce Pepperoni Pizza",
				description:
					"Thin crust pizza, vodka sauce, pepperoni cups, mozzarella, basil, chili oil.",
				category: "Pizza",
				price: 21,
				averageRating: 4.74,
				ratingCount: 29,
				reviewCount: 17,
				orderCount: 88,
				tags: ["pizza", "pepperoni", "vodka sauce", "mozzarella", "basil"],
				reviews: [
					[5, "The vodka sauce pizza is ridiculous. Crisp crust too.", ["pizza", "pepperoni"]],
					[4.6, "Great for sharing with wings and drinks.", ["shareable", "vodka sauce"]],
				],
			},
			{
				id: "dev_item_maribel_tuna_tostada",
				name: "Chopped Italian Salad",
				description:
					"Romaine, salami, provolone, chickpeas, cherry tomato, oregano vinaigrette.",
				category: "Salads",
				price: 15,
				averageRating: 4.64,
				ratingCount: 32,
				reviewCount: 21,
				orderCount: 104,
				tags: ["salad", "italian", "romaine", "salami", "provolone", "fresh"],
				reviews: [
					[4.8, "Fresh, crunchy, and enough flavor to stand up to pizza.", ["salad", "fresh"]],
					[4.5, "Good balance if you want something lighter.", ["italian", "starter"]],
				],
			},
			{
				id: "dev_item_maribel_arroz_negro",
				name: "Classic Social Cheeseburger",
				description:
					"Single beef patty, cheddar, lettuce, tomato, onion, pickles, house sauce, fries.",
				category: "Burgers",
				price: 18,
				averageRating: 4.47,
				ratingCount: 26,
				reviewCount: 15,
				orderCount: 82,
				tags: ["burger", "cheeseburger", "beef", "cheddar", "fries"],
				reviews: [
					[4.6, "Solid classic burger and the fries are crisp.", ["burger", "fries"]],
					[4.2, "Good everyday burger. The house sauce helps.", ["cheeseburger", "beef"]],
				],
			},
			{
				id: "dev_item_maribel_guava_flancake",
				name: "Espresso Tiramisu",
				description:
					"Mascarpone cream, espresso-soaked ladyfingers, cocoa, shaved chocolate.",
				category: "Desserts",
				price: 12,
				averageRating: 4.81,
				ratingCount: 24,
				reviewCount: 16,
				orderCount: 77,
				tags: ["tiramisu", "dessert", "espresso", "chocolate", "mascarpone"],
				reviews: [
					[5, "Soft, espresso-forward, and not too sweet.", ["dessert", "espresso"]],
					[4.7, "The cocoa and chocolate make it feel classic.", ["tiramisu", "chocolate"]],
				],
			},
			{
				id: "dev_item_maribel_tostones",
				name: "Parmesan Fries",
				description:
					"Hand-cut fries, parmesan, parsley, black pepper, roasted garlic aioli.",
				category: "Sides",
				price: 9,
				averageRating: 4.52,
				ratingCount: 27,
				reviewCount: 17,
				orderCount: 111,
				tags: ["fries", "parmesan", "garlic aioli", "crispy", "side"],
				reviews: [
					[4.7, "Crunchy, salty, and great for sharing.", ["crispy", "side"]],
					[4.3, "The garlic aioli is what makes them.", ["garlic", "fries"]],
				],
			},
			{
				id: "dev_item_maribel_mojito",
				name: "Charred Pineapple Mojito",
				description:
					"White rum, charred pineapple, mint, lime, demerara, soda.",
				category: "Cocktails",
				price: 15,
				averageRating: 4.66,
				ratingCount: 34,
				reviewCount: 22,
				orderCount: 118,
				tags: ["cocktail", "mojito", "pineapple", "mint", "rum", "citrus"],
				reviews: [
					[4.8, "Fresh and not too sweet. Great with the wings.", ["cocktail", "mint", "citrus"]],
					[4.5, "The grilled pineapple gives it a nice smoky edge.", ["pineapple", "rum"]],
				],
			},
			{
				id: "dev_item_maribel_passion_margarita",
				name: "Passion Fruit Margarita",
				description:
					"Blanco tequila, passion fruit, lime, orange curacao, tajin rim.",
				category: "Cocktails",
				price: 16,
				averageRating: 4.78,
				ratingCount: 41,
				reviewCount: 28,
				orderCount: 146,
				tags: ["cocktail", "margarita", "tequila", "passion fruit", "lime"],
				reviews: [
					[4.9, "Bright, tropical, and balanced. The tajin rim is perfect.", ["margarita", "tropical"]],
					[4.7, "Easy to drink but still tastes crafted.", ["tequila", "citrus"]],
				],
			},
		],
	},
	{
		id: "jaRr9o8wLcXUyDPeF6QsirPjNtA3",
		restaurantName: "Harbor and Ember",
		name: "Harbor and Ember",
		description:
			"Williamsburg waterfront dining with raw bar favorites, live-fire seafood, burgers, pizza, and polished service.",
		cuisine: "New American Seafood",
		category: "Full Service",
		city: "Brooklyn",
		state: "NY",
		country: "US",
		area: "Williamsburg",
		address: "125 Kent Ave, Brooklyn, NY",
		storeNumber: "1001",
		phoneNumber: "+1 718-555-0188",
		imageUrl:
			"https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1400&q=80",
		rating: 4.7,
		averageRating: 4.7,
		ratingCount: 312,
		priceLevel: "$$$",
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
		location: { latitude: 40.7216, longitude: -73.9618 },
		tables: ["Window 2", "Booth 6", "Bar 9", "Patio 4", "Table 12"],
		menu: [
			{
				id: "dev_item_harbor_daily_tower",
				name: "Daily Special: Chilled Seafood Tower",
				description:
					"Oysters, shrimp cocktail, lobster salad, crab claws, mignonette, lemon.",
				category: "Daily Special",
				isDailySpecial: true,
				price: 68,
				averageRating: 4.91,
				ratingCount: 53,
				reviewCount: 37,
				orderCount: 121,
				tags: ["daily special", "seafood tower", "oysters", "shrimp", "lobster", "crab"],
				reviews: [
					[5, "The seafood tower made the whole table stop talking.", ["seafood", "oysters", "lobster"]],
					[4.9, "Cold, clean, generous, and perfect for a celebration.", ["daily special", "shareable"]],
					[4.8, "Best way to start here if you love seafood.", ["raw bar", "favorite"]],
				],
			},
			{
				id: "dev_item_harbor_calamari",
				name: "Brooklyn Calamari Fritti",
				description:
					"Flash-fried calamari, cherry pepper relish, lemon, smoked garlic aioli.",
				category: "Starters",
				price: 18,
				averageRating: 4.86,
				ratingCount: 82,
				reviewCount: 48,
				orderCount: 284,
				tags: ["calamari", "seafood", "crispy", "garlic", "lemon", "shareable"],
				reviews: [
					[5, "Exactly what calamari should be: crisp, tender, and bright.", ["calamari", "crispy", "seafood"]],
					[4.9, "The smoked garlic aioli makes it feel special.", ["garlic", "sauce", "shareable"]],
					[4.7, "Great starter for a group. The peppers wake it up.", ["shareable", "lemon", "spicy"]],
					[4.8, "Not greasy at all, which is rare for calamari.", ["crispy", "light", "favorite"]],
				],
			},
			{
				id: "dev_item_harbor_oysters",
				name: "East Coast Oyster Flight",
				description:
					"Six rotating oysters, cucumber mignonette, cocktail sauce, horseradish.",
				category: "Starters",
				price: 24,
				averageRating: 4.83,
				ratingCount: 64,
				reviewCount: 39,
				orderCount: 176,
				tags: ["oysters", "seafood", "raw bar", "fresh", "briny"],
				reviews: [
					[5, "Cold, clean, and beautifully shucked.", ["oysters", "fresh", "raw bar"]],
					[4.8, "The cucumber mignonette is subtle and perfect.", ["seafood", "bright"]],
					[4.6, "Great with a martini before dinner.", ["raw bar", "date night"]],
				],
			},
			{
				id: "dev_item_harbor_lobster_roll",
				name: "Warm Butter Lobster Roll",
				description:
					"Poached lobster, brown butter, herbs, toasted split-top roll, kettle chips.",
				category: "Mains",
				price: 32,
				averageRating: 4.93,
				ratingCount: 57,
				reviewCount: 41,
				orderCount: 201,
				tags: ["lobster", "seafood", "butter", "sandwich", "coastal"],
				reviews: [
					[5, "Loaded with lobster and still balanced. Worth it.", ["lobster", "butter", "seafood"]],
					[4.9, "The roll is toasted perfectly and the lobster is generous.", ["sandwich", "coastal"]],
					[4.8, "Rich but not heavy. I would come back just for this.", ["favorite", "butter"]],
				],
			},
			{
				id: "dev_item_harbor_salmon",
				name: "Cedar Plank Salmon",
				description:
					"Roasted salmon, maple mustard glaze, charred broccolini, lemon potatoes.",
				category: "Mains",
				price: 29,
				averageRating: 4.54,
				ratingCount: 43,
				reviewCount: 24,
				orderCount: 119,
				tags: ["salmon", "seafood", "cedar", "maple", "healthy"],
				reviews: [
					[4.6, "Simple, clean, and cooked nicely.", ["salmon", "healthy"]],
					[4.4, "Good weeknight dinner option. The glaze is sweet but not too much.", ["seafood", "maple"]],
					[4.2, "Solid dish, though the lobster roll stole the table.", ["salmon", "mains"]],
				],
			},
			{
				id: "dev_item_harbor_steak_frites",
				name: "Skirt Steak Frites",
				description:
					"Charred skirt steak, chimichurri, sea salt fries, watercress salad.",
				category: "Mains",
				price: 34,
				averageRating: 4.41,
				ratingCount: 36,
				reviewCount: 20,
				orderCount: 107,
				tags: ["steak", "frites", "chimichurri", "fries", "savory"],
				reviews: [
					[4.5, "Great char and the fries are dangerous.", ["steak", "fries"]],
					[4.3, "Good but I wanted a little more chimichurri.", ["savory", "chimichurri"]],
				],
			},
			{
				id: "dev_item_harbor_pasta",
				name: "Spicy Crab Campanelle",
				description:
					"Campanelle pasta, blue crab, tomato, Calabrian chile, basil, lemon crumb.",
				category: "Mains",
				price: 28,
				averageRating: 4.76,
				ratingCount: 49,
				reviewCount: 33,
				orderCount: 164,
				tags: ["crab", "seafood", "pasta", "spicy", "tomato"],
				reviews: [
					[4.9, "The crab pasta has real heat and a ton of flavor.", ["crab", "spicy", "pasta"]],
					[4.7, "Bright, spicy, and not too heavy.", ["seafood", "tomato"]],
					[4.6, "Best pasta on the menu for me.", ["pasta", "favorite"]],
				],
			},
			{
				id: "dev_item_harbor_burger",
				name: "Harbor Smash Burger",
				description:
					"Two smashed beef patties, American cheese, onion jam, pickles, comeback sauce, brioche.",
				category: "Burgers",
				price: 20,
				averageRating: 4.62,
				ratingCount: 42,
				reviewCount: 27,
				orderCount: 139,
				tags: ["burger", "smash burger", "cheeseburger", "beef", "brioche", "fries"],
				reviews: [
					[4.8, "A very serious burger for a seafood place.", ["burger", "cheeseburger"]],
					[4.5, "Crispy edges, good sauce, and the onion jam works.", ["smash burger", "beef"]],
				],
			},
			{
				id: "dev_item_harbor_clam_pizza",
				name: "White Clam Pizza",
				description:
					"Thin crust pizza, chopped clams, garlic cream, mozzarella, parsley, lemon.",
				category: "Pizza",
				price: 23,
				averageRating: 4.58,
				ratingCount: 35,
				reviewCount: 22,
				orderCount: 104,
				tags: ["pizza", "clam pizza", "seafood", "garlic", "mozzarella", "white pizza"],
				reviews: [
					[4.7, "The clam pizza is garlicky and crisp.", ["pizza", "seafood"]],
					[4.4, "Different in a good way, especially with a spritz.", ["clam pizza", "garlic"]],
				],
			},
			{
				id: "dev_item_harbor_chocolate_torte",
				name: "Salted Chocolate Torte",
				description:
					"Dark chocolate torte, espresso cream, sea salt, olive oil crumble.",
				category: "Dessert",
				price: 13,
				averageRating: 4.69,
				ratingCount: 31,
				reviewCount: 22,
				orderCount: 96,
				tags: ["chocolate", "dessert", "espresso", "sea salt"],
				reviews: [
					[4.8, "Deep chocolate flavor without being too sweet.", ["dessert", "chocolate"]],
					[4.6, "Espresso cream is the move.", ["espresso", "sweet"]],
				],
			},
			{
				id: "dev_item_harbor_fries",
				name: "Sea Salt Fries",
				description:
					"Crispy hand-cut fries, sea salt, parsley, smoked garlic aioli.",
				category: "Sides",
				price: 10,
				averageRating: 4.57,
				ratingCount: 39,
				reviewCount: 23,
				orderCount: 168,
				tags: ["fries", "side", "crispy", "garlic aioli", "shareable"],
				reviews: [
					[4.8, "The fries are crisp all the way through.", ["fries", "crispy"]],
					[4.4, "Order them with the steak. The aioli is excellent.", ["side", "garlic"]],
				],
			},
			{
				id: "dev_item_harbor_martini",
				name: "Williamsburg Dirty Martini",
				description:
					"Vodka or gin, olive brine, dry vermouth, blue cheese olives.",
				category: "Cocktails",
				price: 17,
				averageRating: 4.82,
				ratingCount: 46,
				reviewCount: 31,
				orderCount: 154,
				tags: ["cocktail", "martini", "vodka", "gin", "olive", "briny"],
				reviews: [
					[4.9, "Cold, briny, and exactly what I wanted with oysters.", ["martini", "briny", "oysters"]],
					[4.7, "Strong without being harsh. Blue cheese olives are a win.", ["cocktail", "olive"]],
				],
			},
			{
				id: "dev_item_harbor_spritz",
				name: "Harbor Spritz",
				description:
					"Aperitivo, sparkling wine, grapefruit, rosemary, soda.",
				category: "Cocktails",
				price: 15,
				averageRating: 4.49,
				ratingCount: 29,
				reviewCount: 18,
				orderCount: 101,
				tags: ["cocktail", "spritz", "sparkling", "grapefruit", "rosemary"],
				reviews: [
					[4.6, "Light, bitter, and easy before dinner.", ["spritz", "grapefruit"]],
					[4.3, "Nice patio drink. The rosemary is subtle.", ["cocktail", "refreshing"]],
				],
			},
		],
	},
	{
		id: "dev_restaurant_sora",
		restaurantName: "Sora SoHo Sushi & Noodle",
		name: "Sora SoHo Sushi & Noodle",
		description:
			"SoHo Japanese spot with sushi rolls, ramen, rice bowls, crispy snacks, and quick repeat-friendly ordering.",
		cuisine: "Japanese Sushi",
		category: "Fast Casual",
		city: "New York",
		state: "NY",
		country: "US",
		area: "SoHo",
		address: "62 Spring St, New York, NY",
		phoneNumber: "+1 212-555-0194",
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
		location: { latitude: 40.7224, longitude: -73.9973 },
		tables: ["Counter 1", "Counter 2", "Table 3", "Table 4"],
		menu: [
			{
				id: "dev_item_sora_daily_miso",
				name: "Daily Special: Spicy Miso Ramen",
				description:
					"Chicken miso broth, chili tare, ground pork, corn, scallion, ajitama.",
				category: "Daily Special",
				isDailySpecial: true,
				price: 18,
				averageRating: 4.84,
				ratingCount: 47,
				reviewCount: 31,
				orderCount: 155,
				tags: ["daily special", "ramen", "miso", "spicy", "pork", "corn"],
				reviews: [
					[4.9, "The spicy miso has real depth without being too heavy.", ["ramen", "miso", "spicy"]],
					[4.7, "Best bowl I tried here so far.", ["daily special", "favorite"]],
				],
			},
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
			{
				id: "dev_item_sora_spicy_tuna_bowl",
				name: "Spicy Tuna Crunch Bowl",
				description:
					"Sushi rice, spicy tuna, cucumber, avocado, tempura crunch, sesame soy.",
				category: "Bowls",
				price: 18,
				averageRating: 4.33,
				ratingCount: 22,
				reviewCount: 14,
				orderCount: 91,
				tags: ["tuna", "seafood", "bowl", "spicy", "avocado"],
				reviews: [
					[4.4, "Good quick lunch bowl. Crunch helps a lot.", ["tuna", "bowl"]],
					[4.1, "Fresh but I wanted more heat.", ["seafood", "spicy"]],
				],
			},
			{
				id: "dev_item_sora_dragon_roll",
				name: "Dragon Roll",
				description:
					"Shrimp tempura, cucumber, avocado, eel sauce, sesame.",
				category: "Sushi",
				price: 17,
				averageRating: 4.69,
				ratingCount: 44,
				reviewCount: 29,
				orderCount: 151,
				tags: ["sushi", "dragon roll", "shrimp tempura", "avocado", "eel sauce"],
				reviews: [
					[4.9, "The dragon roll is fresh and the tempura stays crisp.", ["sushi", "dragon roll"]],
					[4.5, "Good balance of sweet eel sauce and avocado.", ["avocado", "shrimp"]],
				],
			},
			{
				id: "dev_item_sora_omakase",
				name: "Chef's Sushi Set",
				description:
					"Six pieces of nigiri, spicy tuna hand roll, wasabi, ginger, soy.",
				category: "Sushi",
				price: 29,
				averageRating: 4.81,
				ratingCount: 39,
				reviewCount: 26,
				orderCount: 113,
				tags: ["sushi", "nigiri", "tuna", "salmon", "omakase", "hand roll"],
				reviews: [
					[4.9, "Best option if you want to actually judge the sushi quality.", ["sushi", "nigiri"]],
					[4.7, "Clean fish and the hand roll is a nice finish.", ["tuna", "omakase"]],
				],
			},
			{
				id: "dev_item_sora_matcha_cheesecake",
				name: "Matcha Basque Cheesecake",
				description:
					"Burnt cheesecake, matcha cream, toasted sesame brittle.",
				category: "Dessert",
				price: 10,
				averageRating: 4.72,
				ratingCount: 28,
				reviewCount: 19,
				orderCount: 117,
				tags: ["matcha", "dessert", "cheesecake", "sesame"],
				reviews: [
					[4.9, "Creamy, not too sweet, and the matcha is strong.", ["dessert", "matcha"]],
					[4.6, "Unexpectedly the best finish after ramen.", ["cheesecake", "sweet"]],
				],
			},
			{
				id: "dev_item_sora_sunomono",
				name: "Cucumber Sunomono",
				description:
					"Chilled cucumber, rice vinegar, sesame, wakame, ginger.",
				category: "Sides",
				price: 7,
				averageRating: 4.38,
				ratingCount: 19,
				reviewCount: 12,
				orderCount: 66,
				tags: ["cucumber", "side", "sesame", "vinegar", "refreshing"],
				reviews: [
					[4.5, "Nice clean side next to a rich ramen.", ["side", "refreshing"]],
					[4.2, "Simple but exactly what I wanted.", ["cucumber", "sesame"]],
				],
			},
			{
				id: "dev_item_sora_yuzu_lemonade",
				name: "Sparkling Yuzu Lemonade",
				description:
					"Yuzu, lemon, cane sugar, sparkling water, mint.",
				category: "Beverages",
				price: 6,
				averageRating: 4.61,
				ratingCount: 37,
				reviewCount: 24,
				orderCount: 190,
				tags: ["yuzu", "lemonade", "citrus", "sparkling", "non-alcoholic"],
				reviews: [
					[4.7, "Super refreshing with the karaage.", ["yuzu", "refreshing"]],
					[4.5, "Tart in a good way, not syrupy.", ["citrus", "non-alcoholic"]],
				],
			},
			{
				id: "dev_item_sora_sake_highball",
				name: "Sake Ginger Highball",
				description:
					"Junmai sake, ginger, lemon, soda, toasted rice syrup.",
				category: "Cocktails",
				price: 13,
				averageRating: 4.44,
				ratingCount: 25,
				reviewCount: 16,
				orderCount: 84,
				tags: ["cocktail", "sake", "ginger", "highball", "lemon"],
				reviews: [
					[4.6, "Light and crisp. Great with ramen.", ["sake", "ginger"]],
					[4.2, "The toasted rice syrup makes it different.", ["cocktail", "highball"]],
				],
			},
		],
	},
];

const retiredDemoRestaurantIds = ["dev_restaurant_ember"];
const retiredDemoMenuItemIds = [
	"dev_item_ember_burger",
	"dev_item_ember_calamari",
	"dev_item_ember_ribeye",
	// Early Harbor test docs that can distort discovery demos.
	"Xx5XavTRMBuld0bLm1oE",
	"bI6uwm7m26geeyoC03EH",
];

const now = new Date();

function categorySortOrder(category, item = {}) {
	if (item.isDailySpecial) return 0;
	const normalized = String(category || "")
		.trim()
		.toLowerCase();
	if (["daily special", "daily specials", "specials"].includes(normalized)) return 0;
	if (["appetizers", "appetizer", "starters", "starter", "snacks"].includes(normalized)) return 10;
	if (["soups", "salads", "soup", "salad"].includes(normalized)) return 20;
	if (
		[
			"entrees",
			"entree",
			"mains",
			"main",
			"ramen",
			"bowls",
			"bowl",
			"pasta",
			"seafood",
			"grill",
			"steaks",
			"steak",
			"burgers",
			"burger",
			"pizza",
			"sushi",
			"sashimi",
			"nigiri",
			"sandwiches",
			"sandwich",
		].includes(normalized)
	) {
		return 30;
	}
	if (["sides", "side", "extras", "sauces"].includes(normalized)) return 40;
	if (
		[
			"drinks",
			"beverages",
			"cocktails",
			"beer",
			"wine",
			"spirits",
			"non-alcoholic drinks",
			"sodas",
			"juices",
			"coffee",
			"tea",
		].includes(normalized)
	) {
		return 50;
	}
	if (["desserts", "dessert"].includes(normalized)) return 60;
	return 900;
}

function standardMenuCategory(category, item = {}) {
	if (item.isDailySpecial) return "daily_special";
	const normalized = String(category || "")
		.trim()
		.toLowerCase();
	if (["appetizers", "appetizer", "starters", "starter", "snacks"].includes(normalized)) return "appetizer";
	if (["soups", "soup"].includes(normalized)) return "soup";
	if (["salads", "salad"].includes(normalized)) return "salad";
	if (["burgers", "burger"].includes(normalized)) return "burger";
	if (["pizza"].includes(normalized)) return "pizza";
	if (["sushi", "sashimi", "nigiri"].includes(normalized)) return "sushi";
	if (["ramen"].includes(normalized)) return "ramen";
	if (["bowls", "bowl"].includes(normalized)) return "bowl";
	if (["pasta"].includes(normalized)) return "pasta";
	if (["seafood"].includes(normalized)) return "seafood";
	if (["sides", "side", "extras", "sauces"].includes(normalized)) return "side";
	if (["cocktails", "cocktail", "beer", "wine", "spirits"].includes(normalized)) return "alcoholic_drink";
	if (["drinks", "beverages", "sodas", "juices", "coffee", "tea", "non-alcoholic drinks"].includes(normalized)) return "drink";
	if (["desserts", "dessert"].includes(normalized)) return "dessert";
	if (["entrees", "entree", "mains", "main"].includes(normalized)) return "entree";
	return normalized.replace(/[^a-z0-9]+/g, "_") || "other";
}

function uniqueLowerStrings(values) {
	return [...new Set(values.map((value) => String(value || "").toLowerCase()).filter(Boolean))];
}

async function seedRestaurant(token, restaurant) {
	const restaurantData = {
		id: restaurant.id,
		restaurantName: restaurant.restaurantName,
		name: restaurant.name,
		description: restaurant.description,
		cuisine: restaurant.cuisine,
		cuisineType: restaurant.cuisine,
		category: restaurant.category,
		city: restaurant.city,
		state: restaurant.state,
		country: restaurant.country,
		countryCode: restaurant.country,
		area: restaurant.area,
		address: restaurant.address,
		storeNumber: restaurant.storeNumber || "",
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

	for (let menuIndex = 0; menuIndex < restaurant.menu.length; menuIndex += 1) {
		const item = restaurant.menu[menuIndex];
		const tags = item.tags || [];
		const itemImageUrl = item.imageUrl || menuItemImages[item.id] || restaurant.imageUrl;
		const totalRatingSum = Number(
			(item.averageRating * item.ratingCount).toFixed(2),
		);
		const sectionSortOrder = categorySortOrder(item.category, item);
		const standardCategory = standardMenuCategory(item.category, item);
		const verificationStats = {
			locationVerifiedCount: Math.round(item.ratingCount * 0.35),
			scervOrderVerifiedCount: Math.round(item.ratingCount * 0.3),
			receiptVerifiedCount: Math.round(item.ratingCount * 0.1),
			communityReviewCount: Math.max(
				0,
				item.ratingCount -
					Math.round(item.ratingCount * 0.35) -
					Math.round(item.ratingCount * 0.3) -
					Math.round(item.ratingCount * 0.1),
			),
		};
		const scervScore = calculateScervDiscoveryScore({
			...item,
			imageUrl: itemImageUrl,
			verificationStats,
		});
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
			standardCategory,
			reputationSourceMenuItemId: item.id,
			relistedFromMenuItemId: null,
			previousNames: [],
			restaurantName: restaurant.restaurantName,
			name: item.name,
			description: item.description,
			category: item.category,
			categorySortOrder: sectionSortOrder,
			menuSortOrder: item.menuSortOrder || sectionSortOrder * 100 + menuIndex,
			isDailySpecial: item.isDailySpecial === true,
			price: item.price,
			isAvailable: true,
			isDemoSeed: true,
			imageUri: itemImageUrl,
			imageUrl: itemImageUrl,
			ingredientTags: tags.slice(0, 5),
			flavorTags: tags.slice(1, 6),
			dishTypeTags: uniqueLowerStrings([standardCategory, item.category, ...tags]),
			cuisineTags: [restaurant.cuisine.toLowerCase()],
			dietaryTags: tags.includes("vegetarian") ? ["vegetarian"] : [],
			searchKeywords: uniqueLowerStrings([
				item.name,
				item.description,
				item.category,
				standardCategory,
				restaurant.restaurantName,
				restaurant.cuisine,
				restaurant.city,
				restaurant.area,
				...tags,
			]),
			topReviewTags: [...new Set(item.reviews.flatMap((review) => review[2]))],
			reviewHighlight: item.reviews[0] ? item.reviews[0][1] : "",
			topReview: item.reviews[0] ? item.reviews[0][1] : "",
			totalRatingSum,
			ratingCount: item.ratingCount,
			averageRating: item.averageRating,
			reviewCount: item.reviewCount,
			confidenceAdjustedRating: scervScore.confidenceAdjustedRating,
			scervScore: scervScore.score,
			scervScoreComponents: scervScore.components,
			scervScoreVersion: scervScore.version,
			discoveryScore: scervScore.score,
			orderCount: item.orderCount,
			verificationStats,
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
	const token = await getAccessToken();
	for (const restaurantId of retiredDemoRestaurantIds) {
		console.log(`Removing retired demo restaurant ${restaurantId}...`);
		await deleteDoc(token, `restaurants/${restaurantId}`);
	}
	for (const itemId of retiredDemoMenuItemIds) {
		console.log(`Removing retired demo menu item ${itemId}...`);
		await deleteDoc(token, `menuItems/${itemId}`);
	}
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
