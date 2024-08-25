import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	FlatList,
	ScrollView,
	Alert,
	ActivityIndicator,
	Button,
} from "react-native";
import { useBasket } from "../../context/customer/BasketContext";
import { AntDesign } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { Provider, Portal, FAB, Snackbar } from "react-native-paper";

import { useCheckInStatus } from "../../utils/customerUtils";
import { AuthContext } from "../../context/authContext";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";

const BasketScreen = ({ route, navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const { restaurant } = route.params;
	const { baskets, basketError, handleQuantityChange, clearBasket } =
		useBasket(); // Access baskets from the context
	const [filteredBasketData, setFilteredBasketData] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [showDeleteSnackbar, setShowDeleteSnackbar] = useState(false);
	const { checkInStatus, tableNumber } = useCheckInStatus(
		restaurant.uid,
		currentUserData.uid
	);
	const [isSendingToChefsQ, setIsSendingToChefsQ] = useState(false);
	// Retrieve the basket for the current restaurant // Get the basket for the current restaurant
	const restaurantBasket = baskets[restaurant.id] || { items: [] };

	useEffect(() => {
		// Get basket items for the current restaurant
		const restaurantBasketItems = baskets[restaurant.id]?.items || [];

		const transformedData = transformBasketData(restaurantBasketItems);
		const filteredData = transformedData.filter(
			(personData) => personData.items && personData.items.length > 0
		);
		setFilteredBasketData(filteredData);
	}, [baskets, restaurant.id]);

	// Transform basket data to group items by PIP
	const transformBasketData = (basketItems) => {
		const groupedBasketItems = {};

		basketItems.forEach((basketItem) => {
			const pipId = basketItem.pip.id;
			const pipName = basketItem.pip.name;

			if (!groupedBasketItems[pipId]) {
				groupedBasketItems[pipId] = {
					personId: pipId,
					pipName: pipName,
					items: [],
					totalPrice: 0,
				};
			}

			// Check if this dish is already in the person order
			const existingItemIndex = groupedBasketItems[pipId].items.findIndex(
				(existing) => existing.dish.id === basketItem.dish.id
			);

			if (existingItemIndex > -1) {
				// If the dish exists, increment its quantity
				groupedBasketItems[pipId].items[existingItemIndex].quantity +=
					basketItem.quantity;
			} else {
				// If the dish is new, add it to the person's order
				groupedBasketItems[pipId].items.push({ ...basketItem });
			}

			// Update the total price for this person
			groupedBasketItems[pipId].totalPrice +=
				basketItem.dish.price * basketItem.quantity;
		});

		return Object.values(groupedBasketItems);
	};

	// Calculate subtotal and total
	const subtotal = filteredBasketData.reduce(
		(total, personData) => total + personData.totalPrice,
		0
	);
	const tax = subtotal * 0.08; // Example 8% tax (adjust as needed)
	const overallTotal = subtotal + tax;

	const handleSendToChefsQ = async () => {
		if (filteredBasketData.length > 0 && checkInStatus === "ACCEPTED") {
			try {
				setIsSendingToChefsQ(true); // Set loading state

				// Extract the items from filteredBasketData, keeping only the necessary properties
				const orderItems = filteredBasketData.flatMap((personData) =>
					personData.items.map((basketItem) => ({
						dish: basketItem.dish, // Include the entire dish object
						quantity: basketItem.quantity,
						specialInstructions: basketItem.specialInstructions,
						pips: basketItem.pips,
					}))
				);

				console.log(
					`Being sent to sendToChefsQ ${restaurant.id}, ${currentUserData.uid} ${tableNumber}`
				);
				// Call the sendToChefsQ Cloud Function directly
				const sendToChefsQFunction = httpsCallable(functions, "sendToChefsQ");
				const result = await sendToChefsQFunction({
					restaurantId: restaurant.id,
					customerId: currentUserData.uid,
					tableNumber: tableNumber,
					items: orderItems,
				});

				if (result.data.success) {
					// Clear the basket for this restaurant
					clearBasket(restaurant.id);
					navigation.navigate("CheckoutScreen"),
						{ orderId: result.data.orderId };

					// Navigate to OrderConfirmationScreen
					navigation.navigate("CheckoutScreen", {
						orderId: result.data.orderId,
					});
				} else {
					// Handle error from Cloud Function
					throw new Error(
						result.data.error || "Failed to send order to chef's queue"
					);
				}
			} catch (error) {
				console.error("Error sending to chef's queue:", error);
				Alert.alert(
					"Error",
					error.message || "An error occurred while placing the order."
				);
			} finally {
				setIsSendingToChefsQ(false); // Reset loading state
			}
		} else if (checkInStatus !== "ACCEPTED") {
			Alert.alert("Not Checked In", "Please check in to place an order.");
		} else {
			Alert.alert(
				"Empty Basket",
				"Please add items to your basket before placing an order."
			);
		}
	};

	const hasUnsentItems = () => {
		// Get the basket for the current restaurant
		const restaurantBasket = baskets[restaurant.id] || { items: [] };

		// Check if any item in the basket has sentToChefQ set to false
		return restaurantBasket.items.some((item) => !item.sentToChefQ);
	};

	// Determine if the button should be disabled and the message to display
	const isButtonDisabled =
		checkInStatus !== "ACCEPTED" ||
		restaurantBasket.items.length === 0 ||
		isLoading;

	const buttonMessage = isButtonDisabled
		? checkInStatus !== "ACCEPTED"
			? "Check In to Place your Order"
			: restaurantBasket.items.length === 0
			? "Your basket is empty. Please add items."
			: !hasUnsentItems()
			? "All items have been sent to the chef's Q."
			: "Sending Order..."
		: "Send To Chef's Q";

	return (
		<Provider>
			<View style={styles.container}>
				{/* Header with Restaurant Name */}
				<View style={styles.header}>
					<Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>
					{basketError && <Text style={styles.errorText}>{basketError}</Text>}
				</View>

				{/* Loading Indicator or Basket Content */}
				{isLoading ? (
					<ActivityIndicator size="large" color={colors.primary} />
				) : filteredBasketData.length > 0 ? (
					<ScrollView showsVerticalScrollIndicator={false}>
						{/* Basket Items Grouped by PIP */}
						{filteredBasketData.map((personData) => (
							<View key={personData.personId} style={styles.personSection}>
								{/* PIP Name */}
								<Text style={styles.personName}>{personData.pipName}</Text>

								{/* Items for this PIP */}
								{personData.items.map((basketItem) => (
									<View key={basketItem.id} style={styles.basketItem}>
										<View style={styles.itemInfoContainer}>
											<Text style={styles.dishName}>
												{basketItem.dish.name}
											</Text>

											{/* Quantity Controls */}
											<View style={styles.itemActionsContainer}>
												<View style={styles.quantityControls}>
													<TouchableOpacity
														onPress={() => {
															if (basketItem.quantity === 1) {
																// Trigger confirmation alert
																Alert.alert(
																	"Confirm Delete",
																	`Are you sure you want to remove this item from your basket? ${basketItem.dish.name} for ${basketItem.pip.name}`,
																	[
																		{
																			text: "Cancel",
																			style: "cancel",
																		},
																		{
																			text: "Delete",
																			onPress: () =>
																				handleQuantityChange(basketItem.id, 0),
																			style: "destructive",
																		},
																	]
																);
															} else {
																handleQuantityChange(
																	basketItem.id,
																	basketItem.quantity - 1
																);
															}
														}}
														disabled={basketItem.quantity <= 0}
														style={styles.quantityButton}
													>
														<AntDesign name="minus" size={20} color="black" />
													</TouchableOpacity>
													<Text style={styles.quantity}>
														{basketItem.quantity}
													</Text>
													<TouchableOpacity
														onPress={() =>
															handleQuantityChange(
																basketItem.id,
																basketItem.quantity + 1
															)
														}
														style={styles.quantityButton}
													>
														<AntDesign name="plus" size={20} color="black" />
													</TouchableOpacity>
												</View>

												<Text style={styles.itemPrice}>
													$
													{(
														basketItem.dish.price * basketItem.quantity
													).toFixed(2)}
												</Text>
											</View>

											{/* Special Instructions (if any) */}
											{basketItem.specialInstructions && (
												<Text style={styles.specialInstructions}>
													{basketItem.specialInstructions}
												</Text>
											)}
										</View>
									</View>
								))}

								{/* Total for this PIP */}
								<View style={styles.pipTotalContainer}>
									<Text style={styles.pipTotalText}>
										Total: ${personData.totalPrice.toFixed(2)}
									</Text>
								</View>
							</View>
						))}

						{/* Overall Order Summary */}
						<View style={styles.orderSummary}>
							<Text>Subtotal: ${subtotal.toFixed(2)}</Text>
							<Text>Tax (8%): ${tax.toFixed(2)}</Text>
							<Text style={styles.totalPrice}>
								Total: ${overallTotal.toFixed(2)}
							</Text>
						</View>
						<Snackbar
							visible={showDeleteSnackbar}
							onDismiss={() => setShowSnackbar(false)}
						>
							Item removed from basket
						</Snackbar>

						{/* Send to Chef's Q Button (Conditional Rendering) */}
						<View style={styles.buttonContainer}>
							{isButtonDisabled && (
								<Text style={styles.messageText}>{buttonMessage}</Text>
							)}
							<Button
								title="Send To Chef's Q"
								onPress={handleSendToChefsQ}
								loading={isLoading}
								disabled={isButtonDisabled}
								style={styles.sendButtonActive}
							/>
						</View>
					</ScrollView>
				) : (
					<View style={styles.emptyBasketContainer}>
						<Text style={styles.emptyBasketText}>Basket is empty</Text>
					</View>
				)}
			</View>

			{/* Checkout Button (using Portal for positioning) */}
		</Provider>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
		backgroundColor: colors.background,
	},
	header: {
		marginBottom: 20,
	},
	restaurantName: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 10,
		color: colors.primary,
	},
	errorText: {
		color: "red",
		fontSize: 16,
	},
	emptyBasketContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	emptyBasketText: {
		fontSize: 18,
		textAlign: "center",
		color: colors.textLight,
	},
	personSection: {
		marginBottom: 10,
		backgroundColor: colors.lightGray, // Use a light background color for sections
		borderRadius: 8,
		padding: 10,
		backgroundColor: "white",
	},
	personName: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 5,
	},

	basketItem: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5, // Reduced margin for tighter spacing
		paddingHorizontal: 10,
	},
	pipTotalContainer: {
		// New style for PIP total
		alignSelf: "flex-end", // Align to the right
		marginTop: 10,
	},
	pipTotalText: {
		fontWeight: "bold",
	},

	itemInfoContainer: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		marginRight: 10,
		justifyContent: "space-between",
	},
	dishName: {
		fontSize: 14,
		fontWeight: "500",
		paddingRight: 10,
	},

	itemActionsContainer: {
		// New style for quantity controls, price, and remove button
		flexDirection: "row",
		alignItems: "center",
	},
	quantityControls: {
		flexDirection: "row",
		alignItems: "center",
		marginRight: 10, // Add some spacing to the right
		borderRadius: 8,
		backgroundColor: colors.lightGray,
		paddingVertical: 2,
	},

	quantity: {
		marginHorizontal: 5,
	},
	quantityButton: {
		paddingHorizontal: 3,
	},
	itemPrice: {
		fontWeight: "bold",
	},
	specialInstructions: {
		fontSize: 14,
		color: colors.textLight,
		marginTop: 5,
	},

	orderSummary: {
		marginTop: 20,
		borderTopWidth: 1,
		borderTopColor: colors.lightGray,
		paddingTop: 10,
	},
	totalPrice: {
		fontSize: 18,
		fontWeight: "bold",
	},
	sendButtonActive: {
		backgroundColor: colors.primary,
		padding: 15, // Increase padding or remove paddingVertical if it's causing the issue
		borderRadius: 8,
		alignItems: "center",
		marginVertical: 10,
		marginBottom: 20,
	},
	sendButtonInactive: {
		backgroundColor: colors.gray,
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
		marginVertical: 10,
		marginBottom: 5,
	},
	sendButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	checkoutButton: {
		position: "absolute",
		bottom: 16,
		right: 16,
		alignSelf: "flex-end",
		backgroundColor: colors.primary,
	},
	checkoutButtonContent: {
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		height: 80,
	},
	checkoutButtonLabel: {
		marginTop: 8,
		color: "white",
	},

	buttonContainer: {
		marginTop: 20,
		alignItems: "center", // Center the button and message horizontally
	},
	messageText: {
		textAlign: "center",
		marginBottom: 10,
		color: colors.textLight,
		fontSize: 12, // Make the message text smaller
	},
});

export default BasketScreen;
