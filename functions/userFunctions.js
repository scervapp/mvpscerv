// functions/paymentFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe");

exports.createStripeCustomer = functions.https.onCall(async (data, context) => {
	const { userId, email } = data;

	try {
		// 1. Input validation
		if (!context.auth || !context.auth.uid || context.auth.uid !== userId) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated"
			);
		}

		if (!email || typeof email !== "string" || email.trim() === "") {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid email provided"
			);
		}

        // 2. Retrieve the Stripekey
        
	} catch (error) {}
});
