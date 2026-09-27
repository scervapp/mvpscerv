const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
	buildAfterData,
	getRuntimeProjectId,
	isAdminRawWriteEnabled,
	isDeniedRawFirestoreWritePath,
	stableHash,
} = require("../../functions/adminRawAccess");

test("admin raw writes default to disabled", () => {
	const functions = { config: () => ({ scerv: {} }) };

	assert.equal(isAdminRawWriteEnabled(functions, {}), false);
});

test("admin raw writes require an explicit server-side flag", () => {
	const functions = { config: () => ({ scerv: {} }) };

	assert.equal(
		isAdminRawWriteEnabled(functions, {
			SCERV_ADMIN_RAW_WRITE_ENABLED: "true",
		}),
		true,
	);
});

test("admin raw write denylist blocks sensitive operational paths", () => {
	const deniedPaths = [
		"staffSessions/sessionA",
		"emailOtpChallenges/challengeA",
		"staffPinAttempts/attemptA",
		"orders/orderA",
		"pending_orders/orderA",
		"stripeEvents/eventA",
		"scervAdminAuditLogs/logA",
		"restaurants/restaurantA/private/owner",
		"restaurants/restaurantA/employees/employeeA/private/pin",
		"customers/customerA/paymentMethods/cardA",
	];

	for (const path of deniedPaths) {
		assert.equal(isDeniedRawFirestoreWritePath(path), true, path);
	}

	assert.equal(
		isDeniedRawFirestoreWritePath("restaurants/restaurantA/menuItems/itemA"),
		false,
	);
});

test("admin raw access hashing is stable and merge-aware", () => {
	const first = { b: 2, a: { d: 4, c: 3 } };
	const second = { a: { c: 3, d: 4 }, b: 2 };
	const before = { name: "Harbor", city: "Brooklyn" };
	const payload = { city: "Williamsburg" };

	assert.equal(stableHash(first), stableHash(second));
	assert.deepEqual(buildAfterData(before, payload, true), {
		name: "Harbor",
		city: "Williamsburg",
	});
	assert.deepEqual(buildAfterData(before, payload, false), payload);
});

test("runtime project id is read from environment metadata", () => {
	assert.equal(getRuntimeProjectId({ GCLOUD_PROJECT: "scervmvp-dev" }), "scervmvp-dev");
	assert.equal(
		getRuntimeProjectId({
			FIREBASE_CONFIG: JSON.stringify({ projectId: "scervmvp-testing" }),
		}),
		"scervmvp-testing",
	);
});
