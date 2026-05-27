import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
	StripeTerminalProvider,
	useStripeTerminal,
} from "@stripe/stripe-terminal-react-native";
import { CommonActions, useNavigation, useRoute } from "@react-navigation/native";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { formatCurrencyFromDollars } from "../../utils/currencyFormatter";

const getStaffName = (activeSession, currentUserData) =>
	activeSession?.name ||
	`${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`.trim() ||
	"Staff";

const getReaderName = (reader = {}) =>
	reader.label ||
	reader.serialNumber ||
	reader.id ||
	reader.deviceType ||
	"Stripe reader";

const waitForTerminalPaymentStatus = (paymentIntentId, timeoutMs = 25000) =>
	new Promise((resolve, reject) => {
		let settled = false;
		let unsubscribe = () => {};

		const finish = (result, error = null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			if (error) {
				reject(error);
				return;
			}
			resolve(result);
		};

		const timer = setTimeout(() => finish(false), timeoutMs);

		try {
			unsubscribe = db
				.collection("terminal_payments")
				.doc(paymentIntentId)
				.onSnapshot(
					(snapshot) => {
						const data = snapshot.exists ? snapshot.data() || {} : {};
						const status = data.paymentStatus || data.status;
						if (["paid", "succeeded"].includes(status)) {
							finish(true);
						}
					},
					(error) => finish(false, error),
				);
		} catch (error) {
			finish(false, error);
		}
	});

