// screens/customer/PayPalScreen.js
import React, { useRef, useState } from "react";
import { View, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { CommonActions } from "@react-navigation/native"; // Make sure to import this!

import colors from "../../utils/styles/appStyles";
import { captureOrder, createOrder } from "../../services/PaypalAdapter";
// Removed chargeSavedCard and db imports since they aren't needed in the WebView

export default function PayPalScreen({ route, navigation }) {
	const webViewRef = useRef(null);
	const [isLoading, setIsLoading] = useState(false);

	// =========================================================
	// 1. EXTRACT EVERYTHING ONCE RIGHT HERE
	// =========================================================
	const {
		amount,
		subtotal,
		gratuity,
		platformFee,
		restaurantId,
		appOrderId,
		paymentType,
		itemsToRate,
	} = route.params;

	const handleMessage = async (event) => {
		const safeString = (val) => {
			if (typeof val === "string") return val;
			try {
				return JSON.stringify(val);
			} catch (e) {
				return String(val);
			}
		};

		let data;
		try {
			data = JSON.parse(event.nativeEvent.data);
		} catch (e) {
			return;
		}

		// --- CREATE ORDER ---
		if (data.type === "CREATE_ORDER") {
			try {
				// Pass the new saveCard boolean into your adapter
				const orderID = await createOrder(amount, restaurantId, data.saveCard);

				const js = `if(window.resolveOrder) { window.resolveOrder('${orderID}'); } true;`;
				webViewRef.current?.injectJavaScript(js);
			} catch (err) {
				Alert.alert("Error", String(err));
			}
		}

		// --- CAPTURE ORDER ---
		if (data.type === "CAPTURE_ORDER") {
			try {
				setIsLoading(true);

				console.log(
					`Capturing standard PayPal order for DB Order ID: ${appOrderId}`,
				);

				// 2. Call the adapter (Using the variables we unpacked at the top!)
				const result = await captureOrder(
					data.orderID,
					appOrderId,
					paymentType,
					restaurantId,
				);

				// 3. Navigate away on success
				if (result.success || result) {
					setIsLoading(false);
					console.log(
						"✅ Payment successful! Navigating to confirmation screen.",
					);

					navigation.dispatch(
						CommonActions.reset({
							index: 0,
							routes: [
								{
									name: "OrderConfirmation",
									params: {
										initialStatus: "processing",
										itemsToRate: itemsToRate,
										isIndividual: true,
										origin: "individual",
									},
								},
							],
						}),
					);
				}
			} catch (err) {
				console.log("CAPTURE ERROR:", err);
				Alert.alert("Capture Failed", String(err));
				setIsLoading(false);
			}
		}

		// --- ERROR HANDLING ---
		if (data.type === "ERROR") {
			Alert.alert("PayPal Error", safeString(data.message));
			setIsLoading(false);
		}
	};

	return (
		<View style={styles.container}>
			<WebView
				ref={webViewRef}
				source={{
					uri: `https://scerv-mobile-assets.web.app/paypal-bridge.html?v=${Date.now()}`,
				}}
				onMessage={handleMessage}
				onLoadEnd={() => {
					const uiData = JSON.stringify({
						type: "SET_UI_TOTALS",
						subtotal: subtotal,
						gratuity: gratuity,
						platformFee: platformFee,
						finalTotal: amount,
					});

					webViewRef.current?.injectJavaScript(`
                        document.dispatchEvent(new MessageEvent('message', {
                            data: '${uiData}'
                        }));
                        true;
                    `);
				}}
			/>
			{isLoading && (
				<View style={styles.loaderOverlay}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: "#fff" },
	loaderOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(255,255,255,0.7)",
		justifyContent: "center",
		alignItems: "center",
	},
});
