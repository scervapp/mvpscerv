// functions/paymentFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const stripe = require("stripe");
const {
	getStripeKeys,
	ensureStripeCustomerForMode,
	ensureStripeCustomersForCustomer,
} = require("./stripeUtils");
const twilio = require("twilio");
const db = admin.firestore();
const crypto = require("crypto");

const { Resend } = require("resend");

const resend = new Resend("re_c5VCacmN_N1Ynx623z8htk2jxjHR8qSJp");

const normalizeSearchValue = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");

const buildCustomerSearchTokens = ({ firstName, lastName, fullName, email }) => {
	const sourceValues = [
		firstName,
		lastName,
		fullName,
		`${firstName || ""} ${lastName || ""}`.trim(),
		email,
	];
	const tokens = new Set();

	sourceValues.forEach((sourceValue) => {
		const normalizedValue = normalizeSearchValue(sourceValue);
		if (!normalizedValue) return;

		normalizedValue.split(/[ @._-]+/).forEach((part) => {
			if (part.length < 3) return;
			for (let length = 3; length <= part.length; length++) {
				tokens.add(part.slice(0, length));
			}
		});

		if (normalizedValue.length >= 3) {
			for (let length = 3; length <= normalizedValue.length; length++) {
				tokens.add(normalizedValue.slice(0, length));
			}
		}
	});

	return Array.from(tokens).slice(0, 100);
};

const arraysEqual = (first = [], second = []) => {
	if (first.length !== second.length) return false;
	const firstSorted = [...first].sort();
	const secondSorted = [...second].sort();
	return firstSorted.every((value, index) => value === secondSorted[index]);
};

const getCustomerSearchIndexPatch = (customerData = {}) => {
	const emailLower = normalizeSearchValue(customerData.email);
	const firstName = customerData.firstName || "";
	const lastName = customerData.lastName || "";
	const fullName =
		customerData.fullName ||
		`${firstName || ""} ${lastName || ""}`.trim() ||
		null;
	const searchTokens = buildCustomerSearchTokens({
		firstName,
		lastName,
		fullName,
		email: emailLower,
	});

	const patch = {};

	if ((customerData.emailLower || null) !== (emailLower || null)) {
		patch.emailLower = emailLower || null;
	}

	if ((customerData.fullName || null) !== (fullName || null)) {
		patch.fullName = fullName;
	}

	if (!arraysEqual(customerData.searchTokens || [], searchTokens)) {
		patch.searchTokens = searchTokens;
	}

	return patch;
};

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

exports.sendEmailOtp = functions.https.onCall(async (data, context) => {
	const email = data.email;

	if (email === "apple@scerv.com") {
		console.log("Apple Test Account requested OTP. Bypassing email send.");
		return { success: true, message: "Apple bypass active." };
	}

	if (!email) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Email is required",
		);
	}

	// Generate a random 6-digit code
	const verificationCode = Math.floor(
		100000 + Math.random() * 900000,
	).toString();

	try {
		// Save it to Firestore (Use this collection to verify it on the next step)
		await admin.firestore().collection("otp_codes").doc(email).set({
			code: verificationCode,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		// Fire the email via Resend
		const { data: emailData, error } = await resend.emails.send({
			// 🚨 CRITICAL: The "from" email MUST end in the domain you verified in Phase 1
			from: "Scerv Verification <noreply@scerv.com>",
			to: email,
			subject: "Your Scerv Login Code",
			html: `<div style="font-family: sans-serif; text-align: center; padding: 20px;">
                    <h2>Welcome to Scerv</h2>
                    <p>Your verification code is:</p>
                    <h1 style="letter-spacing: 5px; color: #1a73e8;">${verificationCode}</h1>
                   </div>`,
		});

		if (error) {
			console.error("Resend API Error:", error);
			throw new Error(error.message);
		}

		return { success: true, message: "Email sent successfully" };
	} catch (error) {
		console.error("Email OTP Error:", error);
		throw new functions.https.HttpsError("internal", "Could not send email.");
	}
});