const RestaurantTerminalPaymentContent = ({
	activeSession,
	currentUserData,
	params,
}) => {
	const navigation = useNavigation();
	const [readerList, setReaderList] = useState([]);
	const [stepText, setStepText] = useState("Connect a Stripe reader to start.");
	const [errorText, setErrorText] = useState("");
	const [isDiscovering, setIsDiscovering] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isPaying, setIsPaying] = useState(false);
	const [isFinalizing, setIsFinalizing] = useState(false);
	const [processedPaymentIntentId, setProcessedPaymentIntentId] = useState("");

	const {
		initialize,
		discoverReaders,
		cancelDiscovering,
		connectReader,
		connectedReader,
		retrievePaymentIntent,
		collectPaymentMethod,
		processPaymentIntent,
	} = useStripeTerminal({
		onUpdateDiscoveredReaders: (readers) => {
			setReaderList(readers || []);
			if ((readers || []).length === 0) {
				setStepText("No readers found yet.");
			}
		},
		onDidChangeConnectionStatus: (status) => {
			if (status === "connected") {
				setStepText("Reader connected. Ready to collect payment.");
			}
		},
		onDidRequestReaderInput: (input) => {
			if (input) setStepText("Waiting for card.");
		},
		onDidRequestReaderDisplayMessage: (message) => {
			if (message) setStepText("Follow the prompt on the reader.");
		},
	});

	const {
		partyId,
		closeoutItemIds = [],
		closeoutSeatIds = [],
		selectedSeatBreakdown = [],
		tipAmount = 0,
		expectedTotalCents = 0,
		tableName = "Table",
		receiptEmail = "",
		closeoutNotes = "",
	} = params || {};

	const isBusy = isDiscovering || isConnecting || isPaying || isFinalizing;
	const selectedItemCount = closeoutItemIds.length;

	const totalLabel = useMemo(
		() => formatCurrencyFromDollars(Number(expectedTotalCents || 0) / 100),
		[expectedTotalCents],
	);

	const goToActiveTables = useCallback(() => {
		navigation.dispatch(
			CommonActions.reset({
				index: 0,
				routes: [{ name: "RestaurantActiveTables" }],
			}),
		);
	}, [navigation]);

	useEffect(() => {
		let mounted = true;

		const initializeTerminal = async () => {
			const result = await initialize();
			if (!mounted) return;
			if (result?.error) {
				setErrorText(
					result.error.message ||
						"Stripe Terminal could not initialize on this device.",
				);
			}
		};

		initializeTerminal();

		return () => {
			mounted = false;
		};
	}, [initialize]);

	const startDiscovery = async (simulated = false) => {
		setErrorText("");
		setReaderList([]);
		setIsDiscovering(true);
		setStepText(
			simulated
				? "Searching for simulated readers..."
				: "Searching for internet readers...",
		);

		try {
			await cancelDiscovering();
			const result = await discoverReaders({
				discoveryMethod: "internet",
				simulated,
			});

			if (result?.error) {
				throw result.error;
			}
		} catch (error) {
			setErrorText(error.message || "Could not discover readers.");
			setStepText("Reader discovery failed.");
		} finally {
			setIsDiscovering(false);
		}
	};

	const handleConnectReader = async (reader) => {
		setErrorText("");
		setIsConnecting(true);
		setStepText(`Connecting to ${getReaderName(reader)}...`);

		try {
			const result = await connectReader({
				reader,
				discoveryMethod: "internet",
				failIfInUse: true,
			});

			if (result?.error) {
				throw result.error;
			}

			setStepText("Reader connected. Ready to collect payment.");
		} catch (error) {
			setErrorText(error.message || "Could not connect to reader.");
			setStepText("Reader connection failed.");
		} finally {
			setIsConnecting(false);
		}
	};

	const finalizeCloseout = useCallback(
		async (paymentIntentId) => {
			if (!paymentIntentId) return;

			setIsFinalizing(true);
			setErrorText("");
			setStepText("Finalizing table closeout...");

			try {
				const closePartyTable = httpsCallable(functions, "closePartyTable");
				const result = await closePartyTable({
					partyId,
					paymentMethod: "stripe_terminal",
					tenderType: "stripe_terminal",
					terminalPaymentIntentId: paymentIntentId,
					externalReference: paymentIntentId,
					receiptEmail: String(receiptEmail || "").trim(),
					tipAmount,
					cashReceived: 0,
					closeoutNotes: String(closeoutNotes || "").trim(),
					closeoutSeatIds,
					closeoutItemIds,
					closedByStaffId: activeSession?.id || null,
					closedByName: getStaffName(activeSession, currentUserData),
				});

				if (!result?.data?.success) {
					throw new Error("Could not finalize this closeout.");
				}

				const isFinalCloseout = result?.data?.isFinalCloseout !== false;
				Alert.alert(
					isFinalCloseout ? "Table Closed" : "Payment Recorded",
					`Order: ${result?.data?.readableOrderId || partyId}`,
					[
						{
							text: "OK",
							onPress: isFinalCloseout ? goToActiveTables : () => navigation.goBack(),
						},
					],
				);
			} catch (error) {
				setErrorText(
					error.message ||
						"Payment succeeded, but the table closeout did not finalize yet. Try finalizing again.",
				);
				setStepText("Payment captured. Closeout still needs finalizing.");
			} finally {
				setIsFinalizing(false);
			}
		},
		[
			activeSession,
			closeoutItemIds,
			closeoutNotes,
			closeoutSeatIds,
			currentUserData,
			goToActiveTables,
			navigation,
			partyId,
			receiptEmail,
			tipAmount,
		],
	);

	const handleCollectPayment = async () => {
		if (!connectedReader) {
			setErrorText("Connect a reader before collecting payment.");
			return;
		}

		setErrorText("");
		setIsPaying(true);
		setProcessedPaymentIntentId("");
		let capturedPaymentIntentId = "";

		try {
			setStepText("Preparing payment...");
			const prepareStaffTerminalPayment = httpsCallable(
				functions,
				"prepareStaffTerminalPayment",
			);
			const prepResult = await prepareStaffTerminalPayment({
				partyId,
				closeoutItemIds,
				closeoutSeatIds,
				tipAmount,
				staffId: activeSession?.id || null,
				staffName: getStaffName(activeSession, currentUserData),
			});
			const prepData = prepResult?.data || {};

			if (!prepData.clientSecret || !prepData.paymentIntentId) {
				throw new Error("The payment could not be prepared.");
			}

			if (Number(prepData.amount || 0) !== Number(expectedTotalCents || 0)) {
				throw new Error(
					"The payment amount changed. Reopen closeout and review the total.",
				);
			}

			setStepText("Loading payment on reader...");
			const retrieved = await retrievePaymentIntent(prepData.clientSecret);
			if (retrieved?.error) throw retrieved.error;

			setStepText("Ask guest to present card.");
			const collected = await collectPaymentMethod({
				paymentIntent: retrieved.paymentIntent,
				skipTipping: true,
			});
			if (collected?.error) throw collected.error;

			setStepText("Processing card...");
			const processed = await processPaymentIntent({
				paymentIntent: collected.paymentIntent,
				skipTipping: true,
			});
			if (processed?.error) throw processed.error;

			const paymentIntentId =
				processed?.paymentIntent?.id || prepData.paymentIntentId;
			capturedPaymentIntentId = paymentIntentId;
			setProcessedPaymentIntentId(paymentIntentId);
			setStepText("Payment captured. Waiting for Stripe confirmation...");

			const webhookReady = await waitForTerminalPaymentStatus(paymentIntentId);
			if (!webhookReady) {
				throw new Error(
					"Payment captured, but Stripe confirmation is still syncing. Tap Finalize Closeout in a few seconds.",
				);
			}

			await finalizeCloseout(paymentIntentId);
		} catch (error) {
			setErrorText(error.message || "Terminal payment failed.");
			if (capturedPaymentIntentId) {
				setStepText("Payment captured. Closeout still needs finalizing.");
			}
		} finally {
			setIsPaying(false);
		}
	};

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.header}>
					<TouchableOpacity
						style={styles.backButton}
						onPress={() => navigation.goBack()}
						disabled={isBusy}
					>
						<Ionicons name="arrow-back" size={22} color={colors.textDark} />
					</TouchableOpacity>
					<View style={styles.headerText}>
						<Text style={styles.title}>Scerv Terminal</Text>
						<Text style={styles.subtitle}>{tableName}</Text>
					</View>
				</View>

				<View style={styles.totalPanel}>
					<Text style={styles.totalLabel}>Amount to collect</Text>
					<Text style={styles.totalAmount}>{totalLabel}</Text>
					<Text style={styles.totalMeta}>
						{selectedItemCount} item{selectedItemCount === 1 ? "" : "s"} selected
					</Text>
				</View>

				{selectedSeatBreakdown.length > 0 && (
					<View style={styles.seatPanel}>
						<Text style={styles.panelTitle}>Closeout seats</Text>
						{selectedSeatBreakdown.map((seat) => (
							<View key={seat.id} style={styles.seatRow}>
								<View style={styles.seatNameWrap}>
									<Text style={styles.seatName}>{seat.name}</Text>
									<Text style={styles.seatItems}>
										{seat.itemCount || seat.items?.length || 0} item
										{(seat.itemCount || seat.items?.length || 0) === 1
											? ""
											: "s"}
									</Text>
								</View>
								<Text style={styles.seatAmount}>
									{formatCurrencyFromDollars(Number(seat.subtotal || 0))}
								</Text>
							</View>
						))}
					</View>
				)}

				<View style={styles.statusPanel}>
					<MaterialCommunityIcons
						name={connectedReader ? "contactless-payment" : "credit-card-sync"}
						size={28}
						color={connectedReader ? colors.statusSuccess : colors.primary}
					/>
					<View style={styles.statusTextWrap}>
						<Text style={styles.statusTitle}>
							{connectedReader
								? getReaderName(connectedReader)
								: "No reader connected"}
						</Text>
						<Text style={styles.statusText}>{stepText}</Text>
					</View>
				</View>

				{errorText ? (
					<View style={styles.errorBox}>
						<Text style={styles.errorText}>{errorText}</Text>
					</View>
				) : null}

				<View style={styles.actionGrid}>
					<TouchableOpacity
						style={styles.secondaryButton}
						onPress={() => startDiscovery(false)}
						disabled={isBusy}
					>
						<Text style={styles.secondaryButtonText}>Find Readers</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.secondaryButton}
						onPress={() => startDiscovery(true)}
						disabled={isBusy}
					>
						<Text style={styles.secondaryButtonText}>Test Reader</Text>
					</TouchableOpacity>
				</View>

				{isDiscovering ? (
					<View style={styles.loadingRow}>
						<ActivityIndicator size="small" color={colors.primary} />
						<Text style={styles.loadingText}>Searching...</Text>
					</View>
				) : null}

				{readerList.map((reader) => {
					const isConnected = connectedReader?.id === reader.id;
					return (
						<TouchableOpacity
							key={reader.id}
							style={[
								styles.readerRow,
								isConnected && styles.readerRowConnected,
							]}
							onPress={() => handleConnectReader(reader)}
							disabled={isBusy || isConnected}
						>
							<View>
								<Text style={styles.readerName}>{getReaderName(reader)}</Text>
								<Text style={styles.readerMeta}>
									{reader.deviceType || "reader"} · {reader.status || "unknown"}
								</Text>
							</View>
							<Text style={styles.readerAction}>
								{isConnected ? "Connected" : "Connect"}
							</Text>
						</TouchableOpacity>
					);
				})}
			</ScrollView>

			<View style={styles.footer}>
				{processedPaymentIntentId && !isPaying ? (
					<TouchableOpacity
						style={styles.secondaryFullButton}
						onPress={() => finalizeCloseout(processedPaymentIntentId)}
						disabled={isFinalizing}
					>
						<Text style={styles.secondaryFullButtonText}>Finalize Closeout</Text>
					</TouchableOpacity>
				) : null}
				<TouchableOpacity
					style={[
						styles.primaryButton,
						(!connectedReader || isBusy) && styles.buttonDisabled,
					]}
					onPress={handleCollectPayment}
					disabled={!connectedReader || isBusy}
				>
					{isPaying || isFinalizing ? (
						<ActivityIndicator size="small" color={colors.surfaceWhite} />
					) : (
						<Text style={styles.primaryButtonText}>Collect {totalLabel}</Text>
					)}
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	);
};

