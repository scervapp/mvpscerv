const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const { Resend } = require("resend");
const {
	assertFeatureAllowed,
	clampFeaturesToEntitlements,
	isFeatureAllowed,
} = require("./featureEntitlements");
const { assertRestaurantPermission } = require("./restaurantAccess");

const db = admin.firestore();
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const DAYS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
];

const DEFAULT_SETTINGS = {
	enabled: false,
	approvalMode: "manual",
	slotIntervalMinutes: 30,
	defaultTurnTimeMinutes: 90,
	minPartySize: 1,
	maxPartySize: 12,
	cancellationWindowHours: 4,
	emailConfirmationsEnabled: true,
	weeklySchedule: {},
	blackoutDates: [],
};

const ALLOWED_HOSPITALITY_STYLES = [
	"standard",
	"quick_service",
	"casual_dining",
	"full_service",
	"fine_dining",
	"hotel_concierge",
];

const EXPERIENCE_FEATURE_KEYS = [
	"reservations",
	"hostCheckInRequests",
	"qrSelfCheckIn",
	"parties",
	"pickup",
	"tableScanOrdering",
	"serviceRequests",
	"loyaltyClub",
];

const ACTIVE_RESERVATION_STATUSES = [
	"requested",
	"confirmed",
	"arrival_requested",
	"seated",
];

const CUSTOMER_CANCELABLE_STATUSES = [
	"requested",
	"confirmed",
	"arrival_requested",
];

const WAITLIST_OFFER_WINDOW_MINUTES = 10;

const sanitizeString = (value, maxLength = 240) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, maxLength);

const normalizeDate = (value) => sanitizeString(value, 10);

const normalizeTime = (value) => {
	const cleaned = sanitizeString(value, 5);
	return /^\d{2}:\d{2}$/.test(cleaned) ? cleaned : "";
};

const parseTimeToMinutes = (time) => {
	const normalized = normalizeTime(time);
	if (!normalized) return null;
	const [hours, minutes] = normalized.split(":").map((part) => Number(part));
	if (
		!Number.isInteger(hours) ||
		!Number.isInteger(minutes) ||
		hours < 0 ||
		hours > 23 ||
		minutes < 0 ||
		minutes > 59
	) {
		return null;
	}
	return hours * 60 + minutes;
};

const formatMinutesToTime = (minutes) => {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const getReservationSettingsRef = (restaurantId) =>
	db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("reservationSettings")
		.doc("general");

const getTrustLabel = (summary = {}) => {
	const completed = Number(summary.completedReservations || 0);
	const noShows = Number(summary.noShows || 0);
	const lateCancellations = Number(summary.lateCancellations || 0);

	if (completed >= 10 && noShows === 0) return "Preferred Guest";
	if (completed >= 3 && noShows <= 1) return "Reliable Guest";
	if (noShows >= 2 || lateCancellations >= 3) return "Confirmation Recommended";
	return "New Guest";
};

const requireAuth = (context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Authentication is required.",
		);
	}
	return context.auth.uid;
};

const assertRestaurantAccess = async (uid, restaurantId) => {
	const restaurantSnap = await db.collection("restaurants").doc(restaurantId).get();
	if (!restaurantSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}

	const restaurantData = restaurantSnap.data() || {};
	const ownerIds = [
		restaurantId,
		restaurantData.uid,
		restaurantData.ownerId,
		restaurantData.restaurantOwnerId,
	].filter(Boolean);

	if (!ownerIds.includes(uid)) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You do not have permission to manage this restaurant.",
		);
	}

	return { id: restaurantSnap.id, ...restaurantData };
};

const assertReservationSettingsAccess = async (context, restaurantId, employeeId) => {
	const employee = await assertRestaurantPermission({
		db,
		context,
		restaurantId,
		employeeId,
		allowedRoles: ["owner", "manager"],
		action: "change reservation settings",
	});

	const restaurantSnap = await db.collection("restaurants").doc(restaurantId).get();
	if (!restaurantSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}

	return {
		employee,
		restaurantData: { id: restaurantSnap.id, ...restaurantSnap.data() },
	};
};

const buildStartsAt = (date, time) => {
	const [year, month, day] = date.split("-").map((part) => Number(part));
	const [hours, minutes] = time.split(":").map((part) => Number(part));
	return admin.firestore.Timestamp.fromDate(
		new Date(Date.UTC(year, month - 1, day, hours, minutes, 0)),
	);
};

const mergeSettings = (settingsData = {}) => ({
	...DEFAULT_SETTINGS,
	...settingsData,
	weeklySchedule: settingsData.weeklySchedule || {},
	blackoutDates: Array.isArray(settingsData.blackoutDates)
		? settingsData.blackoutDates
		: [],
});

const getSettings = async (restaurantId) => {
	const snap = await getReservationSettingsRef(restaurantId).get();
	return mergeSettings(snap.exists ? snap.data() : {});
};

