const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "scervmvp";
const DATABASE_ID = "(default)";
const KEEP_COLLECTIONS = new Set(["Appconfig", "appConfig", "general"]);
const args = new Set(process.argv.slice(2));
const shouldDelete = args.has("--delete");
const confirmed = args.has("--confirm-production-wipe");
const backupRoot = path.join(
	process.cwd(),
	"backups",
	`production-firestore-${new Date().toISOString().replace(/[:.]/g, "-")}`
);

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

async function api(method, url, token, body) {
	const response = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`${method} ${url} failed: ${response.status} ${text}`);
	}
	return response.status === 204 ? null : response.json();
}

function firestoreBase() {
	return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(
		DATABASE_ID
	)}/documents`;
}

function documentApiName(documentName) {
	return documentName.split("/documents/")[1];
}

async function listCollectionIds(token, documentName = "") {
	const parent = documentName ? `${firestoreBase()}/${documentName}` : firestoreBase();
	const url = `${parent}:listCollectionIds`;
	const ids = [];
	let pageToken;
	do {
		const result = await api("POST", url, token, { pageSize: 300, pageToken });
		ids.push(...(result.collectionIds || []));
		pageToken = result.nextPageToken;
	} while (pageToken);
	return ids.sort();
}

async function listDocuments(token, collectionPath) {
	const url = `${firestoreBase()}/${collectionPath}`;
	const docs = [];
	let pageToken;
	do {
		const query = new URL(url);
		query.searchParams.set("pageSize", "300");
		if (pageToken) query.searchParams.set("pageToken", pageToken);
		const result = await api("GET", query.toString(), token);
		docs.push(...(result.documents || []));
		pageToken = result.nextPageToken;
	} while (pageToken);
	return docs;
}

async function backupCollection(token, collectionPath, outDir) {
	const docs = await listDocuments(token, collectionPath);
	const safeName = collectionPath.replace(/[\\/]/g, "__");
	const outPath = path.join(outDir, `${safeName}.json`);
	fs.writeFileSync(outPath, JSON.stringify(docs, null, 2));

	let totalDocs = docs.length;
	for (const doc of docs) {
		const docPath = documentApiName(doc.name);
		const subcollections = await listCollectionIds(token, docPath);
		for (const subcollection of subcollections) {
			totalDocs += await backupCollection(
				token,
				`${docPath}/${subcollection}`,
				outDir
			);
		}
	}
	return totalDocs;
}

async function deleteCollection(collection) {
	execFileSync(
		"cmd.exe",
		[
			"/d",
			"/c",
			`npx.cmd firebase firestore:delete "${collection}" --recursive --force --project ${PROJECT_ID}`,
		],
		{ stdio: "inherit" }
	);
}

async function main() {
	if (shouldDelete && !confirmed) {
		throw new Error(
			"Refusing to delete production data without --confirm-production-wipe."
		);
	}

	const token = getAccessToken();
	const collections = await listCollectionIds(token);
	const deletable = collections.filter((name) => !KEEP_COLLECTIONS.has(name));
	const kept = collections.filter((name) => KEEP_COLLECTIONS.has(name));

	fs.mkdirSync(backupRoot, { recursive: true });
	const manifest = {
		projectId: PROJECT_ID,
		databaseId: DATABASE_ID,
		createdAt: new Date().toISOString(),
		mode: shouldDelete ? "backup-and-delete" : "backup-and-dry-run",
		keptCollections: kept,
		deletableCollections: deletable,
	};
	fs.writeFileSync(
		path.join(backupRoot, "manifest.json"),
		JSON.stringify(manifest, null, 2)
	);

	console.log(`Project: ${PROJECT_ID}`);
	console.log(`Backup folder: ${backupRoot}`);
	console.log(`Keeping: ${kept.join(", ") || "(none found)"}`);
	console.log(`Deleting: ${deletable.join(", ") || "(none)"}`);

	for (const collection of collections) {
		const count = await backupCollection(token, collection, backupRoot);
		console.log(`Backed up ${collection}: ${count} document(s) including subcollections`);
	}

	if (!shouldDelete) {
		console.log("Dry run complete. No Firestore data was deleted.");
		return;
	}

	for (const collection of deletable) {
		console.log(`Deleting ${collection}...`);
		await deleteCollection(collection);
	}

	console.log("Production Firestore cleanup complete.");
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
