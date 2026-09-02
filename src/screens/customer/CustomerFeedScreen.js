import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Image,
	RefreshControl,
	SafeAreaView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { httpsCallable } from "@react-native-firebase/functions";

import { functions } from "../../config/firebase.native";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";
import { getDiscoveryDishLabel } from "../../utils/menuDisplay";

const FEED_FILTERS = [
	{ id: "all", label: "For You" },
	{ id: "taste_twin", label: "Taste Twins" },
	{ id: "pip", label: "Friends" },
	{ id: "influencer", label: "Featured" },
];

const getFeedTypeIcon = (type) => {
	if (type === "influencer") return "shield-checkmark";
	if (type === "pip") return "people";
	if (type === "you") return "person-circle";
	return "sparkles";
};

const getFeedTypeColor = (type) => {
	if (type === "influencer") return colors.secondary;
	if (type === "pip") return colors.primary;
	if (type === "you") return colors.statusInfo;
	return "#7C3AED";
};

const formatTimeAgo = (timestampMillis) => {
	const value = Number(timestampMillis || 0);
	if (!value) return "Recently";

	const minutes = Math.max(1, Math.floor((Date.now() - value) / 60000));
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;

	return "Recently";
};

const FeedCard = ({ item, onPressRestaurant }) => {
	const typeColor = getFeedTypeColor(item.type);
	const dishLabel =
		getDiscoveryDishLabel(item.menuItem || {}) || item.menuItem?.name || "dish";
	const restaurant = item.restaurant || {};
	const reviewText = String(item.reviewText || "").trim();
	const tags = Array.isArray(item.reviewTags) ? item.reviewTags : [];
	const rating = Number(item.ratingValue || 0);
	const imageUri = item.menuItem?.imageUri || "";

	return (
		<TouchableOpacity
			style={styles.feedCard}
			activeOpacity={0.86}
			onPress={() => onPressRestaurant(restaurant)}
		>
			<View style={styles.cardHeader}>
				<View style={[styles.typeIconWrap, { backgroundColor: `${typeColor}18` }]}>
					<Ionicons name={getFeedTypeIcon(item.type)} size={18} color={typeColor} />
				</View>
				<View style={styles.cardHeaderText}>
					<Text style={styles.authorLine} numberOfLines={1}>
						{item.authorName || "Scerv diner"}
					</Text>
					<Text style={styles.authorMeta} numberOfLines={1}>
						{item.authorLabel || "Food activity"} · {formatTimeAgo(item.timestampMillis)}
					</Text>
				</View>
				<View style={styles.ratingPill}>
					<Ionicons name="star" size={13} color="#B45309" />
					<Text style={styles.ratingPillText}>{rating ? rating.toFixed(1) : "New"}</Text>
				</View>
			</View>

			<View style={styles.cardBody}>
				{imageUri ? (
					<Image source={{ uri: imageUri }} style={styles.dishImage} />
				) : (
					<View style={styles.dishImagePlaceholder}>
						<MaterialCommunityIcons
							name="silverware-fork-knife"
							size={24}
							color={colors.primary}
						/>
					</View>
				)}
				<View style={styles.feedTextBlock}>
					<Text style={styles.feedHeadline} numberOfLines={2}>
						{item.type === "taste_twin"
							? `A Taste Twin loved ${dishLabel}`
							: `${item.authorName || "A diner"} rated ${dishLabel}`}
					</Text>
					<Text style={styles.restaurantLine} numberOfLines={1}>
						{restaurant.name || "Restaurant"}
						{restaurant.area ? ` · ${restaurant.area}` : ""}
					</Text>
					{reviewText ? (
						<Text style={styles.reviewText} numberOfLines={3}>
							"{reviewText}"
						</Text>
					) : (
						<Text style={styles.reviewText} numberOfLines={2}>
							A fresh pick from the Scerv dining community.
						</Text>
					)}
				</View>
			</View>

			{tags.length > 0 ? (
				<View style={styles.tagRow}>
					{tags.slice(0, 3).map((tag) => (
						<View key={tag} style={styles.tagChip}>
							<Text style={styles.tagText}>{tag}</Text>
						</View>
					))}
				</View>
			) : null}
		</TouchableOpacity>
	);
};

