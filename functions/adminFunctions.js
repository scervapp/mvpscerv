const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe");
const crypto = require("crypto");
const { Resend } = require("resend");
const { defineSecret } = require("firebase-functions/params");
const { getStripeKeys } = require("./stripeUtils");
const { normalizeOrderForReporting } = require("./reportingHelpers");

const db = admin.firestore();

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const FEATURE_KEYS = [
	"reservations",
	"reservationWaitlist",
	"hostCheckInRequests",
	"reviews",
	"rewards",
	"qrSelfCheckIn",
	"parties",
	"pickup",
	"tableScanOrdering",
	"serviceRequests",
	"advancedReporting",
];

const SUBSCRIPTION_PLANS = ["starter", "pro", "premium", "enterprise"];
const SUBSCRIPTION_STATUSES = [
	"trial",
	"active",
	"past_due",
	"paused",
	"cancelled",
	"comped",
];

const COUNTRY_NAMES = {
	US: "United States",
	PA: "Panama",
	CA: "Canada",
	MX: "Mexico",
	GB: "United Kingdom",
};

const SCERV_ADMIN_ROLES = ["admin", "godmode", "scerv_admin", "super_admin"];
const GODMODE_ROLES = ["godmode", "super_admin"];

const sanitizeString = (value, maxLength = 160) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, maxLength);

const normalizeNonNegativeCents = (value, fallback = 0) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.round(parsed);
};

const normalizeInternationalPhone = (value) => {
	const cleaned = String(value || "")
		.trim()
		.replace(/[^\d+]/g, "");
	if (!cleaned) return "";
	return cleaned.startsWith("+")
		? `+${cleaned.replace(/[^\d]/g, "")}`
		: cleaned.replace(/[^\d]/g, "");
};

const normalizeEmail = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

const escapeHtml = (value) =>
	String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const getResendClient = () => {
	const apiKey = RESEND_API_KEY.value();
	if (!apiKey) return null;
	return new Resend(apiKey);
};

const normalizeAdminRole = (role) => {
	const normalized = String(role || "")
		.trim()
		.toLowerCase();

	if (normalized === "super_admin") {
		return "godmode";
	}

	if (normalized === "scerv_admin") {
		return "admin";
	}

	return normalized;
};

const requireScervAdmin = (context, options = {}) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Authentication is required.",
		);
	}

	const token = context.auth.token || {};
	const role = String(token.role || "").toLowerCase();
	const allowedRoles = options.godmodeOnly ? GODMODE_ROLES : SCERV_ADMIN_ROLES;
	if (!allowedRoles.includes(role)) {
		throw new functions.https.HttpsError(
			"permission-denied",
			options.godmodeOnly
				? "Scerv godmode access is required."
				: "Scerv admin access is required.",
		);
	}

	return context.auth.uid;
};

const publicUserFields = (userRecord, adminProfile = null) => ({
	uid: userRecord.uid,
	email: userRecord.email || "",
	displayName: userRecord.displayName || "",
	disabled: Boolean(userRecord.disabled),
	role: normalizeAdminRole(userRecord.customClaims && userRecord.customClaims.role),
	emailVerified: Boolean(userRecord.emailVerified),
	createdAt: userRecord.metadata && userRecord.metadata.creationTime,
	lastSignInAt: userRecord.metadata && userRecord.metadata.lastSignInTime,
	profile: adminProfile || null,
});

const writeAdminAuditLog = (actorUid, action, payload) =>
	db.collection("scervAdminAuditLogs").add({
		action,
		actorUid,
		payload,
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
	});

const serializeValue = (value) => {
	if (!value) return value;

	if (value instanceof admin.firestore.Timestamp) {
		return value.toDate().toISOString();
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		return value.map(serializeValue);
	}

	if (typeof value === "object") {
		return Object.keys(value).reduce((acc, key) => {
			acc[key] = serializeValue(value[key]);
			return acc;
		}, {});
	}

	return value;
};

const serializeDoc = (doc) => ({
	id: doc.id,
	...serializeValue(doc.data() || {}),
});

const compactRestaurant = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		restaurantName: data.restaurantName || data.name || "",
		restaurantNumber: data.restaurantNumber || "",
		city: data.city || "",
		state: data.state || "",
		email: data.email || "",
		phoneNumber: data.phoneNumber || "",
		isActive: data.isActive !== false,
		featureEntitlements: data.featureEntitlements || {},
	};
};

const compactOrder = (doc) => {
	const data = doc.data() || {};
	const refundSummary = data.refundSummary || {};
	return {
		id: doc.id,
		readableOrderId: data.readableOrderId || "",
		restaurantId: data.restaurantId || "",
		restaurantName: data.restaurantName || "",
		customerId: data.customerId || data.userId || "",
		customerName: data.customerName || "",
		customerEmail: data.customerEmail || "",
		paymentStatus: data.paymentStatus || "",
		orderStatus: data.orderStatus || "",
		totalPrice: data.totalPrice || 0,
		refundedAmount:
			refundSummary.totalRefundedCents || data.refundedAmount || 0,
		subtotal: data.subtotal || 0,
		taxAmount: data.taxAmount || data.tax || 0,
		gratuityAmount: data.gratuityAmount || data.gratuity || 0,
		fulfilledAt: serializeValue(data.fulfilledAt || data.timestamp || null),
		createdAt: serializeValue(data.createdAt || data.timestamp || null),
	};
};

const compactReservation = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		restaurantId: data.restaurantId || "",
		restaurantName: data.restaurantName || "",
		customerId: data.customerId || "",
		customerName: data.customerName || "",
		customerEmail: data.customerEmail || "",
		status: data.status || "",
		partySize: data.partySize || data.guestCount || 0,
		reservationDate: serializeValue(data.reservationDate || data.date || null),
		reservationTime: data.reservationTime || data.time || "",
		createdAt: serializeValue(data.createdAt || null),
	};
};

const normalizePriceCents = (price) => {
	const numericPrice = Number(price);
	if (!Number.isFinite(numericPrice) || numericPrice < 0) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Menu item price must be a positive number.",
		);
	}

	return Math.round(numericPrice * 100) / 100;
};

const getMenuItemPayload = (data) => ({
	name: sanitizeString(data && data.name, 120),
	description: sanitizeString(data && data.description, 800),
	price: normalizePriceCents(data && data.price),
	category: sanitizeString(data && data.category, 120),
	imageUri: sanitizeString(data && data.imageUri, 1000),
	isActive: Boolean(data && data.isActive),
	isDailySpecial: Boolean(data && data.isDailySpecial),
	isFeatured: Boolean(data && data.isFeatured),
});