const getDayNameForDate = (date) => {
	const [year, month, day] = date.split("-").map((part) => Number(part));
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	return DAYS[utcDate.getUTCDay()];
};

const normalizeScheduleWindow = (window) => ({
	start: normalizeTime(window && window.start),
	end: normalizeTime(window && window.end),
	maxReservationsPerSlot: Math.max(
		1,
		Number((window && window.maxReservationsPerSlot) || 1),
	),
});

const getSlotCounts = async (restaurantId, date) => {
	// Keep slot capacity aligned with every reservation state that still holds a table.
	const snapshot = await db
		.collection("reservations")
		.where("restaurantId", "==", restaurantId)
		.where("requestedDate", "==", date)
		.where("status", "in", ACTIVE_RESERVATION_STATUSES)
		.get();

	const counts = {};
	snapshot.forEach((doc) => {
		const reservation = doc.data() || {};
		const time = reservation.requestedTime;
		if (!time) return;
		counts[time] = (counts[time] || 0) + 1;
	});
	return counts;
};

const buildAvailableSlots = async (restaurantId, date, partySize) => {
	const settings = await getSettings(restaurantId);
	if (!settings.enabled) {
		return {
			slots: [],
			reason: "disabled",
			message: "This restaurant is not accepting reservation requests yet.",
		};
	}
	if (settings.blackoutDates.includes(date)) {
		return {
			slots: [],
			reason: "blackout",
			message: "This date is not available for reservations.",
		};
	}
	if (partySize < settings.minPartySize || partySize > settings.maxPartySize) {
		return {
			slots: [],
			reason: "party_size",
			message: `Reservations are available for parties of ${settings.minPartySize}-${settings.maxPartySize}.`,
		};
	}

	const dayName = getDayNameForDate(date);
	const windows = Array.isArray(settings.weeklySchedule[dayName])
		? settings.weeklySchedule[dayName].map(normalizeScheduleWindow)
		: [];
	if (windows.length === 0) {
		return {
			slots: [],
			reason: "closed",
			message: "No reservation windows are set for this date.",
		};
	}
	const interval = Math.max(15, Number(settings.slotIntervalMinutes || 30));
	const counts = await getSlotCounts(restaurantId, date);
	const slots = [];

	windows.forEach((window) => {
		const startMinutes = parseTimeToMinutes(window.start);
		const endMinutes = parseTimeToMinutes(window.end);
		if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
			return;
		}

		for (let cursor = startMinutes; cursor < endMinutes; cursor += interval) {
			const time = formatMinutesToTime(cursor);
			const existingCount = counts[time] || 0;
			const remaining = Math.max(0, window.maxReservationsPerSlot - existingCount);

			if (remaining > 0) {
				slots.push({
					time,
					remaining,
					maxReservationsPerSlot: window.maxReservationsPerSlot,
				});
			}
		}
	});

	return {
		slots,
		reason: slots.length > 0 ? null : "full",
		message:
			slots.length > 0
				? null
				: "No reservation times are available for this date.",
	};
};

const getResendClient = () => {
	const apiKey = RESEND_API_KEY.value();
	if (!apiKey || apiKey.startsWith("dev-placeholder")) {
		return null;
	}
	return new Resend(apiKey);
};

const sendReservationEmail = async ({ to, subject, html }) => {
	if (!to) return;
	const resend = getResendClient();
	if (!resend) {
		console.warn("Reservation email skipped because RESEND_API_KEY is not configured.");
		return;
	}

	try {
		await resend.emails.send({
			from: "Scerv Reservations <noreply@scerv.com>",
			to,
			subject,
			html,
		});
	} catch (error) {
		console.warn("Reservation email failed after reservation update:", error);
	}
};

const assertNoCustomerTimeConflict = async ({ customerId, date, time }) => {
	// Query by customer only to avoid requiring a composite Firestore index during
	// testing; each customer should have a small reservation history in practice.
	const snapshot = await db
		.collection("reservations")
		.where("customerId", "==", customerId)
		.get();

	const hasConflict = snapshot.docs.some((doc) => {
		const reservation = doc.data() || {};
		return (
			reservation.requestedDate === date &&
			reservation.requestedTime === time &&
			ACTIVE_RESERVATION_STATUSES.includes(reservation.status)
		);
	});

	if (hasConflict) {
		throw new functions.https.HttpsError(
			"failed-precondition",
			"You already have an active reservation request for this time.",
		);
	}
};

const getCustomerProfile = async (customerId) => {
	const customerSnap = await db.collection("customers").doc(customerId).get();
	return customerSnap.exists ? customerSnap.data() || {} : {};
};

