// functions/userSearchFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { buildPipSearchResult } = require("./userSearchPrivacy");
const db = admin.firestore();

const normalizeSearchValue = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");

const addSearchResult = (usersMap, doc, currentUserId) => {
	if (doc.id === currentUserId || usersMap.has(doc.id)) return;

	const result = buildPipSearchResult(doc, currentUserId);
	if (!result) return;

	usersMap.set(doc.id, result);
};

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
	const searchTerm = normalizeSearchValue(data.searchTerm);

	if (!searchTerm || searchTerm.length < 3) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Search term must be at least 3 characters."
		);
	}

	const MAX_RESULTS = 10; // Limit results

	try {
		const usersMap = new Map();

		const searchTokensQuery = db
			.collection("customers")
			.where("searchTokens", "array-contains", searchTerm)
			.limit(MAX_RESULTS);

		const emailQuery = db
			.collection("customers")
			.where("emailLower", ">=", searchTerm)
			.where("emailLower", "<=", searchTerm + "\uf8ff")
			.limit(MAX_RESULTS);

		const legacyEmailQuery = db
			.collection("customers")
			.where("email", ">=", searchTerm)
			.where("email", "<=", searchTerm + "\uf8ff")
			.limit(MAX_RESULTS);

		const [tokenResults, emailResults, legacyEmailResults] = await Promise.all([
			searchTokensQuery.get(),
			emailQuery.get(),
			legacyEmailQuery.get(),
		]);

		tokenResults.docs.forEach((doc) =>
			addSearchResult(usersMap, doc, currentUserId),
		);
		emailResults.docs.forEach((doc) =>
			addSearchResult(usersMap, doc, currentUserId),
		);
		legacyEmailResults.docs.forEach((doc) =>
			addSearchResult(usersMap, doc, currentUserId),
		);

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
