import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { functions } from "../config/firebase.native";

/**
 * Initiates a secure dLocal Go checkout session via Firebase and Expo WebBrowser
 * * @param {number} amount - The total order amount
 * @param {string} orderId - Your database order ID
 * @returns {Promise<{success: boolean, url?: string, reason?: string, error?: any}>}
 */
const processPayment = async (amount, orderId, language) => {
	try {
		const createCheckout = functions.httpsCallable("createDlocalCheckout");
		const response = await createCheckout({ amount, orderId, language });

		const { redirectUrl } = response.data;
		const urlLang = language === "en" ? "en" : "es";
		const finalRedirectUrl = redirectUrl.includes("?")
			? `${redirectUrl}&lang=${urlLang}`
			: `${redirectUrl}?lang=${urlLang}`;

		// 🚨 THE FIX: Use AuthSession. It listens for your 'scerv://' deep link!
		const returnUrl = "scerv://";
		const browserResult = await WebBrowser.openAuthSessionAsync(
			finalRedirectUrl,
			returnUrl,
		);

		// If the browser caught the deep link, it returns type: "success" and the URL
		if (browserResult.type === "success" && browserResult.url) {
			if (browserResult.url.includes("payment-success")) {
				return { action: "success", orderId: orderId };
			} else if (browserResult.url.includes("payment-cancel")) {
				return {
					action: "cancelled",
					reason: "User cancelled on payment page",
				};
			}
		}

		// If they just hit the "Done/X" button manually without paying
		return { action: "dismissed" };
	} catch (error) {
		console.error("Adapter Error:", error);
		return { action: "error", error: error.message };
	}
};

const processNativePayment = async (amount, orderId, cardData) => {
	try {
		console.log("🔒 Initiating Secure Native Checkout for Order:", orderId);

		// 1. Call a NEW Cloud Function designed specifically for native processing
		const processNative = functions.httpsCallable("processDlocalNativePayment");

		// 2. Send the payload to Firebase
		const response = await processNative({
			amount: amount,
			orderId: orderId,
			cardData: cardData, // { name, number, exp_month, exp_year, cvv, document }
		});

		// 3. Handle the server's response
		if (response.data && response.data.success) {
			console.log("✅ dLocal Native Charge Successful!");
			return { success: true };
		} else {
			console.error("❌ dLocal Native Charge Failed:", response.data.error);
			return {
				success: false,
				error:
					response.data.error ||
					"Your card was declined. Please try another payment method.",
			};
		}
	} catch (error) {
		console.error("🚨 Native Adapter Error:", error);
		return {
			success: false,
			error: "Network error. Please check your connection and try again.",
		};
	}
};
const dLocalAdapter = {
	processPayment,
	processNativePayment,
};

export default dLocalAdapter;
