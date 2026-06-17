import React from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

export const SITE_URL = (
	process.env.REACT_APP_SITE_URL || "https://scerv.com"
).replace(/\/$/, "");

const defaultKeywords =
	"restaurant platform New York, Brooklyn restaurant technology, hospitality platform, restaurant guest experience, restaurant rewards, restaurant operations, Scerv";

export const buildSeoUrl = (path = "/") => {
	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	return `${SITE_URL}${cleanPath}`;
};

const SEO = ({
	titleKey,
	descKey,
	path,
	type = "website",
	keywords = defaultKeywords,
	jsonLd,
}) => {
	const { t, i18n } = useTranslation();
	const title = t(titleKey);
	const description = t(descKey);
	const canonicalUrl = buildSeoUrl(path || window.location.pathname);
	const baseJsonLd = [
		{
			"@context": "https://schema.org",
			"@type": "Organization",
			name: "Scerv",
			url: SITE_URL,
			logo: buildSeoUrl("/logo512.png"),
			description:
				"Scerv is a hospitality platform for modern restaurants, connecting guest experience, service operations, rewards, reviews, and reporting.",
		},
		{
			"@context": "https://schema.org",
			"@type": "WebSite",
			name: "Scerv",
			url: SITE_URL,
		},
	];
	const schema = jsonLd ? [...baseJsonLd, jsonLd] : baseJsonLd;

	return (
		<Helmet htmlAttributes={{ lang: i18n.language }}>
			<title>{title}</title>
			<link rel="canonical" href={canonicalUrl} />
			<meta name="description" content={description} />
			<meta name="keywords" content={keywords} />
			<meta name="robots" content="index,follow" />
			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta property="og:type" content={type} />
			<meta property="og:url" content={canonicalUrl} />
			<meta property="og:site_name" content="Scerv" />
			<meta name="twitter:card" content="summary_large_image" />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			<script type="application/ld+json">{JSON.stringify(schema)}</script>
		</Helmet>
	);
};

export default SEO;
