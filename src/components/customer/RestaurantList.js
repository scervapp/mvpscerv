import React, { useEffect, useState, useMemo } from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	ActivityIndicator,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { fetchRestaurants } from "../../utils/customerUtils";
import RestaurantCard from "./RestaurantCard";

import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";

const RestaurantList = ({
	data,
	horizontal = false,
	isLoading,
	error,
	listType,
}) => {
	const navigation = useNavigation();

	const handleRestaurantPress = (restaurant) => {
		navigation.navigate("RestaurantDetail", { restaurant });
	};

	if (isLoading) {
		return (
			<View style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.centeredContainer}>
				<Text style={styles.errorText}>{error}</Text>
			</View>
		);
	}

	if (!data || data.length === 0) {
		// Display a different message based on the context of the list
		const message =
			listType === "search"
				? "No results found."
				: "No restaurants available yet.";
		return (
			<View style={styles.centeredContainer}>
				<Text style={styles.noResultsText}>{message}</Text>
			</View>
		);
	}

	return (
		<FlatList
			data={data}
			renderItem={({ item }) => (
				<RestaurantCard
					restaurant={item}
					onPress={() => handleRestaurantPress(item)}
				/>
			)}
			keyExtractor={(item) => item.id}
			horizontal={horizontal}
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.listContentContainer}
		/>
	);
};

const styles = StyleSheet.create({
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	listContentContainer: {
		paddingVertical: 10,
		paddingHorizontal: 5, // Add some horizontal padding for the cards
	},
	loadingText: {
		marginTop: 10,
		fontSize: 16,
		color: colors.textMedium,
	},
	errorText: {
		fontSize: 16,
		color: colors.statusDanger,
		textAlign: "center",
	},
	noResultsText: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textMedium,
		textAlign: "center",
	},
	noResultsSubText: {
		fontSize: 14,
		color: colors.textLight,
		textAlign: "center",
		marginTop: 8,
	},
});

export default RestaurantList;
