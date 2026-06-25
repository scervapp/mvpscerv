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
const PROMOTION_TYPES = [
	"discount_amount",
	"discount_percent",
	"free_item",
	"perk",
];
const PROMOTION_STATUSES = ["available", "redeemed", "cancelled", "expired"];
const WALLET_DEFINITION_COLLECTIONS = [
	"scervWalletBadges",
	"scervRewardRules",
];

const DEMO_LEAD_STATUSES = [
	"new",
	"contacted",
	"scheduled",
	"closed",
	"spam",
];
const NEWSLETTER_STATUSES = [
	"subscribed",
	"paused",
	"unsubscribed",
	"bounced",
	"spam",
];
const NEWSLETTER_AUDIENCES = ["restaurant_operator", "dining_guest", "both"];
const SCERV_DEMO_NOTIFICATION_EMAIL = "admin@scerv.com";

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

const normalizeDollarsToCents = (value, fallback = 0) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.round(parsed * 100);
};

const normalizePercent = (value) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.round(parsed * 100) / 100;
};

const normalizeLeadStatus = (value) => {
	const normalized = sanitizeString(value || "new", 40).toLowerCase();
	return DEMO_LEAD_STATUSES.includes(normalized) ? normalized : "new";
};

const normalizeNewsletterStatus = (value) => {
	const normalized = sanitizeString(value || "subscribed", 40).toLowerCase();
	return NEWSLETTER_STATUSES.includes(normalized) ? normalized : "subscribed";
};

const normalizeNewsletterAudience = (value) => {
	const normalized = sanitizeString(value || "restaurant_operator", 60)
		.toLowerCase();
	return NEWSLETTER_AUDIENCES.includes(normalized)
		? normalized
		: "restaurant_operator";
};

const normalizePromotionType = (value) => {
	const normalized = sanitizeString(value || "discount_amount", 80);
	return PROMOTION_TYPES.includes(normalized) ? normalized : "discount_amount";
};

const normalizePromotionStatus = (value) => {
	const normalized = sanitizeString(value || "available", 80);
	return PROMOTION_STATUSES.includes(normalized) ? normalized : "available";
};

const parseOptionalTimestamp = (value) => {
	if (!value) return null;
	if (value instanceof admin.firestore.Timestamp) return value;
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return admin.firestore.Timestamp.fromDate(value);
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return admin.firestore.Timestamp.fromDate(parsed);
};

const normalizeCriteria = (criteria = {}) => ({
	metric: sanitizeString(criteria.metric, 80) || "availablePoints",
	operator: sanitizeString(criteria.operator, 20) || "gte",
	value: Number(criteria.value || 0),
});

const normalizeFirestorePath = (value, expectedType) => {
	const path = String(value || "")
		.trim()
		.replace(/^\/+|\/+$/g, "");
	const segments = path.split("/").filter(Boolean);
	if (!path || segments.length === 0 || segments.length > 20) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A valid Firestore path is required.",
		);
	}
	if (segments.some((segment) => segment.length > 180)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Firestore path segments are too long.",
		);
	}
	if (expectedType === "collection" && segments.length % 2 === 0) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Collection paths must have an odd number of segments.",
		);
	}
	if (expectedType === "document" && segments.length % 2 !== 0) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Document paths must have an even number of segments.",
		);
	}
	return path;
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

const resolveCustomerReference = async ({ customerId, customerEmail }) => {
	const requestedCustomerId = sanitizeString(customerId, 128);
	const requestedEmail = normalizeEmail(customerEmail);

	if (requestedCustomerId) {
		const customerSnap = await db
			.collection("customers")
			.doc(requestedCustomerId)
			.get();
		if (customerSnap.exists) {
			return { customerId: customerSnap.id, customer: customerSnap.data() || {} };
		}
	}

	if (requestedEmail) {
		const emailSnap = await db
			.collection("customers")
			.where("email", "==", requestedEmail)
			.limit(1)
			.get();
		if (!emailSnap.empty) {
			const customerSnap = emailSnap.docs[0];
			return { customerId: customerSnap.id, customer: customerSnap.data() || {} };
		}
	}

	throw new functions.https.HttpsError("not-found", "Customer not found.");
};

