const functions = require("firebase-functions");
const admin = require("firebase-admin");

const SCERV_ADMIN_ROLES = ["admin", "godmode", "scerv_admin", "super_admin"];
const REBUILD_CONFIRMATION = "rebuild-restaurant-public-profiles";

const PUBLIC_RESTAURANT_FIELDS = [
	"address",
	"area",
	"averageRating",
	"canAcceptPayments",
	"category",
	"city",
	"country",
	"countryCode",
	"cuisine",
	"cuisineType",
	"description",
	"features",
	"hospitalityStyle",
	"hours",
	"imageUri",
	"imageUrl",
	"isActive",
	"isCustomerVisible",
	"isLive",
	"location",
	"logoUrl",
	"name",
	"phoneNumber",
	"priceLevel",
	"publicSlug",
	"rating",
	"ratingCount",
	"restaurantName",
	"restaurantSlug",
	"reviewCount",
	"rewardsProgram",
	"searchKeywords",
	"slug",
	"state",
	"storeNumber",
	"website",
];

const copyDefinedPublicFields = (restaurantData = {}) => {
	const projection = {};

	PUBLIC_RESTAURANT_FIELDS.forEach((field) => {
		if (restaurantData[field] !== undefined) {
			projection[field] = restaurantData[field];
		}
	});

	if (restaurantData.loyaltyProgram) {
		projection.loyaltyProgram = sanitizeRewardsProgram(
			restaurantData.loyaltyProgram,
		);
	}
	if (restaurantData.rewardsProgram) {
		projection.rewardsProgram = sanitizeRewardsProgram(
			restaurantData.rewardsProgram,
		);
	}

	return projection;
};

const sanitizeRewardsProgram = (program = {}) => {
	if (!program || typeof program !== "object") return null;
	const cleanProgram = { ...program };
	delete cleanProgram.updatedBy;
	delete cleanProgram.internalNotes;
	delete cleanProgram.audit;
	return cleanProgram;
};

const buildRestaurantPublicProfile = (restaurantId, restaurantData = {}) => {
	if (!restaurantId || !restaurantData || typeof restaurantData !== "object") {
		return null;
	}

	if (
		restaurantData.isLive !== true ||
		restaurantData.isCustomerVisible === false
	) {
		return null;
	}

	const projection = copyDefinedPublicFields(restaurantData);
	projection.restaurantId = restaurantId;
	projection.updatedAt = admin.firestore.FieldValue.serverTimestamp();

	return projection;
};

const requireScervAdmin = (context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Scerv admin authentication is required.",
		);
	}

	const role = String((context.auth.token && context.auth.token.role) || "")
		.trim()
		.toLowerCase();

	if (!SCERV_ADMIN_ROLES.includes(role)) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Scerv admin access is required.",
		);
	}

	return context.auth.uid;
};

const rebuildRestaurantPublicProfiles = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context);

		const applyChanges = data && data.confirm === REBUILD_CONFIRMATION;
		const firestore = admin.firestore();
		const restaurantsSnap = await firestore.collection("restaurants").get();

		let publishedCount = 0;
		let hiddenCount = 0;
		let batch = firestore.batch();
		let pendingWrites = 0;

		const flush = async () => {
			if (pendingWrites === 0) return;
			await batch.commit();
			batch = firestore.batch();
			pendingWrites = 0;
		};

		for (const restaurantDoc of restaurantsSnap.docs) {
			const projection = buildRestaurantPublicProfile(
				restaurantDoc.id,
				restaurantDoc.data() || {},
			);
			if (projection) {
				publishedCount += 1;
			} else {
				hiddenCount += 1;
			}

			if (!applyChanges) continue;

			const publicRef = firestore
				.collection("restaurantPublic")
				.doc(restaurantDoc.id);
			if (projection) {
				batch.set(publicRef, projection, { merge: false });
			} else {
				batch.delete(publicRef);
			}
			pendingWrites += 1;

			if (pendingWrites >= 400) {
				await flush();
			}
		}

		await flush();

		return {
			success: true,
			applied: applyChanges,
			totalRestaurants: restaurantsSnap.size,
			publishedCount,
			hiddenCount,
		};
	},
);

const syncRestaurantPublicProfile = functions.firestore
	.document("restaurants/{restaurantId}")
	.onWrite(async (change, context) => {
		const restaurantId = context.params.restaurantId;
		const publicRef = admin
			.firestore()
			.collection("restaurantPublic")
			.doc(restaurantId);

		if (!change.after.exists) {
			await publicRef.delete();
			return null;
		}

		const projection = buildRestaurantPublicProfile(
			restaurantId,
			change.after.data() || {},
		);

		if (!projection) {
			await publicRef.delete();
			return null;
		}

		await publicRef.set(projection, { merge: false });
		return null;
	});

module.exports = {
	buildRestaurantPublicProfile,
	rebuildRestaurantPublicProfiles,
	sanitizeRewardsProgram,
	syncRestaurantPublicProfile,
};
