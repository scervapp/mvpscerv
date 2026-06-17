import React, { useContext, useEffect, useMemo, useState } from "react";
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { getRestaurantExperienceConfig } from "../../utils/restaurantExperience";

const THRESHOLD_OPTIONS = [
	{ key: "visits", label: "Visits" },
	{ key: "spend", label: "Spend" },
	{ key: "points", label: "Club points" },
];

const REWARD_OPTIONS = [
	{ key: "perk", label: "Perk" },
	{ key: "discount_percent", label: "% off" },
	{ key: "discount_amount", label: "$ off" },
	{ key: "free_item", label: "Free item" },
	{ key: "vip_access", label: "VIP" },
];

const newTier = (index = 0) => ({
	id: `tier_${Date.now()}_${index}`,
	name: index === 0 ? "Regular" : `Tier ${index + 1}`,
	thresholdType: "visits",
	thresholdValue: index === 0 ? "5" : "10",
	rewardType: "perk",
	rewardValue: "",
	rewardLabel: index === 0 ? "Priority welcome" : "Chef-selected perk",
});

const normalizeProgramForState = (program = {}, restaurantName = "Restaurant") => ({
	enabled: program.enabled === true,
	name: program.name || `${restaurantName} Club`,
	pointsPerDollar: String(program.pointsPerDollar || 1),
	tiers:
		Array.isArray(program.tiers) && program.tiers.length > 0
			? program.tiers.map((tier, index) => ({
					id: tier.id || `tier_${index + 1}`,
					name: tier.name || `Tier ${index + 1}`,
					thresholdType: tier.thresholdType || "visits",
					thresholdValue: String(tier.thresholdValue || ""),
					rewardType: tier.rewardType || "perk",
					rewardValue: tier.rewardValue ? String(tier.rewardValue) : "",
					rewardLabel: tier.rewardLabel || "",
				}))
			: [newTier(0), newTier(1)],
});

const RestaurantRewardsScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;

	const [program, setProgram] = useState(() =>
		normalizeProgramForState({}, currentUserData?.restaurantName),
	);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isRewardsAllowed, setIsRewardsAllowed] = useState(true);

	useEffect(() => {
		if (!restaurantId) return undefined;

		const unsubscribe = db
			.collection("restaurants")
			.doc(restaurantId)
			.onSnapshot(
				(doc) => {
					if (!doc.exists) {
						setIsLoading(false);
						return;
					}

					const restaurant = doc.data() || {};
					const experienceConfig = getRestaurantExperienceConfig(restaurant);
					const rewardsAllowed = experienceConfig.isFeatureAllowed("loyaltyClub");
					setIsRewardsAllowed(rewardsAllowed);
					setProgram(
						normalizeProgramForState(
							restaurant.loyaltyProgram || restaurant.rewardsProgram || {},
							restaurant.restaurantName || currentUserData?.restaurantName,
						),
					);
					setIsLoading(false);
				},
				(error) => {
					console.error("Error loading rewards program:", error);
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [currentUserData?.restaurantName, restaurantId]);

	const previewTiers = useMemo(() => {
		return program.tiers
			.map((tier) => ({
				...tier,
				thresholdValue: Number(tier.thresholdValue || 0),
			}))
			.filter((tier) => tier.name && tier.thresholdValue > 0)
			.sort((a, b) => a.thresholdValue - b.thresholdValue);
	}, [program.tiers]);

	const updateProgram = (patch) => {
		setProgram((prev) => ({ ...prev, ...patch }));
	};

	const updateTier = (tierId, patch) => {
		setProgram((prev) => ({
			...prev,
			tiers: prev.tiers.map((tier) =>
				tier.id === tierId ? { ...tier, ...patch } : tier,
			),
		}));
	};

	const addTier = () => {
		setProgram((prev) => ({
			...prev,
			tiers: [...prev.tiers, newTier(prev.tiers.length)],
		}));
	};

	const removeTier = (tierId) => {
		setProgram((prev) => ({
			...prev,
			tiers: prev.tiers.filter((tier) => tier.id !== tierId),
		}));
	};

	const handleSave = async () => {
		if (!restaurantId) return;
		if (program.enabled && !isRewardsAllowed) {
			Alert.alert(
				"Feature locked",
				"Rewards are not enabled for this restaurant plan.",
			);
			return;
		}

		setIsSaving(true);
		try {
			const saveProgram = httpsCallable(functions, "saveRestaurantLoyaltyProgram");
			await saveProgram({
				restaurantId,
				program: {
					enabled: isRewardsAllowed && program.enabled,
					name: program.name,
					pointsPerDollar: Number(program.pointsPerDollar || 0),
					tiers: program.tiers.map((tier) => ({
						...tier,
						thresholdValue: Number(tier.thresholdValue || 0),
					})),
				},
			});
			Alert.alert("Saved", "Restaurant rewards updated.");
		} catch (error) {
			console.error("Error saving rewards program:", error);
			Alert.alert("Could not save", error.message || "Please try again.");
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.centered}>
					<ActivityIndicator color={colors.primary} />
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView
				style={styles.container}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.heroBand}>
					<View style={styles.heroIcon}>
						<MaterialCommunityIcons
							name="star-four-points-outline"
							size={26}
							color={colors.primary}
						/>
					</View>
					<View style={styles.heroText}>
						<Text style={styles.eyebrow}>Scerv Hospitality</Text>
						<Text style={styles.title}>Rewards</Text>
						<Text style={styles.subtitle}>
							Scerv points grow everywhere. This restaurant club creates the
							local perks guests come back for.
						</Text>
					</View>
				</View>

				{!isRewardsAllowed ? (
					<View style={styles.lockedPanel}>
						<MaterialCommunityIcons
							name="lock-outline"
							size={20}
							color={colors.statusDanger}
						/>
						<Text style={styles.lockedText}>
							Rewards are locked by the current Scerv plan.
						</Text>
					</View>
				) : null}

				<View style={styles.panel}>
					<View style={styles.panelHeader}>
						<View>
							<Text style={styles.panelTitle}>Restaurant club</Text>
							<Text style={styles.panelSubtitle}>Custom tiers and thresholds.</Text>
						</View>
						<Switch
							value={isRewardsAllowed && program.enabled}
							onValueChange={(enabled) => updateProgram({ enabled })}
							disabled={!isRewardsAllowed}
						/>
					</View>

					<Text style={styles.label}>Club name</Text>
					<TextInput
						style={styles.input}
						value={program.name}
						onChangeText={(name) => updateProgram({ name })}
						placeholder="Restaurant Club"
						placeholderTextColor={colors.textMedium}
					/>

					<Text style={styles.label}>Club points per dollar</Text>
					<TextInput
						style={styles.input}
						value={program.pointsPerDollar}
						onChangeText={(pointsPerDollar) => updateProgram({ pointsPerDollar })}
						keyboardType="decimal-pad"
						placeholder="1"
						placeholderTextColor={colors.textMedium}
					/>
				</View>

				<View style={styles.panel}>
					<View style={styles.panelHeader}>
						<View>
							<Text style={styles.panelTitle}>Tiers</Text>
							<Text style={styles.panelSubtitle}>
								Visits, spend, or club-point milestones.
							</Text>
						</View>
						<TouchableOpacity style={styles.iconButton} onPress={addTier}>
							<MaterialCommunityIcons name="plus" size={20} color="#fff" />
						</TouchableOpacity>
					</View>

					{program.tiers.map((tier, index) => (
						<View key={tier.id} style={styles.tierBlock}>
							<View style={styles.tierHeader}>
								<Text style={styles.tierTitle}>Tier {index + 1}</Text>
								{program.tiers.length > 1 ? (
									<TouchableOpacity onPress={() => removeTier(tier.id)}>
										<MaterialCommunityIcons
											name="trash-can-outline"
											size={20}
											color={colors.statusDanger}
										/>
									</TouchableOpacity>
								) : null}
							</View>

							<Text style={styles.label}>Tier name</Text>
							<TextInput
								style={styles.input}
								value={tier.name}
								onChangeText={(name) => updateTier(tier.id, { name })}
								placeholder="Gold"
								placeholderTextColor={colors.textMedium}
							/>

							<Text style={styles.label}>Threshold</Text>
							<View style={styles.segmentRow}>
								{THRESHOLD_OPTIONS.map((option) => (
									<TouchableOpacity
										key={option.key}
										style={[
											styles.segment,
											tier.thresholdType === option.key && styles.segmentActive,
										]}
										onPress={() =>
											updateTier(tier.id, { thresholdType: option.key })
										}
									>
										<Text
											style={[
												styles.segmentText,
												tier.thresholdType === option.key &&
													styles.segmentTextActive,
											]}
										>
											{option.label}
										</Text>
									</TouchableOpacity>
								))}
							</View>
							<TextInput
								style={styles.input}
								value={tier.thresholdValue}
								onChangeText={(thresholdValue) =>
									updateTier(tier.id, { thresholdValue })
								}
								keyboardType="number-pad"
								placeholder="10"
								placeholderTextColor={colors.textMedium}
							/>

							<Text style={styles.label}>Reward type</Text>
							<View style={styles.segmentRow}>
								{REWARD_OPTIONS.map((option) => (
									<TouchableOpacity
										key={option.key}
										style={[
											styles.segment,
											tier.rewardType === option.key && styles.segmentActive,
										]}
										onPress={() => updateTier(tier.id, { rewardType: option.key })}
									>
										<Text
											style={[
												styles.segmentText,
												tier.rewardType === option.key && styles.segmentTextActive,
											]}
										>
											{option.label}
										</Text>
									</TouchableOpacity>
								))}
							</View>

							<Text style={styles.label}>Guest-facing reward</Text>
							<TextInput
								style={styles.input}
								value={tier.rewardLabel}
								onChangeText={(rewardLabel) =>
									updateTier(tier.id, { rewardLabel })
								}
								placeholder="Complimentary dessert"
								placeholderTextColor={colors.textMedium}
							/>
						</View>
					))}
				</View>

				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Guest journey preview</Text>
					{previewTiers.map((tier) => (
						<View key={`preview_${tier.id}`} style={styles.previewRow}>
							<View style={styles.previewDot} />
							<View style={styles.previewTextWrap}>
								<Text style={styles.previewTitle}>{tier.name}</Text>
								<Text style={styles.previewText}>
									Unlocks at {tier.thresholdValue} {tier.thresholdType}:{" "}
									{tier.rewardLabel || "restaurant perk"}
								</Text>
							</View>
						</View>
					))}
				</View>

				<TouchableOpacity
					style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
					onPress={handleSave}
					disabled={isSaving}
				>
					{isSaving ? (
						<ActivityIndicator color="#fff" />
					) : (
						<>
							<MaterialCommunityIcons name="content-save" size={19} color="#fff" />
							<Text style={styles.saveButtonText}>Save rewards</Text>
						</>
					)}
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	content: { padding: 16, paddingBottom: 34 },
	centered: { flex: 1, alignItems: "center", justifyContent: "center" },
	heroBand: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 14,
	},
	heroIcon: {
		width: 52,
		height: 52,
		borderRadius: 8,
		backgroundColor: "#eef6ff",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 12,
	},
	heroText: { flex: 1 },
	eyebrow: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
		textTransform: "uppercase",
		marginBottom: 3,
	},
	title: { fontSize: 24, fontWeight: "900", color: colors.textDark },
	subtitle: {
		fontSize: 13,
		color: colors.textMedium,
		lineHeight: 18,
		marginTop: 4,
	},
	lockedPanel: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#fff5f5",
		borderWidth: 1,
		borderColor: "#fecaca",
		borderRadius: 8,
		padding: 12,
		marginBottom: 14,
	},
	lockedText: {
		color: colors.statusDanger,
		fontWeight: "800",
		marginLeft: 8,
		flex: 1,
	},
	panel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 14,
	},
	panelHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	panelTitle: { fontSize: 17, fontWeight: "900", color: colors.textDark },
	panelSubtitle: { fontSize: 12, color: colors.textMedium, marginTop: 2 },
	label: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textDark,
		marginBottom: 6,
		marginTop: 10,
	},
	input: {
		minHeight: 46,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		color: colors.textDark,
		paddingHorizontal: 10,
		fontWeight: "700",
	},
	iconButton: {
		width: 38,
		height: 38,
		borderRadius: 8,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	tierBlock: {
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 12,
		marginTop: 10,
	},
	tierHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	tierTitle: { fontSize: 15, fontWeight: "900", color: colors.textDark },
	segmentRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: 8,
	},
	segment: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 8,
		marginRight: 7,
		marginBottom: 7,
	},
	segmentActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	segmentText: { color: colors.textDark, fontWeight: "800", fontSize: 12 },
	segmentTextActive: { color: "#fff" },
	previewRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginTop: 12,
	},
	previewDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: colors.primary,
		marginTop: 5,
		marginRight: 10,
	},
	previewTextWrap: { flex: 1 },
	previewTitle: { fontSize: 14, fontWeight: "900", color: colors.textDark },
	previewText: { color: colors.textMedium, fontSize: 12, marginTop: 2 },
	saveButton: {
		minHeight: 52,
		borderRadius: 8,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
	},
	saveButtonDisabled: { opacity: 0.75 },
	saveButtonText: {
		color: "#fff",
		fontWeight: "900",
		marginLeft: 8,
	},
});

export default RestaurantRewardsScreen;
