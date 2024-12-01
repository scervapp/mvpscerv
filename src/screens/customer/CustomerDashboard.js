import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	Image,
	TouchableOpacity,
	ImageBackground,
	FlatList,
} from "react-native";

import { Button, SearchBar } from "react-native-elements";
import RestaurantList from "../../components/customer/RestaurantList";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

import backgroundSearchImage from "../../../assets/backgroundSearch.png";
import CustomSearchBar from "./CustomSearchBar";

const CustomerDashboard = ({ route, navigation }) => {
	const [searchText, setSearchText] = useState("");
	const [showRestaurantList, setShowRestaurantList] = useState(false);
	const { logout } = useContext(AuthContext);

	const handleSearch = (text) => {
		setSearchText(text);
		setShowRestaurantList(text.length > 0);
	};

	// Instead of ScrollView, use FlatList to handle both instructions and the restaurant list
	const renderItem = ({ item }) => (
		<RestaurantList searchText={searchText} navigation={navigation} />
	);

	const instructions = [
		{
			key: "welcomeText",
			text: "Welcome to Scerv!",
			style: styles.welcomeText,
		},
		{
			key: "instructionsText",
			text: "Find your favorite restaurants and explore their menus. Start by typing in the search bar below!",
			style: styles.instructionsText,
		},
	];

	return (
		<View style={styles.container}>
			{/* Logo at the top */}
			<Image source={require("../../../assets/icon.png")} style={styles.logo} />

			{/* Instructions */}
			{instructions.map((item) => (
				<Text key={item.key} style={item.style}>
					{item.text}
				</Text>
			))}

			{/* Search Bar */}
			<View style={styles.searchContainer}>
				<CustomSearchBar
					placeholder="Search for restaurants..."
					onSearch={handleSearch}
				/>
			</View>

			{/* Only show RestaurantList if searchText has value */}
			{showRestaurantList && (
				<FlatList
					data={[{ key: "restaurants" }]} // Placeholder to render restaurant list
					renderItem={() => (
						<RestaurantList searchText={searchText} navigation={navigation} />
					)}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background, // Solid background color
		paddingHorizontal: 20,
	},
	logo: {
		width: 50,
		height: 50,
		resizeMode: "contain",
		alignSelf: "center",
		marginTop: 40, // Space from the top of the screen
		marginBottom: 20,
	},
	instructionsContainer: {
		marginTop: 30, // Space between logo and instructions
		alignItems: "center",
	},
	welcomeText: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 10,
		textAlign: "center",
	},
	instructionsText: {
		fontSize: 16,
		color: colors.textSecondary,
		textAlign: "center",
		marginHorizontal: 10,
	},

	placeholderContainer: {
		marginTop: 20,
		alignItems: "center",
	},
	searchContainer: {
		width: "100%", // Ensures the container takes up the full width
		marginBottom: 20, // Adds space below the search bar
	},
});

export default CustomerDashboard;
