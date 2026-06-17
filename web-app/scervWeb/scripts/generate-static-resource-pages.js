const fs = require("fs");
const path = require("path");

const siteUrl = "https://www.scerv.com";
const buildDir = path.resolve(__dirname, "..", "build");
const indexPath = path.join(buildDir, "index.html");
const manifestPath = path.join(buildDir, "asset-manifest.json");

const resources = [
	{
		slug: "restaurant-tech-checklist-new-restaurants",
		title: "Restaurant Tech Checklist for New Restaurants | Scerv",
		description:
			"A practical, operator-first technology checklist for opening a restaurant without creating chaos for guests, staff, or ownership.",
		imageManifestKey: "static/media/ordering.jpeg",
		imageAlt:
			"Restaurant technology and service workflow planning for modern operators",
		type: "article",
		publishedTime: "2026-06-17",
	},
	{
		slug: "mistakes-new-restaurants-make-before-opening",
		title: "7 Mistakes New Restaurants Make Before Opening | Scerv",
		description:
			"The most expensive restaurant mistakes often happen before the first guest sits down. Here is how to avoid them.",
		imageManifestKey: "static/media/chefsQ.jpeg",
		imageAlt: "Restaurant team preparing service before opening night",
		type: "article",
		publishedTime: "2026-06-17",
	},
];

const hubPage = {
	pathname: "/resources",
	title: "Restaurant Growth Resources | Scerv",
	description:
		"Restaurant startup and operations guides from Scerv for owners preparing to open, modernize, and grow.",
	imageManifestKey: "static/media/ordering.jpeg",
	imageAlt: "Scerv restaurant growth resources for owners and operators",
	type: "website",
};

const escapeHtml = (value) =>
	String(value)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

const getAbsoluteUrl = (pathname) => `${siteUrl}${pathname}`;

const getAssetUrl = (manifest, key) => {
	const assetPath = manifest.files[key] || manifest.files["logo512.png"] || "/logo512.png";
	return assetPath.startsWith("http") ? assetPath : `${siteUrl}${assetPath}`;
};

const replaceOrInsertTag = (html, matcher, tag) => {
	if (matcher.test(html)) {
		return html.replace(matcher, tag);
	}

	return html.replace("</head>", `    ${tag}\n  </head>`);
};

const applyMeta = (html, page, manifest) => {
	const url = page.pathname
		? getAbsoluteUrl(page.pathname)
		: getAbsoluteUrl(`/resources/${page.slug}`);
	const image = getAssetUrl(manifest, page.imageManifestKey);
	const escapedTitle = escapeHtml(page.title);
	const escapedDescription = escapeHtml(page.description);
	const escapedImageAlt = escapeHtml(page.imageAlt);

	const tags = [
		`<link rel="canonical" href="${url}" />`,
		`<meta name="robots" content="index,follow" />`,
		`<meta property="og:title" content="${escapedTitle}" />`,
		`<meta property="og:description" content="${escapedDescription}" />`,
		`<meta property="og:type" content="${page.type}" />`,
		`<meta property="og:url" content="${url}" />`,
		`<meta property="og:image" content="${image}" />`,
		`<meta property="og:image:alt" content="${escapedImageAlt}" />`,
		`<meta name="twitter:card" content="summary_large_image" />`,
		`<meta name="twitter:title" content="${escapedTitle}" />`,
		`<meta name="twitter:description" content="${escapedDescription}" />`,
		`<meta name="twitter:image" content="${image}" />`,
	];

	if (page.publishedTime) {
		tags.push(
			`<meta property="article:published_time" content="${page.publishedTime}" />`,
			`<meta property="article:modified_time" content="${page.publishedTime}" />`
		);
	}

	let pageHtml = html;
	pageHtml = replaceOrInsertTag(
		pageHtml,
		/<title>.*?<\/title>/,
		`<title>${escapedTitle}</title>`
	);
	pageHtml = replaceOrInsertTag(
		pageHtml,
		/<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
		`<meta name="description" content="${escapedDescription}" />`
	);

	return pageHtml.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
};

const writePage = (page, html, manifest) => {
	const pathname = page.pathname || `/resources/${page.slug}`;
	const outputDir = path.join(buildDir, pathname.replace(/^\//, ""));
	fs.mkdirSync(outputDir, { recursive: true });
	fs.writeFileSync(path.join(outputDir, "index.html"), applyMeta(html, page, manifest));
};

const main = () => {
	if (!fs.existsSync(indexPath) || !fs.existsSync(manifestPath)) {
		throw new Error("Build output is missing. Run react-scripts build first.");
	}

	const html = fs.readFileSync(indexPath, "utf8");
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

	writePage(hubPage, html, manifest);
	resources.forEach((resource) => writePage(resource, html, manifest));

	console.log(`Generated ${resources.length + 1} static resource pages.`);
};

main();
