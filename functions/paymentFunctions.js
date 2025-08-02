// functions/paymentFunctions.js
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const stripe = require("stripe");
const { onCall } = require("firebase-functions/v1/https");
const db = admin.firestore();
const { updateDoc } = require("firebase-admin/firestore");
const { FieldValue } = require("firebase-admin/firestore");
const { generateOrderId } = require("./orderFunctions");
const { getStripeKeys } = require("./stripeUtils");

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const STRIPE_WEBHOOK_SECRET_TEST = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");
const STRIPE_WEBHOOK_SECRET_LIVE = defineSecret("STRIPE_WEBHOOK_SECRET_LIVE");

/**
 * Checks if all members of a party have paid. If so, updates the
 * party's main status to 'completed'.
 * @param {FirebaseFirestore.DocumentReference} partyRef Reference to the party document.
 * @param {FirebaseFirestore.Transaction} transaction The transaction to run the check within.
 */
const checkAndCloseParty = async (partyRef, partyData) => {
	console.log(`--- Starting checkAndCloseParty for party ${partyRef.id} ---`);

	const guestPips = partyData.guestPips || [];
	const payingMembers = guestPips.filter((pip) => pip.userId); // Filter for actual users

	// Check if every single paying member has the status 'paid'
	const allPayingMembersHavePaid =
		payingMembers.length > 0 &&
		payingMembers.every((pip) => pip.paymentStatus === "paid");

	if (allPayingMembersHavePaid) {
		console.log(
			`All members of party ${partyRef.id} have paid. Starting final cleanup...`
		);
		const batch = db.batch();

		// Delete the main party document
		batch.delete(partyRef);

		// Delete the associated shared basket and its items (if it exists)
		if (partyData.sharedBasketId) {
			const sharedBasketItemsRef = db
				.collection("shared_baskets")
				.doc(partyData.sharedBasketId)
				.collection("items");
			const itemsSnapshot = await sharedBasketItemsRef.get();
			itemsSnapshot.forEach((doc) => batch.delete(doc.ref));
			batch.delete(
				db.collection("shared_baskets").doc(partyData.sharedBasketId)
			);
		}

		// Update the table status
		if (partyData.table.id && partyData.restaurantId) {
			const tableRef = db
				.collection("restaurants")
				.doc(partyData.restaurantId)
				.collection("tables")
				.doc(partyData.table.id);
			batch.update(tableRef, {
				status: "checkedOut",
				currentCheckInId: null,
				currentCustomerId: null,
			});
		}

		// Update the check-in status
		if (partyData.checkInId) {
			const checkInRef = db.collection("checkIns").doc(partyData.checkInId);
			batch.update(checkInRef, {
				status: "COMPLETED",
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
		}

		// Clear activeCheckIn for all paying members
		payingMembers.forEach((member) => {
			if (member.userId) {
				const customerRef = db.collection("customers").doc(member.userId);
				batch.update(customerRef, { activeCheckIn: null });
			}
		});

		await batch.commit();
		console.log(`✅ Successfully closed and cleaned up party ${partyRef.id}.`);
	} else {
		console.log(
			`Party ${partyRef.id} is not yet fully paid. No cleanup action taken.`
		);
	}
};

// --- NEW HELPER FUNCTION ---
/**
 * Creates a permanent 'order' document from a successful party payment.
 * This is crucial for sales reporting.
 * @param {object} partyData The data from the /parties/{partyId} document.
 * @param {string} payingUserId The ID of the user who just paid.
 * @param {object} paymentIntent The successful PaymentIntent object from Stripe.
 * @param {number} stripeFeeActual The actual fee charged by Stripe for this transaction.
 * @returns {Promise<void>}
 */
const createOrderFromPartyPayment = async (
	orderId,
	paymentIntent,
	stripeFeeActual
) => {
	console.log(
		`[Webhook Log] Starting combined party payment processing for pending order: ${orderId}`
	);

	try {
		await db.runTransaction(async (transaction) => {
			// 1. Fetch all necessary documents
			const pendingOrderRef = db.collection("pending_orders").doc(orderId);
			const pendingOrderDoc = await transaction.get(pendingOrderRef);
			if (!pendingOrderDoc.exists)
				throw new Error(`Pending order ${orderId} not found.`);

			const orderDetails = pendingOrderDoc.data();
			const {
				partyId,
				customerId,
				restaurantId,
				items,
				table,
				server,
				checkInId,
				checkInTimestamp: rawTimestamp,
				subtotal,
				gratuity,
			} = orderDetails;

			const partyRef = db.collection("parties").doc(partyId);
			const partyDoc = await transaction.get(partyRef);
			if (!partyDoc.exists) throw new Error(`Party ${partyId} not found.`);
			const partyData = partyDoc.data();

			// 2. Find the active workday for the restaurant.
			const workDaysRef = db
				.collection("restaurants")
				.doc(restaurantId)
				.collection("work_days");
			const openWorkDayQuery = workDaysRef
				.where("status", "==", "OPEN")
				.limit(1);
			const openWorkDaySnapshot = await transaction.get(openWorkDayQuery);
			const activeWorkDayId = openWorkDaySnapshot.empty
				? null
				: openWorkDaySnapshot.docs[0].id;

			// 3. Create the final 'orders' document with a consistent structure
			const finalOrderRef = db.collection("orders").doc(orderId);
			const generatedOrderId = await generateOrderId(restaurantId, customerId);

			let finalCheckInTimestamp = null;
			if (rawTimestamp && rawTimestamp._seconds) {
				finalCheckInTimestamp = new admin.firestore.Timestamp(
					rawTimestamp._seconds,
					rawTimestamp._nanoseconds || 0
				);
			}

			// --- THIS IS THE FIX ---
			// We now build the orderData object field-by-field to match the individual order format exactly.
			const orderData = {
				id: finalOrderRef.id,
				orderId: generatedOrderId,
				restaurantId: restaurantId,
				userId: customerId,
				workdayId: activeWorkDayId, // This makes it appear in reports
				items: items,
				table: table || null,
				server: server || null,
				checkInId: checkInId || null,
				checkInTimestamp: finalCheckInTimestamp,
				subtotal: subtotal,
				gratuity: gratuity,
				platformFeeActual: paymentIntent.application_fee_amount || 0,
				stripeFeeActual: stripeFeeActual,
				totalPrice: paymentIntent.amount,
				paymentStatus: "paid",
				orderStatus: "confirmed",
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
			};

			transaction.set(finalOrderRef, orderData);
			// --- STEP 3: Update the user's payment status within the party ---
			const guestPips = partyData.guestPips || [];
			let allMembersHavePaid = true;
			const updatedGuestPips = guestPips.map((pip) => {
				let updatedPip = { ...pip };
				if (pip.userId === customerId) {
					updatedPip.paymentStatus = "paid";
				}
				if (updatedPip.userId && updatedPip.paymentStatus !== "paid") {
					allMembersHavePaid = false;
				}
				return updatedPip;
			});
			transaction.update(partyRef, { guestPips: updatedGuestPips });
			console.log(
				`Updated payment status for user ${customerId} in party ${partyId}.`
			);

			// --- STEP 4: Delete the user's items from the shared basket ---
			if (partyData.sharedBasketId && items && items.length > 0) {
				const itemIdsToDelete = items.map((item) => item.id);
				console.log(
					`Queuing deletion of ${itemIdsToDelete.length} items from shared basket for user ${customerId}.`
				);
				for (const itemId of itemIdsToDelete) {
					const itemRef = db
						.collection("shared_baskets")
						.doc(partyData.sharedBasketId)
						.collection("items")
						.doc(itemId);
					transaction.delete(itemRef);
				}
			}

			// --- STEP 5: Delete the pending order document ---
			transaction.delete(pendingOrderRef);

			// --- STEP 6: If all members have paid, perform final cleanup ---
			if (allMembersHavePaid) {
				console.log(
					`All members of party ${partyId} have now paid. Performing final cleanup.`
				);

				transaction.delete(partyRef); // Delete the main party document

				if (partyData.table.id && partyData.restaurantId) {
					const tableRef = db
						.collection("restaurants")
						.doc(partyData.restaurantId)
						.collection("tables")
						.doc(partyData.table.id);
					transaction.update(tableRef, {
						status: "checkedOut",
						currentCheckInId: null,
						currentCustomerId: null,
					});
				}

				if (partyData.checkInId) {
					const checkInRef = db.collection("checkIns").doc(partyData.checkInId);
					transaction.update(checkInRef, {
						status: "COMPLETED",
						updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					});
				}

				updatedGuestPips.forEach((member) => {
					if (member.userId) {
						const customerRef = db.collection("customers").doc(member.userId);
						transaction.update(customerRef, { activeCheckIn: null });
					}
				});
			}
		});

		console.log(
			`✅ Successfully processed and cleaned up for order ${orderId}.`
		);
	} catch (error) {
		console.error("Error in createOrderFromPartyPayment:", error);
	}
};

/**
 * Fetches a pending order from Firestore, creates a permanent 'order' document,
 * and performs all necessary cleanup after a successful individual payment.
 * @param {string} orderId The ID of the document in the 'pending_orders' collection.
 * @param {object} paymentIntent The full PaymentIntent object from Stripe.
 * @param {number} stripeFeeActual The calculated Stripe fee for the transaction.
 */
const createOrderFromIndividualPayment = async (
	orderId,
	paymentIntent,
	stripeFeeActual
) => {
	console.log(
		`[Webhook Log] 1. Starting createOrderFromIndividualPayment for pending order: ${orderId}`
	);

	try {
		// STEP 1: Fetch the pending order document.
		const pendingOrderRef = db.collection("pending_orders").doc(orderId);
		const pendingOrderDoc = await pendingOrderRef.get();

		if (!pendingOrderDoc.exists) {
			// This is a critical failure point.
			console.error(
				`[Webhook Log] 2. CRITICAL: Pending order ${orderId} not found. Aborting.`
			);
			return; // Exit the function.
		}
		console.log(
			`[Webhook Log] 2. Successfully fetched pending order ${orderId}.`
		);

		const orderDetails = pendingOrderDoc.data();

		const {
			restaurantId,
			customerId,
			items,
			table,
			server,
			checkInId,
			checkInTimestamp: rawTimestamp,
			subtotal,
			gratuity,
		} = orderDetails;

		// STEP 2: Generate the human-readable Order ID
		const generatedOrderId = await generateOrderId(restaurantId, customerId);
		console.log(
			`[Webhook Log] 3. Generated human-readable Order ID: ${generatedOrderId}`
		);

		// STEP 3: Convert the timestamp safely
		let finalCheckInTimestamp = null;
		if (rawTimestamp && typeof rawTimestamp.toDate === "function") {
			finalCheckInTimestamp = rawTimestamp; // It's already a Firestore Timestamp
		} else if (rawTimestamp && rawTimestamp._seconds) {
			finalCheckInTimestamp = new admin.firestore.Timestamp(
				rawTimestamp._seconds,
				rawTimestamp._nanoseconds || 0
			);
		}
		console.log(`[Webhook Log] 4. Processed checkInTimestamp.`);

		// STEP 4: Prepare the final order data
		const newOrderRef = db.collection("orders").doc(orderId);
		const orderData = {
			id: newOrderRef.id,
			orderId: generatedOrderId,
			restaurantId,
			userId: customerId,
			items,
			table: table || null,
			server: server || null,
			checkInId: checkInId || null,
			checkInTimestamp: finalCheckInTimestamp,
			subtotal,
			gratuity,
			platformFeeActual: paymentIntent.application_fee_amount || 0,
			stripeFeeActual,
			totalPrice: paymentIntent.amount,
			paymentStatus: "paid",
			orderStatus: "confirmed",
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		};
		console.log(
			`[Webhook Log] 5. Prepared final order data for doc ${newOrderRef.id}.`
		);

		// STEP 5: Use a batch write to perform all database updates atomically
		const batch = db.batch();
		console.log("[Webhook Log] 6. Initialized Firestore batch.");

		// Action 1: Create the new order document
		batch.set(newOrderRef, orderData);
		console.log(`[Webhook Log] 7. Queued SET for new order ${newOrderRef.id}.`);

		// Action 2: Delete the user's basket items
		const basketQuery = db
			.collection("baskets")
			.where("userId", "==", customerId)
			.where("restaurantId", "==", restaurantId);
		const basketSnapshot = await basketQuery.get();
		if (!basketSnapshot.empty) {
			basketSnapshot.forEach((doc) => batch.delete(doc.ref));
			console.log(
				`[Webhook Log] 8. Queued DELETE for ${basketSnapshot.size} basket items.`
			);
		}

		if (table && table.id) {
			const tableRef = db
				.collection("restaurants")
				.doc(restaurantId)
				.collection("tables")
				.doc(table.id);

			batch.update(tableRef, {
				status: "checkedOut", // Correctly set the status
				currentCheckInId: null,
				currentCustomerId: null,
			});
			console.log(
				`[Webhook Log] Queued UPDATE for table ${table.id} to 'needsCleaning'.`
			);
		}

		// Action 3: Update check-in and customer status
		if (checkInId) {
			batch.update(db.collection("checkIns").doc(checkInId), {
				status: "COMPLETED",
			});
			console.log(`[Webhook Log] 9. Queued UPDATE for checkIn ${checkInId}.`);
		}
		if (customerId) {
			batch.update(db.collection("customers").doc(customerId), {
				activeCheckIn: null,
			});
			console.log(
				`[Webhook Log] 10. Queued UPDATE for customer ${customerId}.`
			);
		}

		// Action 4: Delete the pending order document
		batch.delete(pendingOrderRef);
		console.log(
			`[Webhook Log] 11. Queued DELETE for pending order ${orderId}.`
		);

		// Commit all changes at once
		await batch.commit();
		console.log(
			`[Webhook Log] 12. ✅ BATCH COMMITTED SUCCESSFULLY! Order ${newOrderRef.id} is now permanent.`
		);
	} catch (error) {
		// This will now catch any error from the steps above and log it clearly.
		console.error(
			`[Webhook Log] FINAL ERROR in createOrderFromIndividualPayment for order ${orderId}:`,
			error
		);
		// We re-throw the error to ensure the calling function knows something went wrong.
		throw error;
	}
};

/**
 * A shared helper function to process verified Stripe webhook events.
 * It intelligently handles successful payments and failures for both
 * individual orders and party payments by checking the event metadata.
 * It includes logic to retrieve exact Stripe fees for accurate accounting.
 *
 * @param {object} event The verified Stripe event object.
 * @param {object} stripeInstance The initialized Stripe instance (test or live).
 */
const handleStripeEvent = async (event, stripeInstance) => {
	console.log(`🔔 Handling event: ${event.id}, Type: ${event.type}`);

	const paymentIntent = event.data.object;
	const metadata = paymentIntent.metadata || {};

	console.log(
		"Webhook received. Metadata content:",
		JSON.stringify(metadata, null, 2)
	);

	switch (event.type) {
		case "payment_intent.succeeded":
			const paymentIntentId = paymentIntent.id;
			const orderId = metadata.orderId;

			// --- 1. Retrieve Charge Details to get Exact Fees ---
			const chargeId = paymentIntent.latest_charge;
			let stripeFeeActual = 0;
			const platformFeeCollected = paymentIntent.application_fee_amount || 0;
			const finalAmountCharged = paymentIntent.amount;

			if (chargeId && typeof chargeId === "string") {
				try {
					const chargeDetails = await stripeInstance.charges.retrieve(
						chargeId,
						{ expand: ["balance_transaction"] }
					);
					const balanceTransaction = chargeDetails.balance_transaction;
					if (
						balanceTransaction &&
						typeof balanceTransaction.fee === "number"
					) {
						// Best case: We get the exact fee from the balance transaction.
						stripeFeeActual = balanceTransaction.fee;
						console.log(
							`Webhook: Retrieved exact Stripe fee: ${stripeFeeActual}`
						);
					}
				} catch (chargeRetrieveError) {
					console.error(
						`Webhook Error: Could not retrieve charge ${chargeId}.`,
						chargeRetrieveError
					);
				}
			}

			// Fallback calculation: If the exact fee is still 0 (due to timing), we calculate an estimate.
			// This prevents the fee from ever being saved incorrectly.
			if (stripeFeeActual === 0) {
				const stripeRate = 0.029; // 2.9%
				const stripeFixedFee = 30; // 30 cents
				stripeFeeActual =
					Math.round(paymentIntent.amount * stripeRate) + stripeFixedFee;
				console.warn(
					`Webhook Warn: Using estimated Stripe fee: ${stripeFeeActual}`
				);
			}

			if (!orderId) {
				console.error("Payment succeeded but metadata is missing orderId.");
				return; // Stop processing if we don't have the ID
			}

			if (metadata.type === "individual_payment") {
				await createOrderFromIndividualPayment(
					orderId,
					paymentIntent,
					stripeFeeActual
				);
				return;
			} else if (metadata.type === "party_payment") {
				// --- Handle a successful PARTY payment ---
				if (!metadata.partyId || !metadata.userId) {
					console.error(
						"🔴 Party payment succeeded but is missing partyId or userId in metadata.",
						metadata
					);
					return; // Acknowledge event to Stripe, but cannot process.
				}

				try {
					// Directly call createOrderFromPartyPayment.
					// This function now handles the entire process, including updating the party document.
					await createOrderFromPartyPayment(
						orderId,
						paymentIntent,
						stripeFeeActual
					);
				} catch (error) {
					console.error(
						`Error processing party payment for party ${metadata.partyId}:`,
						error
					);
				}
			}
			break;
		case "account.updated":
			const account = event.data.object;
			const accountId = account.id;

			console.log(
				`Webhook: Received 'account.updated' event for Stripe Account: ${accountId}`
			);

			console.log("account object:", JSON.stringify(account, null, 2));

			// Check if the account is now fully onboarded and ready for payments.
			const isOnboarded = account.charges_enabled && account.details_submitted;
			const newStatus = isOnboarded ? "verified" : "pending";

			if (isOnboarded) {
				console.log(
					`Stripe Account ${accountId} is now fully onboarded and verified.`
				);
			}

			try {
				// Find the restaurant document that has this stripeAccountId.
				const restaurantsRef = db.collection("restaurants");
				const q = restaurantsRef
					.where("stripeAccountId", "==", accountId)
					.limit(1);
				const snapshot = await q.get();

				if (snapshot.empty) {
					console.warn(
						`Webhook: Received account update for ${accountId}, but no matching restaurant was found.`
					);
					return; // Stop processing if no restaurant is found
				}

				const restaurantDoc = snapshot.docs[0];
				const restaurantRef = restaurantDoc.ref;

				// Update the restaurant's status in your Firestore database.
				await restaurantRef.update({
					stripeAccountStatus: newStatus,
					// You can also update your internal onboarding status here.
					// For example, if they were 'pending_stripe', move them to the next step.
					onboardingStatus: isOnboarded ? "pending_menu" : "pending_stripe",
				});

				console.log(
					`✅ Successfully updated restaurant ${restaurantDoc.id} with Stripe status: ${newStatus}`
				);
			} catch (error) {
				console.error(
					`Error updating restaurant status for Stripe account ${accountId}:`,
					error
				);
			}
			break;

		case "payment_intent.payment_failed":
			// ... (Your existing logic for handling payment failures for both types) ...
			break;

		default:
			console.log(`⚠️ Unhandled event type: ${event.type}`);
	}
};

/**
 * Prepares Stripe Payment Sheet data for a single user's portion of a party order.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.partyId - The ID of the party the user is paying for.
 * @param {number} data.amount - The total amount in cents for this user's portion of the bill.
 * @param {number} data.platformFee - The platform fee in cents calculated for this user's portion.
 * @param {string} data.restaurantStripeAccountId - The Stripe Connect account ID of the restaurant.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<object>} An object containing the paymentIntent, ephemeralKey, and customerId.
 */
exports.preparePartyPaymentSheet = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST, // Needed by getStripeKeys
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated."
			);
		}

		const {
			amount,
			platformFee,
			stripeCustomerId,
			connectedAccountId,
			partyId,
			orderPayload,
		} = data;
		const userId = context.auth.uid;

		if (
			!amount ||
			!stripeCustomerId ||
			!connectedAccountId ||
			!partyId ||
			!orderPayload
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing required data."
			);
		}

		try {
			// --- THIS IS THE FIX ---
			// STEP 1: Create the pending order document in Firestore FIRST.
			const pendingOrderRef = admin
				.firestore()
				.collection("pending_orders")
				.doc();

			await pendingOrderRef.set({
				...orderPayload,
				customerId: userId,
				partyId: partyId,
				status: "pending_payment",
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			const newOrderId = pendingOrderRef.id;
			console.log(
				`Created pending order ${newOrderId} before creating Payment Intent.`
			);

			const keys = await getStripeKeys(orderPayload.restaurantId);
			const stripeInstance = stripe(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});

			// --- STEP 3: Create Ephemeral Key ---

			// STEP 2: Create Ephemeral Key
			const ephemeralKey = await stripeInstance.ephemeralKeys.create(
				{ customer: stripeCustomerId },
				{ apiVersion: "2024-04-10" }
			);

			// STEP 3: Create Payment Intent with the new orderId in the metadata
			const paymentIntent = await stripeInstance.paymentIntents.create({
				amount: amount,
				currency: "usd",
				customer: stripeCustomerId,
				application_fee_amount: platformFee,
				transfer_data: {
					destination: connectedAccountId,
				},
				metadata: {
					orderId: newOrderId, // Use the ID from the document we just created
					userId: userId,
					partyId: partyId,
					restaurantId: orderPayload.restaurantId,
					type: "party_payment",
				},
			});

			// STEP 4: Return secrets to the client
			return {
				paymentIntentClientSecret: paymentIntent.client_secret,
				ephemeralKeySecret: ephemeralKey.secret,
				customerId: stripeCustomerId,
			};
		} catch (error) {
			console.error(
				"Stripe/Firestore Error in preparePartyPaymentSheet:",
				error
			);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to create payment intent.",
				error.message
			);
		}
	});

