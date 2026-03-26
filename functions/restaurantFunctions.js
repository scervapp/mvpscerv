const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
const bcrypt = require("bcrypt");
const { Translate } = require("@google-cloud/translate").v2;

const translate = new Translate();

const generateTableId = (name) => {
	return name
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "_") // Replace spaces with underscores
		.replace(/[^a-z0-9_]/g, ""); // Remove special characters
};

/**
 * Starts a new work day for a restaurant.
 * - Cleans up tables and old kitchen orders from the previous day.
 * - Creates a new work_day document with status 'OPEN'.
 * - Sets an 'isOpen: true' flag on the main restaurant document for easy client-side access.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.restaurantId - The ID of the restaurant.
 */
exports.startWorkDay = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}
	const { restaurantId } = data;
	if (!restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID is required.",
		);
	}

	const restaurantRef = db.collection("restaurants").doc(restaurantId);
	const workDaysRef = restaurantRef.collection("work_days");

	try {
		// First, check for an already open work day
		const openDaysQuery = workDaysRef.where("status", "==", "OPEN").limit(1);
		const openDaysSnapshot = await openDaysQuery.get();
		if (!openDaysSnapshot.empty) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"A work day is already open.",
			);
		}

		// --- Cleanup Routine ---
		console.log(
			`startWorkDay: Running cleanup routine for restaurant ${restaurantId}...`,
		);
		const cleanupBatch = db.batch();

		// 1. Reset all tables that are not 'available'.
		const tablesToResetQuery = restaurantRef
			.collection("tables")
			.where("status", "!=", "available");
		const tablesSnapshot = await tablesToResetQuery.get();
		tablesSnapshot.docs.forEach((doc) => {
			console.log(
				`... Resetting table ${doc.id} from status '${
					doc.data().status
				}' to 'available'.`,
			);
			cleanupBatch.update(doc.ref, {
				status: "available",
				currentCheckInId: null,
				currentCustomerId: null,
				seatedAt: null,
			});
		});

		// 2. Archive any lingering orders from the Chef's Q.
		const kitchenOrdersRef = db.collection("kitchen_orders");
		const activeOrdersQuery = kitchenOrdersRef
			.where("restaurantId", "==", restaurantId)
			.where("status", "in", ["new", "preparing", "ready"]);
		const activeOrdersSnapshot = await activeOrdersQuery.get();
		activeOrdersSnapshot.docs.forEach((doc) => {
			console.log(
				`... Archiving stale kitchen order ${doc.id} from previous day.`,
			);
			cleanupBatch.update(doc.ref, { status: "archived_stale" });
		});

		await cleanupBatch.commit();
		console.log(
			`startWorkDay: Cleanup complete. Reset ${tablesSnapshot.size} tables and archived ${activeOrdersSnapshot.size} kitchen orders.`,
		);

		// --- Create New Work Day ---
		const newWorkDayRef = workDaysRef.doc(); // Auto-generate ID
		const finalBatch = db.batch();

		finalBatch.set(newWorkDayRef, {
			status: "OPEN",
			startTime: admin.firestore.FieldValue.serverTimestamp(),
			endTime: null,
			managerWhoOpened: {
				uid: context.auth.uid,
				name: context.auth.token.name || "Manager",
			},
			managerWhoClosed: null,
		});

		// Set the public-facing status on the main restaurant document.
		finalBatch.update(restaurantRef, { isOpen: true });

		await finalBatch.commit();

		console.log(
			`Successfully started new work day ${newWorkDayRef.id} and set restaurant to OPEN.`,
		);
		return { success: true, workDayId: newWorkDayRef.id };
	} catch (error) {
		console.error(
			`Error starting work day for restaurant ${restaurantId}:`,
			error,
		);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not start the work day.",
		);
	}
});

/**
 * Ends the current open work day for a restaurant.
 * - Validates that no tables are currently occupied or need cleaning.
 * - Updates the work_day document status to 'CLOSED'.
 * - Sets an 'isOpen: false' flag on the main restaurant document.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.restaurantId - The ID of the restaurant.
 * @param {string} data.workDayId - The ID of the work day document to close.
 */
