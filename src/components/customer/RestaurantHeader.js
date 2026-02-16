// src/components/customer/RestaurantHeader.js
import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTranslation } from 'react-i18next';
import colors from "../../utils/styles/appStyles"; // Adjust path if needed

const RestaurantHeader = ({ restaurant, initialView, renderActionButtons }) => {
	const { t } = useTranslation();
	// If it's the special 'menuForParty' view, we don't render anything.
	if (initialView === "menuForParty") {
		return null;
	}

	return (
		<View>
			<Image source={{ uri: restaurant.imageUri }} style={styles.image} />
			<View style={styles.infoContainer}>
				<Text style={styles.name}>{restaurant.restaurantName}</Text>
				<Text style={styles.address}>
					{restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
					{restaurant.zipcode}
				</Text>
				<Text style={styles.cuisine}>{t('cuisine_label')}: {restaurant.cuisineType}</Text>
			</View>

			{/* The parent screen provides this function to render the correct buttons */}
			{renderActionButtons()}

			{/* The "Menu" title is the last part of the header */}
			<View style={styles.menuSection}>
				<Text style={styles.menuHeader}>{t('menu_title')}</Text>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	image: { width: "100%", height: 250 },
	infoContainer: {
		padding: 20,
		paddingBottom: 15,
		backgroundColor: colors.surfaceWhite,
	},
	name: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 5,
		color: colors.textDark,
	},
	address: {
		fontSize: 16,
		color: colors.textMedium,
	},
	cuisine: {
		fontSize: 16,
		color: colors.textMedium,
		fontStyle: "italic",
		marginTop: 5,
	},
	menuSection: {
		marginTop: 10,
	},
	menuHeader: {
		fontSize: 22,
		fontWeight: "bold",
		marginBottom: 10,
		paddingHorizontal: 20,
		color: colors.textDark,
	},
});

export default RestaurantHeader;
