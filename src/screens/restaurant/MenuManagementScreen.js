import React, { useState, useEffect, useContext, useMemo } from "react";
import {
	Text,
	View,
	StyleSheet,
	TouchableOpacity,
	SectionList,
	ActivityIndicator,
	TextInput,
	Keyboard,
	TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AddItemModal from "../../components/restaurant/AddItemModal";
import app, { db } from "../../config/firebase";
import { collection, onSnapshot, where, query } from "firebase/firestore";
import { AuthContext } from "../../context/authContext";
import MenuItem from "../../components/restaurant/MenuItem";
import colors from "../../utils/styles/appStyles";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";

const MenuSectionHeader = ({ title }) => (
	<View style={styles.sectionHeaderContainer}>
		<Text style={styles.sectionHeaderText}>{title}</Text>
	</View>
);

// A better empty state component
const EmptyMenu = ({ onAddItem }) => (
	<View style={styles.emptyContainer}>
		<Ionicons name="document-text-outline" size={80} color={colors.textLight} />
		<Text style={styles.emptyTitle}>Your Menu is Empty</Text>
		<Text style={styles.emptySubtitle}>
			Tap the button below to add your first appetizer, entree, or drink.
		</Text>
		<TouchableOpacity style={styles.emptyButton} onPress={onAddItem}>
			<Text style={styles.emptyButtonText}>Add First Item</Text>
		</TouchableOpacity>
	</View>
);

const MenuManagementScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const insets = useSafeAreaInsets();

	const [showModal, setShowModal] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null); // For editing
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [menuItems, setMenuItems] = useState([]);
	const [searchTerm, setSearchTerm] = useState("");

	// --- Robust Data Fetching ---
	useEffect(() => {
		if (!currentUserData?.uid) {
			setIsLoading(false);
			setError("Could not identify the restaurant. Please try again.");
			return;
		}

		const menuItemsRef = collection(db, "menuItems");
		const q = query(
			menuItemsRef,
			where("restaurantId", "==", currentUserData.uid)
		);

		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				const items = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setMenuItems(items);
				setIsLoading(false);
				setError(null);
			},
			(err) => {
				console.error("MenuManagementScreen snapshot error:", err);
				setError("Failed to load menu. Please check your connection.");
				setIsLoading(false);
			}
		);

		return () => unsubscribe(); // Cleanup on unmount
	}, [currentUserData?.uid]);

	const handleEditItem = (item) => {
		setSelectedItem(item);
		setShowModal(true);
	};

	const handleAddItem = () => {
		setSelectedItem(null); // Ensure we are in "add" mode, not "edit"
		setShowModal(true);
	};

	const processedMenu = useMemo(() => {
		// Filter based on search term first
		const filteredItems = searchTerm
			? menuItems.filter((item) =>
					item.name.toLowerCase().includes(searchTerm.toLowerCase())
			  )
			: menuItems;

		if (filteredItems.length === 0) return [];

		// Group items by category
		const grouped = filteredItems.reduce((acc, item) => {
			const category = item.category || "Uncategorized";
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(item);
			return acc;
		}, {});

		// Define a preferred order for categories
		const categoryOrder = [
			"Daily Special",
			"Appetizers",
			"Entrees",
			"Desserts",
			"Drinks",
			"Beer",
			"Wine",
			"Cocktails",
			"Spirits",
			"Non-Alcoholic Drinks",
		];

		// Create the final structure for the SectionList
		return Object.keys(grouped)
			.sort((a, b) => {
				const indexA = categoryOrder.indexOf(a);
				const indexB = categoryOrder.indexOf(b);
				if (indexA > -1 && indexB > -1) return indexA - indexB; // Both are in the preferred list
				if (indexA > -1) return -1; // A is preferred, B is not
				if (indexB > -1) return 1; // B is preferred, A is not
				return a.localeCompare(b); // Neither is preferred, sort alphabetically
			})
			.map((category) => ({
				title: category,
				data: grouped[category],
			}));
	}, [menuItems, searchTerm]);

	const renderMenuItem = ({ item }) => (
		// Pass the handleEditItem function to the MenuItem component
		<MenuItem
			item={item}
			restaurantId={currentUserData.uid}
			onEdit={() => handleEditItem(item)}
		/>
	);
	if (isLoading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>{error}</Text>
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
				<View style={styles.container}>
					{/* --- Header --- */}
					<View style={styles.header}>
						<Text style={styles.headerTitle}>Manage Menu</Text>
						<TouchableOpacity
							style={styles.headerButton}
							onPress={handleAddItem}
						>
							<Ionicons name="add" size={24} color={colors.primary} />
							<Text style={styles.headerButtonText}>Add Item</Text>
						</TouchableOpacity>
					</View>

					{/* --- Search Bar --- */}
					<View style={styles.searchContainer}>
						<Ionicons
							name="search"
							size={20}
							color={colors.textLight}
							style={styles.searchIcon}
						/>
						<TextInput
							style={styles.searchInput}
							placeholder="Search for a dish..."
							placeholderTextColor={colors.textLight}
							value={searchTerm}
							onChangeText={setSearchTerm}
						/>
					</View>

					{/* --- THIS IS THE FIX --- */}
					{/* This container View now has `flex: 1`, which allows its children (the list or empty states) to expand and scroll correctly. */}
					<View style={{ flex: 1 }}>
						{menuItems.length === 0 ? (
							<EmptyMenu onAddItem={handleAddItem} />
						) : processedMenu.length === 0 ? (
							<View style={styles.emptyContainer}>
								<Text style={styles.emptyTitle}>No Results Found</Text>
								<Text style={styles.emptySubtitle}>
									No menu items match your search for "{searchTerm}".
								</Text>
							</View>
						) : (
							<SectionList
								sections={processedMenu}
								renderItem={renderMenuItem}
								keyExtractor={(item, index) => item.id + index}
								renderSectionHeader={({ section: { title } }) => (
									<MenuSectionHeader title={title} />
								)}
								contentContainerStyle={styles.menuList}
								keyboardShouldPersistTaps="handled"
							/>
						)}
					</View>

					{/* --- Add/Edit Item Modal --- */}
					<AddItemModal
						isVisible={showModal}
						onClose={() => setShowModal(false)}
						itemToEdit={selectedItem}
					/>
				</View>
			</TouchableWithoutFeedback>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: colors.surfaceWhite,
	},
	container: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
	},
	headerTitle: { fontSize: 24, fontWeight: "bold", color: colors.textDark },
	headerButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary + "20",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
	},
	headerButtonText: {
		color: colors.primary,
		fontWeight: "bold",
		fontSize: 14,
		marginLeft: 4,
	},
	searchContainer: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		marginHorizontal: 20,
		marginVertical: 15,
		paddingHorizontal: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	searchIcon: { marginRight: 10 },
	searchInput: { flex: 1, height: 45, fontSize: 16, color: colors.textDark },
	menuList: {
		paddingHorizontal: 20,
		paddingBottom: 40,
	},
	sectionHeaderContainer: {
		paddingTop: 10,
		paddingBottom: 10,
		backgroundColor: colors.backgroundLight,
	},
	sectionHeaderText: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 40,
	},
	emptyTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		marginTop: 15,
		textAlign: "center",
	},
	emptySubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 8,
	},
	emptyButton: {
		backgroundColor: colors.primary,
		paddingVertical: 12,
		paddingHorizontal: 30,
		borderRadius: 25,
		marginTop: 25,
	},
	emptyButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold" },
	errorText: { fontSize: 16, color: colors.statusDanger },
});

export default MenuManagementScreen;