const generateUniqueRestaurantNumber = async () => {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const restaurantNumber = Math.floor(100000 + Math.random() * 900000);
		const existing = await db
			.collection("restaurants")
			.where("restaurantNumber", "==", restaurantNumber)
			.limit(1)
			.get();
		if (existing.empty) return restaurantNumber;
	}

	return Date.now();
};

const getFeatureEntitlementDefaults = (input = {}) => {
	const defaults = {
		reservations: false,
		reservationWaitlist: false,
		hostCheckInRequests: false,
		reviews: true,
		rewards: false,
		qrSelfCheckIn: true,
		parties: true,
		pickup: false,
		tableScanOrdering: true,
		serviceRequests: true,
		advancedReporting: false,
	};

	return FEATURE_KEYS.reduce((acc, key) => {
		acc[key] =
			typeof input[key] === "boolean" ? input[key] : defaults[key] === true;
		return acc;
	}, {});
};

const buildRestaurantOnboardingEmail = ({
	ownerName,
	restaurantName,
	resetLink,
}) => {
	const safeOwnerName = escapeHtml(ownerName || "there");
	const safeRestaurantName = escapeHtml(restaurantName || "your restaurant");
	const safeResetLink = escapeHtml(resetLink);

	return `
		<div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
			<h2 style="color: #006d77;">Welcome to Scerv</h2>
			<p>Hi ${safeOwnerName},</p>
			<p>Your Scerv owner account for <strong>${safeRestaurantName}</strong> is ready.</p>
			<p>Use the button below to set your password and sign in.</p>
			<p>
				<a href="${safeResetLink}" style="background:#006d77;color:#fff;padding:12px 18px;border-radius:4px;text-decoration:none;display:inline-block;">
					Set password
				</a>
			</p>
			<p>After signing in, finish these setup steps:</p>
			<ol>
				<li>Create your owner employee profile and PIN.</li>
				<li>Add managers and staff.</li>
				<li>Finish tables, menu, and operating settings.</li>
				<li>Connect Stripe payouts before taking live payments.</li>
			</ol>
			<p>If the button does not work, paste this link into your browser:</p>
			<p style="word-break:break-all;">${safeResetLink}</p>
			<p style="margin-top:24px;">The Scerv team</p>
		</div>
	`;
};

const sendRestaurantOnboardingEmail = async ({
	email,
	ownerName,
	restaurantName,
	resetLink,
}) => {
	const resend = getResendClient();
	if (!resend) {
		return { sent: false, reason: "RESEND_API_KEY is not configured." };
	}

	await resend.emails.send({
		from: "Scerv <noreply@scerv.com>",
		to: email,
		subject: `Set up ${restaurantName || "your restaurant"} on Scerv`,
		html: buildRestaurantOnboardingEmail({
			ownerName,
			restaurantName,
			resetLink,
		}),
	});

	return { sent: true };
};

exports.saveRestaurantFeatureEntitlements = functions.https.onCall(
	async (data, context) => {
		const uid = requireScervAdmin(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 120);
		const entitlements = (data && data.featureEntitlements) || {};
		const subscriptionInput = (data && data.subscription) || {};

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const restaurantSnap = await restaurantRef.get();
		if (!restaurantSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found.");
		}

		const currentRestaurant = restaurantSnap.data() || {};
		const cleanEntitlements = {
			...(currentRestaurant.featureEntitlements || {}),
		};
		FEATURE_KEYS.forEach((key) => {
			if (typeof entitlements[key] === "boolean") {
				cleanEntitlements[key] = entitlements[key];
			}
		});

		const planLevel = SUBSCRIPTION_PLANS.includes(
			sanitizeString(subscriptionInput.planLevel, 40),
		)
			? sanitizeString(subscriptionInput.planLevel, 40)
			: sanitizeString(currentRestaurant.planLevel || "starter", 40);
		const subscriptionStatus = SUBSCRIPTION_STATUSES.includes(
			sanitizeString(subscriptionInput.subscriptionStatus, 40),
		)
			? sanitizeString(subscriptionInput.subscriptionStatus, 40)
			: sanitizeString(currentRestaurant.subscriptionStatus || "trial", 40);
		const trialEndsAt = sanitizeString(subscriptionInput.trialEndsAt, 40);
		const billingNotes = sanitizeString(subscriptionInput.billingNotes, 1000);
		const billingProvider = sanitizeString(subscriptionInput.billingProvider, 80);
		const externalSubscriptionId = sanitizeString(
			subscriptionInput.externalSubscriptionId,
			160,
		);
		const featurePatch = {};

		// When Scerv revokes access, the restaurant-facing toggle should also
		// switch off immediately so screens do not briefly advertise locked tools.
		if (cleanEntitlements.reservations === false) {
			featurePatch["features.reservations"] = false;
			featurePatch["reservationSettings.enabled"] = false;
			featurePatch["reservationSettings.reservationsEnabled"] = false;
		}
		if (cleanEntitlements.reservationWaitlist === false) {
			featurePatch["features.reservationWaitlist"] = false;
			featurePatch["reservationSettings.waitlistEnabled"] = false;
		}
		if (cleanEntitlements.hostCheckInRequests === false) {
			featurePatch["features.hostCheckInRequests"] = false;
			featurePatch["experienceSettings.hostCheckInRequestsEnabled"] = false;
		}
		if (cleanEntitlements.rewards === false) {
			featurePatch["features.loyaltyClub"] = false;
		}

		await restaurantRef.set(
			{
				...featurePatch,
				featureEntitlements: cleanEntitlements,
				subscriptionFeatures: cleanEntitlements,
				planLevel,
				subscriptionStatus,
				subscription: {
					planLevel,
					status: subscriptionStatus,
					trialEndsAt: trialEndsAt || null,
					billingProvider: billingProvider || null,
					externalSubscriptionId: externalSubscriptionId || null,
					billingNotes: billingNotes || null,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					updatedBy: uid,
				},
				entitlementsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
				entitlementsUpdatedBy: uid,
			},
			{ merge: true },
		);

		await writeAdminAuditLog(uid, "save_restaurant_subscription_controls", {
			restaurantId,
			planLevel,
			subscriptionStatus,
			featureEntitlements: cleanEntitlements,
		});

		return {
			success: true,
			restaurantId,
			featureEntitlements: cleanEntitlements,
			subscription: {
				planLevel,
				status: subscriptionStatus,
				trialEndsAt: trialEndsAt || null,
			},
		};
	},
);

