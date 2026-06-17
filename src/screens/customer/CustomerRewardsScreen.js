import React, { useContext, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";

const SCERV_LEVELS = [
	{ name: "First Taste", threshold: 0 },
	{ name: "Regular", threshold: 1000 },
	{ name: "Insider", threshold: 5000 },
	{ name: "Host Favorite", threshold: 15000 },
	{ name: "Hospitality Elite", threshold: 50000 },
];

const WALLET_BADGES = [
	{
		id: "first_points",
		label: "First Earn",
		icon: "creation-outline",
		isUnlocked: ({ lifetimePoints }) => lifetimePoints > 0,
	},
	{
		id: "club_collector",
		label: "Club Collector",
		icon: "storefront-outline",
		isUnlocked: ({ clubs }) => clubs.length >= 3,
	},
	{
		id: "perk_hunter",
		label: "Perk Hunter",
		icon: "ticket-percent-outline",
		isUnlocked: ({ unlockedCount }) => unlockedCount >= 3,
	},
	{
		id: "regular",
		label: "Regular",
		icon: "account-star-outline",
		isUnlocked: ({ lifetimePoints }) => lifetimePoints >= 1000,
	},
];

const DEFAULT_REWARD_RULES = [
	{
		id: "first_food_credit",
		title: "First food credit",
		description: "Earn credits from Scerv campaigns and partner restaurants.",
		icon: "food-variant",
		criteria: { metric: "foodCreditCents", operator: "gte", value: 1 },
		rewardLabel: "Food credit available",
	},
	{
		id: "restaurant_regular",
		title: "Restaurant regular",
		description: "Build loyalty at participating restaurants.",
		icon: "storefront-outline",
		criteria: { metric: "clubCount", operator: "gte", value: 1 },
		rewardLabel: "Club progress active",
	},
];

const METRIC_LABELS = {
	availablePoints: "Scerv points",
	lifetimePoints: "lifetime points",
	clubCount: "restaurant clubs",
	unlockedPerkCount: "perks",
	foodCreditCents: "food credits",
};

const getRewardsPoints = (summary = {}) =>
	Number(
		summary?.scervAvailablePoints ??
			summary?.availablePoints ??
			summary?.scervAvaialablePoints ??
			0,
	);

const getLifetimePoints = (summary = {}) =>
	Number(
		summary?.scervLifetimeEarnedPoints ??
			summary?.lifetimeEarnedPoints ??
			getRewardsPoints(summary),
	);

const getFoodCreditCents = (summary = {}) =>
	Number(
		summary?.foodCreditCents ??
			summary?.scervFoodCreditCents ??
			summary?.availableFoodCreditCents ??
			0,
	);

const formatCurrency = (cents = 0) =>
	`$${(Math.max(0, Number(cents || 0)) / 100).toFixed(2)}`;

const normalizeAdminRewardDefinition = (doc) => {
	const data = doc.data() || {};
	return {
		id: doc.id,
		title: data.title || data.label || data.name || "Scerv reward",
		label: data.label || data.title || data.name || "Scerv reward",
		description: data.description || data.subtitle || "",
		icon: data.icon || data.iconName || "gift-outline",
		sortOrder: Number(data.sortOrder || data.order || 999),
		criteria: data.criteria || {
			metric: data.metric || data.thresholdMetric || data.thresholdType,
			operator: data.operator || "gte",
			value: data.value ?? data.thresholdValue,
		},
		rewardLabel: data.rewardLabel || data.rewardName || data.label || "",
		isVisible: data.isVisible !== false,
	};
};

const getMetricValue = (metrics, metric) => {
	const normalized = String(metric || "").trim();
	if (normalized === "scervAvailablePoints") return metrics.availablePoints;
	if (normalized === "scervLifetimePoints") return metrics.lifetimePoints;
	if (normalized === "clubs") return metrics.clubCount;
	if (normalized === "perks") return metrics.unlockedPerkCount;
	if (normalized === "foodCredits") return metrics.foodCreditCents;
	return Number(metrics[normalized] || 0);
};

const evaluateCriteria = (criteria = {}, metrics = {}) => {
	const metric = criteria.metric || criteria.type || "lifetimePoints";
	const operator = criteria.operator || "gte";
	const targetValue = Number(criteria.value ?? criteria.threshold ?? 0);
	const currentValue = getMetricValue(metrics, metric);

	if (operator === "gt") return currentValue > targetValue;
	if (operator === "eq") return currentValue === targetValue;
	if (operator === "lt") return currentValue < targetValue;
	if (operator === "lte") return currentValue <= targetValue;
	return currentValue >= targetValue;
};

const getRuleProgress = (criteria = {}, metrics = {}) => {
	const metric = criteria.metric || criteria.type || "lifetimePoints";
	const targetValue = Math.max(0, Number(criteria.value ?? criteria.threshold ?? 0));
	const currentValue = Math.max(0, getMetricValue(metrics, metric));
	const progress = targetValue > 0 ? currentValue / targetValue : 1;
	return {
		currentValue,
		targetValue,
		progress: Math.max(0, Math.min(progress, 1)),
		metric,
	};
};

const formatRuleProgress = ({ currentValue, targetValue, metric }) => {
	const label = METRIC_LABELS[metric] || "progress";
	if (metric === "foodCreditCents") {
		return `${formatCurrency(currentValue)} / ${formatCurrency(targetValue)} ${label}`;
	}
	return `${Math.floor(currentValue).toLocaleString()} / ${Math.floor(targetValue).toLocaleString()} ${label}`;
};

const getLevelProgress = (points) => {
	const currentIndex = SCERV_LEVELS.reduce((levelIndex, level, index) => {
		return points >= level.threshold ? index : levelIndex;
	}, 0);
	const currentLevel = SCERV_LEVELS[currentIndex];
	const nextLevel = SCERV_LEVELS[currentIndex + 1] || null;
	if (!nextLevel) {
		return {
			currentLevel,
			nextLevel: null,
			progress: 1,
			pointsToNext: 0,
		};
	}

	const span = nextLevel.threshold - currentLevel.threshold;
	const progress = span > 0 ? (points - currentLevel.threshold) / span : 0;
	return {
		currentLevel,
		nextLevel,
		progress: Math.max(0, Math.min(progress, 1)),
		pointsToNext: Math.max(0, nextLevel.threshold - points),
	};
};

const formatTimestamp = (value) => {
	if (!value || typeof value.toDate !== "function") return "";
	return value.toDate().toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
};

const thresholdLabel = (club) => {
	if (club.currentTierName) return club.currentTierName;
	if (Number(club.visitCount || 0) > 0) return `${club.visitCount} visits`;
	return "New club";
};

const getClubProgress = (club) => {
	const rewards = Array.isArray(club.unlockedRewards)
		? club.unlockedRewards
		: [];
	const visits = Number(club.visitCount || 0);
	const clubPoints = Number(club.clubPoints || 0);
	const spend = Number(club.lifetimeSpend || 0) / 100;
	return {
		rewards,
		visits,
		clubPoints,
		spend,
	};
};

const getNextTierCopy = (club) => {
	const next = club.nextTierProgress || {};
	if (!next.tierName || !next.thresholdValue) return null;
	const currentValue = Number(next.currentValue || 0);
	const thresholdValue = Number(next.thresholdValue || 0);
	const remainingValue = Math.max(0, Number(next.remainingValue || 0));
	const progress = thresholdValue > 0 ? currentValue / thresholdValue : 0;
	const unit =
		next.thresholdType === "spend"
			? "spend"
			: next.thresholdType === "points"
				? "club points"
				: "visits";
	const remainingLabel =
		next.thresholdType === "spend"
			? `$${remainingValue.toFixed(0)}`
			: remainingValue.toLocaleString();

	return {
		tierName: next.tierName,
		rewardLabel: next.rewardLabel,
		progress: Math.max(0, Math.min(progress, 1)),
		copy: `${remainingLabel} ${unit} to ${next.tierName}`,
	};
};

const getPromotionLabel = (promotion = {}) => {
	if (promotion.title) return promotion.title;
	if (promotion.promotionType === "discount_percent") {
		const percent = Number(promotion.promotionValue || promotion.value || 0);
		const maxCents = Number(promotion.maxDiscountCents || 0);
		return `${percent}% off${maxCents > 0 ? ` up to $${(maxCents / 100).toFixed(0)}` : ""}`;
	}
	if (promotion.promotionType === "free_item") {
		return promotion.itemLabel || "Free item";
	}
	return promotion.rewardLabel || "Scerv promotion";
};

const isPromotionAvailable = (promotion = {}) =>
	!promotion.status || promotion.status === "available";

const ProgressBar = ({ progress, trackColor = "#dbeafe", fillColor = colors.primary }) => (
	<View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
		<View
			style={[
				styles.progressFill,
				{ backgroundColor: fillColor, width: `${Math.round(progress * 100)}%` },
			]}
		/>
	</View>
);

const StatPill = ({ icon, label, value }) => (
	<View style={styles.statPill}>
		<MaterialCommunityIcons name={icon} size={17} color={colors.primary} />
		<View style={styles.statTextWrap}>
			<Text style={styles.statValue}>{value}</Text>
			<Text style={styles.statLabel}>{label}</Text>
		</View>
	</View>
);

const WalletBadge = ({ badge, unlocked }) => (
	<View style={[styles.badgeChip, !unlocked && styles.badgeChipLocked]}>
		<Ionicons
			name={badge.icon || "sparkles-outline"}
			size={17}
			color={unlocked ? colors.primary : colors.textMedium}
		/>
		<Text style={[styles.badgeChipText, !unlocked && styles.badgeChipTextLocked]}>
			{badge.label}
		</Text>
	</View>
);

const CustomerRewardsScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const customerId = currentUserData?.uid;
	const [summary, setSummary] = useState(null);
	const [clubs, setClubs] = useState([]);
	const [promotions, setPromotions] = useState([]);
	const [ledger, setLedger] = useState([]);
	const [adminBadges, setAdminBadges] = useState([]);
	const [adminRewardRules, setAdminRewardRules] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!customerId) return undefined;

		const unsubscribers = [];
		const customerUnsub = db
			.collection("customers")
			.doc(customerId)
			.onSnapshot(
				(doc) => {
					setSummary(doc.exists ? doc.data()?.rewardsSummary || {} : {});
					setIsLoading(false);
				},
				(error) => {
					console.error("Error loading rewards summary:", error);
					setIsLoading(false);
				},
			);
		unsubscribers.push(customerUnsub);

		const clubsUnsub = db
			.collection("customers")
			.doc(customerId)
			.collection("restaurantClubs")
			.onSnapshot(
				(snapshot) => {
					setClubs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
				},
				(error) => console.error("Error loading restaurant clubs:", error),
			);
		unsubscribers.push(clubsUnsub);

		const promotionsUnsub = db
			.collection("customers")
			.doc(customerId)
			.collection("promotions")
			.onSnapshot(
				(snapshot) => {
					setPromotions(
						snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
					);
				},
				(error) => console.error("Error loading promotions:", error),
			);
		unsubscribers.push(promotionsUnsub);

		const ledgerUnsub = db
			.collection("customers")
			.doc(customerId)
			.collection("scervRewardsLedger")
			.limit(12)
			.onSnapshot(
				(snapshot) => {
					setLedger(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
				},
				(error) => console.error("Error loading rewards ledger:", error),
			);
		unsubscribers.push(ledgerUnsub);

		// Admin portal can publish new wallet badges here without app changes.
		const badgesUnsub = db
			.collection("scervWalletBadges")
			.where("isActive", "==", true)
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map(normalizeAdminRewardDefinition)
						.filter((badge) => badge.isVisible)
						.sort((a, b) => a.sortOrder - b.sortOrder);
					setAdminBadges(rows);
				},
				(error) => console.error("Error loading wallet badge rules:", error),
			);
		unsubscribers.push(badgesUnsub);

		// Scerv-level reward rules power "possible rewards" from the admin portal.
		const rewardRulesUnsub = db
			.collection("scervRewardRules")
			.where("isActive", "==", true)
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map(normalizeAdminRewardDefinition)
						.filter((rule) => rule.isVisible)
						.sort((a, b) => a.sortOrder - b.sortOrder);
					setAdminRewardRules(rows);
				},
				(error) => console.error("Error loading Scerv reward rules:", error),
			);
		unsubscribers.push(rewardRulesUnsub);

		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
	}, [customerId]);

	const points = getRewardsPoints(summary);
	const lifetimePoints = getLifetimePoints(summary);
	const foodCreditCents = getFoodCreditCents(summary);
	const level = useMemo(() => getLevelProgress(lifetimePoints), [lifetimePoints]);
	const unlockedCount = clubs.reduce((total, club) => {
		return total + getClubProgress(club).rewards.length;
	}, 0);
	const walletMetrics = {
		availablePoints: points,
		lifetimePoints,
		clubCount: clubs.length,
		unlockedPerkCount: unlockedCount,
		foodCreditCents,
	};
	const badgeDefinitions =
		adminBadges.length > 0 ? adminBadges : WALLET_BADGES;
	const rewardRules =
		adminRewardRules.length > 0 ? adminRewardRules : DEFAULT_REWARD_RULES;
	const badges = badgeDefinitions.map((badge) => ({
		...badge,
		unlocked:
			typeof badge.isUnlocked === "function"
				? badge.isUnlocked({ clubs, lifetimePoints, unlockedCount })
				: evaluateCriteria(badge.criteria, walletMetrics),
	}));
	const possibleRewards = rewardRules.map((rule) => ({
		...rule,
		progressInfo: getRuleProgress(rule.criteria, walletMetrics),
		unlocked: evaluateCriteria(rule.criteria, walletMetrics),
	}));
	const closestClubUnlock = clubs
		.map((club) => ({ club, next: getNextTierCopy(club) }))
		.filter((item) => item.next)
		.sort((a, b) => b.next.progress - a.next.progress)[0];
	const availablePromotions = promotions.filter(isPromotionAvailable);

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
				<View style={styles.hero}>
					<View style={styles.heroTopRow}>
						<View>
							<Text style={styles.eyebrow}>Scerv Wallet</Text>
							<Text style={styles.heroTitle}>{level.currentLevel.name}</Text>
						</View>
						<View style={styles.levelBadge}>
							<Text style={styles.levelBadgeText}>
								LVL {SCERV_LEVELS.indexOf(level.currentLevel) + 1}
							</Text>
						</View>
					</View>
					<Text style={styles.pointsValue}>{points.toLocaleString()}</Text>
					<Text style={styles.pointsLabel}>available Scerv points</Text>
					<ProgressBar progress={level.progress} />
					<Text style={styles.nextLevelText}>
						{level.nextLevel
							? `${level.pointsToNext.toLocaleString()} points to ${level.nextLevel.name}`
							: "Top Scerv hospitality status unlocked"}
					</Text>
				</View>

				<View style={styles.statsGrid}>
					<StatPill icon="star-four-points-outline" label="Lifetime" value={lifetimePoints.toLocaleString()} />
					<StatPill icon="storefront-outline" label="Clubs" value={clubs.length.toString()} />
					<StatPill
						icon="ticket-percent-outline"
						label="Perks"
						value={(unlockedCount + availablePromotions.length).toString()}
					/>
				</View>

				<View style={styles.valuePanel}>
					<View style={styles.valueCard}>
						<View style={styles.valueIcon}>
							<MaterialCommunityIcons
								name="food-variant"
								size={20}
								color={colors.primary}
							/>
						</View>
						<View style={styles.valueCopy}>
							<Text style={styles.valueLabel}>Food credits</Text>
							<Text style={styles.valueAmount}>
								{formatCurrency(foodCreditCents)}
							</Text>
						</View>
					</View>
				</View>

				<View style={styles.badgesPanel}>
					<View style={styles.panelHeaderRow}>
						<Text style={styles.sectionTitleInline}>Badges</Text>
						<Text style={styles.panelMeta}>
							{badges.filter((badge) => badge.unlocked).length}/{badges.length}
						</Text>
					</View>
					<View style={styles.badgeGrid}>
						{badges.map((badge) => (
							<WalletBadge
								key={badge.id}
								badge={badge}
								unlocked={badge.unlocked}
							/>
						))}
					</View>
				</View>

				<View style={styles.rulesPanel}>
					<View style={styles.panelHeaderRow}>
						<Text style={styles.sectionTitleInline}>Possible Rewards</Text>
						<Text style={styles.panelMeta}>
							{possibleRewards.filter((rule) => rule.unlocked).length}/
							{possibleRewards.length}
						</Text>
					</View>
					{possibleRewards.map((rule) => (
						<View key={rule.id} style={styles.ruleRow}>
							<View style={styles.ruleIcon}>
								<MaterialCommunityIcons
									name={rule.icon || "sparkles-outline"}
									size={18}
									color={rule.unlocked ? colors.statusSuccess : colors.primary}
								/>
							</View>
							<View style={styles.ruleTextWrap}>
								<View style={styles.ruleTitleRow}>
									<Text style={styles.ruleTitle}>
										{rule.title || rule.rewardLabel}
									</Text>
									<Text
										style={[
											styles.ruleStatus,
											rule.unlocked && styles.ruleStatusUnlocked,
										]}
									>
										{rule.unlocked ? "Ready" : "Progress"}
									</Text>
								</View>
								{rule.description ? (
									<Text style={styles.ruleDescription}>{rule.description}</Text>
								) : null}
								<Text style={styles.ruleProgressText}>
									{formatRuleProgress(rule.progressInfo)}
								</Text>
								<ProgressBar
									progress={rule.progressInfo.progress}
									fillColor={
										rule.unlocked ? colors.statusSuccess : colors.primary
									}
								/>
							</View>
						</View>
					))}
				</View>

				{closestClubUnlock ? (
					<View style={styles.nextUnlockPanel}>
						<View style={styles.nextUnlockIcon}>
							<Ionicons name="flash-outline" size={20} color={colors.primary} />
						</View>
						<View style={styles.nextUnlockTextWrap}>
							<Text style={styles.nextUnlockTitle}>Closest unlock</Text>
							<Text style={styles.nextUnlockText}>
								{closestClubUnlock.club.restaurantName || "Restaurant Club"}:{" "}
								{closestClubUnlock.next.copy}
							</Text>
							<ProgressBar progress={closestClubUnlock.next.progress} />
						</View>
					</View>
				) : null}

				{availablePromotions.length > 0 && (
					<>
						<Text style={styles.sectionTitle}>Promotions</Text>
						{availablePromotions.map((promotion) => (
							<View key={promotion.id} style={styles.promotionCard}>
								<View style={styles.promotionIcon}>
									<Ionicons
										name="ticket-outline"
										size={19}
										color={colors.primary}
									/>
								</View>
								<View style={styles.promotionTextWrap}>
									<Text style={styles.promotionTitle}>
										{getPromotionLabel(promotion)}
									</Text>
									<Text style={styles.promotionMeta}>
										{promotion.restaurantName ||
											(promotion.restaurantId === "global"
												? "Available at participating restaurants"
												: "Restaurant promotion")}
									</Text>
									{promotion.fundedBy ? (
										<Text style={styles.promotionFinePrint}>
											Funded by {promotion.fundedBy}
										</Text>
									) : null}
								</View>
							</View>
						))}
					</>
				)}

				<Text style={styles.sectionTitle}>Restaurant Clubs</Text>
				{clubs.length === 0 ? (
					<View style={styles.emptyPanel}>
						<MaterialCommunityIcons
							name="silverware-fork-knife"
							size={26}
							color={colors.primary}
						/>
						<Text style={styles.emptyTitle}>No club progress yet</Text>
						<Text style={styles.emptyText}>
							Order at participating restaurants to unlock local tiers and perks.
						</Text>
					</View>
				) : (
					clubs.map((club) => {
						const progress = getClubProgress(club);
						const nextTier = getNextTierCopy(club);
						return (
							<View key={club.id} style={styles.clubCard}>
								<View style={styles.clubHeader}>
									<View style={styles.clubMark}>
										<MaterialCommunityIcons
											name="storefront-outline"
											size={20}
											color={colors.primary}
										/>
									</View>
									<View style={styles.clubTitleWrap}>
										<Text style={styles.clubName}>
											{club.restaurantName || "Restaurant Club"}
										</Text>
										<Text style={styles.clubTier}>{thresholdLabel(club)}</Text>
									</View>
								</View>
								<View style={styles.clubStatsRow}>
									<Text style={styles.clubStat}>{progress.visits} visits</Text>
									<Text style={styles.clubStat}>
										{progress.clubPoints.toLocaleString()} club points
									</Text>
									<Text style={styles.clubStat}>${progress.spend.toFixed(0)} spend</Text>
								</View>
								{nextTier ? (
									<View style={styles.clubNextBox}>
										<View style={styles.clubNextHeader}>
											<Text style={styles.clubNextTitle}>Next unlock</Text>
											<Text style={styles.clubNextPercent}>
												{Math.round(nextTier.progress * 100)}%
											</Text>
										</View>
										<Text style={styles.clubNextText}>{nextTier.copy}</Text>
										<ProgressBar progress={nextTier.progress} />
										{nextTier.rewardLabel ? (
											<Text style={styles.clubRewardPreview}>
												Reward: {nextTier.rewardLabel}
											</Text>
										) : null}
									</View>
								) : (
									<View style={styles.clubCompleteBox}>
										<Ionicons
											name="checkmark-circle-outline"
											size={17}
											color={colors.statusSuccess}
										/>
										<Text style={styles.clubCompleteText}>
											Top club tier reached
										</Text>
									</View>
								)}
								{progress.rewards.length > 0 ? (
									<View style={styles.perkList}>
										{progress.rewards.slice(0, 3).map((reward) => (
											<View
												key={reward.id || reward.tierId || reward.rewardLabel}
												style={styles.perkRow}
											>
												<Ionicons
													name="sparkles-outline"
													size={16}
													color={colors.primary}
												/>
												<Text style={styles.perkText}>
													{reward.rewardLabel || reward.tierName}
												</Text>
											</View>
										))}
									</View>
								) : (
									<Text style={styles.clubHint}>
										Keep dining here to unlock this restaurant's first perk.
									</Text>
								)}
							</View>
						);
					})
				)}

				<Text style={styles.sectionTitle}>Recent Activity</Text>
				<View style={styles.activityPanel}>
					{ledger.length === 0 ? (
						<Text style={styles.emptyText}>Points activity will appear here.</Text>
					) : (
						ledger.map((entry) => (
							<View key={entry.id} style={styles.activityRow}>
								<View style={styles.activityIcon}>
									<MaterialCommunityIcons
										name="plus-circle-outline"
										size={18}
										color={colors.statusSuccess}
									/>
								</View>
								<View style={styles.activityTextWrap}>
									<Text style={styles.activityTitle}>
										{entry.restaurantName || "Scerv order"}
									</Text>
									<Text style={styles.activityDate}>
										{formatTimestamp(entry.createdAt)}
									</Text>
								</View>
								<Text style={styles.activityPoints}>
									+{Number(entry.points || 0).toLocaleString()}
								</Text>
							</View>
						))
					)}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	content: { padding: 16, paddingBottom: 34 },
	centered: { flex: 1, alignItems: "center", justifyContent: "center" },
	hero: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 18,
		marginBottom: 14,
	},
	heroTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	eyebrow: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
		textTransform: "uppercase",
	},
	heroTitle: {
		fontSize: 22,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 3,
	},
	levelBadge: {
		borderRadius: 8,
		backgroundColor: "#eef6ff",
		paddingHorizontal: 10,
		paddingVertical: 7,
	},
	levelBadgeText: { color: colors.primary, fontWeight: "900", fontSize: 12 },
	pointsValue: {
		fontSize: 42,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 18,
	},
	pointsLabel: { color: colors.textMedium, fontWeight: "800", marginBottom: 12 },
	nextLevelText: {
		color: colors.textMedium,
		fontWeight: "800",
		fontSize: 12,
		marginTop: 8,
	},
	progressTrack: {
		height: 11,
		borderRadius: 8,
		overflow: "hidden",
	},
	progressFill: { height: "100%", borderRadius: 8 },
	statsGrid: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 18,
	},
	statPill: {
		width: "32%",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 10,
		minHeight: 78,
	},
	statTextWrap: { marginTop: 8 },
	statValue: { color: colors.textDark, fontWeight: "900", fontSize: 16 },
	statLabel: { color: colors.textMedium, fontSize: 11, fontWeight: "800" },
	valuePanel: {
		marginBottom: 14,
	},
	valueCard: {
		width: "100%",
		minHeight: 86,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		padding: 12,
		flexDirection: "row",
		alignItems: "center",
	},
	valueIcon: {
		width: 38,
		height: 38,
		borderRadius: 8,
		backgroundColor: "#eef6ff",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	valueCopy: {
		flex: 1,
		minWidth: 0,
	},
	valueLabel: {
		color: colors.textMedium,
		fontSize: 11,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	valueAmount: {
		color: colors.textDark,
		fontSize: 18,
		fontWeight: "900",
		marginTop: 3,
	},
	badgesPanel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 14,
	},
	panelHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 10,
	},
	sectionTitleInline: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
	},
	panelMeta: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textMedium,
	},
	badgeGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
	},
	badgeChip: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#bfdbfe",
		backgroundColor: "#eef6ff",
		paddingHorizontal: 9,
		paddingVertical: 8,
		marginRight: 7,
		marginBottom: 7,
	},
	badgeChipLocked: {
		backgroundColor: colors.backgroundLight,
		borderColor: colors.borderLight,
	},
	badgeChipText: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: "900",
		marginLeft: 6,
	},
	badgeChipTextLocked: {
		color: colors.textMedium,
	},
	rulesPanel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 14,
	},
	ruleRow: {
		flexDirection: "row",
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 12,
		marginTop: 12,
	},
	ruleIcon: {
		width: 36,
		height: 36,
		borderRadius: 8,
		backgroundColor: "#eef6ff",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	ruleTextWrap: {
		flex: 1,
		minWidth: 0,
	},
	ruleTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	ruleTitle: {
		flex: 1,
		color: colors.textDark,
		fontSize: 14,
		fontWeight: "900",
		paddingRight: 8,
	},
	ruleStatus: {
		color: colors.primary,
		backgroundColor: "#eef6ff",
		borderRadius: 8,
		overflow: "hidden",
		paddingHorizontal: 8,
		paddingVertical: 4,
		fontSize: 10,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	ruleStatusUnlocked: {
		color: colors.statusSuccess,
		backgroundColor: "#ecfdf3",
	},
	ruleDescription: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "700",
		lineHeight: 17,
		marginBottom: 7,
	},
	ruleProgressText: {
		color: colors.textMedium,
		fontSize: 11,
		fontWeight: "900",
		marginBottom: 7,
	},
	nextUnlockPanel: {
		flexDirection: "row",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 16,
	},
	nextUnlockIcon: {
		width: 38,
		height: 38,
		borderRadius: 8,
		backgroundColor: "#eef6ff",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	nextUnlockTextWrap: { flex: 1 },
	nextUnlockTitle: {
		color: colors.textDark,
		fontSize: 14,
		fontWeight: "900",
	},
	nextUnlockText: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "800",
		marginTop: 2,
		marginBottom: 8,
	},
	promotionCard: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 13,
		marginBottom: 10,
	},
	promotionIcon: {
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: colors.primary + "12",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 11,
	},
	promotionTextWrap: { flex: 1 },
	promotionTitle: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
	},
	promotionMeta: {
		fontSize: 12,
		color: colors.textMedium,
		fontWeight: "700",
		marginTop: 3,
	},
	promotionFinePrint: {
		fontSize: 11,
		color: colors.textMedium,
		marginTop: 3,
	},
	sectionTitle: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
		marginBottom: 8,
		marginTop: 4,
	},
	emptyPanel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 18,
		alignItems: "center",
		marginBottom: 16,
	},
	emptyTitle: {
		color: colors.textDark,
		fontWeight: "900",
		fontSize: 16,
		marginTop: 10,
	},
	emptyText: {
		color: colors.textMedium,
		fontWeight: "700",
		fontSize: 13,
		textAlign: "center",
		marginTop: 5,
	},
	clubCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 12,
	},
	clubHeader: { flexDirection: "row", alignItems: "center" },
	clubMark: {
		width: 42,
		height: 42,
		borderRadius: 8,
		backgroundColor: "#eef6ff",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	clubTitleWrap: { flex: 1 },
	clubName: { color: colors.textDark, fontSize: 16, fontWeight: "900" },
	clubTier: { color: colors.textMedium, fontWeight: "800", marginTop: 2 },
	clubStatsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: 12,
	},
	clubStat: {
		color: colors.textDark,
		fontSize: 12,
		fontWeight: "800",
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		paddingHorizontal: 9,
		paddingVertical: 6,
		marginRight: 7,
		marginBottom: 7,
	},
	clubNextBox: {
		backgroundColor: "#f8fbff",
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#dbeafe",
		padding: 10,
		marginTop: 7,
	},
	clubNextHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	clubNextTitle: {
		color: colors.textDark,
		fontSize: 12,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	clubNextPercent: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: "900",
	},
	clubNextText: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "800",
		marginBottom: 8,
	},
	clubRewardPreview: {
		color: colors.textDark,
		fontSize: 12,
		fontWeight: "800",
		marginTop: 8,
	},
	clubCompleteBox: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#ecfdf3",
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 8,
		marginTop: 7,
	},
	clubCompleteText: {
		color: colors.statusSuccess,
		fontSize: 12,
		fontWeight: "900",
		marginLeft: 6,
	},
	perkList: { marginTop: 8 },
	perkRow: { flexDirection: "row", alignItems: "center", marginTop: 7 },
	perkText: { color: colors.textDark, fontWeight: "800", marginLeft: 7, flex: 1 },
	clubHint: {
		color: colors.textMedium,
		fontWeight: "700",
		fontSize: 12,
		marginTop: 10,
	},
	activityPanel: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
	},
	activityRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 9,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	activityIcon: { marginRight: 9 },
	activityTextWrap: { flex: 1 },
	activityTitle: { color: colors.textDark, fontWeight: "900" },
	activityDate: { color: colors.textMedium, fontSize: 12, marginTop: 2 },
	activityPoints: {
		color: colors.statusSuccess,
		fontWeight: "900",
		fontSize: 15,
	},
});

export default CustomerRewardsScreen;
