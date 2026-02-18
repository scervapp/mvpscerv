import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config"; // Adjust path to your config

export const PayPalAdapter = {
	/**
	 * Primary function to handle PayPal Advanced/Standard flow
	 */
	process: async (orderData) => {
		try {
			const createOrder = httpsCallable(functions, "createPayPalOrder");

			// 1. Create the order on PayPal via Cloud Function
			const response = await createOrder({
				amount: orderData.total,
				currency: "USD",
				restaurantId: orderData.restaurantId,
				isParty: orderData.isParty || false,
			});

			const { orderID } = response.data;

			// 2. Here we will trigger the PayPal Checkout UI
			// (We will build the UI component next)
			return { orderID, success: true };
		} catch (error) {
			console.error("PayPal Adapter Error:", error);
			throw error;
		}
	},

	capture: async (orderID) => {
		const captureOrder = httpsCallable(functions, "capturePayPalOrder");
		return await captureOrder({ orderID });
	},
};
