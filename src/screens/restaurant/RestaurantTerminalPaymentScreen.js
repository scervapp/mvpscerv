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
	const lines = [
		receipt.restaurantName || "Restaurant",
		"Scerv Pay Lite Receipt",
		formatReceiptTimestamp(receipt.paidAt),
		"",
		`Sale amount: ${formatReceiptAmount(receipt.merchantNetSalesAmount)}`,
	];

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

const isAlreadyConnectedReaderError = (error) => {
	const message = String(error?.code || error?.message || error || "")
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	return (
		message.includes("already_connected") ||
		(message.includes("already") && message.includes("connected"))
	);
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
	const [lastDiscoveryMethod, setLastDiscoveryMethod] = useState("internet");
	const [preferredCollectorOverride, setPreferredCollectorOverride] =
		useState(null);
	const showDiagnostics = typeof __DEV__ !== "undefined" && __DEV__;
	const showReaderControls = false;

	const {
		liveMode,
		readerList,
		easyConnect,
		discoverReaders,
		cancelDiscovering,
		connectReader,
		disconnectReader,
		getCurrentReaders,
		connectedReader,
		retrievePaymentIntent,
		collectPaymentMethod,
		processPaymentIntent,
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
	const payLiteCustomerFeeFixedCents = normalizeNonNegativeCents(
		payLiteConfig.customerFeeFixedCents ??
			payLiteConfig.customerServiceFeeFixedCents ??
			paymentPolicy.payLiteCustomerFeeFixedCents,
		0,
	);
	const payLiteServiceFeeCents = useMemo(
		() =>
			["none", "waived"].includes(payLiteCustomerFeeMode)
				? 0
				: Math.round(payLiteSaleAmountCents * payLiteCustomerFeePercentage) +
					payLiteCustomerFeeFixedCents,
		[
			payLiteCustomerFeeFixedCents,
			payLiteCustomerFeeMode,
			payLiteCustomerFeePercentage,
			payLiteSaleAmountCents,
		],
	);
	const paymentTotalCents = isPayLite
		? payLiteSaleAmountCents + payLiteServiceFeeCents
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

	const resetPayLitePayment = useCallback(() => {
		setPayLiteAmountText("");
		setPayLiteNote("");
		setProcessedPaymentIntentId("");
		setLastPayLiteReceipt(null);
		setErrorText("");
		setStepText("Reader connected. Ready to collect payment.");
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

	const goToActiveTables = useCallback(() => {
		navigation.dispatch(
			CommonActions.reset({
				index: 0,
				routes: [{ name: "RestaurantActiveTables" }],
			}),
		);
	}, [navigation]);

	const startDiscovery = async ({
		simulated = false,
		discoveryMethod = "internet",
	} = {}) => {
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
		const result = await withTerminalTimeout(
			listRestaurantTerminalReaders({
				restaurantId,
				staffId: activeSession?.id || null,
				locationId: effectiveTerminalLocationId || "",
			}),
			8000,
			"Timed out checking Stripe readers.",
		);
		const data = result?.data || null;

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
			setStepText(
				effectiveTerminalLocationId
					? "Finding S710 at saved Terminal location..."
					: "Finding S710...",
			);
			console.log("[TERMINAL S710] starting internet discovery", {
				locationId: effectiveTerminalLocationId || null,
				hasPreferredCollector: !!connectionTarget,
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
			const discoveryResult = await withTerminalTimeout(
				discoverReaders({
					discoveryMethod: "internet",
					timeout: 8,
					simulated,
					...(effectiveTerminalLocationId && !simulated
						? { locationId: effectiveTerminalLocationId }
						: {}),
				}),
				10000,
				"Timed out looking for internet readers.",
			);

			if (discoveryResult?.error) {
				console.log("[TERMINAL S710] discovery failed", {
					locationId: effectiveTerminalLocationId || null,
					error: discoveryResult.error,
				});
				if (isAlreadyConnectedReaderError(discoveryResult.error)) {
					setStepText("Reader connected. Ready to collect payment.");
					return;
				}
				throw discoveryResult.error;
			}

			const discoveredReaders = await waitForDiscoveredReaders(getCurrentReaders);
			console.log("[TERMINAL S710] discovered internet readers", {
				count: discoveredReaders.length,
				locationId: effectiveTerminalLocationId || null,
				readers: discoveredReaders.map((reader) => ({
					label: reader.label || "",
					serialNumber: reader.serialNumber || "",
					locationId: reader.locationId || "",
					deviceType: reader.deviceType || "",
					status: reader.status || "",
				})),
			});

			const selectedReader = selectInternetReader(
				discoveredReaders,
				connectionTarget,
			);
			let result = null;

			if (selectedReader) {
				setStepText(`Connecting ${getReaderName(selectedReader)}...`);
				result = await withTerminalTimeout(
					connectReader({
						reader: selectedReader,
						discoveryMethod: "internet",
						failIfInUse: true,
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
						failIfInUse: true,
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
		if (!effectiveTerminalLocationId) {
			setStepText("Default reader location is not configured.");
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
	]);

	const handleConnectReader = async (reader) => {
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
		if (!connectedReader) {
			setErrorText("Connect a reader before collecting payment.");
			return;
		}
		if (isPayLite && payLiteSaleAmountCents <= 0) {
			setErrorText("Enter the POS sale amount before collecting payment.");
			return;
		}
		if (isPayLite && lastPayLiteReceipt) {
			setErrorText("Start a new payment before collecting another charge.");
			return;
		}

		setErrorText("");
		setIsPaying(true);
		setProcessedPaymentIntentId("");
		let capturedPaymentIntentId = "";
		let terminalStage = "start";
		let preparedPaymentIntentId = "";

		try {
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
			const retrieved = await withTerminalTimeout(
				retrievePaymentIntent(prepData.clientSecret),
				15000,
				"Reader session could not load this payment. Reconnect the S710 and try again.",
			);
			if (retrieved?.error) throw retrieved.error;
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
				}),
				30000,
				"The S710 did not display the payment. Reconnect the reader and try again.",
			);
			if (collected?.error) throw collected.error;
			console.log("[TERMINAL PAYMENT] Payment method collected", {
				paymentIntentId:
					collected?.paymentIntent?.id || prepData.paymentIntentId,
				status: collected?.paymentIntent?.status || null,
			});

			terminalStage = "processPaymentIntent";
			setStepText("Processing card...");
			console.log("[TERMINAL PAYMENT] Processing payment intent", {
				paymentIntentId:
					collected?.paymentIntent?.id || prepData.paymentIntentId,
			});
			const processed = await processPaymentIntent({
				paymentIntent: collected.paymentIntent,
			});
			if (processed?.error) throw processed.error;
			console.log("[TERMINAL PAYMENT] Payment intent processed", {
				paymentIntentId:
					processed?.paymentIntent?.id || prepData.paymentIntentId,
				status: processed?.paymentIntent?.status || null,
			});

			const paymentIntentId =
				processed?.paymentIntent?.id || prepData.paymentIntentId;
			capturedPaymentIntentId = paymentIntentId;
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
				const tipAmount = Number(captureData.gratuityAmount || 0);
				const totalPaidAmount = Number(
					captureData.amount || prepData.amount || paymentTotalCents || 0,
				);
				const customerFeeAmount = Number(
					captureData.customerServiceFeeAmount ||
						prepData.customerServiceFeeAmount ||
						payLiteServiceFeeCents ||
						0,
				);
				const receipt = {
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
					customerServiceFeeAmount: customerFeeAmount,
					gratuityAmount: tipAmount,
					amount: totalPaidAmount,
					readerLabel: getReaderName(connectedReader || {}),
					readerSerialNumber: connectedReader?.serialNumber || "",
					note: String(payLiteNote || "").trim(),
				};
				setLastPayLiteReceipt(receipt);
				setStepText("Payment recorded. Receipt ready.");
				return;
			}

			await finalizeCloseout(paymentIntentId);
		} catch (error) {
			console.error("[TERMINAL PAYMENT] Terminal flow failed", {
				stage: terminalStage,
				message: error?.message,
				code: error?.code,
				details: error?.details,
				paymentIntentId: capturedPaymentIntentId || preparedPaymentIntentId,
			});
			setErrorText(
				capturedPaymentIntentId
					? "Payment captured. Closeout still needs finalizing."
					: getFriendlyReaderError(
							error,
							"Card reader payment could not be completed. Try again.",
						),
			);
			if (capturedPaymentIntentId) {
				setStepText("Payment captured. Closeout still needs finalizing.");
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
						keyboardType="decimal-pad"
						editable={!isBusy && !lastPayLiteReceipt}
						autoFocus={lockToPayLite}
					/>
					<TouchableOpacity
						style={[
							styles.payLiteCollectButton,
							(!connectedReader ||
								isBusy ||
								lastPayLiteReceipt ||
								payLiteSaleAmountCents <= 0) &&
								styles.buttonDisabled,
						]}
						onPress={handleCollectPayment}
						disabled={
							!connectedReader ||
							isBusy ||
							!!lastPayLiteReceipt ||
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
								<Text style={styles.payLiteReceiptTitle}>Payment recorded</Text>
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
									Print / Share receipt
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.payLiteReceiptSecondaryButton}
								onPress={resetPayLitePayment}
							>
								<Text style={styles.payLiteReceiptSecondaryText}>
									New payment
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

				{!lastPayLiteReceipt ? (
					<View style={styles.payLiteDetailsCard}>
						<TextInput
							style={styles.payLiteCompactNote}
							value={payLiteNote}
							onChangeText={setPayLiteNote}
							placeholder="Optional POS ticket or note"
							editable={!isBusy}
							maxLength={160}
						/>
					</View>
				) : null}

				{errorText ? (
					<View style={styles.payLiteErrorBox}>
						<Text style={styles.errorText}>{errorText}</Text>
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
