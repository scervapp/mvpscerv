const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
	canUseDirectPartyIdJoin,
	isPartyMember,
	normalizeInviteCode,
} = require("../../functions/partySecurity");

test("party invite codes are normalized before lookup", () => {
	assert.equal(normalizeInviteCode(" ab12cd "), "AB12CD");
	assert.equal(normalizeInviteCode(null), "");
	assert.equal(normalizeInviteCode(123), "");
});

test("party membership recognizes supported member fields", () => {
	assert.equal(isPartyMember({ hostUserId: "host-a" }, "host-a"), true);
	assert.equal(isPartyMember({ hostId: "legacy-host" }, "legacy-host"), true);
	assert.equal(isPartyMember({ guestUserIds: ["guest-a"] }, "guest-a"), true);
	assert.equal(isPartyMember({ memberUids: ["member-a"] }, "member-a"), true);
	assert.equal(
		isPartyMember({ guestPips: [{ userId: "pip-a" }] }, "pip-a"),
		true,
	);
	assert.equal(isPartyMember({ guestUserIds: ["guest-a"] }, "outsider"), false);
});

test("direct party ID joins are only allowed for existing members", () => {
	assert.equal(
		canUseDirectPartyIdJoin({
			partyData: { guestUserIds: ["known-guest"] },
			uid: "known-guest",
		}),
		true,
	);
	assert.equal(
		canUseDirectPartyIdJoin({
			partyData: { guestUserIds: ["known-guest"] },
			uid: "unknown-guest",
		}),
		false,
	);
});