exports.getScervAdminDashboardStats = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context);

		const [restaurantsSnapshot, customersSnapshot, ordersSnapshot] =
			await Promise.all([
				db.collection("restaurants").count().get(),
				db.collection("customers").count().get(),
				db.collection("orders").count().get(),
			]);

		return {
			totalRestaurants: restaurantsSnapshot.data().count || 0,
			totalCustomers: customersSnapshot.data().count || 0,
			totalOrders: ordersSnapshot.data().count || 0,
		};
	},
);

exports.createScervRestaurantOnboarding = functions
	.runWith({ secrets: [RESEND_API_KEY] })
	.https.onCall(async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const payload = (data && data.restaurant) || {};
		const owner = (data && data.owner) || {};
		const emailOwner = data && data.emailOwner !== false;

		const email = normalizeEmail(owner.email);
		const restaurantName = sanitizeString(payload.restaurantName, 160);
		const firstName = sanitizeString(owner.firstName, 100);
		const lastName = sanitizeString(owner.lastName, 100);
		const ownerName = `${firstName} ${lastName}`.trim();
		const phoneNumber = normalizeInternationalPhone(
			owner.phoneNumber || payload.phoneNumber,
		);
		const address = sanitizeString(payload.address, 240);
		const city = sanitizeString(payload.city, 120);
		const state = sanitizeString(payload.state, 120);
		const zipcode = sanitizeString(payload.zipcode, 40);
		const countryCode = sanitizeString(payload.countryCode || "US", 8).toUpperCase();
		const country =
			sanitizeString(payload.country, 120) ||
			COUNTRY_NAMES[countryCode] ||
			countryCode;

		if (
			!email ||
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
			!restaurantName ||
			!firstName ||
			!lastName ||
			!phoneNumber ||
			!address ||
			!city ||
			!state ||
			!zipcode
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant, owner, email, phone, and address fields are required.",
			);
		}

		let userRecord;
		let createdAuthUser = false;
		const temporaryPassword = `${crypto.randomBytes(18).toString("base64")}Aa1!`;

		try {
			userRecord = await admin.auth().getUserByEmail(email);
		} catch (error) {
			if (error.code !== "auth/user-not-found") throw error;
			userRecord = await admin.auth().createUser({
				email,
				password: temporaryPassword,
				displayName: ownerName || restaurantName,
				emailVerified: false,
				disabled: false,
			});
			createdAuthUser = true;
		}

		const restaurantId = userRecord.uid;
		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const existingRestaurantSnap = await restaurantRef.get();
		if (existingRestaurantSnap.exists && !data.allowExistingRestaurantUpdate) {
			throw new functions.https.HttpsError(
				"already-exists",
				"A restaurant profile already exists for this owner email.",
			);
		}

		await admin.auth().updateUser(restaurantId, {
			displayName: ownerName || restaurantName,
			disabled: false,
		});
		await admin.auth().setCustomUserClaims(restaurantId, {
			role: "owner",
			restaurantId,
		});

		const restaurantNumber =
			payload.restaurantNumber !== undefined &&
			payload.restaurantNumber !== null &&
			payload.restaurantNumber !== ""
				? Number(payload.restaurantNumber)
				: await generateUniqueRestaurantNumber();
		const featureEntitlements = getFeatureEntitlementDefaults(
			payload.featureEntitlements || {},
		);
		const now = admin.firestore.FieldValue.serverTimestamp();
		const restaurantDoc = {
			uid: restaurantId,
			role: "owner",
			restaurantName,
			restaurantNumber,
			email,
			phone: phoneNumber,
			phoneNumber,
			address,
			area: sanitizeString(payload.area, 120),
			city,
			state,
			zipcode,
			country,
			countryCode,
			cuisineType: sanitizeString(payload.cuisineType, 120),
			description: sanitizeString(payload.description, 800),
			taxRate: Number(payload.taxRate || 0),
			website: sanitizeString(payload.website, 240),
			imageUri: sanitizeString(payload.imageUri, 1000),
			onboardingStatus: "admin_created_pending_owner_login",
			isLive: Boolean(payload.isLive),
			isActive: payload.isActive !== false,
			isTestAccount: payload.isTestAccount !== false,
			isOpen: false,
			geoPoint: null,
			tags: [],
			hasSetupEmployees: false,
			platformCoverStripeFeeForRestaurant: false,
			stripeAccountId: null,
			stripeAccountStatus: "unverified",
			featureEntitlements,
			features: {
				reservations: featureEntitlements.reservations,
				reservationWaitlist: featureEntitlements.reservationWaitlist,
				hostCheckInRequests: featureEntitlements.hostCheckInRequests,
				reviews: featureEntitlements.reviews,
				loyaltyClub: featureEntitlements.rewards,
			},
			reservationSettings: {
				reservationsEnabled: featureEntitlements.reservations,
				waitlistEnabled: featureEntitlements.reservationWaitlist,
			},
			experienceSettings: {
				hostCheckInRequestsEnabled: featureEntitlements.hostCheckInRequests,
				qrSelfCheckInEnabled: true,
			},
			adminCreatedAt: now,
			adminCreatedBy: actorUid,
			updatedAt: now,
			...(existingRestaurantSnap.exists ? {} : { createdAt: now }),
		};

		await restaurantRef.set(restaurantDoc, { merge: true });
		await restaurantRef.collection("private").doc("owner").set(
			{
				email,
				firstName,
				lastName,
				fullName: ownerName,
				phoneNumber,
				createdAt: now,
				updatedAt: now,
				adminCreatedBy: actorUid,
			},
			{ merge: true },
		);

		const resetLink = await admin.auth().generatePasswordResetLink(email);
		let emailResult = { sent: false, reason: "Email sending was skipped." };
		if (emailOwner) {
			try {
				emailResult = await sendRestaurantOnboardingEmail({
					email,
					ownerName,
					restaurantName,
					resetLink,
				});
			} catch (error) {
				console.warn("Restaurant onboarding email failed:", error);
				emailResult = {
					sent: false,
					reason: error.message || "Email failed.",
				};
			}
		}

		await writeAdminAuditLog(actorUid, "create_restaurant_onboarding", {
			restaurantId,
			email,
			restaurantName,
			createdAuthUser,
			emailSent: emailResult.sent,
		});

		return {
			success: true,
			restaurantId,
			createdAuthUser,
			emailSent: emailResult.sent,
			emailWarning: emailResult.sent ? null : emailResult.reason,
			resetLink,
		};
	});

