const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
	buildPipSearchResult,
	maskEmail,
} = require("../../functions/userSearchPrivacy");

test("PIP search masks email addresses before returning results", () => {
	assert.equal(maskEmail("ALICE@example.com"), "al***@ex***.com");
	assert.equal(maskEmail("bo@xy.io"), "b*@x*.io");
	assert.equal(maskEmail("not-an-email"), null);
});

test("PIP search result exposes only id, display name and email hint", () => {
	const result = buildPipSearchResult(
		{
			id: "customer-a",
			data: () => ({
				fullName: "Alice Rivera",
				email: "alice@example.com",
				phoneNumber: "+15551234567",
				availablePoints: 10000,
			}),
		},
		"customer-b",
	);

	assert.deepEqual(result, {
		id: "customer-a",
		name: "Alice Rivera",
		emailHint: "al***@ex***.com",
	});
	assert.equal(Object.hasOwn(result, "email"), false);
	assert.equal(Object.hasOwn(result, "phoneNumber"), false);
});

test("PIP search result excludes the calling user", () => {
	assert.equal(
		buildPipSearchResult(
			{
				id: "customer-a",
				data: () => ({ fullName: "Alice Rivera" }),
			},
			"customer-a",
		),
		null,
	);
});
