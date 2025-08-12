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

/**
 * @function createStripeCustomerHelper
 * @description Reusable helper to create a Stripe Customer using phone and name
 * from Firestore and save the new ID to the correct live/test field.
 *
 * @param {string} userId - The Firebase UID of the user.
 * @param {string} restaurantId - The ID of the restaurant to determine live/test mode.
 * @param {object} stripeInstance - The initialized Stripe instance (live or test).
 * @returns {Promise<string>} The new Stripe Customer ID.
 */
const createStripeCustomerHelper = async (
	userId,
	restaurantId,
	stripeInstance
) => {
	const userDocRef = db.collection("customers").doc(userId);
	const userDoc = await userDocRef.get();
	if (!userDoc.exists) {
		throw new functions.https.HttpsError(
			"not-found",
			"Customer profile not found."
		);
	}

	const userData = userDoc.data();
	const phoneNumber = userData.phoneNumber;
	const name = `${userData.firstName || ""} ${userData.lastName || ""}`.trim();

	if (!phoneNumber) {
		throw new functions.https.HttpsError(
			"failed-precondition",
			"User profile is missing a phone number."
		);
	}

	// Create the Stripe Customer using the data from Firestore
	const customer = await stripeInstance.customers.create({
		phone: `+1${phoneNumber}`, // Assumes US numbers, adjust if needed
		name: name,
		metadata: { firebaseUID: userId },
	});

	console.log(`Successfully created new Stripe customer: ${customer.id}`);

	// Determine if we are in live or test mode to save to the correct field
	const keys = await getStripeKeys(restaurantId);

	// A reliable way to check the mode is to see if the key contains "_test_"
	const isLiveMode = !keys.publishableKey.includes("_test_");

	const customerIdField = isLiveMode
		? "stripeCustomerId_live"
		: "stripeCustomerId_test";

	// Save the new ID back to the user's document in Firestore
	await userDocRef.update({ [customerIdField]: customer.id });

	return customer.id; // Return the new ID
};

// Export the function so other files can use it
module.exports = { getStripeKeys, createStripeCustomerHelper };
