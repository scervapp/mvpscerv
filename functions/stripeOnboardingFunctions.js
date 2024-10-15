// functions/paymentFunctions.js
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const stripe = require("stripe");
const { onCall } = require("firebase-functions/v1/https");
const db = admin.firestore();

const STRIPE_PUBLISHABLE_KEY = defineSecret("STRIPE_PUBLISHABLE_KEY");

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

exports.createConnectedAccount = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY],
	})
	.https.onCall(async (currentUserData, context) => {
		const stripeSecretKey = STRIPE_SECRET_KEY.value();

		try {
			// create c onnected account
			const account = await stripe(stripeSecretKey).accounts.create({
				type: "express",
				country: "US",
				email: currentUserData.email,
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
		secrets: [STRIPE_SECRET_KEY],
	})
	.https.onCall(async (data, context) => {
		const stripeSecretKey = STRIPE_SECRET_KEY.value();
		const { accountId } = data;

		try {
			// create a login link for the connected account
			const loginLink = await stripe(stripeSecretKey).accounts.createLoginLink(
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
		secrets: [STRIPE_SECRET_KEY],
	})
	.https.onCall(async (data, context) => {
		const stripeSecretKey = STRIPE_SECRET_KEY.value();
		const { accountId } = data;

		try {
			// Retrieve the connected account to check its status
			const account = await stripe(stripeSecretKey).accounts.retrieve(
				accountId
			);

			// Check if the account is fully onboarded
			const isOnboarded = account.charges_enabled && account.details_submitted;

			// if not onbaorded, create a new account link
			let accountLinkUrl = null;
			if (!isOnboarded) {
				const accountLink = await stripe(stripeSecretKey).accountLinks.create({
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