const normalizePromotionInput = (input = {}) => {
	const promotionType = normalizePromotionType(input.promotionType || input.type);
	const amountCents = normalizeDollarsToCents(
		input.amountDollars || input.discountAmountDollars || input.promotionValue,
	);
	const maxDiscountCents = normalizeDollarsToCents(
		input.maxDiscountDollars || input.maxValueDollars,
	);
	const percent = normalizePercent(input.percent || input.promotionValue);
	const isFoodCredit =
		input.walletValueType === "food_credit" ||
		input.isFoodCredit === true ||
		input.type === "food_credit";
	const computedMaxDiscount =
		promotionType === "discount_amount"
			? amountCents
			: promotionType === "discount_percent"
				? maxDiscountCents
				: maxDiscountCents || amountCents;

	return {
		title: sanitizeString(input.title, 160),
		description: sanitizeString(input.description, 500),
		promotionType,
		promotionValue:
			promotionType === "discount_percent" ? percent : amountCents / 100,
		maxDiscountCents: computedMaxDiscount,
		itemLabel: sanitizeString(input.itemLabel, 120),
		restaurantId: sanitizeString(input.restaurantId, 128) || "global",
		restaurantName: sanitizeString(input.restaurantName, 160),
		allowedRestaurantIds: Array.isArray(input.allowedRestaurantIds)
			? input.allowedRestaurantIds
					.map((id) => sanitizeString(id, 128))
					.filter(Boolean)
			: [],
		fundedBy: sanitizeString(input.fundedBy || "scerv", 80),
		reimbursementPolicy: sanitizeString(
			input.reimbursementPolicy || "reconcile",
			120,
		),
		internalMemo: sanitizeString(input.internalMemo, 1000),
		campaignId: sanitizeString(input.campaignId, 128),
		walletValueType: isFoodCredit ? "food_credit" : "promotion",
		isFoodCredit,
		expiresAt: parseOptionalTimestamp(input.expiresAt),
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

const normalizeStringList = (value, maxItems = 24, maxLength = 80) => {
	const rawItems = Array.isArray(value)
		? value
		: String(value || "")
				.split(",")
				.map((item) => item.trim());
	const seen = new Set();

	return rawItems
		.map((item) => sanitizeString(item, maxLength))
		.filter(Boolean)
		.filter((item) => {
			const key = item.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, maxItems);
};

const normalizeInteger = (value, fallback = 0, min = 0, max = 100) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, Math.min(max, Math.round(parsed)));
};

const getMenuSearchKeywords = (item) => {
	const terms = [
		item.name,
		item.description,
		item.category,
		item.subcategory,
		item.menuSection,
		item.preparationStyle,
		item.popularityLabel,
		...item.tags,
		...item.cuisineTags,
		...item.dietaryTags,
		...item.allergenTags,
		...item.flavorTags,
		...item.mealPeriodTags,
		...item.dishAliases,
		...item.ingredients,
	]
		.join(" ")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((term) => term.length >= 2);

	return Array.from(new Set(terms)).slice(0, 120);
};

const getMenuItemPayload = (data) => ({
	name: sanitizeString(data && data.name, 120),
	description: sanitizeString(data && data.description, 800),
	price: normalizePriceCents(data && data.price),
	category: sanitizeString(data && data.category, 120),
	subcategory: sanitizeString(data && data.subcategory, 120),
	menuSection: sanitizeString(data && data.menuSection, 120),
	imageUri: sanitizeString(data && data.imageUri, 1000),
	thumbnailUri: sanitizeString(data && data.thumbnailUri, 1000),
	preparationStyle: sanitizeString(data && data.preparationStyle, 120),
	popularityLabel: sanitizeString(data && data.popularityLabel, 120),
	metadataNotes: sanitizeString(data && data.metadataNotes, 1000),
	spiceLevel: normalizeInteger(data && data.spiceLevel, 0, 0, 5),
	sortOrder: normalizeInteger(data && data.sortOrder, 0, 0, 10000),
	calories: normalizeInteger(data && data.calories, 0, 0, 10000),
	tags: normalizeStringList(data && data.tags),
	cuisineTags: normalizeStringList(data && data.cuisineTags),
	dietaryTags: normalizeStringList(data && data.dietaryTags),
	allergenTags: normalizeStringList(data && data.allergenTags),
	flavorTags: normalizeStringList(data && data.flavorTags),
	mealPeriodTags: normalizeStringList(data && data.mealPeriodTags),
	dishAliases: normalizeStringList(data && data.dishAliases),
	ingredients: normalizeStringList(data && data.ingredients, 40, 80),
	isActive: Boolean(data && data.isActive),
	isDailySpecial: Boolean(data && data.isDailySpecial),
	isFeatured: Boolean(data && data.isFeatured),
	isSignatureDish: Boolean(data && data.isSignatureDish),
	chefRecommended: Boolean(data && data.chefRecommended),
	isVegetarian: Boolean(data && data.isVegetarian),
	isVegan: Boolean(data && data.isVegan),
	isGlutenFree: Boolean(data && data.isGlutenFree),
	containsAlcohol: Boolean(data && data.containsAlcohol),
	ageRestricted: Boolean(data && data.ageRestricted),
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

const buildCustomerPasswordResetEmail = ({ customerName, resetLink }) => {
	const safeCustomerName = escapeHtml(customerName || "there");
	const safeResetLink = escapeHtml(resetLink);

	return `
		<div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
			<h2 style="color: #006d77;">Scerv account reset</h2>
			<p>Hi ${safeCustomerName},</p>
			<p>A Scerv support team member created a password reset link for your account.</p>
			<p>
				<a href="${safeResetLink}" style="background:#006d77;color:#fff;padding:12px 18px;border-radius:4px;text-decoration:none;display:inline-block;">
					Reset password
				</a>
			</p>
			<p>If the button does not work, paste this link into your browser:</p>
			<p style="word-break:break-all;">${safeResetLink}</p>
			<p style="margin-top:24px;">The Scerv team</p>
		</div>
	`;
};

const sendCustomerPasswordResetEmail = async ({
	email,
	customerName,
	resetLink,
}) => {
	const resend = getResendClient();
	if (!resend) {
		return { sent: false, reason: "RESEND_API_KEY is not configured." };
	}

	await resend.emails.send({
		from: "Scerv <noreply@scerv.com>",
		to: email,
		subject: "Reset your Scerv password",
		html: buildCustomerPasswordResetEmail({ customerName, resetLink }),
	});

	return { sent: true };
};

const buildDemoLeadNotificationEmail = ({ leadId, lead }) => {
	const submittedAt = lead.createdAt && lead.createdAt.toDate
		? lead.createdAt.toDate().toLocaleString("en-US", {
			timeZone: "America/New_York",
		})
		: "Just now";

	return `
		<div style="font-family:Arial,sans-serif;line-height:1.6;color:#132027">
			<h2 style="color:#082f3a;margin-bottom:8px">New Scerv demo request</h2>
			<p>A restaurant lead just requested a demo through the Scerv website.</p>
			<table style="border-collapse:collapse;width:100%;max-width:640px">
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Name</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(lead.name)}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Restaurant</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(lead.restaurantName)}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(lead.email)}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Phone</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(lead.phone)}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Submitted</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(submittedAt)}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Lead ID</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(leadId)}</td></tr>
			</table>
			${lead.message ? `<h3 style="margin-top:22px">Message</h3><p style="white-space:pre-line">${escapeHtml(lead.message)}</p>` : ""}
			<p style="margin-top:22px">
				<a href="https://admin.scerv.com/demo-leads" style="background:#f18220;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none;font-weight:700">Open Demo Leads</a>
			</p>
		</div>
	`;
};

const sendDemoLeadNotificationEmail = async ({ leadId, lead }) => {
	const resend = getResendClient();
	if (!resend) {
		return { sent: false, reason: "RESEND_API_KEY is not configured." };
	}

	await resend.emails.send({
		from: "Scerv <noreply@scerv.com>",
		to: SCERV_DEMO_NOTIFICATION_EMAIL,
		replyTo: lead.email,
		subject: `New Scerv demo request: ${lead.restaurantName}`,
		html: buildDemoLeadNotificationEmail({ leadId, lead }),
	});

	return { sent: true };
};

const buildNewsletterSignupNotificationEmail = ({ subscriberId, subscriber }) => {
	const submittedAt = subscriber.createdAt && subscriber.createdAt.toDate
		? subscriber.createdAt.toDate().toLocaleString("en-US", {
			timeZone: "America/New_York",
		})
		: "Just now";

	return `
		<div style="font-family:Arial,sans-serif;line-height:1.6;color:#132027">
			<h2 style="color:#082f3a;margin-bottom:8px">New Scerv newsletter signup</h2>
			<p>Someone joined the Scerv resource newsletter from the website.</p>
			<table style="border-collapse:collapse;width:100%;max-width:640px">
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(subscriber.email)}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Name</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(subscriber.name || "--")}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Audience</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(subscriber.audience)}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Source page</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(subscriber.pagePath || "--")}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Submitted</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(submittedAt)}</td></tr>
				<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Subscriber ID</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(subscriberId)}</td></tr>
			</table>
			<p style="margin-top:22px">
				<a href="https://admin.scerv.com/newsletter" style="background:#f18220;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none;font-weight:700">Open Newsletter Subscribers</a>
			</p>
		</div>
	`;
};

const buildNewsletterWelcomeEmail = ({ subscriber }) => `
	<div style="font-family:Arial,sans-serif;line-height:1.6;color:#132027">
		<h2 style="color:#082f3a;margin-bottom:8px">Welcome to Scerv</h2>
		<p>Thanks for joining the Scerv newsletter.</p>
		<p>We will send practical restaurant growth ideas, hospitality operating notes, and product updates as we build the future of dining.</p>
		<p style="margin-top:22px">
			<a href="https://www.scerv.com/resources" style="background:#f18220;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none;font-weight:700">Read Scerv resources</a>
		</p>
		<p style="color:#667085;font-size:13px;margin-top:24px">
			You are receiving this because ${escapeHtml(subscriber.email)} subscribed on scerv.com.
			To leave the list, reply to this email and we will remove you.
		</p>
	</div>
`;

const sendNewsletterSignupEmails = async ({ subscriberId, subscriber }) => {
	const resend = getResendClient();
	if (!resend) {
		return {
			adminSent: false,
			welcomeSent: false,
			reason: "RESEND_API_KEY is not configured.",
		};
	}

	const [adminResult, welcomeResult] = await Promise.allSettled([
		resend.emails.send({
			from: "Scerv <noreply@scerv.com>",
			to: SCERV_DEMO_NOTIFICATION_EMAIL,
			replyTo: subscriber.email,
			subject: `New Scerv newsletter signup: ${subscriber.email}`,
			html: buildNewsletterSignupNotificationEmail({
				subscriberId,
				subscriber,
			}),
		}),
		resend.emails.send({
			from: "Scerv <noreply@scerv.com>",
			to: subscriber.email,
			replyTo: SCERV_DEMO_NOTIFICATION_EMAIL,
			subject: "Welcome to the Scerv newsletter",
			html: buildNewsletterWelcomeEmail({ subscriber }),
		}),
	]);

	return {
		adminSent: adminResult.status === "fulfilled",
		welcomeSent: welcomeResult.status === "fulfilled",
		reason:
			(adminResult.reason && adminResult.reason.message) ||
			(welcomeResult.reason && welcomeResult.reason.message) ||
			null,
	};
};

const serializeDemoLead = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		name: data.name || "",
		restaurantName: data.restaurantName || "",
		email: data.email || "",
		phone: data.phone || "",
		message: data.message || "",
		status: data.status || "new",
		source: data.source || "website",
		notificationEmailSent: Boolean(data.notificationEmailSent),
		notificationEmailError: data.notificationEmailError || null,
		createdAt: data.createdAt instanceof admin.firestore.Timestamp
			? data.createdAt.toDate().toISOString()
			: null,
		updatedAt: data.updatedAt instanceof admin.firestore.Timestamp
			? data.updatedAt.toDate().toISOString()
			: null,
		contactedAt: data.contactedAt instanceof admin.firestore.Timestamp
			? data.contactedAt.toDate().toISOString()
			: null,
		notes: data.notes || "",
	};
};

const serializeNewsletterSubscriber = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		email: data.email || "",
		name: data.name || "",
		audience: data.audience || "restaurant_operator",
		status: data.status || "subscribed",
		source: data.source || "website_resources",
		pagePath: data.pagePath || "",
		signupCount: data.signupCount || 1,
		adminNotificationEmailSent: Boolean(data.adminNotificationEmailSent),
		welcomeEmailSent: Boolean(data.welcomeEmailSent),
		emailError: data.emailError || null,
		createdAt: data.createdAt instanceof admin.firestore.Timestamp
			? data.createdAt.toDate().toISOString()
			: null,
		updatedAt: data.updatedAt instanceof admin.firestore.Timestamp
			? data.updatedAt.toDate().toISOString()
			: null,
		lastSignupAt: data.lastSignupAt instanceof admin.firestore.Timestamp
			? data.lastSignupAt.toDate().toISOString()
			: null,
		notes: data.notes || "",
	};
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

		const safeCount = async (label, queryRef) => {
			try {
				const snapshot = await queryRef.count().get();
				return snapshot.data().count || 0;
			} catch (error) {
				console.error(`Failed to count ${label} for admin dashboard`, error);
				return 0;
			}
		};

		return {
			totalRestaurants: await safeCount("restaurants", db.collection("restaurants")),
			totalCustomers: await safeCount("customers", db.collection("customers")),
			totalOrders: await safeCount("orders", db.collection("orders")),
			newDemoLeads: await safeCount(
				"new demo requests",
				db.collection("demoRequests").where("status", "==", "new"),
			),
			activeNewsletterSubscribers: await safeCount(
				"active newsletter subscribers",
				db.collection("newsletterSubscribers").where("status", "==", "subscribed"),
			),
		};
	},
);