const buildReservationData = ({
	restaurantId,
	restaurantData,
	customerId,
	customerData,
	trustSummary = {},
	date,
	time,
	partySize,
	data = {},
	source = "customer_app",
	status = "requested",
}) => ({
	restaurantId,
	restaurantName:
		restaurantData.restaurantName || restaurantData.name || "Restaurant",
	customerId,
	customerName:
		sanitizeString(data.customerName, 120) ||
		sanitizeString(
			`${customerData.firstName || ""} ${customerData.lastName || ""}`,
			120,
		) ||
		"Scerv Guest",
	customerEmail:
		sanitizeString(data.customerEmail, 180) ||
		sanitizeString(customerData.email, 180) ||
		null,
	partySize,
	requestedDate: date,
	requestedTime: time,
	startsAt: buildStartsAt(date, time),
	occasion: sanitizeString(data.occasion, 80),
	seatingPreference: sanitizeString(data.seatingPreference, 80),
	allergyNotes: sanitizeString(data.allergyNotes, 400),
	guestNotes: sanitizeString(data.guestNotes, 600),
	status,
	customerReliabilityLabel: getTrustLabel(trustSummary),
	customerTrustSnapshot: {
		completedReservations: Number(trustSummary.completedReservations || 0),
		noShows: Number(trustSummary.noShows || 0),
		lateCancellations: Number(trustSummary.lateCancellations || 0),
	},
	source,
	approvalMode: status === "confirmed" ? "waitlist_auto_confirmed" : "manual",
	createdAt: admin.firestore.FieldValue.serverTimestamp(),
	updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

const offerWaitlistSlot = async ({ restaurantId, date, time, partySize }) => {
	const now = admin.firestore.Timestamp.now();
	const expiresAt = admin.firestore.Timestamp.fromMillis(
		now.toMillis() + WAITLIST_OFFER_WINDOW_MINUTES * 60 * 1000,
	);
	const waitlistSnap = await db
		.collection("reservationWaitlist")
		.where("restaurantId", "==", restaurantId)
		.get();

	const candidates = waitlistSnap.docs
		.map((doc) => ({ id: doc.id, ...doc.data() }))
		.filter(
			(entry) =>
				entry.requestedDate === date &&
				entry.status === "waiting" &&
				Number(entry.partySize || 0) <= Number(partySize || 0),
		)
		.sort((a, b) => {
			const aReliability = Number(
				(a.customerTrustSnapshot && a.customerTrustSnapshot.noShows) || 0,
			);
			const bReliability = Number(
				(b.customerTrustSnapshot && b.customerTrustSnapshot.noShows) || 0,
			);
			if (aReliability !== bReliability) return aReliability - bReliability;
			const aJoined =
				a.createdAt && typeof a.createdAt.toMillis === "function"
					? a.createdAt.toMillis()
					: 0;
			const bJoined =
				b.createdAt && typeof b.createdAt.toMillis === "function"
					? b.createdAt.toMillis()
					: 0;
			return aJoined - bJoined;
		});

	const candidate = candidates[0];
	if (!candidate) return null;

	await db.collection("reservationWaitlist").doc(candidate.id).set(
		{
			status: "offer_pending",
			offeredTime: time,
			offerExpiresAt: expiresAt,
			offeredAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		},
		{ merge: true },
	);

	await db.collection("customers").doc(candidate.customerId).collection("notifications").add({
		type: "reservation_waitlist_offer",
		waitlistId: candidate.id,
		restaurantId,
		title: "Reservation opened",
		message: `${candidate.restaurantName || "A restaurant"} has a ${time} opening. Confirm within ${WAITLIST_OFFER_WINDOW_MINUTES} minutes.`,
		read: false,
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
		expiresAt,
	});

	return candidate.id;
};

exports.getAvailableReservationSlots = functions.https.onCall(
	async (data, context) => {
		requireAuth(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 120);
		const date = normalizeDate(data && data.date);
		const partySize = Number((data && data.partySize) || 0);

		if (!restaurantId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || partySize <= 0) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant, date, and party size are required.",
			);
		}

		const availability = await buildAvailableSlots(restaurantId, date, partySize);
		return availability;
	},
);

