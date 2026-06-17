import React from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

const SEO = ({ titleKey, descKey }) => {
	const { t, i18n } = useTranslation();

	return (
		<Helmet htmlAttributes={{ lang: i18n.language }}>
			<title>{t(titleKey)}</title>
			<meta name="description" content={t(descKey)} />
			<meta property="og:title" content={t(titleKey)} />
			<meta property="og:description" content={t(descKey)} />
			<meta property="og:type" content="website" />
			<meta
				name="keywords"
				content="restaurant platform New York, Brooklyn restaurant technology, hospitality platform, restaurant guest experience, restaurant rewards, restaurant operations, Scerv"
			/>
		</Helmet>
	);
};

export default SEO;
