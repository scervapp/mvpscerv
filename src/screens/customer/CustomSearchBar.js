import React, { useState } from "react";
import {
	View,
	TextInput,
	StyleSheet,
	TouchableOpacity,
	Text,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import colors from "../../utils/styles/appStyles";

const CustomSearchBar = ({ value, onChangeText, placeholder }) => {
	return (
		<View style={styles.searchBarContainer}>
			<Icon name="search" size={24} color="#888" style={styles.icon} />
			<TextInput
				style={styles.textInput}
				placeholder={placeholder || "Search..."}
				value={value} // Use the value from props
				onChangeText={onChangeText} // Use the handler from props
				clearButtonMode="while-editing"
				placeholderTextColor={colors.textMedium}
			/>
			{value &&
				value.length > 0 && ( // Check the value from props
					<TouchableOpacity onPress={() => onChangeText("")}>
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
