const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

const FEATURE_KEYS = [
	"reservations",
	"reservationWaitlist",
	"hostCheckInRequests",
	"reviews",
	"rewards",
];

const SCERV_ADMIN_ROLES = ["admin", "godmode", "scerv_admin", "super_admin"];
const GODMODE_ROLES = ["godmode", "super_admin"];

const sanitizeString = (value, maxLength = 160) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, maxLength);

const normalizeAdminRole = (role) => {
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

const requireScervAdmin = (context, options = {}) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Authentication is required.",
		);
	}

	const token = context.auth.token || {};
	const role = String(token.role || "").toLowerCase();
	const allowedRoles = options.godmodeOnly ? GODMODE_ROLES : SCERV_ADMIN_ROLES;
	if (!allowedRoles.includes(role)) {
		throw new functions.https.HttpsError(
			"permission-denied",
			options.godmodeOnly
				? "Scerv godmode access is required."
				: "Scerv admin access is required.",
		);
	}

	return context.auth.uid;
};

const publicUserFields = (userRecord, adminProfile = null) => ({
	uid: userRecord.uid,
	email: userRecord.email || "",
	displayName: userRecord.displayName || "",
	disabled: Boolean(userRecord.disabled),
	role: normalizeAdminRole(userRecord.customClaims && userRecord.customClaims.role),
	emailVerified: Boolean(userRecord.emailVerified),
	createdAt: userRecord.metadata && userRecord.metadata.creationTime,
	lastSignInAt: userRecord.metadata && userRecord.metadata.lastSignInTime,
	profile: adminProfile || null,
});

const writeAdminAuditLog = (actorUid, action, payload) =>
	db.collection("scervAdminAuditLogs").add({
		action,
		actorUid,
		payload,
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
	});

const serializeValue = (value) => {
	if (!value) return value;

	if (value instanceof admin.firestore.Timestamp) {
		return value.toDate().toISOString();
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		return value.map(serializeValue);
	}

	if (typeof value === "object") {
		return Object.keys(value).reduce((acc, key) => {
			acc[key] = serializeValue(value[key]);
			return acc;
		}, {});
	}

	return value;
};

const serializeDoc = (doc) => ({
	id: doc.id,
	...serializeValue(doc.data() || {}),
});

const compactRestaurant = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		restaurantName: data.restaurantName || data.name || "",
		restaurantNumber: data.restaurantNumber || "",
		city: data.city || "",
		state: data.state || "",
		email: data.email || "",
		phoneNumber: data.phoneNumber || "",
		isActive: data.isActive !== false,
		featureEntitlements: data.featureEntitlements || {},
	};
};

const compactOrder = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		readableOrderId: data.readableOrderId || "",
		restaurantId: data.restaurantId || "",
		restaurantName: data.restaurantName || "",
		customerId: data.customerId || data.userId || "",
		customerName: data.customerName || "",
		customerEmail: data.customerEmail || "",
		paymentStatus: data.paymentStatus || "",
		orderStatus: data.orderStatus || "",
		totalPrice: data.totalPrice || 0,
		subtotal: data.subtotal || 0,
		taxAmount: data.taxAmount || data.tax || 0,
		gratuityAmount: data.gratuityAmount || data.gratuity || 0,
		fulfilledAt: serializeValue(data.fulfilledAt || data.timestamp || null),
		createdAt: serializeValue(data.createdAt || data.timestamp || null),
	};
};

const compactReservation = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		restaurantId: data.restaurantId || "",
		restaurantName: data.restaurantName || "",
		customerId: data.customerId || "",
		customerName: data.customerName || "",
		customerEmail: data.customerEmail || "",
		status: data.status || "",
		partySize: data.partySize || data.guestCount || 0,
		reservationDate: serializeValue(data.reservationDate || data.date || null),
		reservationTime: data.reservationTime || data.time || "",
		createdAt: serializeValue(data.createdAt || null),
	};
};

const normalizePriceCents = (price) => {
	const numericPrice = Number(price);
	if (!Number.isFinite(numericPrice) || numericPrice < 0) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Menu item price must be a positive number.",
		);
	}

	return Math.round(numericPrice * 100) / 100;
};

const getMenuItemPayload = (data) => ({
	name: sanitizeString(data && data.name, 120),
	description: sanitizeString(data && data.description, 800),
	price: normalizePriceCents(data && data.price),
	category: sanitizeString(data && data.category, 120),
	imageUri: sanitizeString(data && data.imageUri, 1000),
	isActive: Boolean(data && data.isActive),
	isDailySpecial: Boolean(data && data.isDailySpecial),
	isFeatured: Boolean(data && data.isFeatured),
});

