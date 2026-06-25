const normalize = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

const titleCase = (value) =>
	String(value || "")
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

const DISCOVERY_LABEL_RULES = [
	{ label: "Calamari", terms: ["calamari"] },
	{ label: "Burgers", terms: ["burger", "cheeseburger", "smash burger"] },
	{ label: "Pizza", terms: ["pizza"] },
	{ label: "Sushi", terms: ["sushi", "nigiri", "sashimi", "dragon roll", "omakase", "hand roll"] },
	{ label: "Ramen", terms: ["ramen", "tonkotsu", "miso ramen"] },
	{ label: "Fried Chicken", terms: ["fried chicken", "karaage", "chicken wings", "buffalo wings"] },
	{ label: "Wings", terms: ["wings"] },
	{ label: "Oysters", terms: ["oyster", "oysters"] },
	{ label: "Lobster", terms: ["lobster", "lobster roll"] },
	{ label: "Salmon", terms: ["salmon"] },
	{ label: "Steak", terms: ["steak", "steak frites"] },
	{ label: "Pasta", terms: ["pasta", "campanelle"] },
	{ label: "Fries", terms: ["fries", "frites"] },
	{ label: "Salads", terms: ["salad", "salads"] },
	{ label: "Cocktails", terms: ["cocktail", "martini", "spritz", "margarita", "mojito", "highball"] },
	{ label: "Seafood", terms: ["seafood", "shrimp", "crab", "clam", "snapper", "octopus"] },
	{ label: "Desserts", terms: ["dessert", "desserts", "tiramisu", "cake", "cheesecake", "chocolate"] },
];

const STANDARD_CATEGORY_LABELS = {
	appetizer: "Appetizers",
	alcoholic_drink: "Cocktails",
	bowl: "Bowls",
	burger: "Burgers",
	dessert: "Desserts",
	drink: "Drinks",
	entree: "Entrees",
	pasta: "Pasta",
	pizza: "Pizza",
	ramen: "Ramen",
	salad: "Salads",
	seafood: "Seafood",
	side: "Sides",
	soup: "Soups",
	sushi: "Sushi",
};

export const getDiscoveryDishLabel = (menuItem = {}) => {
	if (!menuItem) return "Menu item";
	if (menuItem.discoveryLabel || menuItem.displayCategory) {
		return menuItem.discoveryLabel || menuItem.displayCategory;
	}

	const searchableValues = [
		menuItem.standardCategory,
		menuItem.category,
		menuItem.name,
		menuItem.dishName,
		menuItem.description,
		...(Array.isArray(menuItem.dishTypeTags) ? menuItem.dishTypeTags : []),
		...(Array.isArray(menuItem.searchKeywords) ? menuItem.searchKeywords : []),
		...(Array.isArray(menuItem.ingredientTags) ? menuItem.ingredientTags : []),
		...(Array.isArray(menuItem.flavorTags) ? menuItem.flavorTags : []),
		...(Array.isArray(menuItem.topReviewTags) ? menuItem.topReviewTags : []),
	];
	const searchableText = searchableValues.map(normalize).join(" ");

	const matchedRule = DISCOVERY_LABEL_RULES.find((rule) =>
		rule.terms.some((term) => searchableText.includes(term)),
	);
	if (matchedRule) return matchedRule.label;

	const standardCategory = normalize(menuItem.standardCategory);
	if (STANDARD_CATEGORY_LABELS[standardCategory]) {
		return STANDARD_CATEGORY_LABELS[standardCategory];
	}

	return titleCase(menuItem.category || menuItem.name || menuItem.dishName || "Menu item");
};