/// Function to Prepare payment sheet data
exports.preparePaymentSheetData = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST, // Needed by getStripeKeys
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError("unauthenticated", "Auth required");
		}

		const {
			amount,
			platformFee,
			stripeCustomerId,
			connectedAccountId,
			orderPayload,
		} = data;
		const userId = context.auth.uid;

		// --- Basic Validation ---
		if (
			!amount ||
			!platformFee === undefined ||
			!stripeCustomerId ||
			!connectedAccountId ||
			!orderPayload
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing required data for payment preparation."
			);
		}

		try {
			// --- STEP 1: Create the pending order document in Firestore FIRST ---
			const pendingOrderRef = admin
				.firestore()
				.collection("pending_orders")
				.doc(); // Auto-generate ID

			await pendingOrderRef.set({
				...orderPayload,
				customerId: userId, // Ensure the UID of the calling user is set
				status: "pending_payment",
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			const newOrderId = pendingOrderRef.id;
			console.log(
				`Created pending order ${newOrderId} before creating Payment Intent.`
			);

			// --- STEP 2: Get the correct Stripe instance using your helper ---
			const keys = await getStripeKeys(orderPayload.restaurantId);
			const stripeInstance = stripe(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});

			// --- STEP 3: Create Ephemeral Key ---
			const ephemeralKey = await stripeInstance.ephemeralKeys.create(
				{ customer: stripeCustomerId },
				{ apiVersion: "2024-04-10" }
			);

			// --- STEP 4: Create Payment Intent with LEAN metadata ---
			const paymentIntent = await stripeInstance.paymentIntents.create({
				amount: amount,
				currency: "usd",
				customer: stripeCustomerId,
				application_fee_amount: platformFee, // Correctly passed as a top-level param
				transfer_data: {
					destination: connectedAccountId,
				},
				// The metadata is now clean, small, and efficient.
				metadata: {
					orderId: newOrderId,
					userId: userId,
					restaurantId: orderPayload.restaurantId,
					type: "individual_payment",
				},
			});

			// --- STEP 5: Return secrets to the client ---
			return {
				paymentIntentClientSecret: paymentIntent.client_secret,
				ephemeralKeySecret: ephemeralKey.secret,
				customerId: stripeCustomerId,
			};
		} catch (error) {
			console.error("preparePaymentSheetData failed:", error);

			throw new functions.https.HttpsError(
				"internal",
				error.message || "Unknown error in preparePaymentSheetData",
				error
			);
		}
	});

