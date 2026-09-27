#!/usr/bin/env node

/*
 * Read-only Firestore audit for staff PIN exposure. The script reports counts
 * and hashed references only; it never prints PINs, PIN hashes, staff names,
 * emails, phone numbers, or raw restaurant IDs.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const auth = require("../../node_modules/firebase-tools/lib/auth");

const DEFAULT_PROJECT = "scervmvp";
const DEFAULT_LIMIT = 1000;

const parseArgs = (argv) => {
	const args = { project: DEFAULT_PROJECT, limit: DEFAULT_LIMIT, output: null };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--project") {
			args.project = argv[index + 1] || args.project;
			index += 1;
		} else if (arg === "--limit") {
			args.limit = Number(argv[index + 1] || args.limit) || DEFAULT_LIMIT;
			index += 1;
		} else if (arg === "--output") {
			args.output = argv[index + 1] || null;
			index += 1;
		}
	}
	return args;
};

const firestoreValueToJs = (value) => {
	if (!value || typeof value !== "object") return undefined;
	if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
	if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) {
		return value.booleanValue;
	}
	if (Object.prototype.hasOwnProperty.call(value, "integerValue")) {
		return Number(value.integerValue);
	}
	if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) {
		return Number(value.doubleValue);
	}
	if (Object.prototype.hasOwnProperty.call(value, "stringValue")) {
		return value.stringValue;
	}
	if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) {
		return value.timestampValue;
	}
	if (value.arrayValue) {
		return (value.arrayValue.values || []).map(firestoreValueToJs);
	}
	if (value.mapValue) {
		return firestoreFieldsToJs(value.mapValue.fields || {});
	}
	return undefined;
};

const firestoreFieldsToJs = (fields) =>
	Object.entries(fields || {}).reduce((acc, [key, value]) => {
		acc[key] = firestoreValueToJs(value);
		return acc;
	}, {});

const hashRef = (value) =>
	crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);

const getToken = async () => {
	const account = auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
	if (!account || !account.tokens || !account.tokens.refresh_token) {
		throw new Error("No Firebase CLI account with a refresh token is available.");
	}
	const token = await auth.getAccessToken(account.tokens.refresh_token, []);
	return {
		accessToken: token.access_token,
		accountEmail: account.user && account.user.email,
	};
};

const runQuery = async ({ project, accessToken, collectionId, allDescendants, limit }) => {
	const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId, allDescendants }],
				limit,
			},
		}),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Firestore query failed for ${collectionId}: ${response.status} ${text}`);
	}

	const rows = await response.json();
	return rows
		.filter((row) => row.document)
		.map((row) => ({
			name: row.document.name,
			data: firestoreFieldsToJs(row.document.fields || {}),
		}));
};

const getRestaurantRefFromEmployeeName = (documentName) => {
	const match = String(documentName).match(/\/restaurants\/([^/]+)\/employees\//);
	return match ? match[1] : "";
};

const inspectEmployees = (documents) => {
	const findings = [];
	const restaurants = new Set();
	const roleCounts = {};
	const counters = {
		totalScanned: documents.length,
		active: 0,
		inactive: 0,
		withPinHash: 0,
		withPlainPin: 0,
		withUid: 0,
		restaurantsWithEmployees: 0,
	};

	for (const doc of documents) {
		const data = doc.data || {};
		const restaurantId = getRestaurantRefFromEmployeeName(doc.name);
		if (restaurantId) restaurants.add(restaurantId);

		const role = String(data.role || "unknown").toLowerCase();
		roleCounts[role] = (roleCounts[role] || 0) + 1;

		if (data.isActive === false) counters.inactive += 1;
		else counters.active += 1;
		if (data.uid) counters.withUid += 1;
		if (data.pinHash) counters.withPinHash += 1;
		if (data.pin) {
			counters.withPlainPin += 1;
			findings.push({
				type: "plaintext_pin_field_present",
				refHash: hashRef(doc.name),
				restaurantHash: hashRef(restaurantId),
			});
		}
		if (data.pinHash && typeof data.pinHash === "string" && !data.pinHash.startsWith("$2")) {
			findings.push({
				type: "pin_hash_not_bcrypt_format",
				refHash: hashRef(doc.name),
				restaurantHash: hashRef(restaurantId),
			});
		}
	}

	counters.restaurantsWithEmployees = restaurants.size;
	return { counters, roleCounts, findings };
};

const inspectCollection = (documents) => ({
	totalScanned: documents.length,
	sampleRefs: documents.slice(0, 10).map((doc) => hashRef(doc.name)),
});

const inspectPrivateDocs = (documents) => {
	const employeePrivateDocs = documents.filter((doc) =>
		String(doc.name).includes("/employees/"),
	);
	return {
		totalPrivateDocsScanned: documents.length,
		employeePrivateDocs: employeePrivateDocs.length,
		employeePrivateRefs: employeePrivateDocs.slice(0, 10).map((doc) => hashRef(doc.name)),
	};
};

const main = async () => {
	const args = parseArgs(process.argv.slice(2));
	const { accessToken, accountEmail } = await getToken();
	const [employees, privateDocs, staffSessions, staffPinAttempts] = await Promise.all([
		runQuery({
			project: args.project,
			accessToken,
			collectionId: "employees",
			allDescendants: true,
			limit: args.limit,
		}),
		runQuery({
			project: args.project,
			accessToken,
			collectionId: "private",
			allDescendants: true,
			limit: args.limit,
		}),
		runQuery({
			project: args.project,
			accessToken,
			collectionId: "staffSessions",
			allDescendants: false,
			limit: args.limit,
		}),
		runQuery({
			project: args.project,
			accessToken,
			collectionId: "staffPinAttempts",
			allDescendants: false,
			limit: args.limit,
		}),
	]);

	const result = {
		generatedAt: new Date().toISOString(),
		project: args.project,
		database: "(default)",
		readOnly: true,
		actor: accountEmail,
		limitPerCollection: args.limit,
		employees: inspectEmployees(employees),
		privateDocs: inspectPrivateDocs(privateDocs),
		staffSessions: inspectCollection(staffSessions),
		staffPinAttempts: inspectCollection(staffPinAttempts),
	};

	if (args.output) {
		const outputPath = path.resolve(process.cwd(), args.output);
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
	}

	console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
	console.error(error.message || error);
	process.exitCode = 1;
});
