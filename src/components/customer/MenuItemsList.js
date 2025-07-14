import React, { useContext, useEffect, useMemo, useState } from "react";
import {
	View,
	Text,
	ActivityIndicator,
	StyleSheet,
	Image,
	TouchableOpacity,
	Modal,
	Alert,
	SectionList,
	TextInput,
	ScrollView,
} from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { Button, Snackbar } from "react-native-paper";
import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";
import SelectedItemModal from "./SelectedItemModal";
import colors from "../../utils/styles/appStyles";
import { Tooltip } from "react-native-elements";
import formatCurrency from "../../utils/currencyFormatter";

const MenuItemRow = ({ item, onPress }) => {
	// Helper to safely format currency
	const formatCurrency = (price) => {
		if (typeof price !== "number" || isNaN(price)) return "N/A";
		return `$${price.toFixed(2)}`;
	};

	return (
		<TouchableOpacity onPress={onPress} style={styles.menuItem}>
			<View style={styles.contentContainer}>
				{/* Name and Price are no longer in a separate "titleRow" View */}
				<Text style={styles.name}>{item.name}</Text>
				{item.description ? (
					<Text style={styles.description} numberOfLines={2}>
						{item.description}
					</Text>
				) : null}
				<Text style={styles.price}>{formatCurrency(item.price)}</Text>
			</View>
			{item.imageUri && (
				<Image
					source={{ uri: item.imageUri }}
					style={styles.image}
					resizeMode="cover"
				/>
			)}
		</TouchableOpacity>
	);
};

const MenuItemsList = ({
	menuItems,
	isLoading,
	restaurantId,
	pips,
	ListHeaderComponent,
	onConfirmAddItemToContext,
	orderingMode = "individual",

	partyData,
}) => {
	const { currentUserData } = useContext(AuthContext);

	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

	const isGuest = currentUserData?.role === "guest";

	const handleSelectItem = (menuItem) => {
		if (isGuest) {
			Alert.alert("Login Required", "Please log in or sign up to add items.");
			return;
		}
		setSelectedItem(menuItem);
		setIsModalVisible(true);
	};

	// This callback is triggered from the modal and calls the function passed down from the parent screen.
	const handleModalConfirm = async (itemDataFromModal) => {
		setIsSubmitting(true);
		try {
			// The parent (RestaurantDetails or PartySession) provides this function, which contains the correct logic.
			await onConfirmAddItemToContext(itemDataFromModal);
			setSnackbar({
				visible: true,
				message: `Added to your ${
					orderingMode === "party" ? "party" : "individual"
				} order!`,
			});
		} catch (error) {
			console.error("MenuItemsList: Error confirming item add:", error);
			Alert.alert("Error", `Could not add item: ${error.message}`);
		} finally {
			setIsSubmitting(false);
			setIsModalVisible(false);
		}
	};

	// This useMemo hook efficiently processes the flat menuItems array into sections for the SectionList.
	const menuSections = useMemo(() => {
		if (!menuItems || menuItems.length === 0) return [];

		const grouped = menuItems.reduce((acc, item) => {
			const category = item.isDailySpecial
				? "Daily Special"
				: item.category || "Other";
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(item);
			return acc;
		}, {});

		const categoryOrder = [
			"Daily Special",
			"Appetizers",
			"Entrees",
			"Desserts",
			"Sides",
			"Drinks",
			"Beer",
			"Wine",
			"Cocktails",
			"Non-Alcoholic Drinks",
			"Other",
		];

		return Object.keys(grouped)
			.sort((a, b) => {
				const indexA = categoryOrder.indexOf(a);
				const indexB = categoryOrder.indexOf(b);
				if (indexA === -1 && indexB > -1) return 1; // B is preferred
				if (indexA > -1 && indexB === -1) return -1; // A is preferred
				return indexA - indexB; // Both are preferred, sort by order
			})
			.map((category) => ({
				title: category,
				data: grouped[category],
			}))
			.filter((section) => section.data.length > 0);
	}, [menuItems]);

	if (isLoading) {
		return (
			<ScrollView>
				{ListHeaderComponent}
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={{ marginTop: 30 }}
				/>
			</ScrollView>
		);
	}

	if (!menuItems || menuItems.length === 0) {
		return (
			<Text style={styles.noItemsText}>
				No menu items found for this restaurant.
			</Text>
		);
	}
	return (
		<View style={styles.container}>
			<SectionList
				sections={menuSections}
				keyExtractor={(item, index) => item.id + index}
				renderItem={({ item }) => (
					<MenuItemRow item={item} onPress={() => handleSelectItem(item)} />
				)}
				renderSectionHeader={({ section: { title } }) => (
					<Text style={styles.menuCategoryHeader}>{title}</Text>
				)}
				ListHeaderComponent={ListHeaderComponent}
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingBottom: 20 }}
			/>

			{selectedItem && (
				<SelectedItemModal
					visible={isModalVisible}
					selectedItem={selectedItem}
					pips={pips || []}
					onClose={() => setIsModalVisible(false)}
					onConfirm={handleModalConfirm}
					orderingMode={orderingMode} // Pass the mode to the modal
					isLoading={isSubmitting}
					partyData={partyData} // Pass party data to the modal
				/>
			)}

			<Snackbar
				visible={snackbar.visible}
				onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
				duration={2000}
				style={{ backgroundColor: colors.statusSuccess }}
			>
				<Text style={{ color: colors.surfaceWhite }}>{snackbar.message}</Text>
			</Snackbar>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	noItemsText: {
		textAlign: "center",
		marginTop: 30,
		fontSize: 16,
		color: colors.textLight,
		paddingHorizontal: 20,
	},
	menuCategoryHeader: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
		paddingVertical: 15,
		paddingHorizontal: 20,
		backgroundColor: colors.backgroundLight,
	},
	menuItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 15,
		paddingHorizontal: 20,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	contentContainer: {
		flex: 1,
		marginRight: 10,
	},
	name: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
	},
	description: {
		fontSize: 14,
		color: colors.textMedium,
		marginTop: 4,
	},
	price: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.primary,
		marginTop: 8, // Price is back on its own line with margin
	},
	image: {
		width: 80,
		height: 80,
		borderRadius: 8,
		backgroundColor: colors.backgroundMedium,
	},
});

export default MenuItemsList;
