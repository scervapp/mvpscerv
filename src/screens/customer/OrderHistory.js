import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	FlatList,
} from "react-native";

import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";

const OrderHistoryScreen = () => {
	const [orders, setOrders] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const { currentUserData } = useContext(AuthContext);
	const navigation = useNavigation();

	useEffect(() => {
		const fetchOrder = async () => {
			setLoading(true);
			try {
				const q = query(
					collection(db, "orders"),
					where("customerId", "==", currentUserData.uid),
					orderBy("timestamp", "desc")
				);

				const querySnapshot = await getDocs(q);
				const orderList = querySnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));

				setOrders(orderList);
				setLoading(false);
			} catch (error) {
				console.error("Error fetching orders: ", error);
				setError(error.message);
			} finally {
				setLoading(false);
			}
		};
		fetchOrder();
	}, []);

	const handleOrderPress = (orderId) => {
		// Navigate to OrderConfirmation screen with orderId
		navigation.navigate("OrderConfirmation", { orderId });
	};

	if (loading) {
		return <ActivityIndicator size="large" color="#0000ff" />;
	}

	if (error) {
		return <Text>Error: {error}</Text>;
	}

	return (
		<View style={styles.container}>
			<Text>Order History</Text>
			<FlatList
				showsVerticalScrollIndicator={false}
				data={orders}
				keyExtractor={(item) => item.id}
				renderItem={({ item }) => (
					<TouchableOpacity onPress={() => handleOrderPress(item.orderId)}>
						<View
							style={{
								padding: 16,
								borderBottomWidth: 1,
								borderBottomColor: "#ccc",
							}}
						>
							<Text style={{ fontSize: 18 }}>Order ID: {item.orderId}</Text>
							<Text style={{ color: "#666" }}>
								Date: {new Date(item.timestamp.toMillis()).toLocaleDateString()}
							</Text>
						</View>
					</TouchableOpacity>
				)}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		backgroundColor: "#ffffff", // Background color of the order item
		borderRadius: 8, // Rounded corners
		padding: 16, // Padding inside the container
		marginVertical: 8, // Space between items
		shadowColor: "#000", // Shadow color for elevation
		shadowOffset: { width: 0, height: 2 }, // Offset for shadow
		shadowOpacity: 0.1, // Opacity of shadow
		shadowRadius: 4, // Blur radius of shadow
		elevation: 3, // For Android shadow
	},
	orderId: {
		fontSize: 16, // Font size for Order ID
		fontWeight: "bold", // Bold text
	},
	orderDate: {
		fontSize: 14, // Font size for Date
		color: "#777777", // Gray color for date
	},
	orderStatus: {
		fontSize: 14, // Font size for Status
		color: "#007BFF", // Blue color for status
	},
	totalPrice: {
		fontSize: 16, // Font size for Total Price
		fontWeight: "bold", // Bold text
		color: "#28A745", // Green color for total price
	},
});

export default OrderHistoryScreen;
