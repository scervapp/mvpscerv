// functions/paymentFunctions.js
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const stripe = require("stripe");

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
			customerId,
			restaurantNumber,
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
					amount,
					currency: "usd",
					automatic_payment_methods: {
						enabled: true,
					},
					metadata: {
						subtotal,
						tax,
						fee,
						gratuity,
						customerId,
						restaurantNumber,
					},
				}
			);

			return { clientSecret: paymentIntent.client_secret };
		} catch (error) {
			console.error("Error creating PaymentIntent: ", error);
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
