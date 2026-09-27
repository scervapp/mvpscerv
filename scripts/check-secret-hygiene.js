const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const blockedTrackedPaths = new Set([
	"functions/.env",
	"functions/test.js",
	"src.zip",
]);

const blockedExtensions = [".zip", ".tar", ".tgz", ".gz", ".jks", ".p8", ".p12", ".pem", ".key"];

const valuePatterns = [
	{ name: "Stripe live secret key", regex: /sk_live_[A-Za-z0-9]+/ },
	{ name: "Stripe restricted live key", regex: /rk_live_[A-Za-z0-9]+/ },
	{ name: "Stripe webhook secret", regex: /whsec_[A-Za-z0-9]+/ },
	{ name: "Private key block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ name: "Likely assigned client secret", regex: /\bclient[_-]?secret\b\s*[:=]\s*['"][^'"]{8,}/i },
	{ name: "Likely assigned private key", regex: /\bprivate_key\b\s*[:=]\s*['"][^'"]{8,}/i },
];

function toPosix(filePath) {
	return filePath.replace(/\\/g, "/");
}

function getTrackedFiles() {
	const output = execFileSync("git", ["ls-files"], { encoding: "utf8" });
	return output.split(/\r?\n/).filter(Boolean).map(toPosix);
}

function isLikelyText(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	if (blockedExtensions.includes(extension)) return false;
	try {
		const buffer = fs.readFileSync(filePath);
		return !buffer.includes(0);
	} catch (_error) {
		return false;
	}
}

const findings = [];
const trackedFiles = getTrackedFiles();

for (const filePath of trackedFiles) {
	if (!fs.existsSync(filePath)) continue;

	const extension = path.extname(filePath).toLowerCase();
	const basename = path.basename(filePath).toLowerCase();

	if (blockedTrackedPaths.has(filePath)) {
		findings.push({ filePath, rule: "blocked tracked credential/generated file" });
	}

	if (basename === ".env" || (/^\.env\./.test(basename) && basename !== ".env.example")) {
		findings.push({ filePath, rule: "tracked environment file" });
	}

	if (blockedExtensions.includes(extension)) {
		findings.push({ filePath, rule: `tracked blocked extension ${extension}` });
	}

	if (!isLikelyText(filePath)) continue;

	const content = fs.readFileSync(filePath, "utf8");
	for (const pattern of valuePatterns) {
		if (pattern.regex.test(content)) {
			findings.push({ filePath, rule: pattern.name });
		}
	}
}

if (findings.length > 0) {
	console.error("Secret hygiene check failed. Values are not printed; review these paths/rules:");
	for (const finding of findings) {
		console.error(`- ${finding.filePath}: ${finding.rule}`);
	}
	process.exit(1);
}

console.log("Secret hygiene check passed.");