exports.saveReservationSettings = functions.https.onCall(async (data, context) => {
	const uid = requireAuth(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 120);
	const employeeId = sanitizeString(data && data.employeeId, 120);
	const settings = (data && data.settings) || {};
	if (!restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID is required.",
		);
	}

	const { restaurantData } = await assertReservationSettingsAccess(
		context,
		restaurantId,
		employeeId,
	);
	if (settings.enabled === true) {
		assertFeatureAllowed(
			restaurantData,
			"reservations",
			"Reservations are not enabled for this restaurant plan.",
		);
	}

	// Keep reservation setup intentionally constrained in v1 so restaurants can
	// configure slots quickly without creating impossible calendar states.
	const weeklySchedule = {};
	DAYS.forEach((day) => {
		const windows = Array.isArray(settings.weeklySchedule && settings.weeklySchedule[day])
			? settings.weeklySchedule[day]
			: [];
		weeklySchedule[day] = windows
			.map(normalizeScheduleWindow)
			.filter((window) => window.start && window.end);
	});

	const cleanSettings = {
		enabled: settings.enabled === true,
		approvalMode: "manual",
		slotIntervalMinutes: Math.max(
			15,
			Number(settings.slotIntervalMinutes || 30),
		),
		defaultTurnTimeMinutes: Math.max(
			30,
			Number(settings.defaultTurnTimeMinutes || 90),
		),
		minPartySize: Math.max(1, Number(settings.minPartySize || 1)),
		maxPartySize: Math.max(1, Number(settings.maxPartySize || 12)),
		cancellationWindowHours: Math.max(
			0,
			Number(settings.cancellationWindowHours || 4),
		),
		emailConfirmationsEnabled: settings.emailConfirmationsEnabled !== false,
		weeklySchedule,
		blackoutDates: Array.isArray(settings.blackoutDates)
			? settings.blackoutDates.map(normalizeDate).filter(Boolean)
			: [],
		updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		updatedBy: uid,
	};

	await getReservationSettingsRef(restaurantId).set(cleanSettings, { merge: true });
	if (cleanSettings.enabled && isFeatureAllowed(restaurantData, "reservations")) {
		// Enabling slot availability should also expose the reservation action.
		await db.collection("restaurants").doc(restaurantId).set(
			{
				"features.reservations": true,
			},
			{ merge: true },
		);
	}
	return { success: true, settings: cleanSettings };
});

exports.saveRestaurantExperienceSettings = functions.https.onCall(
	async (data, context) => {
		const uid = requireAuth(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 120);
		const employeeId = sanitizeString(data && data.employeeId, 120);
		const hospitalityStyle = sanitizeString(data && data.hospitalityStyle, 60);
		const features = (data && data.features) || {};

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const { restaurantData } = await assertReservationSettingsAccess(
			context,
			restaurantId,
			employeeId,
		);

		const normalizedStyle = ALLOWED_HOSPITALITY_STYLES.includes(hospitalityStyle)
			? hospitalityStyle
			: "standard";
		const featurePatch = {};

		// Keep feature controls explicit; future billing can disable premium keys
		// here without every app screen needing to know plan rules.
		const allowedFeatures = clampFeaturesToEntitlements(
			features,
			restaurantData,
		);
		EXPERIENCE_FEATURE_KEYS.forEach((key) => {
			if (typeof allowedFeatures[key] === "boolean") {
				featurePatch[`features.${key}`] = allowedFeatures[key];
			}
		});

		await db
			.collection("restaurants")
			.doc(restaurantId)
			.set(
				{
					hospitalityStyle: normalizedStyle,
					...featurePatch,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);

		return { success: true };
	},
);

exports.createReservationRequest = functions.https.onCall(async (data, context) => {
	const customerId = requireAuth(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 120);
	const date = normalizeDate(data && data.date);
	const time = normalizeTime(data && data.time);
	const partySize = Number((data && data.partySize) || 0);

	if (!restaurantId || !date || !time || partySize <= 0) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant, date, time, and party size are required.",
		);
	}

	const [customerSnap, restaurantSnap, settings, trustSnap] = await Promise.all([
		db.collection("customers").doc(customerId).get(),
		db.collection("restaurants").doc(restaurantId).get(),
		getSettings(restaurantId),
		db
			.collection("customers")
			.doc(customerId)
			.collection("reservationTrust")
			.doc("summary")
			.get(),
	]);

	if (!restaurantSnap.exists || !settings.enabled) {
		throw new functions.https.HttpsError(
			"failed-precondition",
			"Reservations are not enabled for this restaurant.",
		);
	}
	const restaurantData = restaurantSnap.data() || {};
	assertFeatureAllowed(
		restaurantData,
		"reservations",
		"Reservations are not enabled for this restaurant plan.",
	);

	await assertNoCustomerTimeConflict({ customerId, date, time });

	const availability = await buildAvailableSlots(restaurantId, date, partySize);
	if (!availability.slots.some((slot) => slot.time === time)) {
		throw new functions.https.HttpsError(
			"failed-precondition",
			availability.message || "That reservation time is no longer available.",
		);
	}

	const customerData = customerSnap.exists ? customerSnap.data() || {} : {};
	const trustSummary = trustSnap.exists ? trustSnap.data() || {} : {};
	const reservationRef = db.collection("reservations").doc();

	// Reservation requests are manual-approval only in v1. This protects the
	// restaurant while still giving customers a clear, trackable request.
	await reservationRef.set(buildReservationData({
		restaurantId,
		customerId,
		restaurantData,
		customerData,
		trustSummary,
		date,
		time,
		partySize,
		data: data || {},
	}));

	return { success: true, reservationId: reservationRef.id };
});

