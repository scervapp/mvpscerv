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

		// Fetch the restaurant's Stripe Connect account ID
		const restaurantStripeAccountId = restaurantData.stripeAccountId;
		if (!restaurantStripeAccountId) {
			// This is an important check to ensure the restaurant is properly configured for payments
			console.error(
				`Restaurant ${restaurantId} is missing its Stripe Account ID.`
			);
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This restaurant is not configured to accept payments."
			);
		}

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
			restaurantStripeAccountId: restaurantStripeAccountId,
			sharedBasketId: partyId, // <-- FIX: Explicitly add the basket ID

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

		batch.update(hostUserRef, {
			partyIds: admin.firestore.FieldValue.arrayUnion(partyId),
		});

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
 * Generates a short-lived, unique invite code for a party.
 *
 * @param {object} data - The data object.
 * @param {string} data.partyId - The ID of the party to generate a code for.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, inviteCode?: string, error?: string}>}
 */
exports.inviteToParty = functions.https.onCall(async (data, context) => {
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

	try {
		const partyDoc = await partyRef.get();
		if (!partyDoc.exists) {
			throw new functions.https.HttpsError("not-found", "Party not found.");
		}

		const partyData = partyDoc.data();
		if (partyData.hostUserId !== hostUserId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Only the party host can generate an invite code."
			);
		}

		// --- IMPROVED LOGIC IS HERE ---
		// Check if a valid, non-expired code already exists.
		if (
			partyData.inviteCode &&
			partyData.inviteCodeExpiry &&
			partyData.inviteCodeExpiry.toDate() > new Date()
		) {
			console.log(
				`inviteToParty: Returning existing valid code ${partyData.inviteCode} for party ${partyId}.`
			);
			return { success: true, inviteCode: partyData.inviteCode };
		}

		// If no valid code exists, generate a new one.
		console.log(
			`inviteToParty: No valid code found for party ${partyId}. Generating a new one.`
		);
		const generateCode = () => {
			const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I,1,O,0
			let code = "";
			for (let i = 0; i < 6; i++) {
				code += chars[Math.floor(Math.random() * chars.length)];
			}
			return code;
		};

		const inviteCode = generateCode();

		// Set an expiry time for the code (e.g., 1 hour from now).
		const expiryDate = new Date();
		expiryDate.setHours(expiryDate.getHours() + 1);
		const expiryTimestamp = admin.firestore.Timestamp.fromDate(expiryDate);

		await partyRef.update({
			inviteCode: inviteCode,
			inviteCodeExpiry: expiryTimestamp,
			lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
		});

		console.log(
			`inviteToParty: Generated new code ${inviteCode} for party ${partyId}.`
		);
		return { success: true, inviteCode: inviteCode };
	} catch (error) {
		console.error(`Error generating invite code for party ${partyId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not generate invite code.",
			error.message
		);
	}
});
// functions/partyFunctions.js (Add to the same file)

/**
 * Allows a user to join an existing party using an invite code.
 *
 * @param {object} data - The data object.
 * @param {string} data.inviteCode - The party invite code.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, partyId?: string, error?: string}>}
 */
exports.joinParty = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to join a party."
		);
	}
	const joinerUserId = context.auth.uid;
	const { inviteCode } = data;

	if (!inviteCode || typeof inviteCode !== "string") {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A valid invite code is required."
		);
	}

	const partiesRef = db.collection("parties");
	const now = admin.firestore.Timestamp.now();

	// Query for a party with the matching, non-expired invite code.
	const partyQuery = partiesRef
		.where("inviteCode", "==", inviteCode.toUpperCase())
		.where("inviteCodeExpiry", ">", now)
		.limit(1);

	try {
		const snapshot = await partyQuery.get();

		if (snapshot.empty) {
			console.warn(
				`joinParty: No active party found for invite code: ${inviteCode}`
			);
			throw new functions.https.HttpsError(
				"not-found",
				"Invalid or expired invite code. Please check the code and try again."
			);
		}

		const partyDoc = snapshot.docs[0];
		const partyId = partyDoc.id;
		const partyData = partyDoc.data();

		// Additional validations
		if (partyData.guestUserIds.includes(joinerUserId)) {
			console.log(
				`joinParty: User ${joinerUserId} is already in party ${partyId}.`
			);
			return { success: true, partyId: partyId, message: "Already in party." };
		}
		if (
			partyData.status !== "pending" &&
			partyData.status !== "AWAITING_TABLE" &&
			partyData.status !== "active"
		) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This party is no longer active or accepting new members."
			);
		}

		// Get the joining user's name
		const userDocRef = db.collection("customers").doc(joinerUserId);
		const userDoc = await userDocRef.get();
		if (!userDoc.exists) {
			throw new functions.https.HttpsError(
				"internal",
				"Could not find your user profile."
			);
		}

		const userData = userDoc.data();
		const joinerName =
			`${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
			`User ${joinerUserId.slice(-4)}`;

		const newGuestPip = {
			userId: joinerUserId,
			name: joinerName,
			joinedAt: new Date(),
		};

		const batch = db.batch();

		// Add the new user to the guest arrays
		batch.update(partyDoc.ref, {
			guestUserIds: admin.firestore.FieldValue.arrayUnion(joinerUserId),
			guestPips: admin.firestore.FieldValue.arrayUnion(newGuestPip),
			lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
		});

		// 2. Update the user's document to add the party ID
		batch.update(userDocRef, {
			partyIds: admin.firestore.FieldValue.arrayUnion(partyId),
		});

		await batch.commit();

		console.log(
			`joinParty: User ${joinerUserId} successfully joined party ${partyId}.`
		);
		// Return restaurantId so the client can update its state map correctly
		return {
			success: true,
			partyId: partyId,
			restaurantId: partyDoc.data().restaurantId,
		};
	} catch (error) {
		console.error(`Error joining party with code ${inviteCode}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not join the party.",
			error.message
		);
	}
});
// functions/partyFunctions.js (Add to the same file as create/invite/join)

/**
 * Allows a user to leave a party. Removes them from the guest lists.
 * If the host leaves, it reassigns a new host or cancels the party if empty.
 *
 * @param {object} data - The data object.
 * @param {string} data.partyId - The ID of the party to leave.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.leaveParty = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated."
		);
	}
	const leavingUserId = context.auth.uid;
	const { partyId } = data;

	if (!partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID is required."
		);
	}

	const partyRef = db.collection("parties").doc(partyId);
	const sharedBasketRef = db.collection("shared_baskets").doc(partyId);

	const userRef = db.collection("customers").doc(leavingUserId);

	try {
		return await db.runTransaction(async (transaction) => {
			const partyDoc = await transaction.get(partyRef);
			const basketDoc = await transaction.get(sharedBasketRef);

			if (!partyDoc.exists) {
				return { success: true, message: "Party already ended." };
			}

			const partyData = partyDoc.data();
			if (!partyData.guestUserIds.includes(leavingUserId)) {
				transaction.update(userRef, {
					partyIds: admin.firestore.FieldValue.arrayRemove(partyId),
				});
				return { success: true, message: "Party already ended." };
			}

			// --- THIS IS THE FIX (PART 1) ---
			// Before allowing a user to leave, check if they have sent items.
			if (basketDoc.exists) {
				const basketItems = basketDoc.data().items || [];
				const userHasSentItems = basketItems.some(
					(item) =>
						item.orderedByUserId === leavingUserId && item.status === "sent"
				);

				if (userHasSentItems) {
					// If they have sent items, block them from leaving.
					throw new functions.https.HttpsError(
						"failed-precondition",
						"You cannot leave the party after sending an order to the kitchen. Please proceed to checkout to settle your bill."
					);
				}
			}
			// --- END OF FIX ---

			// If the check passes, proceed with removing the user and their "new" items.
			if (basketDoc.exists) {
				const updatedItems = (basketDoc.data().items || []).filter(
					(item) => item.orderedByUserId !== leavingUserId
				);
				transaction.update(sharedBasketRef, {
					items: updatedItems,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});
			}

			const guestPips = (partyData.guestPips || []).filter(
				(pip) => pip.userId !== leavingUserId
			);
			const isHost = partyData.hostUserId === leavingUserId;

			if (isHost) {
				if (guestPips.length > 0) {
					const newHost = guestPips[0];
					transaction.update(partyRef, {
						hostUserId: newHost.userId,
						hostName: newHost.name,
						guestPips: guestPips,
						guestUserIds: admin.firestore.FieldValue.arrayRemove(leavingUserId),
					});
				} else {
					transaction.delete(partyRef);
					if (basketDoc.exists) transaction.delete(sharedBasketRef);
				}
			} else {
				transaction.update(partyRef, {
					guestPips: guestPips,
					guestUserIds: admin.firestore.FieldValue.arrayRemove(leavingUserId),
				});
			}

			transaction.update(userRef, {
				partyIds: admin.firestore.FieldValue.arrayRemove(partyId),
			});

			return { success: true };
		});
	} catch (error) {
		console.error(`Error leaving party ${partyId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not leave the party."
		);
	}
});

/**
 * Allows the host to cancel a party, but only if NO items have been sent to the kitchen by ANYONE.
 */
exports.cancelParty = functions.https.onCall(async (data, context) => {
	if (!context.auth.uid) {
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
			return { success: true, message: "Party already deleted." };
		}

		const partyData = partyDoc.data();
		if (partyData.hostUserId !== hostUserId) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Only the host can cancel."
			);
		}
		if (partyData.status !== "pending") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Only pending parties can be cancelled."
			);
		}

		// Check if any item has been sent
		const basketDoc = await sharedBasketRef.get();
		if (basketDoc.exists) {
			const items = basketDoc.data().items || [];
			if (items.some((item) => item.status === "sent")) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Cannot cancel after order sent to kitchen."
				);
			}
		}

		// CLEANUP: Remove partyId from real users only
		const allMemberUids = [
			partyData.hostUserId,
			...(partyData.guestUserIds || []),
		].filter(Boolean);

		const batch = db.batch();
		batch.delete(partyRef);
		if (basketDoc.exists) batch.delete(sharedBasketRef);

		// Check each user exists before updating
		for (const userId of allMemberUids) {
			const userRef = db.collection("customers").doc(userId);
			const userSnap = await userRef.get();
			if (userSnap.exists) {
				batch.update(userRef, {
					partyIds: admin.firestore.FieldValue.arrayRemove(partyId),
				});
			}
		}

		await batch.commit();
		console.log(`Party ${partyId} cancelled and partyIds cleaned up.`);
		return { success: true };
	} catch (error) {
		console.error("Error cancelling party:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError("internal", "Could not cancel party.");
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
				checkInData.customerId !== hostUserId
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

