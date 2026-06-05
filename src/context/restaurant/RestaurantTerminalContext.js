import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
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

const TerminalContext = createContext({
	tokenStatus: "Token not requested yet",
});

const getReaderName = (reader = {}) =>
	reader.label ||
	reader.serialNumber ||
	reader.id ||
	reader.deviceType ||
	"Reader";

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

const TerminalLifecycle = ({ children, enabled, setTokenStatus }) => {
	const { initialize, isInitialized } = useStripeTerminal({
		onDidChangeConnectionStatus: (status) => {
			if (status === "connected") {
				setTokenStatus("Reader connected");
			}
		},
		onDidDisconnect: () => {
			setTokenStatus("Reader disconnected");
		},
	});

	useEffect(() => {
		let mounted = true;

		const initializeTerminal = async () => {
			if (!enabled) return;
			if (isInitialized) return;
			const result = await initialize();
			if (!mounted) return;
			if (result?.error) {
				setTokenStatus(
					result.error.message ||
						"Stripe Terminal could not initialize on this device.",
				);
			} else {
				setTokenStatus("Terminal ready");
			}
		};

		initializeTerminal();

		return () => {
			mounted = false;
		};
	}, [enabled, initialize, isInitialized, setTokenStatus]);

	return children;
};

export const RestaurantTerminalProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const [tokenStatus, setTokenStatus] = useState("Token not requested yet");
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
	const stripeTerminalLocationId =
		currentUserData?.stripeTerminalLocationId ||
		currentUserData?.terminalLocationId ||
		"";

	const fetchConnectionTokenFromServer = useCallback(async () => {
		if (!restaurantId) {
			throw new Error("Restaurant context is missing for Terminal connection.");
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
				locationId: stripeTerminalLocationId || undefined,
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
			durationMs: Date.now() - startedAt,
		});

		return result.data.secret;
	}, [activeSession?.id, restaurantId, stripeTerminalLocationId]);

	const tokenProvider = useCallback(async () => {
		console.log("[TERMINAL TOKEN] tokenProvider called");
		setTokenStatus("SDK requesting token...");
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

	const value = useMemo(() => ({ tokenStatus }), [tokenStatus]);

	return (
		<TerminalContext.Provider value={value}>
			<StripeTerminalProvider logLevel="error" tokenProvider={tokenProvider}>
				<TerminalLifecycle
					enabled={!!restaurantId}
					setTokenStatus={setTokenStatus}
				>
					{children}
				</TerminalLifecycle>
			</StripeTerminalProvider>
		</TerminalContext.Provider>
	);
};

export const useRestaurantTerminal = () => useContext(TerminalContext);

export const RestaurantTerminalIndicator = () => {
	const { connectedReader, loading } = useStripeTerminal();
	const isConnected = !!connectedReader;
	const label = isConnected ? getReaderName(connectedReader) : "No reader";

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