// Make sure stripeWebhookTest and stripeWebhookLive functions are correct
// and call this handleStripeEvent function, passing the correct stripeInstance.

// --- Webhook Endpoint for TEST Mode ---
exports.stripeWebhookTest = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY_TEST, STRIPE_WEBHOOK_SECRET_TEST], // Only TEST secrets
	})
	.https.onRequest(async (request, response) => {
		const sig = request.headers["stripe-signature"];
		const webhookSecret = STRIPE_WEBHOOK_SECRET_TEST.value();
		const secretKey = STRIPE_SECRET_KEY_TEST.value(); // Use TEST API key
		let event;

		if (!webhookSecret || !secretKey) {
			console.error("🔴 TEST Webhook Error: Missing secrets..");
			return response.status(500).send("Server configuration error.");
		}

		const stripeInstance = require("stripe")(secretKey); // Initialize with TEST key

		try {
			event = stripeInstance.webhooks.constructEvent(
				request.rawBody,
				sig,
				webhookSecret
			);
			console.log(
				"✅ TEST Webhook signature verified. Event type:",
				event.type
			);
		} catch (err) {
			console.error("❌ TEST Webhook signature verification failed.", err);
			return response.status(400).send(`Webhook Error: ${err.message}`);
		}

		try {
			await handleStripeEvent(event, stripeInstance); // Call shared logic
			response.status(200).send({ received: true }); // Send success AFTER handling
		} catch (err) {
			console.error(
				`Error in TEST handleStripeEvent for event ${event.id}:`,
				err
			);
			response.status(500).send(`Webhook Processing Error: ${err.message}`); // Send 500 on processing errors
		}
	});