const EmptyFeed = ({ activeFilter, errorMessage }) => (
	<View style={styles.emptyState}>
		<View style={styles.emptyIcon}>
			<Ionicons
				name={errorMessage ? "alert-circle-outline" : "sparkles-outline"}
				size={28}
				color={colors.primary}
			/>
		</View>
		<Text style={styles.emptyTitle}>
			{errorMessage
				? "Feed could not load"
				: activeFilter === "taste_twin"
				? "Your Taste Twins are warming up"
				: "No feed activity yet"}
		</Text>
		<Text style={styles.emptyText}>
			{errorMessage ||
				"Rate dishes and add friends to make this feed feel more personal."}
		</Text>
	</View>
);

const CustomerFeedScreen = ({ navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const [feedItems, setFeedItems] = useState([]);
	const [activeFilter, setActiveFilter] = useState("all");
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [tasteTwinCount, setTasteTwinCount] = useState(0);
	const [hasPips, setHasPips] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	const filteredItems = useMemo(() => {
		if (activeFilter === "all") return feedItems;
		if (activeFilter === "pip") {
			return feedItems.filter((item) => item.type === "pip" || item.type === "you");
		}
		return feedItems.filter((item) => item.type === activeFilter);
	}, [activeFilter, feedItems]);

	const loadFeed = useCallback(
		async ({ refreshing = false } = {}) => {
			if (!currentUserData?.uid || currentUserData?.role === "guest") {
				setFeedItems([]);
				setIsLoading(false);
				return;
			}

			refreshing ? setIsRefreshing(true) : setIsLoading(true);
			setErrorMessage("");
			try {
				const savedRegion = await AsyncStorage.getItem("@scerv_region");
				const getFeed = httpsCallable(functions, "getScervFeed");
				const response = await getFeed({
					countryCode: savedRegion || "US",
					limit: 40,
				});
				setFeedItems(Array.isArray(response.data?.feedItems) ? response.data.feedItems : []);
				setTasteTwinCount(Number(response.data?.tasteTwinCount || 0));
				setHasPips(Boolean(response.data?.hasPips));
			} catch (error) {
				console.log("Error loading Scerv feed:", error);
				setErrorMessage(
					error?.message || "Pull to refresh and try loading the feed again.",
				);
				setFeedItems([]);
			} finally {
				setIsLoading(false);
				setIsRefreshing(false);
			}
		},
		[currentUserData?.role, currentUserData?.uid],
	);

	useEffect(() => {
		loadFeed();
	}, [loadFeed]);

	const openRestaurant = (restaurant) => {
		if (!restaurant?.id) return;
		navigation.navigate("RestaurantDetail", {
			restaurant: {
				id: restaurant.id,
				restaurantName: restaurant.name,
				name: restaurant.name,
				area: restaurant.area,
				city: restaurant.city,
				state: restaurant.state,
				cuisineType: restaurant.cuisineType,
			},
		});
	};

	if (isLoading) {
		return (
			<SafeAreaView style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>Loading your dining feed...</Text>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<FlatList
				data={filteredItems}
				keyExtractor={(item, index) => `${item.id || "feed"}_${index}`}
				renderItem={({ item }) => (
					<FeedCard item={item} onPressRestaurant={openRestaurant} />
				)}
				ListHeaderComponent={
					<View style={styles.header}>
						<Text style={styles.eyebrow}>Scerv Feed</Text>
						<Text style={styles.title}>Where good taste is going</Text>
						<Text style={styles.subtitle}>
							See favorites from friends, Taste Twins, and featured diners worth knowing.
						</Text>
						<View style={styles.signalRow}>
							<View style={styles.signalCard}>
								<Text style={styles.signalValue}>{tasteTwinCount}</Text>
								<Text style={styles.signalLabel}>Taste Twins</Text>
							</View>
							<View style={styles.signalCard}>
								<Text style={styles.signalValue}>{hasPips ? "On" : "Add"}</Text>
								<Text style={styles.signalLabel}>Friend activity</Text>
							</View>
						</View>
						<FlatList
							data={FEED_FILTERS}
							keyExtractor={(item) => item.id}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.filterRow}
							renderItem={({ item }) => {
								const isActive = activeFilter === item.id;
								return (
									<TouchableOpacity
										style={[styles.filterChip, isActive && styles.filterChipActive]}
										activeOpacity={0.78}
										onPress={() => setActiveFilter(item.id)}
									>
										<Text
											style={[
												styles.filterText,
												isActive && styles.filterTextActive,
											]}
										>
											{item.label}
										</Text>
									</TouchableOpacity>
								);
							}}
						/>
					</View>
				}
				ListEmptyComponent={
					<EmptyFeed activeFilter={activeFilter} errorMessage={errorMessage} />
				}
				contentContainerStyle={styles.listContent}
				refreshControl={
					<RefreshControl
						refreshing={isRefreshing}
						onRefresh={() => loadFeed({ refreshing: true })}
						tintColor={colors.primary}
					/>
				}
			/>
		</SafeAreaView>
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
		paddingHorizontal: 24,
	},
	loadingText: {
		marginTop: 12,
		fontSize: 14,
		fontWeight: "700",
		color: colors.textMedium,
	},
	listContent: {
		paddingBottom: 28,
	},
	header: {
		paddingHorizontal: 20,
		paddingTop: 18,
		paddingBottom: 12,
	},
	eyebrow: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.primary,
		textTransform: "uppercase",
	},
	title: {
		marginTop: 6,
		fontSize: 27,
		lineHeight: 33,
		fontWeight: "900",
		color: colors.textDark,
	},
	subtitle: {
		marginTop: 8,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: "700",
		color: colors.textMedium,
	},
	signalRow: {
		flexDirection: "row",
		gap: 10,
		marginTop: 16,
	},
	signalCard: {
		flex: 1,
		padding: 12,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	signalValue: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.textDark,
	},
	signalLabel: {
		marginTop: 2,
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
	},
	filterRow: {
		gap: 8,
		paddingTop: 16,
		paddingRight: 20,
	},
	filterChip: {
		paddingHorizontal: 14,
		paddingVertical: 9,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	filterChipActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	filterText: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textMedium,
	},
	filterTextActive: {
		color: colors.surfaceWhite,
	},
	feedCard: {
		marginHorizontal: 20,
		marginTop: 12,
		padding: 14,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: "#DDE7E9",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.06,
		shadowRadius: 7,
		elevation: 2,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
	},
	typeIconWrap: {
		width: 36,
		height: 36,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	cardHeaderText: {
		flex: 1,
		minWidth: 0,
		marginLeft: 10,
	},
	authorLine: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
	},
	authorMeta: {
		marginTop: 2,
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
	},
	ratingPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 9,
		paddingVertical: 6,
		borderRadius: 8,
		backgroundColor: "#FFF7ED",
	},
	ratingPillText: {
		fontSize: 12,
		fontWeight: "900",
		color: "#92400E",
	},
	cardBody: {
		flexDirection: "row",
		marginTop: 13,
	},
	dishImage: {
		width: 86,
		height: 86,
		borderRadius: 8,
		backgroundColor: colors.borderLight,
	},
	dishImagePlaceholder: {
		width: 86,
		height: 86,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF5F5",
	},
	feedTextBlock: {
		flex: 1,
		minWidth: 0,
		marginLeft: 12,
	},
	feedHeadline: {
		fontSize: 16,
		lineHeight: 20,
		fontWeight: "900",
		color: colors.textDark,
	},
	restaurantLine: {
		marginTop: 3,
		fontSize: 13,
		fontWeight: "800",
		color: colors.primary,
	},
	reviewText: {
		marginTop: 7,
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "700",
		color: colors.textMedium,
	},
	tagRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 12,
	},
	tagChip: {
		paddingHorizontal: 9,
		paddingVertical: 5,
		borderRadius: 8,
		backgroundColor: "#F1F5F9",
	},
	tagText: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.textMedium,
		textTransform: "capitalize",
	},
	emptyState: {
		alignItems: "center",
		paddingHorizontal: 30,
		paddingVertical: 54,
	},
	emptyIcon: {
		width: 58,
		height: 58,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF5F5",
	},
	emptyTitle: {
		marginTop: 16,
		fontSize: 20,
		fontWeight: "900",
		color: colors.textDark,
		textAlign: "center",
	},
	emptyText: {
		marginTop: 8,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: "700",
		color: colors.textMedium,
		textAlign: "center",
	},
});

export default CustomerFeedScreen;
