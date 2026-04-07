// functions/paymentFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const stripe = require("stripe");
const { getStripeKeys } = require("./stripeUtils");
const twilio = require("twilio");
const db = admin.firestore();
const crypto = require("crypto");

// Define the secret
const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const STRIPE_WEBHOOK_SECRET_TEST = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");
const STRIPE_WEBHOOK_SECRET_LIVE = defineSecret("STRIPE_WEBHOOK_SECRET_LIVE");

// TODO: Replace these with your actual Twilio credentials from the console
const TWILIO_ACCOUNT_SID = "TWILIO_ACCOUNT_SID_REMOVED";
const TWILIO_AUTH_TOKEN = "c3935a626b638abcd8e249a29c0d55f7";
const TWILIO_VERIFY_SERVICE_SID = "VA648e8c5da5ad84e802fed74f39ed9854";

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * 1. Sends the 6-digit OTP via WhatsApp
 */
exports.sendWhatsAppOTP = functions.https.onCall(async (data, context) => {
	const { phoneNumber } = data; // Must be E.164 format (e.g., +50761234567)

	if (!phoneNumber) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Phone number required.",
		);
	}

	try {
		console.log("This is the phone number being sent", phoneNumber);
		const verification = await twilioClient.verify.v2
			.services(TWILIO_VERIFY_SERVICE_SID)
			.verifications.create({
				to: phoneNumber,
				channel: "whatsapp", // 🚨 Forces Twilio to route via WhatsApp
			});

		console.log(
			"TWILIO RAW JSON RESPONSE:\n",
			JSON.stringify(verification, null, 2),
		);

		return { success: true, status: verification.status };
	} catch (error) {
		console.error("Twilio Send Error:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Could not send WhatsApp code.",
		);
	}
});

exports.sendWhatsAppCode = functions.https.onCall(async (data, context) => {
	const phoneNumber = data.phoneNumber; // Ensure the frontend sends this in E.164 format (e.g., "+507...")

	if (!phoneNumber) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Phone number is required.",
		);
	}

	// 1. Generate a cryptographically secure 6-digit code
	const otpCode = crypto.randomInt(100000, 999999).toString();

	// 2. Set an expiration time (10 minutes from now)
	const expiresAt = admin.firestore.Timestamp.fromDate(
		new Date(Date.now() + 10 * 60 * 1000),
	);

	try {
		// 3. Save the code and expiration to Firestore
		await admin.firestore().collection("otps").doc(phoneNumber).set({
			code: otpCode,
			expiresAt: expiresAt,
		});

		// 4. Fire the approved WhatsApp template via Twilio Programmable Messaging
		await twilioClient.messages.create({
			from: "whatsapp:+16812756693",
			to: `whatsapp:${phoneNumber}`,
			contentSid: "HX7e3c52b2b488126767456d41e4786d1c",
			contentVariables: JSON.stringify({ 1: otpCode }),
		});

		return { success: true, message: "WhatsApp OTP sent successfully." };
	} catch (error) {
		console.error("Error sending WhatsApp OTP:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Failed to send verification code.",
		);
	}
});

/**
 * 2. Checks the OTP and generates a Firebase Custom Token
 */
exports.verifyWhatsAppOTP = functions.https.onCall(async (data, context) => {
	const { phoneNumber, code } = data;

	if (!phoneNumber || !code) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Phone number and code required.",
		);
	}

	try {
		// A. Check if the code matches what Twilio sent
		const verificationCheck = await twilioClient.verify.v2
			.services(TWILIO_VERIFY_SERVICE_SID)
			.verificationChecks.create({ to: phoneNumber, code: code });

		if (verificationCheck.status === "approved") {
			// B. Find the Firebase User, or create one if they are brand new
			let uid;
			try {
				const userRecord = await admin.auth().getUserByPhoneNumber(phoneNumber);
				uid = userRecord.uid;
			} catch (e) {
				if (e.code === "auth/user-not-found") {
					const newUser = await admin
						.auth()
						.createUser({ phoneNumber: phoneNumber });
					uid = newUser.uid;
				} else {
					throw e;
				}
			}

			// C. Generate the golden ticket: The Custom Token
			const customToken = await admin.auth().createCustomToken(uid);

			return { success: true, customToken: customToken };
		} else {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid or expired OTP code.",
			);
		}
	} catch (error) {
		console.error("Twilio Verify Error:", error);
		throw new functions.https.HttpsError("internal", "Verification failed.");
	}
});

