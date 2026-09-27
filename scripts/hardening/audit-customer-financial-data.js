#!/usr/bin/env node

/*
 * Read-only Firestore audit for customer-owned financial, reward, and
 * processor-mapping fields. The output is intentionally redacted: it reports
 * counts, hashed document references, and masked processor IDs only.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const auth = require("../../node_modules/firebase-tools/lib/auth");

const DEFAULT_PROJECT = "scervmvp";
const DEFAULT_LIMIT = 1000;

const parseArgs = (argv) => {
	const args = {
		project: DEFAULT_PROJECT,
		limit: DEFAULT_LIMIT,
		output: null,
	};

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

const maskStripeId = (value) => {
	const raw = String(value || "");
	if (!raw) return "";
	if (raw.length <= 10) return `${raw.slice(0, 4)}...`;
	return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
};

const addFinding = (findings, type, ref, detail = {}) => {
	findings.push({
		type,
		refHash: hashRef(ref),
		...detail,
	});
};

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

const asNumber = (value) => {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
};

const inspectCustomers = (documents) => {
	const findings = [];
	const counters = {
		totalScanned: documents.length,
		withLegacyStripeCustomerId: 0,
		withTestStripeCustomerId: 0,
		withLiveStripeCustomerId: 0,
		withRootAvailablePoints: 0,
		withRootScervAvailablePoints: 0,
	};

	for (const doc of documents) {
		const data = doc.data || {};
		const stripeFields = [
			"stripeCustomerId",
			"stripeCustomerId_test",
			"stripeCustomerId_live",
		];
		for (const field of stripeFields) {
			const value = data[field];
			if (!value) continue;
			if (field === "stripeCustomerId") counters.withLegacyStripeCustomerId += 1;
			if (field === "stripeCustomerId_test") counters.withTestStripeCustomerId += 1;
			if (field === "stripeCustomerId_live") counters.withLiveStripeCustomerId += 1;
			if (typeof value !== "string" || !value.startsWith("cus_")) {
				addFinding(findings, "malformed_stripe_customer_id", doc.name, {
					field,
					value: maskStripeId(value),
				});
			}
		}

		for (const field of ["availablePoints", "scervAvailablePoints"]) {
			if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
			if (field === "availablePoints") counters.withRootAvailablePoints += 1;
			if (field === "scervAvailablePoints") counters.withRootScervAvailablePoints += 1;
			const value = asNumber(data[field]);
			if (value === null || value < 0 || value > 1000000) {
				addFinding(findings, "suspicious_root_points", doc.name, { field, value });
			}
		}

		if (data.role || data.restaurantId) {
			addFinding(findings, "customer_has_authority_field", doc.name, {
				fields: ["role", "restaurantId"].filter((field) => data[field]),
			});
		}
	}

	return { counters, findings };
};

const inspectRestaurantClubs = (documents) => {
	const findings = [];
	const counters = {
		totalScanned: documents.length,
		withUnlockedRewards: 0,
		withRedeemedRewards: 0,
	};

	for (const doc of documents) {
		const data = doc.data || {};
		for (const field of ["availablePoints", "lifetimePoints", "lifetimeSpend", "visits"]) {
			if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
			const value = asNumber(data[field]);
			if (value === null || value < 0 || value > 10000000) {
				addFinding(findings, "suspicious_restaurant_club_metric", doc.name, {
					field,
					value,
				});
			}
		}

		const rewards = Array.isArray(data.unlockedRewards) ? data.unlockedRewards : [];
		if (rewards.length) counters.withUnlockedRewards += 1;
		for (const reward of rewards) {
			if (reward && reward.status === "redeemed") counters.withRedeemedRewards += 1;
			if (!reward || (!reward.id && !reward.tierId && !reward.rewardLabel)) {
				addFinding(findings, "reward_missing_stable_key", doc.name);
			}
			if (
				reward &&
				reward.status &&
				!["available", "earned", "redeemed"].includes(String(reward.status))
			) {
				addFinding(findings, "unexpected_reward_status", doc.name, {
					status: String(reward.status),
				});
			}
		}
	}

	return { counters, findings };
};

const inspectPromotions = (documents) => {
	const findings = [];
	const counters = {
		totalScanned: documents.length,
		available: 0,
		redeemed: 0,
		cancelled: 0,
		foodCredit: 0,
	};

	for (const doc of documents) {
		const data = doc.data || {};
		const status = String(data.status || "available");
		if (status === "available") counters.available += 1;
		if (status === "redeemed") counters.redeemed += 1;
		if (status === "cancelled") counters.cancelled += 1;
		if (data.isFoodCredit === true || data.walletValueType === "food_credit") {
			counters.foodCredit += 1;
		}

		const maxDiscount = asNumber(data.maxDiscountCents || data.maxValueCents || 0);
		const appliedDiscount = asNumber(data.appliedDiscountCents || 0);
		if (maxDiscount !== null && maxDiscount < 0) {
			addFinding(findings, "negative_promotion_value", doc.name, { field: "maxDiscountCents" });
		}
		if (appliedDiscount !== null && appliedDiscount < 0) {
			addFinding(findings, "negative_promotion_value", doc.name, {
				field: "appliedDiscountCents",
			});
		}
		if (!["available", "redeemed", "cancelled", "expired"].includes(status)) {
			addFinding(findings, "unexpected_promotion_status", doc.name, { status });
		}
	}

	return { counters, findings };
};

const main = async () => {
	const args = parseArgs(process.argv.slice(2));
	const { accessToken, accountEmail } = await getToken();
	const collections = await Promise.all([
		runQuery({
			project: args.project,
			accessToken,
			collectionId: "customers",
			allDescendants: false,
			limit: args.limit,
		}),
		runQuery({
			project: args.project,
			accessToken,
			collectionId: "restaurantClubs",
			allDescendants: true,
			limit: args.limit,
		}),
		runQuery({
			project: args.project,
			accessToken,
			collectionId: "promotions",
			allDescendants: true,
			limit: args.limit,
		}),
	]);

	const [customers, restaurantClubs, promotions] = collections;
	const result = {
		generatedAt: new Date().toISOString(),
		project: args.project,
		database: "(default)",
		readOnly: true,
		actor: accountEmail,
		limitPerCollection: args.limit,
		customers: inspectCustomers(customers),
		restaurantClubs: inspectRestaurantClubs(restaurantClubs),
		promotions: inspectPromotions(promotions),
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
