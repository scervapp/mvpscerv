const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const stripe = require("stripe");
const { onCall } = require("firebase-functions/v1/https");
const { getStripeKeys } = require("./stripeUtils");

const db = admin.firestore();

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");

const normalizeCountryCode = (value) => {
	const normalized = String(value || "")
		.trim()
		.toUpperCase();
	if (normalized === "USA" || normalized === "UNITED STATES") return "US";
	return normalized || "US";
};

const assertRestaurantOwner = async (context, restaurantId) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"You must be signed in to manage Stripe onboarding.",
		);
	}

	const resolvedRestaurantId = restaurantId || context.auth.uid;
	if (context.auth.uid !== resolvedRestaurantId) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You can only manage Stripe onboarding for your own restaurant.",
		);
	}

	const restaurantRef = db.collection("restaurants").doc(resolvedRestaurantId);
	const restaurantDoc = await restaurantRef.get();

	if (!restaurantDoc.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}

	return {
		restaurantId: resolvedRestaurantId,
		restaurantRef,
		restaurantData: restaurantDoc.data() || {},
	};
};

const createOnboardingLink = async (stripeInstance, accountId) => {
	const accountLink = await stripeInstance.accountLinks.create({
		account: accountId,
		refresh_url: "https://www.scerv.com/onboarding/refresh",
		return_url: "https://www.scerv.com/onboarding/return",
		type: "account_onboarding",
	});

	return accountLink.url;
};

const getStripeMode = (keys = {}) => (keys.isTestMode ? "test" : "live");

const getStripeAccountIdField = (mode) =>
	mode === "live" ? "stripeAccountId_live" : "stripeAccountId_test";

const getStripeStatusField = (mode) =>
	mode === "live" ? "stripeAccountStatus_live" : "stripeAccountStatus_test";

const getModeAwareStripeAccountId = (restaurantData = {}, mode = "test") => {
	const modeSpecificId = restaurantData[getStripeAccountIdField(mode)];
	if (modeSpecificId) return modeSpecificId;

	const legacyMode = restaurantData.stripeAccountMode;
	const legacyId = restaurantData.stripeAccountId;
	if (legacyId && (!legacyMode || legacyMode === mode)) return legacyId;

	return null;
};

const buildStripeAccountPatch = ({
	account,
	mode,
	status = "pending",
	isOnboarded = false,
}) => ({
	[getStripeAccountIdField(mode)]: account.id,
	[getStripeStatusField(mode)]: status,
	stripeAccountId: account.id,
	stripeAccountStatus: status,
	stripeAccountMode: mode,
	canAcceptPayments: isOnboarded && account.charges_enabled === true,
	stripeChargesEnabled: account.charges_enabled === true,
	stripeDetailsSubmitted: account.details_submitted === true,
	stripePayoutsEnabled: account.payouts_enabled === true,
	stripeCapabilities: {
		card_payments: account.capabilities.card_payments || null,
		transfers: account.capabilities.transfers || null,
	},
	updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

const createStripeAccountForRestaurant = async ({
	stripeInstance,
	restaurantId,
	restaurantRef,
	restaurantData,
	context,
	mode,
}) => {
	const country = normalizeCountryCode(
		restaurantData.countryCode || restaurantData.country,
	);
	const account = await stripeInstance.accounts.create({
		type: "express",
		country,
		email: restaurantData.email || context.auth.token.email || undefined,
		capabilities: {
			card_payments: { requested: true },
			transfers: { requested: true },
		},
		business_profile: {
			name:
				restaurantData.restaurantName ||
				restaurantData.businessName ||
				restaurantData.name ||
				undefined,
		},
		metadata: {
			restaurantId,
			firebaseUID: context.auth.uid,
			scervEnvironment: mode,
		},
	});

	await restaurantRef.update({
		...buildStripeAccountPatch({
			account,
			mode,
			status: "pending",
			isOnboarded: false,
		}),
		canAcceptPayments: false,
		stripeOnboardingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
	});

	return account;
};

const ensureConnectedAccountForMode = async ({
	stripeInstance,
	restaurantId,
	restaurantRef,
	restaurantData,
	context,
	mode,
}) => {
	const existingAccountId = getModeAwareStripeAccountId(restaurantData, mode);
	if (existingAccountId) {
		return {
			accountId: existingAccountId,
			reusedExistingAccount: true,
		};
	}

	const account = await createStripeAccountForRestaurant({
		stripeInstance,
		restaurantId,
		restaurantRef,
		restaurantData,
		context,
		mode,
	});

	return {
		accountId: account.id,
		reusedExistingAccount: false,
	};
};

const toStripeOnboardingError = (error) => {
	const message = error && error.message ? error.message : "";
	if (
		message.includes("signed up for Connect") ||
		message.includes("dashboard.stripe.com/connect")
	) {
		return new functions.https.HttpsError(
			"failed-precondition",
			"Scerv's Stripe platform account must be enrolled in Stripe Connect before restaurants can initialize payout accounts. Open https://dashboard.stripe.com/connect with the same Stripe account used by the configured API key, finish Connect setup, then try again.",
		);
	}

	return new functions.https.HttpsError("internal", message || "Stripe error.");
};

exports.createConnectedAccount = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		const {
			restaurantId,
			restaurantRef,
			restaurantData,
		} = await assertRestaurantOwner(context, data && data.restaurantId);
		const keys = await getStripeKeys(restaurantId);
		const stripeSecretKey = keys.stripeSecretKey;
		const stripeInstance = stripe(stripeSecretKey);
		const mode = getStripeMode(keys);

		try {
			const accountResult = await ensureConnectedAccountForMode({
				stripeInstance,
				restaurantId,
				restaurantRef,
				restaurantData,
				context,
				mode,
			});

			const accountLinkUrl = await createOnboardingLink(
				stripeInstance,
				accountResult.accountId,
			);

			return {
				accountId: accountResult.accountId,
				url: accountLinkUrl,
				accountLinkUrl,
				reusedExistingAccount: accountResult.reusedExistingAccount,
			};
		} catch (error) {
			console.error("Error creating connected account:", error);
			throw toStripeOnboardingError(error);
		}
	});

