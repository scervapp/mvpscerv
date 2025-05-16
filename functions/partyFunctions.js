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
			guestUserIds: [],
			guestPips: [],
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
	// 1. Authentication Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to cancel."
		);
	}
	const hostUserId = context.auth.uid;

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

		// 4. Validate Status and Host
		if (partyData.status !== "pending") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Cannot cancel a party that is already active or completed."
			);
		}

		if (partyData.hostUserId !== hostUserId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Only the host can cancel the party."
			);
		}

		// 5. Update Party Status to 'cancelled'
		// Alternatively, you could delete the document: await partyRef.delete();
		await partyRef.update({
			status: "cancelled",
			// Optionally clear invite codes if you used them
			// inviteCode: null,
			// inviteCodeExpiry: null,
		});

		console.log(`Host ${hostUserId} successfully cancelled party ${partyId}`);
		return { success: true };
	} catch (error) {
		console.error("Error cancelling party:", error);
		if (error.code && error.httpErrorCode) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to cancel party.",
			error.message
		);
	}
});

// functions/partyFunctions.js (Conceptual Structure)

exports.activatePartyCheckIn = functions.https.onCall(async (data, context) => {
	// 1. Auth Check
	if (!context.auth || !context.auth.uid) {
		/* ... error ... */
	}
	const hostUserId = context.auth.uid;

	// 2. Input Validation
	const { partyId, checkInDocId } = data;
	if (!partyId || !checkInDocId) {
		/* ... error ... */
	}

	const partyRef = db.collection("parties").doc(partyId);
	const checkInRef = db.collection("checkIns").doc(checkInDocId);

	try {
		// --- THIS IS WHERE THE "not-found" LIKELY HAPPENS ---
		// Use a transaction to ensure atomicity
		await db.runTransaction(async (transaction) => {
			// --- Add Logging Here ---
			console.log(`activatePartyCheckIn: Reading party ${partyId}`);
			const partySnap = await transaction.get(partyRef);
			console.log(`activatePartyCheckIn: Reading checkIn ${checkInDocId}`);
			const checkInSnap = await transaction.get(checkInRef);
			// --- End Logging ---

			if (!partySnap.exists) {
				// <<< Could be this
				console.error(`activatePartyCheckIn: Party ${partyId} not found!`);
				throw new functions.https.HttpsError(
					"not-found",
					`Party document ${partyId} not found.`
				);
			}
			if (!checkInSnap.exists) {
				// <<< Or this
				console.error(
					`activatePartyCheckIn: CheckIn ${checkInDocId} not found!`
				);
				throw new functions.https.HttpsError(
					"not-found",
					`CheckIn document ${checkInDocId} not found.`
				);
			}

			const partyData = partySnap.data();

			// 3. Verify Host and Status
			if (partyData.hostUserId !== hostUserId) {
				/* ... permission error ... */
			}
			if (partyData.status !== "pending") {
				/* ... precondition error ... */
			}

			// 4. Update Documents
			console.log(`activatePartyCheckIn: Updating party ${partyId} to active`);
			transaction.update(partyRef, {
				status: "active",
				checkInId: checkInDocId, // Link check-in to party
			});
			console.log(
				`activatePartyCheckIn: Updating checkIn ${checkInDocId} with partyId`
			);
			transaction.update(checkInRef, {
				partyId: partyId, // Link party to check-in
			});
		});
		// --- Transaction End ---

		// 5. Batch update basket items (outside transaction)
		console.log(
			`activatePartyCheckIn: Querying basket items for party ${partyId}`
		);
		const basketQuery = db
			.collection("baskets")
			.where("partyId", "==", partyId)
			.where("sentToChefQ", "==", false); // Or based on userId? Check logic
		const basketSnapshot = await basketQuery.get();
		if (!basketSnapshot.empty) {
			const batch = db.batch();
			basketSnapshot.docs.forEach((doc) => {
				console.log(
					`activatePartyCheckIn: Adding checkInId ${checkInDocId} to basket item ${doc.id}`
				);
				batch.update(doc.ref, { checkInId: checkInDocId });
			});
			await batch.commit();
			console.log(
				`activatePartyCheckIn: Updated ${basketSnapshot.size} basket items.`
			);
		} else {
			console.log(
				`activatePartyCheckIn: No pending basket items found for party ${partyId}.`
			);
		}

		console.log(
			`Party ${partyId} activated successfully with checkIn ${checkInDocId}.`
		);
		return { success: true };
	} catch (error) {
		console.error(`Error activating party ${partyId}:`, error);
		if (error.code && error.httpErrorCode) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to activate party.",
			error.message
		);
	}
});

/**
 * Allows the host to directly add a 'local' (non-user) PIP to a pending or active party.
 */
exports.addLocalPipToParty = functions.https.onCall(async (data, context) => {
	// 1. Authentication Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	const hostUserId = context.auth.uid;

	// 2. Input Validation
	const { partyId, localPipId, localPipName } = data;
	if (!partyId || !localPipId || !localPipName) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID, Local PIP ID, and Local PIP Name are required."
		);
	}

	const partyRef = db.collection("parties").doc(partyId);

	try {
		// 3. Get Party and Verify Host & Status
		const partySnap = await partyRef.get();

		if (!partySnap.exists) {
			throw new functions.https.HttpsError("not-found", "Party not found.");
		}
		const partyData = partySnap.data();

		// Allow adding if pending OR active
		if (partyData.status !== "pending" && partyData.status !== "active") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Can only add guests to pending or active parties."
			);
		}

		if (partyData.hostUserId !== hostUserId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Only the host can add guests directly."
			);
		}

		// 4. Check if Local PIP already added
		if (partyData.guestUserIds.includes(localPipId)) {
			console.log(`Local PIP ${localPipId} is already in party ${partyId}.`);
			return { success: true, message: "Local PIP already in party." };
		}

		// 5. Add Local PIP to Party (Atomically)
		await partyRef.update({
			guestUserIds: admin.firestore.FieldValue.arrayUnion(localPipId),
			guestNames: admin.firestore.FieldValue.arrayUnion({
				userId: localPipId, // Use the placeholder ID
				name: localPipName, // Use the placeholder name
				isLocal: true, // Add a flag to distinguish in guest list if needed
			}),
		});

		console.log(
			`Local PIP ${localPipId} (${localPipName}) added to party ${partyId}`
		);
		return { success: true };
	} catch (error) {
		console.error("Error adding local PIP to party:", error);
		if (error.code && error.httpErrorCode) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"Failed to add local PIP.",
			error.message
		);
	}
});
