// CheckoutScreen.js (React Native - Stripe Checkout Version)

import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
	Button,
	Alert,
	Platform, // --- NEW: Import Platform (Optional but good for platform-specific logic)
	TouchableOpacity,
} from "react-native";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { functions, db } from "../../config/firebase"; // Your Firebase config
import { AuthContext } from "../../context/authContext";
import { Picker } from "@react-native-picker/picker";
import { useBasket } from "../../context/customer/BasketContext"; // Assuming you still need this
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"; // For icons
import {
	transformBasketData,
	useCheckInStatus,
} from "../../utils/customerUtils"; // Assuming you still need these
import { useStripe, StripeProvider } from "@stripe/stripe-react-native"; // <<< ADD BACK
import colors from "../../utils/styles/appStyles";

import formatCurrency from "../../utils/currencyFormatter";

const CheckoutScreen = ({ route, navigation }) => {
	const { restaurant, baskets } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const { clearBasket } = useBasket(); // Keep if needed post-webhook

	// --- State Variables ---
	const [isPreparing, setIsPreparing] = useState(false); // Loading state for preparing sheet
	const [isPaying, setIsPaying] = useState(false); // Loading state for actual payment presentation
	const [isLoading, setIsLoading] = useState(false); // For checkout action button
	const [isDataLoading, setIsDataLoading] = useState(true); // For initial config fetch
	const [paymentError, setPaymentError] = useState(null);
	const [fees, setFees] = useState(0.05); // Your platform fee percentage (e.g., 5%) - fetch this
	const [gratuityPercentage, setGratuityPercentage] = useState("15");
	const [expandedPIPs, setExpandedPIPs] = useState({}); // For collapsible sections

	// Use useRef to store the orderId across the reidrect reliably
	const pendingOrderIdRef = useRef(null);
	const pendingFirestoreDocIdRef = useRef(null); // FIresstore's UNIQUE Id

	const { checkInObj } = useCheckInStatus(
		restaurant?.uid,
		currentUserData?.uid
	); // Keep if needed for metadata

	const [isPaymentSheetReady, setIsPaymentSheetReady] = useState(false); // <<< ADD BACK
	const [stripePublishableKey, setStripePublishableKey] = useState(null);
	const [calculatedTax, setCalculatedTax] = useState(0); // Tax from server
	const [finalTotal, setFinalTotal] = useState(0); // Final total from server
	const [selectedCard, setSelectedCard] = useState(null); // State for saved card selection

	const { initPaymentSheet, presentPaymentSheet } = useStripe(); // <<< ADD BACK

	// --- Memoized Basket Items (Keep this) ---
	const restaurantBasketItems = useMemo(() => {
		const items = baskets[restaurant?.id]?.items || [];
		return items.filter((item) => item.sentToChefQ);
	}, [baskets, restaurant?.id]);

	// --- Memoized PIP Data (Keep this if needed for display) ---
	const filteredBasketData = useMemo(() => {
		const transformedData = transformBasketData(restaurantBasketItems);
		return transformedData.filter(
			(personData) => personData.items && personData.items.length > 0
		);
	}, [restaurantBasketItems]);

	// --- useEffect to Fetch Initial Config (e.g., Fees) ---
	useEffect(() => {
		let isMounted = true;
		const fetchInitialData = async () => {
			setIsDataLoading(true);
			try {
				const feesDocRef = doc(db, "appConfig", "general"); // Adjust path
				const feesSnap = await getDoc(feesDocRef);
				if (isMounted && feesSnap.exists()) {
					setFees(feesSnap.data().fees); // Make sure this is number like 0.05
				} else if (isMounted) {
					console.warn("Fee configuration not found, using default.");
					setFees(0.05); // Set default if not found
				}
			} catch (error) {
				/* ... error handling ... */
			}
			if (restaurant?.uid) {
				try {
					const getStripePublishableKeyFunction = httpsCallable(
						functions,
						"getStripePublishableKey"
					);
					const { data } = await getStripePublishableKeyFunction({
						restaurantId: restaurant.uid,
					});
					if (isMounted && data.stripePublishableKey) {
						setStripePublishableKey(data.stripePublishableKey);
					} else if (isMounted) {
						throw new Error("Pub key not returned");
					}
				} catch (e) {
					console.error("Error fetching publishable key:", e);
					if (isMounted) setPaymentError("Could not load payment config.");
				}
			}
			if (isMounted) setIsDataLoading(false); // Assuming data loading state exists
		};

		fetchInitialData();
		return () => {
			isMounted = false;
		};
	}, []);

	// --- useMemo Hook for Calculating Pre-Tax Totals ---
	const {
		subtotal, // Total pre-tax subtotal (after discounts) in cents
		gratuity, // Total gratuity in cents
		platformFee, // Your calculated platform fee in cents
		amountBeforeTax, // Sum of subtotal + gratuity (used for line item in Checkout) in cents
		totalDiscount, // Total discount in cents
		originalSubtotal, // Total original subtotal (before discounts) in cents
		pipTotals, // Array of per-person calculations (useful for display)
		tax,
		estimatedOverallTotal,
	} = useMemo(() => {
		console.log("Memo: Recalculating Totals Running");
		// Guard clause: Ensure necessary data is available
		if (
			!restaurantBasketItems ||
			restaurantBasketItems.length === 0 ||
			typeof fees !== "number" ||
			typeof restaurant?.taxRate !== "number"
		) {
			console.log("Calculate Totals Memo: Skipping, missing required data");
			return {
				subtotal: 0,
				gratuity: 0,
				platformFee: 0,
				amountBeforeTax: 0,
				totalDiscount: 0,
				originalSubtotal: 0,
				pipTotals: [],
			};
		}

		let calcSubtotal = 0;
		let calcOriginalSubtotal = 0;

		// Calculate overall subtotal and original subtotal
		for (const item of restaurantBasketItems) {
			const originalPrice = Math.round((Number(item?.dish?.price) || 0) * 100);
			const quantity = Number(item?.quantity) || 1;
			calcOriginalSubtotal += originalPrice * quantity;

			const price = item?.discount
				? parseFloat(item.discountedPrice) * 100
				: originalPrice;
			calcSubtotal += Math.round(price || 0) * quantity; // Ensure price is a number
		}

		const calcGratuityAmount = Math.round(
			calcSubtotal * (parseFloat(gratuityPercentage) / 100)
		);

		// Calculate details per PIP
		const calcPipTotals = filteredBasketData.map((personData) => {
			const itemsToReduce = personData?.items;
			let pipSubtotal = 0;
			let pipOriginalSubtotal = 0; // Original subtotal for this PIP

			if (Array.isArray(itemsToReduce)) {
				pipSubtotal = itemsToReduce.reduce((total, item) => {
					const originalPrice = Math.round(
						(Number(item?.dish?.price) || 0) * 100
					);
					const quantity = Number(item?.quantity) || 1;
					const price = item?.discount
						? parseFloat(item.discountedPrice) * 100
						: originalPrice;
					pipOriginalSubtotal += originalPrice * quantity; // Accumulate original price for PIP discount calc
					return total + Math.round(price || 0) * quantity;
				}, 0);
			}

			const pipTax = Math.round(pipSubtotal * restaurant.taxRate); // Tax for THIS PIP (needed for fee calc)
			const numberOfPips =
				filteredBasketData.length > 0 ? filteredBasketData.length : 1;
			const pipGratuity = Math.round(calcGratuityAmount / numberOfPips);
			const pipFee = Math.round((pipSubtotal + pipTax) * fees); // Platform fee for THIS PIP
			const pipTotalBeforeTax = pipSubtotal + pipGratuity + pipFee; // Total for PIP *before* Stripe Tax adds tax
			const pipDiscount = pipOriginalSubtotal - pipSubtotal; // Discount for THIS PIP
			const estimatedTax = Math.round(subtotal * (restaurant?.taxRate || 0));
			const estimatedOverallTotal =
				amountBeforeTax + platformFee + estimatedTax;

			return {
				...(personData || {}), // Spread person data safely
				subtotal: pipSubtotal,
				tax: pipTax, // Store calculated pipTax for reference/fee calculation
				fee: pipFee,
				gratuity: pipGratuity,
				totalBeforeTax: pipTotalBeforeTax, // Store this pre-tax total
				discount: pipDiscount,
			};
		});

		const calculated_tax = calcPipTotals.reduce(
			(sum, pip) => sum + (pip.tax || 0),
			0
		);

		// Calculate overall platform fee by summing pipFees
		const calculated_platform_fee = calcPipTotals.reduce(
			(sum, pip) => sum + (pip.fee || 0),
			0
		);

		// Amount for Stripe line item (Subtotal + Gratuity)
		const calcAmountBeforeTax = calcSubtotal + calcGratuityAmount;
		const calcTotalDiscount = calcOriginalSubtotal - calcSubtotal;

		console.log("Memo: Calculated Totals:", {
			calcSubtotal,
			calcGratuityAmount,
			calculated_platform_fee,
			calcAmountBeforeTax,
		});

		return {
			subtotal: calcSubtotal,
			gratuity: calcGratuityAmount,
			platformFee: calculated_platform_fee,
			amountBeforeTax: calcAmountBeforeTax,
			totalDiscount: calcTotalDiscount,
			originalSubtotal: calcOriginalSubtotal,
			pipTotals: calcPipTotals, // Include the detailed PIP array
			tax: calculated_tax,
			estimatedOverallTotal,
		};
	}, [
		// Dependencies for recalculation
		restaurantBasketItems,
		gratuityPercentage,
		fees,
		restaurant?.taxRate, // Needed for pipFee calculation
		filteredBasketData,
	]);

	// --- NEW/REVISED: useEffect to Prepare Payment Sheet Data ---
	useEffect(() => {
		// Only run if we have the key, user, restaurant, and an amount to charge
		if (
			!stripePublishableKey ||
			!currentUserData?.uid ||
			!restaurant?.uid ||
			amountBeforeTax <= 0
		) {
			setIsPaymentSheetReady(false); // Ensure not ready if inputs missing
			return;
		}

		const prepareSheet = async () => {
			console.log("Effect: Preparing Payment Sheet...");
			setIsPreparing(true);
			setIsPaymentSheetReady(false); // Reset while preparing
			setPaymentError(null);
			pendingOrderIdRef.current = null;
			pendingFirestoreDocIdRef.current = null;

			try {
				// 1. Create Pending Order & Get ID
				const createPendingOrderFunction = httpsCallable(
					functions,
					"createPendingOrder"
				);

				const orderInputData = {
					userId: currentUserData.uid,
					restaurantId: restaurant.uid,
					table: checkInObj.table || null, // Get table from checkInObj
					items: restaurantBasketItems, // Use memoized items
					server: checkInObj.server || null, // Get server from checkInObj
					gratuity: gratuity, // Use gratuity from useMemo
					subtotal: subtotal, // Use subtotal from useMemo
					fee: platformFee, // Use platformFee from useMemo
					originalSubtotal: originalSubtotal, // Use value from useMemo
					totalDiscount: totalDiscount, // Use value from useMemo
				};

				const { data: orderResult } = await createPendingOrderFunction(
					orderInputData
				);
				if (
					!orderResult?.success ||
					!orderResult.orderId ||
					!orderResult.firestoreDocId
				) {
					throw new Error("Failed order pre-creation.");
				}
				pendingOrderIdRef.current = orderResult.orderId;
				pendingFirestoreDocIdRef.current = orderResult.firestoreDocId;
				console.log(
					"Pending Order Created:",
					pendingOrderIdRef.current,
					pendingFirestoreDocIdRef.current
				);

				// 2. Get/Create Stripe Customer ID
				let stripeCustomerId = null;

				const userDocRef = doc(db, "customers", currentUserData.uid);
				const userDocSnapshot = await getDoc(userDocRef);
				if (
					userDocSnapshot.exists() &&
					userDocSnapshot.data().stripeCustomerId
				) {
					stripeCustomerId = userDocSnapshot.data().stripeCustomerId;
				} else {
					const createStripeCustomerFunction = httpsCallable(
						functions,
						"createStripeCustomer"
					);
					const {
						data: { customerId },
					} = await createStripeCustomerFunction({
						userId: currentUserData.uid,
						email: currentUserData.email,
						restaurantId: restaurant.uid,
					});
					stripeCustomerId = customerId;
					await updateDoc(userDocRef, { stripeCustomerId });
				}

				// 3. Prepare Line Items and Customer Details for Tax Calc
				const lineItemsForTax = [
					{
						amount: amountBeforeTax, // cents (subtotal + gratuity)
						quantity: 1,
						tax_code: "txcd_10103001", // VERIFY/REPLACE
						name: `Order at ${restaurant.restaurantName || "Restaurant"}`,
					},
				];
				// --- IMPORTANT: Get actual customer address ---
				// Placeholder - Fetch or use state for customer address
				const customerDetailsForTax = {
					address: {
						line1: null,
						city: null,
						state: "NY",
						postal_code: "11215",
						country: "US",
					},
					address_source: "billing",
				};
				// --- End Address ---

				const metadataForServer = {
					userId: currentUserData.uid,
					restaurantId: restaurant.uid,
					internalOrderId: pendingOrderIdRef.current,
					firestoreDocId: pendingFirestoreDocIdRef.current,
					calculatedPlatformFee: platformFee, // Pass potential fee
					// Add other metadata...
				};

				// 4. Call the NEW server function
				const preparePaymentSheetFunction = httpsCallable(
					functions,
					"preparePaymentSheetData"
				);
				const dataToPrepare = {
					restaurantId: restaurant.uid,
					customerId: stripeCustomerId,
					subtotal: subtotal,
					gratuity: gratuity,
					platformFee: platformFee,
					lineItems: lineItemsForTax,
					customerDetails: customerDetailsForTax,
					connectedAccountId: restaurant.stripeAccountId,
					setup_future_usage: selectedCard ? undefined : "off_session",
					paymentMethodId: selectedCard, // Pass if using saved card
					metadata: metadataForServer,
				};
				console.log("Calling preparePaymentSheetData...");
				const result = await preparePaymentSheetFunction(dataToPrepare);
				const prepData = result?.data;

				if (!prepData) {
					throw new Error(
						"preparePaymentSheetFunction returned null or undefined data."
					);
				}

				if (
					!prepData.paymentIntentClientSecret ||
					!prepData.ephemeralKeySecret ||
					!prepData.customerId
				) {
					throw new Error("Server did not return necessary Stripe secrets.");
				}

				// 5. Update UI State with Tax/Total from Server
				setCalculatedTax(prepData.calculatedTaxAmount || 0);
				setFinalTotal(prepData.finalAmount || 0);

				// 6. Initialize Payment Sheet
				console.log("Initializing Payment Sheet...");
				const { error: initSheetError } = await initPaymentSheet({
					merchantDisplayName: `Scerv Inc. - ${restaurant.restaurantName}`,
					paymentIntentClientSecret: prepData.paymentIntentClientSecret,
					customerEphemeralKeySecret: prepData.ephemeralKeySecret,
					customerId: prepData.customerId,
					returnURL: "stripe://stripe-redirect", // Needed for some payment methods like Alipay
					// allowsDelayedPaymentMethods: true, // Optional
				});

				if (initSheetError) {
					throw initSheetError; // Let the catch block handle it
				} else {
					console.log("Payment Sheet Initialized Successfully");
					setIsPaymentSheetReady(true); // <<< READY!
				}
			} catch (error) {
				console.error("Error preparing payment sheet:", error);
				setPaymentError(
					`Error: ${error.code || "Unknown"} - ${
						error.message || "Failed to prepare payment."
					}`
				);
				setIsPaymentSheetReady(false); // Ensure not ready on error
			} finally {
				setIsPreparing(false);
			}
		};

		prepareSheet();
	}, [
		// Dependencies for preparing the payment sheet
		stripePublishableKey,
		currentUserData?.uid,
		restaurant?.uid,
		restaurant?.stripeAccountId,
		subtotal,
		gratuity,
		platformFee,
		amountBeforeTax, // Key calculated values
		checkInObj, // If table/server info changes?
		selectedCard, // Re-prepare if selected card changes
		// DO NOT add 'totals' object here if it causes loops, use specific props
	]);

	// --- Handle Payment Button Press ---
	const handlePayment = async () => {
		if (!isPaymentSheetReady || isPaying) return; // Check readiness and if already paying
		setIsPaying(true);
		setPaymentError(null);

		console.log("Presenting Payment Sheet...");
		const { error } = await presentPaymentSheet();

		if (error) {
			console.error("Payment failed via Payment Sheet:", error);
			Alert.alert(`Payment Error: ${error.code}`, error.message);
			setPaymentError(`Payment failed: ${error.message}`);
			// Clear pending order refs if payment fails? Maybe not, allow retry?
		} else {
			console.log(
				"Payment Sheet completed successfully! Waiting for webhook confirmation."
			);
			Alert.alert("Payment Processing", "Your payment is processing.");

			// Navigate to confirmation screen, passing the FIRESTORE DOC ID
			const docIdToConfirm = pendingFirestoreDocIdRef.current;
			if (!docIdToConfirm) {
				console.error("Payment Success but Firestore Doc ID missing!");
				// Handle error - maybe navigate home?
				navigation.replace("CustomerHome");
				return;
			}
			navigation.navigate("OrderConfirmation", {
				orderDocId: docIdToConfirm,
				status: "processing",
			});
			pendingFirestoreDocIdRef.current = null; // Clear after navigating
			pendingOrderIdRef.current = null;
			// Clear basket potentially here or wait for webhook
			// clearBasket(restaurant.id);
		}
		setIsPaying(false);
	};

	// // --- NEW: Handle Checkout Button Press ---
	// const handleCheckout = async () => {
	// 	// --- CHANGED: Logic to call createCheckoutSession and redirect ---
	// 	if (
	// 		!currentUserData?.uid ||
	// 		!restaurant?.uid ||
	// 		!restaurant?.stripeAccountId
	// 	) {
	// 		Alert.alert(
	// 			"Error",
	// 			"Cannot proceed without user, restaurant, or payout details."
	// 		);
	// 		return;
	// 	}
	// 	setIsLoading(true);
	// 	setPaymentError(null);
	// 	pendingOrderIdRef.current = null; // Clear previous attempt

	// 	try {
	// 		// --- Step 1: Create Pending Order & Get ID ---
	// 		const createPendingOrderFunction = httpsCallable(
	// 			functions,
	// 			"createPendingOrder"
	// 		);

	// 		const orderInputData = {
	// 			userId: currentUserData.uid,
	// 			restaurantId: restaurant.uid,
	// 			table: checkInObj?.table || null,
	// 			items: restaurantBasketItems,
	// 			server: checkInObj?.server || null,
	// 			gratuity: gratuity,
	// 			subtotal: subtotal,
	// 			fee: platformFee,
	// 			originalSubtotal: originalSubtotal,
	// 			totalDiscount: totalDiscount,
	// 		};

	// 		console.log("Calling createPendingOrder with:", orderInputData);
	// 		const { data: orderResult } = await createPendingOrderFunction(
	// 			orderInputData
	// 		);

	// 		if (
	// 			!orderResult?.success ||
	// 			!orderResult.orderId ||
	// 			!orderResult.firestoreDocId
	// 		) {
	// 			throw new Error("Failed to create pending order record.");
	// 		}
	// 		pendingOrderIdRef.current = orderResult.orderId; // Store the generated order ID
	// 		pendingFirestoreDocIdRef.current = orderResult.firestoreDocId; // Store firestore ID
	// 		console.log("Stored pending order ID:", pendingOrderIdRef.current);

	// 		// 1b. Get Stripe Customer ID (same logic as before)
	// 		let stripeCustomerId = null;
	// 		// ... (your get/create stripeCustomerId logic) ...
	// 		const userDocRef = doc(db, "customers", currentUserData.uid);
	// 		const userDocSnapshot = await getDoc(userDocRef);
	// 		if (userDocSnapshot.exists() && userDocSnapshot.data().stripeCustomerId) {
	// 			stripeCustomerId = userDocSnapshot.data().stripeCustomerId;
	// 		} else {
	// 			const createStripeCustomerFunction = httpsCallable(
	// 				functions,
	// 				"createStripeCustomer"
	// 			);
	// 			const {
	// 				data: { customerId },
	// 			} = await createStripeCustomerFunction({
	// 				userId: currentUserData.uid,
	// 				email: currentUserData.email,
	// 				restaurantId: restaurant.uid,
	// 			});
	// 			stripeCustomerId = customerId;
	// 			await updateDoc(userDocRef, { stripeCustomerId });
	// 		}

	// 		// 2. Prepare data for createCheckoutSession
	// 		const lineItemsForSession = [
	// 			{
	// 				name: `Order at ${restaurant.restaurantName || "Restaurant"}`,
	// 				amount: amountBeforeTax, // Subtotal + Gratuity (cents)
	// 				currency: "usd",
	// 				quantity: 1,
	// 				// --- IMPORTANT: Use correct Stripe Tax Code ---
	// 				tax_code: "txcd_10103001", // Example - VERIFY THIS!
	// 			},
	// 		];

	// 		const metadataForSession = {
	// 			userId: currentUserData.uid,
	// 			restaurantId: restaurant.uid,
	// 			originalSubtotal: originalSubtotal,
	// 			calculatedDiscount: totalDiscount,
	// 			calculatedGratuity: gratuity,
	// 			calculatedPlatformFee: platformFee,
	// 			table: checkInObj?.table?.name || "N/A",
	// 			// IMPORTANT: Add your internal order ID here if you create one before checkout
	// 			internalOrderId: pendingOrderIdRef.current,
	// 			firestoreDocId: pendingFirestoreDocIdRef.current,
	// 		};

	// 		const sessionData = {
	// 			restaurantId: restaurant.uid,
	// 			lineItems: lineItemsForSession,
	// 			customerId: stripeCustomerId,
	// 			connectedAccountId: restaurant.stripeAccountId,
	// 			fee: platformFee, // Send your calculated platform fee
	// 			metadata: metadataForSession,
	// 		};

	// 		// 3. Call the createCheckoutSession Firebase Function
	// 		const createCheckoutSessionFunction = httpsCallable(
	// 			functions,
	// 			"createCheckoutSession"
	// 		);
	// 		console.log("Calling createCheckoutSession with:", sessionData);
	// 		const { data } = await createCheckoutSessionFunction(sessionData);
	// 		const checkoutUrl = data?.checkoutUrl; // Get URL from response

	// 		// 4. Redirect to Stripe Checkout
	// 		if (checkoutUrl) {
	// 			console.log("Opening Stripe Checkout in WebBrowser:", checkoutUrl);

	// 			const browserResult = await WebBrowser.openBrowserAsync(checkoutUrl);
	// 			// --- IMPORTANT ---
	// 			// WebBrowser.openBrowserAsync typically RESOLVES when the browser is
	// 			// MANUALLY dismissed by the user OR if it automatically dismisses
	// 			// upon hitting your custom scheme redirect (behavior varies by OS/config).
	// 			// You don't get the final URL directly from this result usually.
	// 			// The Deep Link Listener handles getting the final URL.

	// 			console.log("WebBrowser result:", browserResult);

	// 			//const supported = await Linking.canOpenURL(checkoutUrl);
	// 			// if (supported) {
	// 			// 	await Linking.openURL(checkoutUrl);
	// 			// 	// User is redirected out, success/cancel handled by deep link listener
	// 			// } else {
	// 			// 	Alert.alert(`Cannot open Stripe Checkout URL.`);
	// 			// 	setIsLoading(false); // Stop loading if redirect fails
	// 			// }
	// 		} else {
	// 			throw new Error("Failed to get Checkout URL from server.");
	// 		}
	// 		// Note: setIsLoading(false) is now in the finally block or after error
	// 	} catch (error) {
	// 		console.error("Error initiating checkout:", error);
	// 		setPaymentError(
	// 			`Checkout Error: ${error.code || "Unknown"} - ${
	// 				error.message || "Please try again."
	// 			}`
	// 		);
	// 		setIsLoading(false); // Stop loading on error
	// 	}
	// 	// Removed finally block here, handle loading in try/catch/redirect fail
	// };

	// // --- NEW: Effect to handle redirect back from Stripe ---
	// useEffect(() => {
	// 	const handleDeepLink = (event) => {
	// 		const { url } = event;
	// 		console.log("Received Deep Link:", url);
	// 		if (url) {
	// 			// --- Replace 'yourappscheme' with your actual custom URL scheme ---
	// 			if (url.startsWith("scerv://checkout/success")) {
	// 				const urlParts = Linking.parse(url); // Use expo-linking or a reliable parser
	// 				const sessionId = urlParts.queryParams?.session_id; // Extract Session ID
	// 				const docIdToConfirm = pendingFirestoreDocIdRef.current;
	// 				const orderIdToConfirm = pendingOrderIdRef.current;

	// 				if (!orderIdToConfirm) {
	// 					console.error(
	// 						"Deep Link Success: Could not find the pending order ID!"
	// 					);
	// 					// Navigate somewhere safe, maybe display generic success/check orders
	// 					navigation.replace("CustomerHome"); // Use replace
	// 					return;
	// 				}

	// 				// --- ADD THIS LOG ---
	// 				console.log(
	// 					"Attempting to navigate to OrderConfirmation with sessionId:",
	// 					sessionId
	// 				);
	// 				// --------------------

	// 				if (!sessionId) {
	// 					// Double-check sessionId is valid before navigating
	// 					console.error("STOPPING NAVIGATION: Session ID is missing!");
	// 					setPaymentError("Failed to get payment confirmation details.");
	// 					navigation.navigate("CustomerHome"); // Navigate somewhere safe
	// 					return;
	// 				}

	// 				console.log(
	// 					"Navigating to OrderConfirmation with Order ID:",
	// 					docIdToConfirm
	// 				);
	// 				Alert.alert("Payment Processing", "Verifying payment...");
	// 				// Navigate to a generic success/processing screen.
	// 				// DO NOT assume payment is fully confirmed here. Wait for webhook.
	// 				navigation.navigate("OrderConfirmation", {
	// 					orderDocId: docIdToConfirm,
	// 					orderId: orderIdToConfirm,
	// 					sessionId: sessionId,
	// 					status: "processing",
	// 				}); // Or an OrderStatus screen

	// 				pendingOrderIdRef.current = null; // Clear the stored ID after use
	// 				pendingFirestoreDocIdRef.current = null;

	// 				// Maybe clear basket optimistically, or wait for webhook confirmation?

	// 				// clearBasket(restaurant.id);
	// 			} else if (url.startsWith("scerv://checkout/cancel")) {
	// 				console.log("Stripe Checkout Canceled Redirect");
	// 				setPaymentError("Payment was canceled by user.");
	// 				// No Alert needed unless desired
	// 			}
	// 		}
	// 	};
	// 	const linkingSubscription = Linking.addEventListener("url", handleDeepLink);
	// 	// Check initial URL in case app was opened via redirect
	// 	Linking.getInitialURL().then((url) => {
	// 		if (url) handleDeepLink({ url });
	// 	});
	// 	return () => {
	// 		linkingSubscription.remove();
	// 	};
	// }, [navigation, clearBasket, restaurant?.id]); // Dependencies

	// // --- Render ---
	// if (isDataLoading) {
	// 	/* ... show loading ... */
	// }

	// Function to toggle PIP section expansion
	const toggleExpandPIP = (personId) => {
		setExpandedPIPs((prev) => ({ ...prev, [personId]: !prev[personId] }));
	};

	// --- Render Logic ---
	if (!currentUserData || !restaurant || isDataLoading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	return (
		// --- ADD BACK StripeProvider ---
		<StripeProvider publishableKey={stripePublishableKey}>
			<View style={styles.container}>
				<ScrollView showsVerticalScrollIndicator={false}>
					<Text style={styles.mainHeading}>Review Your Order</Text>
					<Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>

					{/* --- PIP Breakdown --- */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Items by Person</Text>
						{filteredBasketData.map((personData) => {
							const isExpanded = !!expandedPIPs[personData.personId];
							// Find matching pip calculated data
							const pipData = pipTotals.find(
								(p) => p.personId === personData.personId
							);
							// Calculate estimated total for this PIP including client-estimated tax
							const estimatedPipTotal = pipData
								? pipData.totalBeforeTax + pipData.tax
								: 0;

							if (!pipData) return null; // Safety check
							return (
								<View key={personData.personId} style={styles.pipSection}>
									<TouchableOpacity
										onPress={() => toggleExpandPIP(personData.personId)}
										style={styles.pipHeader}
									>
										<Text style={styles.pipName}>
											{personData.pipName || "Guest"}
										</Text>
										<View style={styles.pipHeaderTotals}>
											<Text style={styles.pipTotalDisplay}>
												Est: {formatCurrency(estimatedPipTotal)}
											</Text>
											<MaterialCommunityIcons
												name={isExpanded ? "chevron-up" : "chevron-down"}
												size={26}
												color={colors.primary}
											/>
										</View>
									</TouchableOpacity>
									{isExpanded && (
										<View style={styles.pipItemsContainer}>
											{personData.items.map((item, index) => (
												<View
													key={`${item.dish.id}-${index}`}
													style={styles.itemRow}
												>
													<Text style={styles.itemName}>
														{item.quantity}x {item.dish.name}
													</Text>
													<Text style={styles.itemPrice}>
														{formatCurrency(
															Math.round(
																(item.discount
																	? parseFloat(item.discountedPrice)
																	: item.dish?.price || 0) * 100
															) * item.quantity
														)}
													</Text>
												</View>
											))}
										</View>
									)}
								</View>
							);
						})}
					</View>

					{/* --- Gratuity Picker --- */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Add Gratuity</Text>
						<View style={styles.gratuityContainer}>
							<Text style={styles.gratuityCurrentText}>
								Selected: {gratuityPercentage}% ({formatCurrency(gratuity)})
							</Text>
							<Picker
								selectedValue={gratuityPercentage}
								onValueChange={(itemValue) => setGratuityPercentage(itemValue)}
								style={styles.gratuityPicker}
								// Add prompt etc if desired
							>
								<Picker.Item label="0%" value="0" />
								<Picker.Item label="10%" value="10" />
								<Picker.Item label="15%" value="15" />
								<Picker.Item label="18%" value="18" />
								<Picker.Item label="20%" value="20" />
								<Picker.Item label="25%" value="25" />
							</Picker>
						</View>
					</View>

					{/* --- Order Summary Section --- */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Order Summary</Text>
						{totalDiscount > 0 && (
							<>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>Original Subtotal:</Text>
									<Text style={styles.originalPrice}>
										{formatCurrency(originalSubtotal)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.label}>Discounts:</Text>
									<Text style={styles.discountAmount}>
										-{formatCurrency(totalDiscount)}
									</Text>
								</View>
							</>
						)}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Subtotal:</Text>
							<Text style={styles.amount}>{formatCurrency(subtotal)}</Text>
						</View>
						{/* Gratuity Row */}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>
								Gratuity ({gratuityPercentage}%):
							</Text>
							<Text style={styles.amount}>{formatCurrency(gratuity)}</Text>
						</View>
						{/* Platform Fee Row */}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Service Fee:</Text>
							<Text style={styles.amount}>{formatCurrency(platformFee)}</Text>
						</View>
						{/* Tax Row - Shows loading or calculated amount */}
						<View style={styles.summaryRow}>
							<Text style={styles.label}>Sales Tax:</Text>
							{isPreparing || calculatedTax === null ? (
								<Text style={styles.calculatingText}>Calculating...</Text>
							) : (
								<Text style={styles.amount}>
									{formatCurrency(calculatedTax)}
								</Text>
							)}
						</View>
						{/* Final Total Row */}
						<View style={[styles.summaryRow, styles.totalRow]}>
							<Text style={styles.totalLabel}>Total Amount:</Text>
							{isPreparing || finalTotal === null ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<Text style={styles.totalAmount}>
									{formatCurrency(finalTotal)}
								</Text>
							)}
						</View>
					</View>

					{/* --- TODO: Payment Method Selection UI --- */}
					{/* <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Payment Method</Text>
                        // Add UI here to list savedCards and allow selection (sets selectedCard state)
                        // OR indicate that a new card will be entered via Payment Sheet
                    </View> */}

					{paymentError && <Text style={styles.errorText}>{paymentError}</Text>}

					{/* --- Pay Button --- */}
					<View style={styles.payButtonContainer}>
						<Button
							title={
								isPreparing
									? "Calculating..."
									: isPaying
									? "Processing..."
									: finalTotal !== null
									? `Pay ${formatCurrency(finalTotal)}`
									: "Pay Now"
							}
							onPress={handlePayment}
							disabled={!isPaymentSheetReady || isPreparing || isPaying} // Disable until ready & not processing
							color={colors.primary} // Use theme color
						/>
					</View>
				</ScrollView>
			</View>
		</StripeProvider>
	);
};

// --- Styles ---
// (Use styles from previous examples, ensure they cover elements used)
const styles = StyleSheet.create({
	loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
	container: { flex: 1, backgroundColor: colors.background || "#f4f4f8" }, // Lighter background
	mainHeading: {
		fontSize: 24,
		fontWeight: "bold",
		textAlign: "center",
		marginVertical: 20,
		color: colors.textDark,
	},
	restaurantName: {
		fontSize: 18,
		fontWeight: "500",
		textAlign: "center",
		marginBottom: 20,
		color: colors.text,
	},
	section: {
		marginBottom: 15,
		padding: 15,
		backgroundColor: "#ffffff",
		borderRadius: 10,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 3,
		elevation: 2,
		marginHorizontal: 10,
	},
	sectionTitle: {
		fontSize: 17,
		fontWeight: "bold",
		marginBottom: 12,
		color: colors.primary,
		paddingBottom: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
	},
	label: { fontSize: 15, color: "#495057" },
	amount: { fontSize: 15, fontWeight: "500" },
	labelItalic: { fontSize: 15, color: "#6c757d", fontStyle: "italic" },
	amountItalic: {
		fontSize: 15,
		fontWeight: "500",
		fontStyle: "italic",
		color: "#6c757d",
	},
	totalRow: {
		marginTop: 10,
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: "#eee",
	},
	totalLabel: { fontSize: 16, fontWeight: "bold" },
	totalAmount: { fontSize: 16, fontWeight: "bold" },
	errorText: { color: "red", textAlign: "center", marginVertical: 10 },
	gratuityContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 20,
		padding: 10,
		backgroundColor: "#fff",
		borderRadius: 8,
	},
	// PIP Styles
	pipSection: {
		marginBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
		paddingBottom: 10,
	},
	pipHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 5,
	},
	pipName: { fontSize: 16, fontWeight: "600", flexShrink: 1, marginRight: 8 }, // Allow name to shrink
	pipHeaderTotals: { flexDirection: "row", alignItems: "center" }, // Container for total and icon
	pipTotalDisplay: {
		fontSize: 15,
		fontWeight: "500",
		color: colors.text,
		marginRight: 5,
	}, // Style for PIP total in header
	pipItemsContainer: {
		paddingLeft: 15,
		marginTop: 8,
		borderLeftWidth: 2,
		borderLeftColor: colors.lightGray,
	},
	itemRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 4,
	},
	itemName: { fontSize: 14, color: colors.text, flexShrink: 1, marginRight: 5 },
	itemPrice: { fontSize: 14, color: colors.text, fontWeight: "500" },
	pipDetailText: {
		fontSize: 13,
		color: colors.textLight,
		fontStyle: "italic",
		marginTop: 2,
	}, // For optional PIP breakdown details
	// Summary Styles
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 5,
	},
	label: { fontSize: 15, color: colors.textDark },
	amount: { fontSize: 15, fontWeight: "500", color: colors.textDark },
	originalPrice: {
		fontSize: 15,
		textDecorationLine: "line-through",
		color: colors.textLight,
		marginLeft: 5,
	},
	discountAmount: {
		fontSize: 15,
		color: colors.warning || "#E85D04",
		fontWeight: "500",
	},
	labelItalic: { fontSize: 15, color: colors.textLight, fontStyle: "italic" },
	amountItalic: {
		fontSize: 15,
		fontWeight: "500",
		fontStyle: "italic",
		color: colors.textLight,
	},
	calculatingText: {
		fontSize: 15,
		fontStyle: "italic",
		color: colors.textLight,
	},
	totalRow: {
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: 1.5,
		borderTopColor: colors.primary,
	},
	totalLabel: { fontSize: 17, fontWeight: "bold", color: colors.primary },
	totalAmount: { fontSize: 17, fontWeight: "bold", color: colors.primary },
	// Gratuity Styles
	gratuityContainer: { paddingVertical: 10 }, // Container for the whole gratuity section
	gratuitySelectionRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 0,
	}, // Row layout for label, picker, amount
	gratuityLabel: { fontSize: 15, color: colors.textDark, marginRight: 10 }, // Label for "Tip:"
	gratuityPicker: {
		flex: 1, // Allow picker to take available space
		height: Platform.OS === "ios" ? 120 : 50, // iOS needs more height for wheel
		// Add specific styling for iOS background if needed
		// backgroundColor: Platform.OS === 'ios' ? '#f0f0f0' : 'transparent',
	},
	gratuityPickerItem: {
		// iOS only
		height: 120,
	},
	gratuityAmountDisplay: {
		fontSize: 15,
		fontWeight: "500",
		color: colors.textDark,
		marginLeft: 10,
	}, // Display calculated amount
	errorText: {
		color: colors.danger || "red",
		textAlign: "center",
		marginVertical: 10,
		paddingHorizontal: 10,
	},
	payButtonContainer: { margin: 20, marginTop: 10 },
});

export default CheckoutScreen;
