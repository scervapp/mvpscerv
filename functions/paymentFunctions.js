// functions/paymentFunctions.js
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { createStripeCustomer } = require("./userFunctions");
const stripe = require("stripe");
const { onCall } = require("firebase-functions/v1/https");
const db = admin.firestore();

const STRIPE_PUBLISHABLE_KEY = defineSecret("STRIPE_PUBLISHABLE_KEY");

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

exports.createPaymentIntent = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY], // Declare required secrets
	})
	.https.onCall(async (data, context) => {
		const stripeSecretKey = STRIPE_SECRET_KEY.value();
		const {
			amount,
			subtotal,
			tax,
			gratuity,
			fee,
			currentUserData,
			restaurantNumber,
			customerId,
			table,
			connectedAccountId,
		} = data;

		try {
			if (isNaN(amount) || amount <= 0) {
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Invalid amount provided"
				);
			}

			const paymentIntent = await stripe(stripeSecretKey).paymentIntents.create(
				{
					amount: amount + fee,
					currency: "usd",
					customer: customerId,
					setup_future_usage: "off_session",
					application_fee_amount: fee,
					transfer_data: {
						destination: connectedAccountId,
					},

					metadata: {
						tax: tax,
						gratuity: gratuity,
						table: table,
						fee,
						subtotal: subtotal,
						purpose: "restaurant payment",
					},
				}
			);

			return { clientSecret: paymentIntent.client_secret };
		} catch (error) {
			console.error("Error creating PaymentIntent: ", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

// Function to allow custome to select cards using setupIntent
exports.createSetupIntent = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY], // Declare required secrets
	})
	.https.onCall(async (data, context) => {
		const stripeSecretKey = STRIPE_SECRET_KEY.value();
		const { customerId } = data;
		try {
			const setupIntent = await stripe(stripeSecretKey).setupIntents.create({
				customer: customerId,
				payment_method_types: ["card"],
			});

			return { clientSecret: setupIntent.client_secret };
		} catch (error) {
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

// Function to fetch the Stripe publishable key from RemoteCinfig(server-side)
exports.getStripePublishableKey = functions
	.runWith({
		secrets: [STRIPE_PUBLISHABLE_KEY],
	})
	.https.onCall(async (data, context) => {
		const stripePublishableKey = STRIPE_PUBLISHABLE_KEY.value();

		try {
			if (!stripePublishableKey) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Stripe Publishable key is not set"
				);
			}
			return { stripePublishableKey };
		} catch (error) {
			console.error(
				"Error fetching stripe publishable key from Remote Config: ",
				error
			);
			throw new functions.https.HttpsError(
				"internal",
				"An error occurred while fetching the Stripe publishable key."
			);
		}
	});

exports.createEphemeralKey = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY],
	})
	.https.onCall(async (data, context) => {
		const { userId, apiVersion, customerId } = data;

		const stripeSecretKey = STRIPE_SECRET_KEY.value();

		try {
			// 2. Retrieve the stripe secret key using secret
			// Create an ephemeral key
			const ephemeralKey = await stripe(stripeSecretKey).ephemeralKeys.create(
				{
					customer: customerId,
				},
				{ apiVersion: apiVersion }
			);

			console.log("EphermeralKey Successfuly created");

			// 4. Return the ephemeral key
			return { ephemeralKey: ephemeralKey.secret };
		} catch (error) {
			console.error("Error creating ephermeral key: ", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});
