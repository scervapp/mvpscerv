const crypto = require("crypto");

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

const RAW_WRITE_DENYLIST_PATTERNS = [
	/^staffSessions(\/|$)/i,
	/^emailOtpChallenges(\/|$)/i,
	/^staffPinAttempts(\/|$)/i,
	/^scervAdminAuditLogs(\/|$)/i,
	/^pending_orders(\/|$)/i,
	/^pendingOrders(\/|$)/i,
	/^orders(\/|$)/i,
	/^payment/i,
	/^payments(\/|$)/i,
	/^paymentAttempts(\/|$)/i,
	/^stripe/i,
	/^stripeEvents(\/|$)/i,
	/^stripeWebhookEvents(\/|$)/i,
	/^promotionLedger(\/|$)/i,
	/^scervPromotionLedger(\/|$)/i,
	/^refunds(\/|$)/i,
	/^ledger/i,
	/^restaurants\/[^/]+\/private(\/|$)/i,
	/^restaurants\/[^/]+\/employees\/[^/]+\/private(\/|$)/i,
	/^customers\/[^/]+\/payment/i,
	/^customers\/[^/]+\/private(\/|$)/i,
];

const normalizeBoolean = (value) =>
	TRUTHY_VALUES.has(
		String(value || "")
			.trim()
			.toLowerCase(),
	);

const getLegacyScervConfig = (functions) => {
	try {
		return (functions.config && functions.config().scerv) || {};
	} catch (error) {
		return {};
	}
};

const isAdminRawWriteEnabled = (functions, env = process.env) => {
	const legacyConfig = getLegacyScervConfig(functions);
	return normalizeBoolean(
		env.SCERV_ADMIN_RAW_WRITE_ENABLED || legacyConfig.admin_raw_write_enabled,
	);
};

const getRuntimeProjectId = (env = process.env) => {
	if (env.GCLOUD_PROJECT) return env.GCLOUD_PROJECT;
	if (env.FIREBASE_CONFIG) {
		try {
			return JSON.parse(env.FIREBASE_CONFIG).projectId || "unknown";
		} catch (error) {
			return "unknown";
		}
	}
	return "unknown";
};

const isDeniedRawFirestoreWritePath = (documentPath) =>
	RAW_WRITE_DENYLIST_PATTERNS.some((pattern) => pattern.test(documentPath));

const stableStringify = (value) => {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
		.join(",")}}`;
};

const stableHash = (value) =>
	value === null || value === undefined
		? null
		: crypto.createHash("sha256").update(stableStringify(value)).digest("hex");

const buildAfterData = (beforeData, payload, merge) => {
	if (!merge) return payload;
	return {
		...(beforeData || {}),
		...(payload || {}),
	};
};

module.exports = {
	buildAfterData,
	getRuntimeProjectId,
	isAdminRawWriteEnabled,
	isDeniedRawFirestoreWritePath,
	stableHash,
};
