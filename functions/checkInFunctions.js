const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { assertFeatureAllowed } = require("./featureEntitlements");
const db = admin.firestore();

const generateCode = () => {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I,1,O,0
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
};

const newInviteCode = generateCode();

exports.handleCheckIn = functions.firestore
	.document("checkIns/{checkInId}")
	.onCreate(async (snapshot, context) => {
		const checkInData = snapshot.data();

		// NEW: Ignore self-seated QR check-ins so we don't spam the host iPad
		if (
			checkInData.status === "ACCEPTED" ||
			checkInData.type === "self-seated"
		) {
			console.log("Self-seated check-in detected. Skipping host notification.");
			return null;
		}
		const checkInId = context.params.checkInId;

		console.log(
			`handleCheckIn trigger fired for new check-in: ${checkInId}`,
			checkInData,
		);

		try {
			// This function creates the check-in doc with status: "REQUESTED", so this line is redundant
			// and can potentially cause a small race condition. It's better to ensure the initial write
			// from the client utility is correct. For safety, we can remove or comment it out.
			// await snapshot.ref.update({ status: "REQUESTED" });

			// --- VALIDATE DATA BEFORE CREATING NOTIFICATION ---

			const { restaurantId, customerName, numberOfPeople, customerId } =
				checkInData;
			if (!restaurantId || !customerId || !customerName) {
				console.error(
					`handleCheckIn trigger: Missing critical data (restaurantId, userId, or customerName) for check-in ${checkInId}.`,
				);
				// Throw an error to trigger the catch block and set status to "error".
				throw new Error("Check-in document is missing required fields.");
			}

			// Create notification for the restaurant
			const notificationData = {
				restaurantId: restaurantId,
				customerId: customerId,
				checkInId: checkInId,
				type: "checkIn",
				isRead: false,
				customerName: customerName, // Already correct
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
				status: "PENDING_CONFIRMATION", // More descriptive status for notification
				numberOfPeople: numberOfPeople || 1, // Already correct, with fallback
			};

			console.log(
				`handleCheckIn trigger: Creating notification for check-in ${checkInId} with data:`,
				notificationData,
			);
			await db.collection("notifications").add(notificationData);
			console.log(
				`handleCheckIn trigger: Notification created successfully for check-in ${checkInId}.`,
			);

			// Optionally, send a push notification to the restaurant staff
			// ...

			return null; // Indicate successful function execution
		} catch (error) {
			console.error(`Error handling check-in ${checkInId}:`, error);
			// If there's an error, update the check-in status to 'error'
			// to signal that the trigger process failed.
			await snapshot.ref.update({
				status: "error",
				errorDetails: error.message,
			});
			// Re-throwing the error might cause the function to be retried, which might not be desired.
			// Simply updating status to "error" and returning null is often sufficient.
			return null;
		}
	});

// Cancel Check-In
exports.cancelCheckIn = functions.https.onCall(async (data, context) => {
	const { userId, restaurantId } = data;

	try {
		// 1. Input Validation
		if (!context.auth || !context.auth.uid || context.auth.uid !== userId) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User not authenticated",
			);
		}

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid restaurant ID provided",
			);
		}

		// 2. Query for the check-in document to cancel
		const checkInsRef = db.collection("checkIns");
		const q = checkInsRef
			.where("restaurantId", "==", restaurantId)
			.where("customerId", "==", userId)
			.where("status", "in", ["PENDING", "REQUESTED"]);

		const querySnapshot = await q.get();

		if (!querySnapshot.empty) {
			const checkInDoc = querySnapshot.docs[0];

			// 3. Delete the check-in document
			await checkInDoc.ref.delete();

			// 4. Update the user's active check-in status
			const userRef = db.collection("customers").doc(userId);
			const userSnap = await userRef.get();

			if (userSnap.exists) {
				await userRef.update({
					activeCheckIn: admin.firestore.FieldValue.delete(), // Remove active check-in
				});
			}

			// 5. Delete the associated notification document (if exists)
			const notificationsRef = db.collection("notifications");
			const notificationQuery = notificationsRef.where(
				"checkInId",
				"==",
				checkInDoc.id,
			);
			const notificationSnapshot = await notificationQuery.get();

			if (!notificationSnapshot.empty) {
				const notificationDoc = notificationSnapshot.docs[0];
				await notificationDoc.ref.delete();
			}

			// Optionally: Add any other actions (update table, send notifications, etc.)

			return { success: true };
		} else {
			// No pending or requested check-in found for this user and restaurant
			return {
				success: false,
				error: "No pending check-in request found to cancel.",
			};
		}
	} catch (error) {
		console.error("Error canceling check-in:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
});

