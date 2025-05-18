import { collection, onSnapshot, where, query } from "firebase/firestore";
import React, { createContext, useState, useEffect, useContext } from "react";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../authContext";
import { Alert } from "react-native";
import { httpsCallable } from "firebase/functions";

const BasketContext = createContext({
	baskets: {},
	// Updated signature to reflect new parameters
	addItemToBasket: async (
		restaurantId,
		dish, // Core menu item details
		selectedPIPs, // Array of {id, name, specialInstructions}
		server,
		generalSpecialInstructions, // General notes if no PIPs or for "Myself"
		table,
		quantity // New quantity parameter
	) => {},
	removeItemFromBasket: (restaurantId, basketItemId) => {},
	clearBasket: (restaurantId) => {},
	handleQuantityChange: async (basketItemId, newQuantity) => {}, // Added from BasketScreen
	basketError: null,
	loading: true, // Default loading to true until initial fetch
});

export const BasketProvider = ({ children }) => {
	const { currentUser } = useContext(AuthContext);
	const [baskets, setBaskets] = useState({});
	const [basketError, setBasketError] = useState(null);
	const [checkedInStatus, setCheckedInStatus] = useState(false);
	const [basketItems, setBasketItems] = useState([]);
	const [isSendingToChefsQ, setIsSendingToChefsQ] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Fetch the basket for the logged in user when the component mounts
	// Fetch basket data when the component mounts or current user changes
	useEffect(() => {
		let unsubscribe;
		if (currentUser && currentUser.uid) {
			setIsLoading(true);
			setBasketError(null);

			const fetchBasketItems = async () => {
				if (!currentUser) {
					setIsLoading(false);
					return;
				}

				try {
					const basketItemsRef = collection(db, "baskets");

					const q = query(
						basketItemsRef,
						where("userId", "==", currentUser.uid)
					);

					unsubscribe = onSnapshot(q, (querySnapshot) => {
						const items = querySnapshot.docs.map((doc) => ({
							id: doc.id,
							...doc.data(),
						}));

						// Organize items into baskets by restaurantId
						const newBaskets = {};
						items.forEach((item) => {
							const restaurantId = item.restaurantId;
							if (!newBaskets[restaurantId]) {
								newBaskets[restaurantId] = { items: [] };
							}
							newBaskets[restaurantId].items.push(item);
						});

						setBaskets(newBaskets);
						setIsLoading(false);
					});
				} catch (error) {
					console.error("Error fetching basket items:", error);
					setBasketError(error.message);
					Alert.alert(
						"Error",
						"Failed to fetch your basket. Please try again later."
					);
				}
			};

			fetchBasketItems();
		} else {
			// If current user or current user.uid is null/undefined, clear baskets
			setBaskets({});
			setIsLoading(false);
		}

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [currentUser]);

	const addItemToBasket = async (
		restaurantId,
		dish, // This is the core menuItem object: { id, name, price, category, imageUri, restaurantId (original) }
		selectedPIPs = [], // Array of { id (pip's user or local ID), name, specialInstructions }
		server = {}, // Optional server info
		generalSpecialInstructions = "", // General notes if no PIPs or if item is for "Myself"
		table = {}, // Optional table info
		quantity // NEW: The quantity selected in the modal
	) => {
		try {
			setBasketError(null);
			if (!currentUser || !currentUser.uid) {
				throw new Error("You need to be logged in to add items to the basket.");
			}
			if (!restaurantId) throw new Error("Invalid restaurant data.");
			if (
				!dish ||
				!dish.id ||
				typeof dish.price !== "number" ||
				typeof quantity !== "number" ||
				quantity <= 0
			) {
				throw new Error("Invalid dish data or quantity.");
			}

			const addItemFunction = httpsCallable(functions, "addItemToBasket"); // Your existing CF name

			// The Cloud Function "addItemToBasket" needs to be updated to handle:
			// 1. The 'quantity' parameter.
			// 2. The 'selectedPIPs' array. If this array is not empty, the CF should
			//    create a separate basket item document in Firestore for EACH PIP in the array,
			//    each with the specified 'quantity' and their individual 'specialInstructions'.
			// 3. If 'selectedPIPs' is empty, it creates one item for the currentUser.uid
			//    with the 'generalSpecialInstructions' and 'quantity'.

			await addItemFunction({
				userId: currentUser.uid,
				restaurantId, // The restaurant this basket belongs to
				dish, // Pass the core menu item details
				quantity, // Pass the selected quantity
				selectedPIPs, // Pass the array of PIPs with their specific instructions
				generalSpecialInstructions, // Pass general instructions
				table, // Pass table info if available
				server, // Pass server info if available
			});
			// No need to manually update 'baskets' state here if the useEffect listener is working correctly.
			// The listener will pick up the new document(s) created by the Cloud Function.
			console.log(
				"BasketContext: addItemToBasket Cloud Function called successfully."
			);
		} catch (error) {
			console.error("BasketContext: Error adding to basket:", error);
			const message =
				error.message || "Failed to add item to basket. Please try again.";
			setBasketError(message);
			Alert.alert("Error Adding Item", message);
			// Re-throw the error if the calling component needs to react to it
			throw error;
		}
	};

	const removeItemFromBasket = async (restaurantId, basketItemId) => {
		if (!currentUser || !currentUser.uid) {
			Alert.alert("Error", "You need to be logged in.");
			return;
		}
		if (!restaurantId || !basketItemId) {
			Alert.alert("Error", "Missing information to remove item.");
			return;
		}
		console.log(
			`BasketContext: Attempting to remove item ${basketItemId} from restaurant ${restaurantId} via removeItemFromBasket.`
		);
		try {
			const removeItemFunction = httpsCallable(
				functions,
				"removeItemFromBasket"
			);
			await removeItemFunction({
				userId: currentUser.uid,
				restaurantId, // CF might not need this if basketItemId is globally unique
				basketItemId,
			});
			console.log(
				`BasketContext: removeItemFromBasket Cloud Function called for item ${basketItemId}.`
			);
			// Firestore listener will update the UI.
		} catch (error) {
			console.error("BasketContext: Error removing item from basket:", error);
			Alert.alert(
				"Error Removing Item",
				error.message || "Could not remove item from basket."
			);
			// setBasketError(error.message); // Optionally set context error
		}
	};

	const clearBasket = async (restaurantId) => {
		try {
			if (!currentUser) {
				throw new Error("You need to be logged in to clear the basket.");
			}

			const clearBasketFunction = httpsCallable(functions, "clearBasket");
			await clearBasketFunction({
				userId: currentUser.uid,
				restaurantId,
			});
		} catch (error) {
			console.error("Error clearing basket:", error);
			setBasketError(error.message);
			Alert.alert("Error", "Failed to clear basket. Please try again.");
		}
	};

	const handleQuantityChange = async (
		restaurantId,
		basketItemId,
		newQuantity
	) => {
		if (!currentUser) throw new Error("Login required.");
		newQuantity = Math.max(0, Math.min(10, newQuantity)); // Clamp quantity

		// If newQuantity is 0, it might mean removing the item.
		// Your Cloud Function needs to handle this (either update to 0 or delete).
		// Or, you can call removeItemFromBasket if newQuantity is 0.
		if (newQuantity === 0) {
			// Assuming basketItemId includes restaurantId or context is clear
			// This needs careful handling if basketItemId is not globally unique across restaurants
			// For now, let's assume removeItemFromBasket is called directly by UI for removal.
			await removeItemFromBasket(restaurantId, basketItemId);
			return; // Item removal is handled, no need to call update quantity CF
			// For safety, let's prevent setting quantity to 0 directly via update if remove is separate
		}
		try {
			// Ensure newQuantity is within a valid range (0 to 10)
			newQuantity = Math.max(0, Math.min(10, newQuantity));

			// Call the Cloud Function to update the quantity
			const updateQuantityFunction = httpsCallable(
				functions,
				"updateBasketItemQuantity"
			);
			await updateQuantityFunction({
				userId: currentUser.uid,
				basketItemId,
				newQuantity,
			});
		} catch (error) {
			console.log("Error updating quantityi", error);
			setBasketError(error.message);
			Alert.alert("Error", "Failed to update item quantity");
		}
	};

	return (
		<BasketContext.Provider
			value={{
				setBaskets,
				checkedInStatus,
				setCheckedInStatus,
				addItemToBasket,
				removeItemFromBasket,
				handleQuantityChange,
				clearBasket,
				basketItems,
				baskets,
				basketError,
				isSendingToChefsQ,
			}}
		>
			{children}
		</BasketContext.Provider>
	);
};

export const useBasket = () => useContext(BasketContext);
