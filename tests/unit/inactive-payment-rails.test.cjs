const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");

function readFunctionSource(fileName) {
	return fs.readFileSync(path.join(root, "functions", fileName), "utf8");
}

function assertLastExportUses(source, exportName, expectedHandler) {
	const assignment = `exports.${exportName}`;
	const lastAssignmentIndex = source.lastIndexOf(assignment);
	assert.ok(lastAssignmentIndex >= 0, `${exportName} export not found`);
	assert.match(
		source.slice(lastAssignmentIndex),
		new RegExp(`${exportName}\\s*=\\s*${expectedHandler}`),
		`${exportName} must end on the inactive rail handler`,
	);
}

test("PayPal exports fail closed while the rail is inactive", () => {
	const source = readFunctionSource("paypalHandlers.js");

	for (const exportName of [
		"createPayPalOrder",
		"capturePayPalOrder",
		"chargeVaultedCard",
	]) {
		assertLastExportUses(
			source,
			exportName,
			"functions\\.https\\.onCall\\(rejectInactivePayPalRail\\)",
		);
	}
});

test("dLocal exports fail closed while the rail is inactive", () => {
	const source = readFunctionSource("dLocalFunctions.js");

	for (const exportName of [
		"getDlocalPublicKey",
		"createDlocalCheckout",
		"processDlocalNativePayment",
		"processDlocalTokenCharge",
		"createDlocalPayment",
		"confirmDlocalPayment",
		"chargeSavedDlocalCard",
	]) {
		assertLastExportUses(
			source,
			exportName,
			"functions\\.https\\.onCall\\(rejectInactiveDlocalRail\\)",
		);
	}

	assertLastExportUses(
		source,
		"dlocalWebhook",
		"functions\\.https\\.onRequest",
	);
});
