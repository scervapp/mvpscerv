const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const appEnv = process.env.APP_ENV || "production";

const androidConfigByEnv = {
	development: "credentials/firebase/development/google-services.json",
	testing: "credentials/firebase/testing/google-services.json",
	storeTesting: "credentials/firebase/development-store/google-services.json",
	production: "google-services.json",
};

const sourceRelativePath =
	androidConfigByEnv[appEnv] || androidConfigByEnv.production;
const sourcePath = path.join(projectRoot, sourceRelativePath);
const destinationPath = path.join(
	projectRoot,
	"android",
	"app",
	"google-services.json",
);

if (!fs.existsSync(sourcePath)) {
	throw new Error(
		`Missing Android Firebase config for APP_ENV=${appEnv}: ${sourceRelativePath}`,
	);
}

function readTextFile(filePath) {
	const bytes = fs.readFileSync(filePath);

	if (bytes[0] === 0xff && bytes[1] === 0xfe) {
		return bytes.toString("utf16le").replace(/^\uFEFF/, "");
	}

	return bytes.toString("utf8").replace(/^\uFEFF/, "");
}

// Native Android builds read android/app/google-services.json directly.
// Copying here keeps EAS profiles pointed at the intended Firebase project.
const fileContents = readTextFile(sourcePath);
fs.writeFileSync(destinationPath, fileContents);
console.log(
	`Prepared Android Firebase config for APP_ENV=${appEnv}: ${sourceRelativePath}`,
);