exports.joinReservationWaitlist = functions.https.onCall(async (data, context) => {
	const customerId = requireAuth(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 120);
	const date = normalizeDate(data && data.date);
	const partySize = Number((data && data.partySize) || 0);

	if (!restaurantId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || partySize <= 0) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant, date, and party size are required.",
		);
	}

	const [restaurantSnap, settings, customerData, trustSnap, existingSnap] =
		await Promise.all([
			db.collection("restaurants").doc(restaurantId).get(),
			getSettings(restaurantId),
			getCustomerProfile(customerId),
			db
				.collection("customers")
				.doc(customerId)
				.collection("reservationTrust")
				.doc("summary")
				.get(),
			db
				.collection("reservationWaitlist")
				.where("customerId", "==", customerId)
				.get(),
		]);

	if (!restaurantSnap.exists || !settings.enabled) {
		throw new functions.https.HttpsError(
			"failed-precondition",
			"Reservations are not enabled for this restaurant.",
		);
	}
	const restaurantData = restaurantSnap.data() || {};
	assertFeatureAllowed(
		restaurantData,
		"reservationWaitlist",
		"Reservation waitlist is not enabled for this restaurant plan.",
	);
	const hasActiveWaitlistEntry = existingSnap.docs.some((doc) => {
		const entry = doc.data() || {};
		return (
			entry.restaurantId === restaurantId &&
			entry.requestedDate === date &&
			["waiting", "offer_pending"].includes(entry.status)
		);
	});
	if (hasActiveWaitlistEntry) {
		throw new functions.https.HttpsError(
			"already-exists",
			"You are already on the waitlist for this date.",
		);
	}

	const trustSummary = trustSnap.exists ? trustSnap.data() || {} : {};
	const waitlistRef = db.collection("reservationWaitlist").doc();

	await waitlistRef.set({
		restaurantId,
		restaurantName:
			restaurantData.restaurantName || restaurantData.name || "Restaurant",
		customerId,
		customerName:
			sanitizeString(data && data.customerName, 120) ||
			sanitizeString(
				`${customerData.firstName || ""} ${customerData.lastName || ""}`,
				120,
			) ||
			"Scerv Guest",
		customerEmail:
			sanitizeString(data && data.customerEmail, 180) ||
			sanitizeString(customerData.email, 180) ||
			null,
		partySize,
		requestedDate: date,
		status: "waiting",
		occasion: sanitizeString(data && data.occasion, 80),
		seatingPreference: sanitizeString(data && data.seatingPreference, 80),
		allergyNotes: sanitizeString(data && data.allergyNotes, 400),
		guestNotes: sanitizeString(data && data.guestNotes, 600),
		customerReliabilityLabel: getTrustLabel(trustSummary),
		customerTrustSnapshot: {
			completedReservations: Number(trustSummary.completedReservations || 0),
			noShows: Number(trustSummary.noShows || 0),
			lateCancellations: Number(trustSummary.lateCancellations || 0),
		},
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
		updatedAt: admin.firestore.FieldValue.serverTimestamp(),
	});

	return { success: true, waitlistId: waitlistRef.id };
});

exports.acceptWaitlistOffer = functions.https.onCall(async (data, context) => {
	const customerId = requireAuth(context);
	const waitlistId = sanitizeString(data && data.waitlistId, 120);
	if (!waitlistId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Waitlist offer is required.",
		);
	}

	const waitlistRef = db.collection("reservationWaitlist").doc(waitlistId);
	const reservationRef = db.collection("reservations").doc();

	return db.runTransaction(async (transaction) => {
		const waitlistSnap = await transaction.get(waitlistRef);
		if (!waitlistSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Waitlist offer not found.");
		}

		const offer = waitlistSnap.data() || {};
		if (offer.customerId !== customerId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"You can only accept your own waitlist offers.",
			);
		}
		if (offer.status !== "offer_pending" || !offer.offeredTime) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This waitlist offer is no longer available.",
			);
		}
		const offerExpiresAtMillis =
			offer.offerExpiresAt && typeof offer.offerExpiresAt.toMillis === "function"
				? offer.offerExpiresAt.toMillis()
				: 0;
		if (offerExpiresAtMillis <= Date.now()) {
			transaction.set(
				waitlistRef,
				{
					status: "expired",
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);
			throw new functions.https.HttpsError(
				"deadline-exceeded",
				"This waitlist offer has expired.",
			);
		}

		const activeSnap = await db
			.collection("reservations")
			.where("customerId", "==", customerId)
			.get();
		const hasConflict = activeSnap.docs.some((doc) => {
			const reservation = doc.data() || {};
			return (
				reservation.requestedDate === offer.requestedDate &&
				reservation.requestedTime === offer.offeredTime &&
				ACTIVE_RESERVATION_STATUSES.includes(reservation.status)
			);
		});
		if (hasConflict) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"You already have an active reservation at this time.",
			);
		}

		const restaurantSnap = await transaction.get(
			db.collection("restaurants").doc(offer.restaurantId),
		);
		const restaurantData = restaurantSnap.exists ? restaurantSnap.data() || {} : {};
		assertFeatureAllowed(
			restaurantData,
			"reservationWaitlist",
			"Reservation waitlist is not enabled for this restaurant plan.",
		);

		transaction.set(
			reservationRef,
			buildReservationData({
				restaurantId: offer.restaurantId,
				restaurantData,
				customerId,
				customerData: {
					firstName: offer.customerName,
					email: offer.customerEmail,
				},
				trustSummary: offer.customerTrustSnapshot || {},
				date: offer.requestedDate,
				time: offer.offeredTime,
				partySize: Number(offer.partySize || 1),
				data: offer,
				source: "waitlist",
				status: "confirmed",
			}),
		);
		transaction.set(
			waitlistRef,
			{
				status: "accepted",
				reservationId: reservationRef.id,
				acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		return { success: true, reservationId: reservationRef.id };
	});
});