exports.submitScervDemoRequest = functions
	.runWith({ secrets: [RESEND_API_KEY] })
	.https.onCall(async (data, context) => {
		const name = sanitizeString(data && data.name, 120);
		const restaurantName = sanitizeString(data && data.restaurantName, 160);
		const email = normalizeEmail(data && data.email);
		const phone = sanitizeString(data && data.phone, 30);
		const message = sanitizeString(data && data.message, 2000);
		const now = admin.firestore.FieldValue.serverTimestamp();

		if (
			!name ||
			!restaurantName ||
			!email ||
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
			!phone ||
			phone.length < 8
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Name, restaurant, email, and phone are required.",
			);
		}

		const leadPayload = {
			name,
			restaurantName,
			email,
			phone,
			message,
			status: "new",
			source: "website",
			pagePath: sanitizeString(data && data.pagePath, 240),
			userAgent: sanitizeString(data && data.userAgent, 500),
			createdAt: now,
			updatedAt: now,
			legacyTimestamp: now,
			notificationEmailSent: false,
			notificationEmailError: null,
		};

		const leadRef = await db.collection("demoRequests").add(leadPayload);
		let emailResult = { sent: false, reason: "Email was not attempted." };

		try {
			emailResult = await sendDemoLeadNotificationEmail({
				leadId: leadRef.id,
				lead: {
					...leadPayload,
					createdAt: admin.firestore.Timestamp.now(),
				},
			});
		} catch (error) {
			console.warn("Demo lead notification email failed:", error);
			emailResult = {
				sent: false,
				reason: error.message || "Email failed.",
			};
		}

		await leadRef.set(
			{
				notificationEmailSent: emailResult.sent,
				notificationEmailError: emailResult.sent
					? null
					: sanitizeString(emailResult.reason, 500),
				notificationEmailTo: SCERV_DEMO_NOTIFICATION_EMAIL,
				notificationEmailAttemptedAt:
					admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		return {
			success: true,
			leadId: leadRef.id,
			emailSent: emailResult.sent,
			emailWarning: emailResult.sent ? null : emailResult.reason,
		};
	});

exports.submitScervNewsletterSignup = functions
	.runWith({ secrets: [RESEND_API_KEY] })
	.https.onCall(async (data, context) => {
		const email = normalizeEmail(data && data.email);
		const name = sanitizeString(data && data.name, 120);
		const audience = normalizeNewsletterAudience(data && data.audience);
		const source = sanitizeString(data && data.source, 120) || "website_resources";
		const pagePath = sanitizeString(data && data.pagePath, 240);
		const userAgent = sanitizeString(data && data.userAgent, 500);
		const now = admin.firestore.FieldValue.serverTimestamp();

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"A valid email address is required.",
			);
		}

		const subscriberId = crypto
			.createHash("sha256")
			.update(email)
			.digest("hex");
		const subscriberRef = db.collection("newsletterSubscribers").doc(subscriberId);
		let isNewSubscriber = false;

		await db.runTransaction(async (transaction) => {
			const existing = await transaction.get(subscriberRef);
			isNewSubscriber = !existing.exists;
			const existingData = existing.data() || {};
			transaction.set(
				subscriberRef,
				{
					email,
					name: name || existingData.name || "",
					audience,
					status: "subscribed",
					source,
					pagePath,
					userAgent,
					consentText:
						"Subscribed to receive Scerv resources, updates, and hospitality insights.",
					signupCount: admin.firestore.FieldValue.increment(1),
					createdAt: existing.exists ? existingData.createdAt || now : now,
					lastSignupAt: now,
					updatedAt: now,
					adminNotificationEmailSent:
						existingData.adminNotificationEmailSent || false,
					welcomeEmailSent: existingData.welcomeEmailSent || false,
					emailError: null,
				},
				{ merge: true },
			);
		});

		let emailResult = {
			adminSent: false,
			welcomeSent: false,
			reason: "Email was not attempted.",
		};

		if (isNewSubscriber) {
			try {
				emailResult = await sendNewsletterSignupEmails({
					subscriberId,
					subscriber: {
						email,
						name,
						audience,
						source,
						pagePath,
						createdAt: admin.firestore.Timestamp.now(),
					},
				});
			} catch (error) {
				console.warn("Newsletter signup email failed:", error);
				emailResult = {
					adminSent: false,
					welcomeSent: false,
					reason: error.message || "Email failed.",
				};
			}

			await subscriberRef.set(
				{
					adminNotificationEmailSent: emailResult.adminSent,
					welcomeEmailSent: emailResult.welcomeSent,
					emailError: emailResult.reason
						? sanitizeString(emailResult.reason, 500)
						: null,
					emailAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);
		}

		return {
			success: true,
			subscriberId,
			alreadySubscribed: !isNewSubscriber,
			adminEmailSent: emailResult.adminSent,
			welcomeEmailSent: emailResult.welcomeSent,
			emailWarning: emailResult.reason,
		};
	});

