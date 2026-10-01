import React, {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ActivityIndicator,
	Alert,
	PermissionsAndroid,
	Platform,
	SafeAreaView,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { CommonActions, useNavigation, useRoute } from "@react-navigation/native";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { formatCurrencyFromDollars } from "../../utils/currencyFormatter";
import { useRestaurantTerminal } from "../../context/restaurant/RestaurantTerminalContext";

const getStaffName = (activeSession, currentUserData) =>
	activeSession?.name ||
	`${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`.trim() ||
	"Staff";

const DEFAULT_PAY_LITE_FEE_PERCENTAGE = 0.04;

const parseCurrencyInputToCents = (value) => {
	const normalized = String(value || "").replace(/[^0-9.]/g, "");
	if (!normalized) return 0;
	const parts = normalized.split(".");
	const dollars = parts[0] || "0";
	const cents = (parts[1] || "").slice(0, 2).padEnd(2, "0");
	const parsed = Number(`${dollars}.${cents}`);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return Math.round(parsed * 100);
};

const normalizePercentageValue = (value, fallback = 0) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	const normalized = parsed > 1 ? parsed / 100 : parsed;
	return Math.min(normalized, 1);
};

const normalizeNonNegativeCents = (value, fallback = 0) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.round(parsed);
};

const normalizePolicyMode = (value, allowedValues = [], fallback = "") => {
	const normalized = String(value || "").trim();
	return allowedValues.includes(normalized) ? normalized : fallback;
};

const getReaderName = (reader = {}) =>
	reader.label ||
	reader.serialNumber ||
	reader.id ||
	reader.deviceType ||
	"Stripe reader";

const formatReceiptTimestamp = (value = new Date()) => {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

const formatReceiptAmount = (cents = 0) =>
	formatCurrencyFromDollars(Number(cents || 0) / 100);

const getReceiptPaymentLabel = (paymentIntentId = "") => {
	const id = String(paymentIntentId || "").trim();
	return id ? id.slice(-8).toUpperCase() : "Recorded";
};

const buildPayLiteCustomerReceiptText = (receipt = {}) => {
	if (receipt.printableText) return String(receipt.printableText);
	if (receipt.shareText) return String(receipt.shareText);

	const lines = [
		receipt.restaurantName || "Restaurant",
		"Scerv Pay Lite Receipt",
		formatReceiptTimestamp(receipt.paidAt),
		"",
		`Sale amount: ${formatReceiptAmount(receipt.merchantNetSalesAmount)}`,
	];

	if (Number(receipt.taxAmount || 0) > 0) {
		lines.push(`Tax: ${formatReceiptAmount(receipt.taxAmount)}`);
	}

	if (Number(receipt.customerServiceFeeAmount || 0) > 0) {
		lines.push(
			`Card fee: ${formatReceiptAmount(receipt.customerServiceFeeAmount)}`,
		);
	}

	lines.push(`Tip: ${formatReceiptAmount(receipt.gratuityAmount)}`);
	lines.push(`Total paid: ${formatReceiptAmount(receipt.amount)}`);
	lines.push("");
	lines.push(`Payment: ${getReceiptPaymentLabel(receipt.paymentIntentId)}`);

	if (receipt.staffName) lines.push(`Staff: ${receipt.staffName}`);
	if (receipt.readerLabel) lines.push(`Reader: ${receipt.readerLabel}`);
	if (receipt.note) lines.push(`Reference: ${receipt.note}`);

	lines.push("");
	lines.push("Thank you.");

	return lines.filter((line) => line !== null && line !== undefined).join("\n");
};

const getDiscoveryMethodLabel = (discoveryMethod) =>
	discoveryMethod === "bluetoothScan"
		? "M2 Bluetooth readers"
		: "internet readers";

const getPreferredCollector = (restaurantData = {}) =>
	restaurantData?.payLiteDefaultCollector ||
	restaurantData?.defaultTerminalCollector ||
	restaurantData?.terminalDefaultCollector ||
	null;

const getCollectorLocationId = (collector = {}) =>
	String(collector?.locationId || collector?.terminalLocationId || "").trim();

const getCollectorReaderId = (collector = {}) =>
	String(collector?.readerId || collector?.id || "").trim();

const getCollectorSerialNumber = (collector = {}) =>
	String(collector?.serialNumber || "").trim();

const getInternetDiscoveryFilter = (collector = {}) => {
	const readerId = getCollectorReaderId(collector);
	if (readerId) return { readerId };
	const serialNumber = getCollectorSerialNumber(collector);
	if (serialNumber) return { serialNumber };
	return null;
};

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const isManagementSession = (activeSession = {}) =>
	["owner", "manager"].includes(normalizeRole(activeSession?.role));

const isSameCollector = (reader = {}, collector = {}) => {
	if (!reader || !collector) return false;
	const readerId = String(reader.id || "").trim();
	const collectorReaderId = String(collector.readerId || collector.id || "").trim();
	if (readerId && collectorReaderId && readerId === collectorReaderId) return true;

	const readerSerial = String(reader.serialNumber || "").trim();
	const collectorSerial = String(collector.serialNumber || "").trim();
	return !!readerSerial && !!collectorSerial && readerSerial === collectorSerial;
};

const selectInternetReader = (readers = [], collector = {}) => {
	const internetReaders = (readers || []).filter(
		(reader) =>
			reader &&
			(reader.discoveryMethod === "internet" ||
				reader.deviceType === "stripeS710" ||
				reader.deviceType === "stripeS700"),
	);
	if (!internetReaders.length) return null;

	const preferredReader = internetReaders.find((reader) =>
		isSameCollector(reader, collector),
	);
	return preferredReader || internetReaders[0];
};

const wait = (durationMs) =>
	new Promise((resolve) => {
		setTimeout(resolve, durationMs);
	});

const waitForDiscoveredReaders = async (getReaders, timeoutMs = 2500) => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const readers = getReaders();
		if (readers.length) return readers;
		await wait(250);
	}
	return getReaders();
};

const requestTerminalDiscoveryPermissions = async (discoveryMethod) => {
	if (Platform.OS !== "android") return true;

	const requestedPermissions = [
		PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
		discoveryMethod === "bluetoothScan"
			? PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN ||
				"android.permission.BLUETOOTH_SCAN"
			: null,
		discoveryMethod === "bluetoothScan"
			? PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT ||
				"android.permission.BLUETOOTH_CONNECT"
			: null,
	].filter(Boolean);

	const permissionResults = await Promise.all(
		requestedPermissions.map(async (permission) => ({
			permission,
			granted: await PermissionsAndroid.check(permission),
		})),
	);

	if (permissionResults.every((result) => result.granted)) return true;

	const result = await PermissionsAndroid.requestMultiple(requestedPermissions, {
		title: "Reader Permissions",
		message:
			"Scerv needs Bluetooth and location access to find nearby Stripe card readers.",
		buttonPositive: "Allow",
		buttonNegative: "Not now",
	});

	return requestedPermissions.every(
		(permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED,
	);
};

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

const withTerminalTimeout = (promise, timeoutMs, message) =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
		promise
			.then((result) => {
				clearTimeout(timer);
				resolve(result);
			})
			.catch((error) => {
				clearTimeout(timer);
				reject(error);
			});
	});

const isConnectionTokenTimeout = (error) =>
	String(error?.message || error || "")
		.toLowerCase()
		.includes("timed out waiting for connection token");

const getTerminalErrorDetails = (error) => ({
	message: error?.message,
	code: error?.code,
	nativeErrorCode: error?.nativeErrorCode,
	apiErrorCode: error?.apiError?.code,
	declineCode: error?.apiError?.declineCode,
	apiErrorMessage: error?.apiError?.message,
	underlyingCode: error?.underlyingError?.code,
	underlyingMessage: error?.underlyingError?.message,
});

const isAlreadyConnectedReaderError = (error) => {
	const message = String(error?.code || error?.message || error || "")
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	return (
		message.includes("already_connected") ||
		(message.includes("already") && message.includes("connected"))
	);
};

const isReaderInUseError = (error) => {
	const message = String(
		error?.code ||
			error?.nativeErrorCode ||
			error?.message ||
			error ||
			"",
	)
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	return (
		message.includes("reader_busy") ||
		message.includes("reader_in_use") ||
		message.includes("already_in_use") ||
		(message.includes("already") && message.includes("use")) ||
		(message.includes("currently") && message.includes("use"))
	);
};

const formatTerminalErrorDetails = (error) => {
	const parts = [
		error?.code,
		error?.nativeErrorCode,
		error?.message || (typeof error === "string" ? error : ""),
	]
		.map((part) => String(part || "").trim())
		.filter(Boolean);
	return Array.from(new Set(parts)).join(" - ");
};

const getFriendlyReaderError = (error, fallback) => {
	const message = String(error?.message || error || "").toLowerCase();

	if (message.includes("connection token")) {
		return "Reader session expired. Refresh the reader connection and try again.";
	}
	if (message.includes("permission")) {
		return "This staff session cannot use the card reader. Ask a manager to check access.";
	}
	if (message.includes("already") && message.includes("discover")) {
		return "Reader search is already running. Wait a moment, then try again.";
	}
	if (message.includes("single discovery operation")) {
		return "Reader search is already running. Wait a moment, then try again.";
	}
	if (message.includes("amount")) {
		return "The total changed. Reopen closeout and review the amount.";
	}
	if (isReaderInUseError(error)) {
		return "The S710 is already tied to another session. Restart the reader or wait a moment, then reconnect.";
	}

	const details = formatTerminalErrorDetails(error);
	if (details) return details;

	return fallback;
};

