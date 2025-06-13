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
	TouchableOpacity,
	SafeAreaView,
} from "react-native";
import formatCurrency from "../../utils/currencyFormatter";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"; // Or Ionicons
import { AuthContext } from "../../context/authContext";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

const StatusIndicator = ({ status, message, details, error }) => {
	let iconName, iconColor, title;

	switch (status) {
		case "paid":
		case "succeeded":
			iconName = "checkmark-circle";
			iconColor = colors.statusSuccess;
			title = "Payment Successful!";
			break;
		case "failed":
			iconName = "alert-circle";
			iconColor = colors.statusDanger;
			title = "Payment Failed";
			break;
		case "processing":
		default:
			return (
				<View style={styles.contentContainer}>
					<ActivityIndicator size="large" color={colors.primary} />
					<Text style={styles.statusTitle}>Processing Payment...</Text>
					<Text style={styles.statusMessage}>
						Please wait, we're confirming your payment.
					</Text>
				</View>
			);
	}

	return (
		<View style={styles.contentContainer}>
			<Ionicons
				name={iconName}
				size={80}
				color={iconColor}
				style={{ marginBottom: 20 }}
			/>
			<Text style={[styles.statusTitle, { color: iconColor }]}>{title}</Text>
			{message && <Text style={styles.statusMessage}>{message}</Text>}
			{details && <Text style={styles.detailsText}>{details}</Text>}
			{error && <Text style={styles.errorText}>{error}</Text>}
		</View>
	);
};

const OrderConfirmationScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);

	// --- LOG 1: Log incoming parameters when the screen mounts ---
	useEffect(() => {
		console.log(
			"OrderConfirmationScreen: MOUNTED. Received route.params:",
			JSON.stringify(route.params, null, 2)
		);
	}, []);

	// Get params from route
	const {
		mode = "individual", // 'individual' or 'party'
		orderDocId, // For 'individual' mode
		partyId, // For 'party' mode
	} = route.params;

	const [status, setStatus] = useState("processing");
	const [error, setError] = useState(null);
	const [details, setDetails] = useState(null);

	const handleDone = () => {
		navigation.dispatch(
			CommonActions.reset({
				index: 0,
				routes: [{ name: "CustomerDashboard" }],
			})
		);
	};

	useEffect(() => {
		navigation.setOptions({
			headerTitle: status === "processing" ? "Confirming..." : "Confirmation",
			headerLeft: () => null,
			headerRight: () => (
				<TouchableOpacity onPress={handleDone} style={{ marginRight: 15 }}>
					<Ionicons name="close" size={28} color={colors.textDark} />
				</TouchableOpacity>
			),
		});
	}, [navigation, status]);

	// --- Firestore Listener ---
	useEffect(() => {
		let unsubscribe = () => {};
		let docRef;

		if (mode === "individual" && orderDocId) {
			console.log(
				`OrderConfirmationScreen: Setting up listener for INDIVIDUAL order at "orders/${orderDocId}"`
			);
			docRef = doc(db, "orders", orderDocId);
		} else if (mode === "party" && partyId && currentUserData?.uid) {
			console.log(
				`OrderConfirmationScreen: Setting up listener for PARTY order at "parties/${partyId}"`
			);
			docRef = doc(db, "parties", partyId);
		} else {
			console.error(
				"OrderConfirmationScreen: Missing required params for listener.",
				route.params
			);
			setError("Cannot display confirmation: Required information is missing.");
			setStatus("failed");
			return;
		}

		unsubscribe = onSnapshot(
			docRef,
			(docSnap) => {
				// --- LOG 2: Log every time the listener fires with new data ---
				console.log(
					`OrderConfirmationScreen: SNAPSHOT RECEIVED for document: ${docRef.path}`
				);

				if (docSnap.exists()) {
					const data = docSnap.data();
					console.log(
						"OrderConfirmationScreen: Document data:",
						JSON.stringify(data, null, 2)
					);

					if (mode === "individual") {
						const paymentStatus = data.paymentStatus || "processing";
						setStatus(paymentStatus);
						if (paymentStatus === "paid") {
							setDetails(
								`Order ID: ${data.orderId}\nTotal: ${formatCurrency(
									data.totalPrice
								)}`
							);
						} else if (paymentStatus === "failed") {
							setError(
								data.paymentFailureReason ||
									"Please try another payment method."
							);
						}
					} else if (mode === "party") {
						const myPipData = (data.guestPips || []).find(
							(p) => p.userId === currentUserData.uid
						);
						console.log("OrderConfirmationScreen: Found myPipData:", myPipData);

						const paymentStatus = myPipData?.paymentStatus || "processing";
						setStatus(paymentStatus);
						if (paymentStatus === "paid") {
							setDetails("Your portion of the bill has been paid. Thank you!");
						} else if (paymentStatus === "failed") {
							setError("Your payment could not be processed.");
						}
					}
				} else {
					console.error(
						`OrderConfirmationScreen: Document not found at path: ${docRef.path}`
					);
					setError("Could not find order details.");
					setStatus("failed");
				}
			},
			(err) => {
				console.error(
					`OrderConfirmationScreen: Error listening to document ${docRef.path}:`,
					err
				);
				setError("Error fetching real-time order status.");
				setStatus("failed");
			}
		);

		return () => unsubscribe();
	}, [orderDocId, partyId, mode, currentUserData?.uid]);

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				<StatusIndicator status={status} message={details} error={error} />
			</View>
			<View style={styles.footer}>
				<Button mode="contained" onPress={handleDone} style={styles.doneButton}>
					Done
				</Button>
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	contentContainer: { alignItems: "center", justifyContent: "center" },
	statusTitle: {
		fontSize: 26,
		fontWeight: "bold",
		textAlign: "center",
		marginBottom: 12,
	},
	statusMessage: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
	},
	detailsText: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 8,
	},
	errorText: {
		fontSize: 16,
		color: colors.statusDanger,
		textAlign: "center",
		marginTop: 8,
		fontWeight: "500",
	},
	footer: {
		padding: 20,
		paddingBottom: 30,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	doneButton: {
		paddingVertical: 8,
		borderRadius: 8,
		backgroundColor: colors.primary,
	},
	doneButtonText: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textOnPrimaryBrand,
	},
});

export default OrderConfirmationScreen;
