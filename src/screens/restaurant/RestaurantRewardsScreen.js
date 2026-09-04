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
	{ key: "points", label: "Reward points" },
];

const REWARD_OPTIONS = [
	{ key: "perk", label: "Perk" },
	{ key: "discount_percent", label: "% off" },
	{ key: "discount_amount", label: "$ off" },
	{ key: "free_item", label: "Free item" },
	{ key: "vip_access", label: "VIP" },
];

const AUTOMATIC_REWARD_TYPES = ["discount_percent", "discount_amount", "free_item"];

const parseCurrencyToCents = (value) => {
	const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return Math.round(parsed * 100);
};

const centsToDollarInput = (cents) => {
	const parsed = Number(cents || 0);
	if (!Number.isFinite(parsed) || parsed <= 0) return "";
	const dollars = parsed / 100;
	return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
};

const formatDollars = (value) => {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed) || parsed <= 0) return "$0";
	return `$${parsed % 1 === 0 ? parsed.toFixed(0) : parsed.toFixed(2)}`;
};

const toArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const newTier = (index = 0) => ({
	id: `tier_${Date.now()}_${index}`,
	name: index === 0 ? "Regular" : `Tier ${index + 1}`,
	thresholdType: "visits",
	thresholdValue: index === 0 ? "5" : "10",
	rewardType: "perk",
	rewardValue: "",
	rewardLabel: index === 0 ? "Priority welcome" : "Chef-selected perk",
	maxDiscountCents: "",
	redemptionMode: "staff",
	eligibleCategories: [],
	eligibleMenuItemIds: [],
	eligibleMenuItems: [],
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
					tierLevel: Number(tier.tierLevel || tier.sortOrder || index + 1),
					thresholdType: tier.thresholdType || "visits",
					thresholdValue:
						tier.thresholdType === "spend"
							? centsToDollarInput(tier.thresholdValue)
							: String(tier.thresholdValue || ""),
					rewardType: tier.rewardType || "perk",
					rewardValue: tier.rewardValue ? String(tier.rewardValue) : "",
					rewardLabel: tier.rewardLabel || "",
					maxDiscountCents: centsToDollarInput(
						tier.maxDiscountCents || tier.maxValueCents,
					),
					redemptionMode:
						tier.redemptionMode ||
						(AUTOMATIC_REWARD_TYPES.includes(tier.rewardType)
							? "automatic"
							: "staff"),
					eligibleCategories: toArray(tier.eligibleCategories),
					eligibleMenuItemIds: toArray(tier.eligibleMenuItemIds),
					eligibleMenuItems: toArray(tier.eligibleMenuItems),
				}))
			: [newTier(0), newTier(1)],
});

const buildRewardLabel = (tier) => {
	if (tier.rewardLabel) return tier.rewardLabel;
	if (tier.rewardType === "discount_percent") {
		const percent = Number(tier.rewardValue || 0);
		const cap = Number(tier.maxDiscountCents || 0);
		return `${percent || 0}% off${cap > 0 ? ` up to ${formatDollars(cap)}` : ""}`;
	}
	if (tier.rewardType === "discount_amount") {
		return `${formatDollars(tier.rewardValue)} off`;
	}
	if (tier.rewardType === "free_item") {
		const category = toArray(tier.eligibleCategories)[0];
		return category ? `Free ${category.toLowerCase()}` : "Free item";
	}
	if (tier.rewardType === "vip_access") return "VIP hospitality perk";
	return "Restaurant perk";
};

const buildTierPreview = (tier) => {
	const threshold =
		tier.thresholdType === "spend"
			? `${formatDollars(tier.thresholdValue)} spend`
			: `${tier.thresholdValue || 0} ${tier.thresholdType}`;
	const reward = buildRewardLabel(tier);
	const redemption =
		tier.redemptionMode === "automatic"
			? "Applies automatically at eligible checkout."
			: "Staff marks it redeemed for the guest.";
	return `Unlocks after ${threshold}: ${reward}. ${redemption}`;
};

const getRedemptionOptions = (rewardType) =>
	AUTOMATIC_REWARD_TYPES.includes(rewardType)
		? [
				{ key: "automatic", label: "Auto" },
				{ key: "staff", label: "Staff" },
			]
		: [{ key: "staff", label: "Staff" }];

const RestaurantRewardsScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;

	const [program, setProgram] = useState(() =>
		normalizeProgramForState({}, currentUserData?.restaurantName),
	);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isRewardsAllowed, setIsRewardsAllowed] = useState(true);
	const [menuItems, setMenuItems] = useState([]);

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

	useEffect(() => {
		if (!restaurantId) return undefined;

		const unsubscribe = db
			.collection("menuItems")
			.where("restaurantId", "==", restaurantId)
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.filter((item) => item.isArchived !== true)
						.sort((a, b) =>
							`${a.category || ""} ${a.name || a.dishName || ""}`.localeCompare(
								`${b.category || ""} ${b.name || b.dishName || ""}`,
							),
						);
					setMenuItems(rows);
				},
				(error) => console.error("Error loading reward menu items:", error),
			);

		return () => unsubscribe();
	}, [restaurantId]);

	const menuCategories = useMemo(() => {
		return [
			...new Set(
				menuItems
					.map((item) => String(item.category || "").trim())
					.filter(Boolean),
			),
		].sort((a, b) => a.localeCompare(b));
	}, [menuItems]);

	const previewTiers = useMemo(() => {
		return program.tiers
			.map((tier, index) => ({
				...tier,
				tierLevel: Number(tier.tierLevel || index + 1),
				thresholdValue: Number(tier.thresholdValue || 0),
			}))
			.filter((tier) => tier.name && tier.thresholdValue > 0);
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

	const updateTierRewardType = (tierId, rewardType) => {
		updateTier(tierId, {
			rewardType,
			redemptionMode: AUTOMATIC_REWARD_TYPES.includes(rewardType)
				? "automatic"
				: "staff",
			...(rewardType !== "free_item"
				? {
						eligibleCategories: [],
						eligibleMenuItemIds: [],
						eligibleMenuItems: [],
					}
				: {}),
		});
	};

	const toggleTierCategory = (tier, category) => {
		const current = toArray(tier.eligibleCategories);
		const exists = current.includes(category);
		updateTier(tier.id, {
			eligibleCategories: exists
				? current.filter((item) => item !== category)
				: [...current, category],
		});
	};

	const toggleTierMenuItem = (tier, menuItem) => {
		const currentIds = toArray(tier.eligibleMenuItemIds);
		const currentItems = toArray(tier.eligibleMenuItems);
		const exists = currentIds.includes(menuItem.id);
		updateTier(tier.id, {
			eligibleMenuItemIds: exists
				? currentIds.filter((id) => id !== menuItem.id)
				: [...currentIds, menuItem.id],
			eligibleMenuItems: exists
				? currentItems.filter((item) => item.id !== menuItem.id)
				: [
						...currentItems,
						{
							id: menuItem.id,
							name: menuItem.name || menuItem.dishName || "Menu item",
							category: menuItem.category || "",
							priceCents: Math.round(Number(menuItem.price || 0) * 100),
						},
					],
		});
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
			tiers: prev.tiers
				.filter((tier) => tier.id !== tierId)
				.map((tier, index) => ({ ...tier, tierLevel: index + 1 })),
		}));
	};

	const moveTier = (tierId, direction) => {
		setProgram((prev) => {
			const currentIndex = prev.tiers.findIndex((tier) => tier.id === tierId);
			const nextIndex = currentIndex + direction;
			if (currentIndex < 0 || nextIndex < 0 || nextIndex >= prev.tiers.length) {
				return prev;
			}

			const tiers = [...prev.tiers];
			const [movedTier] = tiers.splice(currentIndex, 1);
			tiers.splice(nextIndex, 0, movedTier);

			return {
				...prev,
				tiers: tiers.map((tier, index) => ({
					...tier,
					tierLevel: index + 1,
				})),
			};
		});
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
					tiers: program.tiers.map((tier, index) => ({
						...tier,
						tierLevel: index + 1,
						sortOrder: index + 1,
						thresholdValue:
							tier.thresholdType === "spend"
								? parseCurrencyToCents(tier.thresholdValue)
								: Number(tier.thresholdValue || 0),
						rewardValue:
							tier.rewardType === "discount_amount"
								? Number(tier.rewardValue || 0)
								: tier.rewardValue,
						rewardLabel: tier.rewardLabel || buildRewardLabel(tier),
						maxDiscountCents: parseCurrencyToCents(tier.maxDiscountCents),
						eligibleCategories: toArray(tier.eligibleCategories),
						eligibleMenuItemIds: toArray(tier.eligibleMenuItemIds),
						eligibleMenuItems: toArray(tier.eligibleMenuItems),
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
						<Text style={styles.eyebrow}>Guest loyalty</Text>
						<Text style={styles.title}>Rewards</Text>
						<Text style={styles.subtitle}>
							Set the rewards guests earn at this restaurant and decide what
							applies automatically at checkout.
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
							<Text style={styles.panelTitle}>Restaurant rewards</Text>
							<Text style={styles.panelSubtitle}>
								Build one clear loyalty ladder for this location.
							</Text>
						</View>
						<Switch
							value={isRewardsAllowed && program.enabled}
							onValueChange={(enabled) => updateProgram({ enabled })}
							disabled={!isRewardsAllowed}
						/>
					</View>

					<Text style={styles.label}>Program name</Text>
					<TextInput
						style={styles.input}
						value={program.name}
						onChangeText={(name) => updateProgram({ name })}
						placeholder="Restaurant Club"
						placeholderTextColor={colors.textMedium}
					/>

					<Text style={styles.label}>Reward points per dollar</Text>
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
								Guests hold one current status. Higher tiers replace lower tiers.
							</Text>
						</View>
						<TouchableOpacity style={styles.iconButton} onPress={addTier}>
							<MaterialCommunityIcons name="plus" size={20} color="#fff" />
						</TouchableOpacity>
					</View>

					{program.tiers.map((tier, index) => (
						<View key={tier.id} style={styles.tierBlock}>
							<View style={styles.tierHeader}>
								<View>
									<Text style={styles.tierTitle}>Status {index + 1}</Text>
									<Text style={styles.tierSubtitle}>
										This is part of one progressive ladder.
									</Text>
								</View>
								<View style={styles.tierActionRow}>
									<TouchableOpacity
										onPress={() => moveTier(tier.id, -1)}
										disabled={index === 0}
										style={[
											styles.tierIconButton,
											index === 0 && styles.tierIconButtonDisabled,
										]}
									>
										<MaterialCommunityIcons
											name="arrow-up"
											size={18}
											color={index === 0 ? colors.textLight : colors.textDark}
										/>
									</TouchableOpacity>
									<TouchableOpacity
										onPress={() => moveTier(tier.id, 1)}
										disabled={index === program.tiers.length - 1}
										style={[
											styles.tierIconButton,
											index === program.tiers.length - 1 &&
												styles.tierIconButtonDisabled,
										]}
									>
										<MaterialCommunityIcons
											name="arrow-down"
											size={18}
											color={
												index === program.tiers.length - 1
													? colors.textLight
													: colors.textDark
											}
										/>
									</TouchableOpacity>
									{program.tiers.length > 1 ? (
										<TouchableOpacity
											style={styles.tierIconButton}
											onPress={() => removeTier(tier.id)}
										>
											<MaterialCommunityIcons
												name="trash-can-outline"
												size={18}
												color={colors.statusDanger}
											/>
										</TouchableOpacity>
									) : null}
								</View>
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
								keyboardType={
									tier.thresholdType === "spend" ? "decimal-pad" : "number-pad"
								}
								placeholder={tier.thresholdType === "spend" ? "500" : "10"}
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
										onPress={() => updateTierRewardType(tier.id, option.key)}
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

							{tier.rewardType === "discount_percent" ? (
								<View style={styles.configGrid}>
									<View style={styles.configField}>
										<Text style={styles.label}>Percent off</Text>
										<TextInput
											style={styles.input}
											value={tier.rewardValue}
											onChangeText={(rewardValue) =>
												updateTier(tier.id, { rewardValue })
											}
											keyboardType="decimal-pad"
											placeholder="10"
											placeholderTextColor={colors.textMedium}
										/>
									</View>
									<View style={styles.configField}>
										<Text style={styles.label}>Max discount</Text>
										<TextInput
											style={styles.input}
											value={tier.maxDiscountCents}
											onChangeText={(maxDiscountCents) =>
												updateTier(tier.id, { maxDiscountCents })
											}
											keyboardType="decimal-pad"
											placeholder="10"
											placeholderTextColor={colors.textMedium}
										/>
									</View>
								</View>
							) : null}

							{tier.rewardType === "discount_amount" ? (
								<View>
									<Text style={styles.label}>Discount amount</Text>
									<TextInput
										style={styles.input}
										value={tier.rewardValue}
										onChangeText={(rewardValue) =>
											updateTier(tier.id, { rewardValue })
										}
										keyboardType="decimal-pad"
										placeholder="10"
										placeholderTextColor={colors.textMedium}
									/>
								</View>
							) : null}

							{tier.rewardType === "free_item" ? (
								<View style={styles.rewardConfigBox}>
									<Text style={styles.label}>Max free item value</Text>
									<TextInput
										style={styles.input}
										value={tier.maxDiscountCents}
										onChangeText={(maxDiscountCents) =>
											updateTier(tier.id, { maxDiscountCents })
										}
										keyboardType="decimal-pad"
										placeholder="12"
										placeholderTextColor={colors.textMedium}
									/>

									<Text style={styles.label}>Eligible categories</Text>
									<View style={styles.segmentRow}>
										{menuCategories.length === 0 ? (
											<Text style={styles.helperText}>
												Add menu items first, then choose eligible categories.
											</Text>
										) : (
											menuCategories.map((category) => (
												<TouchableOpacity
													key={`${tier.id}_${category}`}
													style={[
														styles.segment,
														toArray(tier.eligibleCategories).includes(
															category,
														) && styles.segmentActive,
													]}
													onPress={() => toggleTierCategory(tier, category)}
												>
													<Text
														style={[
															styles.segmentText,
															toArray(tier.eligibleCategories).includes(
																category,
															) && styles.segmentTextActive,
														]}
													>
														{category}
													</Text>
												</TouchableOpacity>
											))
										)}
									</View>

									{menuItems.length > 0 ? (
										<>
											<Text style={styles.label}>Eligible items</Text>
											<View style={styles.itemChipGrid}>
												{menuItems.slice(0, 20).map((menuItem) => {
													const selected = toArray(
														tier.eligibleMenuItemIds,
													).includes(menuItem.id);
													return (
														<TouchableOpacity
															key={`${tier.id}_${menuItem.id}`}
															style={[
																styles.itemChip,
																selected && styles.itemChipSelected,
															]}
															onPress={() =>
																toggleTierMenuItem(tier, menuItem)
															}
														>
															<Text
																style={[
																	styles.itemChipText,
																	selected && styles.itemChipTextSelected,
																]}
																numberOfLines={2}
															>
																{menuItem.name ||
																	menuItem.dishName ||
																	"Menu item"}
															</Text>
														</TouchableOpacity>
													);
												})}
											</View>
										</>
									) : null}
								</View>
							) : null}

							<Text style={styles.label}>Redemption</Text>
							<View style={styles.segmentRow}>
								{getRedemptionOptions(tier.rewardType).map((option) => (
									<TouchableOpacity
										key={`${tier.id}_${option.key}`}
										style={[
											styles.segment,
											tier.redemptionMode === option.key && styles.segmentActive,
										]}
										onPress={() =>
											updateTier(tier.id, { redemptionMode: option.key })
										}
									>
										<Text
											style={[
												styles.segmentText,
												tier.redemptionMode === option.key &&
													styles.segmentTextActive,
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
							<View style={styles.previewDot}>
								<Text style={styles.previewDotText}>{tier.tierLevel}</Text>
							</View>
							<View style={styles.previewTextWrap}>
								<Text style={styles.previewTitle}>{tier.name}</Text>
								<Text style={styles.previewText}>
									{buildTierPreview(tier)}
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
	configGrid: {
		flexDirection: "row",
		gap: 10,
	},
	configField: {
		flex: 1,
		minWidth: 0,
	},
	rewardConfigBox: {
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		padding: 10,
		marginTop: 6,
		marginBottom: 4,
	},
	helperText: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "700",
		lineHeight: 17,
		marginBottom: 8,
	},
	itemChipGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: 2,
	},
	itemChip: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		paddingHorizontal: 9,
		paddingVertical: 8,
		marginRight: 7,
		marginBottom: 7,
		maxWidth: "48%",
	},
	itemChipSelected: {
		borderColor: colors.primary,
		backgroundColor: colors.primary,
	},
	itemChipText: {
		color: colors.textDark,
		fontSize: 11,
		fontWeight: "800",
	},
	itemChipTextSelected: {
		color: "#fff",
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
	tierSubtitle: {
		color: colors.textMedium,
		fontSize: 11,
		fontWeight: "700",
		marginTop: 2,
		maxWidth: 190,
	},
	tierActionRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	tierIconButton: {
		width: 32,
		height: 32,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: 6,
	},
	tierIconButtonDisabled: {
		opacity: 0.45,
	},
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
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 1,
		marginRight: 10,
	},
	previewDotText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "900",
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