exports.listScervCustomers = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);

	const pageSize = Math.min(
		Math.max(parseInt((data && data.pageSize) || 25, 10), 1),
		100,
	);
	const pageToken = sanitizeString(data && data.pageToken, 160);

	let customersQuery = db
		.collection("customers")
		.orderBy(admin.firestore.FieldPath.documentId())
		.limit(pageSize + 1);

	if (pageToken) {
		customersQuery = customersQuery.startAfter(pageToken);
	}

	const [snapshot, totalSnapshot] = await Promise.all([
		customersQuery.get(),
		db.collection("customers").count().get(),
	]);
	const docs = snapshot.docs.slice(0, pageSize);
	const hasMore = snapshot.docs.length > pageSize;
	const nextPageToken =
		hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

	const customers = docs.map((doc) => {
		const customer = doc.data() || {};
		const displayName =
			customer.displayName ||
			customer.name ||
			[customer.firstName, customer.lastName].filter(Boolean).join(" ");

		return {
			id: doc.id,
			firstName: customer.firstName || "",
			lastName: customer.lastName || "",
			displayName,
			email: customer.email || "",
			phoneNumber: customer.phoneNumber || "",
			createdAt: customer.createdAt || null,
			lastLoginAt: customer.lastLoginAt || null,
			role: customer.role || "",
		};
	});

	return {
		customers,
		hasMore,
		nextPageToken,
		totalCustomers: totalSnapshot.data().count || 0,
	};
});

exports.searchScervAdminRecords = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);

	const queryText = sanitizeString(data && data.query, 160);
	if (queryText.length < 2) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Search requires at least 2 characters.",
		);
	}

	const lowerQuery = queryText.toLowerCase();
	const titleCaseQuery =
		queryText.charAt(0).toUpperCase() + queryText.slice(1).toLowerCase();
	const searches = [];

	searches.push(
		db.collection("customers").doc(queryText).get(),
		db.collection("restaurants").doc(queryText).get(),
		db.collection("orders").doc(queryText).get(),
		db.collection("reservations").doc(queryText).get(),
		db.collection("customers").where("email", "==", lowerQuery).limit(8).get(),
		db.collection("restaurants")
			.orderBy("restaurantName")
			.startAt(titleCaseQuery)
			.endAt(`${titleCaseQuery}\uf8ff`)
			.limit(8)
			.get(),
		db.collection("orders")
			.where("readableOrderId", "==", queryText)
			.limit(8)
			.get(),
	);

	const [
		customerDoc,
		restaurantDoc,
		orderDoc,
		reservationDoc,
		customerEmailSnap,
		restaurantNameSnap,
		orderReadableSnap,
	] = await Promise.all(searches);

	const customers = new Map();
	const restaurants = new Map();
	const orders = new Map();
	const reservations = new Map();

	if (customerDoc.exists) customers.set(customerDoc.id, serializeDoc(customerDoc));
	customerEmailSnap.docs.forEach((doc) => {
		customers.set(doc.id, serializeDoc(doc));
	});

	if (restaurantDoc.exists) restaurants.set(restaurantDoc.id, compactRestaurant(restaurantDoc));
	restaurantNameSnap.docs.forEach((doc) => {
		restaurants.set(doc.id, compactRestaurant(doc));
	});

	if (orderDoc.exists) orders.set(orderDoc.id, compactOrder(orderDoc));
	orderReadableSnap.docs.forEach((doc) => {
		orders.set(doc.id, compactOrder(doc));
	});

	if (reservationDoc.exists) {
		reservations.set(reservationDoc.id, compactReservation(reservationDoc));
	}

	return {
		query: queryText,
		customers: Array.from(customers.values()).slice(0, 10),
		restaurants: Array.from(restaurants.values()).slice(0, 10),
		orders: Array.from(orders.values()).slice(0, 10),
		reservations: Array.from(reservations.values()).slice(0, 10),
	};
});

exports.getScervCustomerProfile = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);

	const requestedCustomerId = sanitizeString(data && data.customerId, 128);
	const requestedEmail = sanitizeString(data && data.email, 254).toLowerCase();
	let customerId = requestedCustomerId;
	let customerSnap = customerId
		? await db.collection("customers").doc(customerId).get()
		: null;

	if ((!customerSnap || !customerSnap.exists) && requestedEmail) {
		const byEmailSnap = await db
			.collection("customers")
			.where("email", "==", requestedEmail)
			.limit(1)
			.get();
		if (!byEmailSnap.empty) {
			customerSnap = byEmailSnap.docs[0];
			customerId = customerSnap.id;
		}
	}

	if (!customerId || !customerSnap || !customerSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Customer not found.");
	}

	let authUser = null;
	try {
		authUser = publicUserFields(await admin.auth().getUser(customerId));
	} catch (error) {
		authUser = { uid: customerId, missingFromAuth: true };
	}

	const [
		ordersSnap,
		reservationsSnap,
		clubsSnap,
		promotionsSnap,
		ledgerSnap,
	] = await Promise.all([
		db.collection("orders").where("customerId", "==", customerId).limit(20).get(),
		db
			.collection("reservations")
			.where("customerId", "==", customerId)
			.limit(20)
			.get(),
		db
			.collection("customers")
			.doc(customerId)
			.collection("restaurantClubs")
			.limit(25)
			.get(),
		db
			.collection("customers")
			.doc(customerId)
			.collection("promotions")
			.limit(25)
			.get(),
		db
			.collection("customers")
			.doc(customerId)
			.collection("scervRewardsLedger")
			.limit(25)
			.get(),
	]);

	return {
		customer: serializeDoc(customerSnap),
		authUser,
		orders: ordersSnap.docs.map(compactOrder),
		reservations: reservationsSnap.docs.map(compactReservation),
		restaurantClubs: clubsSnap.docs.map(serializeDoc),
		promotions: promotionsSnap.docs.map(serializeDoc),
		rewardsLedger: ledgerSnap.docs.map(serializeDoc),
	};
});

