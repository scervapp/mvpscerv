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
 * Helper function to process Firestore operations in chunks of 500
 * (Enterprise standard to prevent batch limit crashes)
 */
const commitBatches = async (operations) => {
	const CHUNK_SIZE = 500;
	for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
		const chunk = operations.slice(i, i + CHUNK_SIZE);
		const batch = db.batch();
		chunk.forEach((op) => batch[op.type](op.ref, op.data));
		await batch.commit();
	}
};

/**
 * Starts a new work day for a restaurant.
 */
exports.startWorkDay = functions.https.onCall(async (data, context) => {
	if (!context.auth) {
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
		// 1. Prevent overlapping work days
		const openDaysSnapshot = await workDaysRef
			.where("status", "==", "OPEN")
			.limit(1)
			.get();
		if (!openDaysSnapshot.empty) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"A work day is already open.",
			);
		}

		console.log(
			`[Enterprise] Starting Day for ${restaurantId}. Running fallback cleanup...`,
		);
		const batchOperations = [];

		// 2. Failsafe: Reset lingering tables (if the app crashed the night before)
		const tablesSnapshot = await restaurantRef
			.collection("tables")
			.where("status", "!=", "available")
			.get();
		tablesSnapshot.docs.forEach((doc) => {
			batchOperations.push({
				type: "update",
				ref: doc.ref,
				data: {
					status: "available",
					currentCheckInId: null,
					currentCustomerId: null,
					seatedAt: null,
				},
			});
		});

		// 3. Failsafe: Archive stale kitchen orders
		const activeOrdersSnapshot = await db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.get();

		activeOrdersSnapshot.docs.forEach((doc) => {
			batchOperations.push({
				type: "update",
				ref: doc.ref,
				data: {
					overallStatus: "archived_stale",
					archivedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
			});
		});

		// Execute cleanup safely
		if (batchOperations.length > 0) await commitBatches(batchOperations);

		// 4. Create New Work Day
		const newWorkDayRef = workDaysRef.doc();
		const startBatch = db.batch();

		startBatch.set(newWorkDayRef, {
			status: "OPEN",
			startTime: admin.firestore.FieldValue.serverTimestamp(),
			endTime: null,
			managerWhoOpened: {
				uid: context.auth.uid,
				name: context.auth.token.name || "Manager",
			},
		});

		// 5. Update main restaurant doc with the current work day ID
		startBatch.update(restaurantRef, {
			isOpen: true,
			currentWorkDayId: newWorkDayRef.id,
		});

		await startBatch.commit();

		return { success: true, workDayId: newWorkDayRef.id };
	} catch (error) {
		console.error(`Start Day Error (${restaurantId}):`, error);
		throw new functions.https.HttpsError(
			"internal",
			error.message || "Could not start day.",
		);
	}
});

/**
 * Ends the current open work day for a restaurant.
 */
