const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {
	evaluateClientVersion,
	normalizeClientInfo,
} = require("./clientVersionPolicy");

const db = admin.firestore();

const publicPolicyResponse = (policy = {}) => ({
	enabled: policy.enabled !== false,
	minNativeVersion: policy.minNativeVersion || policy.minimumNativeVersion || null,
	minNativeBuildIos:
		policy.minNativeBuildIos || policy.minimumNativeBuildIos || null,
	minNativeBuildAndroid:
		policy.minNativeBuildAndroid || policy.minimumNativeBuildAndroid || null,
	message: policy.message || null,
	updateUrls: policy.updateUrls || null,
});

exports.checkClientVersion = functions.https.onCall(async (data) => {
	const clientInfo = normalizeClientInfo(data || {});
	const policySnap = await db.collection("appConfig").doc("clientVersions").get();
	const policy = policySnap.exists ? policySnap.data() || {} : {};
	const result = evaluateClientVersion(clientInfo, policy);
	const response = {
		...result,
		client: clientInfo,
		policy: publicPolicyResponse(policy),
	};

	if (result.updateRequired) {
		throw new functions.https.HttpsError(
			"failed-precondition",
			policy.message ||
				"Please update Scerv. This app version is no longer supported.",
			response,
		);
	}

	return response;
});
