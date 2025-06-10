// functions/partyFunctions.js (Create this new file)

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Creates a new 'pending' party document initiated by a host for a specific restaurant.
 */

exports.createParty = functions.https.onCall(async (data, context) => {
	// 1. Authentication Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to create a party."
		);
	}
	const hostUserId = context.auth.uid;

	// 2. Input Validation
	const { restaurantId } = data;
	if (
		!restaurantId ||
		typeof restaurantId !== "string" ||
		restaurantId.trim() === ""
	) {
		console.error(
			"CreateParty: Invalid input - restaurantId missing or not a valid string.",
			data
		);
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID is required and must be a non-empty string."
		);
	}

	try {
		// 3. Fetch Host's Name (Denormalization)
		const hostUserRef = db.collection("customers").doc(hostUserId);
		const restaurantDocRef = db.collection("restaurants").doc(restaurantId);

		console.log(
			`CreateParty: Fetching details for host ${hostUserId} and restaurant ${restaurantId}`
		);

		const [hostUserSnap, restaurantSnap] = await Promise.all([
			hostUserRef.get(),
			restaurantDocRef.get(),
		]);
		if (!hostUserSnap.exists) {
			// Should not happen for authenticated user, but good check
			throw new functions.https.HttpsError(
				"not-found",
				"Host user data not found."
			);
		}

		if (!restaurantSnap.exists) {
			console.error(
				`CreateParty: Restaurant data not found for ID: ${restaurantId}`
			);
			throw new functions.https.HttpsError(
				"not-found",
				`Restaurant data not found.`
			);
		}
		// Adjust field names if your customer doc structure is different
		const hostData = hostUserSnap.data();
		const hostName =
			`${hostData.firstName || ""} ${hostData.lastName || ""}`.trim() || "Host";

		const restaurantData = restaurantSnap.data();
		const restaurantName = restaurantData.restaurantName;
		const restaurantTaxRate = restaurantData.taxRate; // Ensure this field exists on your restaurant documents

		// Validate fetched restaurant data
		if (typeof restaurantName !== "string" || restaurantName.trim() === "") {
			console.error(
				`CreateParty: Restaurant name missing or invalid for restaurant ${restaurantId}.`
			);
			throw new functions.https.HttpsError(
				"internal",
				"Restaurant configuration error (name)."
			);
		}
		if (typeof restaurantTaxRate !== "number" || isNaN(restaurantTaxRate)) {
			console.error(
				`CreateParty: Restaurant tax rate missing or invalid for restaurant ${restaurantId}. Expected number, got:`,
				restaurantTaxRate
			);
			throw new functions.https.HttpsError(
				"internal",
				"Restaurant configuration error (tax rate)."
			);
		}
		console.log(
			`CreateParty: Host: ${hostName}, Restaurant: ${restaurantName}, Tax Rate: ${restaurantTaxRate}`
		);

		// 4. Create the Party Document
		const partyId = db.collection("parties").doc().id; // Pre-generate ID for both docs
		const partyRef = db.collection("parties").doc(partyId); // Auto-generate ID
		const sharedBasketRef = db.collection("shared_baskets").doc(partyId); // Use the same ID

		const now = admin.firestore.FieldValue.serverTimestamp();

		const partyDataToSet = {
			id: partyId,
			restaurantId: restaurantId,
			restaurantName: restaurantName,
			restaurantTaxRate: restaurantTaxRate,
			hostUserId: hostUserId,
			hostName: hostName,
			guestUserIds: [hostUserId],
			guestPips: [
				{
					userId: hostUserId,
					name: hostName,
					joinedAt: new Date(),
					isLocal: true,
				},
			],
			guestNames: [],
			status: "pending",
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			checkInId: null,
			inviteCode: null,
			inviteCodeExpiry: null,
		};
		const sharedBasketDataToSet = {
			partyId: partyId, // Store partyId in basket for reference
			restaurantId: restaurantId,
			items: [], // Initially empty
			lastUpdated: now,
			createdAt: now,
		};

		console.log(
			`CreateParty: Preparing batch write for party ${partyId} and its shared basket.`
		);
		const batch = db.batch();
		batch.set(partyRef, partyDataToSet);
		batch.set(sharedBasketRef, sharedBasketDataToSet); // Create empty shared basket
		await batch.commit();

		console.log(
			`Party ${partyId} and shared basket created successfully for restaurant ${restaurantId} by host ${hostUserId}`
		);
		return { success: true, partyId: partyId };
	} catch (error) {
		console.error("Error creating party:", error);
		if (error.code && error.httpErrorCode) {
			throw error;
		} // Re-throw HttpsErrors
		throw new functions.https.HttpsError(
			"internal",
			"Failed to create party.",
			error.message
		);
	}
});