exports.saveRestaurantFeatureEntitlements = functions.https.onCall(
	async (data, context) => {
		const uid = requireScervAdmin(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 120);
		const entitlements = (data && data.featureEntitlements) || {};

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const restaurantSnap = await restaurantRef.get();
		if (!restaurantSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found.");
		}

		const cleanEntitlements = {};
		FEATURE_KEYS.forEach((key) => {
			if (typeof entitlements[key] === "boolean") {
				cleanEntitlements[key] = entitlements[key];
			}
		});

		await restaurantRef.set(
			{
				featureEntitlements: cleanEntitlements,
				entitlementsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
				entitlementsUpdatedBy: uid,
			},
			{ merge: true },
		);

		return {
			success: true,
			restaurantId,
			featureEntitlements: cleanEntitlements,
		};
	},
);

exports.getScervAdminDashboardStats = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context);

		const [restaurantsSnapshot, customersSnapshot, ordersSnapshot] =
			await Promise.all([
				db.collection("restaurants").count().get(),
				db.collection("customers").count().get(),
				db.collection("orders").count().get(),
			]);

		return {
			totalRestaurants: restaurantsSnapshot.data().count || 0,
			totalCustomers: customersSnapshot.data().count || 0,
			totalOrders: ordersSnapshot.data().count || 0,
		};
	},
);

exports.listScervCustomers = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);

	const pageSize = Math.min(
		Math.max(parseInt((data && data.pageSize) || 25, 10), 1),
		100,
	);
	const pageToken = sanitizeString(data && data.pageToken, 160);

	let customersQuery = db
		.collection("customers")
		.orderBy(admin.firestore.FieldPath.documentId())
		.limit(pageSize + 1);

	if (pageToken) {
		customersQuery = customersQuery.startAfter(pageToken);
	}

	const [snapshot, totalSnapshot] = await Promise.all([
		customersQuery.get(),
		db.collection("customers").count().get(),
	]);
	const docs = snapshot.docs.slice(0, pageSize);
	const hasMore = snapshot.docs.length > pageSize;
	const nextPageToken =
		hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

	const customers = docs.map((doc) => {
		const customer = doc.data() || {};
		const displayName =
			customer.displayName ||
			customer.name ||
			[customer.firstName, customer.lastName].filter(Boolean).join(" ");

		return {
			id: doc.id,
			firstName: customer.firstName || "",
			lastName: customer.lastName || "",
			displayName,
			email: customer.email || "",
			phoneNumber: customer.phoneNumber || "",
			createdAt: customer.createdAt || null,
			lastLoginAt: customer.lastLoginAt || null,
			role: customer.role || "",
		};
	});

	return {
		customers,
		hasMore,
		nextPageToken,
		totalCustomers: totalSnapshot.data().count || 0,
	};
});

exports.searchScervAdminRecords = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);

	const queryText = sanitizeString(data && data.query, 160);
	if (queryText.length < 2) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Search requires at least 2 characters.",
		);
	}

	const lowerQuery = queryText.toLowerCase();
	const titleCaseQuery =
		queryText.charAt(0).toUpperCase() + queryText.slice(1).toLowerCase();
	const searches = [];

	searches.push(
		db.collection("customers").doc(queryText).get(),
		db.collection("restaurants").doc(queryText).get(),
		db.collection("orders").doc(queryText).get(),
		db.collection("reservations").doc(queryText).get(),
		db.collection("customers").where("email", "==", lowerQuery).limit(8).get(),
		db.collection("restaurants")
			.orderBy("restaurantName")
			.startAt(titleCaseQuery)
			.endAt(`${titleCaseQuery}\uf8ff`)
			.limit(8)
			.get(),
		db.collection("orders")
			.where("readableOrderId", "==", queryText)
			.limit(8)
			.get(),
	);

	const [
		customerDoc,
		restaurantDoc,
		orderDoc,
		reservationDoc,
		customerEmailSnap,
		restaurantNameSnap,
		orderReadableSnap,
	] = await Promise.all(searches);

	const customers = new Map();
	const restaurants = new Map();
	const orders = new Map();
	const reservations = new Map();

	if (customerDoc.exists) customers.set(customerDoc.id, serializeDoc(customerDoc));
	customerEmailSnap.docs.forEach((doc) => {
		customers.set(doc.id, serializeDoc(doc));
	});

	if (restaurantDoc.exists) restaurants.set(restaurantDoc.id, compactRestaurant(restaurantDoc));
	restaurantNameSnap.docs.forEach((doc) => {
		restaurants.set(doc.id, compactRestaurant(doc));
	});

	if (orderDoc.exists) orders.set(orderDoc.id, compactOrder(orderDoc));
	orderReadableSnap.docs.forEach((doc) => {
		orders.set(doc.id, compactOrder(doc));
	});

	if (reservationDoc.exists) {
		reservations.set(reservationDoc.id, compactReservation(reservationDoc));
	}

	return {
		query: queryText,
		customers: Array.from(customers.values()).slice(0, 10),
		restaurants: Array.from(restaurants.values()).slice(0, 10),
		orders: Array.from(orders.values()).slice(0, 10),
		reservations: Array.from(reservations.values()).slice(0, 10),
	};
});

