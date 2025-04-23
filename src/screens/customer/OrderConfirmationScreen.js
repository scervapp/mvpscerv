import {
	useRoute,
	useNavigation,
	CommonActions,
} from "@react-navigation/native";
import React, { useState, useEffect, useContext } from "react";
import { db } from "../../config/firebase";
import {
	collection,
	doc,
	getDocs,
	limit,
	onSnapshot,
	query,
	where,
} from "firebase/firestore";
import colors from "../../utils/styles/appStyles";
import {
	Text,
	View,
	ActivityIndicator,
	StyleSheet,
	Button,
	TouchableOpacity,
} from "react-native";
import formatCurrency from "../../utils/currencyFormatter";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"; // Or Ionicons

const OrderConfirmationScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();

	const orderDocId = route.params?.orderDocId; // Get session ID from navigation
	const initialStatus = route.params?.status || "unknown";
	const orderId = route.params?.orderId;

	// --- ADD LOGGING HERE ---
	console.log("--- OrderConfirmationScreen ---");
	console.log("Received route.params:", JSON.stringify(route.params, null, 2)); // Log the whole params object
	console.log("Extracted orderDocId:", orderDocId); // Log the extracted value
	console.log("Initial status:", initialStatus);

	const [orderDetails, setOrderDetails] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [currentStatus, setCurrentStatus] = useState(initialStatus);

	// --- NEW: Handler to navigate home and reset stack ---
	const handleCloseAndReset = () => {
		console.log(
			"OrderConfirmationScreen: Closing and resetting to CustomerHome"
		);
		navigation.dispatch(
			CommonActions.reset({
				index: 0,
				routes: [
					// Reset the entire navigation state to show CustomerHome (tabs)
					// Adjust 'CustomerHome' if your root logged-in screen has a different name
					{ name: "CustomerHome" },
				],
			})
		);
	};
	// --- END NEW HANDLER ---

	// --- Configure Header Button ---
	useEffect(() => {
		navigation.setOptions({
			headerTitle:
				orderDetails?.paymentStatus === "paid"
					? "Order Confirmed"
					: "Order Processing", // Dynamic title
			headerLeft: () => null, // Keep back button hidden
			// --- ADD 'X' BUTTON ---
			headerRight: () => (
				<TouchableOpacity
					onPress={handleCloseAndReset}
					style={{ marginRight: 15 }}
				>
					<MaterialCommunityIcons
						name="close"
						size={28}
						color={colors.textDark || "black"}
					/>
				</TouchableOpacity>
			),
			// --- END 'X' BUTTON ---
		});
	}, [navigation, orderDetails?.paymentStatus]); // Update header when status changes

	useEffect(() => {
		// Check if we have the necessary orderId
		if (!orderDocId) {
			console.error(
				"OrderConfirmationScreen: No orderId found in route params."
			);
			setError("Order details are missing. Cannot confirm status.");
			setLoading(false);
			return; // Stop if no ID
		}

		console.log(
			`OrderConfirmationScreen: Listening directly to order document ID: ${orderId}`
		);
		setLoading(true); // Start loading when listener is set up
		setError(null); // Clear previous errors

		// --- Listen DIRECTLY to the order document using its ID ---
		const orderRef = doc(db, "orders", orderDocId); // Reference the specific document

		const unsubscribe = onSnapshot(
			orderRef,
			(docSnap) => {
				if (docSnap.exists()) {
					const orderData = { id: docSnap.id, ...docSnap.data() };
					console.log("Order data received/updated via snapshot:", orderData);
					setOrderDetails(orderData); // Update state with the latest order data
					setLoading(false); // Stop loading once we have data
				} else {
					// Document doesn't exist - this shouldn't happen if createPendingOrder worked
					console.error(`Order document with ID ${orderId} not found.`);
					setError("Could not find order details.");
					setLoading(false);
				}
			},
			(err) => {
				// Handle listener errors
				console.error(`Error listening to order ${orderId} snapshot:`, err);
				setError("Error fetching real-time order status.");
				setLoading(false);
			}
		);
		// --- End Firestore Listener ---

		// Cleanup function to stop listening when the component unmounts
		return () => {
			console.log(
				`OrderConfirmationScreen: Unsubscribing from order listener for ${orderId}`
			);
			unsubscribe();
		};
	}, [orderId]); // Dependency array: Re-run ONLY if orderId changes

	// --- Render based on Status ---
	const displayStatus = orderDetails?.paymentStatus || initialStatus;

	if (loading) {
		return (
			<View style={styles.container}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.statusText}>Loading order details...</Text>
			</View>
		);
	}

	if (displayStatus === "paid") {
		return (
			<View style={styles.container}>
				{/* Check mark icon */}
				<Text style={styles.successTitle}>Payment Successful!</Text>
				<Text style={styles.detailText}>Thank you for your order.</Text>
				{/* Use orderId from the state/prop now */}
				<Text style={styles.detailText}>
					Order ID: {orderDetails?.orderId || "N/A"}
				</Text>
				<Text style={styles.detailText}>
					Total Paid: {formatCurrency(orderDetails?.totalPrice)}
				</Text>
				{/* Add button to navigate home or view full order */}
				<View style={styles.doneButtonContainer}>
					<Button
						title="Done"
						onPress={handleCloseAndReset}
						color={colors.primary}
					/>
				</View>
			</View>
		);
	}

	// --- >>> NEW: Failed Status Rendering <<< ---
	if (displayStatus === "failed") {
		return (
			<View style={styles.container}>
				<MaterialCommunityIcons
					name="alert-circle-outline"
					size={60}
					color={colors.danger || "red"}
					style={styles.iconSpacing}
				/>
				<Text style={styles.errorTitle}>Payment Failed</Text>
				<Text style={styles.errorText}>
					{orderDetails?.paymentFailureReason ||
						"Payment could not be processed."}
				</Text>
				{/* Use headerRight 'X' button to dismiss, or keep specific buttons */}
				<View style={styles.doneButtonContainer}>
					<Button
						title="Close"
						onPress={handleCloseAndReset}
						color={colors.primary}
					/>
				</View>
			</View>
		);
	}
	// --- >>> END FAILED CASE <<< ---

	if (currentStatus === "error") {
		return (
			<View style={styles.container}>
				<Text style={styles.errorTitle}>Error</Text>
				<Text style={styles.errorText}>
					{error || "Could not retrieve order status."}
				</Text>
				<Button title="Go Back" onPress={() => navigation.goBack()} />
			</View>
		);
	}

	// Fallback / Still processing if listener is active but status isn't 'paid' or 'failed' yet
	return (
		<View style={styles.container}>
			<ActivityIndicator size="large" color={colors.primary} />
			<Text style={styles.statusText}>Verifying payment, please wait...</Text>
			{/* Optionally display sessionId for debugging */}
			{/* <Text style={styles.statusText}>Session: {sessionId}</Text> */}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
		backgroundColor: colors.background || "#f8f9fa",
	},
	statusText: {
		marginTop: 15,
		fontSize: 16,
		color: colors.text || "#495057",
		textAlign: "center",
	},
	iconSpacing: { marginBottom: 15 },
	successTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.success || "green",
		marginBottom: 10,
		marginTop: 10,
	},
	errorTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.danger || "red",
		marginBottom: 10,
		marginTop: 10,
	},
	detailText: {
		fontSize: 16,
		marginBottom: 8,
		color: colors.textDark || "#343a40",
		textAlign: "center",
	},
	errorText: {
		fontSize: 16,
		color: colors.danger || "red",
		textAlign: "center",
		marginBottom: 20,
	},
	doneButtonContainer: { marginTop: 40, width: "60%" }, // Container for Done/Close button
});

export default OrderConfirmationScreen;
