const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "scervmvp";
const args = new Set(process.argv.slice(2));
const shouldDelete = args.has("--delete");
const confirmed = args.has("--confirm-production-auth-wipe");
const backupPath = path.join(process.cwd(), "backups", "production-auth.json");

function getAccessToken() {
	const raw = execFileSync(
		"cmd.exe",
		["/d", "/c", "npx.cmd firebase login:list --json"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}
	);
	const parsed = JSON.parse(raw);
	const token = parsed?.result?.[0]?.tokens?.access_token;
	if (!token) {
		throw new Error("Could not read Firebase CLI access token.");
	}
	return token;
}

async function batchDelete(token, localIds) {
	const response = await fetch(
		`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				localIds,
				force: true,
			}),
		}
	);

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Auth batch delete failed: ${response.status} ${text}`);
	}
	return response.json();
}

async function main() {
	if (!fs.existsSync(backupPath)) {
		throw new Error(
			`Missing ${backupPath}. Run npm run backup:prod:auth before deleting users.`
		);
	}
	if (shouldDelete && !confirmed) {
		throw new Error(
			"Refusing to delete production Auth users without --confirm-production-auth-wipe."
		);
	}

	const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
	const localIds = (backup.users || []).map((user) => user.localId).filter(Boolean);
	console.log(`Production Auth backup: ${backupPath}`);
	console.log(`Users in backup: ${localIds.length}`);

	if (!shouldDelete) {
		console.log("Dry run complete. No Auth users were deleted.");
		return;
	}

	const token = getAccessToken();
	for (let index = 0; index < localIds.length; index += 1000) {
		const batch = localIds.slice(index, index + 1000);
		await batchDelete(token, batch);
		console.log(`Deleted ${Math.min(index + batch.length, localIds.length)} / ${localIds.length}`);
	}

	console.log("Production Auth cleanup complete.");
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
