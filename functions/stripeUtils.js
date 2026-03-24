const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const db = admin.firestore();

// These are now your GLOBAL Scerv Keys
const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");

/**
 * @function getStripeKeys
 * @description Determines whether to use Scerv's Live or Test keys based on the
 * restaurant's staging environment.
 */
const getStripeKeys = async (restaurantId) => {
	try {
		if (!restaurantId) throw new Error("Restaurant ID is required.");

		const restaurantDoc = await db
			.collection("restaurants")
			.doc(restaurantId)
			.get();
		if (!restaurantDoc.exists)
			throw new Error(`Restaurant not found for ID: ${restaurantId}`);

		// If true, the app uses Scerv's Test Keys for this specific restaurant's checkout
		const isTestAccount = restaurantDoc.data().isTestAccount !== false;

		return {
			publishableKey: isTestAccount
				? STRIPE_PUBLISHABLE_KEY_TEST.value()
				: STRIPE_PUBLISHABLE_KEY_LIVE.value(),
			stripeSecretKey: isTestAccount
				? STRIPE_SECRET_KEY_TEST.value()
				: STRIPE_SECRET_KEY_LIVE.value(),
			isTestMode: isTestAccount, // Pass this back to simplify downstream logic
		};
	} catch (error) {
		console.error("Error fetching Stripe keys: ", error);
		throw new Error("Failed to fetch Stripe keys");
	}
};

/**
 * @function createStripeCustomerHelper
 * @description Creates a permanent Stripe Customer profile on Scerv's global account for vaulting cards.
 */
const createStripeCustomerHelper = async (
	userId,
	restaurantId,
	stripeInstance,
) => {
	const userDocRef = db.collection("customers").doc(userId);
	const userDoc = await userDocRef.get();

	if (!userDoc.exists) {
		throw new functions.https.HttpsError(
			"not-found",
			"Customer profile not found.",
		);
	}

	const userData = userDoc.data();
	// Added fallbacks to prevent the Cloud Function from crashing if a user skips onboarding
	const phoneNumber = userData.phoneNumber || "0000000000";
	const name =
		`${userData.firstName || "Scerv"} ${userData.lastName || "Guest"}`.trim();

	// Create the Stripe Customer on your Global Account
	const customer = await stripeInstance.customers.create({
		phone: `+1${phoneNumber}`,
		name: name,
		metadata: { firebaseUID: userId },
	});

	console.log(`✅ Successfully created Scerv Stripe customer: ${customer.id}`);

	// Determine which field to save it to (keeps test & live databases perfectly clean)
	const { isTestMode } = await getStripeKeys(restaurantId);
	const customerIdField = isTestMode
		? "stripeCustomerId_test"
		: "stripeCustomerId_live";

	await userDocRef.update({ [customerIdField]: customer.id });

	return customer.id;
};

module.exports = { getStripeKeys, createStripeCustomerHelper };
