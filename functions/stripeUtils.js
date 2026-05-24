const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const db = admin.firestore();

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");

const normalizePhoneForStripe = (phoneNumber) => {
	const rawPhone = String(phoneNumber || "").trim();
	if (!rawPhone) return undefined;
	return rawPhone.startsWith("+") ? rawPhone : `+1${rawPhone}`;
};

const getCustomerName = (userData = {}) =>
	userData.fullName ||
	`${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
	userData.displayName ||
	"Scerv Guest";

const getCustomerUpdatePayload = (userData = {}) => ({
	...(userData.email && { email: userData.email }),
	...(userData.phoneNumber && {
		phone: normalizePhoneForStripe(userData.phoneNumber),
	}),
	name: getCustomerName(userData),
});

const getStripeModeConfig = (mode) => {
	const isLiveMode = mode === "live";
	return {
		mode: isLiveMode ? "live" : "test",
		secretKey: isLiveMode
			? STRIPE_SECRET_KEY_LIVE.value()
			: STRIPE_SECRET_KEY_TEST.value(),
		customerIdField: isLiveMode
			? "stripeCustomerId_live"
			: "stripeCustomerId_test",
	};
};

/**
 * Determines whether to use Scerv's live or test keys based on the restaurant.
 */
const getStripeKeys = async (restaurantId) => {
	try {
		if (!restaurantId) throw new Error("Restaurant ID is required.");

		const restaurantDoc = await db
			.collection("restaurants")
			.doc(restaurantId)
			.get();
		if (!restaurantDoc.exists) {
			throw new Error(`Restaurant not found for ID: ${restaurantId}`);
		}

		const isTestAccount = restaurantDoc.data().isTestAccount !== false;

		return {
			publishableKey: isTestAccount
				? STRIPE_PUBLISHABLE_KEY_TEST.value()
				: STRIPE_PUBLISHABLE_KEY_LIVE.value(),
			stripeSecretKey: isTestAccount
				? STRIPE_SECRET_KEY_TEST.value()
				: STRIPE_SECRET_KEY_LIVE.value(),
			isTestMode: isTestAccount,
		};
	} catch (error) {
		console.error("Error fetching Stripe keys: ", error);
		throw new Error("Failed to fetch Stripe keys");
	}
};

const ensureStripeCustomerForMode = async (
	userId,
	mode = "test",
	stripeInstance = null,
) => {
	const userDocRef = db.collection("customers").doc(userId);
	const userDoc = await userDocRef.get();

	if (!userDoc.exists) {
		throw new functions.https.HttpsError(
			"not-found",
			"Customer profile not found.",
		);
	}

	const userData = userDoc.data() || {};
	const { secretKey, customerIdField } = getStripeModeConfig(mode);
	const activeStripeInstance =
		stripeInstance || require("stripe")(secretKey, { apiVersion: "2024-04-10" });
	const existingCustomerId = userData[customerIdField];

	if (existingCustomerId) {
		try {
			const existingCustomer =
				await activeStripeInstance.customers.retrieve(existingCustomerId);
			if (existingCustomer && existingCustomer.deleted) {
				throw Object.assign(new Error("Stored Stripe customer was deleted."), {
					code: "resource_missing",
				});
			}
			await activeStripeInstance.customers.update(
				existingCustomerId,
				getCustomerUpdatePayload(userData),
			);
			return existingCustomerId;
		} catch (error) {
			if (error.code !== "resource_missing") throw error;
			console.warn(
				`Stored Stripe customer ${existingCustomerId} missing for ${userId}; recreating.`,
			);
		}
	}

	try {
		const searchResult = await activeStripeInstance.customers.search({
			query: `metadata['firebaseUID']:'${userId}' AND metadata['environment']:'${mode}'`,
			limit: 1,
		});
		const matchedCustomer = searchResult.data && searchResult.data[0];

		if (matchedCustomer && !matchedCustomer.deleted) {
			await activeStripeInstance.customers.update(
				matchedCustomer.id,
				getCustomerUpdatePayload(userData),
			);
			await userDocRef.set(
				{
					[customerIdField]: matchedCustomer.id,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);
			console.log(
				`Reused existing Scerv Stripe customer ${matchedCustomer.id} for ${userId}.`,
			);
			return matchedCustomer.id;
		}
	} catch (searchError) {
		console.warn(
			`Could not search Stripe customers for ${userId}; falling back to create.`,
			searchError,
		);
	}

	const customer = await activeStripeInstance.customers.create(
		{
			...getCustomerUpdatePayload(userData),
			metadata: {
				firebaseUID: userId,
				scervCustomerId: userId,
				environment: mode === "live" ? "live" : "test",
			},
		},
		{ idempotencyKey: `stripeCustomer:${mode}:${userId}` },
	);

	console.log(`Successfully ensured Scerv Stripe customer: ${customer.id}`);

	await userDocRef.set(
		{
			[customerIdField]: customer.id,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		},
		{ merge: true },
	);

	return customer.id;
};

/**
 * Backwards-compatible helper used by existing payment code.
 */
const createStripeCustomerHelper = async (
	userId,
	restaurantId,
	stripeInstance,
) => {
	const { isTestMode } = await getStripeKeys(restaurantId);
	const mode = isTestMode ? "test" : "live";
	return ensureStripeCustomerForMode(userId, mode, stripeInstance);
};

const ensureStripeCustomersForCustomer = async (userId, options = {}) => {
	const modes = options.modes || ["test", "live"];
	const results = {};

	for (const mode of modes) {
		try {
			results[mode] = await ensureStripeCustomerForMode(userId, mode);
		} catch (error) {
			if (!options.bestEffort) throw error;
			console.warn(
				`Could not create ${mode} Stripe customer for ${userId}:`,
				error,
			);
			results[mode] = null;
		}
	}

	return results;
};

module.exports = {
	getStripeKeys,
	createStripeCustomerHelper,
	ensureStripeCustomerForMode,
	ensureStripeCustomersForCustomer,
};
