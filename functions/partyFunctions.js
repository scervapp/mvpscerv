// functions/partyFunctions.js (Create this new file)

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
const { Translate } = require("@google-cloud/translate").v2;
const { assertRestaurantPermission } = require("./restaurantAccess");

const translate = new Translate();

exports.translateInstruction = functions.https.onCall(async (data, context) => {
	// Ensure the user is authenticated
	if (!context.auth) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be logged in to translate text.",
		);
	}

	const { text } = data;

	if (!text || text.trim() === "") {
		return { en: "", es: "" };
	}

	try {
		// Translate the text into both English and Spanish
		// The API automatically detects the source language!
		const [englishTranslation] = await translate.translate(text, "en");
		const [spanishTranslation] = await translate.translate(text, "es");

		return {
			original: text,
			en: englishTranslation,
			es: spanishTranslation,
		};
	} catch (error) {
		console.error("Translation Error:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Failed to translate instruction.",
		);
	}
});

/**
 * Creates a new 'pending' party document initiated by a host for a specific restaurant.
 *
 *
 */

const generateCode = () => {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I,1,O,0
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
};

const generateUniqueInviteCode = async () => {
	for (let attempts = 0; attempts < 8; attempts++) {
		const candidate = generateCode();
		const existing = await db
			.collection("parties")
			.where("inviteCode", "==", candidate)
			.limit(1)
			.get();

		if (existing.empty) {
			return candidate;
		}
	}

	throw new functions.https.HttpsError(
		"internal",
		"Could not generate a unique invite code.",
	);
};

