const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { fulfillOrder } = require("./paymentFunctions");
const {
	emitDgiInvoice,
	emitDgiInvoiceInternal,
} = require("./restaurantFunctions");
const db = admin.firestore();

/**
 * Helper function to get dLocal config based on the specific restaurant's status.
 * Note: You must now pass 'restaurantId' into this function whenever you call it!
 */
async function getDlocalConfig(restaurantId) {
	if (!restaurantId) {
		throw new Error(
			"getDlocalConfig requires a restaurantId to determine the environment.",
		);
	}

	// 1. Look up the restaurant in Firestore
	const restaurantDoc = await db
		.collection("restaurants")
		.doc(restaurantId)
		.get();

	if (!restaurantDoc.exists) {
		throw new Error(`Restaurant ${restaurantId} not found.`);
	}

	// 2. Check their specific 'isLive' flag (Default to false/sandbox for safety)
	const isLive = restaurantDoc.data().isLive === true;

	// 3. Return the correct keys
	return {
		apiKey: isLive
			? process.env.DLOCAL_LIVE_API_KEY
			: process.env.DLOCAL_SANDBOX_API_KEY,
		secretKey: isLive
			? process.env.DLOCAL_LIVE_SECRET_KEY
			: process.env.DLOCAL_SANDBOX_SECRET_KEY,
		baseUrl: isLive
			? "https://api.dlocalgo.com"
			: "https://api-sbx.dlocalgo.com",
		isLive: isLive, // Handy flag to pass back just in case you need to know
	};
}

const getRestaurantCountryCode = async (restaurantId) => {
	const restaurantDoc = await db.collection("restaurants").doc(restaurantId).get();

	if (!restaurantDoc.exists) {
		throw new functions.https.HttpsError("not-found", "Restaurant not found.");
	}

	const restaurantData = restaurantDoc.data() || {};
	return String(
		restaurantData.countryCode || restaurantData.country || "",
	).trim();
};

const isUsCountry = (countryCode) => {
	const normalized = String(countryCode || "").trim().toLowerCase();
	return ["us", "usa", "united states", "united states of america"].includes(
		normalized,
	);
};

const assertDlocalAllowedForRestaurant = async (restaurantId) => {
	const countryCode = await getRestaurantCountryCode(restaurantId);

	if (isUsCountry(countryCode)) {
		throw new functions.https.HttpsError(
			"failed-precondition",
			"US restaurants must use Stripe for card payments.",
		);
	}

	return countryCode;
};

exports.getDlocalPublicKey = functions
	.runWith({
		secrets: [
			"DLOCAL_SMART_FIELDS_LIVE_KEY",
			"DLOCAL_SMART_FIELDS_SANDBOX_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		const { restaurantId } = data;

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required to fetch the correct Smart Fields key.",
			);
		}

		await assertDlocalAllowedForRestaurant(restaurantId);

		// 1. Look up the restaurant in Firestore
		const restaurantDoc = await db
			.collection("restaurants")
			.doc(restaurantId)
			.get();

		if (!restaurantDoc.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Restaurant not found.",
			);
		}

		// 2. Check their specific 'isLive' flag
		const isLive = restaurantDoc.data().isLive === true;

		// 3. Select the correct Smart Fields Key based on the restaurant's environment
		const smartFieldsKey = isLive
			? process.env.DLOCAL_SMART_FIELDS_LIVE_KEY
			: process.env.DLOCAL_SMART_FIELDS_SANDBOX_KEY;

		if (!smartFieldsKey) {
			console.error(
				`Missing Smart Fields Key for mode: ${isLive ? "live" : "sandbox"}`,
			);
			throw new functions.https.HttpsError(
				"internal",
				"Payment configuration error.",
			);
		}

		return {
			publicKey: smartFieldsKey,
			isLive: isLive, // Optional: lets the frontend know which environment loaded
		};
	});