// functions/partyFunctions.js (Add to the same file)

const { Timestamp, FieldValue } = require("firebase-admin/firestore"); // Import Timestamp

/**
 * Sends an invite to a party. Can invite a specific user (creates notification)
 * or generate a shareable invite code.
 */
exports.inviteToParty = functions.https.onCall(async (data, context) => {
	// 1. Authentication Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	const hostUserId = context.auth.uid;

	// 2. Input Validation
	const { partyId, inviteeUserId, generateCode } = data;
	if (!partyId || (!inviteeUserId && !generateCode)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID and either inviteeUserId or generateCode flag are required."
		);
	}

	const partyRef = db.collection("parties").doc(partyId);

	try {
		// 3. Get Party and Verify Host
		const partySnap = await partyRef.get();

		if (!partySnap.exists) {
			throw new functions.https.HttpsError("not-found", "Party not found.");
		}
		const partyData = partySnap.data();

		// Allow inviting if pending OR active
		if (partyData.status !== "pending" && partyData.status !== "active") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Can only invite to pending or active parties."
			);
		}

		if (partyData.hostUserId !== hostUserId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Only the host can invite guests."
			);
		}

		// 4. Handle Invite Type
		if (inviteeUserId) {
			// --- Invite Specific User ---
			if (
				partyData.guestUserIds.includes(inviteeUserId) ||
				inviteeUserId === hostUserId
			) {
				console.log(`User ${inviteeUserId} is already in party ${partyId}.`);
				return { success: true, message: "User already in party." }; // Or throw 'already-exists' error?
			}

			// TODO: Implement your notification system here
			// Example: Create a document in a 'notifications' collection
			const notificationRef = db.collection("notifications").doc(); // Or specific path like users/{inviteeUserId}/notifications
			await notificationRef.set({
				recipientUserId: inviteeUserId,
				type: "partyInvite",
				message: `${partyData.hostName} invited you to a party at ${partyData.restaurantName}.`,
				partyId: partyId,
				restaurantId: partyData.restaurantId,
				restaurantName: partyData.restaurantName,
				hostName: partyData.hostName,
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
				isRead: false,
			});
			console.log(
				`Notification sent to user ${inviteeUserId} for party ${partyId}`
			);
			return { success: true };
		} else if (generateCode) {
			// --- Generate Invite Code ---
			// Simple 6-char alphanumeric code generation (you might want a more robust method)
			const code = Math.random().toString(36).substring(2, 8).toUpperCase();
			const expiryDurationMinutes = 60; // Code valid for 1 hour
			const expiryDate = new Date(
				Date.now() + expiryDurationMinutes * 60 * 1000
			);
			const expiryTimestamp = Timestamp.fromDate(expiryDate);

			await partyRef.update({
				inviteCode: code,
				inviteCodeExpiry: expiryTimestamp,
			});
			console.log(
				`Generated invite code ${code} for party ${partyId}, expires at ${expiryDate}`
			);
			return { success: true, inviteCode: code, expiresAt: expiryTimestamp };
		} else {
			// Should be caught by validation, but as a fallback
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Invalid invite type."
			);
		}
	} catch (error) {
		console.error("Error inviting to party:", error);
		if (error.code && error.httpErrorCode) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to send invite.",
			error.message
		);
	}
});

// functions/partyFunctions.js (Add to the same file)

/**
 * Allows an authenticated user to join a 'pending' party using either
 * the partyId (from a notification) or a valid inviteCode.
 */