exports.getScervCustomerProfile = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context);

	const requestedCustomerId = sanitizeString(data && data.customerId, 128);
	const requestedEmail = sanitizeString(data && data.email, 254).toLowerCase();
	let customerId = requestedCustomerId;
	let customerSnap = customerId
		? await db.collection("customers").doc(customerId).get()
		: null;

	if ((!customerSnap || !customerSnap.exists) && requestedEmail) {
		const byEmailSnap = await db
			.collection("customers")
			.where("email", "==", requestedEmail)
			.limit(1)
			.get();
		if (!byEmailSnap.empty) {
			customerSnap = byEmailSnap.docs[0];
			customerId = customerSnap.id;
		}
	}

	if (!customerId || !customerSnap || !customerSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Customer not found.");
	}

	let authUser = null;
	try {
		authUser = publicUserFields(await admin.auth().getUser(customerId));
	} catch (error) {
		authUser = { uid: customerId, missingFromAuth: true };
	}

	const [
		ordersSnap,
		reservationsSnap,
		clubsSnap,
		promotionsSnap,
		ledgerSnap,
	] = await Promise.all([
		db.collection("orders").where("customerId", "==", customerId).limit(20).get(),
		db
			.collection("reservations")
			.where("customerId", "==", customerId)
			.limit(20)
			.get(),
		db
			.collection("customers")
			.doc(customerId)
			.collection("restaurantClubs")
			.limit(25)
			.get(),
		db
			.collection("customers")
			.doc(customerId)
			.collection("promotions")
			.limit(25)
			.get(),
		db
			.collection("customers")
			.doc(customerId)
			.collection("scervRewardsLedger")
			.limit(25)
			.get(),
	]);

	return {
		customer: serializeDoc(customerSnap),
		authUser,
		orders: ordersSnap.docs.map(compactOrder),
		reservations: reservationsSnap.docs.map(compactReservation),
		restaurantClubs: clubsSnap.docs.map(serializeDoc),
		promotions: promotionsSnap.docs.map(serializeDoc),
		rewardsLedger: ledgerSnap.docs.map(serializeDoc),
	};
});

exports.getScervRestaurantProfile = functions.https.onCall(
	async (data, context) => {
		requireScervAdmin(context);

		const restaurantId = sanitizeString(data && data.restaurantId, 128);
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const restaurantSnap = await db.collection("restaurants").doc(restaurantId).get();
		if (!restaurantSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found.");
		}

		const [menuSnap, ordersSnap, reservationsSnap, checkInsSnap] =
			await Promise.all([
				db
					.collection("menuItems")
					.where("restaurantId", "==", restaurantId)
					.limit(150)
					.get(),
				db
					.collection("orders")
					.where("restaurantId", "==", restaurantId)
					.limit(20)
					.get(),
				db
					.collection("reservations")
					.where("restaurantId", "==", restaurantId)
					.limit(20)
					.get(),
				db
					.collection("checkIns")
					.where("restaurantId", "==", restaurantId)
					.limit(20)
					.get(),
			]);

		const menuItems = menuSnap.docs
			.map(serializeDoc)
			.sort((a, b) =>
				`${a.category || ""} ${a.name || ""}`.localeCompare(
					`${b.category || ""} ${b.name || ""}`,
				),
			);

		return {
			restaurant: serializeDoc(restaurantSnap),
			menuItems,
			orders: ordersSnap.docs.map(compactOrder),
			reservations: reservationsSnap.docs.map(compactReservation),
			checkIns: checkInsSnap.docs.map(serializeDoc),
		};
	},
);