exports.endWorkDay = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}

	const { restaurantId, workDayId } = data;
	if (!restaurantId || !workDayId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant and Work Day IDs are required.",
		);
	}

	const restaurantRef = db.collection("restaurants").doc(restaurantId);
	const workDayRef = restaurantRef.collection("work_days").doc(workDayId);
	const tablesRef = restaurantRef.collection("tables");
	const kitchenOrdersRef = db.collection("kitchen_orders"); // Reference to the Chef's Queue

	try {
		// --- Pre-close Validation Step ---
		const unresolvedTablesQuery = tablesRef
			.where("status", "!=", "available")
			.limit(1);
		const unresolvedSnapshot = await unresolvedTablesQuery.get();

		if (!unresolvedSnapshot.empty) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Cannot end the day while tables are still occupied. Please clear all tables first.",
			);
		}

		const workDayDoc = await workDayRef.get();
		if (!workDayDoc.exists || workDayDoc.data().status !== "OPEN") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"There is no open work day to end.",
			);
		}

		// --- Fetch Kitchen Orders to Clear ---
		const activeKitchenOrders = await kitchenOrdersRef
			.where("restaurantId", "==", restaurantId)
			.get();

		// --- Proceed with Closing ---
		const batch = db.batch();

		// 1. Close the work day document
		batch.update(workDayRef, {
			status: "CLOSED",
			endTime: admin.firestore.FieldValue.serverTimestamp(),
			managerWhoClosed: {
				uid: context.auth.uid,
				name: context.auth.token.name || "Manager",
			},
		});

		// 2. Set the public-facing status to CLOSED
		batch.update(restaurantRef, { isOpen: false });

		// 3. Clear the Chef's Queue (Kitchen Orders)
		activeKitchenOrders.forEach((doc) => {
			batch.delete(doc.ref);
		});

		await batch.commit();

		console.log(
			`Successfully ended work day ${workDayId} and cleared ${activeKitchenOrders.size} kitchen orders.`,
		);
		return { success: true, ordersCleared: activeKitchenOrders.size };
	} catch (error) {
		console.error(`Error ending work day ${workDayId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not end the work day.",
		);
	}
});

/**
 * A scheduled function that runs every day at 5:00 AM Eastern Time.
 * It finds any work days that were left open for more than 18 hours
 * and automatically closes them to prevent data contamination.
 */
exports.autoCloseStaleWorkDays = functions.pubsub
	.schedule("every day 05:00")
	.timeZone("America/New_York")
	.onRun(async (context) => {
		console.log("Running scheduled job: autoCloseStaleWorkDays...");

		const now = new Date();
		const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000);
		const staleTimestamp = admin.firestore.Timestamp.fromDate(eighteenHoursAgo);

		// Find all work_days subcollections that have a stale, open day
		const staleDaysQuery = db
			.collectionGroup("work_days")
			.where("status", "==", "OPEN")
			.where("startTime", "<=", staleTimestamp);

		const staleDaysSnapshot = await staleDaysQuery.get();

		if (staleDaysSnapshot.empty) {
			console.log("No stale work days found. Job finished.");
			return null;
		}

		console.log(`Found ${staleDaysSnapshot.size} stale work days to close.`);
		const batch = db.batch();

		staleDaysSnapshot.forEach((doc) => {
			console.log(`Closing stale work day: ${doc.id} at path: ${doc.ref.path}`);
			// Update the work_day status to 'CLOSED_AUTO'
			batch.update(doc.ref, {
				status: "CLOSED_AUTO",
				endTime: admin.firestore.FieldValue.serverTimestamp(),
				notes:
					"Automatically closed by system due to being open for over 18 hours.",
			});

			// Also update the parent restaurant's `isOpen` flag to false
			const restaurantRef = doc.ref.parent.parent; // Navigates up to the restaurant doc
			if (restaurantRef) {
				batch.update(restaurantRef, { isOpen: false });
			}
		});

		await batch.commit();
		console.log("Successfully closed all found stale work days.");
		return null;
	});

exports.addTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}
	const { restaurantId, name, capacity } = data;
	if (!restaurantId || !name || !capacity) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID, table name, and capacity are required.",
		);
	}

	try {
		// Generate the custom ID using the helper function
		const customTableId = generateTableId(name);

		const newTableRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc(customTableId); // Use the predictable ID

		// Check if a table with this exact formatted name already exists
		const tableDoc = await newTableRef.get();
		if (tableDoc.exists) {
			throw new functions.https.HttpsError(
				"already-exists",
				`A table named '${name}' (ID: ${customTableId}) already exists.`,
			);
		}

		await newTableRef.set({
			id: customTableId,
			name: name, // Keep the pretty "Table 1" for the UI display
			capacity: Number(capacity),
			status: "available",
			restaurantId: restaurantId,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		return { success: true, tableId: customTableId };
	} catch (error) {
		console.error("Error adding table:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not add new table.",
			error.message,
		);
	}
});

/**
 * Updates an existing table's name and/or capacity.
 * If the name changes, it moves the document to a new formatted ID.
 */
exports.updateTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}
	const { restaurantId, tableId, name, capacity } = data;
	if (!restaurantId || !tableId || !name || !capacity) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID, table ID, name, and capacity are required.",
		);
	}

	try {
		const tablesCollection = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables");

		const oldTableRef = tablesCollection.doc(tableId);

		// Generate the new ID based on the updated name
		const newTableId = generateTableId(name);

		// If the generated ID is the exact same, just update the capacity normally
		if (tableId === newTableId) {
			await oldTableRef.update({
				name: name,
				capacity: Number(capacity),
			});
			return { success: true, tableId: tableId };
		}

		// If the ID changed (they renamed the table), we have to migrate the document
		return await db.runTransaction(async (transaction) => {
			const oldTableDoc = await transaction.get(oldTableRef);
			if (!oldTableDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Original table not found.",
				);
			}

			const newTableRef = tablesCollection.doc(newTableId);
			const newTableDoc = await transaction.get(newTableRef);

			if (newTableDoc.exists) {
				throw new functions.https.HttpsError(
					"already-exists",
					`A table named '${name}' already exists.`,
				);
			}

			// Create the new document
			transaction.set(newTableRef, {
				...oldTableDoc.data(), // Copy all old data
				id: newTableId, // Update the ID
				name: name, // Update the Name
				capacity: Number(capacity), // Update the capacity
			});

			// Delete the old document
			transaction.delete(oldTableRef);

			return { success: true, tableId: newTableId };
		});
	} catch (error) {
		console.error("Error updating table:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not update table.",
			error.message,
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
			"User must be authorized.",
		);
	}
	const { restaurantId, tableId } = data;
	if (!restaurantId || !tableId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID and Table ID are required.",
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
				"Cannot delete a table that is currently occupied.",
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
			error.message,
		);
	}
});

/**
 * Applies a discount to a specific item within a shared_basket or individual basket.
 * It records the discount amount, reason, and the manager who applied it.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.partyId - The ID of the party (if it's a party order).
 * @param {string} data.checkInId - The ID of the check-in (for individual orders).
 * @param {string} data.itemId - The unique ID of the basket item instance to discount.
 * @param {number} data.discountAmount - The amount to discount, in dollars (e.g., 5.50 for $5.50).
 * @param {string} data.reason - The reason for the discount.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.discountOrderItem = functions.https.onCall(async (data, context) => {
	// Authentication & Authorization (TODO: Add role check for manager/supervisor)
	// Authentication & Authorization (TODO: Add role check for manager/supervisor)
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}
	const manager = {
		uid: context.auth.uid,
		name: context.auth.token.name || "Manager",
	};

	const { partyId, checkInId, itemId, discountAmount, reason } = data;

	if (!itemId || typeof discountAmount !== "number" || !reason) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Item ID, discount amount, and reason are required.",
		);
	}
	if (!partyId && !checkInId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Either a partyId or checkInId is required.",
		);
	}

	const isPartyOrder = !!partyId;

	try {
		if (isPartyOrder) {
			// --- HANDLE PARTY ORDER ---
			const docRef = db.collection("shared_baskets").doc(partyId);
			await db.runTransaction(async (transaction) => {
				const docSnap = await transaction.get(docRef);
				if (!docSnap.exists)
					throw new functions.https.HttpsError(
						"not-found",
						"Party basket not found.",
					);

				const data = docSnap.data();
				let items = data.items || [];
				let itemUpdated = false;

				const updatedItems = items.map((item) => {
					if (item.id === itemId) {
						itemUpdated = true;
						const originalPrice = parseFloat(item.price || 0);
						const finalDiscount = Math.min(originalPrice, discountAmount);
						const discountedPrice = originalPrice - finalDiscount;
						return {
							...item,
							discount: finalDiscount,
							discountedPrice,
							discountReason: reason,
							discountedBy: manager,
						};
					}
					return item;
				});

				if (!itemUpdated)
					throw new functions.https.HttpsError(
						"not-found",
						"The specific item to discount was not found in the party order.",
					);

				transaction.update(docRef, { items: updatedItems });
			});
		} else {
			// --- HANDLE INDIVIDUAL ORDER ---
			// For an individual order, the 'itemId' is the document ID in the 'baskets' collection.
			const docRef = db.collection("baskets").doc(itemId);
			const docSnap = await docRef.get();

			if (!docSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"The specific item to discount was not found.",
				);
			}

			const item = docSnap.data();
			const originalPrice = parseFloat(item.dish.price || 0);
			const finalDiscount = Math.min(originalPrice, discountAmount);
			const discountedPrice = originalPrice - finalDiscount;

			await docRef.update({
				discount: finalDiscount,
				discountedPrice: discountedPrice,
				discountReason: reason,
				discountedBy: manager,
			});
		}

		console.log(`Successfully applied discount to item ${itemId}.`);
		return { success: true };
	} catch (error) {
		console.error("Error applying discount:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not apply discount.",
			error.message,
		);
	}
});

/**
 * Sets or updates a manager's PIN. This should only be callable by an owner.
 * It takes a plain-text PIN, hashes it, and saves the hash to the employee's document.
 *
 * @param {object} data
 * @param {string} data.targetUserId The UID of the manager/employee to set the PIN for.
 * @param {string} data.pin The 4 to 6-digit PIN as a string.
 */
exports.setManagerPin = functions.https.onCall(async (data, context) => {
	// Authentication & Authorization: Ensure the person setting the PIN is an owner
	if (!context.auth || context.auth.token.role !== "owner") {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Only the owner can set manager PINs.",
		);
	}

	const { restaurantId, employeeId, pin } = data;
	if (!restaurantId || !employeeId || !pin || pin.length < 4) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A restaurant ID, target employee ID, and a valid PIN are required.",
		);
	}

	try {
		// --- THIS IS THE FIX ---
		// Directly reference the employee document by its ID instead of querying.
		const employeeDocRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(employeeId);

		const employeeDoc = await employeeDocRef.get();

		if (!employeeDoc.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"The manager/owner employee profile could not be found.",
			);
		}

		// Ensure we are only setting PINs for managers or owners.
		const employeeData = employeeDoc.data();
		if (employeeData.role !== "manager" && employeeData.role !== "owner") {
			throw new functions.https.HttpsError(
				"permission-denied",
				"PINs can only be set for managers or owners.",
			);
		}

		// Hash the PIN with a salt. 10 rounds is a standard, secure number.
		const salt = await bcrypt.genSalt(10);
		const pinHash = await bcrypt.hash(pin, salt);

		// Store the HASH, not the plain-text PIN
		await employeeDocRef.update({ pinHash: pinHash });

		console.log(`Successfully set PIN for employee ${employeeId}.`);
		return { success: true };
	} catch (error) {
		console.error("Error setting manager PIN:", error);
		// Avoid propagating internal error details unless it's an HttpsError
		if (error instanceof functions.https.HttpsError) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"An unexpected error occurred while setting the PIN.",
		);
	}
});

/**
 * Verifies an entered PIN against the stored hash for a given employee.
 * This is called by the client-side PIN pad.
 *
 * @param {object} data
 * @param {string} data.employeeId The ID of the employee whose PIN is being verified.
 * @param {string} data.pin The plain-text PIN entered by the user.
 */
/**
 * Verifies an entered PIN against the stored hash for a given employee.
 * This version correctly queries for the employee using their auth UID.
 *
 * @param {object} data
 * @param {string} data.restaurantId The ID of the restaurant where the employee works.
 * @param {string} data.employeeId The Authentication UID of the manager/owner.
 * @param {string} data.pin The plain-text PIN entered by the user.
 */
exports.verifyEmployeePin = functions.https.onCall(async (data, context) => {
	// This function can be called by any authenticated user on a restaurant device
	if (!context.auth) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Authentication is required.",
		);
	}

	const { restaurantId, employeeId, pin } = data;
	if (!restaurantId || !employeeId || !pin) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID, Employee ID, and PIN are required.",
		);
	}

	try {
		const employeeRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(employeeId);
		const employeeDoc = await employeeRef.get();

		if (!employeeDoc.exists) {
			console.error(
				`verifyEmployeePin: Employee doc not found at path: ${employeeRef.path}`,
			);
			return { success: false, message: "Invalid credentials." };
		}

		const employeeData = employeeDoc.data();
		if (!employeeData.pinHash) {
			console.error(
				`verifyEmployeePin: PIN hash does not exist for employee ${employeeId}.`,
			);
			return { success: false, message: "No PIN is set for this manager." };
		}

		const pinMatches = await bcrypt.compare(String(pin), employeeData.pinHash);

		if (pinMatches) {
			console.log(`PIN verification successful for employee ${employeeId}.`);
			return {
				success: true,
				employee: {
					id: employeeDoc.id, // The unique document ID
					name: `${employeeData.firstName} ${employeeData.lastName}`,
					role: employeeData.role,
				},
			};
		} else {
			console.log(`PIN verification FAILED for employee ${employeeId}.`);
			return { success: false, message: "Invalid credentials." };
		}
	} catch (error) {
		console.error("Error verifying PIN:", error);
		throw new functions.https.HttpsError(
			"internal",
			"An error occurred during PIN verification.",
		);
	}
});

/**
 * Creates a new employee document and a corresponding Firebase Auth user.
 * Allows the very first employee to be created by any authenticated user for that restaurant,
 * after which only managers/owners can add more.
 */
/**
 * Creates a new employee document in Firestore.
 * Now includes a 'jobTitle' for operational use.
 */
exports.addEmployee = functions.https.onCall(async (data, context) => {
	// 1. Authorization Check: Ensure the requester is an owner or manager.
	if (
		!context.auth ||
		!["owner", "manager"].includes(context.auth.token.role)
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You must be a manager or owner to add employees.",
		);
	}

	// 2. Validate Input
	const { restaurantId, firstName, lastName, role, pin, jobTitle } = data;
	if (!restaurantId || !firstName || !lastName || !role) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required employee details (name, role).",
		);
	}

	const employeesRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("employees");
	const snapshot = await employeesRef.limit(1).get();
	const isFirstEmployee = snapshot.empty;
	const roleToSet = isFirstEmployee ? "owner" : role;

	if (roleToSet === "owner" && !isFirstEmployee) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"The 'owner' role can only be assigned to the first employee.",
		);
	}

	try {
		let pinHash = null;
		if (pin && (roleToSet === "manager" || roleToSet === "owner")) {
			const salt = await bcrypt.genSalt(10);
			pinHash = await bcrypt.hash(pin, salt);
		}

		// 3. Create the employee document in the subcollection.
		const newEmployeeRef = employeesRef.doc(); // Auto-generate a unique ID
		await newEmployeeRef.set({
			firstName,
			lastName,
			role: roleToSet,
			jobTitle: roleToSet === "worker" ? jobTitle : null,
			pinHash, // Set the hash at creation time if provided
			restaurantId,
			isActive: true,
			// Assign auth uid only to the first employee (the owner)
			uid: isFirstEmployee ? context.auth.uid : null,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		console.log(
			`Successfully added employee ${newEmployeeRef.id} with role ${roleToSet}.`,
		);
		// Return the unique Firestore document ID
		return { success: true, employeeId: newEmployeeRef.id };
	} catch (error) {
		console.error("Error adding employee:", error);
		throw new functions.https.HttpsError(
			"internal",
			error.message || "Could not add new employee.",
		);
	}
});

/**
 * Deletes an employee's Firestore document and their Firebase Auth account.
 */
exports.deleteEmployee = functions.https.onCall(async (data, context) => {
	if (
		!context.auth ||
		!["owner", "manager"].includes(context.auth.token.role)
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You must be a manager or owner to delete employees.",
		);
	}
	const { restaurantId, employeeId } = data;
	if (!restaurantId || !employeeId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant and Employee IDs are required.",
		);
	}

	try {
		const employeeRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(employeeId);

		// Use a batch to delete both records atomically
		const batch = db.batch();
		batch.delete(employeeRef);

		// Also delete the Firebase Auth user
		await admin.auth().deleteUser(employeeId);

		await batch.commit();

		return { success: true };
	} catch (error) {
		console.error("Error deleting employee:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Could not delete employee.",
			error.message,
		);
	}
});

/**
 * Sets a custom claim for a user's role at a specific restaurant.
 * Only authenticated users with a 'manager' or 'owner' role can call this.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.targetUserId - The UID of the employee whose role is being set.
 * @param {string} data.role - The new role to assign (e.g., 'owner', 'manager', 'worker').
 * @param {string} data.restaurantId - The ID of the restaurant they belong to.
 */
exports.setEmployeeRole = functions.https.onCall(async (data, context) => {
	// Check if the user making the request is authorized
	if (
		!context.auth ||
		!["manager", "owner"].includes(context.auth.token.role)
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You must be a manager or owner to set employee roles.",
		);
	}

	const { targetUserId, role, restaurantId } = data;
	const validRoles = ["owner", "manager", "worker"];

	if (!validRoles.includes(role) || !targetUserId || !restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Invalid data provided.",
		);
	}

	try {
		console.log(
			`Setting custom claims for user ${targetUserId} to role: ${role}, restaurantId: ${restaurantId}`,
		);
		// --- THIS IS THE FIX ---
		// 1. Set the custom claims on the target user's Firebase Auth account.
		// This embeds the role and restaurantId directly into their auth token.
		await admin.auth().setCustomUserClaims(targetUserId, {
			role: role,
			restaurantId: restaurantId,
		});

		// 2. For consistency, also update their role in their Firestore document.
		const userDocRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(targetUserId);
		await userDocRef.update({
			role: role,
		});

		console.log(`Successfully set role '${role}' for user ${targetUserId}.`);
		return { success: true, message: `Role has been updated to ${role}.` };
	} catch (error) {
		console.error("Error setting custom claims:", error);
		throw new functions.https.HttpsError(
			"internal",
			"An error occurred while setting the user role.",
			error.message,
		);
	}
});

/**
 * Allows authorized staff to forcibly clear a table. This version now also
 * checks for and cleans up any associated party and shared_basket documents.
 *
 * @param {object} data The data object from the client.
 * @param {string} data.restaurantId The ID of the restaurant.
 * @param {string} data.tableId The ID of the table to be cleared.
 * @param {string} data.checkInId The ID of the check-in associated with the table.
 * @param {string} data.customerId The ID of the customer who was at the table.
 */
exports.forceClearTable = functions.https.onCall(async (data, context) => {
	// 1. Authentication & Validation (remains the same)
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be staff and authenticated.",
		);
	}
	const { restaurantId, tableId, checkInId, customerId } = data;
	if (!restaurantId || !tableId || !checkInId || !customerId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required IDs to clear the table.",
		);
	}

	// 2. Define Document References (remains the same)
	const tableRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("tables")
		.doc(tableId);
	const checkInRef = db.collection("checkIns").doc(checkInId);
	const customerRef = db.collection("customers").doc(customerId);

	try {
		// --- THIS IS THE FIX ---
		// We now perform all READ operations before queuing any WRITE operations.

		// First, read the basket items associated with the check-in. This happens outside the transaction.
		const basketItemsQuery = db
			.collection("baskets")
			.where("checkInId", "==", checkInId);
		const basketItemsSnapshot = await basketItemsQuery.get();

		// Now, start the transaction.
		await db.runTransaction(async (transaction) => {
			console.log(`Starting transaction to force clear table ${tableId}`);

			// READ 1: Get the check-in document to see if it's associated with a party.
			const checkInDoc = await transaction.get(checkInRef);
			const associatedPartyId = checkInDoc.exists
				? checkInDoc.data().associatedPartyId
				: null;

			// --- All reads are now complete. We can proceed with writes. ---

			// WRITE 1: Queue deletions for each found basket item.
			if (!basketItemsSnapshot.empty) {
				console.log(
					`Found ${basketItemsSnapshot.size} basket items to delete.`,
				);
				basketItemsSnapshot.forEach((doc) => {
					transaction.delete(doc.ref);
				});
			}

			// WRITE 2: Update the table's status to 'available'.
			transaction.update(tableRef, {
				status: "available",
				currentCheckInId: null,
				currentCustomerId: null,
				seatedAt: null,
			});

			// WRITE 3: Update the check-in document's status to 'COMPLETED'.
			if (checkInDoc.exists) {
				transaction.update(checkInRef, {
					status: "COMPLETED",
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});
			}

			// WRITE 4: Clear the active check-in from the customer's document.
			transaction.update(customerRef, { activeCheckIn: null });

			// WRITE 5: If a party was associated, delete the party and its basket.
			if (associatedPartyId) {
				console.log(
					`Found associated party ${associatedPartyId}. Queuing for deletion.`,
				);
				const partyRef = db.collection("parties").doc(associatedPartyId);
				const sharedBasketRef = db
					.collection("shared_baskets")
					.doc(associatedPartyId);
				transaction.delete(partyRef);
				transaction.delete(sharedBasketRef);
			}
		});
		// --- END OF FIX ---

		console.log(
			`✅ Successfully force-cleared table ${tableId} and all associated data.`,
		);
		return { success: true, message: "Table has been successfully cleared." };
	} catch (error) {
		console.error(`Error force-clearing table ${tableId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"An unexpected error occurred while clearing the table.",
		);
	}
});

