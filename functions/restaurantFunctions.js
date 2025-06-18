const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Starts a new work day for a restaurant.
 * Checks to ensure no other work day is currently open.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.restaurantId - The ID of the restaurant.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, workDayId?: string, error?: string}>}
 */
exports.startWorkDay = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized."
		);
	}
	const { restaurantId } = data;
	if (!restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID is required."
		);
	}

	const workDaysRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("work_days");

	try {
		// First, check for an already open work day (as before)
		const openDaysQuery = workDaysRef.where("status", "==", "OPEN").limit(1);
		const openDaysSnapshot = await openDaysQuery.get();
		if (!openDaysSnapshot.empty) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"A work day is already open."
			);
		}

		// --- NEW: CLEANUP ROUTINE ---
		console.log(
			`startWorkDay: Running cleanup routine for restaurant ${restaurantId}...`
		);
		const batch = db.batch();

		// 1. Reset all tables that are not 'available'.
		const tablesToResetQuery = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.where("status", "!=", "available");
		const tablesSnapshot = await tablesToResetQuery.get();
		tablesSnapshot.docs.forEach((doc) => {
			console.log(
				`... Resetting table ${doc.id} from status '${
					doc.data().status
				}' to 'available'.`
			);
			batch.update(doc.ref, {
				status: "available",
				currentCheckInId: null,
				currentCustomerId: null,
				seatedAt: null,
			});
		});

		// 2. Clear any lingering orders from the Chef's Q.
		// We'll mark them as 'stale' instead of deleting to preserve data.
		const kitchenOrdersRef = db.collection("kitchen_orders");
		const activeOrdersQuery = kitchenOrdersRef
			.where("restaurantId", "==", restaurantId)
			.where("status", "in", ["new", "preparing", "ready"]);
		const activeOrdersSnapshot = await activeOrdersQuery.get();
		activeOrdersSnapshot.docs.forEach((doc) => {
			console.log(
				`... Archiving stale kitchen order ${doc.id} from previous day.`
			);
			batch.update(doc.ref, { status: "archived_stale" });
		});

		await batch.commit(); // Commit all cleanup changes
		console.log(
			`startWorkDay: Cleanup complete. Found and reset ${tablesSnapshot.size} tables and archived ${activeOrdersSnapshot.size} kitchen orders.`
		);
		// --- END CLEANUP ROUTINE ---

		// Now, create the new work day document
		const newWorkDayRef = workDaysRef.doc();
		await newWorkDayRef.set({
			status: "OPEN",
			startTime: admin.firestore.FieldValue.serverTimestamp(),
			endTime: null,
			managerWhoOpened: {
				uid: context.auth.uid,
				name: context.auth.token.name || "Manager",
			},
			managerWhoClosed: null,
			totalSales: 0,
			totalTips: 0,
		});

		console.log(
			`startWorkDay: Successfully started new work day ${newWorkDayRef.id} for restaurant ${restaurantId}.`
		);
		return { success: true, workDayId: newWorkDayRef.id };
	} catch (error) {
		console.error(
			`Error starting work day for restaurant ${restaurantId}:`,
			error
		);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not start the work day.",
			error.message
		);
	}
});

/**
 * Ends the current open work day for a restaurant.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.restaurantId - The ID of the restaurant.
 * @param {string} data.workDayId - The ID of the work day document to close.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.endWorkDay = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized."
		);
	}
	const { restaurantId, workDayId } = data;
	if (!restaurantId || !workDayId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant and Work Day IDs are required."
		);
	}

	const workDayRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("work_days")
		.doc(workDayId);
	const tablesRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("tables");

	try {
		// --- NEW VALIDATION STEP ---
		// Check for any currently occupied tables.
		const occupiedTablesQuery = tablesRef.where("status", "==", "OCCUPIED");
		const occupiedSnapshot = await occupiedTablesQuery.get();

		if (!occupiedSnapshot.empty) {
			console.warn(
				`endWorkDay attempt failed for restaurant ${restaurantId}: ${occupiedSnapshot.size} tables are still occupied.`
			);
			// Throw a specific error that the client can understand and display.
			throw new functions.https.HttpsError(
				"failed-precondition",
				`Cannot end the day while ${occupiedSnapshot.size} table(s) are still occupied. Please check out all tables first.`
			);
		}
		// --- END VALIDATION STEP ---

		const workDayDoc = await workDayRef.get();
		if (!workDayDoc.exists || workDayDoc.data().status !== "OPEN") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"There is no open work day to end."
			);
		}

		// Proceed with closing the day if validation passes
		await workDayRef.update({
			status: "CLOSED",
			endTime: admin.firestore.FieldValue.serverTimestamp(),
			managerWhoClosed: {
				uid: context.auth.uid,
				name: context.auth.token.name || "Unknown Manager",
			},
		});

		console.log(
			`endWorkDay: Successfully ended work day ${workDayId} for restaurant ${restaurantId}.`
		);
		return { success: true };
	} catch (error) {
		console.error(`Error ending work day ${workDayId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not end the work day.",
			error.message
		);
	}
});

/**
 * Adds a new table to a restaurant's subcollection.
 */
exports.addTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized."
		);
	}
	const { restaurantId, name, capacity } = data;
	if (!restaurantId || !name || !capacity) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID, table name, and capacity are required."
		);
	}

	try {
		const newTableRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc();
		await newTableRef.set({
			name: name,
			capacity: Number(capacity),
			status: "available", // Always available when created
			restaurantId: restaurantId,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});
		return { success: true, tableId: newTableRef.id };
	} catch (error) {
		console.error("Error adding table:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Could not add new table.",
			error.message
		);
	}
});

/**
 * Updates an existing table's name and/or capacity.
 */
exports.updateTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized."
		);
	}
	const { restaurantId, tableId, name, capacity } = data;
	if (!restaurantId || !tableId || !name || !capacity) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID, table ID, name, and capacity are required."
		);
	}

	try {
		const tableRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc(tableId);
		await tableRef.update({
			name: name,
			capacity: Number(capacity),
		});
		return { success: true };
	} catch (error) {
		console.error("Error updating table:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Could not update table.",
			error.message
		);
	}
});

/**
 * Deletes a table. Fails if the table is currently occupied.
 */
exports.deleteTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized."
		);
	}
	const { restaurantId, tableId } = data;
	if (!restaurantId || !tableId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID and Table ID are required."
		);
	}

	try {
		const tableRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc(tableId);
		const tableDoc = await tableRef.get();

		if (!tableDoc.exists) {
			return { success: true, message: "Table already deleted." };
		}
		if (tableDoc.data().status === "OCCUPIED") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Cannot delete a table that is currently occupied."
			);
		}

		await tableRef.delete();
		return { success: true };
	} catch (error) {
		console.error("Error deleting table:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not delete table.",
			error.message
		);
	}
});