exports.passWaitlistOffer = functions.https.onCall(async (data, context) => {
	const customerId = requireAuth(context);
	const waitlistId = sanitizeString(data && data.waitlistId, 120);
	if (!waitlistId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Waitlist offer is required.",
		);
	}

	const waitlistRef = db.collection("reservationWaitlist").doc(waitlistId);
	const waitlistSnap = await waitlistRef.get();
	if (!waitlistSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Waitlist offer not found.");
	}
	const offer = waitlistSnap.data() || {};
	if (offer.customerId !== customerId) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You can only pass your own waitlist offers.",
		);
	}

	await waitlistRef.set(
		{
			status: "passed",
			passedAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		},
		{ merge: true },
	);

	await offerWaitlistSlot({
		restaurantId: offer.restaurantId,
		date: offer.requestedDate,
		time: offer.offeredTime,
		partySize: offer.partySize,
	});

	return { success: true };
});

exports.cancelCustomerReservation = functions.https.onCall(async (data, context) => {
	const customerId = requireAuth(context);
	const reservationId = sanitizeString(data && data.reservationId, 120);
	if (!reservationId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Reservation ID is required.",
		);
	}

	const reservationRef = db.collection("reservations").doc(reservationId);
	const reservationSnap = await reservationRef.get();
	if (!reservationSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Reservation not found.");
	}

	const reservation = reservationSnap.data() || {};
	if (reservation.customerId !== customerId) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You can only cancel your own reservations.",
		);
	}

	if (!CUSTOMER_CANCELABLE_STATUSES.includes(reservation.status)) {
		throw new functions.https.HttpsError(
			"failed-precondition",
			"This reservation can no longer be cancelled from the customer app.",
		);
	}

	await reservationRef.set(
		{
			status: "cancelled",
			cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
			cancelledBy: customerId,
			cancelledByRole: "customer",
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		},
		{ merge: true },
	);

	const cleanupWrites = [
		db.collection("customers").doc(customerId).set(
			{
				activeCheckIn: null,
			},
			{ merge: true },
		),
	];

	if (reservation.arrivalCheckInId) {
		cleanupWrites.push(
			db.collection("checkIns").doc(reservation.arrivalCheckInId).set(
				{
					status: "CANCELLED_BY_USER",
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			),
		);
	}

	if (reservation.partyId) {
		cleanupWrites.push(
			db.collection("parties").doc(reservation.partyId).set(
				{
					status: "pending",
					checkInId: null,
					activeCheckInId: null,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			),
		);
	}

	await Promise.all(cleanupWrites);

	await db
		.collection("restaurants")
		.doc(reservation.restaurantId)
		.collection("notifications")
		.add({
			type: "reservation_cancelled",
			reservationId,
			customerId,
			title: "Reservation cancelled",
			message: `${reservation.customerName || "A guest"} cancelled ${reservation.requestedDate} at ${reservation.requestedTime}.`,
			read: false,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

	await offerWaitlistSlot({
		restaurantId: reservation.restaurantId,
		date: reservation.requestedDate,
		time: reservation.requestedTime,
		partySize: reservation.partySize,
	});

	return { success: true };
});

exports.seatReservation = functions.https.onCall(async (data, context) => {
	const uid = requireAuth(context);
	const reservationId = sanitizeString(data && data.reservationId, 120);
	const table = (data && data.table) || {};
	const server = (data && data.server) || {};
	const tableId = sanitizeString(table.id, 120);
	const tableName = sanitizeString(table.name, 160) || "Table";
	const serverId = sanitizeString(server.id, 120);
	const serverName = sanitizeString(server.name, 160) || "Server";

	if (!reservationId || !tableId || !serverId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Reservation, table, and server are required.",
		);
	}

	const reservationRef = db.collection("reservations").doc(reservationId);
	const checkInRef = db.collection("checkIns").doc();

	return db.runTransaction(async (transaction) => {
		const reservationSnap = await transaction.get(reservationRef);
		if (!reservationSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Reservation not found.");
		}

		const reservation = reservationSnap.data() || {};
		await assertRestaurantAccess(uid, reservation.restaurantId);

		if (!["confirmed", "arrival_requested"].includes(reservation.status)) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Only confirmed arrivals can be seated.",
			);
		}

		const tableRef = db
			.collection("restaurants")
			.doc(reservation.restaurantId)
			.collection("tables")
			.doc(tableId);
		const customerRef = db.collection("customers").doc(reservation.customerId);
		const partyRef = reservation.partyId
			? db.collection("parties").doc(reservation.partyId)
			: null;
		const existingCheckInRef = reservation.arrivalCheckInId
			? db.collection("checkIns").doc(reservation.arrivalCheckInId)
			: null;

		const [tableSnap, existingCheckInSnap, partySnap] = await Promise.all([
			transaction.get(tableRef),
			existingCheckInRef
				? transaction.get(existingCheckInRef)
				: Promise.resolve(null),
			partyRef ? transaction.get(partyRef) : Promise.resolve(null),
		]);

		if (!tableSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Table not found.");
		}

		const tableData = tableSnap.data() || {};
		if (tableData.status !== "available") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This table is not available.",
			);
		}

		const timestamp = admin.firestore.FieldValue.serverTimestamp();
		const checkInId = existingCheckInRef ? existingCheckInRef.id : checkInRef.id;
		const checkInData = existingCheckInSnap && existingCheckInSnap.exists
			? existingCheckInSnap.data() || {}
			: {};
		const partySize = Math.max(
			1,
			Number(checkInData.numberOfPeople || reservation.partySize || 1),
		);

		const acceptedCheckInPatch = {
			restaurantId: reservation.restaurantId,
			customerId: reservation.customerId,
			customerName: reservation.customerName || "Scerv Guest",
			numberOfPeople: partySize,
			status: "ACCEPTED",
			type: reservation.partyId ? "party" : "reservation_arrival",
			reservationId,
			partyId: reservation.partyId || null,
			associatedPartyId: reservation.partyId || null,
			table: { id: tableId, name: tableName },
			server: { id: serverId, name: serverName },
			acceptedAt: timestamp,
			updatedAt: timestamp,
		};

		if (existingCheckInRef) {
			transaction.set(existingCheckInRef, acceptedCheckInPatch, { merge: true });
		} else {
			transaction.set(checkInRef, {
				...acceptedCheckInPatch,
				createdAt: timestamp,
			});
		}

		transaction.update(tableRef, {
			status: "OCCUPIED",
			currentCheckInId: checkInId,
			currentCustomerId: reservation.customerId,
			...(reservation.partyId && { currentPartyId: reservation.partyId }),
			seatedAt: timestamp,
		});

		transaction.set(
			customerRef,
			{
				activeCheckIn: {
					checkInId,
					restaurantId: reservation.restaurantId,
					status: "ACCEPTED",
					table: { id: tableId, name: tableName },
					...(reservation.partyId && { partyId: reservation.partyId }),
				},
				...(reservation.partyId && {
					partyIds: admin.firestore.FieldValue.arrayUnion(reservation.partyId),
				}),
			},
			{ merge: true },
		);

		if (partyRef && partySnap && partySnap.exists) {
			transaction.set(
				partyRef,
				{
					status: "active",
					table: { id: tableId, name: tableName },
					server: { id: serverId, name: serverName },
					checkInId,
					activeCheckInId: checkInId,
					lastUpdated: timestamp,
				},
				{ merge: true },
			);
		}

		transaction.set(
			reservationRef,
			{
				status: "seated",
				checkInId,
				table: { id: tableId, name: tableName },
				server: { id: serverId, name: serverName },
				seatedAt: timestamp,
				updatedAt: timestamp,
			},
			{ merge: true },
		);

		return { success: true, checkInId };
	});
});

