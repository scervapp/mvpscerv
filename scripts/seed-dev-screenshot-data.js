const auth = require("firebase-tools/lib/auth");
const scopes = require("firebase-tools/lib/scopes");

const PROJECT_ID = "scervmvp-dev";
const DATABASE_ID = "(default)";
const RESTAURANT_ID = "jaRr9o8wLcXUyDPeF6QsirPjNtA3";
const RESTAURANT_NAME = "Harbor and Ember";

const args = new Set(process.argv.slice(2));
const confirmed = args.has("--confirm-dev-screenshot-seed");
const shouldClear = args.has("--clear");

if (!confirmed) {
	console.error(
		"Refusing to seed without --confirm-dev-screenshot-seed. This script only targets scervmvp-dev.",
	);
	process.exit(1);
}

function getAccessToken() {
	const account = auth.getGlobalDefaultAccount();
	const refreshToken = account?.tokens?.refresh_token;
	if (!refreshToken) {
		throw new Error(
			"Could not read Firebase refresh token. Run firebase login --reauth.",
		);
	}
	return auth
		.getAccessToken(refreshToken, [scopes.CLOUD_PLATFORM])
		.then((tokenData) => tokenData.access_token);
}

function firestoreBase() {
	return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(
		DATABASE_ID,
	)}/documents`;
}

function encodePath(path) {
	return path.split("/").map(encodeURIComponent).join("/");
}

function toFirestoreValue(value) {
	if (value === null || value === undefined) return { nullValue: null };
	if (value instanceof Date) return { timestampValue: value.toISOString() };
	if (Array.isArray(value)) {
		return { arrayValue: { values: value.map(toFirestoreValue) } };
	}
	if (typeof value === "boolean") return { booleanValue: value };
	if (typeof value === "number") {
		if (Number.isInteger(value)) return { integerValue: String(value) };
		return { doubleValue: value };
	}
	if (typeof value === "object") {
		return {
			mapValue: {
				fields: Object.fromEntries(
					Object.entries(value).map(([key, nestedValue]) => [
						key,
						toFirestoreValue(nestedValue),
					]),
				),
			},
		};
	}
	return { stringValue: String(value) };
}

function toFirestoreDocument(data) {
	return {
		fields: Object.fromEntries(
			Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
		),
	};
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
	if (!response.ok && !(method === "DELETE" && response.status === 404)) {
		const text = await response.text();
		throw new Error(`${method} ${url} failed: ${response.status} ${text}`);
	}
	return response.status === 204 ? null : response.json();
}

async function setDoc(token, path, data) {
	const updateMask = Object.keys(data)
		.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
		.join("&");
	const url = `${firestoreBase()}/${encodePath(path)}?${updateMask}`;
	await api("PATCH", url, token, toFirestoreDocument(data));
}

async function deleteDoc(token, path) {
	await api("DELETE", `${firestoreBase()}/${encodePath(path)}`, token);
}

const now = new Date();
const today = now.toISOString().slice(0, 10);
const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60000);
const minutesFromNow = (minutes) => new Date(now.getTime() + minutes * 60000);
const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60000);

const servers = [
	{ id: "demo_server_nadia", name: "Nadia Rivera", firstName: "Nadia", lastName: "Rivera" },
	{ id: "demo_server_miles", name: "Miles Carter", firstName: "Miles", lastName: "Carter" },
	{ id: "demo_server_amina", name: "Amina Brooks", firstName: "Amina", lastName: "Brooks" },
	{ id: "demo_bar_sam", name: "Sam Ellis", firstName: "Sam", lastName: "Ellis", jobTitle: "bartender" },
];

const tableFixtures = [
	{ id: "window_2", name: "Window 2", status: "occupied", partyId: "demo_screenshot_party_window_2" },
	{ id: "booth_6", name: "Booth 6", status: "occupied", partyId: "demo_screenshot_party_booth_6" },
	{ id: "bar_9", name: "Bar 9", status: "occupied", partyId: "demo_screenshot_party_bar_9" },
	{ id: "patio_4", name: "Patio 4", status: "checkedOut", partyId: "demo_screenshot_party_patio_4" },
	{ id: "table_12", name: "Table 12", status: "occupied", partyId: "demo_screenshot_party_table_12" },
];

const parties = [
	{
		id: "demo_screenshot_party_window_2",
		table: { id: "window_2", name: "Window 2" },
		hostName: "Maya R.",
		customerName: "Maya R.",
		customerId: "demo_customer_001",
		numberOfPeople: 4,
		partySize: 4,
		server: { id: "demo_server_nadia", name: "Nadia Rivera" },
		status: "active",
		customerStatus: "ordering",
		serviceRequested: true,
		serviceRequestMessage: "Could we get sparkling water and extra napkins?",
		serviceRequestStatus: "requested",
		seatedAt: minutesAgo(38),
		createdAt: minutesAgo(42),
		guestPips: ["Maya R.", "Jordan P.", "Lena C.", "Chris W."],
		fulfillmentType: "browser_table",
		hasBrowserOrder: true,
	},
	{
		id: "demo_screenshot_party_booth_6",
		table: { id: "booth_6", name: "Booth 6" },
		hostName: "Priya S.",
		customerName: "Priya S.",
		customerId: "demo_customer_009",
		numberOfPeople: 2,
		partySize: 2,
		server: { id: "demo_server_miles", name: "Miles Carter" },
		status: "active",
		customerStatus: "dining",
		seatedAt: minutesAgo(26),
		createdAt: minutesAgo(30),
		guestPips: ["Priya S.", "Evan B."],
		fulfillmentType: "host_assigned_walk_in",
	},
	{
		id: "demo_screenshot_party_bar_9",
		table: { id: "bar_9", name: "Bar 9" },
		hostName: "Daniel K.",
		customerName: "Daniel K.",
		customerId: "demo_customer_006",
		numberOfPeople: 3,
		partySize: 3,
		server: { id: "demo_bar_sam", name: "Sam Ellis" },
		status: "active",
		customerStatus: "ready_to_pay",
		seatedAt: minutesAgo(61),
		createdAt: minutesAgo(66),
		guestPips: ["Daniel K.", "Sofia N.", "Marcus T."],
		fulfillmentType: "table",
	},
	{
		id: "demo_screenshot_party_patio_4",
		table: { id: "patio_4", name: "Patio 4" },
		hostName: "Amara J.",
		customerName: "Amara J.",
		customerId: "demo_customer_005",
		numberOfPeople: 5,
		partySize: 5,
		server: { id: "demo_server_amina", name: "Amina Brooks" },
		status: "checkedOut",
		customerStatus: "paid",
		seatedAt: minutesAgo(92),
		checkedOutAt: minutesAgo(6),
		createdAt: minutesAgo(98),
		guestPips: ["Amara J.", "Guests"],
		fulfillmentType: "reservation_party",
		reservationId: "demo_screenshot_res_seated",
	},
	{
		id: "demo_screenshot_party_table_12",
		table: { id: "table_12", name: "Table 12" },
		hostName: "Walk-in Party",
		customerName: "Walk-in Party",
		customerId: "demo_customer_walkin",
		numberOfPeople: 6,
		partySize: 6,
		server: { id: "unassigned", name: "Unassigned" },
		status: "active",
		customerStatus: "ordering",
		seatedAt: minutesAgo(9),
		createdAt: minutesAgo(12),
		guestPips: ["Walk-in Party"],
		fulfillmentType: "host_assigned_walk_in",
	},
];

const basketItemsByParty = {
	demo_screenshot_party_window_2: [
		{
			id: "demo_basket_window_calamari",
			menuItemId: "dev_item_harbor_calamari",
			dishName: "Brooklyn Calamari Fritti",
			name: "Brooklyn Calamari Fritti",
			category: "Starters",
			quantity: 2,
			price: 18,
			status: "sent",
			stationStatuses: { kitchen: "preparing" },
			destination: "kitchen",
			orderedByPipName: "Maya R.",
			seatName: "Maya R.",
			ticketId: "demo_screenshot_kds_window_fire",
		},
		{
			id: "demo_basket_window_martini",
			menuItemId: "dev_item_harbor_martini",
			dishName: "Williamsburg Dirty Martini",
			name: "Williamsburg Dirty Martini",
			category: "Cocktails",
			quantity: 4,
			price: 17,
			status: "sent",
			stationStatuses: { bar: "new" },
			destination: "bar",
			orderedByPipName: "Table",
			seatName: "Table",
			ticketId: "demo_screenshot_kds_bar_new",
		},
	],
	demo_screenshot_party_booth_6: [
		{
			id: "demo_basket_booth_lobster",
			menuItemId: "dev_item_harbor_lobster_roll",
			dishName: "Warm Butter Lobster Roll",
			name: "Warm Butter Lobster Roll",
			category: "Mains",
			quantity: 2,
			price: 32,
			status: "sent",
			stationStatuses: { kitchen: "ready" },
			destination: "kitchen",
			orderedByPipName: "Priya S.",
			seatName: "Priya S.",
			ticketId: "demo_screenshot_kds_ready",
		},
	],
	demo_screenshot_party_bar_9: [
		{
			id: "demo_basket_bar_spritz",
			menuItemId: "dev_item_harbor_spritz",
			dishName: "Harbor Spritz",
			name: "Harbor Spritz",
			category: "Cocktails",
			quantity: 3,
			price: 15,
			status: "sent",
			stationStatuses: { bar: "preparing" },
			destination: "bar",
			orderedByPipName: "Daniel K.",
			seatName: "Daniel K.",
			ticketId: "demo_screenshot_kds_bar_working",
		},
	],
	demo_screenshot_party_table_12: [
		{
			id: "demo_basket_table12_oysters",
			menuItemId: "dev_item_harbor_oysters",
			dishName: "East Coast Oyster Flight",
			name: "East Coast Oyster Flight",
			category: "Starters",
			quantity: 2,
			price: 24,
			status: "sent",
			stationStatuses: { kitchen: "new" },
			destination: "kitchen",
			orderedByPipName: "Walk-in Party",
			seatName: "Table",
			ticketId: "demo_screenshot_kds_table12_new",
		},
	],
};

const kitchenOrders = [
	{
		id: "demo_screenshot_kds_window_fire",
		partyId: "demo_screenshot_party_window_2",
		table: { id: "window_2", name: "Window 2" },
		server: { id: "demo_server_nadia", name: "Nadia Rivera" },
		items: [basketItemsByParty.demo_screenshot_party_window_2[0]],
		stationStatuses: { kitchen: "preparing" },
		pacingStatus: "fired",
		overallStatus: "active",
		createdAt: minutesAgo(14),
	},
	{
		id: "demo_screenshot_kds_bar_new",
		partyId: "demo_screenshot_party_window_2",
		table: { id: "window_2", name: "Window 2" },
		server: { id: "demo_server_nadia", name: "Nadia Rivera" },
		items: [basketItemsByParty.demo_screenshot_party_window_2[1]],
		stationStatuses: { bar: "new" },
		pacingStatus: "fired",
		overallStatus: "active",
		createdAt: minutesAgo(4),
	},
	{
		id: "demo_screenshot_kds_ready",
		partyId: "demo_screenshot_party_booth_6",
		table: { id: "booth_6", name: "Booth 6" },
		server: { id: "demo_server_miles", name: "Miles Carter" },
		items: [basketItemsByParty.demo_screenshot_party_booth_6[0]],
		stationStatuses: { kitchen: "ready" },
		pacingStatus: "fired",
		overallStatus: "active",
		createdAt: minutesAgo(20),
	},
	{
		id: "demo_screenshot_kds_bar_working",
		partyId: "demo_screenshot_party_bar_9",
		table: { id: "bar_9", name: "Bar 9" },
		server: { id: "demo_bar_sam", name: "Sam Ellis" },
		items: [basketItemsByParty.demo_screenshot_party_bar_9[0]],
		stationStatuses: { bar: "preparing" },
		pacingStatus: "fired",
		overallStatus: "active",
		createdAt: minutesAgo(9),
	},
	{
		id: "demo_screenshot_kds_table12_new",
		partyId: "demo_screenshot_party_table_12",
		table: { id: "table_12", name: "Table 12" },
		server: { id: "unassigned", name: "Unassigned" },
		items: [basketItemsByParty.demo_screenshot_party_table_12[0]],
		stationStatuses: { kitchen: "new" },
		pacingStatus: "fired",
		overallStatus: "active",
		createdAt: minutesAgo(2),
	},
	{
		id: "demo_screenshot_kds_paced_entrees",
		partyId: "demo_screenshot_party_window_2",
		table: { id: "window_2", name: "Window 2" },
		server: { id: "demo_server_nadia", name: "Nadia Rivera" },
		items: [
			{
				id: "demo_basket_window_lobster_hold",
				menuItemId: "dev_item_harbor_lobster_roll",
				dishName: "Warm Butter Lobster Roll",
				name: "Warm Butter Lobster Roll",
				category: "Mains",
				quantity: 2,
				price: 32,
				status: "sent",
				stationStatuses: { kitchen: "new" },
				destination: "kitchen",
				orderedByPipName: "Maya R.",
				seatName: "Table",
				pacingStatus: "scheduled",
			},
			{
				id: "demo_basket_window_steak_hold",
				menuItemId: "dev_item_harbor_steak_frites",
				dishName: "Skirt Steak Frites",
				name: "Skirt Steak Frites",
				category: "Mains",
				quantity: 2,
				price: 34,
				status: "sent",
				stationStatuses: { kitchen: "new" },
				destination: "kitchen",
				orderedByPipName: "Jordan P.",
				seatName: "Table",
				pacingStatus: "scheduled",
			},
		],
		stationStatuses: { kitchen: "new" },
		pacingStatus: "scheduled",
		fireAt: minutesFromNow(8),
		overallStatus: "active",
		createdAt: minutesAgo(3),
	},
];

const reservations = [
	{
		id: "demo_screenshot_res_requested",
		customerName: "Evelyn Torres",
		customerId: "demo_customer_res_evelyn",
		customerEmail: "evelyn@example.com",
		partySize: 4,
		requestedDate: today,
		requestedTime: "19:00",
		status: "requested",
		occasion: "Opening-week dinner",
		seatingPreference: "Quiet corner if possible",
		allergyNotes: "Shellfish allergy in party",
		guestNotes: "First visit. Interested in seafood and cocktails.",
		customerReliabilityLabel: "Reliable Guest",
		reliabilitySnapshot: { completedReservations: 7, noShows: 0, lateCancellations: 1 },
		createdAt: minutesAgo(18),
	},
	{
		id: "demo_screenshot_res_confirmed",
		customerName: "Marcus Lee",
		customerId: "demo_customer_res_marcus",
		customerEmail: "marcus@example.com",
		partySize: 2,
		requestedDate: today,
		requestedTime: "20:15",
		status: "confirmed",
		occasion: "Date night",
		seatingPreference: "Window",
		customerReliabilityLabel: "VIP Regular",
		reliabilitySnapshot: { completedReservations: 15, noShows: 0, lateCancellations: 0 },
		confirmedAt: minutesAgo(45),
		createdAt: minutesAgo(80),
	},
	{
		id: "demo_screenshot_res_arrived",
		customerName: "Sofia Nguyen",
		customerId: "demo_customer_res_sofia",
		customerEmail: "sofia@example.com",
		partySize: 5,
		requestedDate: today,
		requestedTime: "18:30",
		status: "arrival_requested",
		occasion: "Birthday",
		guestNotes: "Guest is here and waiting near host stand.",
		customerReliabilityLabel: "New Guest",
		reliabilitySnapshot: { completedReservations: 0, noShows: 0, lateCancellations: 0 },
		arrivalRequestedAt: minutesAgo(6),
		createdAt: minutesAgo(120),
	},
	{
		id: "demo_screenshot_res_seated",
		customerName: "Amara Johnson",
		customerId: "demo_customer_005",
		customerEmail: "amara@example.com",
		partySize: 5,
		requestedDate: today,
		requestedTime: "17:45",
		status: "seated",
		partyId: "demo_screenshot_party_patio_4",
		table: { id: "patio_4", name: "Patio 4" },
		server: { id: "demo_server_amina", name: "Amina Brooks" },
		customerReliabilityLabel: "Reliable Guest",
		reliabilitySnapshot: { completedReservations: 5, noShows: 0, lateCancellations: 0 },
		seatedAt: minutesAgo(92),
		createdAt: daysAgo(1),
	},
];

const waitlistEntries = [
	{
		id: "demo_screenshot_waitlist_1",
		customerName: "Chris Walker",
		customerId: "demo_customer_wait_chris",
		partySize: 3,
		requestedDate: today,
		preferredTimeWindow: "7:00 PM - 8:00 PM",
		status: "waiting",
		createdAt: minutesAgo(34),
	},
	{
		id: "demo_screenshot_waitlist_2",
		customerName: "Lena Chen",
		customerId: "demo_customer_wait_lena",
		partySize: 2,
		requestedDate: today,
		preferredTimeWindow: "7:00 PM - 8:00 PM",
		status: "offer_pending",
		offeredTime: "19:45",
		offerExpiresAt: minutesFromNow(7),
		createdAt: minutesAgo(29),
	},
	{
		id: "demo_screenshot_waitlist_3",
		customerName: "Jordan Patel",
		customerId: "demo_customer_wait_jordan",
		partySize: 6,
		requestedDate: today,
		preferredTimeWindow: "8:00 PM - 9:00 PM",
		status: "waiting",
		createdAt: minutesAgo(21),
	},
];

const reportOrders = [
	{
		id: "demo_screenshot_order_1001",
		readableOrderId: "HBR-1001",
		table: { id: "window_2", name: "Window 2" },
		server: { id: "demo_server_nadia", name: "Nadia Rivera" },
		customerName: "Maya R.",
		subtotal: 15600,
		originalSubtotal: 17600,
		discountTotal: 2000,
		taxAmount: 1385,
		gratuityAmount: 3120,
		platformFee: 599,
		processorFee: 512,
		restaurantGrossAmount: 20505,
		restaurantTransferAmount: 19394,
		totalPrice: 21104,
		paymentMethod: "card",
		paymentProcessor: "stripe",
		orderMode: "dineIn",
		fulfillmentType: "table",
		turnaroundTimeMinutes: 74,
		fulfilledAt: minutesAgo(22),
		items: [
			{ name: "Brooklyn Calamari Fritti", dishName: "Brooklyn Calamari Fritti", category: "Starters", quantity: 2, price: 18 },
			{ name: "Warm Butter Lobster Roll", dishName: "Warm Butter Lobster Roll", category: "Mains", quantity: 2, price: 32 },
			{ name: "Williamsburg Dirty Martini", dishName: "Williamsburg Dirty Martini", category: "Cocktails", quantity: 4, price: 17 },
		],
	},
	{
		id: "demo_screenshot_order_1002",
		readableOrderId: "HBR-1002",
		table: { id: "booth_6", name: "Booth 6" },
		server: { id: "demo_server_miles", name: "Miles Carter" },
		customerName: "Priya S.",
		subtotal: 9800,
		originalSubtotal: 9800,
		discountTotal: 0,
		taxAmount: 870,
		gratuityAmount: 1960,
		platformFee: 399,
		processorFee: 341,
		restaurantGrossAmount: 12630,
		restaurantTransferAmount: 11890,
		totalPrice: 13029,
		paymentMethod: "stripe_terminal",
		paymentProcessor: "stripe_terminal",
		orderMode: "dineIn",
		fulfillmentType: "table",
		turnaroundTimeMinutes: 58,
		fulfilledAt: minutesAgo(55),
		items: [
			{ name: "East Coast Oyster Flight", dishName: "East Coast Oyster Flight", category: "Starters", quantity: 2, price: 24 },
			{ name: "Harbor Spritz", dishName: "Harbor Spritz", category: "Cocktails", quantity: 2, price: 15 },
			{ name: "Sea Salt Fries", dishName: "Sea Salt Fries", category: "Sides", quantity: 2, price: 10 },
		],
	},
	{
		id: "demo_screenshot_order_1003",
		readableOrderId: "HBR-1003",
		table: { id: "bar_9", name: "Bar 9" },
		server: { id: "demo_bar_sam", name: "Sam Ellis" },
		customerName: "Daniel K.",
		subtotal: 7200,
		originalSubtotal: 7200,
		discountTotal: 0,
		taxAmount: 639,
		gratuityAmount: 1440,
		platformFee: 299,
		processorFee: 252,
		restaurantGrossAmount: 9279,
		restaurantTransferAmount: 8728,
		totalPrice: 9578,
		paymentMethod: "card",
		paymentProcessor: "stripe",
		orderMode: "dineIn",
		fulfillmentType: "table",
		turnaroundTimeMinutes: 41,
		fulfilledAt: minutesAgo(87),
		items: [
			{ name: "Williamsburg Dirty Martini", dishName: "Williamsburg Dirty Martini", category: "Cocktails", quantity: 2, price: 17 },
			{ name: "Harbor Spritz", dishName: "Harbor Spritz", category: "Cocktails", quantity: 2, price: 15 },
			{ name: "Brooklyn Calamari Fritti", dishName: "Brooklyn Calamari Fritti", category: "Starters", quantity: 1, price: 18 },
		],
	},
	{
		id: "demo_screenshot_order_1004",
		readableOrderId: "HBR-1004",
		table: { id: "patio_4", name: "Patio 4" },
		server: { id: "demo_server_amina", name: "Amina Brooks" },
		customerName: "Amara J.",
		subtotal: 21400,
		originalSubtotal: 22900,
		discountTotal: 1500,
		taxAmount: 1900,
		gratuityAmount: 4280,
		platformFee: 699,
		processorFee: 710,
		restaurantGrossAmount: 27580,
		restaurantTransferAmount: 26171,
		totalPrice: 28279,
		paymentMethod: "card",
		paymentProcessor: "stripe",
		orderMode: "dineIn",
		fulfillmentType: "reservation_party",
		turnaroundTimeMinutes: 82,
		fulfilledAt: minutesAgo(9),
		items: [
			{ name: "Chilled Seafood Tower", dishName: "Chilled Seafood Tower", category: "Daily Special", quantity: 1, price: 68 },
			{ name: "Cedar Plank Salmon", dishName: "Cedar Plank Salmon", category: "Mains", quantity: 2, price: 29 },
			{ name: "Skirt Steak Frites", dishName: "Skirt Steak Frites", category: "Mains", quantity: 2, price: 34 },
			{ name: "Dark Chocolate Torte", dishName: "Dark Chocolate Torte", category: "Dessert", quantity: 2, price: 13 },
		],
	},
];

const seededDocPaths = [
	...parties.map((party) => `parties/${party.id}`),
	...Object.keys(basketItemsByParty).map((partyId) => `shared_baskets/${partyId}`),
	...kitchenOrders.map((order) => `kitchen_orders/${order.id}`),
	...reservations.map((reservation) => `reservations/${reservation.id}`),
	...waitlistEntries.map((entry) => `reservationWaitlist/${entry.id}`),
	...reportOrders.map((order) => `orders/${order.id}`),
	`restaurants/${RESTAURANT_ID}/work_days/demo_screenshot_open_day`,
	...servers.map((server) => `restaurants/${RESTAURANT_ID}/employees/${server.id}`),
];

async function clearScreenshotData(token) {
	console.log("Clearing screenshot seed documents...");
	for (const path of seededDocPaths) {
		await deleteDoc(token, path);
	}
	for (const table of tableFixtures) {
		await setDoc(token, `restaurants/${RESTAURANT_ID}/tables/${table.id}`, {
			status: "available",
			currentPartyId: null,
			server: null,
			occupiedAt: null,
			checkedOutAt: null,
			updatedAt: now,
		});
	}
}

async function seedScreenshotData(token) {
	await clearScreenshotData(token);
	console.log("Seeding screenshot demo data...");

	await setDoc(token, `restaurants/${RESTAURANT_ID}/work_days/demo_screenshot_open_day`, {
		status: "OPEN",
		startTime: minutesAgo(180),
		isScreenshotSeed: true,
		createdAt: minutesAgo(180),
		updatedAt: now,
	});

	for (const server of servers) {
		await setDoc(token, `restaurants/${RESTAURANT_ID}/employees/${server.id}`, {
			id: server.id,
			name: server.name,
			firstName: server.firstName,
			lastName: server.lastName,
			role: "worker",
			jobTitle: server.jobTitle || "server",
			isActive: true,
			isScreenshotSeed: true,
			createdAt: now,
			updatedAt: now,
		});
	}

	for (const table of tableFixtures) {
		const party = parties.find((item) => item.id === table.partyId);
		await setDoc(token, `restaurants/${RESTAURANT_ID}/tables/${table.id}`, {
			id: table.id,
			name: table.name,
			tableNumber: table.id.replace(/\D+/g, "") || table.name,
			status: table.status,
			currentPartyId: table.partyId,
			server: party?.server || null,
			capacity: table.id === "table_12" ? 6 : 4,
			occupiedAt: party?.seatedAt || now,
			checkedOutAt: table.status === "checkedOut" ? minutesAgo(6) : null,
			isActive: true,
			isScreenshotSeed: true,
			updatedAt: now,
		});
	}

	for (const party of parties) {
		await setDoc(token, `parties/${party.id}`, {
			...party,
			restaurantId: RESTAURANT_ID,
			restaurantName: RESTAURANT_NAME,
			isScreenshotSeed: true,
			updatedAt: now,
		});
		const items = basketItemsByParty[party.id] || [];
		await setDoc(token, `shared_baskets/${party.id}`, {
			partyId: party.id,
			restaurantId: RESTAURANT_ID,
			items,
			status: party.status,
			subtotal: items.reduce(
				(total, item) => total + Number(item.price || 0) * Number(item.quantity || 1),
				0,
			),
			updatedAt: now,
			isScreenshotSeed: true,
		});
	}

	for (const order of kitchenOrders) {
		await setDoc(token, `kitchen_orders/${order.id}`, {
			...order,
			restaurantId: RESTAURANT_ID,
			restaurantName: RESTAURANT_NAME,
			fulfillmentType: "table",
			orderSource: "screenshot_seed",
			isScreenshotSeed: true,
			updatedAt: now,
		});
	}

	for (const reservation of reservations) {
		await setDoc(token, `reservations/${reservation.id}`, {
			...reservation,
			restaurantId: RESTAURANT_ID,
			restaurantName: RESTAURANT_NAME,
			source: "screenshot_seed",
			isScreenshotSeed: true,
			updatedAt: now,
		});
	}

	for (const entry of waitlistEntries) {
		await setDoc(token, `reservationWaitlist/${entry.id}`, {
			...entry,
			restaurantId: RESTAURANT_ID,
			restaurantName: RESTAURANT_NAME,
			source: "screenshot_seed",
			isScreenshotSeed: true,
			updatedAt: now,
		});
	}

	for (const order of reportOrders) {
		await setDoc(token, `orders/${order.id}`, {
			...order,
			restaurantId: RESTAURANT_ID,
			restaurantName: RESTAURANT_NAME,
			workDayId: "demo_screenshot_open_day",
			paymentStatus: "paid",
			orderStatus: "fulfilled",
			type: "order",
			isScreenshotSeed: true,
			createdAt: order.fulfilledAt,
			updatedAt: now,
		});
	}
}

async function main() {
	const token = await getAccessToken();
	if (shouldClear) {
		await clearScreenshotData(token);
		console.log("Screenshot seed data cleared.");
		return;
	}
	await seedScreenshotData(token);
	console.log("Screenshot seed complete for Harbor and Ember.");
	console.log("Seeded: reservations, waitlist, active tables, Chef Q, Bar Q, paid orders, and report data.");
	console.log("Clear later with: node scripts/seed-dev-screenshot-data.js --confirm-dev-screenshot-seed --clear");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
