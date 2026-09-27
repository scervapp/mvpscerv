const maskEmail = (email) => {
	const normalized = String(email || "")
		.trim()
		.toLowerCase();
	const [localPart, domain] = normalized.split("@");
	if (!localPart || !domain) return null;

	const visibleLocal =
		localPart.length <= 2
			? `${localPart[0] || ""}*`
			: `${localPart.slice(0, 2)}***`;
	const domainParts = domain.split(".");
	const domainName = domainParts[0] || "";
	const tld = domainParts.slice(1).join(".");
	const visibleDomain =
		domainName.length <= 2
			? `${domainName[0] || ""}*`
			: `${domainName.slice(0, 2)}***`;

	return `${visibleLocal}@${visibleDomain}${tld ? `.${tld}` : ""}`;
};

const buildPipSearchResult = (doc, currentUserId) => {
	if (!doc || doc.id === currentUserId) return null;

	const userData = doc.data() || {};
	const name =
		userData.fullName ||
		`${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
		userData.displayName ||
		"Scerv guest";

	return {
		id: doc.id,
		name,
		emailHint: maskEmail(userData.email || userData.emailLower),
	};
};

module.exports = {
	buildPipSearchResult,
	maskEmail,
};
