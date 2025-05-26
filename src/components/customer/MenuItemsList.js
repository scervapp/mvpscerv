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
} from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { Button, Snackbar } from "react-native-paper";
import { AuthContext } from "../../context/authContext";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import SelectedItemModal from "./SelectedItemModal";
import colors from "../../utils/styles/appStyles";
import { Tooltip } from "react-native-elements";
import formatCurrency from "../../utils/currencyFormatter";

const MenuItemsList = ({
	menuItems,
	isLoading,
	restaurantId,
	pips,
	onConfirmAddItemToContext,
	orderingMode = "individual",
	partyContextData = null,
}) => {
	// --- END LOG ---
	const { currentUserData } = useContext(AuthContext);
	const { addItemToBasket } = useBasket();

	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);
	const [selectedPIPs, setSelectedPIPs] = useState([]);
	const [snackbarVisible, setSnackbarVisible] = useState(false);
	const [snackbarMessage, setSnackbarMessage] = useState("");
	const [specialInstructions, setSpecialInstructions] = useState("");
	const [showGuestTooltip, setShowGuestTooltip] = useState(false);
	const [showSpecialInstructionsModal, setShowSpecialInstructionsModal] =
		useState(false);
	const [selectedPip, setSelectedPip] = useState(null);
	const [localPips, setLocalPips] = useState([]);

	const isGuest = currentUserData.role === "guest";

	const showSnackbar = () => {
		setSnackbarVisible(true);
		setTimeout(() => {
			setSnackbarVisible(false);
		}, 2000);
	};

	useEffect(() => {
		// Hide the tooltip automatically after 3 seconds
		if (showGuestTooltip) {
			const timer = setTimeout(() => setShowGuestTooltip(false), 3000);
			return () => clearTimeout(timer);
		}
	}, [showGuestTooltip]);

	useEffect(() => {
		// Only fetch PIPs if in individual mode, user exists, and is not a guest.
		// For party mode, the "Order For" dropdown in SelectedItemModal will use this same 'localPips' list.
		if (currentUserData?.uid && !isGuest) {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			const unsubscribe = onSnapshot(
				pipsRef,
				(snapshot) => {
					const pipsArray = snapshot.docs.map((doc) => ({
						id: doc.id,
						...doc.data(),
					}));

					setLocalPips(pipsArray);
				},
				(error) => {
					console.error(
						"MenuItemsList: useEffect - Error fetching PIPs:",
						error
					);
					setLocalPips([]); // Set to empty on error to prevent crashes
				}
			);

			// Cleanup function for this useEffect
			return () => {
				unsubscribe();
			};
		} else {
			console.log(
				"MenuItemsList: useEffect - No user, or is guest, or not in individual mode. Clearing/not fetching local PIPs."
			);
			setLocalPips([]); // Clear pips if no user or is guest
		}
	}, [currentUserData?.uid, isGuest]); // Rerun if user or guest status changes

	const handleSelectItem = (menuItem) => {
		if (isGuest) {
			Alert.alert("Login Required", "Please log in or sign up to add items.");
			return;
		}
		setSelectedItem(menuItem);
		setIsModalVisible(true);
	};

	// This function is passed to SelectedItemModal's onConfirm prop
	const handleModalConfirm = async (itemDataFromModal) => {
		// --- LOG THE EXACT OBJECT RECEIVED FROM SelectedItemModal ---
		// console.log(
		// 	"MenuItemsList: handleModalConfirm - Received itemDataFromModal:",
		// 	JSON.stringify(itemDataFromModal, null, 2)
		// );
		// itemDataFromModal from SelectedItemModal contains:
		// { selectedItem (core menu item), quantity, specialInstructions,
		//   chosenPartyTargetName? (if party mode), individualPips? (if individual mode and modal handles it) }

		const finalItemData = {
			menuItemDetails: {
				// Core details of the dish
				id: itemDataFromModal.selectedItem.id, // This is the menuItemId
				name: itemDataFromModal.selectedItem.name,
				price: itemDataFromModal.selectedItem.price,
				restaurantId: itemDataFromModal.selectedItem.restaurantId, // Keep original restaurantId
				// Include any other fields from selectedItem your Cloud Functions might need
				// e.g., category: itemDataFromModal.selectedItem.category, imageUri: itemDataFromModal.selectedItem.imageUri
				...itemDataFromModal.selectedItem, // Spread the rest
			},
			quantity: itemDataFromModal.quantity,
			specialInstructions: itemDataFromModal.specialInstructions,
			individualPips: [],
		};
		console.log(
			"MenuItemsList (handleModalConfirm): Initialized finalItemData (before mode check):",
			JSON.stringify(finalItemData, null, 2)
		);

		if (orderingMode === "individual") {
			// Log 3: The specific property from itemDataFromModal we are interested in
			const targetsFromModal = itemDataFromModal.individualTargets;

			finalItemData.individualPips = targetsFromModal; // Direct assignment
		} else if (orderingMode === "party" && partyContextData) {
			console.log(
				"MenuItemsList (Party Mode): itemDataFromModal.chosenPartyTargetName is:",
				itemDataFromModal.chosenPartyTargetName
			);
			finalItemData.partyContextData = {
				...partyContextData, // Includes partyId, orderingForUserId (current logged-in user)
				// Override/set orderingForPipName based on modal selection
				orderingForPipName: itemDataFromModal.chosenPartyTargetName, // This comes from SelectedItemModal
			};
		}

		try {
			// Call the unified function passed from RestaurantDetailScreen
			await onConfirmAddItemToContext(finalItemData);
			showSnackbar(
				`Added to ${orderingMode === "party" ? "Party Order" : "Your Order"}!`
			);
		} catch (error) {
			console.error("MenuItemsList: Error confirming item from modal:", error);
			// Alert for error is likely handled by the context function called by onConfirmAddItemToContext
		} finally {
			setIsModalVisible(false); // Close modal after action
		}
	};

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
				setSelectedPip(selectedPip);
				setShowSpecialInstructionsModal(true); // Open the modal for special instructions
				return [...prevSelectedPIPs, { id: pipId, name: selectedPip.name }];
			}
		});
	};

	const handleAddSpecialInstructions = () => {
		// 1. Find the selected PIP in the selectedPIPs array
		const pipIndex = selectedPIPs.findIndex((p) => p.id === selectedPip.id);

		if (pipIndex !== -1) {
			// 2. Update the specialInstructions for the selected PIP
			const updatedPIPs = [...selectedPIPs];
			updatedPIPs[pipIndex] = { ...updatedPIPs[pipIndex], specialInstructions };
			setSelectedPIPs(updatedPIPs);
		}

		setShowSpecialInstructionsModal(false);
		setSpecialInstructions("");
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

	const sortMenuItems = (menuItemsArray) => {
		if (!menuItemsArray || menuItemsArray.length === 0) return [];

		// Ensure menuItemsArray is flat if it's coming in nested unexpectedly
		// This is a defensive measure. Ideally, the prop should be flat.
		const flatMenuItems = menuItemsArray.flat();

		const categories = {};
		flatMenuItems.forEach((item) => {
			// Iterate over the potentially flattened array
			// Ensure item is an object before trying to access properties
			if (typeof item !== "object" || item === null) {
				console.warn("Skipping invalid menu item:", item);
				return;
			}
			let category = item.category || "Other";
			if (category === "Drinks Non-Alcoholic")
				category = "Non-Alcoholic Drinks";
			if (category === "Drinks Alcoholic") category = "Alcoholic Drinks";
			if (!categories[category]) categories[category] = [];
			categories[category].push(item);
		});
		const categoryOrder = [
			"Daily Special",
			"Appetizer",
			"Entree",
			"Desserts",
			"Sides",
			"Non-Alcoholic Drinks",
			"Alcoholic Drinks",
			"Other",
		];
		const sortedMenu = categoryOrder.map((category) => {
			if (category === "Daily Special") {
				return {
					category: "Daily Special",
					data: flatMenuItems.filter((item) => item && item.isDailySpecial),
				};
			}
			return { category, data: categories[category] || [] };
		});
		return sortedMenu.filter(
			(category) => category.data && category.data.length > 0
		);
	};

	const renderMenuItem = ({ item, index }) => {
		// Safeguard: if item is still an array (e.g. [actualItemObj]), try to get the first element.
		// This is a fallback; ideally, the data structure is corrected earlier.
		const actualItem = Array.isArray(item) ? item[0] : item;

		if (typeof actualItem !== "object" || actualItem === null) {
			console.warn(
				"renderMenuItem: Skipping render for invalid item structure",
				actualItem
			);
			return null; // Don't render if item structure is not an object
		}

		const itemName =
			typeof actualItem.name === "string" ? actualItem.name : "Unnamed Item";
		const itemCategoryText =
			typeof actualItem.category === "string" ? actualItem.category : null;
		const itemDescriptionText =
			typeof actualItem.description === "string"
				? actualItem.description
				: null;

		const priceDisplay =
			typeof actualItem.price === "number" && !isNaN(actualItem.price)
				? formatCurrency(actualItem.price * 100)
				: "Price N/A";

		return (
			<TouchableOpacity
				onPress={() => handleSelectItem(actualItem)} // Pass actualItem
				style={styles.menuItem}
				key={actualItem.id || `menu-item-${index}`}
			>
				{actualItem.imageUri && (
					<View style={styles.imageContainer}>
						<Image
							source={{ uri: actualItem.imageUri }}
							style={styles.image}
							resizeMode="cover"
						/>
					</View>
				)}
				<View style={styles.contentContainer}>
					<Text style={styles.name}>
						{itemName} - {priceDisplay}
					</Text>
					{itemCategoryText && (
						<Text style={styles.categoryText}>{itemCategoryText}</Text>
					)}
					{itemDescriptionText && (
						<Text style={styles.description} numberOfLines={2}>
							{itemDescriptionText}
						</Text>
					)}
				</View>
			</TouchableOpacity>
		);
	};
	const processedMenu = useMemo(
		() => sortMenuItems(menuItems || []),
		[menuItems]
	);

	if (isLoading) {
		return (
			<ActivityIndicator
				size="large"
				color={colors.primary}
				style={{ marginTop: 30 }}
			/>
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
			{processedMenu.map((categoryData) => (
				<View key={categoryData.category} style={styles.menuCategoryContainer}>
					<Text style={styles.menuCategoryHeader}>{categoryData.category}</Text>
					{/*
                        The log indicated categoryData.data is an array of arrays: [[itemObj1], [itemObj2], ...]
                        So, we need to map through categoryData.data, and for each innerArray, take its first element.
                    */}
					{Array.isArray(categoryData.data) &&
						categoryData.data.map((itemOrItemArray, index) => {
							// Assuming itemOrItemArray could be [itemObject] or just itemObject due to potential flattening
							const actualItemObject = Array.isArray(itemOrItemArray)
								? itemOrItemArray[0]
								: itemOrItemArray;

							// Additional check to ensure actualItemObject is valid before rendering
							if (
								typeof actualItemObject === "object" &&
								actualItemObject !== null
							) {
								return renderMenuItem({ item: actualItemObject, index });
							}
							return null; // Skip rendering if item structure is not as expected
						})}
				</View>
			))}

			{selectedItem && (
				<SelectedItemModal
					visible={isModalVisible}
					selectedItem={selectedItem}
					pips={localPips} // Pass current user's local PIPs (for party mode "Order For" or individual mode PIPs)
					onClose={() => setIsModalVisible(false)}
					onConfirm={handleModalConfirm} // This is the key callback
					orderingMode={orderingMode}
					// restaurantId and partyContextData are not directly needed by modal if
					// handleModalConfirm structures the data for onConfirmAddItemToContext
				/>
			)}
			<Snackbar
				visible={snackbarVisible}
				onDismiss={() => setSnackbarVisible(false)}
				duration={2000} // Snackbar.DURATION_SHORT equivalent
				style={{ backgroundColor: colors.statusSuccess }} // Use success color
			>
				<Text style={{ color: colors.textOnPrimaryBrand }}>
					{snackbarMessage}
				</Text>
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
		backgroundColor: "white", // Light gray background for the header
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
	tooltipOverlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)", // Semi-transparent background
	},
	tooltipContainer: {
		padding: 15,
		backgroundColor: "#fff", // White background for the tooltip
		borderRadius: 8,
		maxWidth: 300, // Optional: sets a max width for the tooltip box
		alignItems: "center", // Centers text within tooltip
		shadowColor: "#000", // Shadow settings to add depth
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5, // Adds shadow on Android
	},
	tooltipText: {
		fontSize: 16,
		color: "#333", // Dark text color for readability
		textAlign: "center",
	},
	modalContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	specialInstructionsModalContent: {
		backgroundColor: "white",
		padding: 20,
		borderRadius: 10,
		width: "80%",
		maxHeight: "80%",
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center", // Center the title
	},
	specialInstructionsInput: {
		borderWidth: 1,
		borderColor: "#ced4da",
		borderRadius: 8,
		padding: 10,
		minHeight: 80,
		marginBottom: 20,
	},
	modalButtonContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
	},
	menuCategoryContainer: {
		backgroundColor: "white",
		marginBottom: 10,
	},

	container: {
		flex: 1,
		paddingBottom: 10, // Space at the bottom if it's in a ScrollView
	},
	noItemsText: {
		textAlign: "center",
		color: colors.textMedium, // Use new color
		marginTop: 30,
		fontSize: 16,
		paddingHorizontal: 20,
	},
	menuCategoryContainer: {
		marginBottom: 12, // Space between categories
		backgroundColor: colors.surfaceWhite, // Use new surfaceWhite
		borderRadius: 8,
		overflow: "hidden", // Ensures border radius is respected by children
		elevation: 1, // Subtle shadow for category blocks
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 1.5,
	},
	menuCategoryHeader: {
		backgroundColor: colors.backgroundLight, // Use new backgroundLight for header
		paddingVertical: 12, // Increased padding
		paddingHorizontal: 15,
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight, // Use new borderLight
	},
	menuItem: {
		flexDirection: "row",
		padding: 12,
		backgroundColor: colors.surfaceWhite, // Items on white surface
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight + "80", // Lighter separator for items within a category
	},
	imageContainer: {
		width: 75, // Your original size
		height: 75,
		marginRight: 12,
		borderRadius: 8, // Rounded images
		overflow: "hidden",
		backgroundColor: colors.borderLight, // Placeholder color if image fails to load
	},
	image: {
		width: "100%",
		height: "100%",
	},
	contentContainer: {
		flex: 1,
		justifyContent: "center", // Vertically center text if image is tall
	},
	name: {
		fontSize: 16,
		fontWeight: "600", // Semi-bold
		color: colors.textDark,
		marginBottom: 4,
	},
	categoryText: {
		// Added style for category display on item
		fontSize: 13,
		color: colors.textMedium,
		fontStyle: "italic",
		marginBottom: 4,
	},
	description: {
		fontSize: 14,
		color: colors.textMedium, // Use new textMedium
	},
});

export default MenuItemsList;
