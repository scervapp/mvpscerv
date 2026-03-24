import React, { useContext, useEffect, useState, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	Image,
	FlatList,
	SafeAreaView,
	Dimensions,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
	Modal,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage"; // NEW: Persistence
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

import CustomSearchBar from "./CustomSearchBar";
import { NotificationBanner } from "../../utils/NotificationBanner";
import { useDebounce } from "../../hooks/useBounce";
import { db } from "../../config/firebase.native";
import RestaurantCard from "../../components/customer/RestaurantCard";
import {
	getDocs,
	query,
	collection,
	where,
	orderBy,
	limit,
} from "@react-native-firebase/firestore";
import CompleteProfileScreen from "../auth/CompleteProfile";
import { useTranslation } from "react-i18next";
import * as Localization from "expo-localization";
import { Ionicons } from "@expo/vector-icons";

const { width: screenWidth } = Dimensions.get("window");

// --- CONFIGURATION ---
const SUPPORTED_REGIONS = [
	{ code: "PA", label: "🇵🇦 Panama", name: "Panama" },
	{ code: "US", label: "🇺🇸 United States", name: "United States" },
];

// --- HELPER COMPONENTS ---
const SectionHeader = ({ title }) => (
	<Text style={styles.sectionTitle}>{title}</Text>
);

const CategoryChip = ({ label, isActive, onPress }) => (
	<TouchableOpacity
		activeOpacity={0.7}
		style={[styles.categoryChip, isActive && styles.categoryChipActive]}
		onPress={onPress}
	>
		<Text
			style={[
				styles.categoryChipText,
				isActive && styles.categoryChipTextActive,
			]}
		>
			{label}
		</Text>
	</TouchableOpacity>
);

const FeaturedCard = ({ item, onPress }) => (
	<TouchableOpacity
		activeOpacity={0.8}
		style={styles.featuredCard}
		onPress={onPress}
	>
		<Image source={{ uri: item.imageUri }} style={styles.featuredImage} />
		<View style={styles.featuredInfo}>
			<Text style={styles.featuredName} numberOfLines={1}>
				{item.restaurantName}
			</Text>
			<Text style={styles.featuredCuisine} numberOfLines={1}>
				{item.cuisineType} • {item.city}
			</Text>
		</View>
	</TouchableOpacity>
);

const CustomerDashboard = ({ route = {}, navigation }) => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);

	// --- STATE ---
	const [searchText, setSearchText] = useState("");
	const [activeCategory, setActiveCategory] = useState("all");
	const [allRestaurants, setAllRestaurants] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRegionLoading, setIsRegionLoading] = useState(true); // NEW: Prevents UI flash
	const [forceGlobalView, setForceGlobalView] = useState(false);
	const [showRegionModal, setShowRegionModal] = useState(false);
	const [selectedRegion, setSelectedRegion] = useState(null); // Initialized dynamically now

	const debouncedSearchText = useDebounce(searchText, 300);
	const isActivelySearching = searchText.length > 0;

	// --- EFFECTS ---

	// 1. Check Region on Mount (from AsyncStorage or Device)
	useEffect(() => {
		const loadInitialRegion = async () => {
			try {
				// Check local storage first
				const savedRegion = await AsyncStorage.getItem("@scerv_region");

				if (
					savedRegion &&
					SUPPORTED_REGIONS.find((r) => r.code === savedRegion)
				) {
					setSelectedRegion(savedRegion);
				} else {
					// Fallback to device region
					const deviceRegion = Localization.getLocales()[0]?.regionCode;
					const isSupported = SUPPORTED_REGIONS.find(
						(r) => r.code === deviceRegion,
					);

					if (isSupported) {
						setSelectedRegion(deviceRegion);
						// Save the auto-detected region so we don't calculate again
						await AsyncStorage.setItem("@scerv_region", deviceRegion);
					} else {
						setShowRegionModal(true);
					}
				}
			} catch (error) {
				console.error("Error loading region from storage:", error);
				setShowRegionModal(true);
			} finally {
				setIsRegionLoading(false);
			}
		};

		loadInitialRegion();
	}, []);

	// 2. Fetch Restaurants (Filtered by Region)
	useEffect(() => {
		if (isRegionLoading || (!selectedRegion && !forceGlobalView)) return;

		setIsLoading(true);
		console.log(
			`Fetching restaurants. Region: ${selectedRegion}, GlobalMode: ${forceGlobalView}`,
		);

		let q = db.collection("restaurants");

		// 1. Apply Region Filter
		if (!forceGlobalView && selectedRegion) {
			q = q.where("countryCode", "==", selectedRegion);
		}

		// 2. Apply Permission Filter at DB level for normal users
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
					.filter((res) => {
						// 3. Client-side filter for testers to ensure they see Live OR Test
						// (and filters out completely inactive setups)
						if (currentUserData?.canViewHiddenRestaurants) {
							return res.isLive === true || res.isTestAccount === true;
						}
						return true; // Normal users are already filtered by the DB query above
					});

				setAllRestaurants(validRestaurants);
				setIsLoading(false);
			},
			(err) => {
				console.log("Error fetching restaurants:", err);
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

	// --- HANDLERS ---
	const handleRestaurantPress = (restaurant) => {
		navigation.navigate("RestaurantDetail", { restaurant });
	};
	const handleSearch = (text) => setSearchText(text);
	const handleCategoryPress = (category) => setActiveCategory(category.value);

	// NEW: Save selected region securely
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

	// --- MEMOS ---
	const featuredRestaurants = useMemo(
		() => allRestaurants.filter((r) => r.isFeatured),
		[allRestaurants],
	);

	const categories = useMemo(() => {
		if (allRestaurants.length === 0) {
			return [{ id: "1", label: t("all"), value: "all" }];
		}
		const allCuisines = allRestaurants
			.map((r) => r.cuisineType)
			.filter(Boolean);
		const uniqueCuisines = [...new Set(allCuisines)];
		const formattedCategories = uniqueCuisines.sort().map((cuisine, index) => ({
			id: String(index + 2),
			label: cuisine,
			value: cuisine.toLowerCase(),
		}));
		return [{ id: "1", label: t("all"), value: "all" }, ...formattedCategories];
	}, [allRestaurants, t]);

	const filteredRestaurants = useMemo(() => {
		return allRestaurants.filter((r) => {
			const matchesSearch = r.restaurantName
				?.toLowerCase()
				.includes(debouncedSearchText.toLowerCase());
			const matchesCategory =
				activeCategory === "all" ||
				r.cuisineType?.toLowerCase() === activeCategory;
			return debouncedSearchText ? matchesSearch : matchesCategory;
		});
	}, [allRestaurants, debouncedSearchText, activeCategory]);

	// --- HEADER COMPONENT ---
	const ListHeader = useMemo(
		() => (
			<>
				<View style={styles.header}>
					<Image
						source={require("../../../assets/icon.png")}
						style={styles.logo}
					/>
					<View style={styles.welcomeContainer}>
						<Text style={styles.welcomeText}>
							{t("welcome_to_scerv", { name: currentUserData.firstName })}
						</Text>
						<Text style={styles.subtitle}>
							{t("discover_new_yorks_best_dining")}
						</Text>
					</View>

					<TouchableOpacity
						onPress={() => setShowRegionModal(true)}
						style={styles.regionIconContainer}
					>
						<Text style={{ fontSize: 22 }}>
							{SUPPORTED_REGIONS.find(
								(r) => r.code === selectedRegion,
							)?.label.split(" ")[0] || "🌍"}
						</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.searchContainer}>
					<CustomSearchBar
						placeholder={t("search_for_restaurants")}
						value={searchText}
						onChangeText={handleSearch}
					/>
				</View>

				{!isActivelySearching && featuredRestaurants.length > 0 && (
					<View style={styles.featuredSection}>
						<SectionHeader title={t("featured_restaurants")} />
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
							contentContainerStyle={{ paddingLeft: 20 }}
						/>
					</View>
				)}

				{!isActivelySearching && (
					<View style={styles.categoriesContainer}>
						<SectionHeader title={t("cuisine")} />
						<FlatList
							data={categories}
							renderItem={({ item }) => (
								<CategoryChip
									label={item.label}
									isActive={activeCategory === item.value}
									onPress={() => handleCategoryPress(item)}
								/>
							)}
							keyExtractor={(item) => item.id}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={{ paddingLeft: 20 }}
						/>
					</View>
				)}

				{isActivelySearching && (
					<View style={styles.sectionHeaderContainer}>
						<SectionHeader
							title={
								debouncedSearchText && debouncedSearchText.length > 0
									? t("results_for", {
											count: filteredRestaurants.length,
											query: debouncedSearchText,
										})
									: activeCategory === "all"
										? t("all_restaurants")
										: t("restaurant_results", {
												count: filteredRestaurants.length,
												category: activeCategory,
											})
							}
						/>
					</View>
				)}
			</>
		),
		[
			searchText,
			featuredRestaurants,
			activeCategory,
			debouncedSearchText,
			filteredRestaurants.length,
			categories,
			t,
			currentUserData,
			selectedRegion,
		],
	);

	// --- APP FLOW ---
	if (isRegionLoading) {
		return (
			<SafeAreaView
				style={[
					styles.container,
					{ justifyContent: "center", alignItems: "center" },
				]}
			>
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

			{/* --- REGION SELECTOR MODAL --- */}
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
						<Ionicons name="map-outline" size={50} color={colors.primary} />
						<Text style={styles.modalTitle}>
							{t("select_region_title") || "Select Your Region"}
						</Text>
						<Text style={styles.modalMessage}>
							{selectedRegion
								? t("select_region_title")
								: t("region_not_supported_message") ||
									"Please select a market:"}
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
								<Text style={styles.regionButtonText}>{region.label}</Text>
								{selectedRegion === region.code && (
									<Ionicons
										name="checkmark-circle"
										size={24}
										color={colors.primary}
									/>
								)}
							</TouchableOpacity>
						))}

						{selectedRegion && (
							<TouchableOpacity
								onPress={() => setShowRegionModal(false)}
								style={{ marginTop: 15 }}
							>
								<Text style={{ color: colors.textMedium, fontSize: 16 }}>
									{t("close_button")}
								</Text>
							</TouchableOpacity>
						)}
					</View>
				</View>
			</Modal>

			{/* --- MAIN CONTENT --- */}
			{isLoading ? (
				<View style={{ flex: 1 }}>
					{ListHeader}
					<View style={{ flex: 1, justifyContent: "center" }}>
						<ActivityIndicator size="large" color={colors.primary} />
					</View>
				</View>
			) : filteredRestaurants.length === 0 &&
			  !isActivelySearching &&
			  activeCategory === "all" ? (
				<View style={{ flex: 1 }}>
					{ListHeader}
					<View
						style={{
							flex: 1,
							alignItems: "center",
							justifyContent: "center",
							padding: 20,
						}}
					>
						<Image
							source={require("../../../assets/icon.png")}
							style={{ width: 80, height: 80, opacity: 0.5, marginBottom: 20 }}
						/>
						<Text
							style={{
								fontSize: 18,
								color: colors.textMedium,
								textAlign: "center",
								marginBottom: 10,
							}}
						>
							{t("no_restaurants_found")}
						</Text>
						<Text
							style={{
								fontSize: 14,
								color: colors.textLight,
								textAlign: "center",
								marginBottom: 30,
							}}
						>
							Region: {selectedRegion}
						</Text>

						<TouchableOpacity
							onPress={() => setShowRegionModal(true)}
							style={{
								padding: 12,
								backgroundColor: colors.primary,
								borderRadius: 8,
							}}
						>
							<Text style={{ color: "white", fontWeight: "bold" }}>
								Change Region
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			) : (
				<FlatList
					data={filteredRestaurants}
					renderItem={({ item }) => (
						<View style={{ paddingHorizontal: 20, marginBottom: 15 }}>
							<RestaurantCard
								restaurant={item}
								onPress={() => handleRestaurantPress(item)}
							/>
						</View>
					)}
					keyExtractor={(item) => item.id}
					ListHeaderComponent={ListHeader}
					showsVerticalScrollIndicator={false}
					ListEmptyComponent={
						<Text
							style={{
								textAlign: "center",
								marginTop: 20,
								color: colors.textMedium,
							}}
						>
							{t("no_restaurants_found")}
						</Text>
					}
				/>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingTop: 10,
		backgroundColor: colors.surfaceWhite,
	},
	logo: { width: 40, height: 40, marginRight: 12 },
	welcomeContainer: { flex: 1 },
	welcomeText: { fontSize: 20, fontWeight: "bold", color: colors.textDark },
	subtitle: { fontSize: 14, color: colors.textMedium },
	regionIconContainer: {
		padding: 8,
		backgroundColor: colors.backgroundLight,
		borderRadius: 20,
		marginLeft: 10,
	},
	searchContainer: {
		paddingHorizontal: 15,
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	sectionHeaderContainer: {
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	sectionTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 15,
		paddingHorizontal: 20,
	},
	featuredSection: { paddingTop: 20, paddingBottom: 10 },
	featuredCard: {
		width: screenWidth * 0.75,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 16,
		marginRight: 16,
		overflow: "hidden",
		elevation: 3,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
	},
	featuredImage: { width: "100%", height: 140 },
	featuredInfo: { padding: 12 },
	featuredName: { fontSize: 16, fontWeight: "bold", color: colors.textDark },
	featuredCuisine: { fontSize: 14, color: colors.textMedium, marginTop: 4 },
	categoriesContainer: { paddingTop: 10, paddingBottom: 0 },
	categoryChip: {
		paddingHorizontal: 20,
		paddingVertical: 10,
		marginRight: 8,
		borderRadius: 20,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginBottom: 20,
	},
	categoryChipActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	categoryChipText: {
		fontSize: 14,
		fontWeight: "500",
		color: colors.textMedium,
	},
	categoryChipTextActive: { color: colors.surfaceWhite },
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalContent: {
		width: "85%",
		backgroundColor: "white",
		borderRadius: 20,
		padding: 25,
		alignItems: "center",
		elevation: 5,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginTop: 15,
		marginBottom: 10,
		textAlign: "center",
		color: colors.textDark,
	},
	modalMessage: {
		fontSize: 16,
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
		padding: 15,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 12,
		marginBottom: 10,
	},
	regionButtonActive: {
		borderColor: colors.primary,
		backgroundColor: colors.backgroundLight,
	},
	regionButtonText: { fontSize: 18, fontWeight: "500", color: colors.textDark },
});

export default CustomerDashboard;
