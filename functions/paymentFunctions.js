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
const { getStripeKeys, createStripeCustomerHelper } = require("./stripeUtils");

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const STRIPE_WEBHOOK_SECRET_TEST = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");
const STRIPE_WEBHOOK_SECRET_LIVE = defineSecret("STRIPE_WEBHOOK_SECRET_LIVE");

/**
 * @async
 * @function getRestaurantTier
 * @description Fetches the pricing tier configuration for a given restaurant.
 * It reads the restaurant's assigned tier and looks up the corresponding
 * details (like payoutPercentage) from a central configuration document.
 *
 * @param {string} restaurantId The ID of the restaurant to look up.
 * @returns {Promise<object>} A promise that resolves to the configuration
 * object for the restaurant's pricing tier (e.g., { payoutPercentage: 0.97, ... }).
 * @throws Will throw an error if the restaurant or pricing configuration is not found,
 * ensuring the calling function does not proceed with incorrect data.
 */
async function getRestaurantTier(restaurantId) {
	if (!restaurantId) {
		throw new Error(
			"getRestaurantTier Error: restaurantId cannot be null or empty.",
		);
	}

	// 1. Fetch the restaurant document to find its pricingTier string.
	const restaurantRef = db.collection("restaurants").doc(restaurantId);
	const restaurantDoc = await restaurantRef.get();

	if (!restaurantDoc.exists) {
		// This is a critical failure, as we cannot determine the pricing.
		throw new Error(
			`getRestaurantTier Error: Restaurant ${restaurantId} not found.`,
		);
	}

	// 2. Safely get the tier name, defaulting to "basic" if not specified.
	const tierName = restaurantDoc.data().pricingTier || "basic";
	console.log(`Restaurant ${restaurantId} is on pricing tier: "${tierName}".`);

	// 3. Fetch the central document containing all pricing tier maps.
	// Note: Adjust the path if your structure is different, e.g., collection('appConfig').doc('general')
	const tiersRef = db.collection("appConfig").doc("pricingTiers");
	const tiersDoc = await tiersRef.get();

	if (!tiersDoc.exists) {
		// This is a system-level critical failure.
		throw new Error(
			"getRestaurantTier Error: The 'pricingTiers' document was not found in 'appConfig'.",
		);
	}

	const allTiers = tiersDoc.data();
	const tierConfig = allTiers[tierName];

	// 4. Check for data integrity.
	if (!tierConfig || typeof tierConfig.payoutPercentage !== "number") {
		// This indicates a configuration error (e.g., a typo in the restaurant's tier name).
		throw new Error(
			`getRestaurantTier Error: Configuration for tier "${tierName}" is missing or invalid in the pricingTiers document.`,
		);
	}

	// 5. Return the specific configuration object for the determined tier.
	return tierConfig;
}

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
		JSON.stringify(metadata, null, 2),
	);

	switch (event.type) {
		case "payment_intent.succeeded":
			const paymentIntent = event.data.object;

			// --- Get Exact Stripe Fee ---
			let stripeFeeActual = 0;
			try {
				if (paymentIntent.latest_charge) {
					const charge = await stripeInstance.charges.retrieve(
						paymentIntent.latest_charge,
						{
							expand: ["balance_transaction"],
						},
					);
					if (charge.balance_transaction) {
						stripeFeeActual = charge.balance_transaction.fee;
					}
				}
			} catch (feeError) {
				console.warn(
					`[Webhook] Could not retrieve exact fee for PI ${paymentIntent.id}.`,
					feeError,
				);
			}
			if (stripeFeeActual === 0) {
				// Fallback calculation
				stripeFeeActual = Math.round(paymentIntent.amount * 0.029) + 30;
			}

			// --- Delegate to the Fulfillment Helper ---
			// The handler's job is simple: pass the verified data to our powerful helper.
			await fulfillOrder(stripeInstance, paymentIntent, stripeFeeActual);
			break;

		case "account.updated":
			const account = eventObject;
			const accountId = account.id;

			// --- THIS IS THE FIX ---
			// We add detailed logs to trace the entire process.
			console.log(
				`[Webhook Log] 1. Received 'account.updated' for Stripe Account: ${accountId}`,
			);

			const isOnboarded = account.charges_enabled && account.details_submitted;
			const newStatus = isOnboarded ? "verified" : "pending";

			console.log(
				`[Webhook Log] 2. Determined onboarding status. charges_enabled: ${account.charges_enabled}, details_submitted: ${account.details_submitted}. New status will be: ${newStatus}`,
			);

			try {
				const restaurantsRef = db.collection("restaurants");
				const q = restaurantsRef
					.where("stripeAccountId", "==", accountId)
					.limit(1);

				console.log(
					`[Webhook Log] 3. Querying Firestore for restaurant with stripeAccountId: ${accountId}`,
				);
				const snapshot = await q.get();

				if (snapshot.empty) {
					console.error(
						`[Webhook Log] 4. CRITICAL: No matching restaurant found for Stripe account ${accountId}. Aborting update.`,
					);
					return; // Stop processing
				}

				const restaurantDoc = snapshot.docs[0];
				const restaurantRef = restaurantDoc.ref;
				console.log(
					`[Webhook Log] 4. Found matching restaurant document: ${restaurantRef.id}`,
				);

				await restaurantRef.update({
					stripeAccountStatus: newStatus,
					onboardingStatus: isOnboarded ? "pending_menu" : "pending_stripe",
				});

				console.log(
					`[Webhook Log] 5. ✅ Successfully updated restaurant ${restaurantRef.id} with Stripe status: ${newStatus}`,
				);
			} catch (error) {
				console.error(
					`[Webhook Log] 5. CRITICAL ERROR while updating restaurant for Stripe account ${accountId}:`,
					error,
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
 * @function preparePayment
 * @description A consolidated and secure HTTPS Callable function to prepare a Stripe Payment Intent.
 * It uses the /baskets collection as the source of truth for item pricing to correctly handle discounts.
 *
 * @param {object} data The data object from the client.
 * @param {string} data.paymentType - The type of payment, either 'individual' or 'party'.
 * @param {string} data.restaurantId - The ID of the restaurant being paid.
 * @param {string} data.stripeCustomerId - The customer's Stripe ID.
 * @param {Array<object>} data.items - An array of objects, each containing the 'id' of a document in the /baskets collection.
 * @param {number} data.gratuity - The gratuity amount in cents.
 * @param {string} data.checkInId - The ID of the user's check-in document.
 * @param {string} [data.partyId] - The ID of the party, if applicable.
 * @param {object} context The Firebase Functions context object containing auth information.
 * @returns {Promise<object>} An object containing the necessary secrets for the Stripe Payment Sheet.
 */
exports.preparePayment = functions
	.runWith({
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		// 1. ============== AUTHENTICATION & VALIDATION ==============
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"The function must be called while authenticated.",
			);
		}
		const userId = context.auth.uid;

		const {
			paymentType,
			restaurantId,

			items,
			gratuity,
			checkInId,
			partyId,
			table,
			server,
			checkInTimestamp,
		} = data;

		if (
			!paymentType ||
			!restaurantId ||
			!Array.isArray(items) ||
			items.length === 0 ||
			typeof gratuity !== "number"
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"The function was called with missing or invalid data.",
			);
		}

		try {
			const keys = await getStripeKeys(restaurantId);
			const stripeInstance = stripe(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});

			const userDoc = await db.collection("customers").doc(userId).get();
			if (!userDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Customer profile not found.",
				);
			}

			const isTestMode = keys.stripeSecretKey.includes("_test_");
			const customerIdField = isTestMode
				? "stripeCustomerId_test"
				: "stripeCustomerId_live";
			const userData = userDoc.data();
			let stripeCustomerId = userData && userData[customerIdField];

			// 3. ============== FETCH BASKET ITEMS DYNAMICALLY ==============
			let itemsToProcess = [];

			if (paymentType === "party") {
				// For a party, fetch the single shared basket and filter the items array within it.
				if (!partyId) {
					throw new functions.https.HttpsError(
						"invalid-argument",
						"Party ID is required.",
					);
				}

				const partyDoc = await db.collection("parties").doc(partyId).get();
				if (!partyDoc.exists) {
					throw new functions.https.HttpsError(
						"not-found",
						`Party ${partyId} not found.`,
					);
				}

				const partyData = partyDoc.data();
				const memberIds = partyData.guestPips.map((p) => p.userId) || [];
				if (memberIds.includes(userId)) {
					isUserVerifiedForParty = true;
				} else {
					// If the user isn't in the party, stop immediately.
					throw new functions.https.HttpsError(
						"permission-denied",
						"User is not a member of this party.",
					);
				}

				const sharedBasketId = partyDoc.data().sharedBasketId;
				if (!sharedBasketId) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						`Party ${partyId} is missing a sharedBasketId.`,
					);
				}

				const sharedBasketDoc = await db
					.collection("shared_baskets")
					.doc(sharedBasketId)
					.get();
				if (!sharedBasketDoc.exists) {
					throw new functions.https.HttpsError(
						"not-found",
						"Shared basket not found.",
					);
				}

				const allItemsInBasket = sharedBasketDoc.data().items || [];
				const clientItemIds = new Set(items.map((item) => item.id));
				itemsToProcess = allItemsInBasket.filter((itemInDb) =>
					clientItemIds.has(itemInDb.id),
				);
			} else {
				// 'individual' checkout
				// For an individual, fetch each item as a separate document from the /baskets collection.
				const basketPromises = items.map((item) =>
					db.collection("baskets").doc(item.id).get(),
				);
				const fetchedBasketDocs = await Promise.all(basketPromises);
				itemsToProcess = fetchedBasketDocs
					.map((doc) => {
						if (!doc.exists) return null;
						// --- THIS IS THE FIX ---
						// We now merge the document's ID with its data.
						return { id: doc.id, ...doc.data() };
					})
					.filter(Boolean);
			}

			const basketId = itemsToProcess[0].id;

			if (!basketId) {
				throw new functions.https.HttpsError(
					"not-found",
					"No valid basket found.",
				);
			}

			if (itemsToProcess.length === 0) {
				throw new functions.https.HttpsError(
					"not-found",
					"No valid basket items were found for this payment.",
				);
			}

			// 4. ============== CALCULATE SUBTOTAL & FEE ==============
			let calculatedSubtotal = 0;
			const fullItemDetails = [];

			// Loop over the unified 'itemsToProcess' array
			itemsToProcess.forEach((basketData) => {
				let isSecure = false;

				// --- THIS IS THE FINAL FIX ---
				// Apply the correct security rule based on the payment type.
				if (paymentType === "party" && isUserVerifiedForParty) {
					// For a verified party member, we only need to check that the item belongs to the right restaurant.
					isSecure = basketData.restaurantId === restaurantId;
				} else {
					// 'individual'
					// For an individual, the check remains strict: the item must belong to the paying user.
					isSecure =
						basketData.restaurantId === restaurantId &&
						basketData.userId === userId;
				}

				if (!isSecure) {
					console.warn(`Security check failed for an item. Skipping.`);
					return; // This is like 'continue' in a forEach loop
				}
				const price =
					basketData.discountedPrice ||
					basketData.price ||
					basketData.dish.price ||
					0;
				const priceInCents = Math.round(price * 100);
				const quantity = basketData.quantity || 1;
				calculatedSubtotal += priceInCents * quantity;
				fullItemDetails.push({ ...basketData, price: priceInCents, quantity });
			});

			if (calculatedSubtotal <= 0) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Cannot process a payment with a zero or negative subtotal.",
				);
			}

			const configDoc = await db.collection("appConfig").doc("general").get();
			const platformFeePercentage = configDoc.data().fees || 0;
			const calculatedPlatformFee = Math.round(
				calculatedSubtotal * platformFeePercentage,
			);
			const finalAmount = calculatedSubtotal + gratuity + calculatedPlatformFee;

			// 5. ============== CREATE PENDING ORDER & STRIPE OPERATIONS ==============
			const restaurantDoc = await db
				.collection("restaurants")
				.doc(restaurantId)
				.get();
			const pendingOrderRef = db.collection("pending_orders").doc();
			const newOrderId = pendingOrderRef.id;

			await pendingOrderRef.set({
				restaurantId,
				customerId: userId,
				checkInId,
				paymentType,
				items: fullItemDetails,
				subtotal: calculatedSubtotal,
				gratuity,
				platformFee: calculatedPlatformFee,
				total: finalAmount,
				status: "pending_payment",
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				connectedAccountId: restaurantDoc.data().stripeAccountId,
				table: table || null,
				server: server || null,
				checkInTimestamp: checkInTimestamp || null,
				...(paymentType === "party" && { partyId }),
			});

			let ephemeralKey;
			if (!stripeCustomerId) {
				stripeCustomerId = await createStripeCustomerHelper(
					userId,
					restaurantId,
					stripeInstance,
				);
			}

			try {
				ephemeralKey = await stripeInstance.ephemeralKeys.create(
					{ customer: stripeCustomerId },
					{ apiVersion: "2024-04-10" },
				);
			} catch (err) {
				if (err.code === "resource_missing") {
					stripeCustomerId = await createStripeCustomerHelper(
						userId,
						restaurantId,
						stripeInstance,
					);
					ephemeralKey = await stripeInstance.ephemeralKeys.create(
						{ customer: stripeCustomerId },
						{ apiVersion: "2024-04-10" },
					);
				} else {
					throw err;
				}
			}

			const paymentIntent = await stripeInstance.paymentIntents.create({
				amount: finalAmount,
				currency: "usd",
				customer: stripeCustomerId,
				automatic_payment_methods: { enabled: true },
				metadata: {
					orderId: newOrderId,
					userId,
					restaurantId,
					type: paymentType,
				},
			});

			// 6. ============== RETURN SECRETS ==============
			return {
				paymentIntentClientSecret: paymentIntent.client_secret,
				ephemeralKeySecret: ephemeralKey.secret,
				customerId: stripeCustomerId,
				publishableKey: keys.publishableKey,
				basketId: basketId,
			};
		} catch (error) {
			console.error("Error in preparePayment:", error);
			if (error instanceof functions.https.HttpsError) {
				throw error; // Re-throw known errors to the client
			}
			// For unexpected errors, throw a generic internal error.
			throw new functions.https.HttpsError(
				"internal",
				"An unexpected error occurred while preparing the payment.",
			);
		}
	});