const RestaurantTerminalPaymentContent = ({
	activeSession,
	currentUserData,
	endSession,
	params,
	tokenStatus,
}) => {
	const navigation = useNavigation();
	const [stepText, setStepText] = useState("Connect a Stripe reader to start.");
	const [errorText, setErrorText] = useState("");
	const [isDiscovering, setIsDiscovering] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isPaying, setIsPaying] = useState(false);
	const [isFinalizing, setIsFinalizing] = useState(false);
	const [processedPaymentIntentId, setProcessedPaymentIntentId] = useState("");
	const [payLiteAmountText, setPayLiteAmountText] = useState("");
	const [payLiteNote, setPayLiteNote] = useState("");
	const [lastPayLiteReceipt, setLastPayLiteReceipt] = useState(null);
	const [recentPayLiteReceipts, setRecentPayLiteReceipts] = useState([]);
	const [lastDiscoveryMethod, setLastDiscoveryMethod] = useState("internet");
	const [preferredCollectorOverride, setPreferredCollectorOverride] =
		useState(null);
	const showDiagnostics = typeof __DEV__ !== "undefined" && __DEV__;
	const showReaderControls = isManagementSession(activeSession);

	const {
		liveMode,
		readerList,
		easyConnect,
		discoverReaders,
		cancelDiscovering,
		connectReader,
		disconnectReader,
		getCurrentReaders,
		terminalInitialized,
		connectedReader,
		refreshConnectionToken,
		retrievePaymentIntent,
		collectPaymentMethod,
		confirmPaymentIntent,
		cancelPaymentIntent,
		cancelCollectPaymentMethod,
		cancelProcessPaymentIntent,
	} = useRestaurantTerminal();
	const autoConnectAttemptedRef = useRef(false);

	const {
		partyId,
		closeoutItemIds = [],
		closeoutSeatIds = [],
		selectedSeatBreakdown = [],
		expectedTotalCents = 0,
		tableName = "Table",
		receiptEmail = "",
		closeoutNotes = "",
		stripeTerminalLocationId = "",
		restaurantId,
		mode = "",
		lockToPayLite = false,
	} = params || {};

	const isPayLite = mode === "scerv_pay_lite";
	const payLiteSaleAmountCents = useMemo(
		() => parseCurrencyInputToCents(payLiteAmountText),
		[payLiteAmountText],
	);
	const payLiteConfig = currentUserData?.payLitePolicy || {};
	const paymentPolicy = currentUserData?.paymentPolicy || {};
	const payLiteCustomerFeePercentage = useMemo(
		() =>
			normalizePercentageValue(
				payLiteConfig.customerFeePercentage ??
				payLiteConfig.customerServiceFeePercentage ??
					payLiteConfig.customerChargePercentage ??
					paymentPolicy.payLiteCustomerServiceFeePercentage ??
					paymentPolicy.payLiteCustomerFeePercentage ??
					currentUserData?.payLiteCustomerServiceFeePercentage ??
					currentUserData?.payLiteCustomerFeePercentage,
				DEFAULT_PAY_LITE_FEE_PERCENTAGE,
			),
		[currentUserData, payLiteConfig, paymentPolicy],
	);
	const payLiteCustomerFeeMode = normalizePolicyMode(
		payLiteConfig.customerFeeMode ??
			payLiteConfig.customerServiceFeeMode ??
			paymentPolicy.payLiteCustomerFeeMode,
		["pass_to_customer", "none", "waived"],
		"pass_to_customer",
	);
	const payLiteCustomerFeeBasis = normalizePolicyMode(
		payLiteConfig.customerFeeBasis ??
			payLiteConfig.customerServiceFeeBasis ??
			paymentPolicy.payLiteCustomerFeeBasis,
		["sale", "sales_and_tax"],
		"sales_and_tax",
	);
	const payLiteTaxMode = normalizePolicyMode(
		payLiteConfig.taxMode ??
			paymentPolicy.payLiteTaxMode ??
			currentUserData?.payLiteTaxMode,
		["pos_included", "scerv_calculated", "none", "waived"],
		"pos_included",
	);
	const payLiteTaxRate = normalizePercentageValue(
		payLiteConfig.taxRate ??
			paymentPolicy.payLiteTaxRate ??
			currentUserData?.payLiteTaxRate ??
			currentUserData?.taxRate,
		0,
	);
	const payLiteCustomerFeeFixedCents = normalizeNonNegativeCents(
		payLiteConfig.customerFeeFixedCents ??
			payLiteConfig.customerServiceFeeFixedCents ??
			paymentPolicy.payLiteCustomerFeeFixedCents,
		0,
	);
	const payLiteServiceFeeCents = useMemo(
		() => {
			const taxAmount =
				payLiteTaxMode === "scerv_calculated"
					? Math.round(payLiteSaleAmountCents * payLiteTaxRate)
					: 0;
			const feeBasis =
				payLiteCustomerFeeBasis === "sale"
					? payLiteSaleAmountCents
					: payLiteSaleAmountCents + taxAmount;
			return ["none", "waived"].includes(payLiteCustomerFeeMode)
				? 0
				: Math.round(feeBasis * payLiteCustomerFeePercentage) +
					payLiteCustomerFeeFixedCents;
		},
		[
			payLiteCustomerFeeBasis,
			payLiteCustomerFeeFixedCents,
			payLiteCustomerFeeMode,
			payLiteCustomerFeePercentage,
			payLiteSaleAmountCents,
			payLiteTaxMode,
			payLiteTaxRate,
		],
	);
	const payLiteTaxAmountCents = useMemo(
		() =>
			payLiteTaxMode === "scerv_calculated"
				? Math.round(payLiteSaleAmountCents * payLiteTaxRate)
				: 0,
		[payLiteSaleAmountCents, payLiteTaxMode, payLiteTaxRate],
	);
	const paymentTotalCents = isPayLite
		? payLiteSaleAmountCents + payLiteTaxAmountCents + payLiteServiceFeeCents
		: expectedTotalCents;
	const isBusy = isDiscovering || isConnecting || isPaying || isFinalizing;
	const selectedItemCount = closeoutItemIds.length;
	const isSimulatedReader = connectedReader?.simulated === true;
	const canUseTestReader = liveMode === false;
	const preferredCollector =
		preferredCollectorOverride || getPreferredCollector(currentUserData);
	const effectiveTerminalLocationId =
		getCollectorLocationId(preferredCollector) || stripeTerminalLocationId;
	const connectedReaderIsDefault = isSameCollector(
		connectedReader,
		preferredCollector,
	);
	const canSetDefaultCollector =
		isPayLite &&
		!!connectedReader &&
		isManagementSession(activeSession) &&
		!connectedReaderIsDefault;
	const collectorPillLabel = connectedReader
		? `${connectedReaderIsDefault ? "Default" : "Connected"}: ${getReaderName(
				connectedReader,
			)}`
		: preferredCollector
			? `Default: ${getReaderName(preferredCollector)}`
			: "No collector";
	const pendingReaderLabel = preferredCollector
		? getReaderName(preferredCollector)
		: "No reader connected";

	const totalLabel = useMemo(
		() => formatCurrencyFromDollars(Number(paymentTotalCents || 0) / 100),
		[paymentTotalCents],
	);

	const recordPayLiteReceipt = useCallback((receipt) => {
		if (!receipt) return;
		setLastPayLiteReceipt(receipt);
		setRecentPayLiteReceipts((current) => {
			const receiptId = receipt.paymentIntentId || receipt.id || "";
			const withoutDuplicate = current.filter((item) => {
				const itemId = item.paymentIntentId || item.id || "";
				return itemId !== receiptId;
			});
			return [receipt, ...withoutDuplicate].slice(0, 5);
		});
		setPayLiteAmountText("0.00");
		setPayLiteNote("");
	}, []);

	const sharePayLiteCustomerReceipt = useCallback(
		async (receipt = lastPayLiteReceipt) => {
			if (!receipt) return;
			try {
				await Share.share({
					title: "Customer receipt",
					message: buildPayLiteCustomerReceiptText(receipt),
				});
			} catch (error) {
				console.error("[PAY LITE RECEIPT] share failed", {
					message: error?.message,
				});
				Alert.alert(
					"Receipt unavailable",
					"Could not open the receipt share sheet.",
				);
			}
		},
		[lastPayLiteReceipt],
	);

	const loadRecentPayLiteReceipts = useCallback(async () => {
		if (!isPayLite || !restaurantId || !activeSession?.id) return;

		try {
			const getRecentReceipts = httpsCallable(
				functions,
				"getRecentScervPayLiteReceipts",
			);
			const result = await getRecentReceipts({
				restaurantId,
				staffId: activeSession.id,
				limit: 5,
			});
			const receipts = Array.isArray(result?.data?.receipts)
				? result.data.receipts
				: [];
			setRecentPayLiteReceipts(receipts);
			setLastPayLiteReceipt((current) => {
				if (!current) return receipts[0] || null;
				const currentId = current.paymentIntentId || current.id || "";
				const stillInRecentReceipts = receipts.some((receipt) => {
					const receiptId = receipt.paymentIntentId || receipt.id || "";
					return receiptId && receiptId === currentId;
				});
				return stillInRecentReceipts ? current : receipts[0] || null;
			});
		} catch (error) {
			const code = String(error?.code || "").toLowerCase();
			const message = String(error?.message || "").toLowerCase();
			if (code.includes("not-found") || message.includes("not_found")) {
				console.log("[PAY LITE RECEIPT] recent receipts callable unavailable", {
					message: error?.message,
					code: error?.code,
				});
				return;
			}
			console.warn("[PAY LITE RECEIPT] recent receipts load failed", {
				message: error?.message,
				code: error?.code,
			});
		}
	}, [activeSession?.id, isPayLite, restaurantId]);

	useEffect(() => {
		loadRecentPayLiteReceipts();
	}, [loadRecentPayLiteReceipts]);

	const cleanupFailedTerminalAttempt = useCallback(
		async ({ paymentIntent = null, stage = "" } = {}) => {
			try {
				if (stage === "collectPaymentMethod") {
					await withTerminalTimeout(
						cancelCollectPaymentMethod(),
						5000,
						"Timed out clearing card collection.",
					);
				} else if (stage === "processPaymentIntent") {
					await withTerminalTimeout(
						cancelProcessPaymentIntent(),
						5000,
						"Timed out clearing card processing.",
					);
				}
			} catch (cancelActionError) {
				console.log("[TERMINAL PAYMENT] reader action cleanup skipped", {
					stage,
					...getTerminalErrorDetails(cancelActionError),
				});
			}

			if (!paymentIntent) return;

			try {
				await withTerminalTimeout(
					cancelPaymentIntent({ paymentIntent }),
					8000,
					"Timed out cancelling failed payment intent.",
				);
			} catch (cancelIntentError) {
				console.log("[TERMINAL PAYMENT] payment intent cleanup skipped", {
					stage,
					paymentIntentId: paymentIntent?.id || null,
					...getTerminalErrorDetails(cancelIntentError),
				});
			}
		},
		[
			cancelCollectPaymentMethod,
			cancelPaymentIntent,
			cancelProcessPaymentIntent,
		],
	);

	const finalizeAuthorizedPayLitePayment = useCallback(
		async (paymentIntentId = processedPaymentIntentId) => {
			if (!paymentIntentId) return;

			setErrorText("");
			setIsFinalizing(true);
			setStepText("Finalizing authorized payment...");

			try {
				const captureStaffTerminalPayment = httpsCallable(
					functions,
					"captureStaffTerminalPayment",
				);
				const captureResult = await captureStaffTerminalPayment({
					paymentIntentId,
					staffId: activeSession?.id || null,
				});
				const captureData = captureResult?.data || {};
				if (!captureData.success) {
					throw new Error("Could not capture the Terminal payment.");
				}

				await waitForTerminalPaymentStatus(paymentIntentId, 15000);

				const receipt =
					captureData.customerReceipt || {
						paymentIntentId,
						restaurantName:
							currentUserData?.restaurantName ||
							currentUserData?.name ||
							"Restaurant",
						staffName: getStaffName(activeSession, currentUserData),
						paidAt: new Date().toISOString(),
						merchantNetSalesAmount: Number(
							captureData.merchantNetSalesAmount ||
								payLiteSaleAmountCents ||
								0,
						),
						taxAmount: Number(captureData.taxAmount || payLiteTaxAmountCents || 0),
						customerServiceFeeAmount: Number(
							captureData.customerServiceFeeAmount ||
								payLiteServiceFeeCents ||
								0,
						),
						gratuityAmount: Number(captureData.gratuityAmount || 0),
						amount: Number(captureData.amount || paymentTotalCents || 0),
						readerLabel: getReaderName(connectedReader || {}),
						readerSerialNumber: connectedReader?.serialNumber || "",
						note: String(payLiteNote || "").trim(),
					};

				recordPayLiteReceipt(receipt);
				setProcessedPaymentIntentId("");
				setStepText("Payment recorded. Receipt ready.");
			} catch (error) {
				console.error("[TERMINAL PAYMENT] Pay Lite finalize failed", {
					message: error?.message,
					code: error?.code,
					details: error?.details,
					paymentIntentId,
				});
				setErrorText(
					getFriendlyReaderError(
						error,
						"Payment is authorized, but capture did not finish. Do not run the card again; try finalizing again.",
					),
				);
				setStepText("Payment authorized. Capture still needs finalizing.");
			} finally {
				setIsFinalizing(false);
			}
		},
		[
			activeSession,
			connectedReader,
			currentUserData,
			payLiteNote,
			payLiteSaleAmountCents,
			payLiteServiceFeeCents,
			payLiteTaxAmountCents,
			paymentTotalCents,
			processedPaymentIntentId,
			recordPayLiteReceipt,
		],
	);

	const goToActiveTables = useCallback(() => {
		navigation.dispatch(
			CommonActions.reset({
				index: 0,
				routes: [{ name: "RestaurantActiveTables" }],
			}),
		);
	}, [navigation]);

	const ensureTerminalReady = () => {
		if (terminalInitialized) return true;
		setErrorText("");
		setStepText("Preparing card reader. Try again in a moment.");
		return false;
	};

	const startDiscovery = async ({
		simulated = false,
		discoveryMethod = "internet",
	} = {}) => {
		if (!ensureTerminalReady()) return;
		const previousDiscoveryMethod = lastDiscoveryMethod;
		const hasRequiredPermissions =
			await requestTerminalDiscoveryPermissions(discoveryMethod);
		if (!hasRequiredPermissions) {
			setErrorText(
				discoveryMethod === "bluetoothScan"
					? "Bluetooth and location permission are required before discovering M2 readers."
					: "Location permission is required before discovering Stripe readers.",
			);
			setStepText("Reader permission required.");
			return;
		}
		if (discoveryMethod === "bluetoothScan" && !effectiveTerminalLocationId) {
			setErrorText(
				"Stripe Terminal location is required before connecting an M2 reader.",
			);
			setStepText("Terminal location required.");
			return;
		}

		setErrorText("");
		setIsDiscovering(true);
		setStepText(
			simulated
				? "Searching for test readers..."
				: `Searching for ${getDiscoveryMethodLabel(discoveryMethod)}...`,
		);

		try {
			if (connectedReader) {
				const connectedDiscoveryMethod =
					connectedReader.discoveryMethod || previousDiscoveryMethod;
				if (
					connectedReader.simulated === simulated &&
					connectedDiscoveryMethod === discoveryMethod
				) {
					setStepText("Reader already connected. Ready to collect payment.");
					return;
				}

				setStepText(
					simulated
						? "Disconnecting real reader for test mode..."
						: "Disconnecting current reader...",
				);
				const disconnectResult = await disconnectReader();
				if (disconnectResult?.error) {
					throw disconnectResult.error;
				}
			}
			await cancelDiscovering();
			setLastDiscoveryMethod(discoveryMethod);
			const result = await discoverReaders(
				discoveryMethod === "bluetoothScan"
					? {
							discoveryMethod: "bluetoothScan",
							simulated,
							timeout: 12,
						}
					: {
							discoveryMethod: "internet",
							simulated,
							...(effectiveTerminalLocationId && !simulated
								? { locationId: effectiveTerminalLocationId }
								: {}),
						},
			);

			if (result?.error) {
				throw result.error;
			}
		} catch (error) {
			setErrorText(
				getFriendlyReaderError(error, "Could not find card readers. Try again."),
			);
			setStepText("Reader discovery failed.");
		} finally {
			setIsDiscovering(false);
		}
	};

	const refreshBackendTerminalReaders = async () => {
		if (!restaurantId) return null;
		const listRestaurantTerminalReaders = httpsCallable(
			functions,
			"listRestaurantTerminalReaders",
		);
		const loadReaders = async (locationId = "") => {
			const result = await withTerminalTimeout(
				listRestaurantTerminalReaders({
					restaurantId,
					staffId: activeSession?.id || null,
					locationId,
				}),
				8000,
				"Timed out checking Stripe readers.",
			);
			return result?.data || null;
		};
		let data = await loadReaders("");
		if (
			effectiveTerminalLocationId &&
			Array.isArray(data?.readers) &&
			!data.readers.length
		) {
			data = await loadReaders(effectiveTerminalLocationId || "");
		}

		const recommendedReader = data?.recommendedReader || null;
		if (recommendedReader) {
			setPreferredCollectorOverride(recommendedReader);
			if (recommendedReader.status === "offline") {
				setStepText(`${getReaderName(recommendedReader)} is offline.`);
			}
		} else if (Array.isArray(data?.readers) && !data.readers.length) {
			setStepText("No Stripe readers found for this location.");
		}

		console.log("[TERMINAL READERS] backend reader snapshot", {
			locationId: data?.locationId || effectiveTerminalLocationId || null,
			recommendedSource: data?.recommendedSource || "none",
			readerCount: Array.isArray(data?.readers) ? data.readers.length : 0,
			readers: (data?.readers || []).map((reader) => ({
				label: reader.label || "",
				id: reader.id || "",
				serialNumber: reader.serialNumber || "",
				status: reader.status || "",
				deviceType: reader.deviceType || "",
				locationId: reader.locationId || "",
			})),
		});

		return data;
	};

	const connectS710Reader = useCallback(async ({ simulated = false, auto = false } = {}) => {
		if (!ensureTerminalReady()) return;
		const hasRequiredPermissions =
			await requestTerminalDiscoveryPermissions("internet");
		if (!hasRequiredPermissions) {
			setErrorText(
				"Location permission is required before connecting the S710.",
			);
			setStepText("Reader permission required.");
			return;
		}

		setErrorText("");
		setIsConnecting(true);
		setLastDiscoveryMethod("internet");
		setStepText(
			simulated
				? "Connecting test reader..."
				: auto
					? "Connecting default S710..."
					: "Connecting S710...",
		);

		try {
			let connectionTarget = preferredCollector;
			if (!simulated) {
				try {
					const backendReaders = await refreshBackendTerminalReaders();
					if (backendReaders?.recommendedReader) {
						connectionTarget = backendReaders.recommendedReader;
					}
				} catch (readerError) {
					console.log("[TERMINAL READERS] backend lookup failed", {
						error: readerError,
					});
					if (!auto) {
						setStepText("Could not check saved readers. Searching locally...");
					}
				}
			}

			if (connectedReader) {
				const connectedDiscoveryMethod =
					connectedReader.discoveryMethod || lastDiscoveryMethod || "internet";
				const connectedIsInternetReader =
					connectedDiscoveryMethod === "internet" ||
					connectedReader.deviceType === "stripeS710" ||
					connectedReader.deviceType === "stripeS700";
				if (
					connectedReader.simulated === simulated &&
					(connectedReaderIsDefault || connectedIsInternetReader || auto)
				) {
					setStepText(
						`${getReaderName(connectedReader)} connected. Ready to collect payment.`,
					);
					return;
				}

				setStepText("Refreshing S710 session...");
				const disconnectResult = await disconnectReader();
				if (disconnectResult?.error) {
					throw disconnectResult.error;
				}
			}

			await withTerminalTimeout(
				cancelDiscovering(),
				3000,
				"Timed out resetting reader discovery.",
			);
			const hasSavedReaderIdentity =
				!!getInternetDiscoveryFilter(connectionTarget);
			const discoveryLocationId =
				!simulated && !hasSavedReaderIdentity
					? getCollectorLocationId(connectionTarget) || effectiveTerminalLocationId
					: "";
			setStepText(
				hasSavedReaderIdentity
					? "Finding saved S710..."
					: discoveryLocationId
					? "Finding S710 at saved Terminal location..."
					: "Finding S710...",
			);
			console.log("[TERMINAL S710] starting internet discovery", {
				locationId: discoveryLocationId || null,
				hasPreferredCollector: !!connectionTarget,
				discoveryFilter: getInternetDiscoveryFilter(connectionTarget),
				preferredCollector: connectionTarget
					? {
							label: connectionTarget.label || connectionTarget.name || "",
							readerId:
								connectionTarget.readerId || connectionTarget.id || "",
							serialNumber: connectionTarget.serialNumber || "",
							locationId: connectionTarget.locationId || "",
						}
					: null,
			});
			const discoverInternetReaders = async (locationId = "", useFilter = true) =>
				withTerminalTimeout(
					discoverReaders({
						discoveryMethod: "internet",
						timeout: 8,
						simulated,
						...(useFilter && getInternetDiscoveryFilter(connectionTarget)
							? {
									discoveryFilter:
										getInternetDiscoveryFilter(connectionTarget),
								}
							: {}),
						...(locationId && !simulated ? { locationId } : {}),
					}),
					10000,
					"Timed out looking for internet readers.",
				);
			let discoveryResult = null;
			try {
				discoveryResult = await discoverInternetReaders(discoveryLocationId);
			} catch (discoveryError) {
				console.log("[TERMINAL S710] internet discovery timed out", {
					locationId: discoveryLocationId || null,
					error: discoveryError,
				});
				if (!discoveryLocationId && !getInternetDiscoveryFilter(connectionTarget)) {
					throw discoveryError;
				}
				setStepText(
					discoveryLocationId
						? "Saved location missed. Searching Stripe account..."
						: "Saved reader missed. Searching all readers...",
				);
				await withTerminalTimeout(
					cancelDiscovering(),
					3000,
					"Timed out resetting reader discovery.",
				);
				discoveryResult = await discoverInternetReaders("", !!discoveryLocationId);
			}

			if (discoveryResult?.error) {
				console.log("[TERMINAL S710] discovery failed", {
					locationId: discoveryLocationId || null,
					error: discoveryResult.error,
				});
				if (isAlreadyConnectedReaderError(discoveryResult.error)) {
					setStepText("Reader connected. Ready to collect payment.");
					return;
				}
				if (!discoveryLocationId && !getInternetDiscoveryFilter(connectionTarget)) {
					throw discoveryResult.error;
				}
				setStepText(
					discoveryLocationId
						? "Saved location missed. Searching Stripe account..."
						: "Saved reader missed. Searching all readers...",
				);
				await withTerminalTimeout(
					cancelDiscovering(),
					3000,
					"Timed out resetting reader discovery.",
				);
				discoveryResult = await discoverInternetReaders("", !!discoveryLocationId);
				if (discoveryResult?.error) {
					throw discoveryResult.error;
				}
			}

			let discoveredReaders = await waitForDiscoveredReaders(getCurrentReaders);
			console.log("[TERMINAL S710] discovered internet readers", {
				count: discoveredReaders.length,
				locationId: discoveryLocationId || null,
				readers: discoveredReaders.map((reader) => ({
					label: reader.label || "",
					serialNumber: reader.serialNumber || "",
					locationId: reader.locationId || "",
					deviceType: reader.deviceType || "",
					status: reader.status || "",
				})),
			});

			let selectedReader = selectInternetReader(
				discoveredReaders,
				connectionTarget,
			);
			if (
				!selectedReader &&
				(discoveryLocationId || getInternetDiscoveryFilter(connectionTarget))
			) {
				setStepText(
					discoveryLocationId
						? "S710 not found at saved location. Searching account..."
						: "Saved reader not found. Searching all readers...",
				);
				await withTerminalTimeout(
					cancelDiscovering(),
					3000,
					"Timed out resetting reader discovery.",
				);
				const accountDiscoveryResult = await discoverInternetReaders(
					"",
					!!discoveryLocationId,
				);
				if (accountDiscoveryResult?.error) {
					throw accountDiscoveryResult.error;
				}
				discoveredReaders = await waitForDiscoveredReaders(getCurrentReaders);
				if (!discoveredReaders.length && getInternetDiscoveryFilter(connectionTarget)) {
					setStepText("Saved reader filter missed. Searching all readers...");
					await withTerminalTimeout(
						cancelDiscovering(),
						3000,
						"Timed out resetting reader discovery.",
					);
					const allReadersDiscoveryResult = await discoverInternetReaders(
						"",
						false,
					);
					if (allReadersDiscoveryResult?.error) {
						throw allReadersDiscoveryResult.error;
					}
					discoveredReaders =
						await waitForDiscoveredReaders(getCurrentReaders);
				}
				console.log("[TERMINAL S710] discovered account internet readers", {
					count: discoveredReaders.length,
					readers: discoveredReaders.map((reader) => ({
						label: reader.label || "",
						serialNumber: reader.serialNumber || "",
						locationId: reader.locationId || "",
						deviceType: reader.deviceType || "",
						status: reader.status || "",
					})),
				});
				selectedReader = selectInternetReader(
					discoveredReaders,
					connectionTarget,
				);
			}
			let result = null;

			if (selectedReader) {
				setStepText(`Connecting ${getReaderName(selectedReader)}...`);
					result = await withTerminalTimeout(
						connectReader({
							reader: selectedReader,
							discoveryMethod: "internet",
							failIfInUse: false,
						}),
						15000,
						"Timed out connecting to the internet reader.",
				);
			} else {
				setStepText("S710 not found at saved location. Searching account...");
				result = await withTerminalTimeout(
					easyConnect({
						discoveryMethod: "internet",
						timeout: 8,
						failIfInUse: false,
						...(getInternetDiscoveryFilter(connectionTarget)
							? {
									discoveryFilter:
										getInternetDiscoveryFilter(connectionTarget),
								}
							: {}),
					}),
					12000,
					"Timed out connecting to an available internet reader.",
				);
			}

			if (result?.error) {
				console.log("[TERMINAL S710] connect failed", {
					locationId: effectiveTerminalLocationId || null,
					error: result.error,
				});
				if (isAlreadyConnectedReaderError(result.error)) {
					setStepText("Reader connected. Ready to collect payment.");
					return;
				}
				throw result.error;
			}

			const connectedS710 = result?.reader || selectedReader || null;
			if (connectedS710) {
				setPreferredCollectorOverride({
					...(connectionTarget || {}),
					id: connectedS710.id || connectionTarget?.id || "",
					readerId:
						connectedS710.id ||
						connectionTarget?.readerId ||
						connectionTarget?.id ||
						"",
					label:
						connectedS710.label ||
						connectionTarget?.label ||
						connectionTarget?.name ||
						"",
					serialNumber:
						connectedS710.serialNumber || connectionTarget?.serialNumber || "",
					deviceType:
						connectedS710.deviceType ||
						connectionTarget?.deviceType ||
						"stripeS710",
					discoveryMethod: "internet",
					locationId:
						connectedS710.locationId ||
						getCollectorLocationId(connectionTarget) ||
						effectiveTerminalLocationId ||
						"",
					simulated: connectedS710.simulated === true,
				});
			}

			setStepText(
				result?.reader
					? `${getReaderName(result.reader)} connected. Ready to collect payment.`
					: "S710 connected. Ready to collect payment.",
			);
		} catch (error) {
			console.log("[TERMINAL S710] connection attempt failed", {
				locationId: effectiveTerminalLocationId || null,
				error,
			});
			if (isAlreadyConnectedReaderError(error)) {
				setErrorText("");
				setStepText("Reader connected. Ready to collect payment.");
				return;
			}
			if (auto) {
				setErrorText("");
				setStepText("Connecting reader...");
				return;
			}
			setErrorText(
				getFriendlyReaderError(error, "Could not connect to the S710. Try again."),
			);
			setStepText("S710 connection failed.");
		} finally {
			setIsConnecting(false);
		}
	}, [
		cancelDiscovering,
		connectReader,
		connectedReader,
		connectedReaderIsDefault,
		disconnectReader,
		discoverReaders,
		easyConnect,
		effectiveTerminalLocationId,
		getCurrentReaders,
		lastDiscoveryMethod,
		preferredCollector,
	]);

	useEffect(() => {
		autoConnectAttemptedRef.current = false;
	}, [
		isPayLite,
		restaurantId,
		effectiveTerminalLocationId,
		preferredCollector?.id,
		preferredCollector?.readerId,
		preferredCollector?.serialNumber,
		preferredCollector?.discoveryMethod,
	]);

	useEffect(() => {
		if (!isPayLite) return;
		if (connectedReader) {
			autoConnectAttemptedRef.current = false;
			setErrorText("");
			return;
		}
		if (isBusy) {
			return;
		}
		if (!terminalInitialized) {
			setStepText("Preparing card reader...");
			return;
		}

		const preferredDiscoveryMethod =
			preferredCollector?.discoveryMethod || "internet";
		if (preferredCollector && preferredDiscoveryMethod !== "internet") {
			setStepText(
				`${getReaderName(preferredCollector)} is the default collector.`,
			);
			return;
		}

		const retryDelayMs = autoConnectAttemptedRef.current ? 3000 : 250;
		const timer = setTimeout(() => {
			autoConnectAttemptedRef.current = true;
			connectS710Reader({ simulated: false, auto: true });
		}, retryDelayMs);

		return () => clearTimeout(timer);
	}, [
		connectS710Reader,
		connectedReader,
		isBusy,
		isPayLite,
		preferredCollector,
		effectiveTerminalLocationId,
		terminalInitialized,
	]);

	const handleConnectReader = async (reader) => {
		if (!ensureTerminalReady()) return;
		setErrorText("");
		setIsConnecting(true);
		setStepText(`Connecting to ${getReaderName(reader)}...`);
		const discoveryMethod =
			reader.discoveryMethod || lastDiscoveryMethod || "internet";

		try {
			if (discoveryMethod === "bluetoothScan" && !effectiveTerminalLocationId) {
				throw new Error(
					"Stripe Terminal location is required before connecting an M2 reader.",
				);
			}
			const connectToSelectedReader = () =>
				connectReader(
					discoveryMethod === "bluetoothScan"
						? {
								reader,
								discoveryMethod: "bluetoothScan",
								locationId: effectiveTerminalLocationId,
								autoReconnectOnUnexpectedDisconnect: true,
							}
						: {
								reader,
								discoveryMethod: "internet",
								failIfInUse: true,
							},
				);

			let result = await connectToSelectedReader();

			if (result?.error && isConnectionTokenTimeout(result.error)) {
				setStepText("Refreshing reader connection...");
				result = await connectToSelectedReader();
			}

			if (result?.error) {
				throw result.error;
			}

			setStepText(
				discoveryMethod === "bluetoothScan"
					? "M2 reader connected. Ready to collect payment."
					: "Reader connected. Ready to collect payment.",
			);
		} catch (error) {
			setErrorText(
				getFriendlyReaderError(
					error,
					"Could not connect to this reader. Try again.",
				),
			);
			setStepText("Reader connection failed.");
		} finally {
			setIsConnecting(false);
		}
	};

	const handleSetDefaultCollector = async () => {
		if (!connectedReader) {
			setErrorText("Connect a collector before setting the default.");
			return;
		}

		setErrorText("");
		setIsConnecting(true);
		setStepText("Saving default collector...");

		const discoveryMethod =
			connectedReader.discoveryMethod || lastDiscoveryMethod || "internet";
		const collectorPayload = {
			id: connectedReader.id || "",
			readerId: connectedReader.id || "",
			label: connectedReader.label || "",
			serialNumber: connectedReader.serialNumber || "",
			deviceType: connectedReader.deviceType || "",
			discoveryMethod,
			locationId: connectedReader.locationId || effectiveTerminalLocationId || "",
			simulated: connectedReader.simulated === true,
		};

		try {
			const setDefaultTerminalCollector = httpsCallable(
				functions,
				"setDefaultTerminalCollector",
			);
			const result = await setDefaultTerminalCollector({
				restaurantId:
					restaurantId || currentUserData?.restaurantId || currentUserData?.uid,
				staffId: activeSession?.id || null,
				collector: collectorPayload,
			});
			const savedCollector =
				result?.data?.collector || {
					...collectorPayload,
					name: getReaderName(connectedReader),
				};
			setPreferredCollectorOverride(savedCollector);
			setStepText(`${getReaderName(connectedReader)} is the default collector.`);
			Alert.alert(
				"Default Collector Saved",
				`${getReaderName(connectedReader)} will be selected first when Pay Lite opens.`,
			);
		} catch (error) {
			setErrorText(
				error?.message || "Could not save this collector as the default.",
			);
			setStepText("Default collector was not saved.");
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
					tipAmount: 0,
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
		],
	);

	const handleCollectPayment = async () => {
		if (!ensureTerminalReady()) return;
		if (!connectedReader) {
			setErrorText("Connect a reader before collecting payment.");
			return;
		}
		if (isPayLite && payLiteSaleAmountCents <= 0) {
			setErrorText("Enter the POS sale amount before collecting payment.");
			return;
		}
		setErrorText("");
		setIsPaying(true);
		setProcessedPaymentIntentId("");
		let capturedPaymentIntentId = "";
		let authorizedPaymentIntentId = "";
		let terminalStage = "start";
		let preparedPaymentIntentId = "";
		let paymentIntentForCleanup = null;

		try {
			terminalStage = "refreshConnectionToken";
			setStepText("Preparing secure reader session...");
			await withTerminalTimeout(
				refreshConnectionToken({ reason: "payment" }),
				12000,
				"Reader session could not refresh. Reconnect the S710 and try again.",
			);

			terminalStage = "prepare";
			setStepText("Preparing payment...");
			const prepareStaffTerminalPayment = httpsCallable(
				functions,
				isPayLite
					? "prepareScervPayLiteTerminalPayment"
					: "prepareStaffTerminalPayment",
			);
			let prepResult;
			try {
				prepResult = await prepareStaffTerminalPayment(
					isPayLite
						? {
								restaurantId:
									restaurantId ||
									currentUserData?.restaurantId ||
									currentUserData?.uid,
								saleAmountCents: payLiteSaleAmountCents,
								staffId: activeSession?.id || null,
								staffName: getStaffName(activeSession, currentUserData),
								note: payLiteNote,
								terminalLocationId: effectiveTerminalLocationId || "",
								terminalReader: connectedReader
									? {
											id: connectedReader.id || "",
											label: connectedReader.label || "",
											serialNumber: connectedReader.serialNumber || "",
											deviceType: connectedReader.deviceType || "",
											status: connectedReader.status || "",
											locationId: connectedReader.locationId || "",
										}
									: null,
								clientContext: {
									surface: "restaurant_app",
									platform: Platform.OS,
									entryPoint: "scerv_pay_lite",
								},
							}
						: {
								partyId,
								closeoutItemIds,
								closeoutSeatIds,
								staffId: activeSession?.id || null,
								staffName: getStaffName(activeSession, currentUserData),
							},
				);
			} catch (error) {
				console.error("[TERMINAL PAYMENT] prepare terminal payment failed", {
					code: error?.code,
					message: error?.message,
					details: error?.details,
					partyId,
					mode,
					staffId: activeSession?.id || null,
					closeoutItemIds,
					closeoutSeatIds,
				});
				throw new Error(
					"Could not prepare the card reader payment. Try again or reopen the closeout.",
				);
			}
			const prepData = prepResult?.data || {};

			if (!prepData.clientSecret || !prepData.paymentIntentId) {
				throw new Error("The payment could not be prepared.");
			}
			preparedPaymentIntentId = prepData.paymentIntentId;
			console.log("[TERMINAL PAYMENT] Prepared payment intent", {
				paymentIntentId: prepData.paymentIntentId,
				amount: prepData.amount,
				expectedTotalCents: paymentTotalCents,
				subtotal: prepData.subtotal,
				taxAmount: prepData.taxAmount,
				customerServiceFeeAmount: prepData.customerServiceFeeAmount,
				onReaderTipping: prepData.onReaderTipping,
			});

			if (
				!isPayLite &&
				Number(prepData.amount || 0) !== Number(paymentTotalCents || 0)
			) {
				console.error("[TERMINAL PAYMENT] Prepared amount mismatch", {
					preparedAmount: prepData.amount,
					expectedTotalCents: paymentTotalCents,
					subtotal: prepData.subtotal,
					taxAmount: prepData.taxAmount,
					customerServiceFeeAmount: prepData.customerServiceFeeAmount,
				});
				throw new Error(
					"The total changed. Reopen closeout and review the amount.",
				);
			}

			terminalStage = "retrievePaymentIntent";
			setStepText("Loading payment on reader...");
			console.log("[TERMINAL PAYMENT] Retrieving payment intent", {
				paymentIntentId: prepData.paymentIntentId,
			});
			let retrieved = await withTerminalTimeout(
				retrievePaymentIntent(prepData.clientSecret),
				30000,
				"Reader session could not load this payment. Reconnect the S710 and try again.",
			);
			if (retrieved?.error && isConnectionTokenTimeout(retrieved.error)) {
				setStepText("Refreshing secure reader session...");
				await withTerminalTimeout(
					refreshConnectionToken({ reason: "payment_retry" }),
					12000,
					"Reader session could not refresh. Reconnect the S710 and try again.",
				);
				retrieved = await withTerminalTimeout(
					retrievePaymentIntent(prepData.clientSecret),
					30000,
					"Reader session could not load this payment. Reconnect the S710 and try again.",
				);
			}
			if (retrieved?.error) throw retrieved.error;
			paymentIntentForCleanup = retrieved.paymentIntent || null;
			console.log("[TERMINAL PAYMENT] Payment intent retrieved", {
				paymentIntentId:
					retrieved?.paymentIntent?.id || prepData.paymentIntentId,
				status: retrieved?.paymentIntent?.status || null,
			});

			terminalStage = "collectPaymentMethod";
			setStepText(
				isPayLite
					? isSimulatedReader
						? "Running simulated card payment..."
						: "Customer can add a tip, then tap or insert card."
					: isSimulatedReader
					? "Running simulated card payment..."
					: "Guest selects tip on reader, then presents card.",
			);
			const tipEligibleAmount = isPayLite
				? Number(
						prepData.tipEligibleAmount ||
							prepData.merchantNetSalesAmount ||
							payLiteSaleAmountCents ||
							0,
					)
				: Number(prepData.subtotal || 0);
			console.log("[TERMINAL PAYMENT] Collecting payment method", {
				paymentIntentId: prepData.paymentIntentId,
				isSimulatedReader,
				tipEligibleAmount: isSimulatedReader ? null : tipEligibleAmount,
			});
			const collected = await withTerminalTimeout(
				collectPaymentMethod({
					paymentIntent: retrieved.paymentIntent,
					skipTipping: isSimulatedReader,
					...(isSimulatedReader ? {} : { tipEligibleAmount }),
					updatePaymentIntent: true,
					customerCancellation: "enableIfAvailable",
				}),
				75000,
				"The S710 took too long to display the payment. Wake the reader, reconnect, and try again.",
			);
			if (collected?.error) {
				paymentIntentForCleanup =
					collected.error.paymentIntent ||
					collected.paymentIntent ||
					paymentIntentForCleanup;
				throw collected.error;
			}
			paymentIntentForCleanup = collected.paymentIntent || paymentIntentForCleanup;
			console.log("[TERMINAL PAYMENT] Payment method collected", {
				paymentIntentId:
					collected?.paymentIntent?.id || prepData.paymentIntentId,
				status: collected?.paymentIntent?.status || null,
			});

			terminalStage = "confirmPaymentIntent";
			setStepText("Authorizing card...");
			console.log("[TERMINAL PAYMENT] Confirming payment intent", {
				paymentIntentId:
					collected?.paymentIntent?.id || prepData.paymentIntentId,
			});
			const confirmed = await confirmPaymentIntent({
				paymentIntent: collected.paymentIntent,
			});
			if (confirmed?.error) {
				paymentIntentForCleanup =
					confirmed.error.paymentIntent ||
					confirmed.paymentIntent ||
					paymentIntentForCleanup;
				throw confirmed.error;
			}
			console.log("[TERMINAL PAYMENT] Payment intent confirmed", {
				paymentIntentId:
					confirmed?.paymentIntent?.id || prepData.paymentIntentId,
				status: confirmed?.paymentIntent?.status || null,
			});

			const paymentIntentId =
				confirmed?.paymentIntent?.id || prepData.paymentIntentId;
			authorizedPaymentIntentId = paymentIntentId;
			setProcessedPaymentIntentId(paymentIntentId);
			terminalStage = "captureStaffTerminalPayment";
			setStepText("Capturing reader payment...");
			const captureStaffTerminalPayment = httpsCallable(
				functions,
				"captureStaffTerminalPayment",
			);
			const captureResult = await captureStaffTerminalPayment({
				paymentIntentId,
				staffId: activeSession?.id || null,
			});
			const captureData = captureResult?.data || {};
			if (!captureData.success) {
				throw new Error("Could not capture the Terminal payment.");
			}
			capturedPaymentIntentId = paymentIntentId;

			setStepText(
				isPayLite
					? "Payment captured. Waiting for Stripe confirmation..."
					: `Payment captured with ${formatCurrencyFromDollars(
							Number(captureData.gratuityAmount || 0) / 100,
						)} gratuity. Waiting for Stripe confirmation...`,
			);

			const webhookReady = await waitForTerminalPaymentStatus(paymentIntentId);
			if (!webhookReady) {
				throw new Error(
					"Payment captured, but Stripe confirmation is still syncing. Tap Finalize Closeout in a few seconds.",
				);
			}

			if (isPayLite) {
				const receipt =
					captureData.customerReceipt || {
						paymentIntentId,
						restaurantName:
							currentUserData?.restaurantName ||
							currentUserData?.name ||
							"Restaurant",
						staffName: getStaffName(activeSession, currentUserData),
						paidAt: new Date().toISOString(),
						merchantNetSalesAmount: Number(
							captureData.merchantNetSalesAmount ||
								prepData.merchantNetSalesAmount ||
								payLiteSaleAmountCents ||
								0,
						),
						taxAmount: Number(
							captureData.taxAmount ||
								prepData.taxAmount ||
								payLiteTaxAmountCents ||
								0,
						),
						customerServiceFeeAmount: Number(
							captureData.customerServiceFeeAmount ||
								prepData.customerServiceFeeAmount ||
								payLiteServiceFeeCents ||
								0,
						),
						gratuityAmount: Number(captureData.gratuityAmount || 0),
						amount: Number(
							captureData.amount || prepData.amount || paymentTotalCents || 0,
						),
						readerLabel: getReaderName(connectedReader || {}),
						readerSerialNumber: connectedReader?.serialNumber || "",
						note: String(payLiteNote || "").trim(),
					};
				recordPayLiteReceipt(receipt);
				setStepText("Payment recorded. Receipt ready.");
				return;
			}

			await finalizeCloseout(paymentIntentId);
		} catch (error) {
			console.error("[TERMINAL PAYMENT] Terminal flow failed", {
				stage: terminalStage,
				...getTerminalErrorDetails(error),
				paymentIntentId:
					capturedPaymentIntentId ||
					authorizedPaymentIntentId ||
					preparedPaymentIntentId,
			});
			if (
				!capturedPaymentIntentId &&
				!authorizedPaymentIntentId &&
				paymentIntentForCleanup
			) {
				await cleanupFailedTerminalAttempt({
					stage: terminalStage,
					paymentIntent: paymentIntentForCleanup,
				});
			}
			setErrorText(
				capturedPaymentIntentId
					? "Payment captured. Receipt finalization is still syncing."
					: authorizedPaymentIntentId
						? "Payment authorized, but capture did not finish. Do not run the card again; finalize this payment from Stripe or try finalizing again."
					: getFriendlyReaderError(
							error,
							"Card reader payment could not be completed. Try again.",
						),
			);
			if (capturedPaymentIntentId) {
				setStepText("Payment captured. Receipt finalization is still syncing.");
			} else if (authorizedPaymentIntentId) {
				setStepText("Payment authorized. Capture still needs finalizing.");
			}
		} finally {
			setIsPaying(false);
		}
	};

	if (isPayLite) {
		return (
			<SafeAreaView style={styles.payLiteContainer}>
				<View style={styles.payLiteHeader}>
					<TouchableOpacity
						style={styles.payLiteLockButton}
						onPress={() => (lockToPayLite ? endSession?.() : navigation.goBack())}
						disabled={isBusy}
					>
						<Ionicons
							name={lockToPayLite ? "lock-closed-outline" : "arrow-back"}
							size={20}
							color={colors.textDark}
						/>
					</TouchableOpacity>
					<View style={styles.headerText}>
						<Text style={styles.payLiteTitle}>Collect payment</Text>
						<Text style={styles.payLiteSubtitle}>
							{getStaffName(activeSession, currentUserData)}
						</Text>
					</View>
					<View
						style={[
							styles.payLiteCollectorPill,
							connectedReader
								? styles.payLiteCollectorPillConnected
								: styles.payLiteCollectorPillIdle,
						]}
					>
						<View
							style={[
								styles.payLiteCollectorDot,
								connectedReader
									? styles.payLiteCollectorDotConnected
									: styles.payLiteCollectorDotIdle,
							]}
						/>
						<Text numberOfLines={1} style={styles.payLiteCollectorText}>
							{collectorPillLabel}
						</Text>
					</View>
				</View>

				<View style={styles.payLiteTerminalCard}>
					<Text style={styles.payLiteAmountLabel}>Amount</Text>
					<TextInput
						style={styles.payLiteCompactAmountInput}
						value={payLiteAmountText}
						onChangeText={setPayLiteAmountText}
						placeholder="0.00"
						placeholderTextColor={colors.textMedium}
						keyboardType="decimal-pad"
						editable={!isBusy}
						autoFocus={lockToPayLite}
					/>
					<TouchableOpacity
						style={[
							styles.payLiteCollectButton,
							(!connectedReader ||
								isBusy ||
								payLiteSaleAmountCents <= 0) &&
								styles.buttonDisabled,
						]}
						onPress={handleCollectPayment}
						disabled={
							!connectedReader ||
							isBusy ||
							payLiteSaleAmountCents <= 0
						}
					>
						{isPaying || isFinalizing ? (
							<ActivityIndicator size="small" color={colors.surfaceWhite} />
						) : (
							<Text style={styles.primaryButtonText}>Collect payment</Text>
						)}
					</TouchableOpacity>
					<Text style={styles.payLiteCompactHelp}>
						Enter the sale amount from the POS. Customer tip is handled on the
						reader.
					</Text>
				</View>

				{lastPayLiteReceipt ? (
					<View style={styles.payLiteReceiptCard}>
						<View style={styles.payLiteReceiptHeader}>
							<View style={styles.payLiteReceiptIcon}>
								<MaterialCommunityIcons
									name="receipt"
									size={22}
									color={colors.statusSuccess}
								/>
							</View>
							<View style={styles.payLiteReceiptText}>
								<Text style={styles.payLiteReceiptTitle}>Receipt ready</Text>
								<Text style={styles.payLiteReceiptMeta}>
									Receipt {getReceiptPaymentLabel(lastPayLiteReceipt.paymentIntentId)}
								</Text>
							</View>
							<Text style={styles.payLiteReceiptTotal}>
								{formatReceiptAmount(lastPayLiteReceipt.amount)}
							</Text>
						</View>

						<View style={styles.payLiteReceiptRows}>
							<View style={styles.payLiteReceiptRow}>
								<Text style={styles.payLiteReceiptLabel}>Sale</Text>
								<Text style={styles.payLiteReceiptValue}>
									{formatReceiptAmount(
										lastPayLiteReceipt.merchantNetSalesAmount,
									)}
								</Text>
							</View>
							{Number(lastPayLiteReceipt.taxAmount || 0) > 0 ? (
								<View style={styles.payLiteReceiptRow}>
									<Text style={styles.payLiteReceiptLabel}>Tax</Text>
									<Text style={styles.payLiteReceiptValue}>
										{formatReceiptAmount(lastPayLiteReceipt.taxAmount)}
									</Text>
								</View>
							) : null}
							{Number(lastPayLiteReceipt.customerServiceFeeAmount || 0) > 0 ? (
								<View style={styles.payLiteReceiptRow}>
									<Text style={styles.payLiteReceiptLabel}>Card fee</Text>
									<Text style={styles.payLiteReceiptValue}>
										{formatReceiptAmount(
											lastPayLiteReceipt.customerServiceFeeAmount,
										)}
									</Text>
								</View>
							) : null}
							<View style={styles.payLiteReceiptRow}>
								<Text style={styles.payLiteReceiptLabel}>Tip</Text>
								<Text style={styles.payLiteReceiptValue}>
									{formatReceiptAmount(lastPayLiteReceipt.gratuityAmount)}
								</Text>
							</View>
						</View>

						<View style={styles.payLiteReceiptActions}>
							<TouchableOpacity
								style={styles.payLiteReceiptPrimaryButton}
								onPress={() => sharePayLiteCustomerReceipt(lastPayLiteReceipt)}
							>
								<MaterialCommunityIcons
									name="printer"
									size={18}
									color={colors.surfaceWhite}
								/>
								<Text style={styles.payLiteReceiptPrimaryText}>
									Print receipt
								</Text>
							</TouchableOpacity>
							{lockToPayLite ? (
								<TouchableOpacity
									style={styles.payLiteReceiptSecondaryButton}
									onPress={() => endSession?.()}
								>
									<Text style={styles.payLiteReceiptSecondaryText}>Lock</Text>
								</TouchableOpacity>
							) : null}
						</View>
					</View>
				) : (
					<View style={styles.payLiteNoReceiptCard}>
						<MaterialCommunityIcons
							name="receipt"
							size={18}
							color={colors.textMedium}
						/>
						<Text style={styles.payLiteNoReceiptText}>No receipts yet</Text>
					</View>
				)}

				{recentPayLiteReceipts.length > 0 ? (
					<View style={styles.payLiteRecentCard}>
						<Text style={styles.payLiteRecentTitle}>Recent receipts</Text>
						{recentPayLiteReceipts.map((receipt) => (
							<View
								key={receipt.paymentIntentId || receipt.id}
								style={styles.payLiteRecentRow}
							>
								<View style={styles.payLiteRecentText}>
									<Text style={styles.payLiteRecentAmount}>
										{formatReceiptAmount(receipt.amount)}
									</Text>
									<Text style={styles.payLiteRecentMeta}>
										{formatReceiptTimestamp(receipt.paidAt)} · Tip{" "}
										{formatReceiptAmount(receipt.gratuityAmount)}
									</Text>
								</View>
								<TouchableOpacity
									style={styles.payLiteRecentPrintButton}
									onPress={() => sharePayLiteCustomerReceipt(receipt)}
								>
									<Text style={styles.payLiteRecentPrintText}>Print</Text>
								</TouchableOpacity>
							</View>
						))}
					</View>
				) : null}

				<View style={styles.payLiteStatusCard}>
					<View style={styles.payLiteStatusRow}>
						<MaterialCommunityIcons
							name={connectedReader ? "contactless-payment" : "credit-card-sync"}
							size={22}
							color={connectedReader ? colors.statusSuccess : colors.primary}
						/>
						<View style={styles.statusTextWrap}>
							<Text style={styles.statusTitle}>
								{connectedReader
									? getReaderName(connectedReader)
									: pendingReaderLabel}
							</Text>
							<Text style={styles.statusText}>{stepText}</Text>
						</View>
					</View>
					{!connectedReader && (isConnecting || isDiscovering) ? (
						<View style={styles.loadingRow}>
							<ActivityIndicator size="small" color={colors.primary} />
							<Text style={styles.loadingText}>Connecting automatically...</Text>
						</View>
					) : null}
					{showReaderControls ? (
						<>
							<View style={styles.payLiteReaderActions}>
							<TouchableOpacity
								style={styles.payLiteSmallButton}
									onPress={() => connectS710Reader({ simulated: false })}
								disabled={isBusy}
							>
									<Text style={styles.secondaryButtonText}>S710</Text>
							</TouchableOpacity>
								<TouchableOpacity
									style={styles.payLiteSmallButton}
									onPress={() =>
										startDiscovery({
											simulated: false,
											discoveryMethod: "bluetoothScan",
										})
									}
									disabled={isBusy}
								>
									<Text style={styles.secondaryButtonText}>M2</Text>
								</TouchableOpacity>
								{canUseTestReader ? (
									<TouchableOpacity
										style={styles.payLiteSmallButton}
										onPress={() => connectS710Reader({ simulated: true })}
										disabled={isBusy}
									>
										<Text style={styles.secondaryButtonText}>Test</Text>
									</TouchableOpacity>
								) : null}
							</View>
							{connectedReader ? (
								<TouchableOpacity
									style={[
										styles.payLiteDefaultButton,
										connectedReaderIsDefault && styles.payLiteDefaultButtonActive,
									]}
									onPress={handleSetDefaultCollector}
									disabled={isBusy || !canSetDefaultCollector}
								>
									<MaterialCommunityIcons
										name={
											connectedReaderIsDefault
												? "check-circle"
												: "star-outline"
										}
										size={16}
										color={
											connectedReaderIsDefault
												? colors.statusSuccess
												: colors.primary
										}
									/>
									<Text style={styles.payLiteDefaultButtonText}>
										{connectedReaderIsDefault
											? "Default collector"
											: isManagementSession(activeSession)
												? "Set as default collector"
												: "Manager can set this as default"}
									</Text>
								</TouchableOpacity>
							) : null}
							{readerList.slice(0, 2).map((reader) => {
								const isConnected = connectedReader?.id === reader.id;
								return (
									<TouchableOpacity
										key={reader.id}
										style={[
											styles.payLiteReaderRow,
											isConnected && styles.readerRowConnected,
										]}
										onPress={() => handleConnectReader(reader)}
										disabled={isBusy || isConnected}
									>
										<Text numberOfLines={1} style={styles.readerName}>
											{getReaderName(reader)}
										</Text>
										<Text style={styles.readerAction}>
											{isConnected ? "Connected" : "Connect"}
										</Text>
									</TouchableOpacity>
								);
							})}
						</>
					) : null}
				</View>

				<View style={styles.payLiteDetailsCard}>
					<TextInput
						style={styles.payLiteCompactNote}
						value={payLiteNote}
						onChangeText={setPayLiteNote}
						placeholder="Optional POS ticket or note"
						placeholderTextColor={colors.textMedium}
						editable={!isBusy}
						maxLength={160}
					/>
				</View>

				{errorText ? (
					<View style={styles.payLiteErrorBox}>
						<Text style={styles.errorText}>{errorText}</Text>
						{processedPaymentIntentId && !lastPayLiteReceipt ? (
							<TouchableOpacity
								style={styles.payLiteFinalizeButton}
								onPress={() => finalizeAuthorizedPayLitePayment()}
								disabled={isFinalizing}
							>
								{isFinalizing ? (
									<ActivityIndicator
										size="small"
										color={colors.surfaceWhite}
									/>
								) : (
									<Text style={styles.primaryButtonText}>
										Finalize authorized payment
									</Text>
								)}
							</TouchableOpacity>
						) : null}
					</View>
				) : null}
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.header}>
					<TouchableOpacity
						style={styles.backButton}
						onPress={() => (lockToPayLite ? endSession?.() : navigation.goBack())}
						disabled={isBusy}
					>
						<Ionicons
							name={lockToPayLite ? "lock-closed-outline" : "arrow-back"}
							size={22}
							color={colors.textDark}
						/>
					</TouchableOpacity>
					<View style={styles.headerText}>
						<Text style={styles.title}>
							{isPayLite ? "Scerv Pay Lite" : "Card Reader"}
						</Text>
						<Text style={styles.subtitle}>
							{isPayLite
								? `${getStaffName(activeSession, currentUserData)} signed in`
								: tableName}
						</Text>
					</View>
				</View>

				{isPayLite ? (
					<View style={styles.payLiteAmountPanel}>
						<Text style={styles.payLiteAmountLabel}>Enter sale amount</Text>
						<TextInput
							style={styles.payLiteAmountInput}
							value={payLiteAmountText}
							onChangeText={setPayLiteAmountText}
							placeholder="0.00"
							placeholderTextColor={colors.textMedium}
							keyboardType="decimal-pad"
							editable={!isBusy}
							autoFocus={lockToPayLite}
						/>
						<Text style={styles.payLiteAmountHelp}>
							POS/bar amount before card fee. Customer tip happens on the reader.
						</Text>
					</View>
				) : null}

				<View style={styles.totalPanel}>
					<Text style={styles.totalLabel}>
						{isPayLite ? "Sale amount" : "Amount to collect"}
					</Text>
					<Text style={styles.totalAmount}>
						{isPayLite
							? formatCurrencyFromDollars(
									Number(payLiteSaleAmountCents || 0) / 100,
								)
							: totalLabel}
					</Text>
					<Text style={styles.totalMeta}>
						{isPayLite
							? "Customer tip happens on the reader"
							: `${selectedItemCount} item${
									selectedItemCount === 1 ? "" : "s"
								} selected`}
					</Text>
				</View>

				{isPayLite ? (
					<View style={styles.inputPanel}>
						<Text style={styles.panelTitle}>Payment details</Text>
						<Text style={styles.inputHelp}>
							Staff enters the POS sale amount and collects payment. Reconciliation
							details are available in the back office.
						</Text>
						<Text style={styles.inputLabel}>Internal note</Text>
						<TextInput
							style={styles.noteInput}
							value={payLiteNote}
							onChangeText={setPayLiteNote}
							placeholder="Optional shift, register, or POS ticket"
							placeholderTextColor={colors.textMedium}
							editable={!isBusy}
							maxLength={160}
						/>
					</View>
				) : null}

				{!isPayLite && selectedSeatBreakdown.length > 0 && (
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

				{showDiagnostics ? (
					<View style={styles.diagnosticBox}>
						<Text style={styles.diagnosticTitle}>Reader Session</Text>
						<Text style={styles.diagnosticText}>{tokenStatus || "Waiting"}</Text>
					</View>
				) : null}

				<View style={styles.actionGrid}>
					<TouchableOpacity
						style={styles.secondaryButton}
						onPress={() => connectS710Reader({ simulated: false })}
						disabled={isBusy}
					>
						<Text style={styles.secondaryButtonText}>Find S710</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.secondaryButton}
						onPress={() =>
							startDiscovery({
								simulated: false,
								discoveryMethod: "bluetoothScan",
							})
						}
						disabled={isBusy}
					>
						<Text style={styles.secondaryButtonText}>Find M2</Text>
					</TouchableOpacity>
					{canUseTestReader ? (
						<TouchableOpacity
							style={styles.secondaryButton}
							onPress={() => connectS710Reader({ simulated: true })}
							disabled={isBusy}
						>
							<Text style={styles.secondaryButtonText}>Test Reader</Text>
						</TouchableOpacity>
					) : null}
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
				{!isPayLite && processedPaymentIntentId && !isPaying ? (
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
						(!connectedReader ||
							isBusy ||
							(isPayLite && payLiteSaleAmountCents <= 0)) &&
							styles.buttonDisabled,
					]}
					onPress={handleCollectPayment}
					disabled={
						!connectedReader ||
						isBusy ||
						(isPayLite && payLiteSaleAmountCents <= 0)
					}
				>
					{isPaying || isFinalizing ? (
						<ActivityIndicator size="small" color={colors.surfaceWhite} />
					) : (
						<Text style={styles.primaryButtonText}>
							{isPayLite ? "Collect payment" : `Collect ${totalLabel}`}
						</Text>
					)}
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	);
};

