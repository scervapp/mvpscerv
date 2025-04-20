const admin = require("firebase-admin");
const functions = require("firebase-functions");

exports.generateCustomToken = functions.https.onCall(async (data, context) => {
	const { username, password } = data;

	try {
		// 1. Fetch user data based on username
		const usersRef = admin.firestore().collection("admins");
		const q = query(usersRef, where("username", "==", username));
		const querySnapshot = await getDocs(q);

		if (querySnapshot.empty) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Username not found"
			);
		}

		const userDoc = querySnapshot.docs[0];
		const userData = userDoc.data();

		// 2. Verify the password (you'll need to implement your own password hashing/verification logic)
		const isPasswordValid = await verifyPassword(
			password,
			userData.passwordHash
		); // Replace with your password verification logic
		if (!isPasswordValid) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid password"
			);
		}

		// 3. Generate a custom token
		const customToken = await admin.auth().createCustomToken(userDoc.id);

		return { customToken };
	} catch (error) {
		console.error(error);
		throw error;
	}
});