exports.joinParty = functions.https.onCall(async (data, context) => {
	// 1. Authentication Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to join."
		);
	}
	const guestUserId = context.auth.uid;

	// 2. Input Validation
	const { partyId, inviteCode } = data;
	if (!partyId && !inviteCode) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Either partyId or inviteCode is required."
		);
	}

	let partyRef;
	let partySnap;

	try {
		// 3. Find the Party Document
		if (partyId) {
			partyRef = db.collection("parties").doc(partyId);
			partySnap = await partyRef.get();
			if (!partySnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Party not found using ID."
				);
			}
		} else if (inviteCode) {
			const now = Timestamp.now();
			const partyQuery = db
				.collection("parties")
				.where("inviteCode", "==", inviteCode)
				.where("inviteCodeExpiry", ">", now) // Check expiry
				.limit(1);
			const partyQuerySnap = await partyQuery.get();
			if (partyQuerySnap.empty) {
				throw new functions.https.HttpsError(
					"not-found",
					"Invalid or expired invite code."
				);
			}
			partyRef = partyQuerySnap.docs[0].ref;
			partySnap = partyQuerySnap.docs[0]; // Use the snapshot directly
		} else {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing identifier."
			); // Should not happen
		}

		const partyData = partySnap.data();
		const actualPartyId = partyRef.id; // Get the ID consistently

		// 4. Validate Party Status and Membership
		if (partyData.status !== "pending" && partyData.status !== "active") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Party is no longer accepting guests."
			);
		}
		if (partyData.hostUserId === guestUserId) {
			throw new functions.https.HttpsError(
				"already-exists",
				"You are the host of this party."
			);
		}
		if (partyData.guestUserIds.includes(guestUserId)) {
			console.log(`User ${guestUserId} already joined party ${actualPartyId}.`);
			return {
				success: true,
				partyId: actualPartyId,
				message: "Already joined.",
			};
		}

		// 5. Fetch Guest's Name
		const guestUserRef = db.collection("customers").doc(guestUserId);
		const guestUserSnap = await guestUserRef.get();
		if (!guestUserSnap.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Guest user data not found."
			);
		}
		const guestName =
			`${guestUserSnap.data().firstName || ""} ${
				guestUserSnap.data().lastName || ""
			}`.trim() || "Guest";

		// 6. Add Guest to Party (Atomically)
		await partyRef.update({
			guestUserIds: admin.firestore.FieldValue.arrayUnion(guestUserId),
			guestNames: admin.firestore.FieldValue.arrayUnion({
				userId: guestUserId,
				name: guestName,
			}),
			// Optionally clear invite code after first use if desired
			// inviteCode: null,
			// inviteCodeExpiry: null,
		});

		console.log(
			`User ${guestUserId} successfully joined party ${actualPartyId} (Status: ${partyData.status})`
		);
		return { success: true, partyId: actualPartyId };
	} catch (error) {
		console.error("Error joining party:", error);
		if (error.code && error.httpErrorCode) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to join party.",
			error.message
		);
	}
});
// functions/partyFunctions.js (Add to the same file as create/invite/join)

/**
 * Allows an authenticated guest to leave a 'pending' party.
 */
exports.leaveParty = functions.https.onCall(async (data, context) => {
	// 1. Authentication Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to leave."
		);
	}
	const guestUserId = context.auth.uid;

	// 2. Input Validation
	const { partyId } = data;
	if (!partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID is required."
		);
	}

	const partyRef = db.collection("parties").doc(partyId);

	try {
		// 3. Get Party Document
		const partySnap = await partyRef.get();
		if (!partySnap.exists) {
			throw new functions.https.HttpsError("not-found", "Party not found.");
		}
		const partyData = partySnap.data();

		// 4. Validate Status and Membership
		if (partyData.status !== "pending") {
			// For now, only allow leaving pending parties
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Cannot leave a party that is already active or completed."
			);
		}

		if (partyData.hostUserId === guestUserId) {
			// Host cannot use this function to leave; they might need a 'cancelParty' function
			throw new functions.https.HttpsError(
				"permission-denied",
				"Host cannot leave the party using this function. Consider cancelling."
			);
		}

		if (!partyData.guestUserIds.includes(guestUserId)) {
			// User isn't actually a guest in this party
			console.log(`User ${guestUserId} is not a guest in party ${partyId}.`);
			return { success: true, message: "User not found in party." }; // Return success silently
		}

		// 5. Remove Guest from Party (Atomically)
		// Find the guest's name object to remove it correctly
		const guestNameObjectToRemove = partyData.guestNames.find(
			(guest) => guest.userId === guestUserId
		);

		await partyRef.update({
			guestUserIds: admin.firestore.FieldValue.arrayRemove(guestUserId),
			// Remove the specific guest name object
			guestNames: admin.firestore.FieldValue.arrayRemove(
				guestNameObjectToRemove || {}
			), // Pass empty obj if somehow not found
		});

		console.log(`User ${guestUserId} successfully left party ${partyId}`);
		return { success: true };
	} catch (error) {
		console.error("Error leaving party:", error);
		if (error.code && error.httpErrorCode) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to leave party.",
			error.message
		);
	}
});