exports.getScervRestaurantProfile = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context);

		const restaurantId = sanitizeString(data && data.restaurantId, 128);
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const restaurantSnap = await db.collection("restaurants").doc(restaurantId).get();
		if (!restaurantSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found.");
		}

		const [
			menuSnap,
			ordersSnap,
			reservationsSnap,
			checkInsSnap,
			tablesSnap,
			employeesSnap,
			ownerPrivateSnap,
			auditSnap,
		] = await Promise.all([
				db
					.collection("menuItems")
					.where("restaurantId", "==", restaurantId)
					.limit(150)
					.get(),
				db
					.collection("orders")
					.where("restaurantId", "==", restaurantId)
					.limit(20)
					.get(),
				db
					.collection("reservations")
					.where("restaurantId", "==", restaurantId)
					.limit(20)
					.get(),
				db
					.collection("checkIns")
					.where("restaurantId", "==", restaurantId)
					.limit(20)
					.get(),
				db
					.collection("restaurants")
					.doc(restaurantId)
					.collection("tables")
					.limit(100)
					.get(),
				db
					.collection("restaurants")
					.doc(restaurantId)
					.collection("employees")
					.limit(100)
					.get(),
				db
					.collection("restaurants")
					.doc(restaurantId)
					.collection("private")
					.doc("owner")
					.get(),
				db
					.collection("scervAdminAuditLogs")
					.orderBy("createdAt", "desc")
					.limit(100)
					.get(),
			]);

		const menuItems = menuSnap.docs
			.map(serializeDoc)
			.sort((a, b) =>
				`${a.category || ""} ${a.name || ""}`.localeCompare(
					`${b.category || ""} ${b.name || ""}`,
				),
			);

		return {
			restaurant: serializeDoc(restaurantSnap),
			owner:
				ownerPrivateSnap && ownerPrivateSnap.exists
					? serializeDoc(ownerPrivateSnap)
					: null,
			menuItems,
			orders: ordersSnap.docs.map(compactOrder),
			reservations: reservationsSnap.docs.map(compactReservation),
			checkIns: checkInsSnap.docs.map(serializeDoc),
			tables: tablesSnap.docs.map(serializeDoc),
			employees: employeesSnap.docs.map(serializeDoc),
			auditLogs: auditSnap.docs
				.map(serializeDoc)
				.filter((log) => log.payload && log.payload.restaurantId === restaurantId)
				.slice(0, 12),
		};
	},
);

exports.listScervAdminAuditLogs = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);

	const restaurantId = sanitizeString(data && data.restaurantId, 128);
	const actorUid = sanitizeString(data && data.actorUid, 128);
	const action = sanitizeString(data && data.action, 120);
	const pageSize = Math.min(
		Math.max(parseInt((data && data.pageSize) || 50, 10), 1),
		100,
	);

	const snapshot = await db
		.collection("scervAdminAuditLogs")
		.orderBy("createdAt", "desc")
		.limit(restaurantId || actorUid || action ? 300 : pageSize)
		.get();

	let logs = snapshot.docs.map(serializeDoc);
	if (restaurantId) {
		logs = logs.filter((log) => log.payload && log.payload.restaurantId === restaurantId);
	}
	if (actorUid) {
		logs = logs.filter((log) => log.actorUid === actorUid);
	}
	if (action) {
		logs = logs.filter((log) => log.action === action);
	}

	return { logs: logs.slice(0, pageSize) };
});

exports.resendRestaurantOwnerSetupEmail = functions
	.runWith({ secrets: [RESEND_API_KEY] })
	.https.onCall(async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 128);

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const [restaurantSnap, ownerSnap] = await Promise.all([
			restaurantRef.get(),
			restaurantRef.collection("private").doc("owner").get(),
		]);
		if (!restaurantSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found.");
		}

		const restaurant = restaurantSnap.data() || {};
		const owner = ownerSnap.exists ? ownerSnap.data() || {} : {};
		let email = normalizeEmail(owner.email || restaurant.email);
		let ownerName =
			owner.fullName ||
			`${owner.firstName || restaurant.firstName || ""} ${
				owner.lastName || restaurant.lastName || ""
			}`.trim();

		if (!email) {
			try {
				const authUser = await admin.auth().getUser(restaurantId);
				email = normalizeEmail(authUser.email);
				ownerName = ownerName || authUser.displayName || "";
			} catch (error) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"No owner email is available for this restaurant.",
				);
			}
		}

		const resetLink = await admin.auth().generatePasswordResetLink(email);
		let emailResult = { sent: false, reason: "Email sending was skipped." };
		try {
			emailResult = await sendRestaurantOnboardingEmail({
				email,
				ownerName,
				restaurantName: restaurant.restaurantName || restaurant.name,
				resetLink,
			});
		} catch (error) {
			console.warn("Owner setup resend email failed:", error);
			emailResult = {
				sent: false,
				reason: error.message || "Email failed.",
			};
		}

		await restaurantRef.set(
			{
				ownerSetupLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
				ownerSetupLastSentBy: actorUid,
			},
			{ merge: true },
		);
		await writeAdminAuditLog(actorUid, "resend_restaurant_owner_setup", {
			restaurantId,
			email,
			emailSent: emailResult.sent,
		});

		return {
			success: true,
			email,
			emailSent: emailResult.sent,
			emailWarning: emailResult.sent ? null : emailResult.reason,
			resetLink,
		};
	});

exports.listScervSupportCases = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);

	const status = sanitizeString(data && data.status, 80);
	const relatedId = sanitizeString(data && data.relatedId, 128);
	const pageSize = Math.min(
		Math.max(parseInt((data && data.pageSize) || 50, 10), 1),
		100,
	);

	const snapshot = await db
		.collection("scervSupportCases")
		.orderBy("updatedAt", "desc")
		.limit(status || relatedId ? 300 : pageSize)
		.get();

	let cases = snapshot.docs.map(serializeDoc);
	if (status) {
		cases = cases.filter((item) => item.status === status);
	}
	if (relatedId) {
		cases = cases.filter((item) => {
			const ids = [
				item.customerId,
				item.restaurantId,
				item.orderId,
				item.reservationId,
			].filter(Boolean);
			return ids.includes(relatedId);
		});
	}

	return { cases: cases.slice(0, pageSize) };
});

exports.saveScervSupportCase = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context);
	const caseId = sanitizeString(data && data.caseId, 128);
	const input = (data && data.supportCase) || {};
	const title = sanitizeString(input.title, 180);
	const description = sanitizeString(input.description, 2000);
	const status = sanitizeString(input.status || "open", 80);
	const priority = sanitizeString(input.priority || "normal", 80);
	const type = sanitizeString(input.type || "general", 80);

	if (!title) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Support case title is required.",
		);
	}

	const caseRef = caseId
		? db.collection("scervSupportCases").doc(caseId)
		: db.collection("scervSupportCases").doc();
	const now = admin.firestore.FieldValue.serverTimestamp();
	const payload = {
		title,
		description,
		status,
		priority,
		type,
		customerId: sanitizeString(input.customerId, 128) || null,
		customerEmail: normalizeEmail(input.customerEmail) || null,
		restaurantId: sanitizeString(input.restaurantId, 128) || null,
		restaurantName: sanitizeString(input.restaurantName, 160) || null,
		orderId: sanitizeString(input.orderId, 128) || null,
		reservationId: sanitizeString(input.reservationId, 128) || null,
		assignedTo: sanitizeString(input.assignedTo, 128) || null,
		updatedAt: now,
		updatedBy: actorUid,
		...(caseId ? {} : { createdAt: now, createdBy: actorUid }),
	};

	await caseRef.set(payload, { merge: true });
	await writeAdminAuditLog(actorUid, caseId ? "update_support_case" : "create_support_case", {
		caseId: caseRef.id,
		status,
		priority,
		restaurantId: payload.restaurantId,
		customerId: payload.customerId,
		orderId: payload.orderId,
	});

	return { success: true, caseId: caseRef.id };
});