exports.approveReservation = functions
	.runWith({ secrets: [RESEND_API_KEY] })
	.https.onCall(async (data, context) => {
	const uid = requireAuth(context);
	const reservationId = sanitizeString(data && data.reservationId, 120);
	if (!reservationId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Reservation ID is required.",
		);
	}

	const reservationRef = db.collection("reservations").doc(reservationId);
	const reservationSnap = await reservationRef.get();
	if (!reservationSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Reservation not found.");
	}

	const reservation = reservationSnap.data() || {};
	await assertRestaurantAccess(uid, reservation.restaurantId);
	if (reservation.status !== "requested") {
		throw new functions.https.HttpsError(
			"failed-precondition",
			"Only requested reservations can be approved.",
		);
	}

	await reservationRef.set(
		{
			status: "confirmed",
			confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
			confirmedBy: uid,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			restaurantNote: sanitizeString(data && data.restaurantNote, 400),
		},
		{ merge: true },
	);

	await db.collection("customers").doc(reservation.customerId).collection("notifications").add({
		type: "reservation_confirmed",
		reservationId,
		restaurantId: reservation.restaurantId,
		title: "Reservation confirmed",
		message: `${reservation.restaurantName} confirmed your reservation for ${reservation.requestedDate} at ${reservation.requestedTime}.`,
		read: false,
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
	});

	const settings = await getSettings(reservation.restaurantId);
	if (settings.emailConfirmationsEnabled !== false && reservation.customerEmail) {
		await sendReservationEmail({
			to: reservation.customerEmail,
			subject: `Reservation confirmed at ${reservation.restaurantName}`,
			html: `<div style="font-family: Arial, sans-serif; line-height: 1.5;">
				<h2>Your reservation is confirmed</h2>
				<p><strong>${reservation.restaurantName}</strong></p>
				<p>${reservation.requestedDate} at ${reservation.requestedTime}</p>
				<p>Party of ${reservation.partySize}</p>
				<p>We look forward to hosting you.</p>
			</div>`,
		});
	}

	return { success: true };
});