exports.createDlocalCheckout = functions
	// CRITICAL: We list ALL 4 secrets here so the vault unlocks them!
	.runWith({
		secrets: [
			"DLOCAL_LIVE_API_KEY",
			"DLOCAL_LIVE_SECRET_KEY",
			"DLOCAL_SANDBOX_API_KEY",
			"DLOCAL_SANDBOX_SECRET_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		// 1. Security Check
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"You must be logged in to create a payment.",
			);
		}

		// 2. Grab the correct keys and URL based on current mode!
		const { apiKey, secretKey, baseUrl } = await getDlocalConfig();

		const { amount, orderId, language } = data;

		if (!amount || !orderId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Amount and Order ID are required.",
			);
		}

		try {
			// 3. Call the dLocal Go API using the dynamic baseUrl
			const response = await fetch(`${baseUrl}/v1/payments`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// 4. Use the dynamic keys
					Authorization: `Bearer ${apiKey}:${secretKey}`,
				},
				body: JSON.stringify({
					amount: amount / 100,
					currency: "USD",
					country: "PA",
					language: language,
					description: `Order #${orderId}`,
					success_url: `https://scervmvp.web.app/payment-success?orderId=${orderId}`,
					back_url: `https://scervmvp.web.app/payment-cancel`,
					notification_url:
						"https://us-central1-scervmvp.cloudfunctions.net/dlocalWebhook",
				}),
			});

			const responseData = await response.json();

			if (!response.ok) {
				console.error("dLocal Go API Error:", responseData);
				throw new Error(
					responseData.message || "Failed to generate dLocal Go payment link",
				);
			}

			return {
				success: true,
				redirectUrl: responseData.redirect_url,
				paymentId: responseData.id,
			};
		} catch (error) {
			console.error("Error creating checkout:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Could not create payment link",
			);
		}
	});