exports.addScervSupportCaseNote = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context);
	const caseId = sanitizeString(data && data.caseId, 128);
	const note = sanitizeString(data && data.note, 2000);
	const nextStatus = sanitizeString(data && data.status, 80);

	if (!caseId || !note) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Support case ID and note are required.",
		);
	}

	const caseRef = db.collection("scervSupportCases").doc(caseId);
	const caseSnap = await caseRef.get();
	if (!caseSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Support case not found.");
	}

	const noteRef = caseRef.collection("notes").doc();
	await noteRef.set({
		note,
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
		createdBy: actorUid,
	});

	await caseRef.set(
		{
			...(nextStatus && { status: nextStatus }),
			lastNoteAt: admin.firestore.FieldValue.serverTimestamp(),
			lastNoteBy: actorUid,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedBy: actorUid,
		},
		{ merge: true },
	);

	await writeAdminAuditLog(actorUid, "add_support_case_note", {
		caseId,
		status: nextStatus || caseSnap.data().status || null,
	});

	return { success: true, noteId: noteRef.id };
});

exports.updateScervRestaurantProfile = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 128);
		const updates = (data && data.updates) || {};

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const allowedFields = [
			"restaurantName",
			"restaurantNumber",
			"address",
			"city",
			"state",
			"zipcode",
			"phoneNumber",
			"email",
			"firstName",
			"lastName",
			"cuisineType",
			"description",
			"taxRate",
			"website",
			"imageUri",
			"geoLat",
			"geoLong",
			"isActive",
			"backOfficePin",
		];
		const cleanUpdates = {};

		allowedFields.forEach((field) => {
			if (updates[field] === undefined) return;
			if (field === "isActive") {
				cleanUpdates[field] = Boolean(updates[field]);
			} else if (["restaurantNumber", "taxRate", "geoLat", "geoLong"].includes(field)) {
				const numericValue = Number(updates[field]);
				cleanUpdates[field] = Number.isFinite(numericValue) ? numericValue : 0;
			} else {
				cleanUpdates[field] = sanitizeString(updates[field], 1000);
			}
		});

		if (Object.keys(cleanUpdates).length === 0) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"No valid restaurant fields were provided.",
			);
		}

		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const restaurantSnap = await restaurantRef.get();
		if (!restaurantSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found.");
		}

		await restaurantRef.set(
			{
				...cleanUpdates,
				adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
				adminUpdatedBy: actorUid,
			},
			{ merge: true },
		);

		await writeAdminAuditLog(actorUid, "update_restaurant_profile", {
			restaurantId,
			fields: Object.keys(cleanUpdates),
		});

		return { success: true, restaurantId };
	},
);

exports.saveScervMenuItem = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 128);
	const itemId = sanitizeString(data && data.itemId, 128);
	const item = getMenuItemPayload(data && data.item);

	if (!restaurantId || !item.name || !item.category) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant, item name, and category are required.",
		);
	}

	const restaurantSnap = await db.collection("restaurants").doc(restaurantId).get();
	if (!restaurantSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}

	const itemRef = itemId
		? db.collection("menuItems").doc(itemId)
		: db.collection("menuItems").doc();
	const existingSnap = itemId ? await itemRef.get() : null;
	if (
		existingSnap &&
		existingSnap.exists &&
		existingSnap.data().restaurantId !== restaurantId
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Menu item does not belong to this restaurant.",
		);
	}

	await itemRef.set(
		{
			...item,
			restaurantId,
			adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
			adminUpdatedBy: actorUid,
			...(itemId
				? {}
				: {
						createdAt: admin.firestore.FieldValue.serverTimestamp(),
						createdBy: actorUid,
					}),
		},
		{ merge: true },
	);

	await writeAdminAuditLog(actorUid, itemId ? "update_menu_item" : "create_menu_item", {
		restaurantId,
		itemId: itemRef.id,
		itemName: item.name,
	});

	const savedSnap = await itemRef.get();
	return { success: true, menuItem: serializeDoc(savedSnap) };
});

exports.archiveScervMenuItem = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 128);
	const itemId = sanitizeString(data && data.itemId, 128);

	if (!restaurantId || !itemId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID and menu item ID are required.",
		);
	}

	const itemRef = db.collection("menuItems").doc(itemId);
	const itemSnap = await itemRef.get();
	if (!itemSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Menu item not found.");
	}

	if (itemSnap.data().restaurantId !== restaurantId) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Menu item does not belong to this restaurant.",
		);
	}

	await itemRef.set(
		{
			isActive: false,
			isArchived: true,
			archivedAt: admin.firestore.FieldValue.serverTimestamp(),
			archivedBy: actorUid,
			adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
			adminUpdatedBy: actorUid,
		},
		{ merge: true },
	);

	await writeAdminAuditLog(actorUid, "archive_menu_item", {
		restaurantId,
		itemId,
		itemName: itemSnap.data().name || "",
	});

	return { success: true, itemId };
});

