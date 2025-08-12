// functions/paymentFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const stripe = require("stripe");
const { getStripeKeys } = require("./stripeUtils");
const db = admin.firestore();

// Define the secret
const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const STRIPE_WEBHOOK_SECRET_TEST = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");
const STRIPE_WEBHOOK_SECRET_LIVE = defineSecret("STRIPE_WEBHOOK_SECRET_LIVE");

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
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		if (
			!context.auth ||
			!context.auth.uid ||
			context.auth.uid !== data.userId
		) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated."
			);
		}
		const { userId, restaurantId } = data;
		if (!userId || !restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"User ID and Restaurant ID are required."
			);
		}

		try {
			const keys = await getStripeKeys(restaurantId);
			const stripeInstance = stripe(keys.stripeSecretKey);
			const isLiveMode = !keys.publishableKey.includes("_test_");

			const userDocRef = db.collection("customers").doc(userId);
			const userDoc = await userDocRef.get();
			if (!userDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Customer profile not found."
				);
			}
			const userData = userDoc.data();
			const phoneNumber = userData.phoneNumber;
			const name = `${userData.firstName} ${userData.lastName}`.trim();

			if (!phoneNumber) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"User profile is missing a phone number."
				);
			}

			// 2. Retrieve the Stripekey
			const customer = await stripeInstance.customers.create({
				phone: `+1${phoneNumber}`, // Use the phone number from Firestore
				name: name,
			});

			console.log(
				`Successfully created new ${
					isLiveMode ? "LIVE" : "TEST"
				} Stripe customer: ${customer.id}`
			);

			// 4. Store the new Stripe Customer ID back into the user's document
			const customerIdField = isLiveMode
				? "stripeCustomerId_live"
				: "stripeCustomerId_test";

			await userDocRef.update({ [customerIdField]: customer.id });

			// 5. Return the new customer ID
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
	const isEmailProvider = user.providerData.some(
		(provider) => provider.providerId === "password"
	);

	if (isEmailProvider) {
		console.log(
			`onUserCreate: Email/password user ${user.uid} was handled by createUserAccount. No action needed.`
		);
		return null;
	}

	// --- THIS IS THE FIX ---
	// This logic now correctly handles users from any non-password provider (Phone, Google, etc.).
	console.log(
		`onUserCreate: New non-email user created: ${user.uid}. Assigning 'customer' role.`
	);

	// 1. Set the custom role claim for the user.
	await admin.auth().setCustomUserClaims(user.uid, { role: "customer" });

	// 2. Prepare the data for the new customer document.
	const userDocRef = db.collection("customers").doc(user.uid);
	const userData = {
		uid: user.uid,
		role: "customer",
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
		// Safely handle different user properties from different providers.
		phoneNumber: user.phoneNumber || null, // Will exist for phone users

		canViewHiddenRestaurants: false,
		stripeCustomerId_test: null,
		stripeCustomerId_live: null,
	};

	// 3. Create the document in Firestore.
	await userDocRef.set(userData, { merge: true });
	// --- END OF FIX ---

	console.log(`Successfully created customer document for user ${user.uid}`);
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
