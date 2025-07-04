// functions/paymentFunctions.js
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { createStripeCustomer } = require("./userFunctions");
const stripe = require("stripe");
const { onCall } = require("firebase-functions/v1/https");
const db = admin.firestore();
const { updateDoc } = require("firebase-admin/firestore");
const { FieldValue } = require("firebase-admin/firestore");
const { generateOrderId } = require("./orderFunctions");

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const STRIPE_WEBHOOK_SECRET_TEST = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");
const STRIPE_WEBHOOK_SECRET_LIVE = defineSecret("STRIPE_WEBHOOK_SECRET_LIVE");

// Helper function to determine Stripe keys based on user account type
const getStripeKeys = async (restaurantId) => {
	try {
		const userDoc = await db.collection("restaurants").doc(restaurantId).get();
		if (!userDoc.exists) {
			console.log("getStripeKeys - Restaurant not found"); // Log if the document doesn't exist
			throw new Error("Restaurant not found");
		}

		const userData = userDoc.data();

		const isTestAccount = userData.isTestAccount || false;

		const keys = {
			publishableKey: await (isTestAccount
				? STRIPE_PUBLISHABLE_KEY_TEST.value()
				: STRIPE_PUBLISHABLE_KEY_LIVE.value()),
			stripeSecretKey: await (isTestAccount
				? STRIPE_SECRET_KEY_TEST.value()
				: STRIPE_SECRET_KEY_LIVE.value()),
		};

		return keys;
	} catch (error) {
		console.error("Error fetching Stripe keys: ", error);
		throw new Error("Failed to fetch Stripe keys");
	}
};

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
	const sharedBasketId = paymentIntent.metadata.sharedBasketId;
	if (!sharedBasketId) {
		console.error(
			"Critical: sharedBasketId is missing from payment intent metadata."
		);
		return;
	}

	console.log("--- Starting createOrderFromPartyPayment ---");

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
			// The 'index' parameter is removed to prevent the crash.
			console.log(
				`[Payment Webhook] Processing basket item:`,
				JSON.stringify(item, null, 2)
			);

			// --- THIS IS THE FIX ---
			// The item from the basket has a `menuItemId`. We use that to look up details.
			const fullMenuItem = menuItemsMap.get(item.menuItemId);

			if (!fullMenuItem) {
				console.warn(
					`Could not find menu details for menuItemId: ${item.menuItemId}.`
				);
				return {
					...item,
					dish: { name: item.dishName || "Unknown Item", category: "Other" },
				};
			}

			// Enrich the basket item with the full dish object.
			return {
				...item,
				dish: fullMenuItem, // This ensures the category is included for the sales report.
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

	// 1. Find the currently active workday for the restaurant.
	const workDaysRef = db
		.collection("restaurants")
		.doc(partyData.restaurantId)
		.collection("work_days");
	const openWorkDayQuery = workDaysRef.where("status", "==", "OPEN").limit(1);
	const openWorkDaySnapshot = await openWorkDayQuery.get();

	let activeWorkDayId = null;
	if (!openWorkDaySnapshot.empty) {
		activeWorkDayId = openWorkDaySnapshot.docs[0].id;
		console.log(
			`Found active workday ${activeWorkDayId} for this party order.`
		);
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
		items: userItems, // This array now contains the full dish object with the category
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
		stripeFeeActual: stripeFeeActual,
		platformFeeActual: platformFeeActual,
	};

	await newOrderRef.set(orderData);
	console.log(
		`✅ Successfully created permanent order ${newOrderRef.id} from party payment.`
	);
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

	switch (event.type) {
		case "payment_intent.succeeded":
			const paymentIntentId = paymentIntent.id;
			console.log(
				`Processing payment_intent.succeeded for PI: ${paymentIntentId}`
			);

			// --- 1. Retrieve Charge Details to get Exact Fees ---
			const chargeId = paymentIntent.latest_charge;
			let stripeFeeActual = 0;
			let amountTransferred = 0;
			const platformFeeCollected = paymentIntent.application_fee_amount || 0;
			const finalAmountCharged = paymentIntent.amount;

			if (chargeId && typeof chargeId === "string") {
				try {
					const chargeDetails = await stripeInstance.charges.retrieve(
						chargeId,
						{
							expand: ["balance_transaction"],
						}
					);
					const balanceTransaction = chargeDetails.balance_transaction;
					if (
						balanceTransaction &&
						typeof balanceTransaction.fee === "number"
					) {
						stripeFeeActual = balanceTransaction.fee;
						amountTransferred = balanceTransaction.net - platformFeeCollected;
					} else {
						console.warn(
							`Webhook Warn: Balance transaction or fee missing for Charge ${chargeId}.`
						);
					}
				} catch (chargeRetrieveError) {
					console.error(
						`Webhook Error: Could not retrieve charge ${chargeId}.`,
						chargeRetrieveError
					);
				}
			} else {
				console.warn(
					`Webhook Warn: No charge ID found on PaymentIntent ${paymentIntentId}. Cannot get exact fees.`
				);
			}

			// --- 2. Differentiate between Party Payment and Individual Order ---
			if (metadata.type === "party_payment") {
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
			} else {
				// --- Handle a successful INDIVIDUAL order payment (your original detailed logic) ---
				const firestoreDocId = metadata.firestoreDocId;
				if (!firestoreDocId) {
					console.error(
						"🔴 Individual payment succeeded but is missing firestoreDocId in metadata.",
						metadata
					);
					return;
				}

				const orderDocRef = db.collection("orders").doc(firestoreDocId);
				try {
					const updateData = {
						paymentStatus: "paid",
						orderStatus: "confirmed",
						stripePaymentIntentId: paymentIntentId,
						stripeChargeId: typeof chargeId === "string" ? chargeId : null,
						stripeFeeActual: stripeFeeActual,
						platformFeeActual: platformFeeCollected,
						taxActual: Number(metadata.calculated_tax_amount) || 0,
						totalPrice: finalAmountCharged,
						amountTransferredToRestaurant: amountTransferred,
						lastUpdated: new Date(),
					};
					await orderDocRef.update(updateData);
					console.log(
						`✅ Successfully updated individual order ${firestoreDocId} to paid with full details.`
					);

					// Optionally, update table status if applicable
					const orderData = (await orderDocRef.get()).data();
					if (orderData.table.id && orderData.restaurantId) {
						const tableRef = db
							.collection("restaurants")
							.doc(orderData.restaurantId)
							.collection("tables")
							.doc(orderData.table.id);

						await tableRef.update({
							status: "checkedOut",
							currentCheckInId: null,
							currentCustomerId: null,
						});

						if (orderData.userId) {
							const customerRef = db
								.collection("customers")
								.doc(orderData.userId);
							console.log(
								`Webhook: Clearing activeCheckIn for customer ${orderData.userId}.`
							);
							await customerRef.update({
								activeCheckIn: null, // Clear the check-in object
							});
							console.log(`✅ Successfully cleared customer's activeCheckIn.`);
						}
						// 3. Mark the original check-in as 'COMPLETED'.
						if (orderData.checkInId) {
							const checkInRef = db
								.collection("checkIns")
								.doc(orderData.checkInId);
							await checkInRef.update({
								status: "COMPLETED", // Mark as completed to remove from restaurant's active queue
								updatedAt: FieldValue.serverTimestamp(),
							});
							console.log(
								`✅ Successfully updated checkIn ${orderData.checkInId} status to COMPLETED.`
							);
						}
					}
				} catch (error) {
					console.error(
						`Error updating individual order ${firestoreDocId}:`,
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
			restaurantId,
			customerId,
			// Pre-tax amounts from client:
			subtotal, // Pre-tax subtotal (after discounts) in cents
			gratuity, // Gratuity amount in cents
			platformFee, // Your calculated potential platform fee (e.g., 5%) in cents
			// Data for Stripe Tax calculation:
			lineItems, // Array like [{ amount(pre-tax cents), quantity, tax_code, description }]
			customerDetails, // Object like { address: { postal_code, country, state, ... } }
			// Other necessary data
			connectedAccountId,
			setup_future_usage, // 'off_session' or undefined
			paymentMethodId, // ID if using saved card
			metadata, // MUST include internalOrderId, firestoreDocId, etc.
		} = data;

		// --- Basic Validation ---
		if (
			!restaurantId ||
			!customerId ||
			!connectedAccountId ||
			!lineItems ||
			!Array.isArray(lineItems) ||
			lineItems.length === 0
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing required parameters."
			);
		}
		if (
			typeof subtotal !== "number" ||
			typeof gratuity !== "number" ||
			typeof platformFee !== "number"
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Amounts must be numbers (cents)."
			);
		}
		try {
			// Add more validation as needed...
			const keys = await getStripeKeys(restaurantId);
			const stripeSecretKey = keys.stripeSecretKey;
			const stripeInstance = stripe(stripeSecretKey, {
				apiVersion: "2023-10-16",
			});

			// --- 1. Calculate Tax using Stripe Tax API ---
			let calculatedTaxAmount = 0;
			// Only calculate if lineItems have amount > 0? Prevents unnecessary API call for $0 cart.
			const preTaxAmountForTaxCalc = lineItems.reduce(
				(sum, item) => sum + (item.amount || 0) * (item.quantity || 1),
				0
			);

			if (preTaxAmountForTaxCalc > 0) {
				// Avoid tax calc on $0
				// Basic address check - adjust as needed for international
				if (
					!customerDetails.address.country ||
					(!customerDetails.address.postal_code &&
						!customerDetails.address.state)
				) {
					console.warn(
						"Insufficient address details provided for tax calculation. Proceeding without tax."
					);
					// You might choose to throw an error here depending on requirements
					// throw new functions.https.HttpsError("invalid-argument", "Address (country, state/postal code) required for tax.");
				} else {
					console.log("Calling Stripe Tax Calculation API...");
					const taxCalculation = await stripeInstance.tax.calculations.create({
						currency: "usd",
						line_items: lineItems, // Use the lineItems array directly
						customer_details: customerDetails,
					});

					calculatedTaxAmount = taxCalculation.tax_amount_exclusive || 0; // Tax in cents
					console.log(`Stripe Tax Calculated: ${calculatedTaxAmount} cents`);
				}
			} else {
				console.log("Skipping tax calculation for zero amount.");
			}

			// --- 2. Calculate Final Amount ---
			const finalAmount =
				subtotal + gratuity + platformFee + calculatedTaxAmount; // All in cents

			// --- 3. Determine Actual Application Fee based on Waiver Flag ---
			let applicationFeeToCharge = platformFee;

			let platformCoversStripeFeeForRestaurant = false;
			const restaurantRef = db.collection("restaurants").doc(restaurantId);
			const restaurantSnap = await restaurantRef.get();
			// --- FIX: Use .exists PROPERTY, not function() ---
			if (!restaurantSnap.exists) {
				// Check existence property first
				console.error(
					`Restaurant document ${restaurantId} not found when checking waiver.`
				);
				// Decide: throw error or proceed with default fee? Throwing is safer.
				throw new functions.https.HttpsError(
					"not-found",
					"Restaurant configuration not found."
				);
			} else {
				// Document exists, now check the flag
				const restaurantData = restaurantSnap.data();
				console.log("Restaurant data for waiver check:", restaurantData);
				// Use your actual field name for the waiver flag
				if (restaurantData.waivePlatformFee === true) {
					platformCoversStripeFeeForRestaurant = true;
					const finalAmount =
						subtotal + gratuity + platformFee + calculatedTaxAmount; // Use finalAmount for estimate
					const estimatedStripeFee = Math.round(finalAmount * 0.029) + 30;
					applicationFeeToCharge = Math.max(
						0,
						platformFee - estimatedStripeFee
					);
					console.log(
						`Platform covering Stripe fee. Adjusted App Fee: ${applicationFeeToCharge}`
					);
				} else {
					console.log(
						`Platform *not* covering Stripe fee. App Fee Charged: ${platformFee}`
					);
					applicationFeeToCharge = platformFee; // Explicitly set if waiver flag is false/missing
				}
			}
			// --- End Fee Determination ---

			// --- 4. Create Payment Intent ---
			const paymentIntentParams = {
				amount: finalAmount,
				currency: "usd",
				customer: customerId,
				application_fee_amount: applicationFeeToCharge,
				transfer_data: { destination: connectedAccountId },
				on_behalf_of: connectedAccountId,
				metadata: {
					// Ensure essential IDs are passed from client and included here
					...(metadata || {}),
					restaurantId: restaurantId,
					calculated_tax_amount: calculatedTaxAmount, // Store calculated tax
					calculated_platform_fee: platformFee,
					platform_covers_stripe_fee:
						platformCoversStripeFeeForRestaurant.toString(),
				},
				// If using saved card, set payment_method and confirm:true
				// If using Payment Sheet for new card, set setup_future_usage and confirm:false (handled by sheet)
				// confirmation_method: 'automatic', // Recommended for Payment Intents API
				// confirm: false, // Default for Payment Sheet flow, set true if using saved card ID
			};
			// Add payment_method only if provided and confirming immediately
			if (paymentMethodId) {
				paymentIntentParams.payment_method = paymentMethodId;
				paymentIntentParams.confirm = true; // IMPORTANT: Confirm now if using saved card
				console.log(
					"Creating and confirming PaymentIntent with saved payment method."
				);
			} else {
				// Set for Payment Sheet to handle confirmation and potential card saving
				paymentIntentParams.setup_future_usage =
					setup_future_usage || "off_session";
				paymentIntentParams.payment_method_options = {
					card: { request_three_d_secure: "automatic" },
				};
				paymentIntentParams.automatic_payment_methods = {
					enabled: true,
					allow_redirects: "never",
				}; // Often used with Payment Sheet
				console.log("Creating PaymentIntent for Payment Sheet confirmation.");
			}

			const paymentIntent = await stripeInstance.paymentIntents.create(
				paymentIntentParams
			);
			console.log(`Payment Intent ${paymentIntent.id} created.`);

			// --- 5. Create Ephemeral Key ---
			// Use a reasonably recent, supported API version
			const apiVersion = "2023-10-16"; // Or check Stripe docs
			const ephemeralKey = await stripeInstance.ephemeralKeys.create(
				{ customer: customerId },
				{ apiVersion: apiVersion }
			);
			console.log("Ephemeral Key created.");

			// --- 6. Return necessary data to Client ---
			return {
				paymentIntentClientSecret: paymentIntent.client_secret,
				ephemeralKeySecret: ephemeralKey.secret,
				customerId: customerId, // Return customerId for convenience
				calculatedTaxAmount: calculatedTaxAmount, // Return calculated tax
				finalAmount: finalAmount, // Return final amount
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

exports.createPaymentIntent = functions
	.runWith({
		secrets: [
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
		], // Declare required secrets
	})
	.https.onCall(async (data, context) => {
		// 2. Get Stripe key based on account type

		const keys = await getStripeKeys(data.restaurantId);
		const stripeSecretKey = keys.stripeSecretKey;

		const {
			amount,
			subtotal,
			tax,
			gratuity,
			fee,
			currentUserData,
			restaurantNumber,
			customerId,
			table,
			connectedAccountId,
		} = data;

		try {
			if (isNaN(amount) || amount <= 0) {
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Invalid amount provided"
				);
			}

			let applicationFeeToCharge = fee; // Default to charging the full platform fee
			let platformCoverStripeFeeForRestaurant = false;

			// Fetch restaurant setting
			const restaurantRef = db.collection("restaurants").doc(data.restaurantId);
			const restaurantSnap = await restaurantRef.get();

			if (!restaurantSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Restaurant not found"
				);
			}

			const restaurantData = restaurantSnap.data();
			if (restaurantData.platformCoverStripeFeeForRestaurant === true) {
				platformCoverStripeFeeForRestaurant = true;
				// Calculate estimated Stripe fee to adjust application fee
				const estimatedStripeFee = Math.round(amount * 0.029) + 30;
				applicationFeeToCharge = Math.max(0, fee - estimatedStripeFee); // platform takes less so restaurant gets more
				console.log(
					`Platform covering stripe fee for restaurant ${data.restaurantId}`
				);
			} else
				[
					console.log(
						`Platform *not* covering Stripe fee for restaurant ${data.restaurantId}`
					),
				];
			// End fee determination

			const paymentIntent = await stripe(stripeSecretKey).paymentIntents.create(
				{
					amount: amount,
					currency: "usd",
					customer: customerId,
					setup_future_usage: "off_session",
					application_fee_amount: applicationFeeToCharge,
					transfer_data: {
						destination: connectedAccountId,
					},

					metadata: {
						tax: tax,
						gratuity: gratuity,
						table: table,
						calculated_platform_fee: fee,
						platform_covers_stripe_fee:
							platformCoverStripeFeeForRestaurant.toString(),
						subtotal: subtotal,
						purpose: "restaurant payment",
						restaurantId: data.restaurantId,
					},
				}
			);

			return { clientSecret: paymentIntent.client_secret };
		} catch (error) {
			console.error("Error creating PaymentIntent: ", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

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
			lineItems,
			customerDetails,
		} = data;

		// --- 1. Validation ---
		if (
			!partyId ||
			!amount ||
			!restaurantStripeAccountId ||
			subtotal === undefined ||
			gratuity === undefined ||
			!lineItems ||
			!customerDetails
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

			// --- 4. Get or Create Stripe Customer ---
			let stripeCustomerId = userDoc.data().stripeCustomerId;
			if (!stripeCustomerId) {
				console.log(`Creating new Stripe customer for user ${customerUid}.`);
				const customer = await stripeInstance.customers.create({
					email: userDoc.data().email,
					name: `${userDoc.data().firstName} ${userDoc.data().lastName}`,
				});
				stripeCustomerId = customer.id;
				await userDocRef.update({ stripeCustomerId: stripeCustomerId });
			}

			let calculatedTaxAmount = 0;
			if (lineItems.length > 0) {
				const taxCalculation = await stripeInstance.tax.calculations.create({
					currency: "usd",
					line_items: lineItems,
					customer_details: customerDetails,
				});
				calculatedTaxAmount = taxCalculation.tax_amount_exclusive || 0;
			}
			// --- END OF FIX ---

			// Calculate the final total amount on the server.
			const finalAmount =
				subtotal + gratuity + platformFee + calculatedTaxAmount;
			if (finalAmount <= 49) {
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Payment amount is too low."
				);
			}

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
					tax: calculatedTaxAmount, // Add calculated tax to metadata
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
				calculatedTaxAmount: calculatedTaxAmount,
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

