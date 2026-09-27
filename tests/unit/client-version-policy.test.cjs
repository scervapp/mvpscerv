const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
	compareVersions,
	evaluateClientVersion,
	isBuildAtLeast,
	normalizeClientInfo,
} = require("../../functions/clientVersionPolicy");

test("client version comparison handles semantic version parts", () => {
	assert.equal(compareVersions("0.0.44", "0.0.43"), 1);
	assert.equal(compareVersions("0.0.44", "0.0.44"), 0);
	assert.equal(compareVersions("0.0.43", "0.0.44"), -1);
	assert.equal(compareVersions("1.2", "1.2.0"), 0);
});

test("client build comparison supports optional minimum builds", () => {
	assert.equal(isBuildAtLeast("34", "34"), true);
	assert.equal(isBuildAtLeast(35, 34), true);
	assert.equal(isBuildAtLeast(33, 34), false);
	assert.equal(isBuildAtLeast(0, null), true);
});

test("client version policy allows supported builds and blocks old builds", () => {
	const policy = {
		enabled: true,
		minNativeVersion: "0.0.44",
		minNativeBuildIos: 34,
		minNativeBuildAndroid: 36,
	};

	assert.deepEqual(
		evaluateClientVersion(
			{ platform: "ios", version: "0.0.44", build: 34 },
			policy,
		),
		{ updateRequired: false, reason: "supported" },
	);
	assert.deepEqual(
		evaluateClientVersion(
			{ platform: "ios", version: "0.0.43", build: 34 },
			policy,
		),
		{ updateRequired: true, reason: "version" },
	);
	assert.deepEqual(
		evaluateClientVersion(
			{ platform: "android", version: "0.0.44", build: 35 },
			policy,
		),
		{ updateRequired: true, reason: "android_build" },
	);
});

test("client version policy can be disabled for emergency fail-open", () => {
	assert.deepEqual(
		evaluateClientVersion(
			{ platform: "android", version: "0.0.1", build: 1 },
			{ enabled: false, minNativeVersion: "9.9.9" },
		),
		{ updateRequired: false, reason: "disabled" },
	);
});

test("client version callable input is normalized", () => {
	assert.deepEqual(
		normalizeClientInfo({
			platform: " IOS ",
			version: " 0.0.44 ",
			buildNumber: "34",
			appEnv: " testing ",
		}),
		{
			platform: "ios",
			version: "0.0.44",
			build: "34",
			appEnv: "testing",
		},
	);
});