exports.getScervOrderSupportDetail = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context);

		const orderId = sanitizeString(data && data.orderId, 128);
		if (!orderId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Order ID is required.",
			);
		}

		const orderSnap = await db.collection("orders").doc(orderId).get();
		if (!orderSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Order not found.");
		}

		const order = normalizeOrderForReporting(orderSnap);
		const rawOrder = serializeValue(order.raw || {});
		const [customerSnap, restaurantSnap, notesSnap, refundsSnap] =
			await Promise.all([
				order.customerId
					? db.collection("customers").doc(order.customerId).get()
					: Promise.resolve(null),
				order.restaurantId
					? db.collection("restaurants").doc(order.restaurantId).get()
					: Promise.resolve(null),
				db
					.collection("orders")
					.doc(orderId)
					.collection("supportNotes")
					.orderBy("createdAt", "desc")
					.limit(50)
					.get(),
				db
					.collection("orders")
					.doc(orderId)
					.collection("refunds")
					.orderBy("createdAt", "desc")
					.limit(50)
					.get(),
			]);

		const refundSummary = rawOrder.refundSummary || {};
		const refundedCents = normalizeNonNegativeCents(
			refundSummary.totalRefundedCents || rawOrder.refundedAmount,
		);
		const pendingRefundCents = normalizeNonNegativeCents(
			refundSummary.pendingRefundCents,
		);
		const refundableCents = Math.max(
			0,
			normalizeNonNegativeCents(order.totalPrice) -
				refundedCents -
				pendingRefundCents,
		);

		return {
			order: {
				...serializeValue(order),
				raw: rawOrder,
				paymentIntentId:
					rawOrder.stripePaymentIntentId ||
					rawOrder.paymentIntentId ||
					rawOrder.paymentProcessorId ||
					null,
				stripeConnectChargeType: rawOrder.stripeConnectChargeType || null,
				stripeApplicationFeeAmount:
					rawOrder.stripeApplicationFeeAmount ||
					rawOrder.applicationFeeAmount ||
					0,
				stripeDestinationTransferId:
					rawOrder.stripeDestinationTransferId || null,
				refundSummary: {
					...refundSummary,
					totalRefundedCents: refundedCents,
					pendingRefundCents,
					refundableCents,
				},
			},
			customer:
				customerSnap && customerSnap.exists ? serializeDoc(customerSnap) : null,
			restaurant:
				restaurantSnap && restaurantSnap.exists
					? compactRestaurant(restaurantSnap)
					: null,
			notes: notesSnap.docs.map(serializeDoc),
			refunds: refundsSnap.docs.map(serializeDoc),
		};
	},
);

exports.addScervOrderSupportNote = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const orderId = sanitizeString(data && data.orderId, 128);
		const note = sanitizeString(data && data.note, 2000);
		const status = sanitizeString(data && data.status, 80);

		if (!orderId || !note) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Order ID and note are required.",
			);
		}

		const orderRef = db.collection("orders").doc(orderId);
		const orderSnap = await orderRef.get();
		if (!orderSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Order not found.");
		}

		const noteRef = orderRef.collection("supportNotes").doc();
		await noteRef.set({
			note,
			status: status || "note",
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			createdBy: actorUid,
		});

		await orderRef.set(
			{
				supportStatus: status || "needs_review",
				lastSupportNoteAt: admin.firestore.FieldValue.serverTimestamp(),
				lastSupportNoteBy: actorUid,
			},
			{ merge: true },
		);

		await writeAdminAuditLog(actorUid, "add_order_support_note", {
			orderId,
			status: status || "note",
		});

		return { success: true, noteId: noteRef.id };
	},
);

exports.refundScervStripeOrder = functions
	.runWith({
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		const actorUid = requireScervAdmin(context, { godmodeOnly: true });
		const orderId = sanitizeString(data && data.orderId, 128);
		const amountCents = normalizeNonNegativeCents(data && data.amountCents);
		const reason = sanitizeString(data && data.reason, 600);
		const refundType = sanitizeString(data && data.refundType, 40) || "partial";

		if (!orderId || amountCents <= 0 || !reason) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Order ID, refund amount, and reason are required.",
			);
		}

		const orderRef = db.collection("orders").doc(orderId);
		const refundRef = orderRef.collection("refunds").doc();
		let orderDataForStripe = null;

		// Reserve the refund amount before touching Stripe so two admins cannot
		// accidentally refund more than the paid order total.
		await db.runTransaction(async (transaction) => {
			const orderSnap = await transaction.get(orderRef);
			if (!orderSnap.exists) {
				throw new functions.https.HttpsError("not-found", "Order not found.");
			}

			const orderData = orderSnap.data() || {};
			const paymentIntentId =
				orderData.stripePaymentIntentId ||
				orderData.paymentIntentId ||
				orderData.paymentProcessorId ||
				null;
			if (!paymentIntentId || orderData.paymentProcessor !== "stripe") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Only paid Stripe orders can be refunded here.",
				);
			}

			const refundSummary = orderData.refundSummary || {};
			const totalPrice = normalizeNonNegativeCents(orderData.totalPrice);
			const alreadyRefunded = normalizeNonNegativeCents(
				refundSummary.totalRefundedCents || orderData.refundedAmount,
			);
			const pendingRefunds = normalizeNonNegativeCents(
				refundSummary.pendingRefundCents,
			);
			const refundable = Math.max(0, totalPrice - alreadyRefunded - pendingRefunds);
			if (amountCents > refundable) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Refund amount exceeds the remaining refundable balance.",
				);
			}

			orderDataForStripe = {
				...orderData,
				id: orderId,
				paymentIntentId,
			};

			transaction.set(refundRef, {
				orderId,
				restaurantId: orderData.restaurantId || null,
				customerId: orderData.customerId || null,
				amountCents,
				reason,
				refundType,
				status: "pending",
				paymentIntentId,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				createdBy: actorUid,
			});
			transaction.set(
				orderRef,
				{
					refundSummary: {
						pendingRefundCents:
							admin.firestore.FieldValue.increment(amountCents),
						lastRefundRequestedAt:
							admin.firestore.FieldValue.serverTimestamp(),
						lastRefundRequestedBy: actorUid,
					},
					supportStatus: "refund_pending",
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);
		});

		const keys = await getStripeKeys(orderDataForStripe.restaurantId);
		const stripeInstance = stripe(keys.stripeSecretKey, {
			apiVersion: "2024-04-10",
		});
		const usesDestinationCharge =
			orderDataForStripe.stripeConnectChargeType === "destination_charge";
		const shouldRefundApplicationFee =
			usesDestinationCharge &&
			normalizeNonNegativeCents(
				orderDataForStripe.stripeApplicationFeeAmount ||
					orderDataForStripe.applicationFeeAmount,
			) > 0;

		try {
			const stripeRefund = await stripeInstance.refunds.create(
				{
					payment_intent: orderDataForStripe.paymentIntentId,
					amount: amountCents,
					reason: "requested_by_customer",
					metadata: {
						orderId,
						scervRefundId: refundRef.id,
						adminUid: actorUid,
						supportReason: reason,
						refundType,
					},
					...(usesDestinationCharge && { reverse_transfer: true }),
					...(shouldRefundApplicationFee && { refund_application_fee: true }),
				},
				{
					idempotencyKey: `scerv_admin_refund:${orderId}:${refundRef.id}`,
				},
			);

			await db.runTransaction(async (transaction) => {
				transaction.set(
					refundRef,
					{
						status: stripeRefund.status || "succeeded",
						stripeRefundId: stripeRefund.id,
						stripeRefundStatus: stripeRefund.status || null,
						stripeRefundedAt: admin.firestore.FieldValue.serverTimestamp(),
						updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);
				transaction.set(
					orderRef,
					{
						paymentStatus:
							refundType === "full" ? "refunded" : "partially_refunded",
						supportStatus: "refund_processed",
						refundSummary: {
							totalRefundedCents:
								admin.firestore.FieldValue.increment(amountCents),
							pendingRefundCents:
								admin.firestore.FieldValue.increment(-amountCents),
							lastRefundedAt:
								admin.firestore.FieldValue.serverTimestamp(),
							lastRefundedBy: actorUid,
							lastStripeRefundId: stripeRefund.id,
						},
						updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);
			});

			await writeAdminAuditLog(actorUid, "refund_stripe_order", {
				orderId,
				refundId: refundRef.id,
				stripeRefundId: stripeRefund.id,
				amountCents,
				reason,
				refundType,
			});

			return {
				success: true,
				refundId: refundRef.id,
				stripeRefundId: stripeRefund.id,
				status: stripeRefund.status || "succeeded",
			};
		} catch (error) {
			await db.runTransaction(async (transaction) => {
				transaction.set(
					refundRef,
					{
						status: "failed",
						errorMessage: error.message || String(error),
						failedAt: admin.firestore.FieldValue.serverTimestamp(),
						updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);
				transaction.set(
					orderRef,
					{
						supportStatus: "refund_failed",
						refundSummary: {
							pendingRefundCents:
								admin.firestore.FieldValue.increment(-amountCents),
							lastRefundFailedAt:
								admin.firestore.FieldValue.serverTimestamp(),
							lastRefundFailedBy: actorUid,
						},
						updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);
			});
			console.error("refundScervStripeOrder failed:", error);
			throw new functions.https.HttpsError(
				"internal",
				error.message || "Refund failed.",
			);
		}
	});

exports.listScervAdminUsers = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context, { godmodeOnly: true });

	const userPage = await admin.auth().listUsers(1000);
	const adminUsers = userPage.users.filter((userRecord) => {
		const role = String(
			(userRecord.customClaims && userRecord.customClaims.role) || "",
		).toLowerCase();
		return SCERV_ADMIN_ROLES.includes(role);
	});

	const profileRefs = adminUsers.map((userRecord) =>
		db.collection("scervAdminUsers").doc(userRecord.uid),
	);
	const profileSnapshots =
		profileRefs.length > 0 ? await db.getAll(...profileRefs) : [];
	const profileByUid = new Map(
		profileSnapshots
			.filter((snapshot) => snapshot.exists)
			.map((snapshot) => [snapshot.id, snapshot.data()]),
	);

	return {
		users: adminUsers.map((userRecord) =>
			publicUserFields(userRecord, profileByUid.get(userRecord.uid)),
		),
	};
});

