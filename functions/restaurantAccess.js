const functions = require("firebase-functions");

const normalize = (value) => String(value || "").trim().toLowerCase();

const buildEmployeeProfile = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		...data,
		role: normalize(data.role),
		jobTitle: normalize(data.jobTitle),
		name:
			data.name ||
			`${data.firstName || ""} ${data.lastName || ""}`.trim() ||
			null,
	};
};

const findEmployeeByUid = async (db, restaurantId, uid) => {
	if (!uid) return null;

	const snapshot = await db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("employees")
		.where("uid", "==", uid)
		.limit(1)
		.get();

	if (snapshot.empty) return null;
	return buildEmployeeProfile(snapshot.docs[0]);
};

const getRestaurantEmployee = async ({
	db,
	context,
	restaurantId,
	employeeId,
}) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Restaurant staff authentication is required.",
		);
	}

	if (!restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID is required.",
		);
	}

	const cleanEmployeeId = String(employeeId || "").trim();

	if (cleanEmployeeId) {
		const employeeRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(cleanEmployeeId);
		const employeeDoc = await employeeRef.get();

		if (employeeDoc.exists) {
			const profile = buildEmployeeProfile(employeeDoc);
			if (profile.isActive === false) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"This employee profile is inactive.",
				);
			}
			return profile;
		}

		const employeeByUid = await findEmployeeByUid(db, restaurantId, cleanEmployeeId);
		if (employeeByUid) {
			if (employeeByUid.isActive === false) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"This employee profile is inactive.",
				);
			}
			return employeeByUid;
		}

		throw new functions.https.HttpsError(
			"permission-denied",
			"Active staff session could not be verified.",
		);
	}

	const employeeByAuthUid = await findEmployeeByUid(
		db,
		restaurantId,
		context.auth.uid,
	);
	if (employeeByAuthUid) {
		if (employeeByAuthUid.isActive === false) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"This employee profile is inactive.",
			);
		}
		return employeeByAuthUid;
	}

	return null;
};

const hasAllowedRestaurantClaim = (context, restaurantId) => {
	const token = context.auth && context.auth.token ? context.auth.token : {};
	const tokenRestaurantId = token.restaurantId;

	return context.auth.uid === restaurantId || tokenRestaurantId === restaurantId;
};

const assertRestaurantPermission = async ({
	db,
	context,
	restaurantId,
	employeeId,
	allowedRoles = [],
	allowedJobTitles = [],
	action = "perform this restaurant action",
}) => {
	if (!hasAllowedRestaurantClaim(context, restaurantId)) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"User is not authorized for this restaurant.",
		);
	}

	const employee = await getRestaurantEmployee({
		db,
		context,
		restaurantId,
		employeeId,
	});

	const allowedRoleSet = new Set(allowedRoles.map(normalize));
	const allowedJobTitleSet = new Set(allowedJobTitles.map(normalize));

	if (
		employee &&
		(allowedRoleSet.has(employee.role) ||
			(employee.role === "worker" && allowedJobTitleSet.has(employee.jobTitle)))
	) {
		return employee;
	}

	throw new functions.https.HttpsError(
		"permission-denied",
		`You do not have permission to ${action}.`,
	);
};

module.exports = {
	assertRestaurantPermission,
};
