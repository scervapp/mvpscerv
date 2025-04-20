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

// // Minimal placeholder function
// exports.stripeWebhookTest = functions.https.onRequest((request, response) => {
// 	console.log("Test Webhook Placeholder Received Call");
// 	response.status(200).send({ received: true }); // Acknowledge Stripe
// });

// exports.stripeWebhookLive = functions.https.onRequest((request, response) => {
// 	console.log("Live Webhook Placeholder Received Call");
// 	response.status(200).send({ received: true }); // Acknowledge Stripe
// });

// Stripe Webhook Handler - Updated with Professional Comments and Structure

// Stripe Webhook Handler - Updated with Correct Variable Names and Professional Comments

// --- Shared Helper Function to Process Verified Events ---
const handleStripeEvent = async (event, stripeInstance) => {
	// stripeInstance is passed in correctly (initialized with correct TEST/LIVE key)
	console.log(`🔔 Handling event: ${event.id}, Type: ${event.type}`);

	// We are now only focusing on Payment Intent events for the Payment Sheet flow
	switch (event.type) {
		case "payment_intent.succeeded":
			const paymentIntent = event.data.object; // event.data.object IS the PaymentIntent
			const paymentIntentId = paymentIntent.id; // <<< Get ID directly
			const metadata = paymentIntent.metadata || {}; // Metadata is ON the PaymentIntent
			const restaurantId = metadata.restaurantId;
			const internalOrderId = metadata.internalOrderId; // Your readable ID from metadata
			const firestoreDocId = metadata.firestoreDocId; // Firestore document ID from metadata
			// Tax was pre-calculated and stored in metadata by preparePaymentSheetData
			const taxCollected = Number(metadata.calculated_tax_amount) || 0; // <<< Get Tax from metadata
			const platformFeePotential =
				Number(metadata.calculated_platform_fee) || 0; // Potential fee

			console.log(
				`Processing payment_intent.succeeded for PI: ${paymentIntentId}`
			);

			// --- Pre-Check essential data ---
			// Ensure we have the IDs needed to find the order and keys
			if (!paymentIntentId || !restaurantId || !firestoreDocId) {
				console.error("🔴 Missing essential data (PI Succeeded)", {
					paymentIntentId,
					restaurantId,
					firestoreDocId,
					internalOrderId,
				});
				return; // Acknowledge event, but cannot process it fully
			}
			console.log("--- PI Succeeded Pre-Check Passed ---");

			try {
				// --- Use Firestore Doc ID to get reference ---
				const orderDocRef = db.collection("orders").doc(firestoreDocId); // Use Firestore ID
				console.log(
					`Webhook (PI Succeeded): Targeting order document: ${orderDocRef.path}`
				);

				// --- Retrieve Charge/Balance Txn if needed for exact fees ---
				const chargeId = paymentIntent.latest_charge; // Get charge ID from PI
				let stripeFeeActual = 0;
				let amountTransferred = 0;
				const platformFeeCollected = paymentIntent.application_fee_amount || 0;
				const finalAmountCharged = paymentIntent.amount || 0;

				if (chargeId && typeof chargeId === "string") {
					try {
						console.log(
							`Webhook (PI Succeeded): Retrieving Charge ${chargeId} expanding balance_transaction...`
						);
						const chargeDetails = await stripeInstance.charges.retrieve(
							chargeId,
							{
								expand: ["balance_transaction"],
							}
						);
						const balanceTransaction = chargeDetails.balance_transaction;
						console.log(`Webhook (PI Succeeded): Charge Retrieved.`);

						if (
							balanceTransaction &&
							typeof balanceTransaction.fee === "number" &&
							typeof balanceTransaction.net === "number"
						) {
							stripeFeeActual = balanceTransaction.fee;
							amountTransferred = balanceTransaction.net - platformFeeCollected;
							console.log(
								`  Actual Stripe Fee (Balance Txn): ${stripeFeeActual} cents`
							);
							console.log(
								`  Amount Transferred (Calc): ${amountTransferred} cents`
							);
						} else {
							if (!balanceTransaction) {
								console.warn(
									`Warn: Balance transaction missing for Charge ${chargeId}.`
								);
							} else {
								console.warn(
									`Warn: Balance transaction missing fee/net for Charge ${chargeId}.`
								);
							}
							const estimatedStripeFeeFallback =
								Math.round(finalAmountCharged * 0.029) + 30;
							amountTransferred =
								finalAmountCharged -
								estimatedStripeFeeFallback -
								platformFeeCollected;
							console.warn(`  Storing $0 for actual Stripe fee.`);
							console.warn(
								`  Storing ESTIMATED Amount Transferred: ${amountTransferred} cents`
							);
							stripeFeeActual = 0;
						}
					} catch (chargeRetrieveError) {
						console.error(
							`Webhook Error retrieving charge ${chargeId}:`,
							chargeRetrieveError
						);
						console.warn(
							`Proceeding without exact balance tx data. Storing $0 fee, estimating transfer.`
						);
						const estimatedStripeFeeFallback =
							Math.round(finalAmountCharged * 0.029) + 30;
						amountTransferred =
							finalAmountCharged -
							estimatedStripeFeeFallback -
							platformFeeCollected;
						stripeFeeActual = 0;
					}
				} else {
					console.warn(
						`No latest_charge ID found on PaymentIntent ${paymentIntentId}. Cannot get exact fees.`
					);
					// Fallback for transfer amount if charge ID is missing
					const estimatedStripeFeeFallback =
						Math.round(finalAmountCharged * 0.029) + 30;
					amountTransferred =
						finalAmountCharged -
						estimatedStripeFeeFallback -
						platformFeeCollected;
					stripeFeeActual = 0;
				}
				const platformNetProfit = platformFeeCollected - stripeFeeActual; // Use safely determined fee

				// --- Update Firestore Document ---
				const updateData = {
					paymentStatus: "paid",
					orderStatus: "confirmed", // Or "preparing" etc.
					// stripeCheckoutSessionId: null, // No Session ID in this flow
					stripePaymentIntentId: paymentIntentId,
					stripeChargeId: typeof chargeId === "string" ? chargeId : null, // Store charge ID if available
					stripeFeeActual: stripeFeeActual,
					platformFeeActual: platformFeeCollected, // Actual collected
					taxActual: taxCollected, // Use tax from metadata
					totalPrice: finalAmountCharged, // Use final amount from PI
					amountTransferredToRestaurant: amountTransferred,
					platformFeeWaived: platformFeeCollected < platformFeePotential, // Check against potential fee from metadata
					lastUpdated: FieldValue.serverTimestamp(),
				};
				console.log(
					`Webhook (PI Succeeded): Attempting to update Firestore doc ${orderDocRef.id}`
				);
				await orderDocRef.update(updateData); // Use namespaced update method
				console.log(
					`Webhook (PI Succeeded): Firestore document ${orderDocRef.id} updated successfully.`
				);

				// --- Update Table Status ---
				const orderSnap = await orderDocRef.get();
				const orderData = orderSnap.data();
				if (orderData.table.id && restaurantId) {
					const tableRef = db
						.collection("restaurants")
						.doc(restaurantId)
						.collection("tables")
						.doc(orderData.table.id);
					await tableRef.update({ status: "checkedOut" });
					console.log(`Table ${orderData.table.id} status updated.`);
				}
			} catch (error) {
				console.error(
					`Webhook Error processing payment_intent.succeeded ${paymentIntentId}:`,
					error
				);
				throw error; // Propagate error to potentially trigger Stripe retry
			}
			break; // End case payment_intent.succeeded

		// --- Handle other relevant events for Payment Sheet flow ---
		case "payment_intent.payment_failed":
			const paymentIntentFailed = event.data.object;
			const errorData = paymentIntentFailed.last_payment_error; // Get error details
			const failedMetadata = paymentIntentFailed.metadata || {};
			const failedFirestoreDocId = failedMetadata.firestoreDocId; // Get Firestore Doc ID

			console.log(
				`Processing payment_intent.payment_failed for PI: ${paymentIntentFailed.id}`
			);

			// Extract failure details safely
			const failureReason =
				errorData.message || "Payment failed due to an unknown reason.";
			const failureCode = errorData.code || "unknown";
			console.error(
				`  Failure Reason: ${failureReason} (Code: ${failureCode})`
			);

			// Try to update the corresponding order document
			if (failedFirestoreDocId) {
				const orderDocRef = db.collection("orders").doc(failedFirestoreDocId);
				try {
					console.log(
						`Webhook: Attempting to update order ${orderDocRef.id} status to 'payment_failed'.`
					);
					await orderDocRef.update({
						paymentStatus: "failed",
						orderStatus: "cancelled", // Or keep 'pending_payment'? Decide your desired order status
						paymentFailureReason: failureReason, // Store reason for display
						paymentFailureCode: failureCode, // Store code for reference
						lastUpdated: FieldValue.serverTimestamp(),
					});
					console.log(
						`Webhook: Firestore document ${orderDocRef.id} updated successfully for failed payment.`
					);
				} catch (updateError) {
					console.error(
						`Webhook Error: Failed to update Firestore for failed payment PI ${paymentIntentFailed.id}, Order Doc ${failedFirestoreDocId}:`,
						updateError
					);
					// Log error, but still return 200 OK to Stripe as we can't retry this update easily here
				}
			} else {
				console.error(
					"Webhook Error: Cannot update order status for failed PI - Missing firestoreDocId in metadata."
				);
			}
			break;

		case "charge.refunded":
			// ... (Your existing charge.refunded logic - find order via PI id, update status/refund amount) ...
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
			throw new functions.https.HttpsError("unauthenticated", "Auth required.");
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
						line_items: lineItems.map((item) => ({
							amount: Math.round(item.amount),
							quantity: item.quantity || 1,
							tax_code: item.tax_code,
							reference: item.id || item.name,
						})),
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
			console.error("🔴 TEST Webhook Error: Missing secrets.");
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

exports.createCheckoutSession = functions;
// 	.runWith({
// 		// Needs API keys to get correct secret, check waiver flag
// 		secrets: [
// 			STRIPE_SECRET_KEY_LIVE,
// 			STRIPE_SECRET_KEY_TEST,
// 			// Add publishable/webhook secrets IF getStripeKeys still returns them
// 			STRIPE_PUBLISHABLE_KEY_LIVE,
// 			STRIPE_PUBLISHABLE_KEY_TEST,
// 			STRIPE_WEBHOOK_SECRET_LIVE,
// 			STRIPE_WEBHOOK_SECRET_TEST,
// 		],
// 	})
// 	.https.onCall(async (data, context) => {
// 		if (!context.auth) {
// 			throw new functions.https.HttpsError(
// 				"unauthenticated",
// 				"User must be authenticated."
// 			);
// 		}

// 		// Destructure expected data from client
// 		const {
// 			restaurantId,
// 			lineItems, // Expecting [{ name, amount(pre-tax cents), currency, quantity, tax_code }]
// 			customerId,
// 			connectedAccountId,
// 			fee, // Your calculated platform fee (e.g., 5%) in cents
// 			metadata, // Pass other data needed for webhook/records
// 		} = data;

// 		// --- Basic Validation ---
// 		if (
// 			!restaurantId ||
// 			!customerId ||
// 			!connectedAccountId ||
// 			!lineItems ||
// 			!Array.isArray(lineItems) ||
// 			lineItems.length === 0
// 		) {
// 			throw new functions.https.HttpsError(
// 				"invalid-argument",
// 				"Missing required parameters (restaurantId, customerId, connectedAccountId, lineItems)."
// 			);
// 		}
// 		if (typeof fee !== "number" || fee < 0) {
// 			throw new functions.https.HttpsError(
// 				"invalid-argument",
// 				"Invalid platform fee provided."
// 			);
// 		}
// 		// Add validation for lineItems structure if needed

// 		try {
// 			const keys = await getStripeKeys(restaurantId); // Use helper to get correct mode's secret key
// 			const stripeSecretKey = keys.stripeSecretKey;

// 			// --- Determine Actual Application Fee based on Waiver Flag ---
// 			let applicationFeeToCharge = fee; // Default to client calculated fee
// 			let platformCoversStripeFeeForRestaurant = false; // For metadata
// 			const restaurantRef = db.collection("restaurants").doc(restaurantId);
// 			const restaurantSnap = await restaurantRef.get();
// 			if (!restaurantSnap.exists) {
// 				throw new functions.https.HttpsError(
// 					"not-found",
// 					"Restaurant configuration not found."
// 				);
// 			}
// 			const restaurantData = restaurantSnap.data();
// 			// --- Use your actual field name for waiver ---
// 			if (restaurantData.waivePlatformFee === true) {
// 				platformCoversStripeFeeForRestaurant = true;
// 				// Calculate estimated Stripe fee to adjust application fee
// 				// Note: This still uses an estimate. The actual fee depends on the final amount *after* tax.
// 				const preliminaryAmount =
// 					lineItems.reduce(
// 						(sum, item) => sum + item.amount * item.quantity,
// 						0
// 					) + fee;
// 				const estimatedStripeFee = Math.round(preliminaryAmount * 0.029) + 30;
// 				applicationFeeToCharge = Math.max(0, fee - estimatedStripeFee); // Reduce your take
// 				console.log(
// 					`Platform covering Stripe fee for restaurant ${restaurantId}. Original Fee: ${fee}, Est. Stripe Fee: ${estimatedStripeFee}, App Fee Charged: ${applicationFeeToCharge}`
// 				);
// 			} else {
// 				console.log(
// 					`Platform *not* covering Stripe fee for restaurant ${restaurantId}. App Fee Charged: ${fee}`
// 				);
// 				applicationFeeToCharge = fee; // Ensure it uses the full fee if not waived
// 			}
// 			// --- End Fee Determination ---

// 			// --- Create Checkout Session ---
// 			const sessionParams = {
// 				payment_method_types: ["card"], // Or other methods
// 				mode: "payment",
// 				customer: customerId,
// 				line_items: lineItems.map((item) => ({
// 					// Map client items to Stripe format
// 					price_data: {
// 						currency: item.currency || "usd",
// 						product_data: {
// 							name: item.name || "Order Item",
// 							tax_code: item.tax_code,
// 						},
// 						unit_amount: Math.round(item.amount), // Ensure integer cents (this is PRE-TAX amount)
// 						tax_behavior: "exclusive", // IMPORTANT: Tax calculated by Stripe Tax is added on top
// 					},
// 					quantity: item.quantity || 1,
// 				})),
// 				// --- Enable Stripe Tax ---
// 				automatic_tax: { enabled: true },
// 				// --- Success and Cancel URLs (Using Custom Scheme) ---
// 				// Replace 'yourappscheme' with your actual URL scheme
// 				success_url: `https://scerv.com/stripe_success.html?session_id={CHECKOUT_SESSION_ID}`,
// 				cancel_url: `https://scerv.com/stripe_cancel.html`,
// 				// --- Payment Intent Data (Fees, Transfer, Metadata) ---
// 				metadata: {
// 					...(metadata || {}), // Merge client metadata
// 					restaurantId: restaurantId, // Ensure this is included for webhook
// 					calculated_platform_fee: fee, // Store original potential fee
// 					platform_covers_stripe_fee:
// 						platformCoversStripeFeeForRestaurant.toString(),
// 				},

// 				payment_intent_data: {
// 					application_fee_amount: applicationFeeToCharge, // Use the adjusted fee
// 					transfer_data: {
// 						destination: connectedAccountId,
// 					},

// 					// Allow saving card info entered via Checkout
// 					setup_future_usage: "off_session", // Set desired future usage
// 				},
// 				customer_update: {
// 					address: "auto",
// 				},
// 			};

// 			console.log(
// 				"Creating Checkout Session with params:",
// 				JSON.stringify(sessionParams, null, 2)
// 			);
// 			const session = await stripe(stripeSecretKey).checkout.sessions.create(
// 				sessionParams
// 			);

// 			console.log(`Checkout Session ${session.id} created successfully.`);
// 			// Return the session ID and the URL for redirection
// 			return { sessionId: session.id, checkoutUrl: session.url };
// 		} catch (error) {
// 			console.error("Error creating checkout session:", error);
// 			const errorMessage =
// 				error.raw.message ||
// 				error.message ||
// 				"Failed to create checkout session.";
// 			const errorCode =
// 				error.code ||
// 				(error.raw.code ? `stripe_${error.raw.code}` : "internal");
// 			// It's often helpful to log the raw Stripe error object
// 			console.error(
// 				"Raw Stripe Error:",
// 				JSON.stringify(error.raw || error, null, 2)
// 			);
// 			throw new functions.https.HttpsError(errorCode, errorMessage, error);
// 		}
// 	});
