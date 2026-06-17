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

const sanitizeString = (value, maxLength = 160) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, maxLength);

const requireScervAdmin = (context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Authentication is required.",
		);
	}

	const token = context.auth.token || {};
	const role = String(token.role || "").toLowerCase();
	const adminRoles = ["admin", "scerv_admin", "super_admin"];
	if (!adminRoles.includes(role)) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Scerv admin access is required.",
		);
	}

	return context.auth.uid;
};

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
