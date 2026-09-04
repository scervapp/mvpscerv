import React, { useContext, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { getRestaurantExperienceConfig } from "../../utils/restaurantExperience";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { getRestaurantPermissions } from "../../utils/restaurantPermissions";

const DAYS = [
	{ key: "monday", label: "Mon" },
	{ key: "tuesday", label: "Tue" },
	{ key: "wednesday", label: "Wed" },
	{ key: "thursday", label: "Thu" },
	{ key: "friday", label: "Fri" },
	{ key: "saturday", label: "Sat" },
	{ key: "sunday", label: "Sun" },
];

const DEFAULT_ACTIVE_DAYS = ["thursday", "friday", "saturday", "sunday"];

const HOSPITALITY_STYLES = [
	{ key: "standard", label: "Standard" },
	{ key: "quick_service", label: "Quick" },
	{ key: "casual_dining", label: "Casual" },
	{ key: "full_service", label: "Full" },
	{ key: "fine_dining", label: "Fine" },
	{ key: "hotel_concierge", label: "Hotel" },
];

const STYLE_FEATURE_PRESETS = {
	standard: {
		reservations: false,
		hostCheckInRequests: false,
		qrSelfCheckIn: true,
		tableScanOrdering: true,
	},
	quick_service: {
		reservations: false,
		hostCheckInRequests: false,
		qrSelfCheckIn: false,
		tableScanOrdering: false,
	},
	casual_dining: {
		reservations: true,
		hostCheckInRequests: true,
		qrSelfCheckIn: true,
		tableScanOrdering: true,
	},
	full_service: {
		reservations: true,
		hostCheckInRequests: true,
		qrSelfCheckIn: true,
		tableScanOrdering: true,
	},
	fine_dining: {
		reservations: true,
		hostCheckInRequests: true,
		qrSelfCheckIn: false,
		tableScanOrdering: true,
	},
	hotel_concierge: {
		reservations: true,
		hostCheckInRequests: true,
		qrSelfCheckIn: false,
		tableScanOrdering: true,
	},
};

const clampExperienceFeatures = (features, allowedFeatures = {}) => {
	const cleanFeatures = {};
	Object.keys(features || {}).forEach((key) => {
		cleanFeatures[key] = allowedFeatures[key] === false ? false : features[key];
	});
	return cleanFeatures;
};

const buildWeeklySchedule = ({
	activeDays,
	lunchStart,
	lunchEnd,
	dinnerStart,
	dinnerEnd,
	maxReservationsPerSlot,
}) => {
	const schedule = {};
	DAYS.forEach((day) => {
		if (!activeDays.includes(day.key)) {
			schedule[day.key] = [];
			return;
		}

		const windows = [];
		if (lunchStart && lunchEnd) {
			windows.push({
				start: lunchStart,
				end: lunchEnd,
				maxReservationsPerSlot: Number(maxReservationsPerSlot || 4),
			});
		}
		if (dinnerStart && dinnerEnd) {
			windows.push({
				start: dinnerStart,
				end: dinnerEnd,
				maxReservationsPerSlot: Number(maxReservationsPerSlot || 4),
			});
		}
		schedule[day.key] = windows;
	});
	return schedule;
};

const getDefaultSettingsState = () => ({
	enabled: false,
	slotIntervalMinutes: "30",
	defaultTurnTimeMinutes: "90",
	minPartySize: "1",
	maxPartySize: "12",
	maxReservationsPerSlot: "4",
	lunchStart: "11:30",
	lunchEnd: "14:30",
	dinnerStart: "17:00",
	dinnerEnd: "22:00",
	activeDays: DEFAULT_ACTIVE_DAYS,
});

const getDefaultExperienceState = () => ({
	hospitalityStyle: "standard",
	features: {
		reservations: false,
		hostCheckInRequests: false,
		qrSelfCheckIn: true,
		tableScanOrdering: true,
	},
	allowedFeatures: {
		reservations: true,
		hostCheckInRequests: true,
		qrSelfCheckIn: true,
		tableScanOrdering: true,
	},
});

const ReservationSettingsScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
	const permissions = getRestaurantPermissions(activeSession);
	const canManageReservationSettings = permissions.canManageReservationSettings;

	const [settingsState, setSettingsState] = useState(getDefaultSettingsState);
	const [experienceState, setExperienceState] = useState(
		getDefaultExperienceState,
	);
	const [isSaving, setIsSaving] = useState(false);
	const [isSavingExperience, setIsSavingExperience] = useState(false);

	useEffect(() => {
		if (!restaurantId) return undefined;

		const unsubscribe = db
			.collection("restaurants")
			.doc(restaurantId)
			.onSnapshot((doc) => {
				if (!doc.exists) return;
				const data = doc.data() || {};
				const experienceConfig = getRestaurantExperienceConfig(data);
				setExperienceState({
					hospitalityStyle: experienceConfig.hospitalityStyle || "standard",
					features: {
						reservations: experienceConfig.features.reservations === true,
						hostCheckInRequests:
							experienceConfig.features.hostCheckInRequests === true,
						qrSelfCheckIn: experienceConfig.features.qrSelfCheckIn !== false,
						tableScanOrdering:
							experienceConfig.features.tableScanOrdering === true,
					},
					allowedFeatures: {
						reservations: experienceConfig.isFeatureAllowed("reservations"),
						hostCheckInRequests:
							experienceConfig.isFeatureAllowed("hostCheckInRequests"),
						qrSelfCheckIn: experienceConfig.isFeatureAllowed("qrSelfCheckIn"),
						tableScanOrdering:
							experienceConfig.isFeatureAllowed("tableScanOrdering"),
					},
				});
			});

		return () => unsubscribe();
	}, [restaurantId]);

	useEffect(() => {
		if (!restaurantId) return undefined;

		const settingsRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("reservationSettings")
			.doc("general");

		const unsubscribe = settingsRef.onSnapshot((doc) => {
			if (!doc.exists) return;
			const data = doc.data() || {};
			const firstActiveDay = DAYS.find((day) => {
				return Array.isArray(data.weeklySchedule?.[day.key]) &&
					data.weeklySchedule[day.key].length > 0;
			});
			const sampleWindows = firstActiveDay
				? data.weeklySchedule[firstActiveDay.key]
				: [];
			const lunch = sampleWindows[0] || {};
			const dinner = sampleWindows[1] || {};
			const activeDays = DAYS.filter((day) => {
				return Array.isArray(data.weeklySchedule?.[day.key]) &&
					data.weeklySchedule[day.key].length > 0;
			}).map((day) => day.key);

			setSettingsState({
				enabled: data.enabled === true,
				slotIntervalMinutes: String(data.slotIntervalMinutes || 30),
				defaultTurnTimeMinutes: String(data.defaultTurnTimeMinutes || 90),
				minPartySize: String(data.minPartySize || 1),
				maxPartySize: String(data.maxPartySize || 12),
				maxReservationsPerSlot: String(
					lunch.maxReservationsPerSlot ||
						dinner.maxReservationsPerSlot ||
						4,
				),
				lunchStart: lunch.start || "11:30",
				lunchEnd: lunch.end || "14:30",
				dinnerStart: dinner.start || "17:00",
				dinnerEnd: dinner.end || "22:00",
				activeDays: activeDays.length > 0 ? activeDays : DEFAULT_ACTIVE_DAYS,
			});
		});

		return () => unsubscribe();
	}, [restaurantId]);

	const updateSettings = (patch) => {
		setSettingsState((prev) => ({ ...prev, ...patch }));
	};

	const requireReservationManager = () => {
		if (canManageReservationSettings) return true;
		Alert.alert(
			"Manager required",
			"Only owners and managers can change reservation rules.",
		);
		return false;
	};

	const applyHospitalityStyle = (hospitalityStyle) => {
		if (!requireReservationManager()) return;
		setExperienceState((prev) => ({
			hospitalityStyle,
			features: {
				...prev.features,
				...clampExperienceFeatures(
					STYLE_FEATURE_PRESETS[hospitalityStyle] || {},
					prev.allowedFeatures,
				),
			},
			allowedFeatures: prev.allowedFeatures,
		}));
	};

	const toggleExperienceFeature = (featureKey) => {
		if (!requireReservationManager()) return;
		if (experienceState.allowedFeatures[featureKey] === false) return;
		setExperienceState((prev) => ({
			...prev,
			features: {
				...prev.features,
				[featureKey]: !prev.features[featureKey],
				...(featureKey === "qrSelfCheckIn" && {
					tableScanOrdering:
						prev.allowedFeatures.tableScanOrdering !== false
							? !prev.features[featureKey]
							: false,
				}),
			},
		}));
	};

	const toggleReservationSlots = (enabled) => {
		if (!requireReservationManager()) return;
		if (enabled && experienceState.allowedFeatures.reservations === false) {
			Alert.alert(
				"Feature locked",
				"Reservations are not enabled for this restaurant plan.",
			);
			return;
		}
		updateSettings({ enabled });
	};

	const toggleDay = (dayKey) => {
		if (!requireReservationManager()) return;
		setSettingsState((prev) => {
			const activeDays = prev.activeDays.includes(dayKey)
				? prev.activeDays.filter((day) => day !== dayKey)
				: [...prev.activeDays, dayKey];
			return { ...prev, activeDays };
		});
	};

	const handleSaveExperienceSettings = async () => {
		if (!restaurantId || !requireReservationManager()) return;
		setIsSavingExperience(true);
		const featuresToSave = clampExperienceFeatures(
			{ ...experienceState.features },
			experienceState.allowedFeatures,
		);

		try {
			const saveExperience = httpsCallable(
				functions,
				"saveRestaurantExperienceSettings",
			);
			await saveExperience({
				restaurantId,
				employeeId: activeSession?.id || null,
				hospitalityStyle: experienceState.hospitalityStyle,
				features: featuresToSave,
			});
			Alert.alert("Saved", "Experience controls updated.");
		} catch (error) {
			console.error("Error saving experience settings:", error);
			Alert.alert("Could not save", error.message || "Please try again.");
		} finally {
			setIsSavingExperience(false);
		}
	};

	const handleSaveSettings = async () => {
		if (!restaurantId || !requireReservationManager()) return;
		setIsSaving(true);
		const featuresToSave = clampExperienceFeatures(
			{ ...experienceState.features },
			experienceState.allowedFeatures,
		);

		try {
			const saveSettings = httpsCallable(functions, "saveReservationSettings");
			await saveSettings({
				restaurantId,
				employeeId: activeSession?.id || null,
				settings: {
					enabled:
						experienceState.allowedFeatures.reservations !== false &&
						settingsState.enabled,
					slotIntervalMinutes: Number(settingsState.slotIntervalMinutes),
					defaultTurnTimeMinutes: Number(settingsState.defaultTurnTimeMinutes),
					minPartySize: Number(settingsState.minPartySize),
					maxPartySize: Number(settingsState.maxPartySize),
					emailConfirmationsEnabled: true,
					weeklySchedule: buildWeeklySchedule(settingsState),
				},
			});
			const saveExperience = httpsCallable(
				functions,
				"saveRestaurantExperienceSettings",
			);
			await saveExperience({
				restaurantId,
				employeeId: activeSession?.id || null,
				hospitalityStyle: experienceState.hospitalityStyle,
				features: featuresToSave,
			});
			Alert.alert("Saved", "Reservation settings updated.");
		} catch (error) {
			console.error("Error saving reservation settings:", error);
			Alert.alert("Could not save", error.message || "Please try again.");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.title}>Reservation Settings</Text>
				<Text style={styles.subtitle}>
					Configure guest-facing reservation and host check-in controls.
				</Text>

				<View style={styles.panel}>
					<View style={styles.panelHeader}>
						<View>
							<Text style={styles.panelTitle}>Experience controls</Text>
							<Text style={styles.panelSubtitle}>
								Choose the service style and guest actions for this location.
							</Text>
						</View>
					</View>
					{!canManageReservationSettings && (
						<Text style={styles.readOnlyNotice}>
							Owner or manager access is required to change these controls.
						</Text>
					)}

					<Text style={styles.label}>Hospitality style</Text>
					<View style={styles.dayRow}>
						{HOSPITALITY_STYLES.map((style) => (
							<TouchableOpacity
								key={style.key}
								style={[
									styles.dayChip,
									experienceState.hospitalityStyle === style.key &&
										styles.dayChipActive,
									!canManageReservationSettings && styles.disabledControl,
								]}
								onPress={() => applyHospitalityStyle(style.key)}
								disabled={!canManageReservationSettings}
							>
								<Text
									style={[
										styles.dayChipText,
										experienceState.hospitalityStyle === style.key &&
											styles.dayChipTextActive,
									]}
								>
									{style.label}
								</Text>
							</TouchableOpacity>
						))}
					</View>

					<View style={styles.toggleRow}>
						<View style={styles.toggleCopy}>
							<Text style={styles.toggleTitle}>Reservations</Text>
							<Text style={styles.panelSubtitle}>Guests can request a time.</Text>
							{experienceState.allowedFeatures.reservations === false && (
								<Text style={styles.lockedFeatureText}>Locked by Scerv plan</Text>
							)}
						</View>
						<Switch
							value={experienceState.features.reservations}
							onValueChange={() => toggleExperienceFeature("reservations")}
							disabled={
								!canManageReservationSettings ||
								experienceState.allowedFeatures.reservations === false
							}
						/>
					</View>
					<View style={styles.toggleRow}>
						<View style={styles.toggleCopy}>
							<Text style={styles.toggleTitle}>Host check-in</Text>
							<Text style={styles.panelSubtitle}>
								Walk-ins ask to be seated by a host.
							</Text>
							{experienceState.allowedFeatures.hostCheckInRequests === false && (
								<Text style={styles.lockedFeatureText}>Locked by Scerv plan</Text>
							)}
						</View>
						<Switch
							value={experienceState.features.hostCheckInRequests}
							onValueChange={() =>
								toggleExperienceFeature("hostCheckInRequests")
							}
							disabled={
								!canManageReservationSettings ||
								experienceState.allowedFeatures.hostCheckInRequests === false
							}
						/>
					</View>
					<View style={styles.toggleRow}>
						<View style={styles.toggleCopy}>
							<Text style={styles.toggleTitle}>QR self check-in</Text>
							<Text style={styles.panelSubtitle}>
								Guests can start from a table QR code.
							</Text>
							{experienceState.allowedFeatures.qrSelfCheckIn === false && (
								<Text style={styles.lockedFeatureText}>Locked by Scerv plan</Text>
							)}
						</View>
						<Switch
							value={experienceState.features.qrSelfCheckIn}
							onValueChange={() => toggleExperienceFeature("qrSelfCheckIn")}
							disabled={
								!canManageReservationSettings ||
								experienceState.allowedFeatures.qrSelfCheckIn === false
							}
						/>
					</View>
					<TouchableOpacity
						style={[
							styles.saveButton,
							!canManageReservationSettings && styles.saveButtonDisabled,
						]}
						onPress={handleSaveExperienceSettings}
						disabled={isSavingExperience || !canManageReservationSettings}
					>
						{isSavingExperience ? (
							<ActivityIndicator color="#fff" />
						) : (
							<>
								<Ionicons name="options-outline" size={18} color="#fff" />
								<Text style={styles.saveButtonText}>Save experience controls</Text>
							</>
						)}
					</TouchableOpacity>
				</View>

				<View style={styles.panel}>
					<View style={styles.panelHeader}>
						<View style={styles.toggleCopy}>
							<Text style={styles.panelTitle}>Reservation slots</Text>
							<Text style={styles.panelSubtitle}>
								Set when guests can request a reservation.
							</Text>
						</View>
						<Switch
							value={settingsState.enabled}
							onValueChange={toggleReservationSlots}
							disabled={
								!canManageReservationSettings ||
								experienceState.allowedFeatures.reservations === false
							}
						/>
					</View>
					{experienceState.allowedFeatures.reservations === false && (
						<Text style={styles.lockedFeatureText}>
							Reservation setup is locked by the current Scerv plan.
						</Text>
					)}

					<Text style={styles.label}>Active days</Text>
					<View style={styles.dayRow}>
						{DAYS.map((day) => (
							<TouchableOpacity
								key={day.key}
								style={[
									styles.dayChip,
									settingsState.activeDays.includes(day.key) &&
										styles.dayChipActive,
									!canManageReservationSettings && styles.disabledControl,
								]}
								onPress={() => toggleDay(day.key)}
								disabled={!canManageReservationSettings}
							>
								<Text
									style={[
										styles.dayChipText,
										settingsState.activeDays.includes(day.key) &&
											styles.dayChipTextActive,
									]}
								>
									{day.label}
								</Text>
							</TouchableOpacity>
						))}
					</View>

					<View style={styles.inputRow}>
						<View style={styles.inputHalf}>
							<Text style={styles.label}>Lunch start</Text>
							<TextInput
								value={settingsState.lunchStart}
								onChangeText={(value) => updateSettings({ lunchStart: value })}
								style={[
									styles.input,
									!canManageReservationSettings && styles.inputDisabled,
								]}
								editable={canManageReservationSettings}
							/>
						</View>
						<View style={styles.inputHalf}>
							<Text style={styles.label}>Lunch end</Text>
							<TextInput
								value={settingsState.lunchEnd}
								onChangeText={(value) => updateSettings({ lunchEnd: value })}
								style={[
									styles.input,
									!canManageReservationSettings && styles.inputDisabled,
								]}
								editable={canManageReservationSettings}
							/>
						</View>
					</View>

					<View style={styles.inputRow}>
						<View style={styles.inputHalf}>
							<Text style={styles.label}>Dinner start</Text>
							<TextInput
								value={settingsState.dinnerStart}
								onChangeText={(value) => updateSettings({ dinnerStart: value })}
								style={[
									styles.input,
									!canManageReservationSettings && styles.inputDisabled,
								]}
								editable={canManageReservationSettings}
							/>
						</View>
						<View style={styles.inputHalf}>
							<Text style={styles.label}>Dinner end</Text>
							<TextInput
								value={settingsState.dinnerEnd}
								onChangeText={(value) => updateSettings({ dinnerEnd: value })}
								style={[
									styles.input,
									!canManageReservationSettings && styles.inputDisabled,
								]}
								editable={canManageReservationSettings}
							/>
						</View>
					</View>

					<View style={styles.inputRow}>
						<View style={styles.inputHalf}>
							<Text style={styles.label}>Slot interval</Text>
							<TextInput
								value={settingsState.slotIntervalMinutes}
								onChangeText={(value) =>
									updateSettings({ slotIntervalMinutes: value })
								}
								style={[
									styles.input,
									!canManageReservationSettings && styles.inputDisabled,
								]}
								keyboardType="number-pad"
								editable={canManageReservationSettings}
							/>
						</View>
						<View style={styles.inputHalf}>
							<Text style={styles.label}>Max per slot</Text>
							<TextInput
								value={settingsState.maxReservationsPerSlot}
								onChangeText={(value) =>
									updateSettings({ maxReservationsPerSlot: value })
								}
								style={[
									styles.input,
									!canManageReservationSettings && styles.inputDisabled,
								]}
								keyboardType="number-pad"
								editable={canManageReservationSettings}
							/>
						</View>
					</View>

					<View style={styles.inputRow}>
						<View style={styles.inputHalf}>
							<Text style={styles.label}>Min guests</Text>
							<TextInput
								value={settingsState.minPartySize}
								onChangeText={(value) => updateSettings({ minPartySize: value })}
								style={[
									styles.input,
									!canManageReservationSettings && styles.inputDisabled,
								]}
								keyboardType="number-pad"
								editable={canManageReservationSettings}
							/>
						</View>
						<View style={styles.inputHalf}>
							<Text style={styles.label}>Max guests</Text>
							<TextInput
								value={settingsState.maxPartySize}
								onChangeText={(value) => updateSettings({ maxPartySize: value })}
								style={[
									styles.input,
									!canManageReservationSettings && styles.inputDisabled,
								]}
								keyboardType="number-pad"
								editable={canManageReservationSettings}
							/>
						</View>
					</View>

					<TouchableOpacity
						style={[
							styles.saveButton,
							!canManageReservationSettings && styles.saveButtonDisabled,
						]}
						onPress={handleSaveSettings}
						disabled={isSaving || !canManageReservationSettings}
					>
						{isSaving ? (
							<ActivityIndicator color="#fff" />
						) : (
							<>
								<Ionicons name="save-outline" size={18} color="#fff" />
								<Text style={styles.saveButtonText}>Save reservation setup</Text>
							</>
						)}
					</TouchableOpacity>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { padding: 18, paddingBottom: 40 },
	title: {
		fontSize: 26,
		fontWeight: "900",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 14,
		color: colors.textMedium,
		marginTop: 4,
		marginBottom: 16,
	},
	panel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 20,
	},
	panelHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	panelTitle: {
		fontSize: 17,
		fontWeight: "900",
		color: colors.textDark,
	},
	panelSubtitle: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	toggleCopy: {
		flex: 1,
		paddingRight: 12,
	},
	lockedFeatureText: {
		fontSize: 11,
		color: colors.errorRed || "#B42318",
		fontWeight: "800",
		marginTop: 4,
	},
	readOnlyNotice: {
		borderRadius: 8,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		paddingHorizontal: 10,
		paddingVertical: 8,
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "700",
		marginBottom: 10,
	},
	toggleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	toggleTitle: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
	},
	label: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textDark,
		marginBottom: 6,
		marginTop: 10,
	},
	dayRow: { flexDirection: "row", flexWrap: "wrap" },
	dayChip: {
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		marginRight: 7,
		marginBottom: 7,
	},
	dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
	disabledControl: { opacity: 0.55 },
	dayChipText: { color: colors.textDark, fontWeight: "800" },
	dayChipTextActive: { color: "#fff" },
	inputRow: {
		flexDirection: "row",
		justifyContent: "space-between",
	},
	inputHalf: { width: "48%" },
	input: {
		minHeight: 46,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		paddingHorizontal: 10,
		color: colors.textDark,
		backgroundColor: colors.backgroundLight,
	},
	inputDisabled: {
		color: colors.textMedium,
		backgroundColor: colors.surfaceWhite,
		opacity: 0.65,
	},
	saveButton: {
		minHeight: 50,
		backgroundColor: colors.primary,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		marginTop: 16,
	},
	saveButtonDisabled: {
		backgroundColor: colors.textLight || "#A7A7A7",
		opacity: 0.7,
	},
	saveButtonText: {
		color: "#fff",
		fontWeight: "900",
		marginLeft: 8,
	},
});

export default ReservationSettingsScreen;