exports.updateScervRestaurantProfile = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context);
		const restaurantId = sanitizeString(data && data.restaurantId, 128);
		const updates = (data && data.updates) || {};

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const allowedFields = [
			"restaurantName",
			"restaurantNumber",
			"address",
			"city",
			"state",
			"zipcode",
			"phoneNumber",
			"email",
			"firstName",
			"lastName",
			"cuisineType",
			"description",
			"taxRate",
			"website",
			"imageUri",
			"geoLat",
			"geoLong",
			"isActive",
			"backOfficePin",
		];
		const cleanUpdates = {};

		allowedFields.forEach((field) => {
			if (updates[field] === undefined) return;
			if (field === "isActive") {
				cleanUpdates[field] = Boolean(updates[field]);
			} else if (["restaurantNumber", "taxRate", "geoLat", "geoLong"].includes(field)) {
				const numericValue = Number(updates[field]);
				cleanUpdates[field] = Number.isFinite(numericValue) ? numericValue : 0;
			} else {
				cleanUpdates[field] = sanitizeString(updates[field], 1000);
			}
		});

		if (Object.keys(cleanUpdates).length === 0) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"No valid restaurant fields were provided.",
			);
		}

		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const restaurantSnap = await restaurantRef.get();
		if (!restaurantSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found.");
		}

		await restaurantRef.set(
			{
				...cleanUpdates,
				adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
				adminUpdatedBy: actorUid,
			},
			{ merge: true },
		);

		await writeAdminAuditLog(actorUid, "update_restaurant_profile", {
			restaurantId,
			fields: Object.keys(cleanUpdates),
		});

		return { success: true, restaurantId };
	},
);

exports.saveScervMenuItem = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 128);
	const itemId = sanitizeString(data && data.itemId, 128);
	const item = getMenuItemPayload(data && data.item);

	if (!restaurantId || !item.name || !item.category) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant, item name, and category are required.",
		);
	}

	const restaurantSnap = await db.collection("restaurants").doc(restaurantId).get();
	if (!restaurantSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}

	const itemRef = itemId
		? db.collection("menuItems").doc(itemId)
		: db.collection("menuItems").doc();
	const existingSnap = itemId ? await itemRef.get() : null;
	if (
		existingSnap &&
		existingSnap.exists &&
		existingSnap.data().restaurantId !== restaurantId
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Menu item does not belong to this restaurant.",
		);
	}

	await itemRef.set(
		{
			...item,
			restaurantId,
			adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
			adminUpdatedBy: actorUid,
			...(itemId
				? {}
				: {
						createdAt: admin.firestore.FieldValue.serverTimestamp(),
						createdBy: actorUid,
					}),
		},
		{ merge: true },
	);

	await writeAdminAuditLog(actorUid, itemId ? "update_menu_item" : "create_menu_item", {
		restaurantId,
		itemId: itemRef.id,
		itemName: item.name,
	});

	const savedSnap = await itemRef.get();
	return { success: true, menuItem: serializeDoc(savedSnap) };
});

exports.archiveScervMenuItem = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context);
	const restaurantId = sanitizeString(data && data.restaurantId, 128);
	const itemId = sanitizeString(data && data.itemId, 128);

	if (!restaurantId || !itemId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID and menu item ID are required.",
		);
	}

	const itemRef = db.collection("menuItems").doc(itemId);
	const itemSnap = await itemRef.get();
	if (!itemSnap.exists) {
		throw new functions.https.HttpsError("not-found", "Menu item not found.");
	}

	if (itemSnap.data().restaurantId !== restaurantId) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Menu item does not belong to this restaurant.",
		);
	}

	await itemRef.set(
		{
			isActive: false,
			isArchived: true,
			archivedAt: admin.firestore.FieldValue.serverTimestamp(),
			archivedBy: actorUid,
			adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
			adminUpdatedBy: actorUid,
		},
		{ merge: true },
	);

	await writeAdminAuditLog(actorUid, "archive_menu_item", {
		restaurantId,
		itemId,
		itemName: itemSnap.data().name || "",
	});

	return { success: true, itemId };
});