// Listen for changes in the 'menuItems' collection
exports.autoTranslateMenuItem = functions.firestore
	.document("menuItems/{itemId}")
	.onWrite(async (change, context) => {
		const newData = change.after.exists ? change.after.data() : null;
		const oldData = change.before.exists ? change.before.data() : null;

		// 1. Exit if deleted
		if (!newData) return null;

		// 2. Exit if 'name' and 'description' haven't changed (Prevents Infinite Loops)
		if (
			oldData &&
			newData.name === oldData.name &&
			newData.description === oldData.description
		) {
			return null;
		}

		// 3. Exit if this update was triggered by our own translation (Prevents Infinite Loops)
		// We check if the update only added the '_en' or '_es' fields
		if (
			oldData &&
			(newData.name_en !== oldData.name_en ||
				newData.description_en !== oldData.description_en) &&
			newData.name === oldData.name
		) {
			return null;
		}

		const promises = [];
		const updates = {};

		try {
			// --- TRANSLATE NAME ---
			if (newData.name) {
				// Detect language of the name (e.g., 'es' for Spanish)
				let [detection] = await translate.detect(newData.name);
				let sourceLang = detection.language;

				// If it's Spanish, translate to English. If English, to Spanish.
				let targetLang = sourceLang === "es" ? "en" : "es";

				let [translatedName] = await translate.translate(
					newData.name,
					targetLang,
				);

				updates[`name_${targetLang}`] = translatedName;
				updates[`name_${sourceLang}`] = newData.name; // Keep the original tagged correctly
			}

			// --- TRANSLATE DESCRIPTION ---
			if (newData.description) {
				let [detection] = await translate.detect(newData.description);
				let sourceLang = detection.language;
				let targetLang = sourceLang === "es" ? "en" : "es";

				let [translatedDesc] = await translate.translate(
					newData.description,
					targetLang,
				);

				updates[`description_${targetLang}`] = translatedDesc;
				updates[`description_${sourceLang}`] = newData.description;
			}

			// 4. Write back to Firestore
			if (Object.keys(updates).length > 0) {
				return change.after.ref.update(updates);
			}
		} catch (error) {
			console.error("Translation Error:", error);
		}

		return null;
	});