/**
 * Allows the host of a 'pending' party to cancel it.
 * Updates the party status to 'cancelled'.
 */
exports.cancelParty = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId } = data;

	if (!partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID is required."
		);
	}

	const partyRef = db.collection("parties").doc(partyId);
	const sharedBasketRef = db.collection("shared_baskets").doc(partyId);

	try {
		const partyDoc = await partyRef.get();
		if (!partyDoc.exists) {
			console.log(`cancelParty: Party ${partyId} not found, already deleted.`);
			return { success: true, message: "Party already deleted." };
		}

		const partyData = partyDoc.data();
		if (partyData.hostUserId !== hostUserId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Only the party host can cancel the party."
			);
		}
		if (partyData.status !== "pending") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Only parties in a 'pending' state can be cancelled."
			);
		}

		// Use a batch to delete both documents atomically.
		const batch = db.batch();
		batch.delete(partyRef);
		batch.delete(sharedBasketRef);
		await batch.commit();

		console.log(
			`cancelParty: Successfully deleted party ${partyId} and its shared basket.`
		);
		return { success: true };
	} catch (error) {
		console.error(`Error cancelling/deleting party ${partyId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not cancel party.",
			error.message
		);
	}
});
// functions/partyFunctions.js (Conceptual Structure)

exports.activatePartyCheckIn = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId, checkInId } = data;

	if (!partyId || !checkInId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID and Check-In ID are required."
		);
	}

	const partyRef = db.collection("parties").doc(partyId);
	const checkInRef = db.collection("checkIns").doc(checkInId);

	try {
		return await db.runTransaction(async (transaction) => {
			const partyDoc = await transaction.get(partyRef);
			const checkInDoc = await transaction.get(checkInRef);

			if (!partyDoc.exists) {
				throw new functions.https.HttpsError("not-found", "Party not found.");
			}
			if (!checkInDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Check-in record not found."
				);
			}

			const partyData = partyDoc.data();
			const checkInData = checkInDoc.data();

			if (partyData.hostUserId !== hostUserId) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"Only the party host can activate the check-in link."
				);
			}
			if (partyData.status !== "pending") {
				// Or if it's already "AWAITING_TABLE" and checkInId matches, perhaps it's a no-op.
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Party is not in a pending state for check-in activation."
				);
			}
			if (
				checkInData.associatedPartyId !== partyId ||
				checkInData.userId !== hostUserId
			) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Check-in record is not correctly associated with this party or host."
				);
			}
			if (checkInData.status !== "REQUESTED") {
				// Ensure the check-in itself is in the right state
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Linked check-in is not in a 'REQUESTED' state."
				);
			}

			// Link the check-in and update party status to indicate it's awaiting restaurant confirmation
			transaction.update(partyRef, {
				activeCheckInId: checkInId,
				status: "AWAITING_TABLE", // New status indicating check-in is submitted
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			});

			// Optionally, update the check-in document too, e.g., to confirm it's linked (though associatedPartyId already does this)
			// transaction.update(checkInRef, { partyLinkConfirmedAt: admin.firestore.FieldValue.serverTimestamp() });

			return {
				success: true,
				message: "Party check-in linked and awaiting confirmation.",
			};
		});
	} catch (error) {
		console.error(
			"Error activating party check-in:",
			partyId,
			checkInId,
			error
		);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not activate party check-in.",
			error.message
		);
	}
});

/**
 * Cancels a pending party check-in request.
 * This reverts the party status from 'AWAITING_TABLE' back to 'pending'
 * and cancels the associated check-in document.
 *
 * @param {object} data - The data object.
 * @param {string} data.partyId - The ID of the party whose check-in is being cancelled.
 * @param {string} data.checkInId - The ID of the check-in document to cancel.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.cancelPartyCheckIn = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId, checkInId } = data;

	if (!partyId || !checkInId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID and Check-In ID are required."
		);
	}

	const partyRef = db.collection("parties").doc(partyId);
	const checkInRef = db.collection("checkIns").doc(checkInId);

	try {
		return await db.runTransaction(async (transaction) => {
			const partyDoc = await transaction.get(partyRef);
			const checkInDoc = await transaction.get(checkInRef);

			if (!partyDoc.exists || !checkInDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Party or Check-in record not found."
				);
			}

			const partyData = partyDoc.data();

			// --- Validation Checks ---
			// 1. Check if the requester is the host.
			if (partyData.hostUserId !== hostUserId) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"Only the party host can cancel the check-in request."
				);
			}
			// 2. Check if the party is in the correct state to be cancelled.
			if (partyData.hostUserId !== hostUserId)
				throw new functions.https.HttpsError(
					"permission-denied",
					"Only host can cancel."
				);
			if (partyData.status !== "AWAITING_TABLE")
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Party is not awaiting table confirmation."
				);
			if (partyData.activeCheckInId !== checkInId)
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Check-in ID mismatch."
				);

			// --- Perform Updates ---
			// 1. Revert the party's status back to 'pending' and remove the linked check-in ID.
			transaction.update(partyRef, {
				status: "pending", // Revert status
				activeCheckInId: null, // Unlink the check-in ID
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			});

			// 2. DELETE the check-in document entirely
			transaction.delete(checkInRef);

			console.log(
				`cancelPartyCheckIn: Successfully reverted party ${partyId} and deleted check-in ${checkInId}.`
			);
			return { success: true };
		});
	} catch (error) {
		console.error(
			`Error cancelling party check-in for party ${partyId}:`,
			error
		);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not cancel party check-in.",
			error.message
		);
	}
});

/**
 * Allows the host to directly add a 'local' (non-user) PIP to a pending or active party.
 */
exports.addLocalPipToParty = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId, pipsToAdd } = data;

	if (!partyId || !Array.isArray(pipsToAdd) || pipsToAdd.length === 0) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID and a non-empty array of PIPs to add are required."
		);
	}

	const partyRef = db.collection("parties").doc(partyId);

	try {
		const partyDoc = await partyRef.get();
		if (!partyDoc.exists) {
			throw new functions.https.HttpsError("not-found", "Party not found.");
		}

		const partyData = partyDoc.data();
		if (partyData.hostUserId !== hostUserId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Only the party host can add members."
			);
		}

		// Prepare new guest objects with timestamps
		const newGuestPips = pipsToAdd.map((pip) => ({
			localPipId: pip.id, // Use a distinct key for non-user guests
			userId: null, // No Firebase user ID for local PIPs
			name: pip.name,
			joinedAt: new Date(), // Use new Date() for array elements
		}));

		// Also prepare the IDs for the guestUserIds array for easier querying later
		const newGuestPipIds = pipsToAdd.map((pip) => pip.id);

		await partyRef.update({
			// Use FieldValue.arrayUnion to atomically add elements to the arrays
			guestPips: admin.firestore.FieldValue.arrayUnion(...newGuestPips),
			guestUserIds: admin.firestore.FieldValue.arrayUnion(...newGuestPipIds),
			lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
		});

		console.log(
			`addLocalPIPsToParty: Successfully added ${pipsToAdd.length} members to party ${partyId}.`
		);
		return { success: true };
	} catch (error) {
		console.error(`Error adding members to party ${partyId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not add members to the party.",
			error.message
		);
	}
});