/**
 * Creates a host-assigned check-in request for full-service/fine-dining flows.
 * This is separate from QR self-seating: the guest asks to be received, then
 * the host assigns a table and server from the restaurant app.
 */
exports.createHostCheckInRequest = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to request check-in.",
		);
	}

	const customerId = context.auth.uid;
	const {
		restaurantId,
		customerName,
		numberOfPeople = 1,
		reservationId = null,
		partyId = null,
		occasion = "",
		seatingPreference = "",
		allergyNotes = "",
		guestNotes = "",
	} = data || {};

	if (!restaurantId || !customerName || Number(numberOfPeople) < 1) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant, customer name, and party size are required.",
		);
	}

	const checkInRef = db.collection("checkIns").doc();
	const customerRef = db.collection("customers").doc(customerId);
	const reservationRef = reservationId
		? db.collection("reservations").doc(reservationId)
		: null;
	const requestedPartyRef = partyId
		? db.collection("parties").doc(partyId)
		: null;
	const restaurantRef = db.collection("restaurants").doc(restaurantId);

	await db.runTransaction(async (transaction) => {
		let resolvedPartySize = Number(numberOfPeople);
		let resolvedPartyRef = requestedPartyRef;
		let resolvedPartyId = partyId || null;
		const restaurantSnap = await transaction.get(restaurantRef);
		const customerSnap = await transaction.get(customerRef);
		if (!restaurantSnap.exists) {
			throw new functions.https.HttpsError("not-found", "Restaurant not found.");
		}
		assertFeatureAllowed(
			restaurantSnap.data() || {},
			"hostCheckInRequests",
			"Host check-in is not enabled for this restaurant plan.",
		);
		const activeCheckIn = customerSnap.exists
			? (customerSnap.data() || {}).activeCheckIn || null
			: null;
		if (
			activeCheckIn &&
			activeCheckIn.restaurantId === restaurantId &&
			["REQUESTED", "ACCEPTED"].includes(activeCheckIn.status)
		) {
			throw new functions.https.HttpsError(
				"already-exists",
				"You already have an active check-in request at this restaurant.",
			);
		}

		if (reservationRef) {
			const reservationSnap = await transaction.get(reservationRef);
			if (!reservationSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Reservation not found.",
				);
			}
			const reservationData = reservationSnap.data() || {};
			if (
				reservationData.customerId !== customerId ||
				reservationData.restaurantId !== restaurantId ||
				reservationData.status !== "confirmed"
			) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Reservation is not ready for arrival check-in.",
				);
			}
		}

		if (!resolvedPartyRef && customerSnap.exists) {
			const customerData = customerSnap.data() || {};
			const customerPartyIds = Array.isArray(customerData.partyIds)
				? customerData.partyIds
				: [];

			// Guests often build a basket before requesting the host. Reuse that
			// pending dine-in party so seating keeps the existing shared basket.
			for (const candidatePartyId of customerPartyIds.slice(-12).reverse()) {
				if (!candidatePartyId || typeof candidatePartyId !== "string") {
					continue;
				}

				const candidateRef = db.collection("parties").doc(candidatePartyId);
				const candidateSnap = await transaction.get(candidateRef);
				if (!candidateSnap.exists) continue;

				const candidateData = candidateSnap.data() || {};
				const isMatchingDineInParty =
					candidateData.restaurantId === restaurantId &&
					candidateData.hostUserId === customerId &&
					(candidateData.orderMode || "dineIn") !== "pickup" &&
					["pending", "AWAITING_TABLE"].includes(candidateData.status);

				if (isMatchingDineInParty) {
					resolvedPartyRef = candidateRef;
					resolvedPartyId = candidatePartyId;
					break;
				}
			}
		}

		if (resolvedPartyRef) {
			const partySnap = await transaction.get(resolvedPartyRef);
			if (!partySnap.exists) {
				throw new functions.https.HttpsError("not-found", "Party not found.");
			}
			const partyData = partySnap.data() || {};
			if (
				partyData.hostUserId !== customerId ||
				partyData.restaurantId !== restaurantId ||
				!["pending", "AWAITING_TABLE", "active"].includes(partyData.status)
			) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Only the host can bring an active party to this reservation.",
				);
			}

			resolvedPartySize = Math.max(
				1,
				(partyData.guestPips || []).length ||
					(partyData.guestUserIds || []).length ||
					Number(numberOfPeople) ||
					1,
			);
		}

		transaction.set(checkInRef, {
			restaurantId,
			customerId,
			customerName,
			numberOfPeople: resolvedPartySize,
			status: "REQUESTED",
			type: reservationId ? "reservation_arrival" : "host_assigned_walk_in",
			reservationId,
			partyId: resolvedPartyId,
			associatedPartyId: resolvedPartyId,
			occasion,
			seatingPreference,
			allergyNotes,
			guestNotes,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		transaction.set(
			customerRef,
			{
				activeCheckIn: {
					checkInId: checkInRef.id,
					restaurantId,
					status: "REQUESTED",
					type: reservationId ? "reservation_arrival" : "host_assigned_walk_in",
					reservationId,
					partyId: resolvedPartyId,
				},
			},
			{ merge: true },
		);

		if (reservationRef) {
			transaction.set(
				reservationRef,
				{
					status: "arrival_requested",
					arrivalCheckInId: checkInRef.id,
					partyId: resolvedPartyId,
					arrivedAt: admin.firestore.FieldValue.serverTimestamp(),
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);
		}

		if (resolvedPartyRef) {
			transaction.set(
				resolvedPartyRef,
				{
					status: "AWAITING_TABLE",
					checkInId: checkInRef.id,
					activeCheckInId: checkInRef.id,
					reservationId,
					reservationStatus: "arrival_requested",
					reservationPartySize: numberOfPeople,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);
		}
	});

	return { success: true, checkInId: checkInRef.id };
});

