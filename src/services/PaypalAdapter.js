// api/paypalAdapter.js
// Import from your custom native config
import { functions } from "../config/firebase.native";

export const createOrder = async (amount, restaurantId, saveCard = false) => {
	try {
		// Call the Firebase HTTPS Callable Function
		const response = await functions.httpsCallable("createPayPalOrder")({
			amount: amount,
			restaurantId: restaurantId,
			saveCard: saveCard, // <-- Pass the flag to Firebase
		});

		if (response.data.error) throw new Error(response.data.error);

		return response.data.orderID;
	} catch (error) {
		console.error("Adapter Error creating order:", error);
		throw error;
	}
};

export const captureOrder = async (
	orderID,
	appOrderId,
	paymentType,
	restaurantId,
) => {
	try {
		const response = await functions.httpsCallable("capturePayPalOrder")({
			orderID,
			appOrderId,
			paymentType,
			restaurantId, // <-- NEW: Passing it to the Cloud Function
		});

		if (response.data.error) throw new Error(response.data.error);
		return response.data;
	} catch (error) {
		throw error;
	}
};

export const chargeSavedCard = async (
	vaultId,
	amount,
	restaurantId,
	appOrderId,
	paymentType,
) => {
	try {
		const response = await functions.httpsCallable("chargeVaultedCard")({
			vaultId,
			amount,
			restaurantId,
			appOrderId, // <-- NEW: Passing the pending_orders document ID
			paymentType, // <-- NEW: "individual" or "party"
		});

		if (response.data.error || !response.data.success) {
			throw new Error(response.data.error || "Payment failed");
		}
		return response.data;
	} catch (error) {
		throw error;
	}
};