exports.dlocalWebhook = functions
	.runWith({
		secrets: [
			"DLOCAL_LIVE_API_KEY",
			"DLOCAL_LIVE_SECRET_KEY",
			"DLOCAL_SANDBOX_API_KEY",
			"DLOCAL_SANDBOX_SECRET_KEY",
		],
	})
	.https.onRequest(async (req, res) => {
		const payload = req.body;
		console.log("dLocal Go Webhook Received:", payload);

		const paymentId = payload.payment_id || payload.id;

		if (!paymentId) {
			return res.status(400).send("Bad Request");
		}

		try {
			// 🚨 THE FIX: Look up the order FIRST so we can find the restaurantId
			const pendingOrdersRef = db.collection("pending_orders");
			const snapshot = await pendingOrdersRef
				.where("paymentIntentId", "==", paymentId)
				.limit(1)
				.get();

			if (snapshot.empty) {
				console.log(
					`[Webhook] Order with payment ID ${paymentId} not found in pending_orders.`,
				);
				return res.status(200).send("Ignored - Not a Scerv order");
			}

			const pendingData = snapshot.docs[0].data();
			const realOrderId = snapshot.docs[0].id;
			const restaurantId = pendingData.restaurantId;

			// 🚨 THE FIX: Now we can dynamically fetch the correct keys!
			const { apiKey, secretKey, baseUrl } =
				await getDlocalConfig(restaurantId);

			// Make a secure GET request to dLocal to fetch the full payment details
			const verifyResponse = await fetch(
				`${baseUrl}/v1/payments/${paymentId}`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${apiKey}:${secretKey}`,
						"Content-Type": "application/json",
					},
				},
			);

			const paymentData = await verifyResponse.json();
			const status = paymentData.status;
			const amountPaid = paymentData.amount;

			// Run the fulfillment logic
			if (status === "PAID" || status === "APPROVED") {
				await fulfillOrder({
					orderId: realOrderId,
					paymentType:
						pendingData.paymentType || pendingData.type || "individual",
					userId: pendingData.customerId || pendingData.userId,
					restaurantId: restaurantId,
					processor: "dlocal",
					processorTransactionId: paymentId,
					totalPrice: Math.round(amountPaid * 100),
					processorFeeActual: 0,
					platformFeeActual: pendingData.platformFee || 0,
				});

				console.log(
					`[Webhook] ✅ Successfully triggered fulfillOrder for ${realOrderId}`,
				);
			}

			res.status(200).send("Webhook Received and Verified");
		} catch (error) {
			console.error("[Webhook] Verification or Fulfillment Error:", error);
			res.status(500).send("Internal Server Error");
		}
	});
exports.processDlocalNativePayment = functions
	// 1. Pull the secrets securely, exactly like your webhook
	.runWith({
		secrets: [
			"DLOCAL_LIVE_API_KEY",
			"DLOCAL_LIVE_SECRET_KEY",
			"DLOCAL_SANDBOX_API_KEY",
			"DLOCAL_SANDBOX_SECRET_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		// 2. Ensure the user is authenticated
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"You must be logged in to pay.",
			);
		}

		const { amount, orderId, cardData } = data;

		if (!amount || !orderId || !cardData) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing required payment data.",
			);
		}

		try {
			console.log(`🔒 Starting Native Checkout for Order: ${orderId}`);

			// 3. Get your secure keys using your existing helper function!
			// (Make sure getDlocalConfig() is imported or defined in this file)
			const { apiKey, secretKey, baseUrl } = await getDlocalConfig();

			// ==========================================
			// STEP 1: TOKENIZE THE CARD
			// ==========================================
			const tokenPayload = {
				card: {
					holder_name: cardData.name,
					number: cardData.number,
					expiration_month: parseInt(cardData.exp_month),
					expiration_year: parseInt(cardData.exp_year),
					cvv: cardData.cvv,
				},
			};

			const tokenResponse = await fetch(`${baseUrl}/v1/tokens`, {
				method: "POST",
				headers: {
					// Match the exact auth format your webhook uses:
					Authorization: `Bearer ${apiKey}:${secretKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(tokenPayload),
			});

			const tokenData = await tokenResponse.json();

			if (!tokenResponse.ok) {
				console.error("Tokenization failed:", tokenData);
				throw new Error(tokenData.message || "Failed to secure card data.");
			}

			const tokenId = tokenData.id;
			console.log(`✅ Card Tokenized Successfully: ${tokenId}`);

			// ==========================================
			// STEP 2: PROCESS THE PAYMENT WITH THE TOKEN
			// ==========================================
			const paymentPayload = {
				amount: amount / 100, // Make sure to divide by 100 if amount is in cents!
				currency: "USD", // Update to PAB or your target currency if needed
				token: tokenId,
				external_id: orderId, // Links the dLocal payment to your Firebase Order ID
				payer: {
					name: cardData.name,
					document: cardData.document,
					email: context.auth.token.email || "no-email@provided.com",
				},
			};

			const paymentResponse = await fetch(`${baseUrl}/v1/payments`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}:${secretKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(paymentPayload),
			});

			const paymentData = await paymentResponse.json();

			// ==========================================
			// STEP 3: HANDLE SUCCESS OR FAILURE
			// ==========================================
			if (
				paymentResponse.ok &&
				(paymentData.status === "PAID" ||
					paymentData.status === "PENDING" ||
					paymentData.status === "APPROVED")
			) {
				console.log(`✅ Charge Successful for Order: ${orderId}`);

				// 🚨 CRITICAL DIFFERENCE FROM WEBHOOK:
				// Because this is a direct, synchronous API call, we DO NOT trigger fulfillOrder() here.
				// We just mark it as processing. The dLocal Webhook (which you pasted above)
				// will fire a few seconds later, catch the 'PAID' status, and trigger fulfillOrder() automatically!

				await db.collection("pending_orders").doc(orderId).update({
					status: "processing",
					paymentIntentId: paymentData.id,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});

				return { success: true, dlocalOrderId: paymentData.id };
			} else {
				console.error(`❌ Charge Failed. Status: ${paymentData.status}`);
				return {
					success: false,
					error: paymentData.message || "Card declined by the processor.",
				};
			}
		} catch (error) {
			console.error(
				"🚨 Cloud Function Error in Native Payment:",
				error.message,
			);
			return {
				success: false,
				error:
					error.message ||
					"Payment processing failed. Please check your card details.",
			};
		}
	});