const RestaurantTerminalPaymentScreen = () => {
	const route = useRoute();
	const { currentUserData } = useContext(AuthContext);
	const { activeSession, endSession } = useEmployeeSession();
	const { tokenStatus } = useRestaurantTerminal();
	const restaurantId = route.params?.restaurantId || currentUserData?.uid;
	const isTestAccount = currentUserData?.isTestAccount !== false;
	const preferredCollector = getPreferredCollector(currentUserData);
	const stripeTerminalLocationId =
		route.params?.stripeTerminalLocationId ||
		(isTestAccount
			? currentUserData?.stripeTerminalLocationId_test ||
				currentUserData?.terminalLocationId_test
			: currentUserData?.stripeTerminalLocationId_live ||
				currentUserData?.terminalLocationId_live) ||
		currentUserData?.stripeTerminalLocationId ||
		currentUserData?.terminalLocationId ||
		getCollectorLocationId(preferredCollector) ||
		"";

	if (!restaurantId) {
		return (
			<SafeAreaView style={styles.centered}>
				<Text style={styles.errorText}>Restaurant context is missing.</Text>
			</SafeAreaView>
		);
	}

	return (
		<RestaurantTerminalPaymentContent
			activeSession={activeSession}
			currentUserData={currentUserData}
			endSession={endSession}
			tokenStatus={tokenStatus}
			params={{
				...(route.params || {}),
				stripeTerminalLocationId,
			}}
		/>
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
	payLiteContainer: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		padding: 16,
		gap: 10,
	},
	payLiteHeader: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 44,
	},
	payLiteCollectorPill: {
		flexDirection: "row",
		alignItems: "center",
		maxWidth: 156,
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 9,
		paddingVertical: 6,
		gap: 6,
	},
	payLiteCollectorPillConnected: {
		backgroundColor: colors.statusSuccess + "12",
		borderColor: colors.statusSuccess + "55",
	},
	payLiteCollectorPillIdle: {
		backgroundColor: colors.surfaceWhite,
		borderColor: colors.borderLight,
	},
	payLiteCollectorDot: {
		width: 8,
		height: 8,
		borderRadius: 999,
	},
	payLiteCollectorDotConnected: {
		backgroundColor: colors.statusSuccess,
	},
	payLiteCollectorDotIdle: {
		backgroundColor: colors.textLight,
	},
	payLiteCollectorText: {
		flex: 1,
		fontSize: 11,
		fontWeight: "900",
		color: colors.textDark,
	},
	payLiteLockButton: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 10,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginRight: 10,
	},
	payLiteTitle: {
		fontSize: 22,
		fontWeight: "900",
		color: colors.textDark,
	},
	payLiteSubtitle: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 1,
	},
	payLiteTerminalCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: colors.primary,
		padding: 14,
	},
	payLiteCompactAmountInput: {
		height: 86,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 14,
		fontSize: 44,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 8,
		marginBottom: 10,
	},
	payLiteCollectButton: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.primary,
		borderRadius: 10,
		paddingVertical: 14,
		minHeight: 50,
	},
	payLiteCompactHelp: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		lineHeight: 16,
		marginTop: 8,
	},
	payLiteStatusCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
	},
	payLiteReceiptCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.statusSuccess + "66",
		padding: 12,
	},
	payLiteReceiptHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	payLiteReceiptIcon: {
		width: 38,
		height: 38,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.statusSuccess + "12",
	},
	payLiteReceiptText: {
		flex: 1,
	},
	payLiteReceiptTitle: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textDark,
	},
	payLiteReceiptMeta: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 2,
	},
	payLiteReceiptTotal: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.statusSuccess,
	},
	payLiteReceiptRows: {
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		marginTop: 10,
		paddingTop: 8,
	},
	payLiteReceiptRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 3,
	},
	payLiteReceiptLabel: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
	},
	payLiteReceiptValue: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textDark,
	},
	payLiteReceiptActions: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 12,
	},
	payLiteReceiptPrimaryButton: {
		flexGrow: 1,
		flexBasis: "52%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 10,
		backgroundColor: colors.primary,
		paddingVertical: 12,
		paddingHorizontal: 10,
	},
	payLiteReceiptPrimaryText: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.surfaceWhite,
	},
	payLiteReceiptSecondaryButton: {
		flexGrow: 1,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.primary,
		backgroundColor: colors.surfaceWhite,
		paddingVertical: 12,
		paddingHorizontal: 10,
	},
	payLiteReceiptSecondaryText: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.primary,
	},
	payLiteNoReceiptCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
	},
	payLiteNoReceiptText: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textMedium,
	},
	payLiteRecentCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
	},
	payLiteRecentTitle: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textDark,
		marginBottom: 8,
		textTransform: "uppercase",
	},
	payLiteRecentRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 8,
		marginTop: 8,
		gap: 10,
	},
	payLiteRecentText: {
		flex: 1,
	},
	payLiteRecentAmount: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
	},
	payLiteRecentMeta: {
		fontSize: 11,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 2,
	},
	payLiteRecentPrintButton: {
		borderRadius: 9,
		borderWidth: 1,
		borderColor: colors.primary,
		paddingVertical: 8,
		paddingHorizontal: 12,
	},
	payLiteRecentPrintText: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.primary,
	},
	payLiteStatusRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	payLiteReaderActions: {
		flexDirection: "row",
		gap: 8,
		marginTop: 10,
	},
	payLiteSmallButton: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 9,
		borderWidth: 1,
		borderColor: colors.primary,
		backgroundColor: colors.surfaceWhite,
		paddingVertical: 9,
	},
	payLiteDefaultButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 9,
		borderWidth: 1,
		borderColor: colors.primary + "55",
		backgroundColor: colors.primary + "08",
		paddingVertical: 9,
		paddingHorizontal: 10,
		gap: 6,
		marginTop: 9,
	},
	payLiteDefaultButtonActive: {
		borderColor: colors.statusSuccess + "55",
		backgroundColor: colors.statusSuccess + "12",
	},
	payLiteDefaultButtonText: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textDark,
	},
	payLiteReaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: colors.backgroundLight,
		borderRadius: 9,
		borderWidth: 1,
		borderColor: colors.borderLight,
		paddingHorizontal: 10,
		paddingVertical: 9,
		marginTop: 8,
	},
	payLiteDetailsCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
	},
	payLiteCompactNote: {
		height: 42,
		borderRadius: 9,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 12,
		fontSize: 13,
		fontWeight: "700",
		color: colors.textDark,
		marginTop: 8,
	},
	payLiteErrorBox: {
		backgroundColor: colors.statusDanger + "12",
		borderWidth: 1,
		borderColor: colors.statusDanger + "55",
		borderRadius: 10,
		padding: 10,
	},
	payLiteFinalizeButton: {
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 10,
		backgroundColor: colors.primary,
		paddingVertical: 12,
		paddingHorizontal: 12,
		marginTop: 10,
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
	payLiteAmountPanel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: colors.primary,
		padding: 18,
		marginBottom: 14,
	},
	payLiteAmountLabel: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textMedium,
		textTransform: "uppercase",
	},
	payLiteAmountInput: {
		height: 92,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 16,
		fontSize: 46,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 10,
	},
	payLiteAmountHelp: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.textMedium,
		lineHeight: 18,
		marginTop: 10,
	},
	seatPanel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 14,
	},
	inputPanel: {
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
	inputLabel: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textDark,
		marginBottom: 6,
		textTransform: "uppercase",
	},
	amountInput: {
		height: 54,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 14,
		fontSize: 24,
		fontWeight: "900",
		color: colors.textDark,
		marginBottom: 8,
	},
	noteInput: {
		minHeight: 48,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 14,
		fontSize: 14,
		fontWeight: "700",
		color: colors.textDark,
	},
	payLiteBreakdown: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
		marginBottom: 14,
	},
	breakdownRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 5,
		gap: 12,
	},
	breakdownLabel: {
		flex: 1,
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
	},
	breakdownValue: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textDark,
	},
	inputHelp: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		lineHeight: 17,
		marginBottom: 14,
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
	diagnosticBox: {
		backgroundColor: colors.backgroundMedium,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 10,
		padding: 12,
		marginBottom: 14,
	},
	diagnosticTitle: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textDark,
		textTransform: "uppercase",
		marginBottom: 4,
	},
	diagnosticText: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
	},
	actionGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
		marginBottom: 12,
	},
	secondaryButton: {
		flexGrow: 1,
		flexBasis: "30%",
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
