export const PREP_STATIONS = ["kitchen", "bar"];

export const itemBelongsToPrepStation = (item, station) => {
	if (!item || !station) return false;
	if (item.destination === station) return true;

	if (station === "kitchen") {
		return (
			Array.isArray(item.kitchenModifiers) && item.kitchenModifiers.length > 0
		);
	}

	if (station === "bar") {
		return Array.isArray(item.barModifiers) && item.barModifiers.length > 0;
	}

	return false;
};

export const getPrepStationStatus = (item, station, fallbackStatus = "new") =>
	item?.stationStatuses?.[station] || fallbackStatus || "new";

export const getPrimaryPrepStation = (item = {}) => {
	if (item.destination === "bar") return "bar";
	if (item.destination === "kitchen") return "kitchen";
	if (Array.isArray(item.barModifiers) && item.barModifiers.length > 0) {
		return "bar";
	}
	return "kitchen";
};

export const getPrepItemStatus = (item = {}) => {
	const station = getPrimaryPrepStation(item);
	const status = item.stationStatuses?.[station] || item.status || "new";

	if (status === "served" || item.foodRunStatus === "served") return "served";
	if (status === "ready") return "ready";
	if (status === "preparing") return "preparing";
	if (status === "sent") return "sent";
	return item.status || "new";
};

export const buildReadyStationInfo = (tickets = [], stations = PREP_STATIONS) => {
	let readyItemCount = 0;
	let servedItemCount = 0;
	let prepItemCount = 0;
	const readyTicketIds = new Set();
	const readyStationCounts = {};

	stations.forEach((station) => {
		readyStationCounts[station] = 0;
	});

	tickets.forEach((ticket) => {
		const ticketItems = Array.isArray(ticket?.items) ? ticket.items : [];

		stations.forEach((station) => {
			const stationFallback =
				ticket?.stationStatuses?.[station] || ticket?.status || "new";

			ticketItems.forEach((item) => {
				if (!itemBelongsToPrepStation(item, station)) return;

				const status = getPrepStationStatus(item, station, stationFallback);
				if (status === "served") {
					servedItemCount += 1;
					return;
				}

				prepItemCount += 1;
				if (status === "ready") {
					readyItemCount += 1;
					readyStationCounts[station] += 1;
					if (ticket?.id) readyTicketIds.add(ticket.id);
				}
			});
		});
	});

	return {
		readyItemCount,
		servedItemCount,
		prepItemCount,
		readyTicketIds: [...readyTicketIds],
		readyStationCounts,
		hasItemsReady: readyItemCount > 0,
		allItemsReady: prepItemCount > 0 && readyItemCount === prepItemCount,
	};
};
