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
const checkAndCloseParty = async (partyRef, partyData, transaction) => {
	// --- (LOG 1) ---
	// Log the data we receive to start. This is the most important log.
	console.log("--- Starting checkAndCloseParty ---");
	console.log("Received partyData:", JSON.stringify(partyData, null, 2));

	const guestPips = partyData.guestPips || [];
	const payingMembers = guestPips.filter((pip) => pip.userId);

	if (payingMembers.length === 0) {
		console.log("No paying members found. Proceeding to cleanup.");
	}

	const allPayingMembersHavePaid = payingMembers.every(
		(pip) => pip.paymentStatus === "paid"
	);

	if (allPayingMembersHavePaid) {
		console.log(
			`All paying members of party ${partyRef.id} have paid. Starting cleanup...`
		);

		// Delete the party document
		transaction.delete(partyRef);
		console.log(`Queued deletion for party ${partyRef.id}.`);

		// Delete the associated shared basket
		if (partyData.sharedBasketId) {
			const sharedBasketRef = db
				.collection("shared_baskets")
				.doc(partyData.sharedBasketId);
			transaction.delete(sharedBasketRef);
			console.log(
				`Queued deletion for shared basket ${partyData.sharedBasketId}.`
			);
		} else {
			console.warn("Could not delete shared basket, ID was missing.");
		}

		// Update the table status
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
			console.log(
				`Queued update for table ${partyData.table.id} to status 'checkedOut'.`
			);
		} else {
			console.warn(
				"Could not update table status, ID or restaurantId was missing."
			);
		}

		// --- (LOG 2) ---
		// Check if the crucial checkInId exists before trying to update it.
		if (partyData.checkInId) {
			console.log(
				`Found checkInId: ${partyData.checkInId}. Queuing update to 'COMPLETED'.`
			);
			const checkInRef = db.collection("checkIns").doc(partyData.checkInId);
			transaction.update(checkInRef, {
				status: "COMPLETED",
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
		} else {
			console.error(
				"CRITICAL: 'checkInId' is missing from partyData. Cannot update check-in status."
			);
		}

		// Clear activeCheckIn for all paying members
		console.log(
			`Found ${payingMembers.length} paying members to clear activeCheckIn for.`
		);
		payingMembers.forEach((member) => {
			if (member.userId) {
				// --- (LOG 3) ---
				// Confirm we are queuing an update for each specific customer.
				console.log(
					`Queuing update to clear activeCheckIn for customer ${member.userId}.`
				);
				const customerRef = db.collection("customers").doc(member.userId);
				transaction.update(customerRef, { activeCheckIn: null });
			}
		});
	} else {
		console.log(
			`Party ${partyRef.id} is not yet fully paid. No cleanup action taken.`
		);
	}
	console.log("--- Finished checkAndCloseParty ---");
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
	partyData,
	payingUserId,
	paymentIntent,
	stripeFeeActual,
	platformFeeActual
) => {
	console.log(
		`[Webhook Log] Starting createOrderFromPartyPayment for user: ${payingUserId} in party: ${partyData.id}`
	);
	console.log(
		`[Webhook Log] Stripe Fee: ${stripeFeeActual}, Platform Fee: ${platformFeeActual}`
	);

	const sharedBasketId = paymentIntent.metadata.sharedBasketId;
	if (!sharedBasketId) {
		console.error(
			"Critical: sharedBasketId is missing from payment intent metadata."
		);
		return;
	}

	let checkInTimestamp = null;
	if (partyData.checkInId) {
		const checkInRef = db.collection("checkIns").doc(partyData.checkInId);
		const checkInDoc = await checkInRef.get();
		if (checkInDoc.exists) {
			checkInTimestamp = checkInDoc.data().acceptedAt;
		}
	}

	const menuItemsRef = db
		.collection("menuItems")
		.where("restaurantId", "==", partyData.restaurantId);
	const menuSnapshot = await menuItemsRef.get();
	const menuItemsMap = new Map();
	menuSnapshot.forEach((doc) => menuItemsMap.set(doc.id, doc.data()));

	const basketRef = db.collection("shared_baskets").doc(sharedBasketId);
	const basketDoc = await basketRef.get();
	if (!basketDoc.exists) {
		console.error(`Could not find shared_basket ${sharedBasketId}.`);
		return;
	}

	const allItems = basketDoc.data().items || [];
	const userItems = allItems
		.filter((item) => item.orderedByUserId === payingUserId)
		.map((item) => {
			const fullMenuItem = menuItemsMap.get(item.menuItemId);
			return {
				...item,
				dish: fullMenuItem || { name: "Unknown Item", category: "Other" },
			};
		});

	if (userItems.length === 0) {
		console.warn(`User ${payingUserId} had no items to process.`);
		return;
	}

	const generatedOrderId = await generateOrderId(
		partyData.restaurantId,
		payingUserId
	);

	const workDaysRef = db
		.collection("restaurants")
		.doc(partyData.restaurantId)
		.collection("work_days");
	const openWorkDayQuery = workDaysRef.where("status", "==", "OPEN").limit(1);
	const openWorkDaySnapshot = await openWorkDayQuery.get();

	let activeWorkDayId = null;
	if (!openWorkDaySnapshot.empty) {
		activeWorkDayId = openWorkDaySnapshot.docs[0].id;
	} else {
		console.warn(
			`Could not find an active workday for restaurant ${partyData.restaurantId} when creating order.`
		);
	}

	const newOrderRef = db.collection("orders").doc();
	const orderData = {
		id: newOrderRef.id,
		orderId: generatedOrderId,
		restaurantId: partyData.restaurantId,
		workDayId: activeWorkDayId,
		userId: payingUserId,
		timestamp: admin.firestore.FieldValue.serverTimestamp(),
		items: userItems,
		subtotal: Number(paymentIntent.metadata.subtotal) || 0,
		tax: Number(paymentIntent.metadata.tax) || 0,
		gratuity: Number(paymentIntent.metadata.gratuity) || 0,
		totalPrice: paymentIntent.amount,
		paymentStatus: "paid",
		orderStatus: "confirmed",
		table: partyData.table,
		server: partyData.server,
		checkInId: partyData.checkInId,
		stripePaymentIntentId: paymentIntent.id,
		stripeChargeId: paymentIntent.latest_charge,
		stripeFeeActual: stripeFeeActual, // Storing the fee
		platformFeeActual: platformFeeActual, // Storing the fee
		checkInTimestamp: checkInTimestamp,
	};

	await newOrderRef.set(orderData);
	console.log(
		`✅ Successfully created permanent order ${newOrderRef.id} from party payment with fees.`
	);
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
		`[Webhook Log] Starting createOrderFromIndividualPayment Second for pending order: ${orderId}`
	);

	try {
		// --- THIS IS THE FIX ---
		// STEP 1: Fetch the complete order data from the 'pending_orders' collection.
		const pendingOrderRef = db.collection("pending_orders").doc(orderId);
		const pendingOrderDoc = await pendingOrderRef.get();

		if (!pendingOrderDoc.exists) {
			console.error(
				`CRITICAL: Pending order ${orderId} not found. Cannot create final order.`
			);
			return; // Exit the function if the pending order doesn't exist.
		}

		const orderDetails = pendingOrderDoc.data();

		// Now we have all the correct data, including items, checkInId, etc.
		const {
			restaurantId,
			customerId, // Changed from userId to customerId
			items,
			table,
			server,
			checkInId, // This is now guaranteed to exist
			checkInTimestamp = null, // Default to null if undefined
			subtotal,
			gratuity,
		} = orderDetails;

		// STEP 2: Generate the human-readable Order ID
		const generatedOrderId = await generateOrderId(restaurantId, customerId); // Use customerId here
		console.log(`[Webhook Log] Generated Order ID: ${generatedOrderId}`);

		// STEP 3: Prepare the final order data using the fetched details
		const newOrderRef = db.collection("orders").doc(orderId); // Use the same ID for the final order
		const orderData = {
			id: newOrderRef.id,
			orderId: generatedOrderId,
			restaurantId: restaurantId,
			userId: customerId, // Store as userId in the final order
			items: items, // Use the items from the pending order
			table: table,
			server: server,
			checkInId: checkInId, // This is now correctly defined
			checkInTimestamp: checkInTimestamp,
			subtotal: subtotal,
			gratuity: gratuity,
			platformFeeActual: paymentIntent.application_fee_amount || 0,
			stripeFeeActual: stripeFeeActual,
			totalPrice: paymentIntent.amount,
			paymentStatus: "paid",
			orderStatus: "confirmed",
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		};

		// STEP 4: Use a batch write to perform all updates atomically
		const batch = db.batch();

		// Action 1: Create the new order document
		batch.set(newOrderRef, orderData);

		// Action 2: Query for and delete all items from the user's basket for that restaurant.
		const basketQuery = db
			.collection("baskets")
			.where("userId", "==", customerId)
			.where("restaurantId", "==", restaurantId);

		const basketSnapshot = await basketQuery.get();
		if (!basketSnapshot.empty) {
			console.log(
				`[Webhook Log] Found ${basketSnapshot.size} basket items to delete for user ${customerId}.`
			);
			basketSnapshot.forEach((doc) => {
				batch.delete(doc.ref);
			});
		}

		// Action 2: Update the table status
		if (table && table.id) {
			const tableRef = db
				.collection("restaurants")
				.doc(restaurantId)
				.collection("tables")
				.doc(table.id);
			batch.update(tableRef, {
				status: "checkedOut",
				currentCheckInId: null,
				currentCustomerId: null,
			});
		}

		// Action 3: Update the check-in status
		if (checkInId) {
			const checkInRef = db.collection("checkIns").doc(checkInId);
			batch.update(checkInRef, {
				status: "COMPLETED",
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
		}

		// Action 4: Clear the customer's active check-in
		if (customerId) {
			// Use customerId here
			const customerRef = db.collection("customers").doc(customerId); // Use customerId here
			batch.update(customerRef, { activeCheckIn: null });
		}

		// Action 5: Delete the original pending order document
		batch.delete(pendingOrderRef);

		// Commit all changes at once
		await batch.commit();
		console.log(
			`✅ Successfully created order ${newOrderRef.id} and cleaned up pending order.`
		);
	} catch (error) {
		console.error("Error in createOrderFromIndividualPayment:", error);
		// We log the error but don't re-throw, as the webhook should still return a 200 to Stripe.
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

			const orderId = metadata.orderId;

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

				const partyRef = db.collection("parties").doc(metadata.partyId);
				try {
					await db.runTransaction(async (transaction) => {
						const partyDoc = await transaction.get(partyRef);
						if (!partyDoc.exists) return;

						const partyData = partyDoc.data();
						const guestPips = partyData.guestPips || [];
						let userFound = false;

						const updatedGuestPips = guestPips.map((pip) => {
							if (pip.userId === metadata.userId) {
								userFound = true;
								return {
									...pip,
									paymentStatus: "paid",
									paymentIntentId: paymentIntentId,
									paidAmount: finalAmountCharged,
									paidAt: new Date(),
								};
							}
							return pip;
						});

						if (userFound) {
							const updatedPartyData = {
								...partyData,
								guestPips: updatedGuestPips,
							};
							transaction.update(partyRef, { guestPips: updatedGuestPips });
							console.log(
								`✅ Updated payment status for user ${metadata.userId} in party ${metadata.partyId}.`
							);

							// Call createOrderFromPartyPayment to create the permanent order record
							await createOrderFromPartyPayment(
								updatedPartyData, // Use the updated party data
								metadata.userId,
								paymentIntent,
								stripeFeeActual,
								platformFeeCollected
							);

							await checkAndCloseParty(partyRef, updatedPartyData, transaction);
						}
					});
				} catch (error) {
					console.error(
						`Error updating party payment status for party ${metadata.partyId}:`,
						error
					);
				}
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
			STRIPE_PUBLISHABLE_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated."
			);
		}
		const customerUid = context.auth.uid;
		const {
			partyId,
			amount,
			platformFee,
			restaurantStripeAccountId,
			subtotal,
			gratuity,
		} = data;

		// --- 1. Validation ---
		if (
			!partyId ||
			!amount ||
			!restaurantStripeAccountId ||
			subtotal === undefined ||
			gratuity === undefined
		) {
			console.error(
				"preparePartyPaymentSheet: Invalid input. Missing required data.",
				data
			);
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID, amount, restaurant Stripe ID, subtotal, gratuity, and tax are required."
			);
		}
		if (amount <= 49) {
			// Stripe has a minimum charge amount (e.g., 50 cents)
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Payment amount is too low."
			);
		}

		try {
			// --- 2. Get Restaurant and User Info ---
			const partyDoc = await db.collection("parties").doc(partyId).get();
			if (!partyDoc.exists) {
				throw new functions.https.HttpsError("not-found", "Party not found.");
			}

			const partyData = partyDoc.data();
			const restaurantId = partyData.restaurantId;
			const sharedBasketId = partyData.sharedBasketId;

			if (!sharedBasketId) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Party document is missing the shared basket ID."
				);
			}

			const userDocRef = db.collection("customers").doc(customerUid);
			const userDoc = await userDocRef.get();
			if (!userDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Customer profile not found in database."
				);
			}

			// --- 3. Initialize Stripe with correct API key ---
			const keys = await getStripeKeys(restaurantId);
			const stripeInstance = stripe(keys.stripeSecretKey);
			const restaurantDoc = await db
				.collection("restaurants")
				.doc(restaurantId)
				.get();
			const isLiveMode =
				restaurantDoc.exists && restaurantDoc.data().isTestAccount === false;

			const customerIdField = isLiveMode
				? "stripeCustomerId_live"
				: "stripeCustomerId_test";
			let stripeCustomerId = userData[customerIdField];

			if (!stripeCustomerId) {
				console.log(`Creating new Stripe customer for user ${customerUid}.`);
				const customer = await stripeInstance.customers.create({
					email: userDoc.data().email,
					name: `${userDoc.data().firstName} ${userDoc.data().lastName}`,
				});
				stripeCustomerId = customer.id;
				await userDocRef.update({ stripeCustomerId: stripeCustomerId });
			}

			// Calculate the final total amount on the server.
			const finalAmount = subtotal + gratuity + platformFee;

			// --- 5. Create Ephemeral Key for the session ---
			const ephemeralKey = await stripeInstance.ephemeralKeys.create(
				{ customer: stripeCustomerId },
				{ apiVersion: "2024-04-10" } // Use a recent, stable Stripe API version
			);

			// --- 6. Create the Payment Intent ---
			const paymentIntent = await stripeInstance.paymentIntents.create({
				amount: Math.round(finalAmount), // Ensure amount is an integer
				currency: "usd",
				customer: stripeCustomerId,
				automatic_payment_methods: { enabled: true },
				// For Stripe Connect, specify the destination account and application fee
				transfer_data: {
					destination: restaurantStripeAccountId,
				},
				on_behalf_of: restaurantStripeAccountId,
				// The platform fee was pre-calculated on the client for this user's portion
				application_fee_amount: Math.round(platformFee),
				metadata: {
					type: "party_payment", // Differentiate from individual orders
					partyId: partyId,
					userId: customerUid,
					restaurantId: restaurantId,
					subtotal: subtotal, // Add subtotal to metadata
					gratuity: gratuity, // Add gratuity to metadata

					sharedBasketId: sharedBasketId, // Pass the basket ID
				},
			});

			console.log(
				`Successfully created Payment Intent ${paymentIntent.id} for user ${customerUid} and party ${partyId}.`
			);

			// --- 7. Return all necessary secrets to the Client ---
			return {
				paymentIntent: paymentIntent.client_secret,
				ephemeralKey: ephemeralKey.secret,
				customer: stripeCustomerId,
				finalAmount: finalAmount,
			};
		} catch (error) {
			console.error(
				`Error preparing party payment sheet for party ${partyId}:`,
				error
			);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"Could not initialize payment.",
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