exports.createLoginLink = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		const { accountId, restaurantId } = data;
		const { restaurantData } = await assertRestaurantOwner(context, restaurantId);
		const keys = await getStripeKeys(restaurantId);
		const mode = getStripeMode(keys);
		const expectedAccountId = getModeAwareStripeAccountId(
			restaurantData,
			mode,
		);

		if (!accountId || expectedAccountId !== accountId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Stripe account does not belong to this restaurant.",
			);
		}

		const stripeSecretKey = keys.stripeSecretKey;
		const stripeInstance = stripe(stripeSecretKey);

		try {
			// create a login link for the connected account
			const loginLink = await stripeInstance.accounts.createLoginLink(
				accountId
			);

			return { url: loginLink.url };
		} catch (error) {
			console.error("Error creating connected account:", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

exports.checkOnboardingStatus = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		const { accountId, restaurantId } = data;
		const { restaurantRef, restaurantData } = await assertRestaurantOwner(
			context,
			restaurantId,
		);
		const keys = await getStripeKeys(restaurantId);
		const mode = getStripeMode(keys);
		const expectedAccountId = getModeAwareStripeAccountId(
			restaurantData,
			mode,
		);

		if (!accountId || expectedAccountId !== accountId) {
			const legacyMode = restaurantData.stripeAccountMode;
			const legacyAccountId = restaurantData.stripeAccountId;
			if (legacyAccountId === accountId && legacyMode && legacyMode !== mode) {
				try {
					const stripeInstance = stripe(keys.stripeSecretKey);
					const accountResult = await ensureConnectedAccountForMode({
						stripeInstance,
						restaurantId,
						restaurantRef,
						restaurantData,
						context,
						mode,
					});
					const accountLinkUrl = await createOnboardingLink(
						stripeInstance,
						accountResult.accountId,
					);
					return {
						isOnboarded: false,
						accountId: accountResult.accountId,
						accountLinkUrl,
						reusedExistingAccount: accountResult.reusedExistingAccount,
						createdForMode: mode,
					};
				} catch (error) {
					console.error("Error creating mode-aware connected account:", error);
					throw toStripeOnboardingError(error);
				}
			}

			throw new functions.https.HttpsError(
				"permission-denied",
				"Stripe account does not belong to this restaurant.",
			);
		}

		const stripeInstance = stripe(keys.stripeSecretKey);

		try {
			// Retrieve the connected account to check its status
			const account = await stripeInstance.accounts.retrieve(accountId);

			// Check if the account is fully onboarded
			const isOnboarded =
				account.requirements.currently_due.length === 0 &&
				account.requirements.eventually_due.length === 0 &&
				account.charges_enabled;

			console.log(
				`Onboarding Check Result: charges_enabled: ${account.charges_enabled}, currently_due: ${account.requirements.currently_due.length}, eventually_due: ${account.requirements.eventually_due.length}. Final isOnboarded status: ${isOnboarded}`
			);

			await restaurantRef.update({
				...buildStripeAccountPatch({
					account,
					mode,
					status: isOnboarded ? "verified" : "pending",
					isOnboarded,
				}),
				stripeRequirementsCurrentlyDue:
					account.requirements.currently_due || [],
				stripeRequirementsEventuallyDue:
					account.requirements.eventually_due || [],
			});

			if (isOnboarded) {
				await restaurantRef.update({
					onboardingStatus: "pending_menu",
				});
			}

			// if not onbaorded, create a new account link
			let accountLinkUrl = null;
			if (!isOnboarded) {
				accountLinkUrl = await createOnboardingLink(stripeInstance, accountId);
			}

			return {
				isOnboarded,
				accountLinkUrl, // send back the url if onboarding is required
			};
		} catch (error) {
			console.error("Error creating connected account:", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});
