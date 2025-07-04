import React, { useEffect, useState, useMemo } from "react";
import {
	View,
	Text,
	FlatList,
	TouchableOpacity,
	Image,
	StyleSheet,
	ActivityIndicator,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { fetchRestaurants } from "../../utils/customerUtils";
import RestaurantCard from "./RestaurantCard";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";

const RestaurantList = ({ searchText, initialRestaurantData }) => {
	const [allRestaurants, setAllRestaurants] = useState(
		initialRestaurantData || []
	);
	const [isLoading, setIsLoading] = useState(!initialRestaurantData);
	const [error, setError] = useState(null);
	const navigation = useNavigation();

	// This useEffect sets up the real-time listener for live restaurants.
	useEffect(() => {
		setIsLoading(true);
		const restaurantsRef = collection(db, "restaurants");

		// This query is the key: it only fetches restaurants that are NOT test accounts.
		const q = query(restaurantsRef, where("isPublic", "==", true));

		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				const liveRestaurants = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setAllRestaurants(liveRestaurants);
				setIsLoading(false);
				setError(null);
			},
			(err) => {
				console.error("Error fetching live restaurants:", err);
				setError("Could not load available restaurants.");
				setIsLoading(false);
			}
		);

		// Cleanup the listener when the component is unmounted
		return () => unsubscribe();
	}, []); // Empty dependency array means this runs once on mount

	// Use useMemo to efficiently filter the list only when the data or search term changes
	const filteredRestaurants = useMemo(() => {
		if (!searchText) {
			return allRestaurants;
		}
		return allRestaurants.filter(
			(restaurant) =>
				(restaurant.restaurantName || "")
					.toLowerCase()
					.includes(searchText.toLowerCase()) ||
				(restaurant.cuisineType || "")
					.toLowerCase()
					.includes(searchText.toLowerCase())
		);
	}, [allRestaurants, searchText]);

	const handleRestaurantPress = (restaurant) => {
		navigation.navigate("RestaurantDetail", { restaurant });
	};

	if (isLoading) {
		return (
			<View style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>Finding Restaurants...</Text>
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.centeredContainer}>
				<Text style={styles.errorText}>{error}</Text>
			</View>
		);
	}

	if (filteredRestaurants.length === 0) {
		return (
			<View style={styles.centeredContainer}>
				<Text style={styles.noResultsText}>
					{searchText
						? `No results for "${searchText}"`
						: "No Restaurants Available"}
				</Text>
				<Text style={styles.noResultsSubText}>
					{searchText
						? "Try a different search term."
						: "Please check back later!"}
				</Text>
			</View>
		);
	}

	return (
		<FlatList
			data={filteredRestaurants}
			renderItem={({ item }) => (
				<RestaurantCard
					restaurant={item}
					onPress={() => handleRestaurantPress(item)}
				/>
			)}
			keyExtractor={(item) => item.id}
			contentContainerStyle={styles.listContentContainer}
			showsVerticalScrollIndicator={false}
		/>
	);
};

const styles = StyleSheet.create({
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	listContentContainer: {
		paddingVertical: 10,
		paddingHorizontal: 5, // Add some horizontal padding for the cards
	},
	loadingText: {
		marginTop: 10,
		fontSize: 16,
		color: colors.textMedium,
	},
	errorText: {
		fontSize: 16,
		color: colors.statusDanger,
		textAlign: "center",
	},
	noResultsText: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textMedium,
		textAlign: "center",
	},
	noResultsSubText: {
		fontSize: 14,
		color: colors.textLight,
		textAlign: "center",
		marginTop: 8,
	},
});

export default RestaurantList;