exports.verifyWhatsAppCode = functions.https.onCall(async (data, context) => {
	const phoneNumber = data.phoneNumber;
	const userCode = data.code; // The 6 digits the user typed into the app

	if (!phoneNumber || !userCode) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Phone number and code are required.",
		);
	}

	const otpRef = admin.firestore().collection("otps").doc(phoneNumber);
	const doc = await otpRef.get();

	// 1. Check if an OTP exists for this number
	if (!doc.exists) {
		throw new functions.https.HttpsError(
			"not-found",
			"No OTP request found for this number.",
		);
	}

	const otpData = doc.data();

	// 2. Check if the 10-minute timer has expired
	if (otpData.expiresAt.toDate() < new Date()) {
		await otpRef.delete(); // Delete the expired document
		throw new functions.https.HttpsError(
			"deadline-exceeded",
			"This code has expired. Please request a new one.",
		);
	}

	// 3. Check if the code matches
	if (otpData.code !== userCode) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Incorrect verification code.",
		);
	}

	// 4. Success! Delete the OTP document so it cannot be reused
	await otpRef.delete();

	// 5. 🚨 THE FIX: Create a native Firebase user FIRST
	let uid;
	try {
		// Check if this phone number already has a Firebase account
		const userRecord = await admin.auth().getUserByPhoneNumber(phoneNumber);
		uid = userRecord.uid; // Grab their existing random UID
	} catch (error) {
		if (error.code === "auth/user-not-found") {
			// If they are brand new, create a native Firebase Auth user.
			// Firebase will automatically generate a standard alphanumeric UID!
			const newUser = await admin.auth().createUser({
				phoneNumber: phoneNumber,
			});
			uid = newUser.uid;
		} else {
			console.error("Error fetching user:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Error looking up user.",
			);
		}
	}

	// 6. Mint the Firebase Custom Token using the standard UID (not the phone number)
	try {
		const customToken = await admin.auth().createCustomToken(uid);
		return { success: true, token: customToken };
	} catch (error) {
		console.error("Error creating custom token:", error);
		throw new functions.https.HttpsError("internal", "Failed to log in user.");
	}
});
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
				{ merge: true },
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
				"User not authenticated.",
			);
		}
		const { userId, restaurantId } = data;
		if (!userId || !restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"User ID and Restaurant ID are required.",
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
					"Customer profile not found.",
				);
			}
			const userData = userDoc.data();
			const phoneNumber = userData.phoneNumber;
			const name = `${userData.firstName} ${userData.lastName}`.trim();

			if (!phoneNumber) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"User profile is missing a phone number.",
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
				} Stripe customer: ${customer.id}`,
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
			"Missing required fields.",
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
				"Invalid role for signup.",
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
		(provider) => provider.providerId === "password",
	);

	if (isEmailProvider) {
		console.log(
			`onUserCreate: Email/password user ${user.uid} was handled by createUserAccount. No action needed.`,
		);
		return null;
	}

	// --- THIS IS THE FIX ---
	// This logic now correctly handles users from any non-password provider (Phone, Google, etc.).
	console.log(
		`onUserCreate: New non-email user created: ${user.uid}. Assigning 'customer' role.`,
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
			"You must be an owner or manager to change roles.",
		);
	}
	const { targetUserId, role, restaurantId } = data;
	if (!targetUserId || !role || !restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Target user, role, and restaurantId are required.",
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
			"Could not set user role.",
		);
	}
});
