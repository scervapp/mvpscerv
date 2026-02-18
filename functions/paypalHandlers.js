const functions = require("firebase-functions");

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
	return { token: data.access_token, baseUrl };
}

exports.createPayPalOrder = functions
	.runWith({
		secrets: [
			"PAYPAL_SANDBOX_CLIENT_ID",
			"PAYPAL_SANDBOX_CLIENT_SECRET",
			"PAYPAL_LIVE_CLIENT_ID",
			"PAYPAL_LIVE_CLIENT_SECRET",
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth)
			throw new functions.https.HttpsError(
				"unauthenticated",
				"Login required.",
			);

		try {
			const { token, baseUrl } = await getPayPalAccessToken();

			const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					intent: "CAPTURE",
					purchase_units: [
						{
							amount: { currency_code: "USD", value: data.amount.toString() },
							description: `Order for ${data.restaurantId}`,
						},
					],
				}),
			});

			const order = await response.json();
			return { orderID: order.id, mode: process.env.PAYPAL_MODE };
		} catch (error) {
			throw new functions.https.HttpsError("internal", error.message);
		}
	});

/**
 * Capture an approved PayPal order
 */
exports.capturePayPalOrder = functions
	.runWith({
		secrets: [
			"PAYPAL_SANDBOX_CLIENT_ID",
			"PAYPAL_SANDBOX_CLIENT_SECRET",
			"PAYPAL_LIVE_CLIENT_ID",
			"PAYPAL_LIVE_CLIENT_SECRET",
		],
	})
	.https.onCall(async (data, context) => {
		// Auth check
		if (!context.auth)
			throw new functions.https.HttpsError(
				"unauthenticated",
				"Login required.",
			);

		const { orderID } = data;
		if (!orderID)
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Missing orderID.",
			);

		try {
			const { token, baseUrl } = await getPayPalAccessToken();

			// The URL for capture is /v2/checkout/orders/{id}/capture
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

			if (!response.ok) {
				console.error("PayPal Capture Error:", captureData);
				throw new Error(
					captureData.message || "Failed to capture PayPal order",
				);
			}

			// SUCCESS logic
			// Here is where you would update your Firestore 'orders' doc to status: 'paid'
			return {
				success: true,
				status: captureData.status, // Should be 'COMPLETED'
				transactionId: captureData.purchase_units[0].payments.captures[0].id,
			};
		} catch (error) {
			console.error("PAYPAL_CAPTURE_ERROR:", error);
			throw new functions.https.HttpsError("internal", error.message);
		}
	});
