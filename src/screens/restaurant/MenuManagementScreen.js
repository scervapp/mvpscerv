import React, { useState, useEffect, useContext } from "react";
import {
	Text,
	View,
	StyleSheet,
	TouchableOpacity,
	FlatList,
	Image,
	Alert,
	SectionList,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AddItemModal from "../../components/restaurant/AddItemModal";
import app from "../../config/firebase";
import {
	getFirestore,
	doc,
	getDoc,
	setDoc,
	addDoc,
	collection,
	updateDoc,
	getDocs,
	onSnapshot,
	where,
	query,
} from "firebase/firestore";
import { AuthContext } from "../../context/authContext";
import MenuItem from "../../components/restaurant/MenuItem";
import colors from "../../utils/styles/appStyles";

const MenuManagementScreen = () => {
	const [showModal, setShowModal] = useState(false);
	const [menuItems, setMenuItems] = useState([]);

	const { isLoading, currentUserData } = useContext(AuthContext);
	const db = getFirestore(app);

	useEffect(() => {
		const fetchMenuItems = async () => {
			try {
				const menuItemsRef = collection(db, "menuItems");
				const queryRest = query(
					menuItemsRef,
					where("restaurantId", "==", currentUserData.uid)
				);
				const unsubscribe = onSnapshot(queryRest, (snapshot) => {
					let menuItemsData = [];
					snapshot.forEach((doc) => {
						menuItemsData.push({ id: doc.id, ...doc.data() });
					});
					// set the menuItemsData array as the state
					setMenuItems(menuItemsData);
				});

				// Clean up the listener when the component unmounts
				return () => unsubscribe();
			} catch (error) {
				console.log("Error fetching menu items:", error);
				Alert.alert("Error", "There was an error fetching the menu items.");
			}
		};
		fetchMenuItems();
	}, []);

	const sortMenuItems = (menuItems) => {
		const categories = {};

		menuItems.forEach((item) => {
			const category = item.category;
			if (!categories[category]) {
				categories[category] = [];
			}
			categories[category].push(item);
		});

		const sortedMenu = [
			{
				category: "Daily Special",
				data: menuItems.filter((item) => item.isDailySpecial),
			},
			{ category: "Appetizer", data: categories["Appetizer"] || [] },
			{ category: "Entree", data: categories["Entree"] || [] },
			{ category: "Dessert", data: categories["Dessert"] || [] },
			{ category: "Drinks", data: categories["Drinks"] || [] },
			{
				category: "Alcoholic Drinks",
				data: categories["Alcoholic Drinks"] || [], // Note: Adjust category name if needed
			},
			{
				category: "Alcoholic Drinks",
				data: categories["Non-Alcoholic Drinks"] || [], // Note: Adjust category name if needed
			},
		];

		return sortedMenu.filter((category) => category.data.length > 0);
	};

	const renderMenuItem = ({ item }) => (
		<MenuItem item={item} restaurantId={currentUserData.uid} />
	);

	return (
		<View style={styles.container}>
			{isLoading ? (
				<ActivityIndicator size="large" color={colors.primary} /> // Loading indicator
			) : (
				<SectionList // Use SectionList to render grouped menu items
					sections={sortMenuItems(menuItems)}
					renderItem={renderMenuItem}
					keyExtractor={(item, index) => item.id.toString() + index}
					renderSectionHeader={({ section: { category } }) => (
						<Text style={styles.sectionHeader}>{category}</Text>
					)}
					contentContainerStyle={styles.menuList}
				/>
			)}

			{/* Add Item Button */}
			<TouchableOpacity
				style={styles.addButton}
				onPress={() => setShowModal(true)}
			>
				<MaterialCommunityIcons
					name="plus-thick"
					size={40}
					color={colors.primary}
				/>
			</TouchableOpacity>

			{/* Add Item Modal */}
			<AddItemModal isVisible={showModal} onClose={() => setShowModal(false)} />
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background, // Use your background color
		padding: 20,
	},
	menuList: {
		paddingBottom: 80, // Add padding to avoid overlap with the button
	},
	addButton: {
		position: "absolute",
		bottom: 20,
		right: 20,
		backgroundColor: "white",
		borderRadius: 50,
		padding: 10,
		shadowColor: "#000", // Add shadow (iOS)
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 4,
		elevation: 3, // Add shadow (Android)
	},
	sectionHeader: {
		backgroundColor: "#f0f0f0", // Light gray background for the header
		padding: 10,
		fontSize: 18,
		fontWeight: "bold",
		borderTopWidth: 1,
		borderTopColor: "#ddd",
	},
});
export default MenuManagementScreen;
