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
const db = admin.firestore();

const { Resend } = require("resend");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const getResendClient = () => {
	const apiKey = RESEND_API_KEY.value();
	if (!apiKey) {
		throw new Error("RESEND_API_KEY is not configured.");
	}
	return new Resend(apiKey);
};

const normalizeSearchValue = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");

const sanitizeString = (value) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ");

const normalizeInternationalPhone = (value) => {
	const cleaned = String(value || "")
		.trim()
		.replace(/[^\d+]/g, "");
	if (!cleaned) return "";
	return cleaned.startsWith("+")
		? `+${cleaned.replace(/[^\d]/g, "")}`
		: cleaned.replace(/[^\d]/g, "");
};

const SUPPORTED_COUNTRIES = Object.fromEntries([
	["US", "United States"],
	["AF", "Afghanistan"],
	["AX", "Aland Islands"],
	["AL", "Albania"],
	["DZ", "Algeria"],
	["AS", "American Samoa"],
	["AD", "Andorra"],
	["AO", "Angola"],
	["AI", "Anguilla"],
	["AQ", "Antarctica"],
	["AG", "Antigua and Barbuda"],
	["AR", "Argentina"],
	["AM", "Armenia"],
	["AW", "Aruba"],
	["AU", "Australia"],
	["AT", "Austria"],
	["AZ", "Azerbaijan"],
	["BS", "Bahamas"],
	["BH", "Bahrain"],
	["BD", "Bangladesh"],
	["BB", "Barbados"],
	["BY", "Belarus"],
	["BE", "Belgium"],
	["BZ", "Belize"],
	["BJ", "Benin"],
	["BM", "Bermuda"],
	["BT", "Bhutan"],
	["BO", "Bolivia"],
	["BQ", "Bonaire, Sint Eustatius and Saba"],
	["BA", "Bosnia and Herzegovina"],
	["BW", "Botswana"],
	["BR", "Brazil"],
	["IO", "British Indian Ocean Territory"],
	["BN", "Brunei Darussalam"],
	["BG", "Bulgaria"],
	["BF", "Burkina Faso"],
	["BI", "Burundi"],
	["KH", "Cambodia"],
	["CM", "Cameroon"],
	["CA", "Canada"],
	["CV", "Cape Verde"],
	["KY", "Cayman Islands"],
	["CF", "Central African Republic"],
	["TD", "Chad"],
	["CL", "Chile"],
	["CN", "China"],
	["CX", "Christmas Island"],
	["CC", "Cocos Islands"],
	["CO", "Colombia"],
	["KM", "Comoros"],
	["CG", "Congo"],
	["CD", "Congo, Democratic Republic"],
	["CK", "Cook Islands"],
	["CR", "Costa Rica"],
	["CI", "Cote d'Ivoire"],
	["HR", "Croatia"],
	["CU", "Cuba"],
	["CW", "Curacao"],
	["CY", "Cyprus"],
	["CZ", "Czech Republic"],
	["DK", "Denmark"],
	["DJ", "Djibouti"],
	["DM", "Dominica"],
	["DO", "Dominican Republic"],
	["EC", "Ecuador"],
	["EG", "Egypt"],
	["SV", "El Salvador"],
	["GQ", "Equatorial Guinea"],
	["ER", "Eritrea"],
	["EE", "Estonia"],
	["SZ", "Eswatini"],
	["ET", "Ethiopia"],
	["FK", "Falkland Islands"],
	["FO", "Faroe Islands"],
	["FJ", "Fiji"],
	["FI", "Finland"],
	["FR", "France"],
	["GF", "French Guiana"],
	["PF", "French Polynesia"],
	["TF", "French Southern Territories"],
	["GA", "Gabon"],
	["GM", "Gambia"],
	["GE", "Georgia"],
	["DE", "Germany"],
	["GH", "Ghana"],
	["GI", "Gibraltar"],
	["GR", "Greece"],
	["GL", "Greenland"],
	["GD", "Grenada"],
	["GP", "Guadeloupe"],
	["GU", "Guam"],
	["GT", "Guatemala"],
	["GG", "Guernsey"],
	["GN", "Guinea"],
	["GW", "Guinea-Bissau"],
	["GY", "Guyana"],
	["HT", "Haiti"],
	["VA", "Holy See"],
	["HN", "Honduras"],
	["HK", "Hong Kong"],
	["HU", "Hungary"],
	["IS", "Iceland"],
	["IN", "India"],
	["ID", "Indonesia"],
	["IR", "Iran"],
	["IQ", "Iraq"],
	["IE", "Ireland"],
	["IM", "Isle of Man"],
	["IL", "Israel"],
	["IT", "Italy"],
	["JM", "Jamaica"],
	["JP", "Japan"],
	["JE", "Jersey"],
	["JO", "Jordan"],
	["KZ", "Kazakhstan"],
	["KE", "Kenya"],
	["KI", "Kiribati"],
	["KP", "Korea, North"],
	["KR", "Korea, South"],
	["KW", "Kuwait"],
	["KG", "Kyrgyzstan"],
	["LA", "Laos"],
	["LV", "Latvia"],
	["LB", "Lebanon"],
	["LS", "Lesotho"],
	["LR", "Liberia"],
	["LY", "Libya"],
	["LI", "Liechtenstein"],
	["LT", "Lithuania"],
	["LU", "Luxembourg"],
	["MO", "Macao"],
	["MG", "Madagascar"],
	["MW", "Malawi"],
	["MY", "Malaysia"],
	["MV", "Maldives"],
	["ML", "Mali"],
	["MT", "Malta"],
	["MH", "Marshall Islands"],
	["MQ", "Martinique"],
	["MR", "Mauritania"],
	["MU", "Mauritius"],
	["YT", "Mayotte"],
	["MX", "Mexico"],
	["FM", "Micronesia"],
	["MD", "Moldova"],
	["MC", "Monaco"],
	["MN", "Mongolia"],
	["ME", "Montenegro"],
	["MS", "Montserrat"],
	["MA", "Morocco"],
	["MZ", "Mozambique"],
	["MM", "Myanmar"],
	["NA", "Namibia"],
	["NR", "Nauru"],
	["NP", "Nepal"],
	["NL", "Netherlands"],
	["NC", "New Caledonia"],
	["NZ", "New Zealand"],
	["NI", "Nicaragua"],
	["NE", "Niger"],
	["NG", "Nigeria"],
	["NU", "Niue"],
	["NF", "Norfolk Island"],
	["MK", "North Macedonia"],
	["MP", "Northern Mariana Islands"],
	["NO", "Norway"],
	["OM", "Oman"],
	["PK", "Pakistan"],
	["PW", "Palau"],
	["PS", "Palestine"],
	["PA", "Panama"],
	["PG", "Papua New Guinea"],
	["PY", "Paraguay"],
	["PE", "Peru"],
	["PH", "Philippines"],
	["PN", "Pitcairn"],
	["PL", "Poland"],
	["PT", "Portugal"],
	["PR", "Puerto Rico"],
	["QA", "Qatar"],
	["RE", "Reunion"],
	["RO", "Romania"],
	["RU", "Russian Federation"],
	["RW", "Rwanda"],
	["BL", "Saint Barthelemy"],
	["SH", "Saint Helena"],
	["KN", "Saint Kitts and Nevis"],
	["LC", "Saint Lucia"],
	["MF", "Saint Martin"],
	["PM", "Saint Pierre and Miquelon"],
	["VC", "Saint Vincent and the Grenadines"],
	["WS", "Samoa"],
	["SM", "San Marino"],
	["ST", "Sao Tome and Principe"],
	["SA", "Saudi Arabia"],
	["SN", "Senegal"],
	["RS", "Serbia"],
	["SC", "Seychelles"],
	["SL", "Sierra Leone"],
	["SG", "Singapore"],
	["SX", "Sint Maarten"],
	["SK", "Slovakia"],
	["SI", "Slovenia"],
	["SB", "Solomon Islands"],
	["SO", "Somalia"],
	["ZA", "South Africa"],
	["GS", "South Georgia and Sandwich Islands"],
	["SS", "South Sudan"],
	["ES", "Spain"],
	["LK", "Sri Lanka"],
	["SD", "Sudan"],
	["SR", "Suriname"],
	["SJ", "Svalbard and Jan Mayen"],
	["SE", "Sweden"],
	["CH", "Switzerland"],
	["SY", "Syrian Arab Republic"],
	["TW", "Taiwan"],
	["TJ", "Tajikistan"],
	["TZ", "Tanzania"],
	["TH", "Thailand"],
	["TL", "Timor-Leste"],
	["TG", "Togo"],
	["TK", "Tokelau"],
	["TO", "Tonga"],
	["TT", "Trinidad and Tobago"],
	["TN", "Tunisia"],
	["TR", "Turkey"],
	["TM", "Turkmenistan"],
	["TC", "Turks and Caicos Islands"],
	["TV", "Tuvalu"],
	["UG", "Uganda"],
	["UA", "Ukraine"],
	["AE", "United Arab Emirates"],
	["GB", "United Kingdom"],
	["UM", "United States Minor Outlying Islands"],
	["UY", "Uruguay"],
	["UZ", "Uzbekistan"],
	["VU", "Vanuatu"],
	["VE", "Venezuela"],
	["VN", "Viet Nam"],
	["VG", "Virgin Islands, British"],
	["VI", "Virgin Islands, U.S."],
	["WF", "Wallis and Futuna"],
	["EH", "Western Sahara"],
	["YE", "Yemen"],
	["ZM", "Zambia"],
	["ZW", "Zimbabwe"],
]);

