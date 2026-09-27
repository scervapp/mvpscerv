const parseVersionParts = (version) =>
	String(version || "")
		.split(".")
		.map((part) => Number.parseInt(part, 10))
		.map((part) => (Number.isFinite(part) ? part : 0));

const compareVersions = (currentVersion, minimumVersion) => {
	const current = parseVersionParts(currentVersion);
	const minimum = parseVersionParts(minimumVersion);
	const maxLength = Math.max(current.length, minimum.length);

	for (let index = 0; index < maxLength; index += 1) {
		const currentPart = current[index] || 0;
		const minimumPart = minimum[index] || 0;
		if (currentPart > minimumPart) return 1;
		if (currentPart < minimumPart) return -1;
	}

	return 0;
};

const isBuildAtLeast = (currentBuild, minimumBuild) => {
	if (minimumBuild === undefined || minimumBuild === null || minimumBuild === "") {
		return true;
	}

	const current = Number.parseInt(currentBuild || 0, 10);
	const minimum = Number.parseInt(minimumBuild || 0, 10);
	if (!Number.isFinite(minimum) || minimum <= 0) return true;
	return Number.isFinite(current) && current >= minimum;
};

const normalizeClientInfo = (data = {}) => ({
	platform: String(data.platform || "")
		.trim()
		.toLowerCase(),
	version: String(data.version || "").trim(),
	build:
		data.build !== undefined && data.build !== null
			? data.build
			: data.buildNumber !== undefined && data.buildNumber !== null
				? data.buildNumber
				: data.versionCode !== undefined && data.versionCode !== null
					? data.versionCode
					: "",
	appEnv: String(data.appEnv || "").trim(),
});

const evaluateClientVersion = (clientInfo, policy = {}) => {
	if (!policy || policy.enabled === false) {
		return { updateRequired: false, reason: "disabled" };
	}

	const minimumVersion = policy.minNativeVersion || policy.minimumNativeVersion;
	if (
		minimumVersion &&
		compareVersions(clientInfo.version, minimumVersion) < 0
	) {
		return { updateRequired: true, reason: "version" };
	}

	const platform = clientInfo.platform === "ios" ? "ios" : "android";
	const minimumBuild =
		platform === "ios"
			? policy.minNativeBuildIos || policy.minimumNativeBuildIos
			: policy.minNativeBuildAndroid || policy.minimumNativeBuildAndroid;

	if (!isBuildAtLeast(clientInfo.build, minimumBuild)) {
		return { updateRequired: true, reason: `${platform}_build` };
	}

	return { updateRequired: false, reason: "supported" };
};

module.exports = {
	compareVersions,
	evaluateClientVersion,
	isBuildAtLeast,
	normalizeClientInfo,
	parseVersionParts,
};
