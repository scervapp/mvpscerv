const fs = require("fs");
const path = require("path");

const PROD_PROJECT = "scervmvp";
const ALLOWED_PROJECTS = new Set(["scervmvp-dev", "scervmvp-testing", PROD_PROJECT]);

const args = process.argv.slice(2);

function readFirebaseAliases() {
	const rcPath = path.join(process.cwd(), ".firebaserc");
	if (!fs.existsSync(rcPath)) return {};

	try {
		const parsed = JSON.parse(fs.readFileSync(rcPath, "utf8"));
		return parsed.projects || {};
	} catch (error) {
		console.error(`Unable to parse .firebaserc: ${error.message}`);
		process.exit(1);
	}
}

function getArgValue(flagName) {
	const inline = args.find((arg) => arg.startsWith(`${flagName}=`));
	if (inline) return inline.slice(flagName.length + 1);

	const index = args.indexOf(flagName);
	if (index >= 0 && args[index + 1]) return args[index + 1];
	return "";
}

function resolveProject(value, aliases) {
	if (!value) return "";
	return aliases[value] || value;
}

const aliases = readFirebaseAliases();
const explicitProject =
	process.env.FIREBASE_DEPLOY_PROJECT ||
	getArgValue("--project") ||
	process.env.GCLOUD_PROJECT ||
	process.env.FIREBASE_CONFIG_PROJECT ||
	"";
const targetProject = resolveProject(explicitProject, aliases);
const surface = getArgValue("--surface") || "unknown";
const confirm = process.env.CONFIRM_PROD_DEPLOY;

if (!targetProject) {
	console.error(
		`Refusing Firebase deploy for ${surface}: no explicit Firebase project was provided. ` +
			"Use --project dev, --project testing or --project prod."
	);
	process.exit(1);
}

if (!ALLOWED_PROJECTS.has(targetProject)) {
	console.error(
		`Refusing Firebase deploy for ${surface}: '${targetProject}' is not an approved Scerv Firebase project.`
	);
	process.exit(1);
}

if (targetProject === PROD_PROJECT && confirm !== PROD_PROJECT) {
	console.error(
		`Refusing Firebase deploy for ${surface} to production project ${PROD_PROJECT}. ` +
			`Set CONFIRM_PROD_DEPLOY=${PROD_PROJECT} only after founder approval for this exact deploy.`
	);
	process.exit(1);
}

console.log(`Firebase deploy guard passed for ${surface} on ${targetProject}.`);
