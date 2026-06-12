const project = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT;
const targetProject = process.env.FIREBASE_DEPLOY_PROJECT || project || "";
const confirm = process.env.CONFIRM_PROD_DEPLOY;

if (targetProject === "scervmvp" && confirm !== "scervmvp") {
	console.error(
		"Refusing to deploy to production Firebase project scervmvp. " +
			"Set CONFIRM_PROD_DEPLOY=scervmvp for an intentional prod deploy."
	);
	process.exit(1);
}