// --- Webhook Endpoint for LIVE Mode ---
exports.stripeWebhookLive = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY_LIVE, STRIPE_WEBHOOK_SECRET_LIVE], // Only LIVE secrets
	})
	.https.onRequest(async (request, response) => {
		const sig = request.headers["stripe-signature"];
		const webhookSecret = STRIPE_WEBHOOK_SECRET_LIVE.value();
		const secretKey = STRIPE_SECRET_KEY_LIVE.value(); // Use LIVE API key
		let event;

		if (!webhookSecret || !secretKey) {
			console.error("🔴 LIVE Webhook Error: Missing secrets.");
			return response.status(500).send("Server configuration error.");
		}

		const stripeInstance = require("stripe")(secretKey); // Initialize with LIVE key

		try {
			event = stripeInstance.webhooks.constructEvent(
				request.rawBody,
				sig,
				webhookSecret
			);
			console.log(
				"✅ LIVE Webhook signature verified. Event type:",
				event.type
			);
		} catch (err) {
			console.error("❌ LIVE Webhook signature verification failed.", err);
			return response.status(400).send(`Webhook Error: ${err.message}`);
		}

		try {
			await handleStripeEvent(event, stripeInstance); // Call shared logic
			response.status(200).send({ received: true }); // Send success AFTER handling
		} catch (err) {
			console.error(
				`Error in LIVE handleStripeEvent for event ${event.id}:`,
				err
			);
			response.status(500).send(`Webhook Processing Error: ${err.message}`); // Send 500 on processing errors
		}
	});

