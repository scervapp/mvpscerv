import React, { useEffect, useState } from "react";
import {
	View,
	Text,
	FlatList,
	TouchableOpacity,
	Image,
	StyleSheet,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { fetchRestaurants } from "../../utils/customerUtils";
import RestaurantCard from "./RestaurantCard";

const RestaurantList = () => {
	const [restaurants, setRestaurants] = useState([]);
	const [loading, setLoading] = useState(false);

	const navigation = useNavigation();

	useEffect(() => {
		setLoading(true);
		fetchRestaurants()
			.then((data) => setRestaurants(data))
			.catch((error) => console.log("Error fatching restaurants", error))
			.finally(() => setLoading(false));
	}, []);

	const renderItem = ({ item }) => (
		<RestaurantCard
			restaurant={item}
			onPress={() => handleRestaurantPress(item)}
		/>
	);

	const handleRestaurantPress = (restaurant) => {
		navigation.navigate("RestaurantDetails", {
			screen: "RestaurantDetail",
			params: { restaurant },
		});
	};

	return (
		<View style={styles.container}>
			<FlatList
				data={restaurants}
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