exports.listScervDemoLeads = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);
	const status = sanitizeString(data && data.status, 40).toLowerCase();
	let query = db
		.collection("demoRequests")
		.orderBy("createdAt", "desc")
		.limit(100);

	if (status && status !== "all") {
		query = db
			.collection("demoRequests")
			.where("status", "==", normalizeLeadStatus(status))
			.limit(100);
	}

	const snapshot = await query.get();
	const leads = snapshot.docs
		.map(serializeDemoLead)
		.sort((a, b) => String(b.createdAt || "").localeCompare(a.createdAt || ""))
		.slice(0, 75);

	return {
		leads,
	};
});

exports.updateScervDemoLead = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context);
	const leadId = sanitizeString(data && data.leadId, 160);
	const status = normalizeLeadStatus(data && data.status);
	const notes = sanitizeString(data && data.notes, 2000);

	if (!leadId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Lead ID is required.",
		);
	}

	const leadRef = db.collection("demoRequests").doc(leadId);
	const leadSnap = await leadRef.get();
	if (!leadSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Demo lead not found.");
	}

	const patch = {
		status,
		notes,
		updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		updatedBy: actorUid,
	};

	if (status === "contacted" || status === "scheduled") {
		patch.contactedAt = admin.firestore.FieldValue.serverTimestamp();
	}

	await leadRef.set(patch, { merge: true });
	await writeAdminAuditLog(actorUid, "update_demo_lead", {
		leadId,
		status,
	});

	const updatedSnap = await leadRef.get();
	return { lead: serializeDemoLead(updatedSnap) };
});