exports.verifyEmailOtp = functions.https.onCall(async (data, context) => {
	const { email, code } = data;

	if (!email || !code) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Email and code are required.",
		);
	}

	const cleanEmail = email.toLowerCase().trim();
	const cleanCode = code.trim();

	if (cleanEmail === "apple@scerv.com" && cleanCode === "123456") {
		console.log("Apple Test Account logging in.");
		let userRecord;
		try {
			userRecord = await admin.auth().getUserByEmail(cleanEmail);
		} catch (error) {
			// Create the Apple user in Firebase Auth the very first time they log in
			if (error.code === "auth/user-not-found") {
				userRecord = await admin.auth().createUser({ email: cleanEmail });
			} else {
				throw error;
			}
		}

		const customToken = await admin.auth().createCustomToken(userRecord.uid);
		return { token: customToken };
	}

	try {
		// 1. Fetch the saved code from the vault
		const doc = await admin
			.firestore()
			.collection("otp_codes")
			.doc(email)
			.get();

		if (!doc.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"No verification code found for this email. Please request a new one.",
			);
		}

		const storedData = doc.data();

		// 2. Check if the code matches
		if (storedData.code !== code.trim()) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"Invalid verification code.",
			);
		}

		// 3. Find or Create the Firebase Auth User
		let userRecord;
		try {
			userRecord = await admin.auth().getUserByEmail(email);
		} catch (error) {
			if (error.code === "auth/user-not-found") {
				// First time user? Create them an account under the hood
				userRecord = await admin.auth().createUser({ email: email });
			} else {
				throw error;
			}
		}

		// 4. Mint the Firebase Custom Auth Token
		const customToken = await admin.auth().createCustomToken(userRecord.uid);

		// 5. Burn the OTP code so it cannot be reused
		await admin.firestore().collection("otp_codes").doc(email).delete();

		// 6. Send the token back to the frontend to log them in
		return { token: customToken };
	} catch (error) {
		console.error("Verification Error:", error);
		// Do not throw raw errors to the frontend, wrap them in HttpsError
		throw new functions.https.HttpsError("internal", error.message);
	}
});

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
			const mode = keys.isTestMode ? "test" : "live";
			const stripeInstance = stripe(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});
			const customerId = await ensureStripeCustomerForMode(
				userId,
				mode,
				stripeInstance,
			);

			return { customerId, mode };
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
exports.createUserAccount = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
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
			userData = {
				role: "customer",
				stripeCustomerId_test: null,
				stripeCustomerId_live: null,
			}; // Claims handle the role primarily
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
		const normalizedEmail = normalizeSearchValue(email);
		const fullName =
			`${additionalData.firstName || ""} ${additionalData.lastName || ""}`.trim();
		await docRef.set({
			uid: userRecord.uid,
			email: normalizedEmail || email,
			...(role === "customer" && {
				emailLower: normalizedEmail || null,
				fullName: fullName || null,
				searchTokens: buildCustomerSearchTokens({
					firstName: additionalData.firstName,
					lastName: additionalData.lastName,
					fullName,
					email: normalizedEmail || email,
				}),
			}),
			...additionalData,
			...userData, // Includes role and the new flag
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		if (role === "customer") {
			await ensureStripeCustomersForCustomer(userRecord.uid, {
				bestEffort: true,
			});
		}

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
exports.onUserCreate = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
		],
	})
	.auth.user()
	.onCreate(async (user) => {
	const isEmailProvider = user.providerData.some(
		(provider) => provider.providerId === "password",
	);

	if (isEmailProvider) {
		console.log(
			`onUserCreate: Email/password user ${user.uid} was handled by createUserAccount. No action needed.`,
		);
		return null;
	}

	console.log(
		`onUserCreate: New non-email user created: ${user.uid}. Assigning 'customer' role.`,
	);

	await admin.auth().setCustomUserClaims(user.uid, { role: "customer" });

	const userDocRef = db.collection("customers").doc(user.uid);

	const normalizedEmail =
		user.email && typeof user.email === "string"
			? user.email.toLowerCase().trim()
			: null;
	const displayName = user.displayName || "";
	const [firstName = "", ...lastNameParts] = displayName.split(" ");
	const lastName = lastNameParts.join(" ");

	const userData = {
		uid: user.uid,
		role: "customer",
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
		updatedAt: admin.firestore.FieldValue.serverTimestamp(),

		email: normalizedEmail,
		emailLower: normalizedEmail,
		fullName: displayName || null,
		firstName: firstName || null,
		lastName: lastName || null,
		searchTokens: buildCustomerSearchTokens({
			firstName,
			lastName,
			fullName: displayName,
			email: normalizedEmail,
		}),
		phoneNumber: user.phoneNumber || null,

		canViewHiddenRestaurants: false,
		stripeCustomerId_test: null,
		stripeCustomerId_live: null,
	};

	await userDocRef.set(userData, { merge: true });

	await ensureStripeCustomersForCustomer(user.uid, { bestEffort: true });

	console.log(`Successfully created customer document for user ${user.uid}`);
	return null;
});

exports.syncCustomerSearchIndex = functions.firestore
	.document("customers/{userId}")
	.onWrite(async (change) => {
		if (!change.after.exists) {
			return null;
		}

		const customerData = change.after.data() || {};
		const patch = getCustomerSearchIndexPatch(customerData);

		if (Object.keys(patch).length === 0) {
			return null;
		}

		await change.after.ref.set(
			{
				...patch,
				searchIndexUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

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

exports.updateUserCredentials = functions.https.onCall(
	async (data, context) => {
		const { uid, email, password, adminCode } = data;

		if (adminCode !== "TEMP_FIX_2026") {
			throw new functions.https.HttpsError("permission-denied", "Not allowed.");
		}

		if (!uid || !email || !password) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"uid, email and password are required.",
			);
		}

		const cleanEmail = email.toLowerCase().trim();

		await admin.auth().updateUser(uid, {
			email: cleanEmail,
			password,
			emailVerified: true,
		});

		await db.collection("restaurants").doc(uid).set(
			{
				email: cleanEmail,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		return {
			success: true,
			message: "Credentials updated successfully.",
		};
	},
);
