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
/**
 * @function preparePayment
 * @description A consolidated and secure HTTPS Callable function to prepare a Stripe Payment Intent.
 * It uses the /baskets collection as the source of truth for item pricing to correctly handle discounts.
 * Now configured for Merchant of Record (Global Scerv Account) and Card Vaulting.
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
			// 2. ============== STRIPE INITIALIZATION & CUSTOMER FETCH ==============
			const keys = await getStripeKeys(restaurantId);
			const stripeInstance = require("stripe")(keys.stripeSecretKey, {
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

			// If no customer exists on Scerv's global account, create one now.
			if (!stripeCustomerId) {
				stripeCustomerId = await createStripeCustomerHelper(
					userId,
					restaurantId,
					stripeInstance,
				);
			}

			// 3. ============== FETCH BASKET ITEMS DYNAMICALLY ==============
			let itemsToProcess = [];
			let isUserVerifiedForParty = false;

			if (paymentType === "party") {
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
				const basketPromises = items.map((item) =>
					db.collection("baskets").doc(item.id).get(),
				);
				const fetchedBasketDocs = await Promise.all(basketPromises);
				itemsToProcess = fetchedBasketDocs
					.map((doc) => {
						if (!doc.exists) return null;
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

			itemsToProcess.forEach((basketData) => {
				let isSecure = false;

				if (paymentType === "party" && isUserVerifiedForParty) {
					isSecure = basketData.restaurantId === restaurantId;
				} else {
					isSecure =
						basketData.restaurantId === restaurantId &&
						basketData.userId === userId;
				}

				if (!isSecure) {
					console.warn(`Security check failed for an item. Skipping.`);
					return;
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

			// 5. ============== CREATE PENDING ORDER ==============
			const pendingOrderRef = db.collection("pending_orders").doc();
			const newOrderId = pendingOrderRef.id;

			await pendingOrderRef.set({
				restaurantId,
				customerId: userId,
				stripeCustomerId: stripeCustomerId, // Store this for reference
				checkInId,
				paymentType,
				items: fullItemDetails,
				subtotal: calculatedSubtotal,
				gratuity,
				platformFee: calculatedPlatformFee,
				total: finalAmount,
				status: "pending_payment",
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				table: table || null,
				server: server || null,
				checkInTimestamp: checkInTimestamp || null,
				...(paymentType === "party" && { partyId }),
			});

			// 6. ============== STRIPE INTENTS & KEYS ==============
			let ephemeralKey;
			try {
				ephemeralKey = await stripeInstance.ephemeralKeys.create(
					{ customer: stripeCustomerId },
					{ apiVersion: "2024-04-10" },
				);
			} catch (err) {
				// If the customer was deleted in Stripe but still exists in Firestore, recreate them.
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
					// Update pending order with the newly generated ID
					await pendingOrderRef.update({ stripeCustomerId });
				} else {
					throw err;
				}
			}

			const paymentIntent = await stripeInstance.paymentIntents.create({
				amount: finalAmount,
				currency: "usd",
				customer: stripeCustomerId,
				// --- THIS IS THE CRITICAL LINE FOR CARD VAULTING ---
				setup_future_usage: "off_session",
				automatic_payment_methods: { enabled: true },
				metadata: {
					orderId: newOrderId,
					userId,
					restaurantId,
					type: paymentType,
				},
			});

			// 7. ============== RETURN SECRETS TO REACT NATIVE ==============
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
				throw error;
			}
			throw new functions.https.HttpsError(
				"internal",
				"An unexpected error occurred while preparing the payment.",
			);
		}
	});

/**
 * @function fulfillOrder
 * @description A consolidated, robust, and GATEWAY-AGNOSTIC function to process a successful payment.
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
			`[Fulfill] Idempotency check: Pending order ${orderId} already processed.`,
		);
		return;
	}

	const pendingOrderData = pendingOrderSnap.data();
	const readableOrderId = await generateOrderId(restaurantId);

	const restaurantDoc = await db
		.collection("restaurants")
		.doc(restaurantId)
		.get();
	const restaurantData = restaurantDoc.data();
	const payoutRouting = restaurantData.payoutMethod || "stripe_connect";

	// 1. Ensure Cents Integration
	const subtotal = Number(pendingOrderData.subtotal) || 0;
	const gratuity = Number(pendingOrderData.gratuity) || 0;
	const platformFee = platformFeeActual || pendingOrderData.platformFee || 0;
	const processorFee = processorFeeActual || 0;
	const taxAmount = pendingOrderData.taxAmount || 0;

	const restaurantTierInfo = await getRestaurantTier(restaurantId);
	const payoutPercentage = restaurantTierInfo.payoutPercentage || 0.9;
	const amountToTransfer = Math.round(subtotal * payoutPercentage) + gratuity;

	let turnaroundTimeMinutes = 0;
	if (pendingOrderData.createdAt) {
		const openedAtMs = pendingOrderData.createdAt.toDate().getTime();
		turnaroundTimeMinutes = Math.round((Date.now() - openedAtMs) / 60000);
	}

	const finalOrderData = {
		id: orderId,
		readableOrderId: readableOrderId,
		partyId: pendingOrderData.partyId || null,
		restaurantId: restaurantId,
		restaurantName: restaurantData.name || "Scerv Partner",
		table: pendingOrderData.table || null,
		server: pendingOrderData.server || null,

		subtotal: subtotal,
		taxAmount: taxAmount,
		gratuityAmount: gratuity,
		platformFee: platformFee,
		processorFee: processorFee,
		totalPrice: totalPrice,

		openedAt:
			pendingOrderData.createdAt ||
			admin.firestore.FieldValue.serverTimestamp(),
		fulfilledAt: admin.firestore.FieldValue.serverTimestamp(),
		turnaroundTimeMinutes: turnaroundTimeMinutes,

		items: pendingOrderData.items || [],
		paymentProcessor: processor,
		paymentProcessorId: processorTransactionId,
		paymentMethod: paymentType,
		paymentStatus: "paid",
		orderStatus: "confirmed",
	};

	// 2. ATOMIC DATABASE TRANSACTION
	try {
		await db.runTransaction(async (t) => {
			const transactionalPendingOrderSnap = await t.get(pendingOrderRef);
			if (!transactionalPendingOrderSnap.exists) return;

			let partySnap, basketSnap, kitchenOrdersSnap;
			if (paymentType === "party" && pendingOrderData.partyId) {
				const partyRef = db.collection("parties").doc(pendingOrderData.partyId);
				partySnap = await t.get(partyRef);

				const basketRef = db
					.collection("shared_baskets")
					.doc(pendingOrderData.partyId);
				basketSnap = await t.get(basketRef);

				const kitchenQuery = db
					.collection("kitchen_orders")
					.where("partyId", "==", pendingOrderData.partyId);
				kitchenOrdersSnap = await t.get(kitchenQuery);
			}

			const finalOrderRef = db.collection("orders").doc(orderId);
			t.set(finalOrderRef, finalOrderData);

			const payerUserId = pendingOrderData.customerId || userId;

			// Global Clean: Free the paying customer
			if (payerUserId && payerUserId !== "anonymous") {
				const customerRef = db.collection("customers").doc(payerUserId);
				t.set(
					customerRef,
					{
						activeCheckIn: null,
						activePartyId: null,
						activeRestaurantId: null,
					},
					{ merge: true },
				);
				if (restaurantId) {
					t.delete(customerRef.collection("baskets").doc(restaurantId));
				}
			}

			// Individual Clean
			if (paymentType === "individual") {
				if (pendingOrderData.table.id) {
					const tableRef = db
						.collection("restaurants")
						.doc(restaurantId)
						.collection("tables")
						.doc(pendingOrderData.table.id);
					t.update(tableRef, { status: "checkedOut" });
				}
			}

			// Party Clean (Array Safe Filtering)
			else if (paymentType === "party" && partySnap.exists) {
				const partyData = partySnap.data();

				const updatedGuestPips = partyData.guestPips.map((pip) =>
					pip.userId === payerUserId ? { ...pip, paymentStatus: "paid" } : pip,
				);
				t.update(partySnap.ref, { guestPips: updatedGuestPips });

				// Array Safe Deletion
				if (basketSnap.exists) {
					const currentBasketItems = basketSnap.data().items || [];
					const paidItemIds = pendingOrderData.items.map((item) => item.id);
					const remainingItems = currentBasketItems.filter(
						(item) => !paidItemIds.includes(item.id),
					);
					t.update(basketSnap.ref, { items: remainingItems });
				}

				const allPaid = updatedGuestPips.every(
					(pip) => pip.paymentStatus === "paid",
				);

				if (allPaid) {
					t.update(partySnap.ref, {
						status: "completed",
						paymentStatus: "paid",
						closedAt: admin.firestore.FieldValue.serverTimestamp(),
						closedByUserId: "system_digital_checkout",
					});

					if (partyData.table.id) {
						const tableRef = db
							.collection("restaurants")
							.doc(partyData.restaurantId)
							.collection("tables")
							.doc(partyData.table.id);
						t.update(tableRef, { status: "checkedOut" });
					}

					if (partyData.checkInId) {
						t.delete(db.collection("checkIns").doc(partyData.checkInId));
					}

					t.delete(basketSnap.ref);

					if (kitchenOrdersSnap && !kitchenOrdersSnap.empty) {
						kitchenOrdersSnap.forEach((docSnap) => t.delete(docSnap.ref));
					}
				}
			}

			t.delete(pendingOrderRef);
		});

		console.log(`[Fulfill] ✅ DB transaction committed for order ${orderId}.`);
	} catch (error) {
		console.error(`[Fulfill] ❌ DB transaction failed:`, error);
		throw error;
	}

	// 3. EXTERNAL API CALL
	if (processor === "stripe" && stripeInstance) {
		if (
			payoutRouting === "stripe_connect" &&
			latestChargeId &&
			pendingOrderData.connectedAccountId
		) {
			try {
				const transfer = await stripeInstance.transfers.create({
					amount: amountToTransfer,
					currency: "usd",
					destination: pendingOrderData.connectedAccountId,
					source_transaction: latestChargeId,
					metadata: { orderId: orderId },
				});
				await db
					.collection("orders")
					.doc(orderId)
					.update({ stripeTransferId: transfer.id });
			} catch (apiError) {
				console.error(`[Fulfill] 🚨 Stripe Transfer FAILED:`, apiError);
			}
		}
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

// Make sure you have admin initialized at the top of your file if it isn't already:
// const admin = require('firebase-admin');
// admin.initializeApp();

exports.seedMenuOnce = functions.https.onRequest(async (req, res) => {
	const db = admin.firestore();
	const restaurantId = "xD6c9KwlHJdY99gNFzTFhKdzVAH2";

	const menuItemsToSeed = [
		// COCKTAILS (DAIQUIRIS)
		{
			name: "Pineapple Paradise Daiquiri",
			name_es: "Daiquiri Paraíso de Piña",
			description: "Fresh pineapple daiquiri made with Bacardi Silver Rum.",
			description_es: "Daiquiri fresco de piña hecho con ron Bacardi Silver.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Mango Madness Daiquiri",
			name_es: "Daiquiri Locura de Mango",
			description: "Fresh mango daiquiri made with Captain Morgan White.",
			description_es:
				"Daiquiri fresco de mango hecho con Captain Morgan White.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Coconut Breeze Daiquiri",
			name_es: "Daiquiri Brisa de Coco",
			description: "Refreshing coconut daiquiri made with Malibu Coconut Rum.",
			description_es:
				"Refrescante daiquiri de coco hecho con Malibu Coconut Rum.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Passion Fruit Storm Daiquiri",
			name_es: "Daiquiri Tormenta de Maracuyá",
			description: "Passion fruit daiquiri made with Flor de Cana 5 Year.",
			description_es: "Daiquiri de maracuyá hecho con Flor de Caña 5 Años.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Strawberry Splash Daiquiri",
			name_es: "Daiquiri Salpicón de Fresa",
			description: "Classic strawberry daiquiri made with Bacardi Superior.",
			description_es: "Daiquiri clásico de fresa hecho con Bacardi Superior.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Watermelon Wave Daiquiri",
			name_es: "Daiquiri Ola de Sandía",
			description: "Watermelon daiquiri made with Plantation 3 Star.",
			description_es: "Daiquiri de sandía hecho con Plantation 3 Star.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Blueberry Chill Daiquiri",
			name_es: "Daiquiri Escalofrío de Arándano",
			description: "Blueberry daiquiri made with Mount Gay Eclipse.",
			description_es: "Daiquiri de arándano hecho con Mount Gay Eclipse.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Banana Boat Daiquiri",
			name_es: "Daiquiri Barco de Plátano",
			description: "Banana daiquiri made with Havana Club Añejo Blanco.",
			description_es: "Daiquiri de plátano hecho con Havana Club Añejo Blanco.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Lemon Zest Delight Daiquiri",
			name_es: "Daiquiri Delicia de Limón",
			description: "Lemon daiquiri made with Tanqueray Gin.",
			description_es: "Daiquiri de limón hecho con ginebra Tanqueray.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Cucumber Mint Refresher",
			name_es: "Refrescante de Pepino y Menta",
			description: "Cucumber and mint daiquiri made with Gin.",
			description_es: "Daiquiri de pepino y menta hecho con ginebra.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Berry Basil Bliss Daiquiri",
			name_es: "Daiquiri Éxtasis de Moras y Albahaca",
			description: "Berry and basil daiquiri made with Beefeater Gin.",
			description_es:
				"Daiquiri de moras y albahaca hecho con ginebra Beefeater.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Tropical Lime Garden Daiquiri",
			name_es: "Daiquiri Jardín de Lima Tropical",
			description: "Tropical lime daiquiri made with Gordon's Gin.",
			description_es: "Daiquiri de lima tropical hecho con ginebra Gordon's.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Peach Bourbon Sunset",
			name_es: "Atardecer de Durazno y Bourbon",
			description: "Peach daiquiri made with Maker's Mark Bourbon.",
			description_es: "Daiquiri de durazno hecho con bourbon Maker's Mark.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Cherry Oak Smash",
			name_es: "Colisión de Cereza y Roble",
			description: "Cherry daiquiri made with Bulleit Bourbon.",
			description_es: "Daiquiri de cereza hecho con bourbon Bulleit.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Honey Citrus Kick",
			name_es: "Toque Cítrico con Miel",
			description: "Citrus and honey daiquiri made with Jim Beam Honey.",
			description_es: "Daiquiri de cítricos y miel hecho con Jim Beam Honey.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Spiced Apple Rush",
			name_es: "Frenesí de Manzana Especiada",
			description: "Spiced apple daiquiri made with Wild Turkey 101.",
			description_es:
				"Daiquiri de manzana especiada hecho con Wild Turkey 101.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Cinnamon Maple Twist",
			name_es: "Giro de Canela y Arce",
			description: "Cinnamon maple daiquiri made with Evan Williams.",
			description_es: "Daiquiri de canela y arce hecho con Evan Williams.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Vanilla Smoked Nectar",
			name_es: "Néctar Ahumado de Vainilla",
			description: "Vanilla daiquiri made with Knob Creek.",
			description_es: "Daiquiri de vainilla hecho con Knob Creek.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Coconut Barrel Chill",
			name_es: "Escalofrío de Barril de Coco",
			description: "Coconut bourbon daiquiri made with Four Roses.",
			description_es: "Daiquiri de bourbon y coco hecho con Four Roses.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Chocolate Mocha Storm",
			name_es: "Tormenta de Mocha y Chocolate",
			description: "Mocha chocolate daiquiri made with Buffalo Trace.",
			description_es: "Daiquiri de mocha y chocolate hecho con Buffalo Trace.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 9.0,
			restaurantId,
		},
		{
			name: "Daiquiri Flight (Any 5 Flavors)",
			name_es: "Vuelo de Daiquiris (5 Sabores)",
			description: "A tasting flight of any 5 daiquiri flavors.",
			description_es: "Una degustación de 5 sabores de daiquiri a elección.",
			category: "Cocktails",
			isDailySpecial: false,
			price: 20.0,
			restaurantId,
		},

		// ENTREES (BURGERS & SANDWICHES)
		{
			name: "Deluxe Cheeseburger",
			name_es: "Hamburguesa de Lujo con Queso",
			description:
				"Classic deluxe cheeseburger with lettuce, tomato, and cheese.",
			description_es:
				"Clásica hamburguesa de lujo con queso, lechuga y tomate.",
			category: "Entrees",
			isDailySpecial: false,
			price: 15.95,
			restaurantId,
		},
		{
			name: "Chicken Club / Bacon Sandwich",
			name_es: "Club de Pollo con Tocino",
			description: "Chicken club sandwich loaded with crispy bacon.",
			description_es: "Sándwich club de pollo con tocino crujiente.",
			category: "Entrees",
			isDailySpecial: false,
			price: 13.95,
			restaurantId,
		},
		{
			name: "Spicy Chicken Sandwich",
			name_es: "Sándwich de Pollo Picante",
			description: "Crispy and spicy chicken sandwich.",
			description_es: "Sándwich de pollo crujiente y picante.",
			category: "Entrees",
			isDailySpecial: false,
			price: 11.95,
			restaurantId,
		},
		{
			name: "Grilled Chicken Sandwich",
			name_es: "Sándwich de Pollo a la Parrilla",
			description: "Healthy and delicious grilled chicken sandwich.",
			description_es: "Saludable y delicioso sándwich de pollo a la parrilla.",
			category: "Entrees",
			isDailySpecial: false,
			price: 11.95,
			restaurantId,
		},
		{
			name: "Fish Fillet Sandwich",
			name_es: "Sándwich de Pescado Crujiente",
			description: "Crispy fried fish fillet sandwich.",
			description_es: "Sándwich de filete de pescado frito y crujiente.",
			category: "Entrees",
			isDailySpecial: false,
			price: 13.95,
			restaurantId,
		},
		{
			name: "BLT Sandwich",
			name_es: "Sándwich de Lechuga, Tomate y Tocino",
			description: "Classic Bacon, Lettuce, and Tomato sandwich.",
			description_es: "Sándwich clásico de tocino, lechuga y tomate.",
			category: "Entrees",
			isDailySpecial: false,
			price: 13.95,
			restaurantId,
		},
		{
			name: "Chicken & Waffles",
			name_es: "Pollo con Waffles",
			description: "Crispy fried chicken served with a fluffy golden waffle.",
			description_es:
				"Pollo frito crujiente servido con un waffle dorado y esponjoso.",
			category: "Entrees",
			isDailySpecial: false,
			price: 14.95,
			restaurantId,
		},
		{
			name: "Chicken Nuggets with Fries (8 Pieces)",
			name_es: "Nuggets de Pollo con Papas (8 Piezas)",
			description: "8 crispy chicken nuggets served with golden fries.",
			description_es:
				"8 nuggets de pollo crujientes servidos con papas fritas doradas.",
			category: "Entrees",
			isDailySpecial: false,
			price: 8.95,
			restaurantId,
		},
		{
			name: "Chicken Nuggets with Fries (12 Pieces)",
			name_es: "Nuggets de Pollo con Papas (12 Piezas)",
			description: "12 crispy chicken nuggets served with golden fries.",
			description_es:
				"12 nuggets de pollo crujientes servidos con papas fritas doradas.",
			category: "Entrees",
			isDailySpecial: false,
			price: 12.95,
			restaurantId,
		},
		{
			name: "Chicken Strips with Fries (3 Pieces)",
			name_es: "Tiras de Pollo con Papas (3 Piezas)",
			description: "3 tender chicken strips served with fries.",
			description_es: "3 tiras de pollo tiernas servidas con papas fritas.",
			category: "Entrees",
			isDailySpecial: false,
			price: 7.95,
			restaurantId,
		},
		{
			name: "Chicken Strips with Fries (6 Pieces)",
			name_es: "Tiras de Pollo con Papas (6 Piezas)",
			description: "6 tender chicken strips served with fries.",
			description_es: "6 tiras de pollo tiernas servidas con papas fritas.",
			category: "Entrees",
			isDailySpecial: false,
			price: 9.95,
			restaurantId,
		},

		// APPETIZERS (NACHOS & SALADS)
		{
			name: "Nachos with Chicken or Beef",
			name_es: "Nachos con Pollo o Carne",
			description:
				"Crispy tortilla chips covered with beans, melted cheese, jalapenos, guacamole, sour cream, and tomatoes.",
			description_es:
				"Totopos crujientes con frijoles, queso derretido, jalapeños, guacamole, crema agria y tomates.",
			category: "Appetizers",
			isDailySpecial: false,
			price: 9.95,
			restaurantId,
		},
		{
			name: "Crisp Garden Salad",
			name_es: "Ensalada Fresca del Huerto",
			description: "Delicious crisp lettuce with chopped vegetables.",
			description_es: "Deliciosa y crujiente lechuga con vegetales picados.",
			category: "Appetizers",
			isDailySpecial: false,
			price: 9.95,
			restaurantId,
		},
		{
			name: "Garden Salad with Grilled Chicken & Bacon",
			name_es: "Ensalada con Pollo a la Parrilla y Tocino",
			description: "Crisp garden salad topped with grilled chicken and bacon.",
			description_es: "Ensalada fresca con pollo a la parrilla y tocino.",
			category: "Entrees",
			isDailySpecial: false,
			price: 14.95,
			restaurantId,
		},
		{
			name: "Garden Salad with Crispy Chicken & Bacon",
			name_es: "Ensalada con Pollo Crujiente y Tocino",
			description: "Crisp garden salad topped with fried chicken and bacon.",
			description_es: "Ensalada fresca con pollo frito crujiente y tocino.",
			category: "Entrees",
			isDailySpecial: false,
			price: 14.95,
			restaurantId,
		},

		// NON-ALCOHOLIC DRINKS
		{
			name: "Fresh Juice (16 oz)",
			name_es: "Jugo Fresco (16 oz)",
			description: "16 oz of refreshing fresh juice.",
			description_es: "16 oz de jugo fresco y refrescante.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 5.0,
			restaurantId,
		},
		{
			name: "Lemonade",
			name_es: "Limonada",
			description: "Freshly squeezed lemonade.",
			description_es: "Limonada recién exprimida.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 3.5,
			restaurantId,
		},
		{
			name: "Tropical Fruit Drink",
			name_es: "Bebida de Fruta Tropical",
			description: "Refreshing tropical fruit beverage.",
			description_es: "Refrescante bebida de frutas tropicales.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 3.5,
			restaurantId,
		},
		{
			name: "Tamarind Drink",
			name_es: "Bebida de Tamarindo",
			description: "Sweet and tangy tamarind drink.",
			description_es: "Bebida dulce y ácida de tamarindo.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 3.5,
			restaurantId,
		},
		{
			name: "Passion Fruit Drink",
			name_es: "Bebida de Maracuyá",
			description: "Sweet passion fruit beverage.",
			description_es: "Bebida dulce de maracuyá.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 3.5,
			restaurantId,
		},
		{
			name: "Iced Tea",
			name_es: "Té Helado",
			description: "Classic chilled iced tea.",
			description_es: "Té helado clásico.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 3.5,
			restaurantId,
		},
		{
			name: "Soda",
			name_es: "Refresco",
			description: "Assorted carbonated sodas.",
			description_es: "Refrescos carbonatados variados.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 3.5,
			restaurantId,
		},
		{
			name: "Coffee / Hot Tea",
			name_es: "Café / Té Caliente",
			description: "Freshly brewed coffee or hot tea.",
			description_es: "Café recién hecho o té caliente.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 3.5,
			restaurantId,
		},
		{
			name: "Bottled Water",
			name_es: "Agua Embotellada",
			description: "Purified bottled water.",
			description_es: "Agua purificada embotellada.",
			category: "Non-Alcoholic Drinks",
			isDailySpecial: false,
			price: 2.5,
			restaurantId,
		},

		// DESSERTS
		{
			name: "Classic Cheesecake",
			name_es: "Tarta de Queso Clásica",
			description: "Rich and creamy classic cheesecake.",
			description_es: "Tarta de queso clásica, rica y cremosa.",
			category: "Desserts",
			isDailySpecial: false,
			price: 8.95,
			restaurantId,
		},
		{
			name: "Caramel Cheesecake",
			name_es: "Tarta de Queso con Caramelo",
			description: "Cheesecake topped with rich caramel sauce.",
			description_es: "Tarta de queso cubierta con rica salsa de caramelo.",
			category: "Desserts",
			isDailySpecial: false,
			price: 13.95,
			restaurantId,
		},
		{
			name: "Apple Cobbler",
			name_es: "Crujiente de Manzana",
			description: "Warm baked apple cobbler.",
			description_es: "Postre crujiente de manzana horneada caliente.",
			category: "Desserts",
			isDailySpecial: false,
			price: 8.95,
			restaurantId,
		},
		{
			name: "Tres Leches Cake",
			name_es: "Pastel de Tres Leches",
			description: "Traditional sponge cake soaked in three kinds of milk.",
			description_es: "Bizcocho tradicional bañado en tres tipos de leche.",
			category: "Desserts",
			isDailySpecial: false,
			price: 8.95,
			restaurantId,
		},
		{
			name: "Ice Cream Scoop",
			name_es: "Bola de Helado",
			description: "One scoop of Vanilla, Strawberry, or Chocolate ice cream.",
			description_es: "Una bola de helado de Vainilla, Fresa o Chocolate.",
			category: "Desserts",
			isDailySpecial: false,
			price: 3.95,
			restaurantId,
		},
		{
			name: "Ice Cream Trio",
			name_es: "Trío de Helados",
			description: "Three scoops of assorted ice cream.",
			description_es: "Tres bolas de helado surtido.",
			category: "Desserts",
			isDailySpecial: false,
			price: 8.95,
			restaurantId,
		},
		{
			name: "Dessert of the Week",
			name_es: "Postre de la Semana",
			description: "Ask your server about our special dessert of the week.",
			description_es:
				"Pregunte a su mesero por el postre especial de la semana.",
			category: "Desserts",
			isDailySpecial: false,
			price: 8.95,
			restaurantId,
		},
	];

	try {
		const batch = db.batch();

		menuItemsToSeed.forEach((item) => {
			const newItemRef = db.collection("menuItems").doc();
			batch.set(newItemRef, item);
		});

		await batch.commit();
		res.status(200).send("✅ Successfully seeded all menu items!");
	} catch (error) {
		console.error("❌ Error seeding menu items:", error);
		res.status(500).send("Error seeding menu: " + error.message);
	}
});

exports.fulfillOrder = fulfillOrder;
