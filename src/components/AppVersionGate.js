import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Constants from "expo-constants";
import { db } from "../config/firebase.native";
import colors from "../utils/styles/appStyles";
import { evaluateClientVersion } from "../utils/clientVersionPolicy";

const getInstalledClientInfo = () => {
	const expoConfig = Constants.expoConfig || {};
	return {
		platform: Platform.OS === "ios" ? "ios" : "android",
		version: expoConfig.version || "0.0.0",
		build:
			Platform.OS === "ios"
				? expoConfig.ios?.buildNumber
				: expoConfig.android?.versionCode,
		appEnv: expoConfig.extra?.appEnv || "production",
	};
};

const getUpdateUrl = (policy, platform) => {
	const urls = policy?.updateUrls || {};
	return platform === "ios"
		? urls.ios || urls.appStore || policy?.updateUrl
		: urls.android || urls.playStore || policy?.updateUrl;
};

const AppVersionGate = ({ children }) => {
	const installed = useMemo(getInstalledClientInfo, []);
	const [state, setState] = useState({
		loading: true,
		updateRequired: false,
		policy: null,
	});

	useEffect(() => {
		let isMounted = true;

		const loadPolicy = async () => {
			try {
				const snap = await db.collection("appConfig").doc("clientVersions").get();
				const policy = snap.exists ? snap.data() || {} : {};
				const result = evaluateClientVersion(installed, policy);

				if (isMounted) {
					setState({
						loading: false,
						updateRequired: result.updateRequired,
						reason: result.reason,
						policy,
					});
				}
			} catch (error) {
				console.warn("App version gate unavailable; allowing startup.", error);
				if (isMounted) {
					setState({ loading: false, updateRequired: false, policy: null });
				}
			}
		};

		loadPolicy();
		return () => {
			isMounted = false;
		};
	}, [installed]);

	if (state.loading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (!state.updateRequired) {
		return children;
	}

	const message =
		state.policy?.message ||
		"Please update Scerv to continue. This version is no longer supported.";
	const updateUrl = getUpdateUrl(state.policy, installed.platform);

	return (
		<View style={styles.screen}>
			<View style={styles.panel}>
				<Text style={styles.kicker}>Update Required</Text>
				<Text style={styles.title}>A newer Scerv build is available.</Text>
				<Text style={styles.body}>{message}</Text>
				<Text style={styles.meta}>
					Installed version {installed.version} ({installed.build || "unknown"})
				</Text>
				{updateUrl ? (
					<Pressable
						accessibilityRole="button"
						style={styles.primaryButton}
						onPress={() => Linking.openURL(updateUrl)}
					>
						<Text style={styles.primaryButtonText}>Update Scerv</Text>
					</Pressable>
				) : (
					<Text style={styles.note}>
						Open TestFlight or Google Play Internal Testing to install the latest
						build.
					</Text>
				)}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	centered: {
		alignItems: "center",
		backgroundColor: colors.background,
		flex: 1,
		justifyContent: "center",
	},
	screen: {
		alignItems: "center",
		backgroundColor: colors.background,
		flex: 1,
		justifyContent: "center",
		padding: 24,
	},
	panel: {
		backgroundColor: colors.surfaceWhite,
		borderColor: colors.borderLight,
		borderRadius: 8,
		borderWidth: 1,
		maxWidth: 420,
		padding: 24,
		width: "100%",
	},
	kicker: {
		color: colors.primary,
		fontSize: 13,
		fontWeight: "800",
		marginBottom: 8,
		textTransform: "uppercase",
	},
	title: {
		color: colors.textDark,
		fontSize: 24,
		fontWeight: "800",
		lineHeight: 30,
		marginBottom: 12,
	},
	body: {
		color: colors.textMedium,
		fontSize: 16,
		lineHeight: 23,
		marginBottom: 16,
	},
	meta: {
		color: colors.textMedium,
		fontSize: 13,
		marginBottom: 20,
	},
	primaryButton: {
		alignItems: "center",
		backgroundColor: colors.primary,
		borderRadius: 6,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	primaryButtonText: {
		color: colors.textOnPrimaryBrand,
		fontSize: 16,
		fontWeight: "800",
	},
	note: {
		color: colors.textMedium,
		fontSize: 14,
		lineHeight: 20,
	},
});

export default AppVersionGate;
