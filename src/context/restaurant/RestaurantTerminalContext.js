import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { NativeModules, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
	StripeTerminalProvider,
	useStripeTerminal,
} from "@stripe/stripe-terminal-react-native";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../authContext";
import { useEmployeeSession } from "./EmployeeSessionContext";
import { functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { getRestaurantPermissions } from "../../utils/restaurantPermissions";

const TerminalContext = createContext({
	tokenStatus: "Token not requested yet",
	liveMode: null,
	readerList: [],
	connectedReader: null,
	loading: false,
	terminalInitialized: false,
	discoverReaders: async () => ({ error: null }),
	cancelDiscovering: async () => ({ error: null }),
	easyConnect: async () => ({ error: null }),
	connectReader: async () => ({ error: null }),
	disconnectReader: async () => ({ error: null }),
	clearCachedCredentials: async () => ({ error: null }),
	getCurrentReaders: () => [],
	refreshConnectionToken: async () => "",
	retrievePaymentIntent: async () => ({ error: null }),
	collectPaymentMethod: async () => ({ error: null }),
	confirmPaymentIntent: async () => ({ error: null }),
	processPaymentIntent: async () => ({ error: null }),
	cancelPaymentIntent: async () => ({ error: null }),
	cancelCollectPaymentMethod: async () => ({ error: null }),
	cancelProcessPaymentIntent: async () => ({ error: null }),
});

const getReaderName = (reader = {}) =>
	reader.label ||
	reader.serialNumber ||
	reader.id ||
	reader.deviceType ||
	"Reader";

const getPreferredCollector = (restaurantData = {}) =>
	restaurantData?.payLiteDefaultCollector ||
	restaurantData?.defaultTerminalCollector ||
	restaurantData?.terminalDefaultCollector ||
	null;

const getCollectorLocationId = (collector = {}) =>
	String(collector?.locationId || collector?.terminalLocationId || "").trim();

const withTimeout = (promise, timeoutMs, message) =>
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

const setNativeConnectionToken = async ({ token, error }) => {
	const terminalNativeModule = NativeModules.StripeTerminalReactNative;
	if (!terminalNativeModule?.setConnectionToken) return;
	await terminalNativeModule.setConnectionToken({ token, error });
};

const TerminalLifecycle = ({
	children,
	enabled,
	liveMode,
	refreshConnectionToken,
	tokenStatus,
	setTokenStatus,
}) => {
	const readerListRef = useRef([]);
	const [readerList, setReaderList] = useState([]);
	const {
		initialize,
		isInitialized,
		easyConnect,
		connectedReader,
		loading,
		discoverReaders,
		cancelDiscovering,
		connectReader,
		disconnectReader,
		clearCachedCredentials,
		retrievePaymentIntent,
		collectPaymentMethod,
		confirmPaymentIntent,
		processPaymentIntent,
		cancelPaymentIntent,
		cancelCollectPaymentMethod,
		cancelProcessPaymentIntent,
	} = useStripeTerminal({
		onUpdateDiscoveredReaders: (readers) => {
			const nextReaders = readers || [];
			readerListRef.current = nextReaders;
			setReaderList(nextReaders);
		},
		onDidChangeConnectionStatus: (status) => {
			if (status === "connected") {
				setTokenStatus("Reader connected");
			} else if (status === "connecting" || status === "discovering") {
				setTokenStatus("Connecting reader...");
			} else if (status === "reconnecting") {
				setTokenStatus("Reconnecting reader...");
			}
		},
		onDidDisconnect: () => {
			setTokenStatus("Reader disconnected");
		},
	});

	useEffect(() => {
		let mounted = true;

		const initializeTerminal = async () => {
			if (!enabled || isInitialized) return;
			const result = await initialize();
			if (!mounted) return;
			if (result?.error) {
				setTokenStatus(
					result.error.message ||
						"Stripe Terminal could not initialize on this device.",
				);
				return;
			}
			setTokenStatus("Terminal ready");
		};

		initializeTerminal();

		return () => {
			mounted = false;
		};
	}, [enabled, initialize, isInitialized, setTokenStatus]);

	const value = useMemo(
		() => ({
			tokenStatus,
			liveMode,
			readerList,
			connectedReader,
			loading,
			terminalInitialized: isInitialized,
			discoverReaders,
			cancelDiscovering,
			easyConnect,
			connectReader,
			disconnectReader,
			clearCachedCredentials,
			getCurrentReaders: () => readerListRef.current || [],
			refreshConnectionToken,
			retrievePaymentIntent,
			collectPaymentMethod,
			confirmPaymentIntent,
			processPaymentIntent,
			cancelPaymentIntent,
			cancelCollectPaymentMethod,
			cancelProcessPaymentIntent,
		}),
		[
			cancelCollectPaymentMethod,
			cancelDiscovering,
			cancelPaymentIntent,
			cancelProcessPaymentIntent,
			collectPaymentMethod,
			confirmPaymentIntent,
			connectReader,
			clearCachedCredentials,
			connectedReader,
			disconnectReader,
			discoverReaders,
			easyConnect,
			isInitialized,
			loading,
			liveMode,
			processPaymentIntent,
			readerList,
			refreshConnectionToken,
			retrievePaymentIntent,
			tokenStatus,
		],
	);

	return (
		<TerminalContext.Provider value={value}>
			{children}
		</TerminalContext.Provider>
	);
};

export const RestaurantTerminalProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const [tokenStatus, setTokenStatus] = useState("Token not requested yet");
	const permissions = getRestaurantPermissions(activeSession);
	const terminalEnabled = !!activeSession && permissions.canUseTerminal;
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
	const [liveMode, setLiveMode] = useState(null);
	const isTestAccount = currentUserData?.isTestAccount !== false;
	const preferredCollector = getPreferredCollector(currentUserData);
	const stripeTerminalLocationId =
		(isTestAccount
			? currentUserData?.stripeTerminalLocationId_test ||
				currentUserData?.terminalLocationId_test
			: currentUserData?.stripeTerminalLocationId_live ||
				currentUserData?.terminalLocationId_live) ||
		currentUserData?.stripeTerminalLocationId ||
		currentUserData?.terminalLocationId ||
		getCollectorLocationId(preferredCollector) ||
		"";

	const fetchConnectionTokenFromServer = useCallback(async () => {
		if (!restaurantId) {
			throw new Error("Restaurant context is missing for Terminal connection.");
		}
		if (!terminalEnabled) {
			throw new Error("This staff role is not allowed to connect a reader.");
		}

		const startedAt = Date.now();
		console.log("[TERMINAL TOKEN] Requesting connection token", {
			restaurantId,
			locationId: stripeTerminalLocationId || null,
		});
		const createTerminalConnectionToken = httpsCallable(
			functions,
			"createTerminalConnectionToken",
		);
		const result = await withTimeout(
			createTerminalConnectionToken({
				restaurantId,
				staffId: activeSession?.id || null,
			}),
			20000,
			"Timed out requesting a Stripe Terminal connection token from Firebase.",
		);

		if (!result?.data?.secret) {
			throw new Error("Could not create Stripe Terminal connection token.");
		}

		console.log("[TERMINAL TOKEN] Received connection token", {
			liveMode: result.data.liveMode === true,
			locationId: result.data.locationId || stripeTerminalLocationId || null,
			terminalAccountScope: result.data.terminalAccountScope || "unknown",
			connectedAccountId: result.data.connectedAccountId || null,
			locationSource: result.data.locationSource || "unknown",
			durationMs: Date.now() - startedAt,
		});
		setLiveMode(result.data.liveMode === true);

		return result.data.secret;
	}, [
		activeSession?.id,
		restaurantId,
		setLiveMode,
		stripeTerminalLocationId,
		terminalEnabled,
	]);

	const refreshConnectionToken = useCallback(async (options = {}) => {
		const reason = options?.reason || "sdk";
		console.log("[TERMINAL TOKEN] tokenProvider called", { reason });
		setTokenStatus(
			reason === "payment"
				? "Preparing secure reader session..."
				: "SDK requesting token...",
		);
		const startedAt = Date.now();
		try {
			const secret = await fetchConnectionTokenFromServer();
			await setNativeConnectionToken({ token: secret });
			console.log("[TERMINAL TOKEN] Connection token pushed to native");
			setTokenStatus(`SDK token delivered (${Date.now() - startedAt}ms)`);
			return secret;
		} catch (error) {
			await setNativeConnectionToken({
				error:
					error?.message ||
					"Could not fetch Stripe Terminal connection token.",
			});
			setTokenStatus("SDK token request failed");
			throw error;
		}
	}, [fetchConnectionTokenFromServer]);

	const tokenProvider = useCallback(
		() => refreshConnectionToken({ reason: "sdk" }),
		[refreshConnectionToken],
	);

	return (
		<>
			{terminalEnabled ? (
				<StripeTerminalProvider logLevel="error" tokenProvider={tokenProvider}>
					<TerminalLifecycle
						enabled={!!restaurantId}
						liveMode={liveMode}
						refreshConnectionToken={refreshConnectionToken}
						tokenStatus={tokenStatus}
						setTokenStatus={setTokenStatus}
					>
						{children}
					</TerminalLifecycle>
				</StripeTerminalProvider>
			) : (
				<TerminalContext.Provider value={{ tokenStatus }}>
					{children}
				</TerminalContext.Provider>
			)}
		</>
	);
};

