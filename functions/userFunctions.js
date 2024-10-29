// functions/paymentFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const stripe = require("stripe");
const db = admin.firestore();

// Define the secret
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

exports.createStripeCustomer = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY],
	})
	.https.onCall(async (data, context) => {
		const stripeSecretKey = STRIPE_SECRET_KEY.value();
		const { userId, email, connectedAccountId } = data;

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
			const customer = await stripe(stripeSecretKey).customers.create({
				email,
			});

			console.log("Customer created successfully", customer.id);
			// 4. Store the Stripe customer ID in firestore
			await db.collection("customers").doc(userId).set(
				{
					stripeCustomerId: customer.id,
				},
				{ merge: true }
			);

			// 5. Return the Stripe customer ID
			return { customerId: customer.id };
		} catch (error) {
			console.error("Error creating Stripe customer: ", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});