exports.listScervNewsletterSubscribers = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context);
		const status = sanitizeString(data && data.status, 40).toLowerCase();
		let query = db
			.collection("newsletterSubscribers")
			.orderBy("lastSignupAt", "desc")
			.limit(150);

		if (status && status !== "all") {
			query = db
				.collection("newsletterSubscribers")
				.where("status", "==", normalizeNewsletterStatus(status))
				.limit(150);
		}

		const snapshot = await query.get();
		const subscribers = snapshot.docs
			.map(serializeNewsletterSubscriber)
			.sort((a, b) =>
				String(b.lastSignupAt || b.createdAt || "").localeCompare(
					a.lastSignupAt || a.createdAt || "",
				),
			)
			.slice(0, 100);

		return { subscribers };
	},
);

exports.updateScervNewsletterSubscriber = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const subscriberId = sanitizeString(data && data.subscriberId, 160);
		const status = normalizeNewsletterStatus(data && data.status);
		const notes = sanitizeString(data && data.notes, 2000);

		if (!subscriberId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Subscriber ID is required.",
			);
		}

		const subscriberRef = db
			.collection("newsletterSubscribers")
			.doc(subscriberId);
		const subscriberSnap = await subscriberRef.get();
		if (!subscriberSnap.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Newsletter subscriber not found.",
			);
		}

		await subscriberRef.set(
			{
				status,
				notes,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedBy: actorUid,
			},
			{ merge: true },
		);
		await writeAdminAuditLog(actorUid, "update_newsletter_subscriber", {
			subscriberId,
			status,
		});

		const updatedSnap = await subscriberRef.get();
		return { subscriber: serializeNewsletterSubscriber(updatedSnap) };
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

