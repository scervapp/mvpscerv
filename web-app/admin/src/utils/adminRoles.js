export const normalizeAdminRole = (role) => {
	const normalized = String(role || "")
		.trim()
		.toLowerCase();

	if (normalized === "super_admin") {
		return "godmode";
	}

	if (normalized === "scerv_admin") {
		return "admin";
	}

	return normalized;
};

export const canAccessAdminPortal = (role) =>
	["admin", "godmode"].includes(normalizeAdminRole(role));

export const canManageAdminUsers = (role) =>
	normalizeAdminRole(role) === "godmode";