exports.createParty = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to create a party.",
		);
	}

	const hostUserId = context.auth.uid;

	const {
		restaurantId,
		orderMode = "dineIn",
		fulfillmentType,
		joinable,
	} = data || {};

	if (
		!restaurantId ||
		typeof restaurantId !== "string" ||
		restaurantId.trim() === ""
	) {
		console.error(
			"CreateParty: Invalid input - restaurantId missing or not a valid string.",
			data,
		);
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID is required and must be a non-empty string.",
		);
	}

	const normalizedOrderMode = orderMode === "pickup" ? "pickup" : "dineIn";

	const resolvedFulfillmentType =
		fulfillmentType ||
		(normalizedOrderMode === "pickup" ? "hotel_pickup" : "table");

	const resolvedJoinable =
		typeof joinable === "boolean" ? joinable : normalizedOrderMode !== "pickup";

	try {
		const hostUserRef = db.collection("customers").doc(hostUserId);
		const restaurantDocRef = db.collection("restaurants").doc(restaurantId);

		console.log(
			`CreateParty: Fetching details for host ${hostUserId} and restaurant ${restaurantId}`,
		);

		const [hostUserSnap, restaurantSnap] = await Promise.all([
			hostUserRef.get(),
			restaurantDocRef.get(),
		]);

		if (!hostUserSnap.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Host user data not found.",
			);
		}

		if (!restaurantSnap.exists) {
			console.error(
				`CreateParty: Restaurant data not found for ID: ${restaurantId}`,
			);
			throw new functions.https.HttpsError(
				"not-found",
				"Restaurant data not found.",
			);
		}

		const hostData = hostUserSnap.data();
		const hostName =
			`${hostData.firstName || ""} ${hostData.lastName || ""}`.trim() || "Host";

		const restaurantData = restaurantSnap.data();

		const restaurantName =
			restaurantData.restaurantName || restaurantData.name || "Restaurant";

		const restaurantTaxRate =
			typeof restaurantData.taxRate === "number" &&
			!isNaN(restaurantData.taxRate)
				? restaurantData.taxRate
				: 0;

		const restaurantStripeAccountId = restaurantData.stripeAccountId || null;

		const canAcceptPayments = !!restaurantStripeAccountId;

		if (typeof restaurantName !== "string" || restaurantName.trim() === "") {
			console.error(
				`CreateParty: Restaurant name missing or invalid for restaurant ${restaurantId}.`,
			);
			throw new functions.https.HttpsError(
				"internal",
				"Restaurant configuration error (name).",
			);
		}

		console.log(
			`CreateParty: Host: ${hostName}, Restaurant: ${restaurantName}, Tax Rate: ${restaurantTaxRate}, OrderMode: ${normalizedOrderMode}`,
		);

		const partyId = db.collection("parties").doc().id;
		const partyRef = db.collection("parties").doc(partyId);
		const sharedBasketRef = db.collection("shared_baskets").doc(partyId);

		const now = admin.firestore.FieldValue.serverTimestamp();

		const partyDataToSet = {
			id: partyId,
			restaurantId,
			restaurantName,
			restaurantTaxRate,
			restaurantStripeAccountId,
			restaurantCanAcceptPayments: canAcceptPayments,
			sharedBasketId: partyId,

			orderMode: normalizedOrderMode,
			fulfillmentType: resolvedFulfillmentType,
			joinable: resolvedJoinable,
			table: null,

			hostUserId,
			hostName,
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
			status: normalizedOrderMode === "pickup" ? "active" : "pending",
			createdAt: now,
			checkInId: null,
			inviteCode: null,
			inviteCodeExpiry: null,
		};

		const sharedBasketDataToSet = {
			partyId,
			restaurantId,
			orderMode: normalizedOrderMode,
			fulfillmentType: resolvedFulfillmentType,
			items: [],
			lastUpdated: now,
			createdAt: now,
		};

		const batch = db.batch();
		batch.set(partyRef, partyDataToSet);
		batch.set(sharedBasketRef, sharedBasketDataToSet);
		batch.update(hostUserRef, {
			partyIds: admin.firestore.FieldValue.arrayUnion(partyId),
		});

		await batch.commit();

		console.log(
			`Party ${partyId} created successfully for restaurant ${restaurantId} by host ${hostUserId}`,
		);

		return {
			success: true,
			partyId,
			orderMode: normalizedOrderMode,
		};
	} catch (error) {
		console.error("Error creating party:", error);

		if (error.code && error.httpErrorCode) {
			throw error;
		}

		throw new functions.https.HttpsError(
			"internal",
			"Failed to create party.",
			error.message,
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
			"User must be authenticated.",
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId, inviteeUserId = null } = data || {};

	if (!partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID is required.",
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
				"Only the party host can generate an invite code.",
			);
		}

		if (inviteeUserId && inviteeUserId === hostUserId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"You cannot invite yourself to your own party.",
			);
		}

		if (inviteeUserId) {
			const inviteeSnap = await db.collection("customers").doc(inviteeUserId).get();
			if (!inviteeSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Invitee user was not found.",
				);
			}
		}

		let resolvedInviteCode = partyData.inviteCode || null;
		let resolvedExpiryTimestamp = partyData.inviteCodeExpiry || null;

		if (
			!resolvedInviteCode ||
			!resolvedExpiryTimestamp ||
			resolvedExpiryTimestamp.toDate() <= new Date()
		) {
			console.log(
				`inviteToParty: No valid code found for party ${partyId}. Generating a new one.`,
			);

			const expiryDate = new Date();
			expiryDate.setHours(expiryDate.getHours() + 24);
			resolvedInviteCode = await generateUniqueInviteCode();
			resolvedExpiryTimestamp = admin.firestore.Timestamp.fromDate(expiryDate);

			await partyRef.update({
				inviteCode: resolvedInviteCode,
				inviteCodeExpiry: resolvedExpiryTimestamp,
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
			});
		}

		let notificationId = null;
		if (inviteeUserId) {
			const notificationRef = await db.collection("notifications").add({
				type: "partyInvite",
				recipientUserId: inviteeUserId,
				senderUserId: hostUserId,
				partyId,
				inviteCode: resolvedInviteCode,
				hostName: partyData.hostName || "Someone",
				restaurantId: partyData.restaurantId || null,
				restaurantName: partyData.restaurantName || "a restaurant",
				isRead: false,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				expiresAt: resolvedExpiryTimestamp,
			});
			notificationId = notificationRef.id;
		}

		console.log(
			`inviteToParty: Returned code ${resolvedInviteCode} for party ${partyId}.`,
		);
		return {
			success: true,
			inviteCode: resolvedInviteCode,
			notificationId,
		};
	} catch (error) {
		console.error(`Error generating invite code for party ${partyId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not generate invite code.",
			error.message,
		);
	}
});
// functions/partyFunctions.js (Add to the same file)

/**
 * Allows a user to join an existing party using a partyId or invite code.
 *
 * @param {object} data - The data object.
 * @param {string} [data.inviteCode] - The party invite code.
 * @param {string} [data.partyId] - The direct party ID (from a QR scan).
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, partyId?: string, error?: string}>}
 */
exports.joinParty = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to join a party.",
		);
	}
	const joinerUserId = context.auth.uid;
	const { inviteCode, partyId } = data || {};

	// Must have at least one of these to proceed
	if (!inviteCode && !partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A valid invite code or party ID is required.",
		);
	}

	const partiesRef = db.collection("parties");
	const now = admin.firestore.Timestamp.now();
	let partyDoc;

	try {
		// ==============================================================
		// 1. DIRECT LOOKUP (QR SCAN BYPASS)
		// ==============================================================
		if (partyId) {
			partyDoc = await partiesRef.doc(partyId).get();
			if (!partyDoc.exists) {
				console.warn(`joinParty: No party found for partyId: ${partyId}`);
				throw new functions.https.HttpsError(
					"not-found",
					"Invalid party. Please try scanning again.",
				);
			}
		}
		// ==============================================================
		// 2. INVITE CODE LOOKUP (MANUAL ENTRY)
		// ==============================================================
		else if (inviteCode) {
			const partyQuery = await partiesRef
				.where("inviteCode", "==", inviteCode.toUpperCase())
				.limit(1)
				.get();

			if (partyQuery.empty) {
				console.warn(
					`joinParty: No active party found for invite code: ${inviteCode}`,
				);
				throw new functions.https.HttpsError(
					"not-found",
					"Invalid or expired invite code. Please check the code and try again.",
				);
			}
			partyDoc = partyQuery.docs[0];
		}

		const resolvedPartyId = partyDoc.id;
		const partyData = partyDoc.data();

		if (
			inviteCode &&
			partyData.inviteCodeExpiry &&
			partyData.inviteCodeExpiry.toMillis() <= now.toMillis()
		) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This invite code has expired. Please ask the host for a new invite.",
			);
		}

		// Additional validations
		if (
			partyData.guestUserIds &&
			partyData.guestUserIds.includes(joinerUserId)
		) {
			console.log(
				`joinParty: User ${joinerUserId} is already in party ${resolvedPartyId}.`,
			);
			return {
				success: true,
				partyId: resolvedPartyId,
				message: "Already in party.",
			};
		}

		if (
			partyData.status !== "pending" &&
			partyData.status !== "AWAITING_TABLE" &&
			partyData.status !== "active"
		) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This party is no longer active or accepting new members.",
			);
		}

		// Get the joining user's name
		const userDocRef = db.collection("customers").doc(joinerUserId);
		const userDoc = await userDocRef.get();
		if (!userDoc.exists) {
			throw new functions.https.HttpsError(
				"internal",
				"Could not find your user profile.",
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

		// Update the user's document to add the party ID
		batch.update(userDocRef, {
			partyIds: admin.firestore.FieldValue.arrayUnion(resolvedPartyId),
		});

		await batch.commit();

		console.log(
			`joinParty: User ${joinerUserId} successfully joined party ${resolvedPartyId}.`,
		);

		// Return restaurantId so the client can update its state map correctly
		return {
			success: true,
			partyId: resolvedPartyId,
			restaurantId: partyData.restaurantId,
		};
	} catch (error) {
		console.error(`Error joining party:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not join the party.",
			error.message,
		);
	}
});
// functions/partyFunctions.js (Add to the same file as create/invite/join)

