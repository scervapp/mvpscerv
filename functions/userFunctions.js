// functions/paymentFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const stripe = require("stripe");
const db = admin.firestore();

// Define the secret
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

/**
 * An internal helper function to generate a new, unique, sequential restaurant number.
 * It uses a distributed counter to handle potential race conditions.
 * This function is NOT exported as it's only called by other functions.
 * @returns {Promise<number>} A new unique restaurant number.
 */
async function generateUniqueRestaurantNumber() {
	const counterRef = db.collection("appConfig").doc("restaurantCounter");

	try {
		// Run a transaction to atomically increment the counter.
		const newNumber = await db.runTransaction(async (transaction) => {
			const counterDoc = await transaction.get(counterRef);
			let currentNumber = 1000; // Start at 1001 for the first restaurant
			if (counterDoc.exists) {
				currentNumber = counterDoc.data().currentNumber;
			}
			const nextNumber = currentNumber + 1;
			transaction.set(
				counterRef,
				{ currentNumber: nextNumber },
				{ merge: true }
			);
			return nextNumber;
		});
		console.log(`Generated new restaurant number: ${newNumber}`);
		return newNumber;
	} catch (error) {
		console.error("FATAL: Could not generate unique restaurant number.", error);
		// Fallback to a random number to prevent signup from failing completely
		return Math.floor(1000 + Math.random() * 9000);
	}
}

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

/**
 * A callable function to securely create a new user with an email/password.
 * It creates the Firebase Auth user, sets their role as a custom claim,
 * AND creates their corresponding document in the correct Firestore collection.
 * This is now the single source of truth for email/password signups.
 */
exports.createUserAccount = functions.https.onCall(async (data, context) => {
	const { email, password, role, additionalData } = data;

	if (!email || !password || !role || !additionalData) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required fields."
		);
	}

	try {
		const userRecord = await admin.auth().createUser({
			email,
			password,
			displayName:
				`${additionalData.firstName} ${additionalData.lastName}`.trim() ||
				additionalData.restaurantName,
		});

		let collectionName;
		let restaurantId = null;
		let userData = {};

		if (role === "customer") {
			collectionName = "customers";
			userData = { role: "customer" }; // Claims handle the role primarily
		} else if (role === "owner") {
			collectionName = "restaurants";
			restaurantId = userRecord.uid;
			const uniqueNumber = await generateUniqueRestaurantNumber();
			userData = {
				role: "owner",
				onboardingStatus: "pending_profile", // Start of the onboarding funnel
				isLive: false, // Not visible to customers yet
				isTestAccount: true, // Defaults to using test keys
				isOpen: false, // Restaurant starts as closed

				// Operations & Financials
				restaurantNumber: uniqueNumber,
				taxRate: 0.0,
				platformCoverStripeFeeForRestaurant: false,
				stripeAccountId: null, // To be filled in after Stripe onboarding
				stripeAccountStatus: "unverified", // Initial Stripe status

				// Profile & Discovery
				geoPoint: null, // To be filled in from address
				tags: [], // Empty array for future use

				// Original Onboarding Flag
				hasSetupEmployees: false,
			};
		} else {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid role for signup."
			);
		}

		await admin
			.auth()
			.setCustomUserClaims(userRecord.uid, { role, restaurantId });

		const docRef = db.collection(collectionName).doc(userRecord.uid);
		await docRef.set({
			uid: userRecord.uid,
			email,
			...additionalData,
			...userData, // Includes role and the new flag
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		return { success: true, uid: userRecord.uid };
	} catch (error) {
		console.error("Error creating new user account:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
});

/**
 * A trigger that now ONLY handles users created by external providers (like Google Sign-In).
 * It creates their corresponding document in the 'customers' collection.
 */
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
	// This function will now only run for users who do not have an email/password provider.
	const isEmailProvider = user.providerData.some(
		(provider) => provider.providerId === "password"
	);

	if (isEmailProvider) {
		console.log(
			`onUserCreate: Email/password user ${user.uid} was handled by createUserAccount. No action needed.`
		);
		return null;
	}

	// This logic now only runs for users from Google, etc.
	console.log(
		`onUserCreate: New federated user created: ${user.uid}. Assigning 'customer' role.`
	);

	await admin.auth().setCustomUserClaims(user.uid, { role: "customer" });

	const userDocRef = db.collection("customers").doc(user.uid);
	await userDocRef.set(
		{
			uid: user.uid,
			email: user.email,
			displayName: user.displayName || "",
			firstName: user.displayName.split(" ")[0] || "",
			lastName: user.displayName.split(" ")[1] || "",
			role: "customer",
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		},
		{ merge: true }
	); // Use merge to avoid overwriting if a doc somehow exists

	return null;
});

/**
 * A callable function to set a user's role. This should only be called
 * by an authorized admin/owner from a secure environment (like your employee management screen).
 * This replaces the need for the old setEmployeeRole function as it's more generic.
 */
exports.setUserRole = functions.https.onCall(async (data, context) => {
	if (
		!context.auth ||
		!["owner", "manager"].includes(context.auth.token.role)
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You must be an owner or manager to change roles."
		);
	}
	const { targetUserId, role, restaurantId } = data;
	if (!targetUserId || !role || !restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Target user, role, and restaurantId are required."
		);
	}

	try {
		await admin
			.auth()
			.setCustomUserClaims(targetUserId, { role, restaurantId });
		// Also update Firestore for consistency
		const userRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(targetUserId);
		await userRef.update({ role });

		return {
			success: true,
			message: `Role for ${targetUserId} updated to ${role}.`,
		};
	} catch (error) {
		console.error("Error setting user role:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Could not set user role."
		);
	}
});
