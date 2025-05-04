// functions/userSearchFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Searches for registered customers based on a search term (email or name).
 * Limits results and excludes the calling user.
 */
exports.searchPIPs = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	const currentUserId = context.auth.uid;
	const searchTerm = data.searchTerm.trim().toLowerCase(); // Normalize search term

	if (!searchTerm || searchTerm.length < 3) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Search term must be at least 3 characters."
		);
	}

	const MAX_RESULTS = 10; // Limit results

	try {
		// --- Search Logic ---
		// Option 1: Simple prefix search on email (requires lowercase email field)
		// Assumes you store email as lowercase
		const emailQuery = db
			.collection("customers")
			.where("email", ">=", searchTerm)
			.where("email", "<=", searchTerm + "\uf8ff") // \uf8ff is a high Unicode character for prefix matching
			.limit(MAX_RESULTS);

		// Option 2: Search on name fields (more complex, might need indexing or full-text search like Algolia/Typesense for scale)
		// This is a basic example, likely inefficient for large datasets
		const nameQuery = db
			.collection("customers")
			// .where('lowercaseName', 'array-contains', searchTerm) // If you store name parts in an array
			.limit(MAX_RESULTS); // Apply limit

		// Execute queries (adjust based on your chosen search strategy)
		const [emailResults] = await Promise.all([
			emailQuery.get(),
			// nameQuery.get() // Uncomment if searching by name
		]);

		const usersMap = new Map();

		// Process email results
		emailResults.docs.forEach((doc) => {
			if (doc.id !== currentUserId && !usersMap.has(doc.id)) {
				// Exclude self, avoid duplicates
				const userData = doc.data();
				usersMap.set(doc.id, {
					id: doc.id,
					name:
						`${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
						"Unknown User",
					// email: userData.email // Optionally return email
				});
			}
		});

		// Process name results (if implemented)
		// nameResults.docs.forEach(doc => { ... });

		const users = Array.from(usersMap.values());

		console.log(`Search for '${searchTerm}' found ${users.length} users.`);
		return { success: true, users: users };
	} catch (error) {
		console.error("Error searching users:", error);
		throw new functions.https.HttpsError(
			"internal",
			"User search failed.",
			error.message
		);
	}
});