/**
 * Allows a user to leave a party. Removes them from the guest lists.
 * If the host leaves, it reassigns a new host or cancels the party if empty.
 */
exports.leaveParty = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated.",
		);
	}
	const leavingUserId = context.auth.uid;
	const { partyId } = data;
	const shouldPreserveUnsentItems = data.preserveUnsentItems === true;

	if (!partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID is required.",
		);
	}

	const partyRef = db.collection("parties").doc(partyId);
	const sharedBasketRef = db.collection("shared_baskets").doc(partyId);
	const userRef = db.collection("customers").doc(leavingUserId);

	try {
		let preservedPartyId = null;
		let preservedRestaurantId = null;
		let preservedOrderMode = null;

		await db.runTransaction(async (transaction) => {
			const partyDoc = await transaction.get(partyRef);
			const basketDoc = await transaction.get(sharedBasketRef);
			const userDoc = await transaction.get(userRef);

			// 1. If the party is already gone, just clean up the user doc and exit.
			if (!partyDoc.exists) {
				transaction.update(userRef, {
					partyIds: admin.firestore.FieldValue.arrayRemove(partyId),
				});
				return; // 🚨 Correct way to early-exit a transaction
			}

			const partyData = partyDoc.data();
			const basketItems = basketDoc.exists ? basketDoc.data().items || [] : [];
			preservedRestaurantId = partyData.restaurantId || null;
			preservedOrderMode =
				partyData.orderMode === "pickup" ? "pickup" : "dineIn";

			// 2. If the user is already not in the party, just clean up the user doc and exit.
			if (
				!partyData.guestUserIds ||
				!partyData.guestUserIds.includes(leavingUserId)
			) {
				transaction.update(userRef, {
					partyIds: admin.firestore.FieldValue.arrayRemove(partyId),
				});
				return;
			}

			// 3. Check for SENT items. Block the leave if they exist.
			if (basketDoc.exists) {
				const userHasSentItems = basketItems.some(
					(item) =>
						// Check both common ID fields just to be safe
						(item.orderedByUserId === leavingUserId ||
							item.userId === leavingUserId) &&
						(item.status === "sent" ||
							item.status === "processing" ||
							item.status === "completed"),
				);

				if (userHasSentItems) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						"You cannot leave the party after sending an order to the kitchen. Please proceed to checkout to settle your bill.",
					);
				}
			}

			const userUnsentItems = basketItems.filter(
				(item) =>
					(item.orderedByUserId === leavingUserId ||
						item.userId === leavingUserId) &&
					(!item.status || item.status === "new" || item.status === "draft"),
			);

			// Normal leave should fully remove the user from the party. A future
			// "keep my cart" flow can opt in by passing preserveUnsentItems.
			if (shouldPreserveUnsentItems && userUnsentItems.length > 0) {
				const preservedPartyRef = db.collection("parties").doc();
				const preservedBasketRef = db
					.collection("shared_baskets")
					.doc(preservedPartyRef.id);
				const userData = userDoc.exists ? userDoc.data() || {} : {};
				const guestPip = (partyData.guestPips || []).find(
					(pip) => pip.userId === leavingUserId,
				);
				const hostName =
					guestPip.name ||
					userData.fullName ||
					`${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
					"Guest";
				const timestamp = admin.firestore.FieldValue.serverTimestamp();
				const orderMode =
					partyData.orderMode === "pickup" ? "pickup" : "dineIn";

				preservedPartyId = preservedPartyRef.id;

				transaction.set(preservedPartyRef, {
					id: preservedPartyRef.id,
					restaurantId: partyData.restaurantId,
					restaurantName: partyData.restaurantName || "Restaurant",
					restaurantTaxRate: partyData.restaurantTaxRate || 0,
					restaurantStripeAccountId:
						partyData.restaurantStripeAccountId || null,
					restaurantCanAcceptPayments:
						partyData.restaurantCanAcceptPayments || false,
					sharedBasketId: preservedPartyRef.id,
					orderMode,
					fulfillmentType:
						partyData.fulfillmentType ||
						(orderMode === "pickup" ? "hotel_pickup" : "table"),
					joinable: orderMode !== "pickup",
					table: null,
					hostUserId: leavingUserId,
					hostName,
					guestUserIds: [leavingUserId],
					guestPips: [
						{
							userId: leavingUserId,
							name: hostName,
							joinedAt: new Date(),
							isLocal: true,
							paymentStatus: "pending",
						},
					],
					guestNames: [],
					status: orderMode === "pickup" ? "active" : "pending",
					createdAt: timestamp,
					lastUpdated: timestamp,
					checkInId: null,
					inviteCode: null,
					inviteCodeExpiry: null,
					preservedFromPartyId: partyId,
				});

				transaction.set(preservedBasketRef, {
					partyId: preservedPartyRef.id,
					restaurantId: partyData.restaurantId,
					orderMode,
					fulfillmentType:
						partyData.fulfillmentType ||
						(orderMode === "pickup" ? "hotel_pickup" : "table"),
					items: userUnsentItems.map((item) => ({
						...item,
						status: "new",
						ticketId: null,
						sentAt: null,
						preservedFromPartyId: partyId,
					})),
					createdAt: timestamp,
					lastUpdated: timestamp,
				});
			}

			// Remove any new/draft items this user had in the shared party basket
			if (basketDoc.exists) {
				const updatedItems = basketItems.filter(
					(item) =>
						item.orderedByUserId !== leavingUserId &&
						item.userId !== leavingUserId,
				);
				transaction.update(sharedBasketRef, {
					items: updatedItems,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});
			}

			// 5. Remove the user from the guest list
			const guestPips = (partyData.guestPips || []).filter(
				(pip) => pip.userId !== leavingUserId,
			);

			const isHost = partyData.hostUserId === leavingUserId;

			if (isHost) {
				if (guestPips.length > 0) {
					// Promote the next user in line to host
					const newHost = guestPips[0];
					transaction.update(partyRef, {
						hostUserId: newHost.userId,
						hostName: newHost.name,
						guestPips: guestPips,
						guestUserIds: admin.firestore.FieldValue.arrayRemove(leavingUserId),
					});
				} else {
					// Everyone is gone. Delete the party entirely.
					transaction.delete(partyRef);
					if (basketDoc.exists) transaction.delete(sharedBasketRef);
				}
			} else {
				// Just remove the guest
				transaction.update(partyRef, {
					guestPips: guestPips,
					guestUserIds: admin.firestore.FieldValue.arrayRemove(leavingUserId),
				});
			}

			// 6. Finally, remove the party ID from the user's profile
			const existingPartyIds = userDoc.exists
				? userDoc.data().partyIds || []
				: [];
			if (preservedPartyId) {
				transaction.update(userRef, {
					partyIds: [
						...new Set([
							...existingPartyIds.filter((id) => id !== partyId),
							preservedPartyId,
						]),
					],
				});
			} else {
				transaction.update(userRef, {
					partyIds: admin.firestore.FieldValue.arrayRemove(partyId),
				});
			}
		});

		// Transaction completed successfully!
		return {
			success: true,
			preservedPartyId,
			restaurantId: preservedRestaurantId,
			orderMode: preservedOrderMode,
		};
	} catch (error) {
		console.error(`Error leaving party ${partyId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;

		throw new functions.https.HttpsError(
			"internal",
			error.message || "Could not leave the party.",
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
			"User must be authenticated.",
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId } = data;
	if (!partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID is required.",
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
				"Only the host can cancel.",
			);
		}
		if (partyData.status !== "pending") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Only pending parties can be cancelled.",
			);
		}

		// Check if any item has been sent
		const basketDoc = await sharedBasketRef.get();
		if (basketDoc.exists) {
			const items = basketDoc.data().items || [];
			if (items.some((item) => item.status === "sent")) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Cannot cancel after order sent to kitchen.",
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
			"User must be authenticated.",
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId, checkInId } = data;

	if (!partyId || !checkInId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID and Check-In ID are required.",
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
					"Check-in record not found.",
				);
			}

			const partyData = partyDoc.data();
			const checkInData = checkInDoc.data();

			if (partyData.hostUserId !== hostUserId) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"Only the party host can activate the check-in link.",
				);
			}
			if (partyData.status !== "pending") {
				const partyAlreadyLinkedToCheckIn =
					partyData.checkInId === checkInId ||
					partyData.activeCheckInId === checkInId;
				const checkInAlreadyAccepted = checkInData.status === "ACCEPTED";
				const partyAlreadyActive = ["AWAITING_TABLE", "active"].includes(
					partyData.status,
				);

				if (
					partyAlreadyLinkedToCheckIn ||
					(partyAlreadyActive && checkInAlreadyAccepted)
				) {
					return {
						success: true,
						alreadyActivated: true,
						message: "Party check-in is already active.",
					};
				}

				throw new functions.https.HttpsError(
					"failed-precondition",
					"Party is not in a pending state for check-in activation.",
				);
			}
			if (
				checkInData.associatedPartyId !== partyId ||
				checkInData.customerId !== hostUserId
			) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Check-in record is not correctly associated with this party or host.",
				);
			}
			if (checkInData.status !== "REQUESTED") {
				// Ensure the check-in itself is in the right state
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Linked check-in is not in a 'REQUESTED' state.",
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
			error,
		);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not activate party check-in.",
			error.message,
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
			"User must be authenticated.",
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId, checkInId } = data;

	if (!partyId || !checkInId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID and Check-In ID are required.",
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
					"Party or Check-in record not found.",
				);
			}

			const partyData = partyDoc.data();

			// --- Validation Checks ---
			// 1. Check if the requester is the host.
			if (partyData.hostUserId !== hostUserId) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"Only the party host can cancel the check-in request.",
				);
			}
			// 2. Check if the party is in the correct state to be cancelled.
			if (partyData.hostUserId !== hostUserId)
				throw new functions.https.HttpsError(
					"permission-denied",
					"Only host can cancel.",
				);
			if (partyData.status !== "AWAITING_TABLE")
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Party is not awaiting table confirmation.",
				);
			if (partyData.activeCheckInId !== checkInId)
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Check-in ID mismatch.",
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
				`cancelPartyCheckIn: Successfully reverted party ${partyId} and deleted check-in ${checkInId}.`,
			);
			return { success: true };
		});
	} catch (error) {
		console.error(
			`Error cancelling party check-in for party ${partyId}:`,
			error,
		);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not cancel party check-in.",
			error.message,
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
			"User must be authenticated.",
		);
	}
	const hostUserId = context.auth.uid;
	const { partyId, pipsToAdd } = data;

	if (!partyId || !Array.isArray(pipsToAdd) || pipsToAdd.length === 0) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID and a non-empty array of PIPs to add are required.",
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
				"Only the party host can add members.",
			);
		}

		// Prepare new guest objects with timestamps
		const newGuestPips = pipsToAdd.map((pip) => ({
			localPipId: pip.id, // Use a distinct key for non-user guests
			userId: null, // No Firebase user ID for local PIPs
			name: pip.name,
			joinedAt: new Date(), // Use new Date() for array elements
		}));

		const newLocalPipIds = pipsToAdd.map((pip) => pip.id).filter(Boolean);

		await partyRef.update({
			// Use FieldValue.arrayUnion to atomically add elements to the arrays
			guestPips: admin.firestore.FieldValue.arrayUnion(...newGuestPips),
			localPipIds: admin.firestore.FieldValue.arrayUnion(...newLocalPipIds),
			lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
		});

		console.log(
			`addLocalPIPsToParty: Successfully added ${pipsToAdd.length} members to party ${partyId}.`,
		);
		return { success: true };
	} catch (error) {
		console.error(`Error adding members to party ${partyId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not add members to the party.",
			error.message,
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
				"User must be authenticated.",
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
				"Party ID, Item ID, a positive New Quantity, and User ID (for permission check) are required.",
			);
		}
		if (newQuantity > 10) {
			// Example: Max quantity limit
			console.warn(
				`updateSharedBasketItemQuantity: Requested quantity ${newQuantity} exceeds limit for item ${itemId}. Clamping to 10.`,
			);
			// newQuantity = 10; // Or throw an error if you prefer strict limits
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Quantity cannot exceed 10.",
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
						`updateSharedBasketItemQuantity: Party ${partyId} not found.`,
					);
					throw new functions.https.HttpsError("not-found", "Party not found.");
				}
				const partyData = partyDoc.data();
				const isHost = partyData.hostUserId === requestingUserId;

				// Get the current shared basket
				const basketDoc = await transaction.get(sharedBasketRef);
				if (!basketDoc.exists) {
					console.error(
						`updateSharedBasketItemQuantity: Shared basket for partyId ${partyId} not found.`,
					);
					throw new functions.https.HttpsError(
						"not-found",
						"Party basket not found.",
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
									`updateSharedBasketItemQuantity: Item ${itemId} status is '${item.status}', cannot be updated by non-host ${requestingUserId}.`,
								);
								throw new functions.https.HttpsError(
									"permission-denied",
									"Cannot update quantity of an item already processed, unless you are the host.",
								);
							}
							console.log(
								`updateSharedBasketItemQuantity: Host ${requestingUserId} is updating item ${itemId} with status ${item.status}.`,
							);
						}

						if (!isHost && item.orderedByUserId !== requestingUserId) {
							console.error(
								`updateSharedBasketItemQuantity: User ${requestingUserId} is not the host and did not order item ${itemId} (owner: ${item.orderedByUserId}).`,
							);
							throw new functions.https.HttpsError(
								"permission-denied",
								"You can only update the quantity of your own items.",
							);
						}

						console.log(
							`updateSharedBasketItemQuantity: Updating quantity for item ${itemId} from ${item.quantity} to ${newQuantity}.`,
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
						`updateSharedBasketItemQuantity: Item ${itemId} not found in basket for party ${partyId}. No update performed.`,
					);
					throw new functions.https.HttpsError(
						"not-found",
						`Item ${itemId} not found in the party basket.`,
					);
				}

				// Update the shared basket document
				transaction.update(sharedBasketRef, {
					items: updatedItemsArray,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});

				console.log(
					`updateSharedBasketItemQuantity: Quantity for item ${itemId} successfully updated to ${newQuantity} in shared basket for party ${partyId}.`,
				);
				return { success: true };
			});
		} catch (error) {
			console.error(
				`updateSharedBasketItemQuantity: Transaction error for party ${partyId}, item ${itemId}:`,
				error,
			);
			if (error instanceof functions.https.HttpsError) {
				throw error; // Re-throw HttpsErrors
			}
			const errorMessage =
				error.message || "Failed to update item quantity in party basket.";
			throw new functions.https.HttpsError(
				"internal",
				errorMessage,
				error.details,
			);
		}
	},
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
				"User must be authenticated.",
			);
		}
		const requestingUserId = context.auth.uid;

		const { partyId, itemId, userId } = data; // userId in data is the item owner for permission check

		if (!partyId || !itemId || !userId) {
			console.error(
				"removeSharedBasketItem: Invalid input - partyId, itemId, or userId (for check) missing.",
				data,
			);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID, Item ID, and User ID for check are required.",
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
						`removeSharedBasketItem: Shared basket for partyId ${partyId} not found.`,
					);
					throw new functions.https.HttpsError(
						"not-found",
						"Party basket not found.",
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
						`removeSharedBasketItem: Item ${itemId} not found in basket for party ${partyId}. No action taken.`,
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
						`removeSharedBasketItem: Item ${itemId} status is '${itemToRemove.status}', cannot be removed by non-host ${requestingUserId}.`,
					);
					throw new functions.https.HttpsError(
						"permission-denied",
						"Cannot remove items already processed, unless you are the host.",
					);
				}
				if (!isHost && itemToRemove.orderedByUserId !== requestingUserId) {
					console.error(
						`removeSharedBasketItem: Permission denied. User ${requestingUserId} is not the host nor the owner (${itemToRemove.orderedByUserId}) of item ${itemId}.`,
					);
					throw new functions.https.HttpsError(
						"permission-denied",
						"You can only remove your own items.",
					);
				}

				transaction.update(sharedBasketRef, {
					items: updatedItems,
					lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});
				console.log(
					`removeSharedBasketItem: Item ${itemId} removed from shared basket for party ${partyId} by ${requestingUserId}.`,
				);
				return { success: true };
			});
		} catch (error) {
			console.error(
				`removeSharedBasketItem: Transaction error for party ${partyId}, item ${itemId}:`,
				error,
			);
			if (error instanceof functions.https.HttpsError) throw error;
			const errorMessage =
				error.message || "Failed to remove item from party basket.";
			throw new functions.https.HttpsError(
				"internal",
				errorMessage,
				error.details,
			);
		}
	},
);

exports.createPartySession = functions.https.onCall(async (data, context) => {
	// 1. Auth Check
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated to start a session.",
		);
	}

	const uid = context.auth.uid;
	// 🚨 ADDED guestName here
	const {
		restaurantId,
		tableId,
		existingPartyId,
		isManualSeat,
		guestName,
		staffId,
		staffName,
		staffRole,
		staffJobTitle,
	} = data;

	// 2. Input Validation
	if (!restaurantId || !tableId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required data (restaurantId or tableId).",
		);
	}

	const restaurantRef = db.collection("restaurants").doc(restaurantId);
	const tableRef = restaurantRef.collection("tables").doc(tableId);

	// Only reference the customer doc if it's NOT a manual seat
	const customerRef = !isManualSeat
		? db.collection("customers").doc(uid)
		: null;

	// Determine if we use the existing document or a new one
	const partyRef = existingPartyId
		? db.collection("parties").doc(existingPartyId)
		: db.collection("parties").doc();

	const checkInRef = db.collection("checkIns").doc();
	const sharedBasketRef = db.collection("shared_baskets").doc(partyRef.id);
	const newInviteCode = generateCode(); // Ensure this helper function exists in your scope

	try {
		let assignedServer = { id: "unassigned", name: "Self-Seated" };
		const normalizedStaffRole = String(staffRole || "")
			.trim()
			.toLowerCase();
		const normalizedStaffJobTitle = String(staffJobTitle || "")
			.trim()
			.toLowerCase();

		if (isManualSeat) {
			const staffMember = await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: ["server"],
				action: "seat tables",
			});
			assignedServer = {
				id: staffMember.id || staffId,
				name: staffName || staffMember.name || "Server",
			};
		} else if (
			staffId &&
			(normalizedStaffRole === "owner" ||
				normalizedStaffRole === "manager" ||
				(normalizedStaffRole === "worker" &&
					normalizedStaffJobTitle === "server"))
		) {
			const staffMember = await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: ["server"],
				action: "seat tables",
			});
			assignedServer = {
				id: staffMember.id || staffId,
				name: staffName || staffMember.name || "Server",
			};
		}

		return await db.runTransaction(async (transaction) => {
			// A. Fetch all required data
			const [tableDoc, restaurantDoc, customerDoc] = await Promise.all([
				transaction.get(tableRef),
				transaction.get(restaurantRef),
				customerRef
					? transaction.get(customerRef)
					: Promise.resolve({ exists: false, data: () => ({}) }),
			]);

			if (!tableDoc.exists) {
				throw new functions.https.HttpsError("not-found", "Table not found.");
			}

			// B. Extract data
			const tableData = tableDoc.data();
			const restaurantData = restaurantDoc.exists ? restaurantDoc.data() : {};
			const customerData = customerDoc.exists ? customerDoc.data() : {};

			// C. Race condition check
			if (tableData.status !== "available") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"This table is not available.",
				);
			}

			const realRestaurantName =
				restaurantData.name || restaurantData.restaurantName || "Restaurant";
			const tableName = tableData.name || `Table ${tableId}`;

			// 🚨 UPDATED LOGIC HERE
			const hostId = isManualSeat ? "walk_in_guest" : uid;
			const hostName = isManualSeat
				? guestName || "Walk-In Guest"
				: customerData.fullName || // 👈 Added this line
					`${customerData.firstName || ""} ${customerData.lastName || ""}`.trim() ||
					`User ${hostId.slice(-4)}`;

			const timestamp = admin.firestore.FieldValue.serverTimestamp();

			// Check if we are actually linking a pre-built party
			let isPreBuiltCart = false;
			if (existingPartyId) {
				const existingPartyDoc = await transaction.get(partyRef);
				if (existingPartyDoc.exists) {
					isPreBuiltCart = true;
				}
			}

			// D. Create the CheckIn document
			const checkInData = {
				id: checkInRef.id,
				restaurantId: restaurantId,
				customerId: hostId,
				customerName: hostName,
				numberOfPeople: 1,
				status: "ACCEPTED",
				type: "party",
				partyId: partyRef.id,
				table: { id: tableId, name: tableName },
				server: assignedServer,
				createdAt: timestamp,
				acceptedAt: timestamp,
			};
			transaction.set(checkInRef, checkInData);

			// E. Handle the Party/Basket Logic
			if (isPreBuiltCart) {
				transaction.update(partyRef, {
					status: "active",
					table: { id: tableId, name: tableName },
					partyName: tableName,
					checkInId: checkInRef.id,
					server: assignedServer,
					lastUpdated: timestamp,
				});
			} else {
				transaction.set(sharedBasketRef, {
					items: [],
					lastUpdated: timestamp,
				});

				transaction.set(partyRef, {
					id: partyRef.id,
					restaurantId: restaurantId,
					restaurantName: realRestaurantName,
					partyName: tableName,
					table: { id: tableId, name: tableName },
					checkInId: checkInRef.id,
					sharedBasketId: partyRef.id,
					hostId: hostId,
					hostName: hostName,
					status: "active",
					inviteCode: newInviteCode,
					createdAt: timestamp,
					lastUpdated: timestamp,
					guestUserIds: [hostId],
					guestPips: [
						{
							userId: hostId,
							name: hostName,
							joinedAt: new Date(),
							paymentStatus: "pending",
						},
					],
					server: assignedServer,
				});
			}

			// F. Lock the Table
			transaction.update(tableRef, {
				status: "OCCUPIED",
				currentPartyId: partyRef.id,
				currentCheckInId: checkInRef.id,
				currentCustomerId: hostId,
				seatedAt: timestamp,
			});

			// G. Update Host Profile (ONLY if it's not a manual seat)
			if (!isManualSeat && customerRef) {
				transaction.update(customerRef, {
					activeCheckIn: {
						checkInId: checkInRef.id,
						partyId: partyRef.id,
						restaurantId: restaurantId,
						status: "ACCEPTED",
						table: { id: tableId, name: tableName },
					},
					partyIds: admin.firestore.FieldValue.arrayUnion(partyRef.id),
				});
			}

			return {
				success: true,
				partyId: partyRef.id,
				checkInId: checkInRef.id,
				inviteCode: newInviteCode,
				message: "Successfully started table session!",
			};
		});
	} catch (error) {
		console.error("Create Party Session Error:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not start the table session.",
		);
	}
});
