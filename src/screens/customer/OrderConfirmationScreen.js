import React, { useContext, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { transformBasketData } from "../../utils/customerUtils";
import colors from "../../utils/styles/appStyles";

const OrderConfirmationScreen = ({ route, navigation }) => {
	const { orderId } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const [order, setOrder] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [filteredBasketData, setFilteredBasketData] = useState([]);
	const [expandedPIPs, setExpandedPIPs] = useState({});

	useEffect(() => {
		const fetchOrderDetails = async () => {
			try {
				const orderRef = doc(db, "orders", orderId);
				const orderSnapshot = await getDoc(orderRef);

				if (orderSnapshot.exists()) {
					setOrder(orderSnapshot.data());

					// Transform basket data (if needed)
					const transformedData = transformBasketData(
						orderSnapshot.data().items
					);
					setFilteredBasketData(transformedData);
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
	}, [orderId]);

	const toggleExpandPIP = (personId) => {
		setExpandedPIPs((prevExpandedPIPs) => ({
			...prevExpandedPIPs,
			[personId]: !prevExpandedPIPs[personId],
		}));
	};

	return (
		<View style={styles.container}>
			{isLoading ? (
				<ActivityIndicator size="large" />
			) : error ? (
				<Text style={styles.errorText}>{error}</Text>
			) : order ? (
				<ScrollView>
					<Text style={styles.heading}>Order Confirmation</Text>
					<Text style={styles.orderId}>Order ID: {order.orderId}</Text>

					{/* Order Details */}
					{filteredBasketData.map((personData) => {
						const isExpanded = expandedPIPs[personData.personId] || false;

						return (
							<View key={personData.personId} style={styles.personSection}>
								<TouchableOpacity
									onPress={() => toggleExpandPIP(personData.personId)}
									style={styles.personHeader}
								>
									<Text style={styles.personName}>{personData.pipName}</Text>
									<Text style={styles.pipTotalPrice}>
										${personData.totalPrice.toFixed(2)}
									</Text>
								</TouchableOpacity>

								{isExpanded &&
									personData.items.map((item) => (
										<View key={item.id} style={styles.orderItem}>
											<Text>
												{item.dish.name} x {item.quantity}
											</Text>
											<Text>
												${(item.dish.price * item.quantity).toFixed(2)}
											</Text>
											{/* ... you can add more details like special instructions later */}
										</View>
									))}
							</View>
						);
					})}

					<View style={styles.orderSummary}>
						<Text>Subtotal: ${order.subtotal.toFixed(2)}</Text>
						<Text>Tax: ${order.tax.toFixed(2)}</Text>
						<Text>Fee: ${order.fee.toFixed(2)}</Text>
						<Text>Gratuity: ${order.gratuity.toFixed(2)}</Text>
						<Text style={styles.totalPrice}>
							Total: ${order.totalPrice.toFixed(2)}
						</Text>
					</View>

					<Button
						title="Done"
						onPress={() => navigation.navigate("CustomerDashboard")}
					/>
				</ScrollView>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
		backgroundColor: colors.background, // Use your app's background color
	},
	heading: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 10,
		color: colors.primary, // Or any color that fits your design
		textAlign: "center",
	},
	orderId: {
		fontSize: 16,
		marginBottom: 20,
		textAlign: "center",
	},
	personSection: {
		marginBottom: 20,
		backgroundColor: colors.lightGray, // Or a suitable light background color
		borderRadius: 8,
		padding: 10,
	},
	personHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	personName: {
		fontSize: 18,
		fontWeight: "bold",
	},
	pipTotalPrice: {
		fontWeight: "bold",
	},
	orderItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 5,
		paddingHorizontal: 10,
	},
	dishName: {
		fontSize: 16,
	},
	quantity: {
		marginHorizontal: 5,
	},
	itemPrice: {
		fontWeight: "bold",
	},
	specialInstructions: {
		fontSize: 14,
		color: "gray",
		marginTop: 5,
	},
	orderSummary: {
		marginTop: 20,
		borderTopWidth: 1,
		borderTopColor: colors.lightGray,
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

export default OrderConfirmationScreen;
