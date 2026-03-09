const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { fulfillOrder } = require("./paymentFunctions");
const db = admin.firestore();

async function getDlocalConfig() {
	// We default to sandbox to protect you from accidental real charges
	const mode = process.env.DLOCAL_MODE || "sandbox";
	const isLive = mode === "live";

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
	};
}

exports.getDlocalPublicKey = functions
	// CRITICAL: Unlock the specific Smart Fields keys!
	.runWith({
		secrets: [
			"DLOCAL_SMART_FIELDS_LIVE_KEY",
			"DLOCAL_SMART_FIELDS_SANDBOX_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		// We default to sandbox to protect you from accidental real charges
		const mode = process.env.DLOCAL_MODE || "sandbox";
		const isLive = mode === "live";

		// Select the correct Smart Fields Key based on the environment
		const smartFieldsKey = isLive
			? process.env.DLOCAL_SMART_FIELDS_LIVE_KEY
			: process.env.DLOCAL_SMART_FIELDS_SANDBOX_KEY;

		if (!smartFieldsKey) {
			console.error(`Missing Smart Fields Key for mode: ${mode}`);
			throw new functions.https.HttpsError(
				"internal",
				"Payment configuration error.",
			);
		}

		return {
			publicKey: smartFieldsKey,
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
	// 1. Unlock the secrets needed to securely ping dLocal Go's servers
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

		// 2. Grab the thin ID they sent us
		const paymentId = payload.payment_id || payload.id;

		if (!paymentId) {
			console.error("No payment ID in webhook.");
			return res.status(400).send("Bad Request");
		}

		try {
			// 3. Get our secure keys and dynamic URL
			const { apiKey, secretKey, baseUrl } = await getDlocalConfig();

			// 4. Make a secure GET request to dLocal to fetch the full payment details
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
			console.log("Verified Payment Data from dLocal:", paymentData);

			// 5. Extract the REAL data securely
			const status = paymentData.status;
			const amountPaid = paymentData.amount;

			// 🚨 THE FIX: Extract the real Firebase ID from the success_url
			// Splits 'https://scerv.com/payment-success?orderId=bu8Oy8GrpPjLcFC6MBXt'
			let realOrderId;
			try {
				realOrderId = paymentData.success_url.split("orderId=")[1];
			} catch (e) {
				console.error("Failed to parse success_url for orderId.");
			}

			if (!realOrderId) {
				console.error("Could not extract real Order ID from dLocal payload.");
				return res.status(400).send("Missing Order ID");
			}

			// 6. Run the fulfillment logic using the REAL ID
			if (status === "PAID" || status === "APPROVED") {
				const pendingOrderRef = db
					.collection("pending_orders")
					.doc(realOrderId);
				const pendingOrderSnap = await pendingOrderRef.get();

				if (!pendingOrderSnap.exists) {
					console.log(
						`[Webhook] Order ${realOrderId} already processed or doesn't exist. Ignored.`,
					);
					return res.status(200).send("Already Processed");
				}

				const pendingData = pendingOrderSnap.data();

				// Trigger your robust fulfillOrder function!
				await fulfillOrder({
					orderId: realOrderId, // Passing the true Firebase ID
					paymentType: pendingData.paymentType || "individual",
					userId: pendingData.customerId || pendingData.userId,
					restaurantId: pendingData.restaurantId,
					processor: "dlocal",
					processorTransactionId: paymentId,
					totalPrice: Math.round(amountPaid * 100), // Converting back to cents for your DB
					processorFeeActual: 0,
					platformFeeActual: pendingData.platformFee || 0,
				});

				console.log(
					`[Webhook] ✅ Successfully triggered fulfillOrder for ${realOrderId}`,
				);
			}

			// Always respond 200 so dLocal knows we successfully handled it
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

		const { apiKey, secretKey, baseUrl } = await getDlocalConfig();
		const { amount, currency, country } = data;

		try {
			const response = await fetch(`${baseUrl}/v1/payments`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}:${secretKey}`,
				},
				body: JSON.stringify({
					amount: amount / 100, // Converting cents to decimal
					currency: currency || "USD",
					country: country || "PA",
					description: "Scerv Smart Fields Order",
					allow_transparent: true, // 🚨 CRITICAL: Unlocks Smart Fields token!
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
		secrets: [
			"DLOCAL_LIVE_API_KEY",
			"DLOCAL_LIVE_SECRET_KEY",
			"DLOCAL_SANDBOX_API_KEY",
			"DLOCAL_SANDBOX_SECRET_KEY",
		],
	})
	.https.onCall(async (data, context) => {
		// 1. Auth Guard
		if (!context.auth) {
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
		} = data;

		// Assumes getDlocalConfig() is defined elsewhere in your file
		const { apiKey, secretKey, baseUrl } = await getDlocalConfig();

		try {
			console.log(
				`🔒 Confirming Smart Fields Payment for Order: ${pendingOrderId}`,
			);

			// 2. Build dLocal Payload
			const paymentPayload = {
				cardToken: cardToken,
				clientFirstName: clientFirstName,
				clientLastName: clientLastName,
				clientDocumentType: clientDocumentType,
				clientDocument: clientDocument,
				clientEmail: clientEmail,
				country: country || "PA",
			};

			// 3. Hit dLocal API
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

			// 🚨 DEBUG LOG: X-Ray into dLocal's brain
			console.log("DEBUG: dLocal Raw Response:", JSON.stringify(confirmData));

			// 4. Handle HTTP Rejections
			if (!confirmResponse.ok) {
				console.error("Smart Fields Confirmation Failed:", confirmData);
				throw new Error(
					confirmData.message ||
						confirmData.code ||
						"Card declined by processor.",
				);
			}

			// 5. 🚨 THE FIX: Bulletproof Success Check
			if (
				confirmData.status === "PAID" ||
				confirmData.status === "PROCESSING" ||
				confirmData.status === "APPROVED" ||
				confirmData.success === true
			) {
				const finalPaymentId =
					confirmData.payment_id || confirmData.id || "captured";

				// A. Update Firestore Pending Order
				await db.collection("pending_orders").doc(pendingOrderId).update({
					status: "processing",
					paymentIntentId: finalPaymentId,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});

				// B. 🚨 NEW: Trigger fulfillOrder directly!
				try {
					console.log(
						`[Confirm] Triggering fulfillOrder for ${pendingOrderId}`,
					);

					const pendingOrderSnap = await db
						.collection("pending_orders")
						.doc(pendingOrderId)
						.get();

					if (pendingOrderSnap.exists) {
						const pendingData = pendingOrderSnap.data();

						await fulfillOrder({
							orderId: pendingOrderId,
							paymentType: pendingData.type || "party",
							userId: pendingData.customerId || context.auth.uid,
							restaurantId: pendingData.restaurantId,
							processor: "dlocal",
							processorTransactionId: finalPaymentId,
							totalPrice: pendingData.totalPrice,
							processorFeeActual: 0,
							platformFeeActual: pendingData.platformFee || 0,
						});
						console.log(
							`[Confirm] ✅ fulfillOrder completed successfully for ${pendingOrderId}`,
						);
					} else {
						console.error(
							`[Confirm] 🚨 pending_order ${pendingOrderId} not found for fulfillment!`,
						);
					}
				} catch (fulfillErr) {
					// We log this, but we DO NOT crash the function. The payment succeeded,
					// so we still want the user's app to navigate to the Success screen.
					console.error(
						"[Confirm] 🚨 fulfillOrder failed during confirmation:",
						fulfillErr,
					);
				}

				// C. Return explicit success to React Native
				return {
					success: true,
					status: "PAID",
					paymentId: finalPaymentId,
					redirect_url: confirmData.redirect_url || null,
				};
			}
			// 6. Handle 3D Secure / Bank Redirects
			else if (confirmData.redirect_url) {
				return {
					success: false,
					status: "PENDING_3DS",
					redirect_url: confirmData.redirect_url,
				};
			}
			// 7. Handle Silent Fails
			else {
				return {
					success: false,
					status: "FAILED",
					error:
						confirmData.message || confirmData.status || "Unknown dLocal error",
				};
			}
		} catch (error) {
			console.error("Cloud Function Error in Confirmation:", error);
			return {
				success: false,
				status: "ERROR",
				error: error.message || "Payment processing failed.",
			};
		}
	});
