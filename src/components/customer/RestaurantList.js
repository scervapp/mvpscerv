import React, { useEffect, useState } from "react";
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

const RestaurantList = ({ searchText }) => {
	const [restaurants, setRestaurants] = useState([]);
	const [loading, setLoading] = useState(false);
	const [filteredRestaurants, setFilteredRestaurants] = useState([]);

	const navigation = useNavigation();

	useEffect(() => {
		const fetchRestaurantsData = async () => {
			try {
				const data = await fetchRestaurants();
				setRestaurants(data);
				setFilteredRestaurants(data);
			} catch (error) {
				console.log("Error fetching restaurants", error);
			} finally {
				setLoading(false);
			}
		};

		fetchRestaurantsData();
	}, []);

	useEffect(() => {
		const filtered = restaurants.filter((restaurant) => {
			const lowerCaseSearch = searchText.toLowerCase();
			return (
				(restaurant.restaurantName &&
					restaurant.restaurantName.toLowerCase().includes(lowerCaseSearch)) ||
				(restaurant.cuisineType &&
					restaurant.cuisineType.toLowerCase().includes(lowerCaseSearch)) ||
				(restaurant.city &&
					restaurant.city.toLowerCase().includes(lowerCaseSearch)) ||
				(restaurant.zipcode &&
					restaurant.zipcode.toLowerCase().includes(lowerCaseSearch))
			);
		});
		setFilteredRestaurants(filtered);
	}, [searchText, restaurants]);

	const renderItem = ({ item }) => (
		<RestaurantCard
			restaurant={item}
			onPress={() => handleRestaurantPress(item)}
		/>
	);

	const handleRestaurantPress = (restaurant) => {
		navigation.navigate("RestaurantDetail", { restaurant });
	};
	if (loading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<FlatList
				data={filteredRestaurants}
				renderItem={renderItem}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.listContentContainer}
				showsVerticalScrollIndicator={false} // Hide the scroll bar
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		width: "100%", // Take up the full width of the parent container
		paddingHorizontal: 10,
	},
	listContentContainer: {
		flexGrow: 1, // Allow the list to grow vertically as needed
	},
	restaurantItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#CCCCCC",
	},
	thumbnail: {
		width: 80,
		height: 80,
		borderRadius: 10,
		marginRight: 10,
	},
	restaurantInfo: {
		flex: 1,
	},
	restaurantName: {
		fontWeight: "bold",
		fontSize: 16,
		marginBottom: 5,
	},
	address: {
		marginBottom: 5,
	},
	cuisine: {
		color: "#666666",
	},
});

export default RestaurantList;
