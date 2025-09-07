import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	Image,
	FlatList,
	SafeAreaView,
} from "react-native";

import RestaurantList from "../../components/customer/RestaurantList";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

import CustomSearchBar from "./CustomSearchBar";
import { NotificationBanner } from "../../utils/NotificationBanner";
import { useDebounce } from "../../hooks/useBounce";

const CustomerDashboard = ({ route = {}, navigation }) => {
	const { initialRestaurantData = [] } = route.params || {};
	const [searchText, setSearchText] = useState("");
	const [showRestaurantList, setShowRestaurantList] = useState(false);
	const { logout, currentUserData } = useContext(AuthContext);

	const debouncedSearchText = useDebounce(searchText, 300);

	const handleSearch = (text) => {
		setSearchText(text);
		setShowRestaurantList(text.length > 0);
	};

	// Instead of ScrollView, use FlatList to handle both instructions and the restaurant list

	const ListHeader = () => (
		<>
			<Image source={require("../../../assets/icon.png")} style={styles.logo} />
			<Text style={styles.welcomeText}>Welcome to Scerv!</Text>
			<Text style={styles.instructionsText}>
				Find your favorite restaurants and explore their menus.
			</Text>
		</>
	);

	return (
		<SafeAreaView style={styles.container}>
			<NotificationBanner />

			{/* The search bar is now a persistent header */}
			<View style={styles.searchContainer}>
				<CustomSearchBar
					placeholder="Search for restaurants..."
					onSearch={setSearchText} // Directly set the search text
				/>
			</View>
			{/* --- REFINED: A single FlatList for all content --- */}
			{/* If the debounced search text is empty, we show the header. */}
			{/* If there is search text, we render the RestaurantList. */}
			{!debouncedSearchText ? (
				<ListHeader />
			) : (
				<RestaurantList
					currentUserData={currentUserData}
					searchText={debouncedSearchText}
					navigation={navigation}
					initialRestaurantData={initialRestaurantData}
				/>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	searchContainer: {
		paddingHorizontal: 20,
		paddingTop: 10,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	logo: {
		width: 60,
		height: 60,
		resizeMode: "contain",
		alignSelf: "center",
		marginTop: 40,
		marginBottom: 20,
	},
	welcomeText: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.primary,
		textAlign: "center",
		marginBottom: 10,
	},
	instructionsText: {
		fontSize: 16,
		color: colors.textDark,
		textAlign: "center",
		marginHorizontal: 20,
		paddingTop: 20,
	},
});

export default CustomerDashboard;
