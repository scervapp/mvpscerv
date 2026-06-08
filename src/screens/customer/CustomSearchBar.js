import React from "react";
import { View, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";

const CustomSearchBar = ({ value, onChangeText, placeholder }) => {
	const { t } = useTranslation();
	return (
		<View style={styles.searchBarContainer}>
			<Icon
				name="search"
				size={22}
				color={colors.primary}
				style={styles.icon}
			/>
			<TextInput
				style={styles.textInput}
				placeholder={placeholder || t("search")}
				value={value}
				onChangeText={onChangeText}
				clearButtonMode="while-editing"
				placeholderTextColor={colors.textMedium}
				returnKeyType="search"
			/>
			{value && value.length > 0 ? (
				<TouchableOpacity
					onPress={() => onChangeText("")}
					style={styles.clearButton}
				>
					<Icon name="close" size={18} color={colors.textMedium} />
				</TouchableOpacity>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	searchBarContainer: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#DDE7E9",
		paddingHorizontal: 13,
		height: 52,
		width: "100%",
	},
	textInput: {
		flex: 1,
		fontSize: 16,
		fontWeight: "700",
		paddingLeft: 10,
		color: colors.textDark,
	},
	icon: {
		marginRight: 4,
	},
	clearButton: {
		width: 30,
		height: 30,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F1F5F9",
	},
});

export default CustomSearchBar;
