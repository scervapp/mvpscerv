import React, { useContext, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	FlatList,
	Image,
	Modal,
	SafeAreaView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { httpsCallable } from "@react-native-firebase/functions";

import RestaurantCard from "../../components/customer/RestaurantCard";
import SelectedItemModal from "../../components/customer/SelectedItemModal";
import { db, functions } from "../../config/firebase.native";
import { AuthContext } from "../../context/authContext";
import { useDebounce } from "../../hooks/useBounce";
import colors from "../../utils/styles/appStyles";
import { NotificationBanner } from "../../utils/NotificationBanner";
import CompleteProfileScreen from "../auth/CompleteProfile";
import CustomSearchBar from "./CustomSearchBar";
import { getDiscoveryDishLabel } from "../../utils/menuDisplay";
import { getStoredScervScore } from "../../utils/discoveryScoring";

const { width: screenWidth } = Dimensions.get("window");

const SUPPORTED_REGIONS = [
	{ code: "US", label: "United States", name: "United States" },
	{ code: "PA", label: "Panama", name: "Panama" },
];

const DISCOVERY_INTENTS = [
	{ id: "all", label: "All", icon: "sparkles-outline", terms: [] },
	{
		id: "burgers",
		label: "Burgers",
		icon: "fast-food-outline",
		terms: ["burger", "burgers", "sandwich"],
	},
	{
		id: "pizza",
		label: "Pizza",
		icon: "pizza-outline",
		terms: ["pizza", "italian"],
	},
	{
		id: "sushi",
		label: "Sushi",
		icon: "fish-outline",
		terms: ["sushi", "japanese", "asian"],
	},
	{
		id: "tacos",
		label: "Tacos",
		icon: "restaurant-outline",
		terms: ["taco", "tacos", "mexican"],
	},
	{
		id: "coffee",
		label: "Coffee",
		icon: "cafe-outline",
		terms: ["coffee", "cafe", "breakfast", "brunch"],
	},
	{
		id: "dessert",
		label: "Dessert",
		icon: "ice-cream-outline",
		terms: ["dessert", "desserts", "bakery", "sweet"],
	},
];

const normalize = (value) => String(value || "").trim().toLowerCase();

const getRestaurantArea = (restaurant = {}) =>
	restaurant.area ||
	restaurant.neighborhood ||
	restaurant.district ||
	restaurant.city ||
	"";

const isMarketName = (value) => {
	const normalizedValue = normalize(value);
	return SUPPORTED_REGIONS.some(
		(region) =>
			normalize(region.name) === normalizedValue ||
			normalize(region.label) === normalizedValue ||
			normalize(region.code) === normalizedValue,
	);
};

const getRestaurantSearchText = (restaurant = {}) => {
	const tags = Array.isArray(restaurant.tags) ? restaurant.tags : [];
	const tokens = Array.isArray(restaurant.searchTokens)
		? restaurant.searchTokens
		: [];

	return [
		restaurant.restaurantName,
		restaurant.name,
		restaurant.cuisineType,
		restaurant.description,
		restaurant.address,
		restaurant.city,
		restaurant.state,
		restaurant.country,
		restaurant.area,
		restaurant.neighborhood,
		restaurant.district,
		...tags,
		...tokens,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
};

const getFoodRating = (menuItem = {}) => {
	const safeMenuItem = menuItem || {};
	const rating =
		safeMenuItem.averageRating ||
		safeMenuItem.rating ||
		safeMenuItem.customerRating;
	const parsed = Number(rating);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getRatingCount = (menuItem = {}) => {
	const safeMenuItem = menuItem || {};
	const count = Number(safeMenuItem.ratingCount || safeMenuItem.reviewCount || 0);
	return Number.isFinite(count) ? count : 0;
};

const showScervScoreInfo = () => {
	Alert.alert(
		"Scerv Score",
		"A refined dish ranking shaped by guest ratings, review depth, and trusted dining signals.",
	);
};

const compareDiscoveryItems = (a, b) => {
	const scoreDiff = getStoredScervScore(b) - getStoredScervScore(a);
	if (scoreDiff !== 0) return scoreDiff;

	const ratingDiff = (getFoodRating(b) || 0) - (getFoodRating(a) || 0);
	if (ratingDiff !== 0) return ratingDiff;

	return getRatingCount(b) - getRatingCount(a);
};

const getMenuItemSearchText = (menuItem = {}) => {
	const tags = Array.isArray(menuItem.tags) ? menuItem.tags : [];
	const tokens = Array.isArray(menuItem.searchTokens) ? menuItem.searchTokens : [];
	const searchKeywords = Array.isArray(menuItem.searchKeywords)
		? menuItem.searchKeywords
		: [];
	const dishTypeTags = Array.isArray(menuItem.dishTypeTags)
		? menuItem.dishTypeTags
		: [];
	const ingredientTags = Array.isArray(menuItem.ingredientTags)
		? menuItem.ingredientTags
		: [];
	const flavorTags = Array.isArray(menuItem.flavorTags)
		? menuItem.flavorTags
		: [];

	return [
		menuItem.name,
		menuItem.dishName,
		getDiscoveryDishLabel(menuItem),
		menuItem.category,
		menuItem.standardCategory,
		menuItem.description,
		menuItem.restaurantName,
		...tags,
		...tokens,
		...searchKeywords,
		...dishTypeTags,
		...ingredientTags,
		...flavorTags,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
};

const chunkArray = (items, size) => {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

const matchesTerms = (searchableText, terms = []) =>
	terms.length === 0 ||
	terms.some((term) => {
		const normalizedTerm = normalize(term);
		if (!normalizedTerm) return true;
		if (searchableText.includes(normalizedTerm)) return true;

		const tokens = normalizedTerm.split(/\s+/).filter(Boolean);
		return (
			tokens.length > 1 &&
			tokens.every((token) => searchableText.includes(token))
		);
	});

const SectionHeader = ({ title, subtitle }) => (
	<View style={styles.sectionHeader}>
		<Text style={styles.sectionTitle}>{title}</Text>
		{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
	</View>
);

const FilterChip = ({ icon, label, isActive, onPress }) => (
	<TouchableOpacity
		activeOpacity={0.75}
		style={[styles.filterChip, isActive && styles.filterChipActive]}
		onPress={onPress}
	>
		{icon ? (
			<Ionicons
				name={icon}
				size={16}
				color={isActive ? colors.surfaceWhite : colors.primary}
			/>
		) : null}
		<Text
			numberOfLines={1}
			style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
		>
			{label}
		</Text>
	</TouchableOpacity>
);

const FeaturedCard = ({ item, onPress }) => {
	const area = getRestaurantArea(item);
	const meta = [item.cuisineType, area].filter(Boolean).join(" - ");

	return (
		<TouchableOpacity
			activeOpacity={0.82}
			style={styles.featuredCard}
			onPress={onPress}
		>
			{item.imageUri ? (
				<Image source={{ uri: item.imageUri }} style={styles.featuredImage} />
			) : (
				<View style={styles.featuredImagePlaceholder}>
					<Ionicons name="restaurant-outline" size={34} color={colors.primary} />
				</View>
			)}
			<View style={styles.featuredScrim} />
			<View style={styles.featuredInfo}>
				<Text style={styles.featuredName} numberOfLines={1}>
					{item.restaurantName || item.name || "Restaurant"}
				</Text>
				<Text style={styles.featuredCuisine} numberOfLines={1}>
					{meta || "Open for discovery"}
				</Text>
			</View>
		</TouchableOpacity>
	);
};

const TopFoodCard = ({ item, restaurant, onPress }) => {
	const rating = getFoodRating(item);
	const ratingCount = getRatingCount(item);
	const scervScore = Math.round(getStoredScervScore(item));
	const imageUri = item.imageUri || item.image || restaurant?.imageUri;

	return (
		<TouchableOpacity
			activeOpacity={0.82}
			style={styles.foodCard}
			onPress={onPress}
		>
			{imageUri ? (
				<Image source={{ uri: imageUri }} style={styles.foodImage} />
			) : (
				<View style={styles.foodImagePlaceholder}>
					<Ionicons name="restaurant-outline" size={28} color={colors.primary} />
				</View>
			)}
			<View style={styles.foodInfo}>
				<Text style={styles.foodName} numberOfLines={2}>
					{getDiscoveryDishLabel(item)}
				</Text>
				<Text style={styles.foodRestaurant} numberOfLines={1}>
					{restaurant?.restaurantName || item.restaurantName || "Restaurant"}
				</Text>
				{rating ? (
					<View style={styles.foodRatingRow}>
						<Ionicons name="star" size={14} color="#B45309" />
						<Text style={styles.foodRatingText}>
							{rating.toFixed(1)}
							{ratingCount > 0 ? ` (${ratingCount})` : ""}
						</Text>
						{scervScore > 0 ? (
							<TouchableOpacity
								style={styles.scoreInfoChip}
								activeOpacity={0.75}
								onPress={(event) => {
									event?.stopPropagation?.();
									showScervScoreInfo();
								}}
							>
								<Text style={styles.scoreInfoText}>Scerv {scervScore}</Text>
								<Ionicons
									name="information-circle-outline"
									size={14}
									color={colors.primary}
								/>
							</TouchableOpacity>
						) : null}
					</View>
				) : (
					<Text style={styles.foodNoRating}>Newly listed</Text>
				)}
			</View>
		</TouchableOpacity>
	);
};

const TopFoodResultRow = ({ item, restaurant, rank, onPress }) => {
	const rating = getFoodRating(item);
	const ratingCount = getRatingCount(item);
	const reviewCount = Number(item.reviewCount || 0);
	const scervScore = Math.round(getStoredScervScore(item));
	const imageUri = item.imageUri || item.image || restaurant?.imageUri;
	const area = getRestaurantArea(restaurant);

	return (
		<TouchableOpacity
			activeOpacity={0.82}
			style={styles.discoveryResultRow}
			onPress={onPress}
		>
			<View style={styles.discoveryResultRank}>
				<Text style={styles.discoveryResultRankText}>{rank}</Text>
			</View>
			{imageUri ? (
				<Image source={{ uri: imageUri }} style={styles.discoveryResultImage} />
			) : (
				<View style={styles.discoveryResultImagePlaceholder}>
					<Ionicons name="restaurant-outline" size={22} color={colors.primary} />
				</View>
			)}
			<View style={styles.discoveryResultInfo}>
				<Text style={styles.discoveryResultDish} numberOfLines={1}>
					{item.name || item.dishName || getDiscoveryDishLabel(item)}
				</Text>
				<Text style={styles.discoveryResultRestaurant} numberOfLines={1}>
					{restaurant?.restaurantName || item.restaurantName || "Restaurant"}
				</Text>
				<Text style={styles.discoveryResultMeta} numberOfLines={1}>
					{[restaurant?.cuisineType, area].filter(Boolean).join(" - ") ||
						"Scerv discovery"}
				</Text>
				<View style={styles.discoveryResultSignalRow}>
					<Ionicons name="star" size={13} color="#B45309" />
					<Text style={styles.discoveryResultSignalText}>
						{rating ? rating.toFixed(1) : "New"}
						{ratingCount > 0 ? ` (${ratingCount})` : ""}
					</Text>
					{reviewCount > 0 ? (
						<Text style={styles.discoveryResultSignalText}>
							{reviewCount} review{reviewCount === 1 ? "" : "s"}
						</Text>
					) : null}
					{scervScore > 0 ? (
						<TouchableOpacity
							style={styles.discoveryScoreInfoChip}
							activeOpacity={0.75}
							onPress={(event) => {
								event?.stopPropagation?.();
								showScervScoreInfo();
							}}
						>
							<Text style={styles.discoveryScoreInfoText}>
								Scerv {scervScore}
							</Text>
							<Ionicons
								name="information-circle-outline"
								size={13}
								color={colors.primary}
							/>
						</TouchableOpacity>
					) : null}
				</View>
			</View>
			<Ionicons name="chevron-forward" size={20} color={colors.textLight} />
		</TouchableOpacity>
	);
};

const TasteMatchCard = ({ item, onPress }) => {
	const restaurant = item.restaurant || {};
	const rating = getFoodRating(item);
	const imageUri = item.imageUri || item.image || restaurant.imageUri;
	const reasons = Array.isArray(item.matchReasons) ? item.matchReasons : [];

	return (
		<TouchableOpacity
			activeOpacity={0.84}
			style={styles.tasteMatchCard}
			onPress={onPress}
		>
			{imageUri ? (
				<Image source={{ uri: imageUri }} style={styles.tasteMatchImage} />
			) : (
				<View style={styles.tasteMatchImagePlaceholder}>
					<Ionicons name="sparkles-outline" size={28} color={colors.primary} />
				</View>
			)}
			<View style={styles.tasteMatchInfo}>
				<View style={styles.tasteMatchBadge}>
					<Ionicons name="sparkles" size={12} color={colors.primary} />
					<Text style={styles.tasteMatchBadgeText}>Taste match</Text>
				</View>
				<Text style={styles.tasteMatchDish} numberOfLines={1}>
					{item.name || item.dishName || getDiscoveryDishLabel(item)}
				</Text>
				<Text style={styles.tasteMatchRestaurant} numberOfLines={1}>
					{restaurant.restaurantName || item.restaurantName || "Restaurant"}
				</Text>
				{rating ? (
					<Text style={styles.tasteMatchRating}>
						{rating.toFixed(1)} stars
					</Text>
				) : null}
				{reasons.length > 0 ? (
					<Text style={styles.tasteMatchReason} numberOfLines={1}>
						Because you liked {reasons.join(", ")}
					</Text>
				) : (
					<Text style={styles.tasteMatchReason} numberOfLines={1}>
						Based on your dish ratings
					</Text>
				)}
			</View>
		</TouchableOpacity>
	);
};

const CustomerDashboard = ({ navigation }) => {
	const { currentUserData } = useContext(AuthContext);

	const [searchText, setSearchText] = useState("");
	const [activeIntent, setActiveIntent] = useState("all");
	const [selectedArea, setSelectedArea] = useState("all");
	const [allRestaurants, setAllRestaurants] = useState([]);
	const [menuItems, setMenuItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isMenuLoading, setIsMenuLoading] = useState(false);
	const [isRegionLoading, setIsRegionLoading] = useState(true);
	const [forceGlobalView, setForceGlobalView] = useState(false);
	const [showRegionModal, setShowRegionModal] = useState(false);
	const [selectedRegion, setSelectedRegion] = useState(null);
	const [tasteRecommendations, setTasteRecommendations] = useState([]);
	const [isTasteLoading, setIsTasteLoading] = useState(false);
	const [selectedDiscoveryGroup, setSelectedDiscoveryGroup] = useState(null);
	const [selectedDiscoveryDish, setSelectedDiscoveryDish] = useState(null);

	const debouncedSearchText = useDebounce(searchText, 300);
	const isActivelySearching = searchText.trim().length > 0;
	const currentRegion = SUPPORTED_REGIONS.find((r) => r.code === selectedRegion);

	useEffect(() => {
		const loadInitialRegion = async () => {
			try {
				const savedRegion = await AsyncStorage.getItem("@scerv_region");

				if (
					savedRegion &&
					SUPPORTED_REGIONS.find((region) => region.code === savedRegion)
				) {
					setSelectedRegion(savedRegion);
				} else {
					const defaultRegion = "US";
					setSelectedRegion(defaultRegion);
					await AsyncStorage.setItem("@scerv_region", defaultRegion);
					setShowRegionModal(false);
				}
			} catch (error) {
				console.error("Error loading region:", error);
				setSelectedRegion("US");
			} finally {
				setIsRegionLoading(false);
			}
		};

		loadInitialRegion();
	}, []);

	useEffect(() => {
		if (isRegionLoading || (!selectedRegion && !forceGlobalView)) return;

		setIsLoading(true);

		let q = db.collection("restaurants");

		if (!forceGlobalView && selectedRegion) {
			q = q.where("countryCode", "==", selectedRegion);
		}

		if (!currentUserData?.canViewHiddenRestaurants) {
			q = q.where("isLive", "==", true);
		}

		const unsubscribe = q.onSnapshot(
			(snapshot) => {
				const validRestaurants = snapshot.docs
					.map((doc) => ({
						id: doc.id,
						...doc.data(),
					}))
					.filter((restaurant) => {
						if (currentUserData?.canViewHiddenRestaurants) {
							return (
								restaurant.isLive === true ||
								restaurant.isTestAccount === true
							);
						}
						return true;
					});

				setAllRestaurants(validRestaurants);
				setIsLoading(false);
			},
			(error) => {
				console.log("Error fetching restaurants:", error);
				setIsLoading(false);
			},
		);

		return () => unsubscribe();
	}, [
		selectedRegion,
		forceGlobalView,
		isRegionLoading,
		currentUserData?.canViewHiddenRestaurants,
	]);

	useEffect(() => {
		let isActive = true;
		const restaurantIds = allRestaurants
			.map((restaurant) => restaurant.id)
			.filter(Boolean);

		if (restaurantIds.length === 0) {
			setMenuItems([]);
			return () => {
				isActive = false;
			};
		}

		const loadMenuItems = async () => {
			setIsMenuLoading(true);
			try {
				const chunks = chunkArray(restaurantIds, 10);
				const snapshots = await Promise.all(
					chunks.map((chunk) =>
						db.collection("menuItems").where("restaurantId", "in", chunk).get(),
					),
				);

				if (!isActive) return;

				const fetchedItems = snapshots
					.flatMap((snapshot) =>
						snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
					)
					.filter((item) => item.isAvailable !== false);

				setMenuItems(fetchedItems);
			} catch (error) {
				console.log("Error fetching menu item ratings:", error);
				if (isActive) setMenuItems([]);
			} finally {
				if (isActive) setIsMenuLoading(false);
			}
		};

		loadMenuItems();

		return () => {
			isActive = false;
		};
	}, [allRestaurants]);

	useEffect(() => {
		let isActive = true;

		const loadTasteRecommendations = async () => {
			if (
				!selectedRegion ||
				currentUserData?.role !== "customer" ||
				!currentUserData?.uid
			) {
				setTasteRecommendations([]);
				return;
			}

			setIsTasteLoading(true);
			try {
				const getRecommendations = httpsCallable(
					functions,
					"getScervTasteRecommendations",
				);
				const response = await getRecommendations({
					countryCode: selectedRegion,
					limit: 8,
				});

				if (!isActive) return;
				const recommendations = response.data?.recommendations || [];
				setTasteRecommendations(
					Array.isArray(recommendations) ? recommendations : [],
				);
			} catch (error) {
				console.log("Error loading Scerv taste recommendations:", error);
				if (isActive) setTasteRecommendations([]);
			} finally {
				if (isActive) setIsTasteLoading(false);
			}
		};

		loadTasteRecommendations();

		return () => {
			isActive = false;
		};
	}, [currentUserData?.role, currentUserData?.uid, selectedRegion]);

	const handleRestaurantPress = (restaurant) => {
		if (restaurant.isComingSoon) return;
		navigation.navigate("RestaurantDetail", { restaurant });
	};

	const handleRegionSelect = async (regionCode) => {
		setSelectedRegion(regionCode);
		setForceGlobalView(false);
		setShowRegionModal(false);

		try {
			await AsyncStorage.setItem("@scerv_region", regionCode);
		} catch (error) {
			console.error("Failed to save region:", error);
		}
	};

	const handleTopFoodPress = (item) => {
		const displayLabel = getDiscoveryDishLabel(item);
		const groupKey = normalize(displayLabel);
		// Open the full ranked set for this craving so discovery is about the best spots, not just one winning dish.
		const groupItems = matchingMenuItems
			.filter((candidate) => normalize(getDiscoveryDishLabel(candidate)) === groupKey)
			.sort(compareDiscoveryItems)
			.slice(0, 30);

		setSelectedDiscoveryGroup({
			label: displayLabel,
			items: groupItems.length > 0 ? groupItems : [item],
		});
	};

	const openDiscoveryDish = (item) => {
		const restaurant = restaurantById.get(item.restaurantId);
		setSelectedDiscoveryGroup(null);
		setSelectedDiscoveryDish({
			item: {
				...item,
				restaurantName:
					item.restaurantName || restaurant?.restaurantName || restaurant?.name,
			},
			restaurant,
		});
	};

	const openRecommendedDish = (item) => {
		const restaurant =
			item.restaurant || restaurantById.get(item.restaurantId) || null;
		setSelectedDiscoveryDish({
			item: {
				...item,
				restaurantId: item.restaurantId || restaurant?.id,
				restaurantName:
					item.restaurantName || restaurant?.restaurantName || restaurant?.name,
			},
			restaurant,
		});
	};

	const handleViewDiscoveryDishRestaurant = () => {
		const restaurant = selectedDiscoveryDish?.restaurant;
		setSelectedDiscoveryDish(null);
		if (restaurant) handleRestaurantPress(restaurant);
	};

	const areaOptions = useMemo(() => {
		const areas = allRestaurants
			.map(getRestaurantArea)
			.filter(Boolean)
			.map((area) => area.trim())
			.filter((area) => !isMarketName(area));
		const uniqueAreas = [...new Set(areas)].sort((a, b) => a.localeCompare(b));

		return [
			{ id: "all", label: "All areas", value: "all" },
			...uniqueAreas.map((area) => ({
				id: area.toLowerCase(),
				label: area,
				value: area.toLowerCase(),
			})),
		];
	}, [allRestaurants]);

	const cuisineOptions = useMemo(() => {
		const cuisines = allRestaurants
			.map((restaurant) => restaurant.cuisineType)
			.filter(Boolean);
		const uniqueCuisines = [...new Set(cuisines)].sort((a, b) =>
			a.localeCompare(b),
		);

		return uniqueCuisines.slice(0, 10).map((cuisine) => ({
			id: cuisine.toLowerCase(),
			label: cuisine,
			icon: "restaurant-outline",
			terms: [cuisine.toLowerCase()],
		}));
	}, [allRestaurants]);

	const discoveryOptions = useMemo(
		() => [
			...DISCOVERY_INTENTS,
			...cuisineOptions.filter(
				(cuisine) =>
					!DISCOVERY_INTENTS.some((intent) => intent.id === cuisine.id),
			),
		],
		[cuisineOptions],
	);

	const restaurantById = useMemo(() => {
		const map = new Map();
		allRestaurants.forEach((restaurant) => {
			map.set(restaurant.id, restaurant);
		});
		return map;
	}, [allRestaurants]);

	const selectedIntent = useMemo(
		() =>
			discoveryOptions.find((intent) => intent.id === activeIntent) ||
			DISCOVERY_INTENTS[0],
		[activeIntent, discoveryOptions],
	);

	const visibleMenuItems = useMemo(() => {
		return menuItems.filter((item) => {
			const restaurant = restaurantById.get(item.restaurantId);
			if (!restaurant) return false;

			const area = normalize(getRestaurantArea(restaurant));
			return selectedArea === "all" || area === selectedArea;
		});
	}, [menuItems, restaurantById, selectedArea]);

	const matchingMenuItems = useMemo(() => {
		const normalizedQuery = normalize(debouncedSearchText);
		const queryTerms = normalizedQuery ? [normalizedQuery] : selectedIntent.terms;

		return visibleMenuItems
			.filter((item) => {
				const searchableText = getMenuItemSearchText(item);
				return matchesTerms(searchableText, queryTerms);
			})
			.sort(compareDiscoveryItems);
	}, [debouncedSearchText, selectedIntent.terms, visibleMenuItems]);

	const topFoodResults = useMemo(() => {
		const bestItemByDisplayLabel = new Map();

		matchingMenuItems
			.filter((item) => getFoodRating(item))
			.forEach((item) => {
				const displayLabel = getDiscoveryDishLabel(item);
				const key = normalize(displayLabel);
				const current = bestItemByDisplayLabel.get(key);

				if (!current) {
					bestItemByDisplayLabel.set(key, item);
					return;
				}

				if (compareDiscoveryItems(item, current) < 0) {
					bestItemByDisplayLabel.set(key, item);
				}
			});

		return [...bestItemByDisplayLabel.values()].slice(
			0,
			isActivelySearching || activeIntent !== "all" ? 10 : 8,
		);
	}, [activeIntent, isActivelySearching, matchingMenuItems]);

	const bestFoodByRestaurantId = useMemo(() => {
		const map = new Map();
		matchingMenuItems.forEach((item) => {
			const current = map.get(item.restaurantId);
			if (!current) {
				map.set(item.restaurantId, item);
				return;
			}

			if (compareDiscoveryItems(item, current) < 0) {
				map.set(item.restaurantId, item);
			}
		});
		return map;
	}, [matchingMenuItems]);

	const featuredRestaurants = useMemo(() => {
		const featured = allRestaurants.filter((restaurant) => restaurant.isFeatured);
		const restaurantsWithRatedFood = [...bestFoodByRestaurantId.keys()]
			.map((restaurantId) => restaurantById.get(restaurantId))
			.filter(Boolean);

		return (featured.length > 0 ? featured : restaurantsWithRatedFood).slice(
			0,
			8,
		);
	}, [allRestaurants, bestFoodByRestaurantId, restaurantById]);

	const filteredRestaurants = useMemo(() => {
		const normalizedQuery = normalize(debouncedSearchText);

		return allRestaurants
			.filter((restaurant) => {
				const searchableText = getRestaurantSearchText(restaurant);
				const area = normalize(getRestaurantArea(restaurant));
				const bestMatchingFood = bestFoodByRestaurantId.get(restaurant.id);
				const matchesArea = selectedArea === "all" || area === selectedArea;
				const matchesSearch =
					!normalizedQuery ||
					searchableText.includes(normalizedQuery) ||
					Boolean(bestMatchingFood);
				const matchesIntent =
					selectedIntent.id === "all" ||
					selectedIntent.terms.some((term) =>
						searchableText.includes(normalize(term)),
					) ||
					Boolean(bestMatchingFood);

				return matchesArea && matchesSearch && matchesIntent;
			})
			.sort((a, b) => {
				const foodA = bestFoodByRestaurantId.get(a.id);
				const foodB = bestFoodByRestaurantId.get(b.id);
				const scoreDiff =
					getStoredScervScore(foodB) - getStoredScervScore(foodA);
				if (scoreDiff !== 0) return scoreDiff;

				const countDiff = getRatingCount(foodB) - getRatingCount(foodA);
				if (countDiff !== 0) return countDiff;

				return (a.restaurantName || "").localeCompare(b.restaurantName || "");
			});
	}, [
		allRestaurants,
		bestFoodByRestaurantId,
		debouncedSearchText,
		selectedIntent,
		selectedArea,
	]);

	const resultTitle = useMemo(() => {
		if (isActivelySearching) {
			return `${filteredRestaurants.length} result${
				filteredRestaurants.length === 1 ? "" : "s"
			} for "${debouncedSearchText.trim() || searchText.trim()}"`;
		}

		const intent = discoveryOptions.find((option) => option.id === activeIntent);
		if (selectedArea !== "all") {
			const area = areaOptions.find((option) => option.value === selectedArea);
			return `${intent?.label || "Restaurants"} in ${area?.label || "your area"}`;
		}

		return activeIntent === "all"
			? "Restaurants near you"
			: `${intent?.label || "Restaurants"} spots`;
	}, [
		activeIntent,
		areaOptions,
		debouncedSearchText,
		discoveryOptions,
		filteredRestaurants.length,
		isActivelySearching,
		searchText,
		selectedArea,
	]);

	const shouldShowBestMatchFood =
		isActivelySearching || activeIntent !== "all";

	const ListHeader = useMemo(
		() => (
			<>
				<View style={styles.hero}>
					<View style={styles.heroTopRow}>
						<View style={styles.brandMark}>
							<Image
								source={require("../../../assets/icon.png")}
								style={styles.logo}
							/>
						</View>
						<TouchableOpacity
							activeOpacity={0.75}
							onPress={() => setShowRegionModal(true)}
							style={styles.regionPill}
						>
							<Ionicons name="location-outline" size={16} color={colors.primary} />
							<Text style={styles.regionPillText}>
								{currentRegion?.name || "Region"}
							</Text>
							<Ionicons name="chevron-down" size={15} color={colors.textMedium} />
						</TouchableOpacity>
					</View>

					<Text style={styles.eyebrow}>
						Hi {currentUserData?.firstName || "there"}
					</Text>
					<Text style={styles.heroTitle}>Find your next favorite meal</Text>
					<Text style={styles.heroSubtitle}>
						Search cravings, cuisines, neighborhoods, or a restaurant name.
					</Text>

					<View style={styles.searchContainer}>
						<CustomSearchBar
							placeholder="Burgers, sushi, tacos, coffee..."
							value={searchText}
							onChangeText={setSearchText}
						/>
					</View>
				</View>

				<View style={styles.discoverySection}>
					<SectionHeader
						title="What are you craving?"
						subtitle="Jump straight to the kind of food you want."
					/>
					<FlatList
						data={discoveryOptions}
						renderItem={({ item }) => (
							<FilterChip
								icon={item.icon}
								label={item.label}
								isActive={activeIntent === item.id}
								onPress={() => setActiveIntent(item.id)}
							/>
						)}
						keyExtractor={(item) => item.id}
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.horizontalList}
					/>
				</View>

				{areaOptions.length > 1 ? (
					<View style={styles.discoverySection}>
						<SectionHeader title="Explore by area" />
						<FlatList
							data={areaOptions}
							renderItem={({ item }) => (
								<FilterChip
									label={item.label}
									isActive={selectedArea === item.value}
									onPress={() => setSelectedArea(item.value)}
								/>
							)}
							keyExtractor={(item) => item.id}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.horizontalList}
						/>
					</View>
				) : null}

				{!isActivelySearching && featuredRestaurants.length > 0 ? (
					<View style={styles.featuredSection}>
						<SectionHeader
							title="Featured for you"
							subtitle="Restaurants selected by the market, not a service score."
						/>
						<FlatList
							data={featuredRestaurants}
							renderItem={({ item }) => (
								<FeaturedCard
									item={item}
									onPress={() => handleRestaurantPress(item)}
								/>
							)}
							keyExtractor={(item) => item.id}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.horizontalList}
						/>
					</View>
				) : null}

				{!isActivelySearching && tasteRecommendations.length > 0 ? (
					<View style={styles.tasteMatchSection}>
						<SectionHeader
							title="Matched to your taste"
							subtitle="Early Scerv Intelligence picks shaped by your dish ratings."
						/>
						<FlatList
							data={tasteRecommendations}
							renderItem={({ item }) => (
								<TasteMatchCard
									item={item}
									onPress={() => openRecommendedDish(item)}
								/>
							)}
							keyExtractor={(item, index) =>
								`${item.id || "recommendation"}_${index}`
							}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.horizontalList}
						/>
					</View>
				) : !isActivelySearching && isTasteLoading ? (
					<View style={styles.tasteMatchLoading}>
						<ActivityIndicator size="small" color={colors.primary} />
						<Text style={styles.tasteMatchLoadingText}>
							Tuning recommendations...
						</Text>
					</View>
				) : null}

				{topFoodResults.length > 0 ? (
					<View style={styles.topFoodSection}>
						<SectionHeader
							title={
								isActivelySearching
									? `Top rated ${debouncedSearchText.trim() || searchText.trim()}`
									: activeIntent === "all"
										? "Top rated food"
										: `Top rated ${selectedIntent.label}`
							}
							subtitle="Ranked by customer ratings on the dish itself."
						/>
						<FlatList
							data={topFoodResults}
							renderItem={({ item }) => {
								const restaurant = restaurantById.get(item.restaurantId);
								return (
									<TopFoodCard
										item={item}
										restaurant={restaurant}
										onPress={() => handleTopFoodPress(item)}
									/>
								);
							}}
							keyExtractor={(item) => item.id}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.horizontalList}
						/>
					</View>
				) : isMenuLoading ? (
					<View style={styles.menuRatingLoading}>
						<ActivityIndicator size="small" color={colors.primary} />
						<Text style={styles.menuRatingLoadingText}>
							Checking food ratings...
						</Text>
					</View>
				) : null}

				<View style={styles.resultsHeader}>
					<Text style={styles.resultsTitle}>{resultTitle}</Text>
					<Text style={styles.resultsCount}>
						{filteredRestaurants.length} available
					</Text>
				</View>
			</>
		),
		[
			activeIntent,
			areaOptions,
			currentRegion?.name,
			currentUserData?.firstName,
			debouncedSearchText,
			discoveryOptions,
			featuredRestaurants,
			filteredRestaurants.length,
			isActivelySearching,
			isMenuLoading,
			isTasteLoading,
			resultTitle,
			restaurantById,
			searchText,
			selectedArea,
			selectedIntent,
			tasteRecommendations,
			topFoodResults,
		],
	);

	if (isRegionLoading) {
		return (
			<SafeAreaView style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</SafeAreaView>
		);
	}

	if (currentUserData && !currentUserData.profileCompleted) {
		return <CompleteProfileScreen />;
	}

	return (
		<SafeAreaView style={styles.container}>
			<NotificationBanner />

			<Modal
				visible={showRegionModal}
				transparent={true}
				animationType="fade"
				onRequestClose={() => {
					if (selectedRegion) setShowRegionModal(false);
				}}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						<Ionicons name="map-outline" size={46} color={colors.primary} />
						<Text style={styles.modalTitle}>Choose your market</Text>
						<Text style={styles.modalMessage}>
							Restaurants are filtered by the country or market they operate in.
						</Text>

						{SUPPORTED_REGIONS.map((region) => (
							<TouchableOpacity
								key={region.code}
								style={[
									styles.regionButton,
									selectedRegion === region.code && styles.regionButtonActive,
								]}
								onPress={() => handleRegionSelect(region.code)}
							>
								<View>
									<Text style={styles.regionButtonText}>{region.name}</Text>
									<Text style={styles.regionButtonSubtext}>{region.code}</Text>
								</View>
								{selectedRegion === region.code ? (
									<Ionicons
										name="checkmark-circle"
										size={24}
										color={colors.primary}
									/>
								) : (
									<Ionicons
										name="chevron-forward"
										size={20}
										color={colors.textLight}
									/>
								)}
							</TouchableOpacity>
						))}

						{selectedRegion ? (
							<TouchableOpacity
								onPress={() => setShowRegionModal(false)}
								style={styles.modalCloseButton}
							>
								<Text style={styles.modalCloseText}>Close</Text>
							</TouchableOpacity>
						) : null}
					</View>
				</View>
			</Modal>

			<Modal
				visible={Boolean(selectedDiscoveryGroup)}
				transparent={true}
				animationType="slide"
				onRequestClose={() => setSelectedDiscoveryGroup(null)}
			>
				<View style={styles.discoveryResultsOverlay}>
					<TouchableOpacity
						style={styles.discoveryResultsBackdrop}
						activeOpacity={1}
						onPress={() => setSelectedDiscoveryGroup(null)}
					/>
					<View style={styles.discoveryResultsSheet}>
						<View style={styles.discoveryResultsHandle} />
						<View style={styles.discoveryResultsHeader}>
							<View style={styles.discoveryResultsTitleWrap}>
								<Text style={styles.discoveryResultsEyebrow}>
									Top spots
								</Text>
								<Text style={styles.discoveryResultsTitle} numberOfLines={1}>
									{selectedDiscoveryGroup?.label || "Food"}
								</Text>
								<Text style={styles.discoveryResultsSubtitle}>
									Ranked by dish ratings, reviews, and Scerv discovery signals.
								</Text>
							</View>
							<TouchableOpacity
								style={styles.discoveryResultsClose}
								onPress={() => setSelectedDiscoveryGroup(null)}
								activeOpacity={0.75}
							>
								<Ionicons name="close" size={22} color={colors.textDark} />
							</TouchableOpacity>
						</View>
						<FlatList
							data={selectedDiscoveryGroup?.items || []}
							keyExtractor={(item, index) => `${item.id || "dish"}_${index}`}
							renderItem={({ item, index }) => (
								<TopFoodResultRow
									item={item}
									rank={index + 1}
									restaurant={restaurantById.get(item.restaurantId)}
									onPress={() => openDiscoveryDish(item)}
								/>
							)}
							contentContainerStyle={styles.discoveryResultsList}
							showsVerticalScrollIndicator={false}
						/>
					</View>
				</View>
			</Modal>

			{isLoading ? (
				<View style={styles.loadingContent}>
					{ListHeader}
					<View style={styles.loadingBody}>
						<ActivityIndicator size="large" color={colors.primary} />
						<Text style={styles.loadingText}>Finding restaurants...</Text>
					</View>
				</View>
			) : (
				<FlatList
					data={filteredRestaurants}
					renderItem={({ item }) => (
						<View style={styles.restaurantCardWrap}>
							<RestaurantCard
								restaurant={item}
								onPress={() => handleRestaurantPress(item)}
								onBestFoodPress={
									shouldShowBestMatchFood
										? () => {
												const bestFood = bestFoodByRestaurantId.get(item.id);
												if (bestFood) handleTopFoodPress(bestFood);
											}
										: undefined
								}
								bestMatchingFood={
									shouldShowBestMatchFood
										? bestFoodByRestaurantId.get(item.id)
										: null
								}
							/>
						</View>
					)}
					keyExtractor={(item) => item.id}
					ListHeaderComponent={ListHeader}
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.listContent}
					ListEmptyComponent={
						<View style={styles.emptyState}>
							<Ionicons
								name="search-outline"
								size={38}
								color={colors.textLight}
							/>
							<Text style={styles.emptyTitle}>No restaurants found</Text>
							<Text style={styles.emptyText}>
								Try a different craving, search term, or area.
							</Text>
							<TouchableOpacity
								activeOpacity={0.75}
								onPress={() => {
									setSearchText("");
									setActiveIntent("all");
									setSelectedArea("all");
								}}
								style={styles.emptyButton}
							>
								<Text style={styles.emptyButtonText}>Reset filters</Text>
							</TouchableOpacity>
						</View>
					}
				/>
			)}

			{selectedDiscoveryDish?.item ? (
				<SelectedItemModal
					visible={Boolean(selectedDiscoveryDish?.item)}
					selectedItem={selectedDiscoveryDish.item}
					pips={[]}
					onClose={() => setSelectedDiscoveryDish(null)}
					onConfirm={() => {}}
					isOrderingAvailable={false}
					restaurantName={
						selectedDiscoveryDish.restaurant?.restaurantName ||
						selectedDiscoveryDish.restaurant?.name ||
						selectedDiscoveryDish.item.restaurantName ||
						""
					}
					onViewRestaurant={handleViewDiscoveryDishRestaurant}
				/>
			) : null}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: "#F3F6F7" },
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#F3F6F7",
	},
	loadingContent: { flex: 1 },
	loadingBody: { flex: 1, justifyContent: "center", alignItems: "center" },
	loadingText: { marginTop: 10, color: colors.textMedium, fontSize: 14 },
	listContent: { paddingBottom: 24 },
	hero: {
		paddingHorizontal: 20,
		paddingTop: 12,
		paddingBottom: 18,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: "#E3EAEC",
	},
	heroTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 20,
	},
	brandMark: {
		width: 58,
		height: 58,
		borderRadius: 8,
		backgroundColor: "#EFF8F8",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "#D4EAEA",
	},
	logo: { width: 49, height: 49 },
	regionPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		height: 38,
		borderRadius: 8,
		backgroundColor: "#F7FAFA",
		borderWidth: 1,
		borderColor: "#DDE7E9",
	},
	regionPillText: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.textDark,
	},
	eyebrow: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.primary,
		textTransform: "uppercase",
		letterSpacing: 0,
		marginBottom: 8,
	},
	heroTitle: {
		fontSize: 31,
		lineHeight: 36,
		fontWeight: "900",
		color: colors.textDark,
		letterSpacing: 0,
		maxWidth: 330,
	},
	heroSubtitle: {
		fontSize: 15,
		lineHeight: 22,
		color: colors.textMedium,
		marginTop: 9,
		maxWidth: 340,
	},
	searchContainer: { marginTop: 18 },
	discoverySection: { paddingTop: 20 },
	featuredSection: { paddingTop: 18 },
	tasteMatchSection: { paddingTop: 18 },
	topFoodSection: { paddingTop: 20 },
	sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
	sectionTitle: {
		fontSize: 19,
		fontWeight: "900",
		color: colors.textDark,
		letterSpacing: 0,
	},
	sectionSubtitle: {
		fontSize: 13,
		lineHeight: 19,
		color: colors.textMedium,
		marginTop: 4,
	},
	horizontalList: { paddingLeft: 20, paddingRight: 12 },
	filterChip: {
		height: 40,
		maxWidth: 180,
		flexDirection: "row",
		alignItems: "center",
		gap: 7,
		paddingHorizontal: 13,
		marginRight: 8,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: "#DDE7E9",
	},
	filterChipActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	filterChipText: {
		fontSize: 14,
		fontWeight: "800",
		color: colors.textDark,
	},
	filterChipTextActive: { color: colors.surfaceWhite },
	featuredCard: {
		width: Math.min(screenWidth * 0.74, 310),
		height: 174,
		marginRight: 12,
		borderRadius: 8,
		overflow: "hidden",
		backgroundColor: colors.surfaceWhite,
	},
	featuredImage: { width: "100%", height: "100%" },
	featuredImagePlaceholder: {
		width: "100%",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF5F5",
	},
	featuredScrim: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0, 0, 0, 0.28)",
	},
	featuredInfo: {
		position: "absolute",
		left: 12,
		right: 12,
		bottom: 12,
	},
	featuredName: {
		fontSize: 18,
		fontWeight: "900",
		color: colors.surfaceWhite,
		letterSpacing: 0,
	},
	featuredCuisine: {
		fontSize: 13,
		fontWeight: "700",
		color: "#F4F7F7",
		marginTop: 3,
	},
	foodCard: {
		width: 210,
		marginRight: 12,
		borderRadius: 8,
		overflow: "hidden",
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: "#E3EAEC",
	},
	foodImage: {
		width: "100%",
		height: 104,
		backgroundColor: "#EAF5F5",
	},
	foodImagePlaceholder: {
		width: "100%",
		height: 104,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF5F5",
	},
	foodInfo: { padding: 12, minHeight: 112 },
	foodName: {
		fontSize: 15,
		lineHeight: 19,
		fontWeight: "900",
		color: colors.textDark,
		letterSpacing: 0,
	},
	foodRestaurant: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 5,
	},
	foodRatingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginTop: 10,
	},
	foodRatingText: {
		fontSize: 13,
		fontWeight: "900",
		color: "#92400E",
	},
	scoreInfoChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		marginLeft: 4,
		paddingHorizontal: 7,
		height: 24,
		borderRadius: 8,
		backgroundColor: "#EAF5F5",
	},
	scoreInfoText: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
	},
	foodNoRating: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textLight,
		marginTop: 10,
	},
	tasteMatchCard: {
		width: Math.min(screenWidth * 0.78, 318),
		marginRight: 12,
		borderRadius: 8,
		overflow: "hidden",
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: "#DDE7E9",
	},
	tasteMatchImage: {
		width: "100%",
		height: 118,
		backgroundColor: "#EAF5F5",
	},
	tasteMatchImagePlaceholder: {
		width: "100%",
		height: 118,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF5F5",
	},
	tasteMatchInfo: {
		padding: 12,
		minHeight: 128,
	},
	tasteMatchBadge: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		height: 24,
		paddingHorizontal: 8,
		borderRadius: 8,
		backgroundColor: "#EAF5F5",
		marginBottom: 8,
	},
	tasteMatchBadgeText: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
		textTransform: "uppercase",
	},
	tasteMatchDish: {
		fontSize: 16,
		lineHeight: 20,
		fontWeight: "900",
		color: colors.textDark,
		letterSpacing: 0,
	},
	tasteMatchRestaurant: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textMedium,
		marginTop: 4,
	},
	tasteMatchRating: {
		fontSize: 12,
		fontWeight: "900",
		color: "#92400E",
		marginTop: 7,
	},
	tasteMatchReason: {
		fontSize: 12,
		lineHeight: 17,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 5,
	},
	tasteMatchLoading: {
		marginHorizontal: 20,
		marginTop: 18,
		padding: 12,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: "#E3EAEC",
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	tasteMatchLoadingText: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textMedium,
	},
	discoveryResultsOverlay: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: "rgba(4, 12, 24, 0.48)",
	},
	discoveryResultsBackdrop: {
		...StyleSheet.absoluteFillObject,
	},
	discoveryResultsSheet: {
		maxHeight: "82%",
		backgroundColor: "#F3F6F7",
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		paddingTop: 10,
		overflow: "hidden",
	},
	discoveryResultsHandle: {
		alignSelf: "center",
		width: 42,
		height: 4,
		borderRadius: 999,
		backgroundColor: "#C9D6DA",
		marginBottom: 12,
	},
	discoveryResultsHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
		paddingHorizontal: 20,
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: "#DDE7E9",
	},
	discoveryResultsTitleWrap: {
		flex: 1,
	},
	discoveryResultsEyebrow: {
		fontSize: 11,
		fontWeight: "900",
		letterSpacing: 0,
		textTransform: "uppercase",
		color: colors.primary,
		marginBottom: 4,
	},
	discoveryResultsTitle: {
		fontSize: 24,
		lineHeight: 29,
		fontWeight: "900",
		color: colors.textDark,
		letterSpacing: 0,
	},
	discoveryResultsSubtitle: {
		fontSize: 13,
		lineHeight: 19,
		color: colors.textMedium,
		marginTop: 5,
	},
	discoveryResultsClose: {
		width: 38,
		height: 38,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: "#DDE7E9",
	},
	discoveryResultsList: {
		padding: 16,
		paddingBottom: 28,
	},
	discoveryResultRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 10,
		marginBottom: 10,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: "#E0E8EB",
	},
	discoveryResultRank: {
		width: 26,
		height: 26,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF5F5",
	},
	discoveryResultRankText: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.primary,
	},
	discoveryResultImage: {
		width: 64,
		height: 64,
		borderRadius: 8,
		backgroundColor: "#EAF5F5",
	},
	discoveryResultImagePlaceholder: {
		width: 64,
		height: 64,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF5F5",
	},
	discoveryResultInfo: {
		flex: 1,
		minWidth: 0,
	},
	discoveryResultDish: {
		fontSize: 15,
		lineHeight: 19,
		fontWeight: "900",
		color: colors.textDark,
		letterSpacing: 0,
	},
	discoveryResultRestaurant: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textMedium,
		marginTop: 3,
	},
	discoveryResultMeta: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textLight,
		marginTop: 2,
	},
	discoveryResultSignalRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 6,
		marginTop: 7,
	},
	discoveryResultSignalText: {
		fontSize: 12,
		fontWeight: "900",
		color: "#92400E",
	},
	discoveryScoreInfoChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: 7,
		height: 22,
		borderRadius: 8,
		backgroundColor: "#EAF5F5",
	},
	discoveryScoreInfoText: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
	},
	menuRatingLoading: {
		marginHorizontal: 20,
		marginTop: 18,
		padding: 12,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: "#E3EAEC",
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	menuRatingLoadingText: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textMedium,
	},
	resultsHeader: {
		paddingHorizontal: 20,
		paddingTop: 22,
		paddingBottom: 12,
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		gap: 12,
	},
	resultsTitle: {
		flex: 1,
		fontSize: 20,
		lineHeight: 25,
		fontWeight: "900",
		color: colors.textDark,
	},
	resultsCount: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textMedium,
		marginBottom: 2,
	},
	restaurantCardWrap: { paddingHorizontal: 20, marginBottom: 12 },
	emptyState: {
		marginHorizontal: 20,
		marginTop: 14,
		padding: 22,
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#E3EAEC",
	},
	emptyTitle: {
		fontSize: 18,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 10,
	},
	emptyText: {
		fontSize: 14,
		lineHeight: 20,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 6,
	},
	emptyButton: {
		marginTop: 16,
		height: 40,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.primary,
	},
	emptyButtonText: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.surfaceWhite,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalContent: {
		width: "86%",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		padding: 24,
		alignItems: "center",
		elevation: 5,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "900",
		marginTop: 14,
		marginBottom: 8,
		textAlign: "center",
		color: colors.textDark,
	},
	modalMessage: {
		fontSize: 15,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 20,
		lineHeight: 22,
	},
	regionButton: {
		width: "100%",
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 14,
		borderWidth: 1,
		borderColor: "#DDE7E9",
		borderRadius: 8,
		marginBottom: 10,
	},
	regionButtonActive: {
		borderColor: colors.primary,
		backgroundColor: "#EFF8F8",
	},
	regionButtonText: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textDark,
	},
	regionButtonSubtext: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 2,
	},
	modalCloseButton: { marginTop: 8, padding: 8 },
	modalCloseText: { color: colors.textMedium, fontSize: 15, fontWeight: "800" },
});

export default CustomerDashboard;
