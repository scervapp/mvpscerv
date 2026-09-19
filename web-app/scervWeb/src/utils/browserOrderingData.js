import {
	collection,
	doc,
	getDoc,
	getDocs,
	limit,
	query,
	where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../config/firebase";

export const slugify = (value = "") =>
	String(value)
		.trim()
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

const compactRestaurant = (docSnap) => {
	const data = docSnap.data() || {};
	return {
		id: docSnap.id,
		...data,
		displayName: data.restaurantName || data.name || "Restaurant",
		slug:
			data.slug ||
			data.restaurantSlug ||
			data.publicSlug ||
			slugify(data.restaurantName || data.name || docSnap.id),
		imageUrl: data.imageUrl || data.imageUri || "",
	};
};

export const getRestaurantBySlug = async (slug) => {
	const cleanSlug = slugify(slug);
	if (!cleanSlug) return null;

	const directDoc = await getDoc(doc(db, "restaurants", cleanSlug));
	if (directDoc.exists()) {
		return compactRestaurant(directDoc);
	}

	const restaurantRef = collection(db, "restaurants");
	const slugFields = ["slug", "restaurantSlug", "publicSlug"];
	for (const field of slugFields) {
		const snapshot = await getDocs(
			query(restaurantRef, where(field, "==", cleanSlug), limit(1)),
		);
		if (!snapshot.empty) return compactRestaurant(snapshot.docs[0]);
	}

	// Many existing records do not have public slugs yet. For this first web
	// layer, resolve against published restaurant names without requiring a data migration.
	const fallbackSnapshot = await getDocs(query(restaurantRef, limit(150)));
	const match = fallbackSnapshot.docs
		.map(compactRestaurant)
		.find((restaurant) => restaurant.slug === cleanSlug);

	return match || null;
};

export const getMenuForRestaurant = async (restaurantId) => {
	if (!restaurantId) return [];

	const snapshot = await getDocs(
		query(collection(db, "menuItems"), where("restaurantId", "==", restaurantId)),
	);

	return snapshot.docs
		.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
		.filter((item) => item.isActive !== false && item.isAvailable !== false)
		.sort((a, b) => {
			const sectionA = Number(a.categorySortOrder ?? 900);
			const sectionB = Number(b.categorySortOrder ?? 900);
			if (sectionA !== sectionB) return sectionA - sectionB;
			const sortA = Number(a.menuSortOrder ?? 90000);
			const sortB = Number(b.menuSortOrder ?? 90000);
			if (sortA !== sortB) return sortA - sortB;
			return String(a.name || "").localeCompare(String(b.name || ""));
		});
};

export const getTopRatingsForMenuItems = async (menuItems = [], maxItems = 8) => {
	const selectedItems = menuItems
		.filter((item) => Number(item.reviewCount || item.ratingCount || 0) > 0)
		.slice(0, maxItems);

	const ratingPairs = await Promise.all(
		selectedItems.map(async (item) => {
			const snapshot = await getDocs(
				query(collection(db, "menuItems", item.id, "ratings"), limit(3)),
			);

			return [
				item.id,
				snapshot.docs.map((docSnap) => ({
					id: docSnap.id,
					...(docSnap.data() || {}),
				})),
			];
		}),
	);

	return Object.fromEntries(ratingPairs);
};

export const resolveTableToken = async (token) => {
	const cleanToken = String(token || "").trim();
	if (!cleanToken) return null;

	const resolveBrowserTableToken = httpsCallable(
		functions,
		"resolveBrowserTableToken",
	);
	const result = await resolveBrowserTableToken({ token: cleanToken });

	return result.data || null;
};

export const createBrowserTableSession = async (token) => {
	const cleanToken = String(token || "").trim();
	if (!cleanToken) return null;

	const createSession = httpsCallable(functions, "createBrowserTableSession");
	const result = await createSession({ token: cleanToken });

	return result.data || null;
};

export const addBrowserBasketItem = async ({
	sessionId,
	menuItemId,
	quantity = 1,
	notes = "",
}) => {
	const addItem = httpsCallable(functions, "addBrowserBasketItem");
	const result = await addItem({ sessionId, menuItemId, quantity, notes });
	return result.data || null;
};

export const updateBrowserBasketItem = async ({
	sessionId,
	itemId,
	quantity,
}) => {
	const updateItem = httpsCallable(functions, "updateBrowserBasketItem");
	const result = await updateItem({ sessionId, itemId, quantity });
	return result.data || null;
};

export const removeBrowserBasketItem = async ({ sessionId, itemId }) => {
	const removeItem = httpsCallable(functions, "removeBrowserBasketItem");
	const result = await removeItem({ sessionId, itemId });
	return result.data || null;
};

export const submitBrowserBasketToKitchen = async ({
	sessionId,
	idempotencyKey,
}) => {
	const submitBasket = httpsCallable(functions, "submitBrowserBasketToKitchen");
	const result = await submitBasket({ sessionId, idempotencyKey });
	return result.data || null;
};

export const getBrowserOrderStatus = async ({ sessionId }) => {
	const getStatus = httpsCallable(functions, "getBrowserOrderStatus");
	const result = await getStatus({ sessionId });
	return result.data || null;
};

export const createBrowserCheckoutSession = async ({
	sessionId,
	token,
	gratuity = 0,
	returnUrl,
}) => {
	const createCheckout = httpsCallable(functions, "createBrowserCheckoutSession");
	const result = await createCheckout({
		sessionId,
		token,
		gratuity,
		returnUrl,
	});
	return result.data || null;
};

export const syncBrowserCheckoutSession = async ({
	orderId,
	checkoutSessionId,
	sessionId,
}) => {
	const syncCheckout = httpsCallable(functions, "syncBrowserCheckoutSession");
	const result = await syncCheckout({ orderId, checkoutSessionId, sessionId });
	return result.data || null;
};
