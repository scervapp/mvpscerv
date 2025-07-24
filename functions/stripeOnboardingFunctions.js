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

exports.createConnectedAccount = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
		],
	})
	.https.onCall(async (currentUserData, context) => {
		const restaurantId = currentUserData.uid;
		const keys = await getStripeKeys(restaurantId);
		const stripeSecretKey = keys.stripeSecretKey;
		const stripeInstance = stripe(stripeSecretKey);

		try {
			// create c onnected account
			const account = await stripeInstance.accounts.create({
				type: "express",
				country: "US",
				email: currentUserData.email,
				capabilities: {
					card_payments: { requested: true },
					transfers: { requested: true },
				},
			});

			// Store the account ID in the DB
			await db.collection("restaurants").doc(currentUserData.uid).update({
				stripeAccountId: account.id,
			});
			// Check if links exist and have atleast one url
			let accountUrl = null;
			if (account.links && account.links.length > 0) {
				accountUrl = account.links[0].url;
			}

			return { accountId: account.id, url: accountUrl };
		} catch (error) {
			console.error("Error creating connected account:", error);
			throw new functions.https.HttpsError("internal", error.message);
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

		const keys = await getStripeKeys(restaurantId);
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
		const keys = await getStripeKeys(restaurantId);
		const stripeInstance = stripe(keys.stripeSecretKey);

		try {
			// Retrieve the connected account to check its status
			const account = await stripeInstance.accounts.retrieve(accountId);

			// Check if the account is fully onboarded
			const isOnboarded =
				account.requirements.currently_due.length === 0 &&
				account.charges_enabled;

			// if not onbaorded, create a new account link
			let accountLinkUrl = null;
			if (!isOnboarded) {
				const accountLink = await stripeInstance.accountLinks.create({
					account: accountId,
					refresh_url: "https://www.scerv.com/onboarding/refresh",
					return_url: "https://www.scerv.com/onboarding/return",
					type: "account_onboarding",
				});
				accountLinkUrl = accountLink.url;
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
