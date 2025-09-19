import React, { useContext, useEffect, useState, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	Image,
	FlatList,
	SafeAreaView,
	ScrollView,
	Dimensions,
	TouchableOpacity,
	ActivityIndicator,
} from "react-native";

import RestaurantList from "../../components/customer/RestaurantList";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

import CustomSearchBar from "./CustomSearchBar";
import { NotificationBanner } from "../../utils/NotificationBanner";
import { useDebounce } from "../../hooks/useBounce";
import { db } from "../../config/firebase.native";
import RestaurantCard from "../../components/customer/RestaurantCard";

const { width: screenWidth } = Dimensions.get("window");

const MOCK_FEATURED_RESTAURANTS = [
	{
		id: "1",
		name: "The Brooklyn Bistro",
		cuisine: "American",
		distance: "0.5 mi",
		image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800",
	},
	{
		id: "2",
		name: "Park Slope Pizzeria",
		cuisine: "Italian",
		distance: "1.2 mi",
		image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800",
	},
	{
		id: "3",
		name: "Gowanus Gardens",
		cuisine: "Gastropub",
		distance: "0.8 mi",
		image: "https://images.unsplash.com/photo-1579735215902-87a75235da2f?w=800",
	},
];

const CATEGORIES = [
	{ id: "1", label: "All", value: "all" },
	{ id: "2", label: "Italian", value: "italian" },
	{ id: "3", label: "American", value: "american" },
	{ id: "4", label: "Mexican", value: "mexican" },
	{ id: "5", label: "Bars", value: "bars" },
];
// --------------------------------------------------

const SectionHeader = ({ title }) => (
	<Text style={styles.sectionTitle}>{title}</Text>
);
const CategoryChip = ({ label, isActive, onPress }) => (
	<TouchableOpacity
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
	<TouchableOpacity style={styles.featuredCard} onPress={onPress}>
		<Image source={{ uri: item.imageUri }} style={styles.featuredImage} />
		<View style={styles.featuredInfo}>
			<Text style={styles.featuredName} numberOfLines={1}>
				{item.restaurantName}
			</Text>
			<Text style={styles.featuredCuisine} numberOfLines={1}>
				{item.cuisineType} • Park Slope
			</Text>
		</View>
	</TouchableOpacity>
);
const CustomerDashboard = ({ route = {}, navigation }) => {
	const [searchText, setSearchText] = useState("");
	const [activeCategory, setActiveCategory] = useState("all");
	const [allRestaurants, setAllRestaurants] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const debouncedSearchText = useDebounce(searchText, 300);
	const [isSearching, setIsSearching] = useState(false);

	const { currentUserData } = useContext(AuthContext);
	const handleRestaurantPress = (restaurant) => {
		navigation.navigate("RestaurantDetail", { restaurant });
	};

	// In a real app, you would fetch these from your database
	// const [featuredRestaurants, setFeaturedRestaurants] = useState(
	// 	MOCK_FEATURED_RESTAURANTS
	// );
	const [categories, setCategories] = useState(CATEGORIES);

	// Handlers for search and category presses
	const handleSearch = (text) => setSearchText(text);
	const handleCategoryPress = (category) => setActiveCategory(category.value);

	const isActivelySearching = searchText.length > 0;

	useEffect(() => {
		const q = db.collection("restaurants").where("isLive", "==", true);
		const unsubscribe = q.onSnapshot(
			(snapshot) => {
				const liveRestaurants = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setAllRestaurants(liveRestaurants);
				setIsLoading(false);
			},
			(err) => {
				/* ... error handling ... */
			}
		);
		return () => unsubscribe();
	}, []);

	// useMemo hooks to create filtered lists from the single data source.
	const featuredRestaurants = useMemo(
		() => allRestaurants.filter((r) => r.isFeatured),
		[allRestaurants]
	);

	const categoryCounts = useMemo(() => {
		const counts = { all: allRestaurants.length };

		CATEGORIES.forEach((category) => {
			if (category.value !== "all") {
				counts[category.value] = allRestaurants.filter(
					(r) => r.cuisineType?.toLowerCase() === category.value
				).length;
			}
		});

		return counts;
	}, [allRestaurants]);

	const filteredRestaurants = useMemo(() => {
		// Filter by both search text and active category
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

	console.log("current user data", currentUserData);
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
							{currentUserData.firstName}, Welcome to Scerv!
						</Text>
						<Text style={styles.subtitle}>Discover New York's best dining</Text>
					</View>
				</View>

				<View style={styles.searchContainer}>
					<CustomSearchBar
						placeholder="Search for restaurants..."
						value={searchText}
						onChangeText={handleSearch} // ← Memoized handler
					/>
				</View>

				{/* Featured Section Carousel */}
				{!isActivelySearching && featuredRestaurants.length > 0 && (
					<View style={styles.featuredSection}>
						<SectionHeader title="Featured Restaurants" />
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
				{/* Categories Section */}
				{!isActivelySearching && (
					<View style={styles.categoriesContainer}>
						<SectionHeader title="Cuisine" />
						<FlatList
							data={CATEGORIES}
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

				{/* Dynamic section header based on search or category */}
				{isActivelySearching && (
					<View style={styles.sectionHeaderContainer}>
						<SectionHeader
							title={
								debouncedSearchText && debouncedSearchText.length > 0
									? `${filteredRestaurants.length} results for "${debouncedSearchText}"`
									: activeCategory === "all"
									? "All Restaurants"
									: `${filteredRestaurants.length} ${activeCategory} restaurants`
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
			handleRestaurantPress,
			handleCategoryPress,
		]
	);

	return (
		<SafeAreaView style={styles.container}>
			<NotificationBanner />

			{isLoading ? (
				<View
					style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
				>
					<ActivityIndicator size="large" color={colors.primary} />
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
							No restaurants found.
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
	searchContainer: {
		paddingHorizontal: 15,
		paddingVertical: 10, // <-- This adds space above and below
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
});

export default CustomerDashboard;