exports.sendScervCustomerPasswordReset = functions
	.runWith({ secrets: [RESEND_API_KEY] })
	.https.onCall(async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const { customerId, customer } = await resolveCustomerReference({
			customerId: data && data.customerId,
			customerEmail: data && data.customerEmail,
		});
		let authUser = null;
		try {
			authUser = await admin.auth().getUser(customerId);
		} catch (error) {
			const email = normalizeEmail(customer.email || data.customerEmail);
			if (!email) {
				throw new functions.https.HttpsError(
					"not-found",
					"Customer auth user was not found and no email is available.",
				);
			}
			authUser = await admin.auth().getUserByEmail(email);
		}

		const email = normalizeEmail(authUser.email || customer.email);
		if (!email) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Customer does not have an email address.",
			);
		}

		const resetLink = await admin.auth().generatePasswordResetLink(email);
		let emailResult = { sent: false, reason: "Email sending was skipped." };
		try {
			emailResult = await sendCustomerPasswordResetEmail({
				email,
				customerName:
					customer.displayName ||
					customer.name ||
					`${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
				resetLink,
			});
		} catch (error) {
			console.warn("Customer password reset email failed:", error);
			emailResult = {
				sent: false,
				reason: error.message || "Email failed.",
			};
		}

		await writeAdminAuditLog(actorUid, "send_customer_password_reset", {
			customerId,
			email,
			emailSent: emailResult.sent,
		});

		return {
			success: true,
			customerId,
			email,
			emailSent: emailResult.sent,
			emailWarning: emailResult.sent ? null : emailResult.reason,
			resetLink,
		};
	});

exports.setScervCustomerDisabled = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const customerId = sanitizeString(data && data.customerId, 128);
		const disabled = Boolean(data && data.disabled);
		const reason = sanitizeString(data && data.reason, 1000);

		if (!customerId || !reason) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Customer ID and reason are required.",
			);
		}

		const userRecord = await admin.auth().updateUser(customerId, { disabled });
		await db.collection("customers").doc(customerId).set(
			{
				accountDisabled: disabled,
				accountDisabledReason: disabled ? reason : null,
				accountDisabledAt: disabled
					? admin.firestore.FieldValue.serverTimestamp()
					: null,
				accountDisabledBy: disabled ? actorUid : null,
				accountReactivatedAt: disabled
					? null
					: admin.firestore.FieldValue.serverTimestamp(),
				accountReactivatedBy: disabled ? null : actorUid,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		await writeAdminAuditLog(actorUid, "set_customer_disabled", {
			customerId,
			disabled,
			reason,
		});

		return { success: true, user: publicUserFields(userRecord) };
	},
);

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

exports.listScervPromotionLedger = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context);

		const customerId = sanitizeString(data && data.customerId, 128);
		const restaurantId = sanitizeString(data && data.restaurantId, 128);
		const status = sanitizeString(data && data.status, 80);
		const pageSize = Math.min(
			Math.max(parseInt((data && data.pageSize) || 100, 10), 1),
			200,
		);

		const [issuedSnap, redemptionsSnap, campaignsSnap] = await Promise.all([
			db.collectionGroup("promotions").limit(400).get(),
			db.collection("promotionRedemptions").limit(300).get(),
			db.collection("scervPromotionCampaigns").limit(100).get(),
		]);

		let promotions = issuedSnap.docs.map((doc) => {
			const parentCustomer = doc.ref.parent.parent;
			return {
				...serializeDoc(doc),
				customerId: parentCustomer ? parentCustomer.id : null,
			};
		});
		let redemptions = redemptionsSnap.docs.map(serializeDoc);

		if (customerId) {
			promotions = promotions.filter((item) => item.customerId === customerId);
			redemptions = redemptions.filter((item) => item.customerId === customerId);
		}
		if (restaurantId) {
			promotions = promotions.filter((item) => {
				const allowed = Array.isArray(item.allowedRestaurantIds)
					? item.allowedRestaurantIds
					: [];
				return item.restaurantId === restaurantId || allowed.includes(restaurantId);
			});
			redemptions = redemptions.filter(
				(item) => item.restaurantId === restaurantId,
			);
		}
		if (status) {
			promotions = promotions.filter((item) => item.status === status);
			redemptions = redemptions.filter((item) => item.status === status);
		}

		return {
			promotions: promotions.slice(0, pageSize),
			redemptions: redemptions.slice(0, pageSize),
			campaigns: campaignsSnap.docs.map(serializeDoc),
		};
	},
);

exports.issueScervCustomerPromotion = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const input = (data && data.promotion) || {};
		const { customerId, customer } = await resolveCustomerReference({
			customerId: input.customerId || data.customerId,
			customerEmail: input.customerEmail || data.customerEmail,
		});
		const promotion = normalizePromotionInput(input);

		if (!promotion.title) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Promotion title is required.",
			);
		}
		if (
			promotion.promotionType !== "perk" &&
			promotion.maxDiscountCents <= 0 &&
			promotion.promotionValue <= 0
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Promotion value is required.",
			);
		}

		const now = admin.firestore.FieldValue.serverTimestamp();
		const customerRef = db.collection("customers").doc(customerId);
		const promotionRef = customerRef.collection("promotions").doc();
		const campaignRef = promotion.campaignId
			? db.collection("scervPromotionCampaigns").doc(promotion.campaignId)
			: db.collection("scervPromotionCampaigns").doc();
		const campaignId = promotion.campaignId || campaignRef.id;
		const payload = {
			...promotion,
			id: promotionRef.id,
			campaignId,
			customerId,
			customerEmail: normalizeEmail(customer.email || input.customerEmail),
			customerName:
				customer.displayName ||
				customer.name ||
				`${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
				null,
			status: "available",
			source: "scerv_admin",
			createdBy: actorUid,
			createdAt: now,
			updatedAt: now,
		};
		const campaignPayload = {
			title: promotion.title,
			description: promotion.description,
			promotionType: promotion.promotionType,
			promotionValue: promotion.promotionValue,
			maxDiscountCents: promotion.maxDiscountCents,
			restaurantId: promotion.restaurantId,
			restaurantName: promotion.restaurantName || null,
			fundedBy: promotion.fundedBy,
			reimbursementPolicy: promotion.reimbursementPolicy,
			walletValueType: promotion.walletValueType,
			status: "active",
			updatedAt: now,
			updatedBy: actorUid,
			createdAt: now,
			createdBy: actorUid,
		};

		const customerUpdate = promotion.isFoodCredit
			? {
					rewardsSummary: {
						foodCreditCents: admin.firestore.FieldValue.increment(
							promotion.maxDiscountCents,
						),
						scervFoodCreditCents: admin.firestore.FieldValue.increment(
							promotion.maxDiscountCents,
						),
						availableFoodCreditCents: admin.firestore.FieldValue.increment(
							promotion.maxDiscountCents,
						),
						lastFoodCreditIssuedAt: now,
					},
				}
			: {};

		await db.runTransaction(async (transaction) => {
			transaction.set(campaignRef, campaignPayload, { merge: true });
			transaction.set(promotionRef, payload, { merge: true });
			if (promotion.isFoodCredit) {
				transaction.set(customerRef, customerUpdate, { merge: true });
			}
		});

		await writeAdminAuditLog(actorUid, "issue_customer_promotion", {
			customerId,
			promotionId: promotionRef.id,
			campaignId,
			title: promotion.title,
			walletValueType: promotion.walletValueType,
			maxDiscountCents: promotion.maxDiscountCents,
		});

		return { success: true, customerId, promotionId: promotionRef.id, campaignId };
	},
);

exports.cancelScervCustomerPromotion = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const customerId = sanitizeString(data && data.customerId, 128);
		const promotionId = sanitizeString(data && data.promotionId, 128);
		const reason = sanitizeString(data && data.reason, 500);

		if (!customerId || !promotionId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Customer ID and promotion ID are required.",
			);
		}

		const customerRef = db.collection("customers").doc(customerId);
		const promotionRef = customerRef.collection("promotions").doc(promotionId);

		await db.runTransaction(async (transaction) => {
			const promotionSnap = await transaction.get(promotionRef);
			if (!promotionSnap.exists) {
				throw new functions.https.HttpsError("not-found", "Promotion not found.");
			}
			const promotion = promotionSnap.data() || {};
			if (promotion.status === "redeemed") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Redeemed promotions cannot be cancelled.",
				);
			}

			const now = admin.firestore.FieldValue.serverTimestamp();
			transaction.set(
				promotionRef,
				{
					status: "cancelled",
					cancelledAt: now,
					cancelledBy: actorUid,
					cancelReason: reason || null,
					updatedAt: now,
				},
				{ merge: true },
			);

			if (
				promotion.walletValueType === "food_credit" ||
				promotion.isFoodCredit === true
			) {
				const amount = normalizeNonNegativeCents(promotion.maxDiscountCents, 0);
				transaction.set(
					customerRef,
					{
						rewardsSummary: {
							foodCreditCents: admin.firestore.FieldValue.increment(-amount),
							scervFoodCreditCents:
								admin.firestore.FieldValue.increment(-amount),
							availableFoodCreditCents:
								admin.firestore.FieldValue.increment(-amount),
						},
					},
					{ merge: true },
				);
			}
		});

		await writeAdminAuditLog(actorUid, "cancel_customer_promotion", {
			customerId,
			promotionId,
			reason,
		});

		return { success: true };
	},
);

