import React, { useContext, useEffect, useState } from "react";
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
} from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { Button, Snackbar } from "react-native-paper";
import { AuthContext } from "../../context/authContext";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import SelectedItemModal from "./SelectedItemModal";
import colors from "../../utils/styles/appStyles";

const MenuItemsList = ({ menuItems, isLoading }) => {
	const { currentUserData } = useContext(AuthContext);
	const { addItemToBasket } = useBasket();
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);
	const [selectedPIPs, setSelectedPIPs] = useState([]);
	const [pips, setPips] = useState([]);
	const [snackbarVisible, setSnackbarVisible] = useState(false);
	const [specialInstructions, setSpecialInstructions] = useState("");

	const showSnackbar = () => {
		setSnackbarVisible(true);
		setTimeout(() => {
			setSnackbarVisible(false);
		}, 2000);
	};

	useEffect(() => {
		const fetchPips = async () => {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			const unsubscribe = onSnapshot(pipsRef, (snapshot) => {
				const pipsArray = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setPips(pipsArray);
			});
			return () => unsubscribe();
		};
		fetchPips();
	}, [currentUserData.uid]);

	const handleAddToBasket = (menuItem) => {
		setSelectedItem(menuItem);
		setSelectedPIPs([]);
		setIsModalVisible(true);
	};

	const handlePipSelection = (pipId) => {
		setSelectedPIPs((prevSelectedPIPs) => {
			if (prevSelectedPIPs.some((selectedPip) => selectedPip.id === pipId)) {
				// If already selected, remove it
				return prevSelectedPIPs.filter(
					(selectedPip) => selectedPip.id !== pipId
				);
			} else {
				// If not selected, add it along with the name
				const selectedPip = pips.find((pip) => pip.id === pipId);
				return [...prevSelectedPIPs, { id: pipId, name: selectedPip.name }];
			}
		});
	};

	const closeModal = () => {
		setIsModalVisible(false);
	};
	const confirmAddToBasket = async () => {
		if (selectedItem) {
			try {
				addItemToBasket(
					selectedItem.restaurantId,
					selectedItem,
					selectedPIPs,
					specialInstructions
				); // Pass selectedPIPs to addItemToBasket
				showSnackbar();
				closeModal();
			} catch (error) {
				console.error("Error adding to basket:", error);
				Alert.alert("Error", "Failed to add item to basket. Please try again.");
			}
		}
	};

	const sortMenuItems = (menuItems) => {
		const categories = {};

		menuItems.forEach((item) => {
			let category = item.category;

			if (category === "Drinks Non-Alcoholic") {
				category = "Non-Alcoholic Drinks";
			}

			if (category === "Drinks Alcoholic") {
				category = "Alcoholic Drinks";
			}

			if (!categories[category]) {
				categories[category] = [];
			}
			categories[category].push(item);
		});

		// Define the order of categories
		const categoryOrder = [
			"Daily Special",
			"Appetizer",
			"Entree",
			"Desserts",
			"Drinks",
			"Alcoholic Drinks",
			"Non-Alcoholic Drinks",
		];

		const sortedMenu = categoryOrder.map((category) => {
			if (category === "Daily Special") {
				return {
					category: "Daily Special",
					data: menuItems.filter((item) => item.isDailySpecial),
				};
			} else {
				return {
					category: category,
					data: categories[category] || [],
				};
			}
		});

		return sortedMenu.filter((category) => category.data.length > 0);
	};

	const renderMenuItem = ({ item }) => (
		<TouchableOpacity
			style={styles.menuItemContainer}
			onPress={() => handleAddToBasket(item)}
		>
			<View style={styles.menuItemContent}>
				{/* Added a container for the content */}
				<Image source={{ uri: item.imageUri }} style={styles.menuItemImage} />
				<View style={styles.menuItemTextContainer}>
					{/* Added a container for the text */}
					<Text style={styles.menuItemName}>{item.name}</Text>
					{item.description && (
						<Text style={styles.menuItemDescription}>{item.description}</Text>
					)}
					<Text style={styles.menuItemPrice}>${item.price}</Text>
				</View>
			</View>
		</TouchableOpacity>
	);

	return (
		<View style={styles.container}>
			{isLoading ? (
				<ActivityIndicator size="small" color="#FF6C44" />
			) : menuItems.length === 0 ? (
				<Text>No menu items found.</Text>
			) : (
				sortMenuItems(menuItems).map(
					(
						categoryData // Use map here
					) => (
						<View
							key={categoryData.category}
							style={styles.menuCategoryContainer}
						>
							<Text style={styles.menuCategoryHeader}>
								{categoryData.category}
							</Text>
							{categoryData.data.map((item) => (
								<TouchableOpacity
									key={item.id}
									style={styles.menuItemContainer}
									onPress={() => handleAddToBasket(item)}
								>
									<View style={styles.menuItemContent}>
										<Image
											source={{ uri: item.imageUri }}
											style={styles.menuItemImage}
										/>
										<View style={styles.menuItemTextContainer}>
											<Text style={styles.menuItemName}>{item.name}</Text>
											{item.description && (
												<Text style={styles.menuItemDescription}>
													{item.description}
												</Text>
											)}
											<Text style={styles.menuItemPrice}>${item.price}</Text>
										</View>
									</View>
								</TouchableOpacity>
							))}
						</View>
					)
				)
			)}
			{selectedItem && (
				<SelectedItemModal
					visible={isModalVisible}
					selectedItem={selectedItem}
					handlePIPSelection={handlePipSelection}
					pips={pips}
					selectedPIPs={selectedPIPs}
					onClose={closeModal}
					confirmAddToBasket={confirmAddToBasket}
				/>
			)}

			<Snackbar
				visible={snackbarVisible}
				onDismiss={() => setSnackbarVisible(false)}
			>
				<Text>Added to basket</Text>
			</Snackbar>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		marginBottom: 20,
	},
	menuItem: {
		flexDirection: "row",
		padding: 5,
		borderRadius: 10,
		backgroundColor: "#f2f2f2",
		marginBottom: 10, // Add margin between items
	},
	imageContainer: {
		width: 75,
		height: 75,
		marginRight: 10,
		borderRadius: 10,
		overflow: "hidden",
	},
	image: {
		width: "100%",
		height: "100%",
	},
	contentContainer: {
		flex: 1,
	},
	name: {
		fontSize: 16,
		fontWeight: "bold",
		marginBottom: 5,
	},
	price: {
		color: "#FF6C44",
	},
	description: {
		fontSize: 14,
		color: "#666666",
	},
	addButton: {
		backgroundColor: "#FF6C44",
		padding: 10,
		borderRadius: 5,
		alignItems: "center",
	},
	addButtonText: {
		color: "white",
	},

	checkboxGroup: {
		flexDirection: "row",
		flexWrap: "wrap",
	},
	addPersonText: {
		fontSize: 24,
	},
	pipsSelection: {
		marginTop: 15,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "bold",
		marginBottom: 5,
	},
	pipWithCheckbox: {
		flexDirection: "row",
		alignItems: "center",
	},
	menuCategoryHeader: {
		backgroundColor: "#f0f0f0", // Light gray background for the header
		padding: 10,
		fontSize: 18,
		fontWeight: "bold",
		borderTopWidth: 1,
		borderTopColor: "#ddd", // Add a subtle top border
	},
	menuItemContainer: {
		padding: 15,
		borderBottomWidth: 1,
		borderBottomColor: "#eee", // Add a separator between menu items
	},
	menuItemName: {
		fontSize: 16,
		fontWeight: "500",
	},
	menuItemDescription: {
		fontSize: 14,
		color: "#666",
		marginBottom: 5,
	},
	menuItemPrice: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.primary, // Use your primary color for the price
	},
	menuItemContent: {
		// Added styles for the content container
		flexDirection: "row",
		alignItems: "center",
	},
	menuItemImage: {
		// Added styles for the image
		width: 75,
		height: 75,
		marginRight: 10,
		borderRadius: 8,
	},
	menuItemTextContainer: {
		// Added styles for the text container
		flex: 1,
	},
});

export default MenuItemsList;