const RestaurantTerminalPaymentScreen = () => {
	const route = useRoute();
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const restaurantId = route.params?.restaurantId || currentUserData?.uid;

	const tokenProvider = useCallback(async () => {
		const createTerminalConnectionToken = httpsCallable(
			functions,
			"createTerminalConnectionToken",
		);
		const result = await createTerminalConnectionToken({
			restaurantId,
			staffId: activeSession?.id || null,
		});

		if (!result?.data?.secret) {
			throw new Error("Could not create Stripe Terminal connection token.");
		}

		return result.data.secret;
	}, [activeSession?.id, restaurantId]);

	if (!restaurantId) {
		return (
			<SafeAreaView style={styles.centered}>
				<Text style={styles.errorText}>Restaurant context is missing.</Text>
			</SafeAreaView>
		);
	}

	return (
		<StripeTerminalProvider logLevel="error" tokenProvider={tokenProvider}>
			<RestaurantTerminalPaymentContent
				activeSession={activeSession}
				currentUserData={currentUserData}
				params={route.params || {}}
			/>
		</StripeTerminalProvider>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
	},
	centered: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.backgroundLight,
		padding: 20,
	},
	content: {
		padding: 18,
		paddingBottom: 140,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
	},
	backButton: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 10,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginRight: 12,
	},
	headerText: {
		flex: 1,
	},
	title: {
		fontSize: 24,
		fontWeight: "900",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 14,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 2,
	},
	totalPanel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 18,
		marginBottom: 14,
	},
	totalLabel: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textMedium,
		textTransform: "uppercase",
	},
	totalAmount: {
		fontSize: 38,
		fontWeight: "900",
		color: colors.primary,
		marginTop: 6,
	},
	totalMeta: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 4,
	},
	seatPanel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 14,
	},
	panelTitle: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textDark,
		marginBottom: 10,
	},
	seatRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 8,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	seatNameWrap: {
		flex: 1,
		marginRight: 10,
	},
	seatName: {
		fontSize: 14,
		fontWeight: "800",
		color: colors.textDark,
	},
	seatItems: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 2,
	},
	seatAmount: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.primary,
	},
	statusPanel: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 14,
	},
	statusTextWrap: {
		flex: 1,
		marginLeft: 12,
	},
	statusTitle: {
		fontSize: 15,
		fontWeight: "900",
		color: colors.textDark,
	},
	statusText: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 3,
	},
	errorBox: {
		backgroundColor: colors.statusDanger + "12",
		borderWidth: 1,
		borderColor: colors.statusDanger + "55",
		borderRadius: 10,
		padding: 12,
		marginBottom: 14,
	},
	errorText: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.statusDanger,
		lineHeight: 18,
		textAlign: "center",
	},
	actionGrid: {
		flexDirection: "row",
		gap: 10,
		marginBottom: 12,
	},
	secondaryButton: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.primary,
		backgroundColor: colors.surfaceWhite,
		paddingVertical: 13,
	},
	secondaryButtonText: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.primary,
	},
	loadingRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 10,
	},
	loadingText: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.textMedium,
	},
	readerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 10,
	},
	readerRowConnected: {
		borderColor: colors.statusSuccess,
		backgroundColor: colors.statusSuccess + "10",
	},
	readerName: {
		fontSize: 15,
		fontWeight: "900",
		color: colors.textDark,
	},
	readerMeta: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 2,
		textTransform: "capitalize",
	},
	readerAction: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.primary,
	},
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		padding: 16,
		gap: 10,
	},
	primaryButton: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.primary,
		borderRadius: 10,
		paddingVertical: 15,
		minHeight: 52,
	},
	buttonDisabled: {
		opacity: 0.55,
	},
	primaryButtonText: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.surfaceWhite,
	},
	secondaryFullButton: {
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.primary,
		paddingVertical: 13,
	},
	secondaryFullButtonText: {
		fontSize: 15,
		fontWeight: "900",
		color: colors.primary,
	},
});

export default RestaurantTerminalPaymentScreen;
