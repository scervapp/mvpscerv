const admin = require("firebase-admin");
const functions = require("firebase-functions");

exports.generateCustomToken = functions.https.onCall(async (data, context) => {
	const { username, password } = data;

	try {
		// 1. Fetch user data based on username using the correct Admin SDK syntax
		const usersRef = admin.firestore().collection("admins");

		// --- REFACTORED FIRESTORE QUERY ---
		// The Admin SDK uses a chained method syntax for queries.
		const querySnapshot = await usersRef
			.where("username", "==", username)
			.get();

		if (querySnapshot.empty) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Username not found"
			);
		}

		const userDoc = querySnapshot.docs[0];
		const userData = userDoc.data();

		// 2. Verify the password (your existing logic for this remains the same)
		// NOTE: You must have a secure 'verifyPassword' function implemented.
		// This is just a placeholder.
		const isPasswordValid = await verifyPassword(
			password,
			userData.passwordHash
		);
		if (!isPasswordValid) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid password"
			);
		}

		// 3. Generate a custom token (this part was already correct)
		const customToken = await admin.auth().createCustomToken(userDoc.id);

		return { customToken };
	} catch (error) {
		// Log the detailed error on the server for debugging
		console.error("Error generating custom token:", error);
		// Re-throw the error so the client gets a proper error response
		throw new functions.https.HttpsError(
			"internal",
			"An internal error occurred.",
			error
		);
	}
});
