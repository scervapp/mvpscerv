const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

const FEATURE_KEYS = [
	"reservations",
	"reservationWaitlist",
	"hostCheckInRequests",
	"reviews",
	"rewards",
];

const SCERV_ADMIN_ROLES = ["admin", "godmode", "scerv_admin", "super_admin"];
const GODMODE_ROLES = ["godmode", "super_admin"];

const sanitizeString = (value, maxLength = 160) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, maxLength);

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

exports.saveRestaurantFeatureEntitlements = functions.https.onCall(
	async (data, context) => {
		const uid = requireScervAdmin(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 120);
		const entitlements = (data && data.featureEntitlements) || {};

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

		const cleanEntitlements = {};
		FEATURE_KEYS.forEach((key) => {
			if (typeof entitlements[key] === "boolean") {
				cleanEntitlements[key] = entitlements[key];
			}
		});

		await restaurantRef.set(
			{
				featureEntitlements: cleanEntitlements,
				entitlementsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
				entitlementsUpdatedBy: uid,
			},
			{ merge: true },
		);

		return {
			success: true,
			restaurantId,
			featureEntitlements: cleanEntitlements,
		};
	},
);

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