const validateOwnerSignupData = (additionalData = {}) => {
	const countryCode = sanitizeString(additionalData.countryCode).toUpperCase();
	const ownerData = {
		restaurantName: sanitizeString(additionalData.restaurantName),
		firstName: sanitizeString(additionalData.firstName),
		lastName: sanitizeString(additionalData.lastName),
		phoneNumber: normalizeInternationalPhone(additionalData.phoneNumber),
		address: sanitizeString(additionalData.address),
		city: sanitizeString(additionalData.city),
		state: sanitizeString(additionalData.state),
		zipcode: sanitizeString(additionalData.zipcode),
		country: SUPPORTED_COUNTRIES[countryCode],
		countryCode,
	};

	if (
		!ownerData.restaurantName ||
		!ownerData.firstName ||
		!ownerData.lastName ||
		!ownerData.phoneNumber ||
		!ownerData.address ||
		!ownerData.city ||
		!ownerData.state ||
		!ownerData.zipcode ||
		!ownerData.country ||
		!ownerData.countryCode
	) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required restaurant signup fields.",
		);
	}

	if (!/^\+?\d{7,15}$/.test(ownerData.phoneNumber)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A valid business phone number is required.",
		);
	}

	if (!/^[0-9a-zA-Z\s-]{2,20}$/.test(ownerData.zipcode)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A valid postal code is required.",
		);
	}

	return ownerData;
};

