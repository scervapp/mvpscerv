const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const db = admin.firestore();

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");

/**
 * A shared helper function to determine which Stripe keys to use
 * based on the restaurant's `isTestAccount` flag.
 * @param {string} restaurantId The UID of the restaurant.
 * @returns {Promise<{publishableKey: string, stripeSecretKey: string}>}
 */
const getStripeKeys = async (restaurantId) => {
	try {
		if (!restaurantId) {
			throw new Error("Restaurant ID is required to get Stripe keys.");
		}
		const restaurantDoc = await db
			.collection("restaurants")
			.doc(restaurantId)
			.get();
		if (!restaurantDoc.exists) {
			throw new Error(`Restaurant not found for ID: ${restaurantId}`);
		}

		const isTestAccount = restaurantDoc.data().isTestAccount !== false; // Default to true if undefined

		const keys = {
			publishableKey: isTestAccount
				? STRIPE_PUBLISHABLE_KEY_TEST.value()
				: STRIPE_PUBLISHABLE_KEY_LIVE.value(),
			stripeSecretKey: isTestAccount
				? STRIPE_SECRET_KEY_TEST.value()
				: STRIPE_SECRET_KEY_LIVE.value(),
		};

		return keys;
	} catch (error) {
		console.error("Error fetching Stripe keys: ", error);
		throw new Error("Failed to fetch Stripe keys");
	}
};

// Export the function so other files can use it
module.exports = { getStripeKeys };
