const admin = require("../functions/node_modules/firebase-admin");

const email = process.argv[2];
const role = String(process.argv[3] || "godmode")
	.trim()
	.toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
	console.error("Usage: node scripts/set-scerv-admin-claim.js email role");
	process.exit(1);
}

if (!["admin", "godmode"].includes(role)) {
	console.error("Role must be admin or godmode.");
	process.exit(1);
}

admin.initializeApp({
	projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || "scervmvp",
});

async function main() {
	const user = await admin.auth().getUserByEmail(email.toLowerCase());
	await admin.auth().setCustomUserClaims(user.uid, { role });
	await admin.firestore().collection("scervAdminUsers").doc(user.uid).set(
		{
			email: user.email || email.toLowerCase(),
			displayName: user.displayName || "",
			role,
			disabled: Boolean(user.disabled),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedBy: "local-bootstrap-script",
		},
		{ merge: true },
	);

	console.log(`Updated ${user.email} (${user.uid}) to role=${role}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