/**
 * @function fulfillOrder
 * @description A consolidated, robust, and GATEWAY-AGNOSTIC function to process a successful payment.
 * It creates a permanent order, performs all necessary database cleanup in a
 * single atomic transaction, and handles Stripe Transfers if applicable.
 *
 * @param {object} params The consolidated order parameters.
 * @param {string} params.orderId The ID of the pending_orders document.
 * @param {string} params.paymentType 'individual' or 'party'.
 * @param {string} params.userId The ID of the paying customer.
 * @param {string} params.restaurantId The ID of the restaurant.
 * @param {string} params.processor 'stripe' or 'paypal'.
 * @param {string} params.processorTransactionId The Stripe PaymentIntent ID or PayPal Capture ID.
 * @param {number} params.totalPrice The total amount paid in cents.
 * @param {number} params.processorFeeActual The calculated processing fee for accurate accounting.
 * @param {number} params.platformFeeActual (Optional) The application fee taken by the platform.
 * @param {object} params.stripeInstance (Optional) The initialized Stripe instance (required for Stripe).
 * @param {string} params.latestChargeId (Optional) The Stripe charge ID (required for Stripe Transfers).
 * @returns {Promise<void>}
 */
const fulfillOrder = async ({
	orderId,
	paymentType,
	userId,
	restaurantId,
	processor,
	processorTransactionId,
	totalPrice,
	processorFeeActual,
	platformFeeActual = 0,
	stripeInstance = null,
	latestChargeId = null,
}) => {
	// 1. ============== PREPARATION (Outside the Transaction) ==============
	if (!orderId || !paymentType) {
		console.error(
			`[Fulfill] Critical: Missing orderId or paymentType for ${processorTransactionId}.`,
		);
		return;
	}

	console.log(
		`[Fulfill] Fulfilling ${paymentType} order ${orderId} via ${processor.toUpperCase()}.`,
	);

	const pendingOrderRef = db.collection("pending_orders").doc(orderId);
	const pendingOrderSnap = await pendingOrderRef.get();

	if (!pendingOrderSnap.exists) {
		console.log(
			`[Fulfill] Idempotency check: Pending order ${orderId} has already been processed. Aborting.`,
		);
		return;
	}

	const pendingOrderData = pendingOrderSnap.data();

	// Assuming you have these helper functions defined elsewhere in your file
	const readableOrderId = await generateOrderId(restaurantId);

	// Calculate payouts
	const { subtotal, gratuity, connectedAccountId } = pendingOrderData;
	const restaurantTierInfo = await getRestaurantTier(restaurantId);
	const payoutPercentage = restaurantTierInfo.payoutPercentage || 0.9;
	const restaurantSubtotalPayout = Math.round(subtotal * payoutPercentage);
	const amountToTransfer = restaurantSubtotalPayout + gratuity;

	const finalOrderData = {
		id: orderId,
		readableOrderId: readableOrderId,
		...pendingOrderData, // Spread all data from the pending order
		paymentProcessor: processor, // 'stripe' or 'paypal'
		paymentProcessorId: processorTransactionId, // PI or Capture ID
		paymentStatus: "paid",
		orderStatus: "confirmed",
		platformFeeActual: platformFeeActual || pendingOrderData.platformFee || 0,
		processorFeeActual: processorFeeActual || 0,
		totalPrice: totalPrice,
		fulfilledAt: admin.firestore.FieldValue.serverTimestamp(),
	};

	// 2. ============== ATOMIC DATABASE TRANSACTION ==============
	try {
		await db.runTransaction(async (t) => {
			// ======================================================
			// ============== 1. ALL READS MUST GO FIRST ============
			// ======================================================
			console.log("[Transaction] Performing all reads...");

			// READ 1: The pending order document.
			const transactionalPendingOrderSnap = await t.get(pendingOrderRef);
			if (!transactionalPendingOrderSnap.exists) {
				console.log("[Transaction] Pending order already processed. Aborting.");
				return;
			}

			let partySnap;
			if (paymentType === "party") {
				const partyRef = db.collection("parties").doc(pendingOrderData.partyId);
				// READ 2: The party document, only if needed.
				partySnap = await t.get(partyRef);
			}

			// ======================================================
			// =========== 2. ALL WRITES CAN HAPPEN NOW =============
			// ======================================================
			console.log("[Transaction] All reads complete. Performing writes...");

			// WRITE 1: Create the permanent 'orders' document.
			const finalOrderRef = db.collection("orders").doc(orderId);
			t.set(finalOrderRef, finalOrderData);

			// --- Conditional Cleanup Writes ---
			if (paymentType === "individual") {
				console.log("[Transaction] Performing individual cleanup writes...");
				const { items, checkInId, table } = pendingOrderData;

				// Delete user's basket items.
				items.forEach((item) => {
					const basketItemRef = db.collection("baskets").doc(item.id);
					t.delete(basketItemRef);
				});

				// Update table status
				if (table && table.id) {
					const tableRef = db
						.collection("restaurants")
						.doc(restaurantId)
						.collection("tables")
						.doc(table.id);
					t.update(tableRef, {
						status: "checkedOut",
						currentCheckInId: null,
						currentCustomerId: null,
					});
				}

				// Update check-in status
				if (checkInId) {
					t.update(db.collection("checkIns").doc(checkInId), {
						status: "COMPLETED",
					});
				}

				// Update customer status
				t.update(db.collection("customers").doc(userId), {
					activeCheckIn: null,
				});
			} else if (paymentType === "party") {
				console.log("[Transaction] Performing party cleanup writes...");
				if (partySnap && partySnap.exists) {
					const partyData = partySnap.data();

					// ONLY mark the paying user as paid
					const payerUserId = pendingOrderData.customerId || userId;
					const updatedGuestPips = partyData.guestPips.map((pip) =>
						pip.userId === payerUserId
							? { ...pip, paymentStatus: "paid" }
							: pip,
					);

					t.update(partySnap.ref, { guestPips: updatedGuestPips });

					// Only delete THIS user's items
					const sharedBasketItemsPath = `shared_baskets/${partyData.sharedBasketId}/items`;
					pendingOrderData.items.forEach((item) => {
						const itemRef = db.collection(sharedBasketItemsPath).doc(item.id);
						t.delete(itemRef);
					});

					// Only close party if EVERYONE paid
					const allPaid = updatedGuestPips.every(
						(pip) => pip.paymentStatus === "paid",
					);

					if (allPaid) {
						console.log("All party members paid. Closing party...");
						t.delete(partySnap.ref);

						if (partyData.table && partyData.table.id) {
							const tableRef = db
								.collection("restaurants")
								.doc(partyData.restaurantId)
								.collection("tables")
								.doc(partyData.table.id);
							t.update(tableRef, {
								status: "checkedOut",
								currentCheckInId: null,
								currentCustomerId: null,
							});
						}

						if (partyData.checkInId) {
							t.update(db.collection("checkIns").doc(partyData.checkInId), {
								status: "COMPLETED",
								updatedAt: admin.firestore.FieldValue.serverTimestamp(),
							});
						}

						updatedGuestPips.forEach((member) => {
							if (member.userId) {
								t.update(db.collection("customers").doc(member.userId), {
									activeCheckIn: null,
								});
							}
						});
					}
				}
			}

			// FINAL WRITE: Delete the pending order document.
			t.delete(pendingOrderRef);
		});

		console.log(
			`[Fulfill] ✅ Successfully committed DB transaction for order ${orderId}.`,
		);
	} catch (error) {
		console.error(
			`[Fulfill] ❌ DB transaction for order ${orderId} failed:`,
			error,
		);
		throw error; // Rethrow so the calling function knows the DB write failed!
	}

	// 3. ============== EXTERNAL API CALL (After Successful Transaction) ==============

	// STRIPE PAYOUTS
	if (
		processor === "stripe" &&
		stripeInstance &&
		latestChargeId &&
		connectedAccountId
	) {
		try {
			const transfer = await stripeInstance.transfers.create({
				amount: amountToTransfer,
				currency: "usd",
				destination: connectedAccountId,
				source_transaction: latestChargeId,
				metadata: { orderId: orderId },
			});
			console.log(
				`[Fulfill] ✅ Successfully created Stripe Transfer ${transfer.id} for order ${orderId}.`,
			);

			await db
				.collection("orders")
				.doc(orderId)
				.update({ stripeTransferId: transfer.id });
		} catch (apiError) {
			console.error(
				`[Fulfill] 🚨 CRITICAL: DB updated for ${orderId}, but Stripe Transfer FAILED:`,
				apiError,
			);
			// Add this failed transfer to a retry queue or alert an admin.
		}
	}

	// PAYPAL PAYOUTS
	else if (processor === "paypal") {
		// Since PayPal handles marketplace payouts during the transaction payload itself,
		// or settles to a primary account depending on your setup, no extra API call is needed here.
		console.log(
			`[Fulfill] ✅ PayPal order ${orderId} finalized. No secondary transfer required.`,
		);
	}
};

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
				webhookSecret,
			);
			console.log(
				"✅ TEST Webhook signature verified. Event type:",
				event.type,
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
				err,
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
				webhookSecret,
			);
			console.log(
				"✅ LIVE Webhook signature verified. Event type:",
				event.type,
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
				err,
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
					"Stripe Publishable key is not set",
				);
			}
			return { stripePublishableKey: keys.publishableKey }; //return named property.
		} catch (error) {
			console.error(
				"Error fetching stripe publishable key: ", // removed "from Remote Config"
				error,
			);
			throw new functions.https.HttpsError(
				"internal",
				"An error occurred while fetching the Stripe publishable key.",
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
				"Customer ID, API version, and Restaurant ID are required.",
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
				{ apiVersion: apiVersion },
			);

			console.log("EphermeralKey Successfuly created");

			// 4. Return the ephemeral key
			return { ephemeralKey: ephemeralKey.secret };
		} catch (error) {
			console.error("Error creating ephermeral key: ", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

module.exports = {
	fulfillOrder,
};