/**
 * Allows authorized staff to decline a pending check-in request.
 *
 * @param {object} data The data object from the client.
 * @param {string} data.checkInId The ID of the check-in document to decline.
 */
exports.declineCheckIn = functions.https.onCall(async (data, context) => {
	// 1. Authentication & Authorization
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be staff and authenticated.",
		);
	}

	// 2. Validation
	const { checkInId } = data;
	if (!checkInId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Check-in ID is required.",
		);
	}

	const checkInRef = db.collection("checkIns").doc(checkInId);

	try {
		return await db.runTransaction(async (transaction) => {
			// 3. Read the check-in document first
			const checkInDoc = await transaction.get(checkInRef);
			if (!checkInDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Check-in request not found.",
				);
			}
			const checkInData = checkInDoc.data();

			// Only pending requests can be declined
			if (checkInData.status !== "REQUESTED") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"This check-in has already been processed.",
				);
			}

			// 4. Perform all writes
			// Action 1: Update the check-in status
			transaction.update(checkInRef, {
				status: "DECLINED",
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			// Action 2: Clear the customer's activeCheckIn status
			if (checkInData.customerId) {
				const customerRef = db
					.collection("customers")
					.doc(checkInData.customerId);
				transaction.update(customerRef, { activeCheckIn: null });
			}

			console.log(`Successfully declined check-in ${checkInId}.`);
			return { success: true };
		});
	} catch (error) {
		console.error(`Error declining check-in ${checkInId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not decline the check-in request.",
		);
	}
});

/**
 * Allows a customer to cancel their own 'ACCEPTED' check-in, but only if
 * no items have been sent to the kitchen.
 *
 * @param {object} data The data object from the client.
 * @param {string} data.checkInId The ID of the check-in to cancel.
 * @param {object} context The Firebase Functions context object.
 */
exports.customerCancelSeatedCheckIn = functions.https.onCall(
	async (data, context) => {
		// 1. Authentication & Validation
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}
		const { checkInId } = data;
		if (!checkInId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Check-in ID is required.",
			);
		}

		const customerId = context.auth.uid;
		const checkInRef = db.collection("checkIns").doc(checkInId);

		try {
			return await db.runTransaction(async (transaction) => {
				// 2. Read the check-in document first
				const checkInDoc = await transaction.get(checkInRef);
				if (!checkInDoc.exists) {
					throw new functions.https.HttpsError(
						"not-found",
						"Check-in not found.",
					);
				}
				const checkInData = checkInDoc.data();

				// 3. Security Checks
				if (checkInData.customerId !== customerId) {
					throw new functions.https.HttpsError(
						"permission-denied",
						"You can only cancel your own check-in.",
					);
				}
				if (checkInData.status !== "ACCEPTED") {
					throw new functions.https.HttpsError(
						"failed-precondition",
						"This check-in is not currently active.",
					);
				}

				// 4. CRITICAL: Check if any items have been sent to the kitchen
				const basketQuery = db
					.collection("baskets")
					.where("checkInId", "==", checkInId);
				const basketSnapshot = await basketQuery.get(); // This read must happen BEFORE the transaction writes.

				const hasSentItems = basketSnapshot.docs.some(
					(doc) => doc.data().sentToChefQ === true,
				);
				if (hasSentItems) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						"Cannot leave table after an order has been sent to the kitchen. Please proceed to checkout.",
					);
				}

				// 5. Perform Cleanup (all writes happen after all reads)
				console.log(
					`User ${customerId} is leaving table. Cleaning up check-in ${checkInId}.`,
				);

				// Delete all basket items associated with this check-in
				basketSnapshot.forEach((doc) => transaction.delete(doc.ref));

				// Update the table status
				if (checkInData.table.id && checkInData.restaurantId) {
					const tableRef = db
						.collection("restaurants")
						.doc(checkInData.restaurantId)
						.collection("tables")
						.doc(checkInData.table.id);
					transaction.update(tableRef, {
						status: "available",
						currentCheckInId: null,
						currentCustomerId: null,
					});
				}

				// Update the check-in status
				transaction.update(checkInRef, {
					status: "CANCELLED_BY_USER",
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});

				// Clear the activeCheckIn from the customer's profile
				const customerRef = db.collection("customers").doc(customerId);
				transaction.update(customerRef, { activeCheckIn: null });

				return {
					success: true,
					message: "You have successfully left the table.",
				};
			});
		} catch (error) {
			console.error(`Error cancelling seated check-in ${checkInId}:`, error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"Could not leave the table.",
			);
		}
	},
);

// Handle Checkin-In Response (Accept or Decline)
/**
 * Handles a restaurant's response to a check-in request (accept or decline).
 * Updates the check-in document, the table document, and if it's a party,
 * the party document's status.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.checkInId - The ID of the check-in document.
 * @param {string} data.action - The action being taken, e.g., "ACCEPTED".
 * @param {object} data.table - Object with table details, e.g., { id: "table1", name: "Table 1" }.
 * @param {object} data.server - Object with server details, e.g., { id: "server1", name: "John D." }.
 * @param {string} data.customerId - The UID of the customer who checked in.
 * @param {string} data.restaurantId - The UID of the restaurant.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.handleCheckInResponse = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be staff and authenticated.",
			);
		}

		const {
			checkInId,
			action, // e.g., "ACCEPTED"
			table,
			server,
			customerId,
			restaurantId,
		} = data;

		// --- Validation ---
		if (
			!checkInId ||
			!table ||
			!table.id ||
			!server ||
			!server.id ||
			!customerId ||
			!restaurantId
		) {
			console.error(
				"handleCheckInResponse: Invalid input. Missing required IDs.",
				data,
			);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing critical information.",
			);
		}

		const checkInRef = db.collection("checkIns").doc(checkInId);
		const tableAssignment = {
			id: String(table.id || "").trim(),
			name: String(table.name || table.tableName || table.label || "Table").trim(),
		};
		const serverAssignment = {
			id: String(server.id || "").trim(),
			name:
				String(
					server.name ||
						`${server.firstName || ""} ${server.lastName || ""}`.trim() ||
						server.displayName ||
						"Server",
				).trim() || "Server",
		};
		const tableRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc(tableAssignment.id);
		const restaurantRef = db.collection("restaurants").doc(restaurantId);
		const customerRef = db.collection("customers").doc(customerId);

		try {
			return await db.runTransaction(async (transaction) => {
				const checkInDoc = await transaction.get(checkInRef);
				if (!checkInDoc.exists) {
					throw new functions.https.HttpsError(
						"not-found",
						"Check-in request not found.",
					);
				}
				const checkInData = checkInDoc.data();
				const restaurantDoc = await transaction.get(restaurantRef);

				const canRepairAcceptedWithoutParty =
					checkInData.status === "ACCEPTED" &&
					!checkInData.associatedPartyId &&
					!checkInData.partyId;
				if (checkInData.status !== "REQUESTED" && !canRepairAcceptedWithoutParty) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						`This check-in has already been processed.`,
					);
				}

				const now = admin.firestore.FieldValue.serverTimestamp();
				const restaurantData = restaurantDoc.exists
					? restaurantDoc.data() || {}
					: {};
				const restaurantName =
					restaurantData.name ||
					restaurantData.restaurantName ||
					checkInData.restaurantName ||
					"Restaurant";
				const restaurantTaxRate =
					typeof restaurantData.taxRate === "number" &&
					!isNaN(restaurantData.taxRate)
						? restaurantData.taxRate
						: 0;
				const restaurantStripeAccountId =
					restaurantData.stripeAccountId || null;
				const resolvedPartyId =
					checkInData.associatedPartyId || checkInData.partyId || null;
				const newPartyRef = resolvedPartyId
					? null
					: db.collection("parties").doc();
				const partyIdForSession = resolvedPartyId || newPartyRef.id;

				// Update the check-in document
				transaction.update(checkInRef, {
					status: "ACCEPTED",
					table: tableAssignment,
					server: serverAssignment,
					associatedPartyId: partyIdForSession,
					partyId: partyIdForSession,
					acceptedAt: now,
				});

				// Update the table's status
				transaction.set(
					tableRef,
					{
					status: "OCCUPIED",
					currentCheckInId: checkInId,
					currentCustomerId: customerId,
					currentPartyId: partyIdForSession,
					seatedAt: now,
					},
					{ merge: true },
				);

				// Update the customer's activeCheckIn status
				transaction.set(
					customerRef,
					{
						activeCheckIn: {
							checkInId: checkInId,
							restaurantId: restaurantId,
							status: "ACCEPTED",
							table: tableAssignment,
							server: serverAssignment,
							partyId: partyIdForSession,
						},
						partyIds: admin.firestore.FieldValue.arrayUnion(partyIdForSession),
					},
					{ merge: true },
				);

				if (newPartyRef) {
					const sharedBasketRef = db
						.collection("shared_baskets")
						.doc(partyIdForSession);
					const guestName = checkInData.customerName || "Guest";

					// Host-seated walk-ins do not pass through createParty, so we create
					// the same dine-in session shape the customer app already listens for.
					transaction.set(newPartyRef, {
						id: partyIdForSession,
						restaurantId,
						restaurantName,
						restaurantTaxRate,
						restaurantStripeAccountId,
						restaurantCanAcceptPayments: !!restaurantStripeAccountId,
						sharedBasketId: partyIdForSession,
						orderMode: "dineIn",
						fulfillmentType: "table",
						joinable: true,
						table: tableAssignment,
						server: serverAssignment,
						hostUserId: customerId,
						hostName: guestName,
						guestUserIds: [customerId],
						guestPips: [
							{
								userId: customerId,
								name: guestName,
								joinedAt: new Date(),
								isLocal: true,
							},
						],
						guestNames: [],
						status: "active",
						checkInId,
						activeCheckInId: checkInId,
						reservationId: checkInData.reservationId || null,
						inviteCode: null,
						inviteCodeExpiry: null,
						createdAt: now,
						lastUpdated: now,
					});

					transaction.set(sharedBasketRef, {
						partyId: partyIdForSession,
						restaurantId,
						orderMode: "dineIn",
						fulfillmentType: "table",
						items: [],
						createdAt: now,
						lastUpdated: now,
					});
				}

				// If this request was tied to an existing party/reservation party,
				// move that session from awaiting-table into active service.
				if (resolvedPartyId) {
					const partyRef = db.collection("parties").doc(partyIdForSession);

					transaction.set(
						partyRef,
						{
							status: "active",
							table: tableAssignment,
							server: serverAssignment,
							checkInId: checkInId,
							activeCheckInId: checkInId,
							reservationId: checkInData.reservationId || null,
							lastUpdated: now,
						},
						{ merge: true },
					);

					console.log(
						`handleCheckInResponse: Updated associated party ${partyIdForSession} to active.`,
					);
				}

				// Reservation arrivals still finish through the host seating flow.
				// Keeping this sync here makes the table assignment the source of truth.
				if (checkInData.reservationId) {
					const reservationRef = db
						.collection("reservations")
						.doc(checkInData.reservationId);
					transaction.set(
						reservationRef,
						{
							status: "seated",
							checkInId: checkInId,
							partyId: partyIdForSession,
							table: tableAssignment,
							server: serverAssignment,
							seatedAt: now,
							updatedAt: now,
						},
						{ merge: true },
					);
				}

				console.log(
					`handleCheckInResponse: Successfully accepted check-in ${checkInId} for table ${tableAssignment.name}.`,
				);
				return { success: true, partyId: partyIdForSession };
			});
		} catch (error) {
			console.error(
				`Error handling check-in response for ${checkInId}:`,
				error,
			);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"An unexpected error occurred while confirming the check-in.",
			);
		}
	},
);

/**
 * Fast-track check-in for QR code / self-seating.
 * Bypasses the host and instantly marks the table as occupied.
 */
exports.selfSeatingCheckIn = functions.https.onCall(async (data, context) => {
	// 1. Auth Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to check in.",
		);
	}

	const customerId = context.auth.uid;
	const {
		restaurantId,
		tableId,
		tableName,
		customerName,
		numberOfPeople,
		partyId,
	} = data;

	// 2. Input Validation
	if (!restaurantId || !tableId || !customerName) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required QR code data (restaurantId or tableId).",
		);
	}

	const tableRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("tables")
		.doc(tableId);
	const customerRef = db.collection("customers").doc(customerId);
	const newCheckInRef = db.collection("checkIns").doc(); // Auto-generate new ID
	const partyRef = partyId ? db.collection("parties").doc(partyId) : null;

	try {
		return await db.runTransaction(async (transaction) => {
			// 3. Read the Table status FIRST
			const [tableDoc, partyDoc] = await Promise.all([
				transaction.get(tableRef),
				partyRef ? transaction.get(partyRef) : Promise.resolve(null),
			]);

			if (!tableDoc.exists) {
				throw new functions.https.HttpsError("not-found", "Table not found.");
			}

			const tableData = tableDoc.data();

			if (tableData.isActive === false) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"This table is not currently open for guest seating.",
				);
			}

			// CRITICAL: Make sure someone else didn't just sit here!
			if (tableData.status !== "available") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"This table is currently occupied. Please scan a different table.",
				);
			}

			let partyData = null;
			if (partyRef) {
				if (!partyDoc.exists) {
					throw new functions.https.HttpsError("not-found", "Party not found.");
				}

				partyData = partyDoc.data();

				if (partyData.hostUserId !== customerId) {
					throw new functions.https.HttpsError(
						"permission-denied",
						"Only the party host can check in the party.",
					);
				}

				if (partyData.restaurantId !== restaurantId) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						"This party belongs to a different restaurant.",
					);
				}

				if (!["pending", "AWAITING_TABLE", "active"].includes(partyData.status)) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						"This party is not available for table check-in.",
					);
				}
			}

			// 4. Perform the Writes (The Fast-Track)
			const timestamp = admin.firestore.FieldValue.serverTimestamp();
			const partyMemberCount = partyData
				? (partyData.guestPips || []).length ||
					(partyData.guestUserIds || []).length
				: 0;

			// A. Create the CheckIn document directly as ACCEPTED
			const checkInData = {
				id: newCheckInRef.id,
				restaurantId: restaurantId,
				customerId: customerId,
				customerName: customerName,
				numberOfPeople: numberOfPeople || partyMemberCount || 1,
				status: "ACCEPTED", // Bypasses the host!
				type: partyRef ? "party" : "self-seated", // Good for your analytics
				table: { id: tableId, name: tableName || tableData.name },
				// Dummy server object since there is no host to assign one yet
				server: { id: "unassigned", name: "Self-Seated" },
				createdAt: timestamp,
				acceptedAt: timestamp,
			};
			if (partyRef) {
				checkInData.partyId = partyId;
				checkInData.associatedPartyId = partyId;
			}
			transaction.set(newCheckInRef, checkInData);

			// B. Mark the Table as OCCUPIED
			transaction.update(tableRef, {
				status: "OCCUPIED",
				currentCheckInId: newCheckInRef.id,
				currentCustomerId: customerId,
				seatedAt: timestamp,
			});

			// C. Update the Customer's Profile
			transaction.update(customerRef, {
				activeCheckIn: {
					checkInId: newCheckInRef.id,
					restaurantId: restaurantId,
					status: "ACCEPTED",
					table: { id: tableId, name: tableName || tableData.name },
				},
			});

			if (partyRef) {
				transaction.update(partyRef, {
					status: "active",
					table: { id: tableId, name: tableName || tableData.name },
					checkInId: newCheckInRef.id,
					activeCheckInId: newCheckInRef.id,
					lastUpdated: timestamp,
				});
			}

			return {
				success: true,
				checkInId: newCheckInRef.id,
				message: "Successfully checked in to table!",
			};
		});
	} catch (error) {
		console.error("QR Check-in Error:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not process QR check-in.",
		);
	}
});

exports.handleQRScan = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError("unauthenticated", "Please log in.");
	}

	const { restaurantId, tableId } = data;
	if (!restaurantId || !tableId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing QR data.",
		);
	}

	try {
		const tableDoc = await db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc(tableId)
			.get();

		if (!tableDoc.exists) {
			throw new functions.https.HttpsError("not-found", "Table not found.");
		}

		const tableData = tableDoc.data();

		if (tableData.isActive === false) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This table is not currently open for guest seating.",
			);
		}

		// =================================================================
		// SCENARIO 1: Table is empty -> Start a new party of 1
		// =================================================================
		if (tableData.status === "available") {
			return { action: "create_party", message: "Table is available." };
		}

		// =================================================================
		// SCENARIO 2: Table is occupied -> Find the active party
		// =================================================================
		const partyQuery = await db
			.collection("parties")
			.where("restaurantId", "==", restaurantId)
			.where("table.id", "==", tableId)
			.where("status", "in", ["active", "AWAITING_TABLE", "pending"])
			.limit(1)
			.get();

		// EDGE CASE FIX: If the table isn't "available" but no party exists,
		// it's a corrupted state. Don't fallback to individual, just throw an error.
		if (partyQuery.empty) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Table is locked but no active session was found. Please contact staff to reset.",
			);
		}

		const partyDoc = partyQuery.docs[0];
		const partyData = partyDoc.data();

		// =================================================================
		// SCENARIO 3: User is already in this party
		// =================================================================
		if (
			partyData.guestUserIds &&
			partyData.guestUserIds.includes(context.auth.uid)
		) {
			return { action: "already_joined", partyId: partyDoc.id };
		}

		// --- SAFEGUARD: AUTO-GENERATE MISSING INVITE CODE ---
		let currentInviteCode = partyData.inviteCode;

		if (!currentInviteCode) {
			currentInviteCode = Math.random()
				.toString(36)
				.substring(2, 8)
				.toUpperCase();

			await partyDoc.ref.update({ inviteCode: currentInviteCode });

			console.log(
				`[handleQRScan] Auto-generated missing invite code ${currentInviteCode} for party ${partyDoc.id}`,
			);
		}
		// --------------------------------------------------

		// =================================================================
		// SCENARIO 4: User is new -> Hand them the keys to join
		// =================================================================
		return {
			action: "join_party",
			partyId: partyDoc.id,
			hostName: partyData.hostName || "The Host",
			inviteCode: currentInviteCode, // Guaranteed to exist
		};
	} catch (error) {
		console.error("handleQRScan Error:", error);
		throw new functions.https.HttpsError(
			"internal",
			error.message || "Error processing QR scan.",
		);
	}
});

exports.clearTable = functions.firestore
	.document("restaurants/{restaurantId}/tables/{tableId}")
	.onUpdate(async (change, context) => {
		const newData = change.after.data(); // The updated document data
		const previousData = change.before.data(); // The data before the update

		// Check if the table status has been updated to 'AVAILABLE'
		if (previousData.status !== "available" && newData.status === "available") {
			const { restaurantId, customerId, tableId } = newData;

			try {
				// Query the check-in collection to find the check-in associated with this customer and table
				const checkInsRef = db.collection("checkIns");
				const checkInSnapshot = await checkInsRef
					.where("restaurantId", "==", restaurantId)
					.where("customerId", "==", customerId)
					.where("table.id", "==", tableId)
					.get();

				if (!checkInSnapshot.empty) {
					const checkInDoc = checkInSnapshot.docs[0]; // Assuming one check-in per customer/table

					// Delete the check-in document
					await checkInDoc.ref.delete();

					// Query and delete associated notifications
					const notificationsRef = db.collection("notifications");
					const notificationSnapshot = await notificationsRef
						.where("checkInId", "==", checkInDoc.id)
						.get();

					if (!notificationSnapshot.empty) {
						const notificationDoc = notificationSnapshot.docs[0]; // Assuming one notification per check-in
						await notificationDoc.ref.delete();
					}

					console.log(
						`Successfully deleted check-in and notification for table ${tableId}.`,
					);
				} else {
					console.log(
						`No check-in found for customer ${customerId} and table ${tableId}.`,
					);
				}
			} catch (error) {
				console.error("Error deleting check-in or notification:", error);
			}
		}

		return null;
	});

// =====================================================================
// CONVERT INDIVIDUAL CHECK-IN TO PARTY (FIXED)
// =====================================================================
exports.convertIndividualToParty = functions.https.onCall(
	async (data, context) => {
		// 1. Auth Check
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be logged in.",
			);
		}

		const { restaurantId, tableId, checkInId, originalUserId } = data;
		const newUserId = context.auth.uid;

		if (!restaurantId || !tableId || !checkInId || !originalUserId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing table data.",
			);
		}

		try {
			const batch = db.batch();
			const partyId = db.collection("parties").doc().id;
			const newInviteCode = generateCode();

			// 5. Fetch Table, Restaurant, Basket, AND BOTH USERS in Parallel
			const restaurantRef = db.collection("restaurants").doc(restaurantId);
			const tableRef = restaurantRef.collection("tables").doc(tableId);
			const userARef = db.collection("customers").doc(originalUserId);
			const userBRef = db.collection("customers").doc(newUserId);
			const activeBasketQuery = db
				.collection("baskets")
				.where("userId", "==", originalUserId)
				.where("restaurantId", "==", restaurantId);

			const [restaurantSnap, tableSnap, basketSnap, userASnap, userBSnap] =
				await Promise.all([
					restaurantRef.get(),
					tableRef.get(),
					activeBasketQuery.get(),
					userARef.get(),
					userBRef.get(),
				]);

			// Extract Data
			const restaurantData = restaurantSnap.exists
				? restaurantSnap.data()
				: null;
			const tableData = tableSnap.exists ? tableSnap.data() : null;
			const realRestaurantName =
				restaurantData.name ||
				restaurantData.restaurantName ||
				"Unknown Restaurant";
			const tableName = tableData.name || "Table";

			// 🚨 FIX 1: Extract User Names for the GuestPips
			const userAData = userASnap.exists ? userASnap.data() : {};
			const userBData = userBSnap.exists ? userBSnap.data() : {};

			const userAName =
				`${userAData.firstName || ""} ${userAData.lastName || ""}`.trim() ||
				`User ${originalUserId.slice(-4)}`;
			const userBName =
				`${userBData.firstName || ""} ${userBData.lastName || ""}`.trim() ||
				`User ${newUserId.slice(-4)}`;

			const sharedItems = [];
			basketSnap.docs.forEach((doc) => {
				const item = doc.data();
				sharedItems.push({
					id: doc.id,
					menuItemId: item.menuItemId || "",
					dishName: item.dish.name || "Unknown Item",
					price: item.dish.price || 0,
					quantity: item.quantity || 1,
					specialInstructions: item.specialInstructions || "",
					orderedByUserId: originalUserId,
					addedByUserId: originalUserId,
					addedAt: item.createdAt || new Date(),
					status: item.sentToChefQ ? "sent" : "new",
					category: item.dish.category || null,
					imageUri: item.dish.imageUri || null,
					restaurantId: restaurantId,
				});
				batch.delete(doc.ref);
			});

			// 7. Create Shared Basket
			const sharedBasketRef = db.collection("shared_baskets").doc(partyId);
			batch.set(sharedBasketRef, {
				items: sharedItems,
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			});

			// 8. Create Party Document (Now with names included!)
			const partyRef = db.collection("parties").doc(partyId);
			batch.set(partyRef, {
				id: partyId,
				restaurantId: restaurantId,
				restaurantName: realRestaurantName,
				partyName: `${tableName}`,
				table: { id: tableId, name: tableName },
				checkInId: checkInId,
				sharedBasketId: partyId,
				hostId: originalUserId,
				status: "active",
				inviteCode: newInviteCode,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				guestUserIds: [originalUserId, newUserId], // Good practice to have an array of just IDs for querying
				guestPips: [
					{
						userId: originalUserId,
						name: userAName, // <-- Fixed
						joinedAt: new Date(),
						paymentStatus: "pending",
					},
					{
						userId: newUserId,
						name: userBName, // <-- Fixed
						joinedAt: new Date(),
						paymentStatus: "pending",
					},
				],
			});

			// 9. Update Table & Check-In
			batch.update(tableRef, {
				status: "party",
				currentPartyId: partyId,
			});

			batch.update(db.collection("checkIns").doc(checkInId), {
				type: "party",
				partyId: partyId,
			});

			// 🚨 FIX 2: Update Both Users' Profiles so their UI automatically redirects
			batch.update(userARef, {
				partyIds: admin.firestore.FieldValue.arrayUnion(partyId),
			});
			batch.update(userBRef, {
				partyIds: admin.firestore.FieldValue.arrayUnion(partyId),
			});

			await batch.commit();
			return { success: true, partyId: partyId };
		} catch (error) {
			console.error("Conversion error details:", error);
			throw new functions.https.HttpsError(
				"internal",
				error.message || "Could not convert to party.",
			);
		}
	},
);
