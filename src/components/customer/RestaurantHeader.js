// src/components/customer/RestaurantHeader.js
import React from "react";
import { View, Text, ImageBackground, StyleSheet } from "react-native";
import colors from "../../utils/styles/appStyles"; // Adjust path if needed

const RestaurantHeader = ({ restaurant, initialView, renderActionButtons }) => {
	// If it's the special 'menuForParty' view, we don't render anything.
	if (initialView === "menuForParty") {
		return null;
	}

	return (
		<View>
			<ImageBackground
				source={{ uri: restaurant.imageUri }}
				style={styles.image}
				imageStyle={styles.imageRadius}
			>
				<View style={styles.imageShade} />
				<View style={styles.heroContent}>
					{restaurant.cuisineType ? (
						<View style={styles.cuisineBadge}>
							<Text style={styles.cuisineBadgeText}>
								{restaurant.cuisineType}
							</Text>
						</View>
					) : null}
					<Text style={styles.name}>{restaurant.restaurantName}</Text>
					<Text style={styles.address} numberOfLines={2}>
						{restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
						{restaurant.zipcode}
					</Text>
				</View>
			</ImageBackground>

			{/* The parent screen provides this function to render the correct buttons */}
			{renderActionButtons()}
		</View>
	);
};

const styles = StyleSheet.create({
	image: {
		width: "100%",
		height: 270,
		justifyContent: "flex-end",
		backgroundColor: colors.textDark,
	},
	imageRadius: { resizeMode: "cover" },
	imageShade: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0,0,0,0.32)",
	},
	heroContent: {
		paddingHorizontal: 20,
		paddingBottom: 22,
	},
	cuisineBadge: {
		alignSelf: "flex-start",
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 8,
		backgroundColor: "rgba(255,255,255,0.9)",
		marginBottom: 10,
	},
	cuisineBadgeText: {
		color: colors.textDark,
		fontSize: 12,
		fontWeight: "900",
	},
	name: {
		fontSize: 30,
		fontWeight: "900",
		color: "#fff",
	},
	address: {
		fontSize: 14,
		color: "rgba(255,255,255,0.9)",
		marginTop: 6,
		lineHeight: 20,
	},
});

export default RestaurantHeader;
