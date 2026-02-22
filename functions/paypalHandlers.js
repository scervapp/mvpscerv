const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { fulfillOrder } = require("./paymentFunctions");
const db = admin.firestore();
/**
 * Automatically determines the correct keys and URL based on PAYPAL_MODE
 */
async function getPayPalConfig() {
	const mode = process.env.PAYPAL_MODE || "sandbox"; // Defaults to sandbox
	const isLive = mode === "live";

	return {
		clientId: isLive
			? process.env.PAYPAL_LIVE_CLIENT_ID
			: process.env.PAYPAL_SANDBOX_CLIENT_ID,
		clientSecret: isLive
			? process.env.PAYPAL_LIVE_CLIENT_SECRET
			: process.env.PAYPAL_SANDBOX_CLIENT_SECRET,
		baseUrl: isLive
			? "https://api-m.paypal.com"
			: "https://api-m.sandbox.paypal.com",
	};
}

async function getPayPalAccessToken() {
	const { clientId, clientSecret, baseUrl } = await getPayPalConfig();

	const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
	const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
		method: "POST",
		body: "grant_type=client_credentials",
		headers: {
			Authorization: `Basic ${auth}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
	});

	const data = await response.json();

	// 🔴 THE NEW SAFETY CHECK: This catches the silent failure
	if (!data.access_token) {
		console.error(
			"🚨 OAUTH FAILED - COULD NOT GET TOKEN. PAYPAL RESPONSE:",
			JSON.stringify(data, null, 2),
		);
		throw new Error(
			"Failed to generate PayPal Access Token. Check your Secrets.",
		);
	}

	return { token: data.access_token, baseUrl };
}

exports.createPayPalOrder = functions
	.runWith({
		secrets: ["PAYPAL_SANDBOX_CLIENT_ID", "PAYPAL_SANDBOX_CLIENT_SECRET"],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth)
			throw new functions.https.HttpsError(
				"unauthenticated",
				"Login required.",
			);

		try {
			const { token, baseUrl } = await getPayPalAccessToken();
			const formattedAmount = parseFloat(data.amount).toFixed(2);

			// 1. Build the base order payload
			const orderPayload = {
				intent: "CAPTURE",
				purchase_units: [
					{
						amount: { currency_code: "USD", value: formattedAmount },
						description: `Order for ${data.restaurantId}`,
					},
				],
			};

			// 2. THE MAGIC: If the user checked the box, add the Vault command
			if (data.saveCard) {
				orderPayload.payment_source = {
					card: {
						attributes: {
							vault: {
								store_in_vault: "ON_SUCCESS",
							},
						},
					},
				};
			}

			// 3. Send it to PayPal
			const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(orderPayload),
			});

			const order = await response.json();

			if (!order.id) {
				console.error(
					"PAYPAL REJECTION DETAILS:",
					JSON.stringify(order, null, 2),
				);
				return { orderID: null, error: order.name };
			}

			console.log(
				`Successfully created Order ID: ${order.id}. Vaulting requested: ${data.saveCard}`,
			);
			return { orderID: order.id };
		} catch (error) {
			console.error("CLOUD FUNCTION CRASH:", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});
/**
 * Capture an approved PayPal order
 */
exports.capturePayPalOrder = functions
	.runWith({
		secrets: ["PAYPAL_SANDBOX_CLIENT_ID", "PAYPAL_SANDBOX_CLIENT_SECRET"],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth)
			throw new functions.https.HttpsError(
				"unauthenticated",
				"Login required.",
			);
		const uid = context.auth.uid;

		// Extract all the variables we passed from React Native
		const { orderID, appOrderId, paymentType, restaurantId } = data;

		try {
			const { token, baseUrl } = await getPayPalAccessToken();

			// 1. Capture the funds
			const response = await fetch(
				`${baseUrl}/v2/checkout/orders/${orderID}/capture`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
				},
			);

			const captureData = await response.json();

			if (captureData.status !== "COMPLETED") {
				return {
					success: false,
					error: `Payment status is ${captureData.status}`,
				};
			}

			// 2. THE VAULT CATCHER (Saves the card if they checked the box)
			let savedVaultId = null;
			let last4 = "****";
			let brand = "CARD";

			if (captureData.payment_source && captureData.payment_source.card) {
				last4 = captureData.payment_source.card.last_digits || "****";
				brand = captureData.payment_source.card.brand || "CARD";

				if (captureData.payment_source.card.attributes.vault.id) {
					savedVaultId = captureData.payment_source.card.attributes.vault.id;

					await db
						.collection("customers")
						.doc(uid)
						.collection("savedPaymentMethods")
						.add({
							vaultId: savedVaultId,
							last4: last4,
							brand: brand,
							processor: "paypal",
							createdAt: admin.firestore.FieldValue.serverTimestamp(),
						});
				}
			}

			// ========================================================
			// 🚀 3. THE MAGIC: FULFILL THE ORDER AND CLEAN THE DB!
			// ========================================================
			try {
				// We need to calculate the total price in cents from the PayPal receipt
				// The receipt amount looks like "24.50", so we multiply by 100 to get 2450.
				const capturedAmountString =
					captureData.purchase_units[0].payments.captures[0].amount.value;
				const totalInCents = Math.round(parseFloat(capturedAmountString) * 100);

				await fulfillOrder({
					orderId: appOrderId,
					paymentType: paymentType,
					userId: uid,
					restaurantId: restaurantId,
					processor: "paypal",
					processorTransactionId: captureData.id,
					totalPrice: totalInCents,
					processorFeeActual: 0,
					platformFeeActual: 0,
				});
				console.log(`✅ FulfillOrder completed successfully for ${appOrderId}`);
			} catch (dbError) {
				console.error(
					`🚨 CRITICAL: PayPal captured ${captureData.id}, but DB fulfill failed for ${appOrderId}:`,
					dbError,
				);
			}

			// 4. Return success back to React Native
			return {
				success: true,
				orderID: orderID,
				vaultedCard: savedVaultId ? true : false,
				last4: last4,
				brand: brand,
			};
		} catch (error) {
			console.error("🚨 CAPTURE CLOUD FUNCTION CRASH:", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

exports.chargeVaultedCard = functions
	.runWith({
		secrets: ["PAYPAL_SANDBOX_CLIENT_ID", "PAYPAL_SANDBOX_CLIENT_SECRET"],
	})
	.https.onCall(async (data, context) => {
		// 1. Security Check
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"Login required.",
			);
		}

		// 🔴 NEW: We now extract appOrderId and paymentType from the React Native payload
		const { amount, vaultId, restaurantId, appOrderId, paymentType } = data;
		const formattedAmount = parseFloat(amount).toFixed(2);
		const uid = context.auth.uid;

		try {
			const { token, baseUrl } = await getPayPalAccessToken();

			console.log(
				`Charging Vault ID: ${vaultId} for $${formattedAmount} (Order: ${appOrderId})`,
			);

			// 2. Build the 1-Click Payload
			const chargePayload = {
				intent: "CAPTURE",
				purchase_units: [
					{
						amount: { currency_code: "USD", value: formattedAmount },
						description: `Order for ${restaurantId}`,
					},
				],
				payment_source: {
					token: {
						id: vaultId,
						type: "PAYMENT_METHOD_TOKEN",
					},
				},
			};

			// 3. Send the request to PayPal
			const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(chargePayload),
			});

			const captureData = await response.json();

			// 4. Handle any declines (e.g., expired card, NSF)
			if (
				captureData.error ||
				captureData.name === "UNPROCESSABLE_ENTITY" ||
				captureData.details
			) {
				console.error(
					"VAULT CHARGE ERROR:",
					JSON.stringify(captureData, null, 2),
				);
				return { success: false, error: "Payment declined or token invalid." };
			}

			if (captureData.status !== "COMPLETED") {
				console.error(
					"VAULT CHARGE NOT COMPLETED:",
					JSON.stringify(captureData, null, 2),
				);
				return {
					success: false,
					error: `Payment status is ${captureData.status}`,
				};
			}

			console.log(
				`✅ Successfully charged Vault ID ${vaultId}. PayPal Transaction ID: ${captureData.id}`,
			);

			// ========================================================
			// 🚀 5. THE MAGIC: PAYMENT SUCCEEDED, CALL fulfillOrder!
			// ========================================================
			try {
				await fulfillOrder({
					orderId: appOrderId, // The ID of the pending_orders document
					paymentType: paymentType, // "individual" or "party"
					userId: uid, // The paying customer
					restaurantId: restaurantId,
					processor: "paypal",
					processorTransactionId: captureData.id,
					totalPrice: Math.round(parseFloat(amount) * 100), // Convert standard dollars back to cents for DB
					processorFeeActual: 0, // Calculate PayPal fee later if needed for accounting
					platformFeeActual: 0, // Assuming platform fee is already in the pending order data
				});
				console.log(`✅ FulfillOrder completed successfully for ${appOrderId}`);
			} catch (dbError) {
				// We log this as CRITICAL because the user was charged, but the DB failed to update
				console.error(
					`🚨 CRITICAL: PayPal captured ${captureData.id}, but DB fulfill failed for ${appOrderId}:`,
					dbError,
				);
			}

			// 6. Return success back to React Native!
			return {
				success: true,
				orderID: captureData.id,
			};
		} catch (error) {
			console.error("🚨 VAULT CHARGE CRASH:", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});
