import { collection, onSnapshot, where, query } from "firebase/firestore";
import React, { createContext, useState, useEffect, useContext } from "react";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../authContext";
import { Alert } from "react-native";
import { httpsCallable } from "firebase/functions";

const BasketContext = createContext({
	baskets: {},
	addItemToBasket: (restaurant, dish, specialInstructions) => [],
	removeItemFromBasket: (restaurantId, basketItemId) => {},
	clearBasket: (restaurantId) => {},
	basketError: null,
});

export const BasketProvider = ({ children }) => {
	const { currentUser } = useContext(AuthContext);
	const [baskets, setBaskets] = useState({});
	const [basketError, setBasketError] = useState(null);
	const [checkedInStatus, setCheckedInStatus] = useState(false);
	const [basketItems, setBasketItems] = useState([]);
	const [isSendingToChefsQ, setIsSendingToChefsQ] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	// Fetch the basket for the logged in user when the component mounts
	// Fetch basket data when the component mounts or current user changes
	useEffect(() => {
		let unsubscribe;

		const fetchBasketItems = async () => {
			if (!currentUser) {
				setIsLoading(false);
				return;
			}

			try {
				const basketItemsRef = collection(db, "baskets");

				const q = query(basketItemsRef, where("userId", "==", currentUser.uid));

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

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [currentUser]);

	// const addItemToBasket = async (
	//   dish,
	//   selectedPIPs = [],
	//   specialInstructions
	// ) => {
	//   try {
	//     setBasketError(null); // Clear any previous errors

	//     // 1. Validate Input
	//     if (!currentUser) {
	//       throw new Error("You need to be logged in to add items to the basket.");
	//     }

	//     if (!dish.restaurantId) {
	//       throw new Error("Invalid restaurant data.");
	//     }

	//     if (!dish || !dish.id) {
	//       throw new Error("Invalid dish data.");
	//     }

	//     // 2. Prepare Data
	//     const restaurantId = dish.restaurantId;
	//     const userBasketRef = doc(db, "baskets", currentUser.uid);

	//     // Check if the basket document exists
	//     const basketSnapshot = await getDoc(userBasketRef);

	//     if (basketSnapshot.exists()) {
	//       let currentBasket = baskets[restaurantId] || { items: [] };
	//       // 3. Check for Existing Item with the Same PIPs
	//       const existingDishIndex = currentBasket.items.findIndex(
	//         (item) =>
	//           item.dish.id === dish.id &&
	//           JSON.stringify(item.pips) === JSON.stringify(selectedPIPs)
	//       );

	//       if (existingDishIndex > -1) {
	//         // 4a. If the dish with the same PIPs exists, update its quantity
	//         const updatedItem = {
	//           ...currentBasket.items[existingDishIndex],
	//           quantity: currentBasket.items[existingDishIndex].quantity + 1,
	//         };

	//         await updateDoc(userBasketRef, {
	//           [`${restaurantId}.items.${existingDishIndex}`]: updatedItem,
	//         });

	//         currentBasket.items[existingDishIndex] = updatedItem;
	//       } else {
	//         // 4b. If the dish is new or has different PIPs, create a new entry
	//         const newItem = {
	//           dish: dish,
	//           quantity: 1,
	//           specialInstructions: specialInstructions, // You can add special instructions handling here if needed
	//           pips: selectedPIPs,
	//         };

	//         await updateDoc(userBasketRef, {
	//           [`${restaurantId}.items`]: arrayUnion(newItem),
	//         });

	//         currentBasket.items.push(newItem);

	//         // 5. Update the overall baskets state
	//         setBaskets({ ...baskets, [restaurantId]: currentBasket });
	//       }
	//     } else {
	//       // If the basket document doesnt exists, create a new one with the first item
	//       const newBasket = {
	//         [restaurantId]: {
	//           items: [
	//             {
	//               dish,
	//               quantity: 1,
	//               specialInstructions: specialInstructions,
	//               pips: selectedPIPs,
	//             },
	//           ],
	//         },
	//       };
	//       console.log("Trying to add this to basket...", newBasket);
	//       await setDoc(userBasketRef, newBasket);
	//       // Update the localState
	//       setBaskets(newBasket);
	//       console.log("Basket added", newBasket);
	//     }
	//   } catch (error) {
	//     console.error("Error adding to basket:", error);
	//     setBasketError(error.message);
	//     Alert.alert("Error", "Failed to add item to basket. Please try again.");
	//   }
	// };

	const addItemToBasket = async (
		restaurantId,
		dish,
		selectedPIPs = [],
		server = {},
		specialInstructions,
		table = {}
	) => {
		try {
			setBasketError(null); // Clear any previous errors

			// 1. Validate Input
			if (!currentUser) {
				throw new Error("You need to be logged in to add items to the basket.");
			}

			if (!restaurantId) {
				throw new Error("Invalid restaurant data.");
			}

			if (!dish || !dish.id) {
				throw new Error("Invalid dish data.");
			}

			const addItemFunction = httpsCallable(functions, "addItemToBasket");
			await addItemFunction({
				userId: currentUser.uid,
				restaurantId,
				dish,
				selectedPIPs,
				table,
				specialInstructions,
				server,
			});
		} catch (error) {
			console.error("Error adding to basket:", error);
			setBasketError(error.message);
			Alert.alert("Error", "Failed to add item to basket. Please try again.");
		}
	};

	const removeItemFromBasket = async (restaurantId, basketItemId) => {
		try {
			if (!currentUser) {
				throw new Error(
					"You need to be logged in to remove items from the basket."
				);
			}
			const removeItemFunction = httpsCallable(
				functions,
				"removeItemFromBasket"
			);
			await removeItemFunction({
				userId: currentUser.uid,
				restaurantId,
				basketItemId,
			});
		} catch (error) {}
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

	const handleQuantityChange = async (basketItemId, newQuantity) => {
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
