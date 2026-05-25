export const getRestaurantPermissions = (activeSession) => {
	const role = String(activeSession?.role || "")
		.trim()
		.toLowerCase();
	const jobTitle = String(activeSession?.jobTitle || "")
		.trim()
		.toLowerCase();

	const isManagement = role === "owner" || role === "manager";
	const isWorker = role === "worker";
	const isServer = isWorker && jobTitle === "server";
	const isHost = isWorker && jobTitle === "host";
	const isChef = isWorker && ["chef", "kitchen"].includes(jobTitle);
	const isBartender = isWorker && ["bartender", "bar"].includes(jobTitle);
	const isSupport = isWorker && ["support", "busser", "runner"].includes(jobTitle);
	const isFrontOfHouse = isManagement || isServer || isHost;
	const isBackOfHouse = isManagement || isChef || isBartender;

	return {
		role,
		jobTitle,
		isManagement,
		isWorker,
		isServer,
		isHost,
		isChef,
		isBartender,
		isSupport,

		canViewDashboard: isManagement || isServer || isHost || isSupport,
		canViewTickets: isFrontOfHouse || isSupport,
		canSeatWalkIn: isManagement || isHost || isServer,
		canViewServiceRequests: isFrontOfHouse || isSupport,
		canViewKitchen: isBackOfHouse,
		canViewPickupQueue: isManagement || isSupport || isHost,
		canCloseTable: isManagement || isServer,
		canCleanTable: isManagement || isServer || isSupport,
		canForceClearTable: isManagement || isSupport,
		canEnterStaffOrders: isManagement || isServer,
		canManageBackOffice: isManagement,
		canManageEmployees: isManagement,
		canViewReports: isManagement,
	};
};
