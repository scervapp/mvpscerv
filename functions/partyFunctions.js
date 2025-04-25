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
	const { restaurantId, restaurantName } = data;
	if (!restaurantId || !restaurantName) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID and Name are required."
		);
	}

	try {
		// 3. Fetch Host's Name (Denormalization)
		const hostUserRef = db.collection("customers").doc(hostUserId);
		const hostUserSnap = await hostUserRef.get();
		if (!hostUserSnap.exists) {
			// Should not happen for authenticated user, but good check
			throw new functions.https.HttpsError(
				"not-found",
				"Host user data not found."
			);
		}
		// Adjust field names if your customer doc structure is different
		const hostName =
			`${hostUserSnap.data().firstName || ""} ${
				hostUserSnap.data().lastName || ""
			}`.trim() || "Host";

		// 4. Create the Party Document
		const partyRef = db.collection("parties").doc(); // Auto-generate ID
		await partyRef.set({
			restaurantId: restaurantId,
			restaurantName: restaurantName,
			hostUserId: hostUserId,
			hostName: hostName,
			guestUserIds: [],
			guestNames: [],
			status: "pending",
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			checkInId: null,
			inviteCode: null,
			inviteCodeExpiry: null,
		});

		console.log(
			`Party created successfully with ID: ${partyRef.id} for restaurant ${restaurantId}`
		);
		return { success: true, partyId: partyRef.id };
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

const { Timestamp } = require("firebase-admin/firestore"); // Import Timestamp

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

		if (partyData.hostUserId !== hostUserId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Only the host can invite guests."
			);
		}
		if (partyData.status !== "pending") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Can only invite to pending parties."
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
		if (partyData.status !== "pending") {
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
			`User ${guestUserId} successfully joined party ${actualPartyId}`
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