exports.processDlocalTokenCharge = functions
	.runWith({
		secrets: [
			"DLOCAL_LIVE_API_KEY",
			"DLOCAL_LIVE_SECRET_KEY",
			"DLOCAL_SANDBOX_API_KEY",
			"DLOCAL_SANDBOX_SECRET_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		// 1. Security Check
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"You must be logged in to pay.",
			);
		}

		const { pendingOrderId, token, amount, email, name, document } = data;

		if (!pendingOrderId || !token || !amount) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing required payment data.",
			);
		}

		try {
			console.log(
				`🔒 Starting Tokenized Checkout for Order: ${pendingOrderId}`,
			);

			// 2. Get secure keys dynamically
			const { apiKey, secretKey, baseUrl } = await getDlocalConfig();

			// 3. Process the payment with the token generated by the frontend WebView
			const paymentPayload = {
				amount: amount / 100, // Converting cents to decimal
				currency: "USD",
				token: token, // <--- The secure token from Smart Fields!
				external_id: pendingOrderId,
				payer: {
					name: name || "Scerv Guest",
					email: email || context.auth.token.email || "guest@scerv.com",
					document: document || undefined, // Pass if Cedula is required
				},
			};

			// 4. Hit the dLocal API using native fetch
			const paymentResponse = await fetch(`${baseUrl}/v1/payments`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}:${secretKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(paymentPayload),
			});

			const paymentData = await paymentResponse.json();

			if (!paymentResponse.ok) {
				console.error("dLocal Charge Failed:", paymentData);
				throw new Error(paymentData.message || "Failed to process card.");
			}

			// 5. Handle Success (Matching your webhook architecture)
			if (
				paymentData.status === "PAID" ||
				paymentData.status === "PENDING" ||
				paymentData.status === "APPROVED"
			) {
				console.log(`✅ Charge Successful for Order: ${pendingOrderId}`);

				// Update the pending order. The Webhook will handle the actual fulfillOrder()!
				await db.collection("pending_orders").doc(pendingOrderId).update({
					status: "processing",
					paymentIntentId: paymentData.id,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});

				return { success: true, dlocalOrderId: paymentData.id };
			} else {
				console.error(`❌ Charge Failed. Status: ${paymentData.status}`);
				return {
					success: false,
					error: paymentData.message || "Card declined by the processor.",
				};
			}
		} catch (error) {
			console.error("🚨 Cloud Function Error in Token Payment:", error.message);
			return {
				success: false,
				error: error.message || "Payment processing failed.",
			};
		}
	});

// =====================================================================
// 1. GENERATE THE SMART FIELDS CHECKOUT TOKEN
// =====================================================================
exports.createDlocalPayment = functions
	.runWith({
		secrets: [
			"DLOCAL_LIVE_API_KEY",
			"DLOCAL_LIVE_SECRET_KEY",
			"DLOCAL_SANDBOX_API_KEY",
			"DLOCAL_SANDBOX_SECRET_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be logged in.",
			);
		}

		// 🚨 THE FIX: Extract restaurantId from the frontend data
		const { amount, currency, country, restaurantId } = data;

		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"restaurantId is required.",
			);
		}

		await assertDlocalAllowedForRestaurant(restaurantId);

		// 🚨 THE FIX: Pass it into the config!
		const { apiKey, secretKey, baseUrl } = await getDlocalConfig(restaurantId);

		try {
			const response = await fetch(`${baseUrl}/v1/payments`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}:${secretKey}`,
				},
				body: JSON.stringify({
					amount: amount / 100,
					currency: currency || "USD",
					country: country || "PA",
					description: "Scerv Smart Fields Order",
					allow_transparent: true,
					success_url: "https://scerv.com/success",
					back_url: "https://scerv.com/cancel",
					notification_url: `https://${process.env.GCLOUD_PROJECT}.cloudfunctions.net/dlocalWebhook`,
				}),
			});

			const responseData = await response.json();

			if (!response.ok) {
				console.error("dLocal API Error:", responseData);
				throw new Error(
					responseData.message || "Failed to generate checkout token",
				);
			}

			return {
				merchant_checkout_token: responseData.merchant_checkout_token,
				payment_id: responseData.id,
			};
		} catch (error) {
			console.error("Error creating Smart Fields payment:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Could not create Smart Fields token",
			);
		}
	});