exports.createScervAdminUser = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context, { godmodeOnly: true });
	const email = sanitizeString(data && data.email, 254).toLowerCase();
	const displayName = sanitizeString(data && data.displayName, 120);
	const password = String((data && data.password) || "");
	const role = normalizeAdminRole((data && data.role) || "admin");

	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A valid email is required.",
		);
	}

	if (!["admin", "godmode"].includes(role)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Role must be admin or godmode.",
		);
	}

	if (password.length < 12) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Temporary password must be at least 12 characters.",
		);
	}

	let userRecord;
	try {
		userRecord = await admin.auth().getUserByEmail(email);
		await admin.auth().updateUser(userRecord.uid, {
			displayName: displayName || userRecord.displayName || undefined,
			disabled: false,
			password,
		});
		userRecord = await admin.auth().getUser(userRecord.uid);
	} catch (error) {
		if (error.code !== "auth/user-not-found") {
			throw error;
		}

		userRecord = await admin.auth().createUser({
			email,
			password,
			displayName: displayName || undefined,
			disabled: false,
		});
	}

	await admin.auth().setCustomUserClaims(userRecord.uid, { role });
	await db.collection("scervAdminUsers").doc(userRecord.uid).set(
		{
			email,
			displayName: displayName || userRecord.displayName || "",
			role,
			disabled: false,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedBy: actorUid,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			createdBy: actorUid,
		},
		{ merge: true },
	);

	await writeAdminAuditLog(actorUid, "create_scerv_admin_user", {
		targetUid: userRecord.uid,
		email,
		role,
	});

	return {
		success: true,
		user: publicUserFields(await admin.auth().getUser(userRecord.uid)),
	};
});

exports.updateScervAdminUserRole = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context, { godmodeOnly: true });
		const targetUid = sanitizeString(data && data.uid, 128);
		const role = normalizeAdminRole((data && data.role) || "admin");

		if (!targetUid || !["admin", "godmode"].includes(role)) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"User ID and a valid role are required.",
			);
		}

		await admin.auth().setCustomUserClaims(targetUid, { role });
		const userRecord = await admin.auth().getUser(targetUid);
		await db.collection("scervAdminUsers").doc(targetUid).set(
			{
				email: userRecord.email || "",
				displayName: userRecord.displayName || "",
				role,
				disabled: Boolean(userRecord.disabled),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedBy: actorUid,
			},
			{ merge: true },
		);

		await writeAdminAuditLog(actorUid, "update_scerv_admin_user_role", {
			targetUid,
			role,
		});

		return {
			success: true,
			user: publicUserFields(userRecord),
		};
	},
);

exports.setScervAdminUserDisabled = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context, { godmodeOnly: true });
		const targetUid = sanitizeString(data && data.uid, 128);
		const disabled = Boolean(data && data.disabled);

		if (!targetUid) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"User ID is required.",
			);
		}

		if (targetUid === actorUid && disabled) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"You cannot disable your own godmode account.",
			);
		}

		const userRecord = await admin.auth().updateUser(targetUid, { disabled });
		await db.collection("scervAdminUsers").doc(targetUid).set(
			{
				disabled,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedBy: actorUid,
			},
			{ merge: true },
		);

		await writeAdminAuditLog(actorUid, "set_scerv_admin_user_disabled", {
			targetUid,
			disabled,
		});

		return {
			success: true,
			user: publicUserFields(userRecord),
		};
	},
);
