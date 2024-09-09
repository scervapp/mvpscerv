// functions/paymentFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe");

const stripePublishableKey = functions.config().stripe.publishable_key;

const stripeSecretKey = functions.config().stripe.secret_key;

exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
	const { amount, subtotal, tax, gratuity, fee, customerId, restaurantNumber } =
		data;
	try {
		if (isNaN(amount) || amount <= 0) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid amount provided"
			);
		}

		const paymentIntent = await stripe(stripeSecretKey).paymentIntents.create({
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
		});

		return { clientSecret: paymentIntent.client_secret };
	} catch (error) {
		console.error("Error creating PaymentIntent: ", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
});

// Function to fetch the Stripe publishable key from RemoteCinfig(server-side)
exports.getStripePublishableKey = functions.https.onCall(
	async (data, context) => {
		try {
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
	}
);