// =====================================================================
// 2. CONFIRM AND CHARGE THE SMART FIELDS TOKEN
// =====================================================================

exports.confirmDlocalPayment = functions
	.runWith({
		timeoutSeconds: 120,
		secrets: [
			"DLOCAL_LIVE_API_KEY",
			"DLOCAL_LIVE_SECRET_KEY",
			"DLOCAL_SANDBOX_API_KEY",
			"DLOCAL_SANDBOX_SECRET_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be logged in.",
			);
		}

		const {
			pendingOrderId,
			checkoutToken,
			cardToken,
			clientFirstName,
			clientLastName,
			clientDocument,
			clientDocumentType,
			clientEmail,
			country,
			saveDetails,
			restaurantId,
		} = data || {};

		if (!pendingOrderId || typeof pendingOrderId !== "string") {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"pendingOrderId is required.",
			);
		}

		if (!checkoutToken || typeof checkoutToken !== "string") {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"checkoutToken is required.",
			);
		}

		if (!cardToken || typeof cardToken !== "string") {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"cardToken is required.",
			);
		}

		const uid = context.auth.uid;
		const shouldSaveDetails = saveDetails === true;

		try {
			console.log(
				`[ConfirmDlocal] Starting confirmation for pendingOrderId=${pendingOrderId}, uid=${uid}`,
			);

			// 1. Validate pending order before charging
			const pendingOrderRef = db
				.collection("pending_orders")
				.doc(pendingOrderId);
			const pendingOrderSnap = await pendingOrderRef.get();

			if (!pendingOrderSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Pending order not found.",
				);
			}

			const pendingOrderData = pendingOrderSnap.data() || {};
			const effectiveRestaurantId =
				pendingOrderData.restaurantId || restaurantId || null;

			if (!effectiveRestaurantId) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Pending order is missing restaurant information.",
				);
			}

			await assertDlocalAllowedForRestaurant(effectiveRestaurantId);

			if (
				restaurantId &&
				pendingOrderData.restaurantId &&
				restaurantId !== pendingOrderData.restaurantId
			) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Restaurant mismatch on pending order.",
				);
			}

			const normalizedTotal = Number(pendingOrderData.totalPrice || 0);
			if (normalizedTotal <= 0) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Pending order has an invalid total.",
				);
			}

			// Idempotency / duplicate-processing guard
			if (
				pendingOrderData.paymentStatus === "paid" ||
				pendingOrderData.status === "paid" ||
				pendingOrderData.status === "fulfilled"
			) {
				console.log(
					`[ConfirmDlocal] Pending order ${pendingOrderId} already processed.`,
				);
				return {
					success: true,
					status: "ALREADY_PROCESSED",
					paymentId: pendingOrderData.paymentIntentId || null,
				};
			}

			// 2. Resolve dLocal config from trusted restaurant id
			const { apiKey, secretKey, baseUrl } = await getDlocalConfig(
				effectiveRestaurantId,
			);

			console.log(
				`[ConfirmDlocal] Confirming Smart Fields payment for order ${pendingOrderId}`,
			);

			// 3. Build dLocal confirmation payload
			// IMPORTANT: we do NOT support card vaulting here; only saving billing details locally.
			const paymentPayload = {
				cardToken,
				clientFirstName: clientFirstName || "Guest",
				clientLastName: clientLastName || "User",
				clientDocumentType: clientDocumentType || "CIP",
				clientDocument: clientDocument || "8-888-8888",
				clientEmail: clientEmail || "customer@scerv.com",
				country: country || "PA",
				save_card: false,
			};

			// 4. Call dLocal
			const confirmResponse = await fetch(
				`${baseUrl}/v1/payments/confirm/${checkoutToken}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}:${secretKey}`,
					},
					body: JSON.stringify(paymentPayload),
				},
			);

			const confirmData = await confirmResponse.json();
			console.log(
				"[ConfirmDlocal] Raw dLocal response:",
				JSON.stringify(confirmData),
			);

			// 5. Handle HTTP-level failures
			if (!confirmResponse.ok) {
				console.error(
					"[ConfirmDlocal] dLocal HTTP rejection:",
					JSON.stringify(confirmData),
				);

				return {
					success: false,
					status: "FAILED",
					error:
						confirmData.message ||
						confirmData.code ||
						"Card declined by processor.",
				};
			}

			// 6. Success / approval handling
			const isApproved =
				confirmData.status === "PAID" ||
				confirmData.status === "PROCESSING" ||
				confirmData.status === "APPROVED" ||
				confirmData.success === true;

			if (isApproved) {
				const finalPaymentId =
					confirmData.payment_id || confirmData.id || "captured";

				// Mark pending order as processing before fulfillment
				await pendingOrderRef.update({
					status: "processing",
					paymentIntentId: finalPaymentId,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});

				// 7. Save billing details to customer document if requested
				if (shouldSaveDetails) {
					try {
						const normalizedEmail =
							typeof clientEmail === "string"
								? clientEmail.trim().toLowerCase()
								: "";

						const normalizedName =
							`${clientFirstName || ""} ${clientLastName || ""}`.trim();

						const customerUpdatePayload = {
							dlocalName: normalizedName,
							dlocalDocument: clientDocument || "",
							dlocalDocumentType: clientDocumentType || "CIP",
							updatedAt: admin.firestore.FieldValue.serverTimestamp(),
						};

						if (normalizedEmail) {
							customerUpdatePayload.email = normalizedEmail;
						}

						await db
							.collection("customers")
							.doc(uid)
							.set(customerUpdatePayload, { merge: true });

						console.log(
							`[ConfirmDlocal] Saved billing details for user ${uid}`,
						);
					} catch (saveErr) {
						console.error(
							"[ConfirmDlocal] Failed to save customer billing details:",
							saveErr,
						);
						// Non-fatal: payment can still succeed even if details save fails
					}
				}

				// 8. Fulfillment must succeed, otherwise we surface failure
				console.log(
					`[ConfirmDlocal] Triggering fulfillOrder for ${pendingOrderId}`,
				);

				await fulfillOrder({
					orderId: pendingOrderId,
					paymentType: pendingOrderData.type || "party",
					userId: pendingOrderData.customerId || uid,
					customerEmail: pendingOrderData.customerEmail || clientEmail || null,
					customerName:
						pendingOrderData.customerName ||
						`${clientFirstName || ""} ${clientLastName || ""}`.trim() ||
						null,
					restaurantId: pendingOrderData.restaurantId,
					processor: "dlocal",
					processorTransactionId: finalPaymentId,
					totalPrice: pendingOrderData.totalPrice,
					processorFeeActual: 0,
					platformFeeActual: pendingOrderData.platformFee || 0,
				});

				console.log(
					`[ConfirmDlocal] fulfillOrder completed successfully for ${pendingOrderId}`,
				);

				emitDgiInvoiceInternal(pendingOrderId).catch((invoiceErr) => {
					console.error(
						`[ConfirmDlocal] DGI invoice emission failed for ${pendingOrderId}:`,
						invoiceErr,
					);
				});

				return {
					success: true,
					status: "PAID",
					paymentId: finalPaymentId,
					redirect_url: confirmData.redirect_url || null,
				};
			}

			// 9. 3DS / bank redirect flow
			if (confirmData.redirect_url) {
				return {
					success: false,
					status: "PENDING_3DS",
					redirect_url: confirmData.redirect_url,
				};
			}

			// 10. Silent fail / unsupported status
			return {
				success: false,
				status: "FAILED",
				error:
					confirmData.message || confirmData.status || "Unknown dLocal error",
			};
		} catch (error) {
			console.error("[ConfirmDlocal] Cloud Function Error:", error);

			if (error instanceof functions.https.HttpsError) {
				throw error;
			}

			return {
				success: false,
				status: "ERROR",
				error: error.message || "Payment processing failed.",
			};
		}
	});

