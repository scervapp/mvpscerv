import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
} from "react-native";
import { collection, doc, getDoc, query, where } from "firebase/firestore";

import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";

const CheckoutScreen = ({ route }) => {
	const { orderId } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const [order, setOrder] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchOrderDetails = async () => {
			try {
				const ordersRef = collection(db, "orders");
				const q = query(
					ordersRef,
					where("orderId", "==", orderId),
					where("customerId", "==", currentUserData.uid)
				); // Add customerId filter
				const querySnapshot = await getDocs(q);

				if (!querySnapshot.empty) {
					const orderData = querySnapshot.docs[0].data();
					setOrder(orderData);
				} else {
					console.error("Order not found:", orderId);
					setError("Order not found");
				}
			} catch (error) {
				console.error("Error fetching order details:", error);
				setError(
					error.message || "An error occurred while fetching the order details."
				);
			} finally {
				setIsLoading(false);
			}
		};

		fetchOrderDetails();
	}, [orderId, currentUserData.uid]); // Add currentUserData.uid as a dependency

	return (
		<View style={styles.container}>
			{isLoading ? (
				<ActivityIndicator size="large" />
			) : error ? (
				<Text style={styles.errorText}>{error}</Text>
			) : order ? (
				<ScrollView>
					{/* Display order summary */}
					<Text style={styles.heading}>Order Summary</Text>

					{/* Restaurant Name */}
					<Text style={styles.restaurantName}>
						{/* Fetch restaurant name based on order.restaurantId */}
					</Text>

					{/* Order Items */}
					{order.items.map((item, index) => (
						<View key={index} style={styles.orderItem}>
							<Text>
								{item.dish.name} x {item.quantity}
							</Text>
							<Text>${(item.dish.price * item.quantity).toFixed(2)}</Text>
							{/* Display PIPs if available */}
							{item.pips && item.pips.length > 0 && (
								<Text style={styles.pipsText}>
									For: {item.pips.map((pip) => pip.name).join(", ")}
								</Text>
							)}
							{/* Display special instructions if any */}
							{item.specialInstructions && (
								<Text style={styles.specialInstructions}>
									{item.specialInstructions}
								</Text>
							)}
						</View>
					))}

					{/* Order Total */}
					<View style={styles.orderTotal}>
						<Text style={styles.totalLabel}>Total:</Text>
						<Text style={styles.totalPrice}>
							${order.totalPrice.toFixed(2)}
						</Text>
					</View>
				</ScrollView>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
	},
	heading: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 10,
	},
	restaurantName: {
		fontSize: 18,
		marginBottom: 10,
	},
	orderItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 5,
		borderBottomWidth: 1,
		borderBottomColor: "#ccc",
		padding: 10,
	},
	pipsText: {
		fontSize: 12,
		color: "gray",
	},
	specialInstructions: {
		fontSize: 12,
		color: "gray",
		marginTop: 5,
	},
	orderTotal: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 20,
		borderTopWidth: 1,
		borderTopColor: "#ccc",
		paddingTop: 10,
	},
	totalLabel: {
		fontSize: 16,
		fontWeight: "bold",
	},
	totalPrice: {
		fontSize: 18,
		fontWeight: "bold",
	},
	errorText: {
		color: "red",
		marginBottom: 10,
	},
});

export default CheckoutScreen;
