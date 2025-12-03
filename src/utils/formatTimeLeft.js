const formatTimeLeft = (expiresAt) => {
	if (!expiresAt) return "unknown";

	let expiryTime;

	// Handle Firestore Timestamp or Date
	if (expiresAt.toDate) {
		expiryTime = expiresAt.toDate().getTime();
	} else if (expiresAt instanceof Date) {
		expiryTime = expiresAt.getTime();
	} else if (typeof expiresAt === "number") {
		expiryTime = expiresAt;
	} else {
		return "unknown";
	}

	const now = Date.now();
	const diffMs = expiryTime - now;

	if (diffMs <= 0) return "expired";

	const minutes = Math.floor(diffMs / 60000);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours} hour${hours > 1 ? "s" : ""} ${minutes % 60} min`;
	} else {
		return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
	}
};

export default formatTimeLeft;
