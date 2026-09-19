const crypto = require("crypto");
const auth = require("firebase-tools/lib/auth");
const scopes = require("firebase-tools/lib/scopes");

const PROJECT_ID = "scervmvp-dev";
const DATABASE_ID = "(default)";
const DEFAULT_RESTAURANT_ID = "jaRr9o8wLcXUyDPeF6QsirPjNtA3";
const DEFAULT_TABLE_ID = "window_2";

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm-dev-qr");

if (!confirmed) {
	console.error(
		"Refusing to update Firestore without --confirm-dev-qr. This script only targets scervmvp-dev.",
	);
	process.exit(1);
}

const getArg = (name, fallback) => {
	const index = args.indexOf(name);
	if (index === -1 || !args[index + 1]) return fallback;
	return args[index + 1];
};

const restaurantId = getArg("--restaurant", DEFAULT_RESTAURANT_ID);
const tableId = getArg("--table", DEFAULT_TABLE_ID);
const publicBaseUrl = getArg("--public-base-url", "https://www.scerv.com").replace(
	/\/+$/,
	"",
);
const localBaseUrl = getArg("--local-base-url", "http://localhost:3000").replace(
	/\/+$/,
	"",
);

function getAccessToken() {
	const account = auth.getGlobalDefaultAccount();
	const refreshToken = account?.tokens?.refresh_token;
	if (!refreshToken) {
		throw new Error(
			"Could not read Firebase refresh token. Run firebase login --reauth.",
		);
	}
	return auth
		.getAccessToken(refreshToken, [scopes.CLOUD_PLATFORM])
		.then((tokenData) => tokenData.access_token);
}

function firestoreBase() {
	return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(
		DATABASE_ID,
	)}/documents`;
}

function encodePath(path) {
	return path.split("/").map(encodeURIComponent).join("/");
}

function toFirestoreValue(value) {
	if (value === null || value === undefined) return { nullValue: null };
	if (value instanceof Date) return { timestampValue: value.toISOString() };
	if (typeof value === "boolean") return { booleanValue: value };
	if (typeof value === "number") {
		return Number.isInteger(value)
			? { integerValue: String(value) }
			: { doubleValue: value };
	}
	return { stringValue: String(value) };
}

function toFirestoreDocument(data) {
	return {
		fields: Object.fromEntries(
			Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
		),
	};
}

async function api(method, url, token, body) {
	const response = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`${method} ${url} failed: ${response.status} ${text}`);
	}
	return response.json();
}

function fromFirestoreValue(value) {
	if (!value) return null;
	if ("stringValue" in value) return value.stringValue;
	if ("integerValue" in value) return Number(value.integerValue);
	if ("doubleValue" in value) return Number(value.doubleValue);
	if ("booleanValue" in value) return value.booleanValue;
	if ("timestampValue" in value) return value.timestampValue;
	if ("nullValue" in value) return null;
	return null;
}

async function main() {
	const token = await getAccessToken();
	const tablePath = `restaurants/${restaurantId}/tables/${tableId}`;
	const getUrl = `${firestoreBase()}/${encodePath(tablePath)}`;
	const existingDoc = await api("GET", getUrl, token);
	const existingFields = existingDoc.fields || {};
	const existingVersion = fromFirestoreValue(existingFields.qrTokenVersion) || 0;

	const qrToken = crypto
		.randomBytes(24)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
	const qrPath = `/dine/${qrToken}`;
	const qrUrl = `${publicBaseUrl}${qrPath}`;
	const now = new Date();

	const patch = {
		qrToken,
		secureToken: qrToken,
		qrPath,
		qrUrl,
		qrEnabled: true,
		qrTokenVersion: existingVersion + 1,
		qrUpdatedAt: now,
		qrLastRotatedAt: now,
		updatedAt: now,
	};

	const updateMask = Object.keys(patch)
		.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
		.join("&");
	const patchUrl = `${getUrl}?${updateMask}`;
	await api("PATCH", patchUrl, token, toFirestoreDocument(patch));

	const lookupPath = `tableQrTokens/${qrToken}`;
	const lookupUrl = `${firestoreBase()}/${encodePath(lookupPath)}`;
	await api(
		"PATCH",
		lookupUrl,
		token,
		toFirestoreDocument({
			token: qrToken,
			restaurantId,
			tableId,
			enabled: true,
			version: existingVersion + 1,
			updatedAt: now,
		}),
	);

	console.log(`Project: ${PROJECT_ID}`);
	console.log(`Restaurant: ${restaurantId}`);
	console.log(`Table: ${tableId}`);
	console.log(`Token: ${qrToken}`);
	console.log(`Public URL: ${qrUrl}`);
	console.log(`Local URL: ${localBaseUrl}${qrPath}`);
}

main().catch((error) => {
	console.error(error.message || error);
	process.exit(1);
});