/**
 * Updates the quantity of a specific item in a shared party basket.
 * This function expects newQuantity to be > 0.
 * Removal of items (when quantity becomes 0) is handled by a separate function
 * triggered by the client-side context.
 *
 * @param {object} data - The data object.
 * @param {string} data.partyId - The ID of the party.
 * @param {string} data.itemId - The unique ID of the basket item instance to update.
 * @param {number} data.newQuantity - The new quantity for the item (must be > 0).
 * @param {string} data.userId - The Firebase UID of the user requesting the update.
 * @param {object} context - The Firebase Functions context object.
 * @param {object} context.auth - The authenticated user information.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.updateSharedBasketItemQuantity = functions.https.onCall(
	async (data, context) => {
		// 1. Authentication Check
		if (!context.auth || !context.auth.uid) {
			console.error("updateSharedBasketItemQuantity: Authentication failed.");
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated."
			);
		}
		const requestingUserId = context.auth.uid;

		// 2. Input Validation
		const { partyId, itemId, newQuantity, userId } = data; // userId in data is the item owner for permission check

		if (
			!partyId ||
			!itemId ||
			typeof newQuantity !== "number" ||
			newQuantity <= 0 ||
			!userId
		) {
			console.error("updateSharedBasketItemQuantity: Invalid input.", data);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID, Item ID, a positive New Quantity, and User ID (for permission check) are required."
			);
		}
		if (newQuantity > 10) {
			// Example: Max quantity limit
			console.warn(
				`updateSharedBasketItemQuantity: Requested quantity ${newQuantity} exceeds limit for item ${itemId}. Clamping to 10.`
			);
			// newQuantity = 10; // Or throw an error if you prefer strict limits
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Quantity cannot exceed 10."
			);
		}

		const sharedBasketRef = db.collection("shared_baskets").doc(partyId);
		const partyRef = db.collection("parties").doc(partyId);

		try {
			return await db.runTransaction(async (transaction) => {
				// Get party details to check host status
				const partyDoc = await transaction.get(partyRef);
				if (!partyDoc.exists) {
					console.error(
						`updateSharedBasketItemQuantity: Party ${partyId} not found.`
					);
					throw new functions.https.HttpsError("not-found", "Party not found.");
				}
				const partyData = partyDoc.data();
				const isHost = partyData.hostUserId === requestingUserId;

				// Get the current shared basket
				const basketDoc = await transaction.get(sharedBasketRef);
				if (!basketDoc.exists) {
					console.error(
						`updateSharedBasketItemQuantity: Shared basket for partyId ${partyId} not found.`
					);
					throw new functions.https.HttpsError(
						"not-found",
						"Party basket not found."
					);
				}

				const basketData = basketDoc.data();
				const itemsArray = basketData.items || [];
				let itemFoundAndUpdated = false;

				const updatedItemsArray = itemsArray.map((item) => {
					if (item.id === itemId) {
						itemFoundAndUpdated = true;

						// Permission Check:
						// 1. Item must be "new" (not yet sent to kitchen).
						// 2. Either the requesting user is the host OR the requesting user is the one who ordered the item.
						if (item.status !== "new") {
							if (!isHost) {
								// Only host can modify already sent/processed items (if that's your rule)
								console.error(
									`updateSharedBasketItemQuantity: Item ${itemId} status is '${item.status}', cannot be updated by non-host ${requestingUserId}.`
								);
								throw new functions.https.HttpsError(
									"permission-denied",
									"Cannot update quantity of an item already processed, unless you are the host."
								);
							}
							console.log(
								`updateSharedBasketItemQuantity: Host ${requestingUserId} is updating item ${itemId} with status ${item.status}.`
							);
						}

						if (!isHost && item.orderedByUserId !== requestingUserId) {
							console.error(
								`updateSharedBasketItemQuantity: User ${requestingUserId} is not the host and did not order item ${itemId} (owner: ${item.orderedByUserId}).`
							);
							throw new functions.https.HttpsError(
								"permission-denied",
								"You can only update the quantity of your own items."
							);
						}

						console.log(
							`updateSharedBasketItemQuantity: Updating quantity for item ${itemId} from ${item.quantity} to ${newQuantity}.`
						);
						return {
							...item,
							quantity: newQuantity,
							updatedAt: new Date(),
						};
					}
					return item;
				});

				if (!itemFoundAndUpdated) {
					console.warn(
						`updateSharedBasketItemQuantity: Item ${itemId} not found in basket for party ${partyId}. No update performed.`
					);
					throw new functions.https.HttpsError(
						"not-found",
						`Item ${itemId} not found in the party basket.`
					);
				}

				// Update the shared basket document
				transaction.update(sharedBasketRef, {
					items: updatedItemsArray,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});

				console.log(
					`updateSharedBasketItemQuantity: Quantity for item ${itemId} successfully updated to ${newQuantity} in shared basket for party ${partyId}.`
				);
				return { success: true };
			});
		} catch (error) {
			console.error(
				`updateSharedBasketItemQuantity: Transaction error for party ${partyId}, item ${itemId}:`,
				error
			);
			if (error instanceof functions.https.HttpsError) {
				throw error; // Re-throw HttpsErrors
			}
			const errorMessage =
				error.message || "Failed to update item quantity in party basket.";
			throw new functions.https.HttpsError(
				"internal",
				errorMessage,
				error.details
			);
		}
	}
);

/**
 * Removes a specific item from a shared party basket.
 *
 * @param {object} data - The data object.
 * @param {string} data.partyId - The ID of the party.
 * @param {string} data.itemId - The unique ID of the basket item instance to remove.
 * @param {string} data.userId - The Firebase UID of the user requesting removal (for permissions).
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.removeSharedBasketItem = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			console.error("removeSharedBasketItem: Authentication failed.");
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated."
			);
		}
		const requestingUserId = context.auth.uid;

		const { partyId, itemId, userId } = data; // userId in data is the item owner for permission check

		if (!partyId || !itemId || !userId) {
			console.error(
				"removeSharedBasketItem: Invalid input - partyId, itemId, or userId (for check) missing.",
				data
			);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID, Item ID, and User ID for check are required."
			);
		}

		const sharedBasketRef = db.collection("shared_baskets").doc(partyId);
		const partyRef = db.collection("parties").doc(partyId);

		try {
			// Get party details to check host status and item ownership
			const partyDocSnap = await partyRef.get();
			if (!partyDocSnap.exists) {
				console.error(`removeSharedBasketItem: Party ${partyId} not found.`);
				throw new functions.https.HttpsError("not-found", "Party not found.");
			}
			const partyData = partyDocSnap.data();
			const isHost = partyData.hostUserId === requestingUserId;

			return await db.runTransaction(async (transaction) => {
				const basketDoc = await transaction.get(sharedBasketRef);
				if (!basketDoc.exists) {
					console.error(
						`removeSharedBasketItem: Shared basket for partyId ${partyId} not found.`
					);
					throw new functions.https.HttpsError(
						"not-found",
						"Party basket not found."
					);
				}

				const basketData = basketDoc.data();
				const items = basketData.items || [];
				let itemToRemove = null;
				let itemRemovedFromArray = false;

				const updatedItems = items.filter((item) => {
					if (item.id === itemId) {
						itemToRemove = item; // Capture the item being removed for permission checks
						itemRemovedFromArray = true;
						return false; // Exclude this item
					}
					return true; // Keep other items
				});

				if (!itemRemovedFromArray || !itemToRemove) {
					console.warn(
						`removeSharedBasketItem: Item ${itemId} not found in basket for party ${partyId}. No action taken.`
					);
					// It's often better to return success if the item is already gone,
					// as the desired state (item removed) is achieved.
					return {
						success: true,
						message: "Item not found or already removed.",
					};
				}

				// Permission Check:
				// 1. Item must be "new" (not yet sent to kitchen), unless the remover is the host.
				// 2. The requesting user must be the host OR the one who ordered the item.
				if (itemToRemove.status !== "new" && !isHost) {
					console.error(
						`removeSharedBasketItem: Item ${itemId} status is '${itemToRemove.status}', cannot be removed by non-host ${requestingUserId}.`
					);
					throw new functions.https.HttpsError(
						"permission-denied",
						"Cannot remove items already processed, unless you are the host."
					);
				}
				if (!isHost && itemToRemove.orderedByUserId !== requestingUserId) {
					console.error(
						`removeSharedBasketItem: Permission denied. User ${requestingUserId} is not the host nor the owner (${itemToRemove.orderedByUserId}) of item ${itemId}.`
					);
					throw new functions.https.HttpsError(
						"permission-denied",
						"You can only remove your own items."
					);
				}

				transaction.update(sharedBasketRef, {
					items: updatedItems,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});
				console.log(
					`removeSharedBasketItem: Item ${itemId} removed from shared basket for party ${partyId} by ${requestingUserId}.`
				);
				return { success: true };
			});
		} catch (error) {
			console.error(
				`removeSharedBasketItem: Transaction error for party ${partyId}, item ${itemId}:`,
				error
			);
			if (error instanceof functions.https.HttpsError) throw error;
			const errorMessage =
				error.message || "Failed to remove item from party basket.";
			throw new functions.https.HttpsError(
				"internal",
				errorMessage,
				error.details
			);
		}
	}
);
