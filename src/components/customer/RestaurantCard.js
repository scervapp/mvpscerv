import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from 'react-i18next';
import colors from "../../utils/styles/appStyles";

const RestaurantCard = ({ restaurant, onPress }) => {
	const { t } = useTranslation();
	const isComingSoon = restaurant.isComingSoon === true;
	return (
		<TouchableOpacity
			onPress={onPress}
			style={styles.card}
			disabled={isComingSoon}
		>
			<Image source={{ uri: restaurant.imageUri }} style={styles.thumbnail} />
			{isComingSoon && (
				<View style={styles.overlay}>
					<Text style={styles.overlayText}>{t('coming_soon')}</Text>
				</View>
			)}
			<View style={styles.infoContainer}>
				<Text style={styles.name}>{restaurant.restaurantName}</Text>
				<Text style={styles.address}>
					{restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
					{restaurant.zipcode}
				</Text>
				<Text style={styles.cuisine}>{t('cuisine_label')}: {restaurant.cuisineType}</Text>
			</View>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		backgroundColor: "#FFFFFF",
		borderRadius: 10,
		marginBottom: 10,
		elevation: 3, // Add shadow for Android
		shadowColor: "#000000",
		shadowOpacity: 0.1,
		shadowRadius: 2,
		shadowOffset: {
			width: 0,
			height: 2,
		},
	},
	thumbnail: {
		width: 100,
		height: 100,
		borderRadius: 10,
	},
	infoContainer: {
		flex: 1,
		padding: 10,
	},
	name: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
	},
	address: {
		fontSize: 14,
		color: "#666666",
	},
	cuisine: {
		fontSize: 14,
		color: "#666666",
	},

	overlay: {
		...StyleSheet.absoluteFillObject, // This makes the overlay cover the entire card
		backgroundColor: "rgba(255, 255, 255, 0.7)", // Semi-transparent white
		justifyContent: "center",
		alignItems: "center",
	},
	overlayText: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textMedium,
		borderWidth: 2,
		borderColor: colors.textLight,
		paddingHorizontal: 15,
		paddingVertical: 8,
		borderRadius: 8,
		transform: [{ rotate: "-10deg" }], // A slight angle for style
	},
});

export default RestaurantCard;
