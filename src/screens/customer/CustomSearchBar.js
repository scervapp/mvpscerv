import React, { useState } from "react";
import {
	View,
	TextInput,
	StyleSheet,
	TouchableOpacity,
	Text,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";

const CustomSearchBar = ({ placeholder, onSearch }) => {
	const [searchText, setSearchText] = useState("");

	const handleSearch = (text) => {
		setSearchText(text);
		onSearch && onSearch(text); // Trigger the search action
	};

	return (
		<View style={styles.searchBarContainer}>
			<Icon name="search" size={24} color="#888" style={styles.icon} />
			<TextInput
				style={styles.textInput}
				placeholder={placeholder || "Search..."}
				value={searchText}
				onChangeText={handleSearch}
				clearButtonMode="while-editing"
			/>
			{searchText.length > 0 && (
				<TouchableOpacity onPress={() => handleSearch("")}>
					<Icon name="close" size={20} color="#888" />
				</TouchableOpacity>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	searchBarContainer: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "white",
		borderRadius: 8,
		paddingHorizontal: 10,
		height: 40,
		width: "100%",

		marginTop: 80,
	},
	textInput: {
		flex: 1,
		fontSize: 16,
		paddingLeft: 10,
		color: "#333",
	},
	icon: {
		marginRight: 8,
	},
});

export default CustomSearchBar;