exports.closePartyTable = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authorized.",
			);
		}

		const { partyId, paymentMethod = "manual", receiptEmail } = data;

		if (!partyId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID is required.",
			);
		}

		try {
			return await db.runTransaction(async (transaction) => {
				// ==========================================
				// 1. READS
				// ==========================================
				const partyRef = db.collection("parties").doc(partyId);
				const partyDoc = await transaction.get(partyRef);

				if (!partyDoc.exists) {
					throw new functions.https.HttpsError(
						"not-found",
						"Party document not found.",
					);
				}

				const partyData = partyDoc.data();
				if (partyData.status === "completed") {
					return { success: true, message: "Table is already closed." };
				}

				const basketRef = db.collection("shared_baskets").doc(partyId);
				const basketDoc = await transaction.get(basketRef);
				let basketData = { items: [] };
				if (basketDoc.exists) {
					basketData = basketDoc.data();
				}

				const kitchenOrdersQuery = db
					.collection("kitchen_orders")
					.where("partyId", "==", partyId);
				const kitchenOrdersSnap = await transaction.get(kitchenOrdersQuery);

				// ==========================================
				// 2. DATA PREP & CENTS CONVERSION
				// ==========================================
				const restaurantId = partyData.restaurantId;
				const tableId = partyData.table.id;
				const restaurantName = partyData.restaurantName || "Scerv Partner";

				const allItems = basketData.items || [];
				const officiallyOrderedItems = allItems.filter(
					(item) => item.status && item.status !== "new",
				);

				let subtotalCents = 0;
				let originalSubtotalCents = 0;

				officiallyOrderedItems.forEach((item) => {
					// Safe parser avoiding syntax errors
					const activePrice =
						item.discountedPrice !== undefined && item.discountedPrice !== null
							? item.discountedPrice
							: item.price || 0;

					const itemPrice = parseFloat(activePrice);
					const origPrice = parseFloat(item.price || 0);
					const quantity = parseInt(item.quantity || 1, 10);

					subtotalCents += Math.round(itemPrice * 100) * quantity;
					originalSubtotalCents += Math.round(origPrice * 100) * quantity;
				});

				const discountTotalCents = originalSubtotalCents - subtotalCents;

				let turnaroundTimeMinutes = 0;
				if (partyData.createdAt) {
					const openedAtMs = partyData.createdAt.toDate().getTime();
					turnaroundTimeMinutes = Math.round((Date.now() - openedAtMs) / 60000);
				}

				// ==========================================
				// 3. WRITES
				// ==========================================
				transaction.update(partyRef, {
					status: "completed",
					paymentStatus: "paid",
					paymentMethod: paymentMethod,
					closedAt: admin.firestore.FieldValue.serverTimestamp(),
					closedByUserId: context.auth.uid,
				});

				const usersToFree = [];
				if (partyData.hostUserId && partyData.hostUserId !== "walk_in_guest") {
					usersToFree.push(partyData.hostUserId);
				}
				if (partyData.guestPips && Array.isArray(partyData.guestPips)) {
					partyData.guestPips.forEach((pip) => {
						if (
							pip.userId &&
							pip.userId !== "walk_in_guest" &&
							!usersToFree.includes(pip.userId)
						) {
							usersToFree.push(pip.userId);
						}
					});
				}

				usersToFree.forEach((uid) => {
					const customerRef = db.collection("customers").doc(uid);
					transaction.set(
						customerRef,
						{
							activeCheckIn: null,
							activePartyId: null,
							activeRestaurantId: null,
						},
						{ merge: true },
					);

					if (restaurantId) {
						const personalBasketRef = customerRef
							.collection("baskets")
							.doc(restaurantId);
						transaction.delete(personalBasketRef);
					}
				});

				if (partyData.checkInId) {
					const checkInRef = db.collection("checkIns").doc(partyData.checkInId);
					transaction.delete(checkInRef);
				}
				transaction.delete(basketRef);

				if (!kitchenOrdersSnap.empty) {
					kitchenOrdersSnap.forEach((docSnap) => {
						transaction.delete(docSnap.ref);
					});
				}

				const orderRef = db.collection("orders").doc(partyId);
				transaction.set(orderRef, {
					id: partyId,
					partyId: partyId,
					restaurantId: restaurantId,
					restaurantName: restaurantName,
					table: partyData.table || null,
					server: partyData.server || null,

					subtotal: subtotalCents,
					originalSubtotal: originalSubtotalCents,
					discountTotal: discountTotalCents,
					taxAmount: 0,
					gratuityAmount: 0,
					platformFee: 0,
					processorFee: 0,
					totalPrice: subtotalCents,

					openedAt:
						partyData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
					fulfilledAt: admin.firestore.FieldValue.serverTimestamp(),
					turnaroundTimeMinutes: turnaroundTimeMinutes,

					items: officiallyOrderedItems,
					paymentProcessor: "external",
					paymentMethod: paymentMethod,
					paymentStatus: "paid",
					orderStatus: "confirmed",
				});

				if (receiptEmail && officiallyOrderedItems.length > 0) {
					const itemsHtml = officiallyOrderedItems
						.map((item) => {
							const activePrice =
								item.discountedPrice !== undefined &&
								item.discountedPrice !== null
									? item.discountedPrice
									: item.price || 0;
							const lineTotal =
								parseFloat(activePrice) * parseInt(item.quantity || 1, 10);
							return `
                            <tr>
                                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${item.quantity || 1}x ${item.dishName || item.name}</td>
                                <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right;">$${lineTotal.toFixed(2)}</td>
                            </tr>
                        `;
						})
						.join("");

					const mailRef = db.collection("mail").doc();
					transaction.set(mailRef, {
						to: receiptEmail,
						message: {
							subject: `Your Receipt from ${restaurantName}`,
							html: `
                                <div style="font-family: Helvetica, Arial, sans-serif; max-width: 450px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
                                    <h2 style="text-align: center; color: #1a1a1a; margin-bottom: 5px;">${restaurantName}</h2>
                                    <p style="text-align: center; color: #666; margin-top: 0; font-size: 14px;">Table: ${partyData.table.name || "Table"}</p>
                                    <table style="width: 100%; border-collapse: collapse; margin-top: 25px; font-size: 15px; color: #333;">
                                        ${itemsHtml}
                                    </table>
                                    <h3 style="text-align: right; margin-top: 20px; color: #1a1a1a;">Total: $${(subtotalCents / 100).toFixed(2)}</h3>
                                    <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eaeaea;">
                                        <p style="font-size: 12px; color: #999; margin: 0;">Thanks for dining with us!</p>
                                    </div>
                                </div>
                            `,
						},
					});
				}

				if (restaurantId && tableId) {
					const tableRef = db
						.collection("restaurants")
						.doc(restaurantId)
						.collection("tables")
						.doc(tableId);
					transaction.update(tableRef, { status: "checkedOut" });
				}

				return { success: true };
			});
		} catch (error) {
			console.error(`Error closing party ${partyId}:`, error);
			throw new functions.https.HttpsError(
				"internal",
				"An error occurred while closing the table.",
			);
		}
	});