exports.saveScervWalletDefinition = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context, { godmodeOnly: true });
		const collection = sanitizeString(data && data.collection, 80);
		const definitionId = sanitizeString(data && data.definitionId, 128);
		const input = (data && data.definition) || {};

		if (!WALLET_DEFINITION_COLLECTIONS.includes(collection)) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Unsupported wallet definition collection.",
			);
		}

		const definitionRef = definitionId
			? db.collection(collection).doc(definitionId)
			: db.collection(collection).doc();
		const payload = {
			id: definitionRef.id,
			title: sanitizeString(input.title, 160),
			label: sanitizeString(input.label || input.title, 160),
			description: sanitizeString(input.description, 500),
			rewardLabel: sanitizeString(input.rewardLabel, 160),
			icon: sanitizeString(input.icon || "sparkles-outline", 80),
			isActive: input.isActive !== false,
			isVisible: input.isVisible !== false,
			sortOrder: Number(input.sortOrder || 0),
			criteria: normalizeCriteria(input.criteria || {}),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedBy: actorUid,
			...(definitionId
				? {}
				: { createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: actorUid }),
		};

		await definitionRef.set(payload, { merge: true });
		await writeAdminAuditLog(actorUid, "save_wallet_definition", {
			collection,
			definitionId: definitionRef.id,
			title: payload.title,
		});

		return { success: true, definitionId: definitionRef.id };
	},
);