exports.endWorkDay = functions.https.onCall(async (data, context) => {
	if (!context.auth) {
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

	try {
		// 1. Strict Enterprise Validation: No tables can be occupied
		const unresolvedTables = await restaurantRef
			.collection("tables")
			.where("status", "!=", "available")
			.limit(1)
			.get();
		if (!unresolvedTables.empty) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Cannot close the day. All tables must be settled and cleared first.",
			);
		}

		const workDayDoc = await workDayRef.get();
		if (!workDayDoc.exists || workDayDoc.data().status !== "OPEN") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Work day is not open.",
			);
		}

		// 2. Fetch active kitchen orders to ARCHIVE (Never delete)
		const activeKitchenOrders = await db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.get();

		const batchOperations = [];

		activeKitchenOrders.forEach((doc) => {
			batchOperations.push({
				type: "update",
				ref: doc.ref,
				data: {
					overallStatus: "archived_eod",
					archivedAt: admin.firestore.FieldValue.serverTimestamp(),
					closedByWorkDay: workDayId,
				},
			});
		});

		// Execute archiving safely
		if (batchOperations.length > 0) await commitBatches(batchOperations);

		// 3. Finalize the Work Day
		const endBatch = db.batch();

		endBatch.update(workDayRef, {
			status: "CLOSED",
			endTime: admin.firestore.FieldValue.serverTimestamp(),
			managerWhoClosed: {
				uid: context.auth.uid,
				name: context.auth.token.name || "Manager",
			},
		});

		// 4. Wipe the active workday pointer on the restaurant
		endBatch.update(restaurantRef, {
			isOpen: false,
			currentWorkDayId: null,
		});

		await endBatch.commit();

		return { success: true, ordersArchived: activeKitchenOrders.size };
	} catch (error) {
		console.error(`End Day Error (${workDayId}):`, error);
		throw new functions.https.HttpsError(
			"internal",
			error.message || "Could not end day.",
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

		// 🚨 THE FIX: Hash the PIN for EVERYONE, regardless of role.
		if (pin) {
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
			pinHash, // Now every employee gets their secure hash saved!
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

exports.updateEmployee = functions.https.onCall(async (data, context) => {
	// 1. Security Check
	if (!context.auth) {
		throw new functions.https.HttpsError("unauthenticated", "Not logged in.");
	}

	const { restaurantId, employeeId, firstName, lastName, role, jobTitle, pin } =
		data;

	if (!restaurantId || !employeeId) {
		throw new functions.https.HttpsError("invalid-argument", "Missing IDs.");
	}

	try {
		const updateData = {
			firstName,
			lastName,
			role,
			jobTitle: jobTitle || null,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			// Clean up legacy fields
			isManager: admin.firestore.FieldValue.delete(),
			position: admin.firestore.FieldValue.delete(),
		};

		// 🚨 BCRYPT HASHING LOGIC
		if (pin && pin.trim() !== "") {
			const rawPin = String(pin).trim();
			const saltRounds = 10; // Standard security factor for bcrypt

			// Generate the secure hash
			const hashedPin = await bcrypt.hash(rawPin, saltRounds);

			updateData.pin = rawPin; // Save raw pin if your app still requires it
			updateData.pinHash = hashedPin; // Save the bcrypt hash for the login screen
		}

		// Execute Firestore Update
		await admin
			.firestore()
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(employeeId)
			.update(updateData);

		return { success: true };
	} catch (error) {
		console.error("Update Error:", error);
		throw new functions.https.HttpsError("internal", "Failed to update.");
	}
});

/**
 * Deletes an employee's Firestore document and their Firebase Auth account.
 */
exports.deleteEmployee = functions.https.onCall(async (data, context) => {
	// 1. Authorization Check
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

		// 2. Safely Attempt to Delete Firebase Auth User
		try {
			await admin.auth().deleteUser(employeeId);
			console.log(
				`Successfully deleted Firebase Auth record for ${employeeId}`,
			);
		} catch (authError) {
			// If they are already missing from Auth, we don't care. Just log it and move forward.
			if (authError.code === "auth/user-not-found") {
				console.log(
					`Auth record missing for ${employeeId}. Proceeding to wipe Firestore document.`,
				);
			} else {
				// If it's a real error (like missing permissions), throw it so it stops execution.
				throw authError;
			}
		}

		// 3. Delete the Firestore Document
		// Since we are only deleting one document, we can use a direct .delete() instead of a batch
		await employeeRef.delete();

		console.log(
			`✅ Successfully removed employee ${employeeId} from restaurant ${restaurantId}`,
		);
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
 * Allows authorized staff to forcibly clear a table.
 * Marks associated parties and kitchen/bar orders as VOIDED to preserve history
 * while instantly clearing them from the Active Tables, Chef's Q, and Bar Q.
 */
exports.forceClearTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be staff and authenticated.",
		);
	}

	const { restaurantId, tableId, checkInId, customerId, partyId } = data;

	if (!restaurantId || !tableId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required IDs to clear the table.",
		);
	}

	const tableRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("tables")
		.doc(tableId);

	try {
		// --- READ PHASE (Outside Transaction) ---
		let basketItemsSnapshot = { empty: true };
		let activeOrdersSnapshot = { empty: true };

		if (checkInId && checkInId !== "legacy_skip") {
			const basketItemsQuery = db
				.collection("baskets")
				.where("checkInId", "==", checkInId);
			basketItemsSnapshot = await basketItemsQuery.get();
		}

		if (partyId) {
			const activeOrdersQuery = db
				.collection("kitchen_orders")
				.where("partyId", "==", partyId)
				.where("overallStatus", "==", "active");

			activeOrdersSnapshot = await activeOrdersQuery.get();
		}

		// --- TRANSACTION PHASE ---
		await db.runTransaction(async (transaction) => {
			// READ 1: Get check-in document
			let associatedPartyId = null;
			let checkInRef = null;
			let checkInDoc = { exists: false };

			if (checkInId && checkInId !== "legacy_skip") {
				checkInRef = db.collection("checkIns").doc(checkInId);
				checkInDoc = await transaction.get(checkInRef);
				associatedPartyId = checkInDoc.exists
					? checkInDoc.data().associatedPartyId
					: null;
			}

			// 🚨 NEW READ 2: Safely check if the customer document actually exists
			let customerRef = null;
			let customerDoc = { exists: false };
			const ignoredCustomerIds = [
				"walk_in",
				"walk_in_guest",
				"guest",
				"null",
				"undefined",
			];

			if (
				customerId &&
				!ignoredCustomerIds.includes(String(customerId).toLowerCase())
			) {
				customerRef = db.collection("customers").doc(customerId);
				customerDoc = await transaction.get(customerRef);
			}

			// --- All reads are now complete. Proceed with writes. ---

			// WRITE 1: Delete legacy basket items
			if (!basketItemsSnapshot.empty) {
				basketItemsSnapshot.forEach((doc) => {
					transaction.delete(doc.ref);
				});
			}

			// WRITE 2: Void all active kitchen/bar tickets
			if (!activeOrdersSnapshot.empty) {
				activeOrdersSnapshot.forEach((doc) => {
					transaction.update(doc.ref, {
						overallStatus: "voided",
						status: "voided",
						voidedReason: "manager_force_clear_table",
						voidedAt: admin.firestore.FieldValue.serverTimestamp(),
					});
				});
			}

			// WRITE 3: Free the physical table
			transaction.update(tableRef, {
				status: "available",
				currentCheckInId: null,
				currentCustomerId: null,
				seatedAt: null,
			});

			// WRITE 4: Complete the check-in
			if (checkInDoc.exists && checkInRef) {
				transaction.update(checkInRef, {
					status: "COMPLETED",
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});
			}

			// 🚨 UPDATED WRITE 5: Only update the customer if the document exists in Firestore
			if (customerDoc.exists && customerRef) {
				transaction.update(customerRef, {
					activeCheckIn: null,
					activePartyId: null,
					activeRestaurantId: null,
				});
			}

			// WRITE 6: Void the Party Document
			const targetPartyId = partyId || associatedPartyId;
			if (targetPartyId) {
				const partyRef = db.collection("parties").doc(targetPartyId);
				transaction.update(partyRef, {
					status: "voided",
					clearedAt: admin.firestore.FieldValue.serverTimestamp(),
					clearedReason: "manager_force_clear",
				});

				// Delete the shared basket to save space
				const sharedBasketRef = db
					.collection("shared_baskets")
					.doc(targetPartyId);
				transaction.delete(sharedBasketRef);
			}
		});

		return {
			success: true,
			message:
				"Table, party, and kitchen tickets successfully voided and cleared.",
		};
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
					status: "checkedOut", // 🚨 CHANGED: This keeps it on the screen so the server can clean it
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