exports.declineReservation = functions
	.runWith({ secrets: [RESEND_API_KEY] })
	.https.onCall(async (data, context) => {
	const uid = requireAuth(context);
	const reservationId = sanitizeString(data && data.reservationId, 120);
	const reason = sanitizeString(data && data.reason, 400);
	if (!reservationId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Reservation ID is required.",
		);
	}

	const reservationRef = db.collection("reservations").doc(reservationId);
	const reservationSnap = await reservationRef.get();
	if (!reservationSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Reservation not found.");
	}

	const reservation = reservationSnap.data() || {};
	await assertRestaurantAccess(uid, reservation.restaurantId);
	if (reservation.status !== "requested") {
		throw new functions.https.HttpsError(
			"failed-precondition",
			"Only requested reservations can be declined.",
		);
	}

	await reservationRef.set(
		{
			status: "declined",
			declinedAt: admin.firestore.FieldValue.serverTimestamp(),
			declinedBy: uid,
			declineReason: reason || null,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		},
		{ merge: true },
	);

	if (reservation.customerEmail) {
		await sendReservationEmail({
			to: reservation.customerEmail,
			subject: `Reservation update from ${reservation.restaurantName}`,
			html: `<div style="font-family: Arial, sans-serif; line-height: 1.5;">
				<h2>Reservation request update</h2>
				<p>${reservation.restaurantName} could not confirm your request for ${reservation.requestedDate} at ${reservation.requestedTime}.</p>
				${reason ? `<p><strong>Note:</strong> ${reason}</p>` : ""}
			</div>`,
		});
	}

	return { success: true };
});

exports.updateReservationStatus = functions.https.onCall(async (data, context) => {
	const uid = requireAuth(context);
	const reservationId = sanitizeString(data && data.reservationId, 120);
	const status = sanitizeString(data && data.status, 40);
	const allowedStatuses = ["seated", "completed", "no_show", "cancelled"];

	if (!reservationId || !allowedStatuses.includes(status)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Valid reservation ID and status are required.",
		);
	}

	const reservationRef = db.collection("reservations").doc(reservationId);
	const reservationSnap = await reservationRef.get();
	if (!reservationSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Reservation not found.");
	}

	const reservation = reservationSnap.data() || {};
	await assertRestaurantAccess(uid, reservation.restaurantId);

	await reservationRef.set(
		{
			status,
			[`${status}At`]: admin.firestore.FieldValue.serverTimestamp(),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedBy: uid,
		},
		{ merge: true },
	);

	return { success: true };
});

exports.updateReservationTrustStats = functions.firestore
	.document("reservations/{reservationId}")
	.onUpdate(async (change) => {
		const before = change.before.data() || {};
		const after = change.after.data() || {};

		if (before.status === after.status || !after.customerId) return null;

		const increments = {};
		if (after.status === "completed") {
			increments.completedReservations =
				admin.firestore.FieldValue.increment(1);
		} else if (after.status === "no_show") {
			increments.noShows = admin.firestore.FieldValue.increment(1);
		} else if (after.status === "cancelled") {
			const settings = await getSettings(after.restaurantId);
			const startsAt = buildStartsAt(after.requestedDate, after.requestedTime);
			const cancelledAt =
				after.cancelledAt && typeof after.cancelledAt.toMillis === "function"
					? after.cancelledAt
					: admin.firestore.Timestamp.now();
			const cancellationWindowMillis =
				Number(settings.cancellationWindowHours || 0) * 60 * 60 * 1000;
			const isLateCancellation =
				cancellationWindowMillis > 0 &&
				cancelledAt.toMillis() >
					startsAt.toMillis() - cancellationWindowMillis;

			if (!isLateCancellation) return null;
			increments.lateCancellations = admin.firestore.FieldValue.increment(1);
		} else {
			return null;
		}

		// This summary is the first version of Scerv guest credibility. We keep it
		// private to the customer/restaurant workflow and expose labels, not scores.
		await db
			.collection("customers")
			.doc(after.customerId)
			.collection("reservationTrust")
			.doc("summary")
			.set(
				{
					...increments,
					lastReservationId: change.after.id,
					lastStatus: after.status,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);

		return null;
	});