//

// Function to allow custome to select cards using setupIntent
exports.createSetupIntent = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY_LIVE, STRIPE_SECRET_KEY_TEST], // Declare required secrets
	})
	.https.onCall(async (data, context) => {
		const { stripeSecretKey } = await getStripeKeys(data.restaurantId);
		const { customerId } = data;
		try {
			const setupIntent = await stripe(stripeSecretKey).setupIntents.create({
				customer: customerId,
				payment_method_types: ["card"],
			});

			return { clientSecret: setupIntent.client_secret };
		} catch (error) {
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

// Function to fetch the Stripe publishable key from RemoteCinfig(server-side)
exports.getStripePublishableKey = functions
	.runWith({
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		try {
			const keys = await getStripeKeys(data.restaurantId);

			if (!keys || !keys.publishableKey) {
				//check for returned object, and key
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Stripe Publishable key is not set"
				);
			}
			return { stripePublishableKey: keys.publishableKey }; //return named property.
		} catch (error) {
			console.error(
				"Error fetching stripe publishable key: ", // removed "from Remote Config"
				error
			);
			throw new functions.https.HttpsError(
				"internal",
				"An error occurred while fetching the Stripe publishable key."
			);
		}
	});

exports.createEphemeralKey = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY_LIVE, STRIPE_SECRET_KEY_TEST],
	})
	.https.onCall(async (data, context) => {
		const { userId, apiVersion, customerId, restaurantId } = data || {};
		// console.log("createEphemeralKey - Received data:", data); // LOG THE ENTIRE DATA OBJECT
		// console.log("createEphemeralKey - restaurantId:", restaurantId); // Log the restaurantId

		if (!customerId || !apiVersion || !restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Customer ID, API version, and Restaurant ID are required."
			);
		}

		const { stripeSecretKey } = await getStripeKeys(restaurantId);

		try {
			// 2. Retrieve the stripe secret key using secret
			// Create an ephemeral key
			const ephemeralKey = await stripe(stripeSecretKey).ephemeralKeys.create(
				{
					customer: customerId,
				},
				{ apiVersion: apiVersion }
			);

			console.log("EphermeralKey Successfuly created");

			// 4. Return the ephemeral key
			return { ephemeralKey: ephemeralKey.secret };
		} catch (error) {
			console.error("Error creating ephermeral key: ", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});