exports.getScervFirestoreCollection = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context, { godmodeOnly: true });
		const collectionPath = normalizeFirestorePath(
			data && data.collectionPath,
			"collection",
		);
		const pageSize = Math.min(
			Math.max(parseInt((data && data.pageSize) || 25, 10), 1),
			100,
		);

		const snapshot = await db.collection(collectionPath).limit(pageSize).get();
		return {
			collectionPath,
			docs: snapshot.docs.map(serializeDoc),
		};
	},
);

exports.getScervFirestoreDocument = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context, { godmodeOnly: true });
		const documentPath = normalizeFirestorePath(
			data && data.documentPath,
			"document",
		);
		const documentSnap = await db.doc(documentPath).get();

		return {
			documentPath,
			exists: documentSnap.exists,
			doc: documentSnap.exists ? serializeDoc(documentSnap) : null,
		};
	},
);

exports.setScervFirestoreDocument = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context, { godmodeOnly: true });
		const documentPath = normalizeFirestorePath(
			data && data.documentPath,
			"document",
		);
		const reason = sanitizeString(data && data.reason, 1000);
		const payload = data && data.payload;
		const merge = data && data.merge !== false;

		if (!reason) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"A reason is required for godmode data changes.",
			);
		}
		if (!payload || Array.isArray(payload) || typeof payload !== "object") {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Document payload must be a JSON object.",
			);
		}

		await db.doc(documentPath).set(payload, { merge });
		await writeAdminAuditLog(actorUid, "godmode_set_firestore_document", {
			documentPath,
			merge,
			reason,
			payloadKeys: Object.keys(payload).slice(0, 40),
		});

		return { success: true, documentPath };
	},
);

exports.deleteScervFirestoreDocument = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context, { godmodeOnly: true });
		const documentPath = normalizeFirestorePath(
			data && data.documentPath,
			"document",
		);
		const confirmPath = normalizeFirestorePath(
			data && data.confirmPath,
			"document",
		);
		const reason = sanitizeString(data && data.reason, 1000);

		if (confirmPath !== documentPath || !reason) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Confirm the exact document path and provide a reason.",
			);
		}

		await db.doc(documentPath).delete();
		await writeAdminAuditLog(actorUid, "godmode_delete_firestore_document", {
			documentPath,
			reason,
		});

		return { success: true, documentPath };
	},
);

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
			searchKeywords: getMenuSearchKeywords(item),
			discoveryMetadata: {
				managedByAdminPortal: true,
				lastTaggedAt: admin.firestore.FieldValue.serverTimestamp(),
				tagsVersion: 1,
			},
			adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
			adminUpdatedBy: actorUid,
			...(itemId
				? {}
				: {
						averageRating: 0,
						confidenceAdjustedRating: 0,
						rating: 0,
						ratingCount: 0,
						reviewCount: 0,
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
