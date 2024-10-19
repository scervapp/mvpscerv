import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	Image,
	TouchableOpacity,
} from "react-native";

import { Button, SearchBar } from "react-native-elements";
import RestaurantList from "../../components/customer/RestaurantList";
import { AuthContext } from "../../context/authContext";

const CustomerDashboard = ({ route, navigation }) => {
	const [searchText, setSearchText] = useState("");
	const { logout } = useContext(AuthContext);

	const handleSearch = (text) => {
		setSearchText(text);
	};

	return (
		<View style={styles.container}>
			<SearchBar
				placeholder="Search for restaurants..."
				onChangeText={handleSearch}
				containerStyle={styles.searchBar}
				inputContainerStyle={{ backgroundColor: "#FFFFFF" }}
				inputStyle={{ color: "#000000" }}
				value={searchText}
			/>
			<RestaurantList searchText={searchText} />
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingTop: 20,
	},
	text: {
		fontSize: 24,
		fontWeight: "bold",
	},
	searchBar: {
		backgroundColor: "transparent",
		borderBottomColor: "transparent",
		borderTopColor: "transparent",
		paddingHorizontal: 20,
		marginBottom: 20,
	},
});

export default CustomerDashboard;