exports.chargeSavedDlocalCard = functions
	.runWith({
		timeoutSeconds: 120,
		secrets: [
			"DLOCAL_LIVE_API_KEY",
			"DLOCAL_LIVE_SECRET_KEY",
			"DLOCAL_SANDBOX_API_KEY",
			"DLOCAL_SANDBOX_SECRET_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be logged in.",
			);
		}

		const { pendingOrderId, cardToken } = data;
		const { apiKey, secretKey, baseUrl } = await getDlocalConfig();

		try {
			console.log(`⚡ Charging Saved Card for Order: ${pendingOrderId}`);

			const pendingOrderSnap = await db
				.collection("pending_orders")
				.doc(pendingOrderId)
				.get();
			if (!pendingOrderSnap.exists) {
				throw new Error("Order not found.");
			}
			const pendingData = pendingOrderSnap.data();

			// 🚨 THE FIX: Convert Stripe-style cents (2172) to dLocal floats (21.72)
			let rawAmount = Number(pendingData.totalPrice);
			if (rawAmount >= 100 && Number.isInteger(rawAmount)) {
				rawAmount = rawAmount / 100; // Converts 2172 to 21.72
			}
			const amountToCharge = parseFloat(rawAmount.toFixed(2));

			// Build the Direct Charge Payload
			const paymentPayload = {
				amount: amountToCharge, // 🚨 Now sends 21.72
				currency: "USD",
				country: "PA",
				payment_method_id: "CARD",
				payer: {
					name: "Scerv Customer",
					email: `${context.auth.uid}@users.scerv.com`,
					document: "8-888-8888", // Panama Cedula fallback
				},
				card: {
					token: cardToken,
				},
			};

			console.log(
				"DEBUG: Sending Payload to dLocal:",
				JSON.stringify(paymentPayload),
			);

			// Hit the DIRECT payments endpoint
			const chargeResponse = await fetch(`${baseUrl}/v1/payments`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}:${secretKey}`,
				},
				body: JSON.stringify(paymentPayload),
			});

			const chargeData = await chargeResponse.json();
			console.log("DEBUG: Direct Charge Response:", JSON.stringify(chargeData));

			if (!chargeResponse.ok) {
				throw new Error(
					chargeData.message || chargeData.code || "Card declined.",
				);
			}

			// Success Logic & Fulfillment
			if (chargeData.status === "PAID" || chargeData.status === "APPROVED") {
				const finalPaymentId = chargeData.id || "captured";

				await db.collection("pending_orders").doc(pendingOrderId).update({
					status: "processing",
					paymentIntentId: finalPaymentId,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});

				await fulfillOrder({
					orderId: pendingOrderId,
					paymentType: pendingData.type || "party",
					userId: context.auth.uid,
					restaurantId: pendingData.restaurantId,
					processor: "dlocal",
					processorTransactionId: finalPaymentId,
					totalPrice: pendingData.totalPrice,
					processorFeeActual: 0,
					platformFeeActual: pendingData.platformFee || 0,
				});

				console.log(
					`✅ fulfillOrder completed for direct charge ${pendingOrderId}`,
				);
				return { success: true, status: "PAID", paymentId: finalPaymentId };
			} else {
				return {
					success: false,
					status: chargeData.status,
					error: chargeData.message || "Unknown error",
				};
			}
		} catch (error) {
			console.error("Cloud Function Direct Charge Error:", error);
			return {
				success: false,
				status: "ERROR",
				error: error.message || "Payment failed.",
			};
		}
	});