const getPublicRestaurantSignupData = (ownerData = {}) => ({
	restaurantName: ownerData.restaurantName,
	phone: ownerData.phoneNumber,
	address: ownerData.address,
	city: ownerData.city,
	state: ownerData.state,
	zipcode: ownerData.zipcode,
	country: ownerData.country,
	...(ownerData.countryCode && { countryCode: ownerData.countryCode }),
});

const getPrivateOwnerSignupData = ({
	ownerData = {},
	email,
	fullName,
}) => ({
	email,
	firstName: ownerData.firstName,
	lastName: ownerData.lastName,
	fullName,
	phoneNumber: ownerData.phoneNumber,
	createdAt: admin.firestore.FieldValue.serverTimestamp(),
	updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

const escapeHtml = (value) =>
	String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const sendRestaurantWelcomeEmail = async ({ email, ownerName, restaurantName }) => {
	const cleanEmail = normalizeSearchValue(email);
	if (!cleanEmail) return;

	const safeOwnerName = escapeHtml(ownerName || "there");
	const safeRestaurantName = escapeHtml(restaurantName || "your restaurant");

	try {
		await getResendClient().emails.send({
			from: "Scerv <noreply@scerv.com>",
			to: cleanEmail,
			subject: `Welcome to Scerv, ${restaurantName || "partner"}`,
			html: `
				<div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
					<h2 style="color: #006d77;">Welcome to Scerv</h2>
					<p>Hi ${safeOwnerName},</p>
					<p>Your restaurant account for <strong>${safeRestaurantName}</strong> is ready.</p>
					<p>Here is the recommended setup path:</p>
					<ol>
						<li>Create your owner employee profile and PIN.</li>
						<li>Add managers and staff who will use the POS.</li>
						<li>Finish your restaurant profile, tables, and menu.</li>
						<li>Connect Stripe payouts before accepting live payments.</li>
					</ol>
					<p>If you did not create this account, reply to this email so we can help secure it.</p>
					<p style="margin-top: 24px;">The Scerv team</p>
				</div>
			`,
		});
	} catch (error) {
		console.warn("Restaurant welcome email failed:", error);
	}
};

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

exports.sendEmailOtp = functions
	.runWith({ secrets: [RESEND_API_KEY] })
	.https.onCall(async (data, context) => {
	const email = normalizeSearchValue(data && data.email);

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
		const { data: emailData, error } = await getResendClient().emails.send({
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

	try {
		// 1. Fetch the saved code from the vault
		const doc = await admin
			.firestore()
			.collection("otp_codes")
			.doc(cleanEmail)
			.get();

		if (!doc.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"No verification code found for this email. Please request a new one.",
			);
		}

		const storedData = doc.data();
		const createdAtMillis =
			storedData.createdAt &&
			typeof storedData.createdAt.toMillis === "function"
				? storedData.createdAt.toMillis()
				: 0;
		if (!createdAtMillis || createdAtMillis < Date.now() - 10 * 60 * 1000) {
			await admin.firestore().collection("otp_codes").doc(cleanEmail).delete();
			throw new functions.https.HttpsError(
				"deadline-exceeded",
				"This code has expired. Please request a new one.",
			);
		}

		// 2. Check if the code matches
		if (storedData.code !== cleanCode) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"Invalid verification code.",
			);
		}

		// 3. Find or Create the Firebase Auth User
		let userRecord;
		try {
			userRecord = await admin.auth().getUserByEmail(cleanEmail);
		} catch (error) {
			if (error.code === "auth/user-not-found") {
				// First time user? Create them an account under the hood
				userRecord = await admin.auth().createUser({ email: cleanEmail });
			} else {
				throw error;
			}
		}

		// 4. Mint the Firebase Custom Auth Token
		const customToken = await admin.auth().createCustomToken(userRecord.uid);

		// 5. Burn the OTP code so it cannot be reused
		await admin.firestore().collection("otp_codes").doc(cleanEmail).delete();

		// 6. Send the token back to the frontend to log them in
		return { token: customToken };
	} catch (error) {
		console.error("Verification Error:", error);
		if (error instanceof functions.https.HttpsError) {
			throw error;
		}
		throw new functions.https.HttpsError("internal", error.message);
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
			RESEND_API_KEY,
		],
	})
	.https.onCall(async (data, context) => {
	const { email, password, role, additionalData } = data || {};
	const normalizedEmail = normalizeSearchValue(email);
	const normalizedRole = normalizeSearchValue(role);
	let ownerSignupData = null;

	if (!normalizedEmail || !password || !normalizedRole || !additionalData) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required fields.",
		);
	}

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A valid email address is required.",
		);
	}

	if (String(password).length < 8) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Password must be at least 8 characters.",
		);
	}

	if (normalizedRole === "owner") {
		ownerSignupData = validateOwnerSignupData(additionalData);
	}

	try {
		const userRecord = await admin.auth().createUser({
			email: normalizedEmail,
			password,
			displayName: ownerSignupData
				? `${ownerSignupData.firstName} ${ownerSignupData.lastName}`.trim() ||
					ownerSignupData.restaurantName
				: `${additionalData.firstName || ""} ${additionalData.lastName || ""}`.trim(),
		});

		let collectionName;
		let restaurantId = null;
		let userData = {};

		if (normalizedRole === "customer") {
			collectionName = "customers";
			userData = {
				role: "customer",
				stripeCustomerId_test: null,
				stripeCustomerId_live: null,
			}; // Claims handle the role primarily
		} else if (normalizedRole === "owner") {
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
			.setCustomUserClaims(userRecord.uid, { role: normalizedRole, restaurantId });

		const docRef = db.collection(collectionName).doc(userRecord.uid);
		const fullName = ownerSignupData
			? `${ownerSignupData.firstName} ${ownerSignupData.lastName}`.trim()
			: `${additionalData.firstName || ""} ${additionalData.lastName || ""}`.trim();
		await docRef.set({
			uid: userRecord.uid,
			...(normalizedRole === "customer" && {
				email: normalizedEmail,
				emailLower: normalizedEmail || null,
				fullName: fullName || null,
				searchTokens: buildCustomerSearchTokens({
					firstName: additionalData.firstName,
					lastName: additionalData.lastName,
					fullName,
					email: normalizedEmail || email,
				}),
			}),
			...(normalizedRole === "owner"
				? getPublicRestaurantSignupData(ownerSignupData)
				: additionalData),
			...userData, // Includes role and the new flag
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		if (normalizedRole === "customer") {
			await ensureStripeCustomersForCustomer(userRecord.uid, {
				bestEffort: true,
			});
		} else if (normalizedRole === "owner") {
			await sendRestaurantWelcomeEmail({
				email: normalizedEmail,
				ownerName: fullName,
				restaurantName: ownerSignupData.restaurantName,
			});
			await docRef
				.collection("private")
				.doc("owner")
				.set(
					getPrivateOwnerSignupData({
						ownerData: ownerSignupData,
						email: normalizedEmail,
						fullName,
					}),
				);
		}

		return { success: true, uid: userRecord.uid };
	} catch (error) {
		if (error instanceof functions.https.HttpsError) {
			throw error;
		}
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