exports.listScervAdminUsers = functions.https.onCall(async (data, context) => {
	requireScervAdmin(context, { godmodeOnly: true });

	const userPage = await admin.auth().listUsers(1000);
	const adminUsers = userPage.users.filter((userRecord) => {
		const role = String(
			(userRecord.customClaims && userRecord.customClaims.role) || "",
		).toLowerCase();
		return SCERV_ADMIN_ROLES.includes(role);
	});

	const profileRefs = adminUsers.map((userRecord) =>
		db.collection("scervAdminUsers").doc(userRecord.uid),
	);
	const profileSnapshots =
		profileRefs.length > 0 ? await db.getAll(...profileRefs) : [];
	const profileByUid = new Map(
		profileSnapshots
			.filter((snapshot) => snapshot.exists)
			.map((snapshot) => [snapshot.id, snapshot.data()]),
	);

	return {
		users: adminUsers.map((userRecord) =>
			publicUserFields(userRecord, profileByUid.get(userRecord.uid)),
		),
	};
});

exports.createScervAdminUser = functions.https.onCall(async (data, context) => {
	const actorUid = requireScervAdmin(context, { godmodeOnly: true });
	const email = sanitizeString(data && data.email, 254).toLowerCase();
	const displayName = sanitizeString(data && data.displayName, 120);
	const password = String((data && data.password) || "");
	const role = normalizeAdminRole((data && data.role) || "admin");

	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A valid email is required.",
		);
	}

	if (!["admin", "godmode"].includes(role)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Role must be admin or godmode.",
		);
	}

	if (password.length < 12) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Temporary password must be at least 12 characters.",
		);
	}

	let userRecord;
	try {
		userRecord = await admin.auth().getUserByEmail(email);
		await admin.auth().updateUser(userRecord.uid, {
			displayName: displayName || userRecord.displayName || undefined,
			disabled: false,
			password,
		});
		userRecord = await admin.auth().getUser(userRecord.uid);
	} catch (error) {
		if (error.code !== "auth/user-not-found") {
			throw error;
		}

		userRecord = await admin.auth().createUser({
			email,
			password,
			displayName: displayName || undefined,
			disabled: false,
		});
	}

	await admin.auth().setCustomUserClaims(userRecord.uid, { role });
	await db.collection("scervAdminUsers").doc(userRecord.uid).set(
		{
			email,
			displayName: displayName || userRecord.displayName || "",
			role,
			disabled: false,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedBy: actorUid,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			createdBy: actorUid,
		},
		{ merge: true },
	);

	await writeAdminAuditLog(actorUid, "create_scerv_admin_user", {
		targetUid: userRecord.uid,
		email,
		role,
	});

	return {
		success: true,
		user: publicUserFields(await admin.auth().getUser(userRecord.uid)),
	};
});

exports.updateScervAdminUserRole = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context, { godmodeOnly: true });
		const targetUid = sanitizeString(data && data.uid, 128);
		const role = normalizeAdminRole((data && data.role) || "admin");

		if (!targetUid || !["admin", "godmode"].includes(role)) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"User ID and a valid role are required.",
			);
		}

		await admin.auth().setCustomUserClaims(targetUid, { role });
		const userRecord = await admin.auth().getUser(targetUid);
		await db.collection("scervAdminUsers").doc(targetUid).set(
			{
				email: userRecord.email || "",
				displayName: userRecord.displayName || "",
				role,
				disabled: Boolean(userRecord.disabled),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedBy: actorUid,
			},
			{ merge: true },
		);

		await writeAdminAuditLog(actorUid, "update_scerv_admin_user_role", {
			targetUid,
			role,
		});

		return {
			success: true,
			user: publicUserFields(userRecord),
		};
	},
);

exports.setScervAdminUserDisabled = functions.https.onCall(
	async (data, context) => {
		const actorUid = requireScervAdmin(context, { godmodeOnly: true });
		const targetUid = sanitizeString(data && data.uid, 128);
		const disabled = Boolean(data && data.disabled);

		if (!targetUid) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"User ID is required.",
			);
		}

		if (targetUid === actorUid && disabled) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"You cannot disable your own godmode account.",
			);
		}

		const userRecord = await admin.auth().updateUser(targetUid, { disabled });
		await db.collection("scervAdminUsers").doc(targetUid).set(
			{
				disabled,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedBy: actorUid,
			},
			{ merge: true },
		);

		await writeAdminAuditLog(actorUid, "set_scerv_admin_user_disabled", {
			targetUid,
			disabled,
		});

		return {
			success: true,
			user: publicUserFields(userRecord),
		};
	},
);