export const useRestaurantTerminal = () => useContext(TerminalContext);

const RestaurantTerminalIndicatorContent = () => {
	const { connectedReader, loading, tokenStatus } = useRestaurantTerminal();
	const isConnected = !!connectedReader;
	const label = isConnected
		? getReaderName(connectedReader)
		: tokenStatus || "No reader";

	return (
		<View
			style={[
				styles.indicator,
				isConnected ? styles.indicatorConnected : styles.indicatorIdle,
			]}
		>
			<MaterialCommunityIcons
				name={isConnected ? "contactless-payment" : "credit-card-sync"}
				size={15}
				color={isConnected ? colors.statusSuccess : colors.textMedium}
			/>
			<Text
				numberOfLines={1}
				style={[
					styles.indicatorText,
					isConnected ? styles.indicatorTextConnected : null,
				]}
			>
				{loading && !isConnected ? "Terminal..." : label}
			</Text>
		</View>
	);
};

export const RestaurantTerminalIndicator = () => {
	const { activeSession } = useEmployeeSession();
	const permissions = getRestaurantPermissions(activeSession);
	const terminalEnabled = !!activeSession && permissions.canUseTerminal;
	if (!terminalEnabled) return null;

	return <RestaurantTerminalIndicatorContent />;
};

const styles = StyleSheet.create({
	indicator: {
		maxWidth: 150,
		minHeight: 32,
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 8,
		borderWidth: 1,
		paddingHorizontal: 8,
		marginRight: 8,
	},
	indicatorConnected: {
		backgroundColor: "#EAF7EE",
		borderColor: "#B9E4C4",
	},
	indicatorIdle: {
		backgroundColor: colors.surfaceWhite,
		borderColor: colors.borderLight,
	},
	indicatorText: {
		flexShrink: 1,
		fontSize: 11,
		fontWeight: "800",
		color: colors.textMedium,
	},
	indicatorTextConnected: {
		color: colors.statusSuccess,
	},
});
