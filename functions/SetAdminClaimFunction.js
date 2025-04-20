const functions = require("firebase-functions");

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
	// Ensure the function is called by an authenticated user
	if (!context.auth) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"You must be authenticated to set a custom claim."
		);
	}

	const { uid, role } = data;

	try {
		const validRoles = ["godmode", "admin", "bizdev", "sales"];
		if (!validRoles.includes(role)) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid role provided"
			);
		}

		await admin.auth().setCustomUserClaims(uid, { role });

		return {
			success: true,
			message: `Role ${role} set successfully for user ${uid}`,
		};
	} catch (error) {
		console.error(error);
		throw new functions.https.HttpsError(
			"internal",
			"Failed to set custom claim"
		);
	}
});
