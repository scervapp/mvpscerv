import React, { useContext, useEffect, useState, useCallback } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	FlatList,
	SafeAreaView,
	RefreshControl,
} from "react-native";

import {
	collection,
	query,
	where,
	orderBy,
	getDocs,
	Timestamp,
} from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import formatCurrency from "../../utils/currencyFormatter";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"; // For icons
import colors from "../../utils/styles/appStyles";

const OrderHistoryScreen = () => {
	const [orders, setOrders] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const { currentUserData } = useContext(AuthContext);
	const [refreshing, setRefreshing] = useState(false);
	const navigation = useNavigation();

	const fetchOrders = useCallback(async () => {
		if (!currentUserData?.uid) {
			setError("User not available.");
			setOrders([]); // Clear orders if user is not available
			setLoading(false);
			setRefreshing(false);
			return;
		}

		setError(null); // Clear previous errors on fetch

		try {
			const q = query(
				collection(db, "orders"),
				where("customerId", "==", currentUserData.uid),
				where("paymentStatus", "==", "paid"),
				orderBy("timestamp", "desc") // Show newest first
			);

			const querySnapshot = await getDocs(q);
			const orderList = querySnapshot.docs.map((doc) => {
				const data = doc.data();
				// Basic formatting for display in the list
				return {
					docId: doc.id, // Pass the actual Firestore document ID
					orderId: data.orderId || "N/A", // Your human-readable ID
					restaurantName:
						data.items?.[0]?.dish?.restaurantName ||
						data.restaurantName ||
						"Restaurant", // Try getting from item or store directly
					status: data.paymentStatus || "Unknown", // Use paymentStatus
					totalPrice: data.totalPrice || 0, // Final total paid (in cents)
					// Convert Firestore Timestamp to JS Date for formatting
					orderDate:
						data.timestamp instanceof Timestamp
							? data.timestamp.toDate()
							: new Date(),
				};
			});

			setOrders(orderList);
		} catch (err) {
			console.error("Error fetching order history: ", err);
			setError(err.message || "Failed to load order history.");
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [currentUserData?.uid]); // Dependency: re-fetch if user changes

	useEffect(() => {
		setLoading(true); // Set loading true on initial mount
		fetchOrders();
	}, [fetchOrders]); // Run fetchOrders on mount and when it changes (due to user change)

	const onRefresh = () => {
		setRefreshing(true);
		fetchOrders();
	};

	// Navigate to the detail screen, passing the FIRESTORE DOCUMENT ID
	const handleOrderPress = (orderDocId) => {
		if (!orderDocId) {
			console.error("Cannot navigate: Missing order document ID");
			return;
		}
		// Navigate to the *new* details screen name
		navigation.navigate("OrderHistoryDetail", { orderDocId: orderDocId });
	};

	const renderOrderItem = ({ item }) => {
		let statusColor = colors.textLight;
		let statusIcon = "progress-clock"; // Default icon

		return (
			<TouchableOpacity
				style={styles.orderCard}
				onPress={() => handleOrderPress(item.docId)}
			>
				<View style={styles.cardHeader}>
					<Text style={styles.restaurantName} numberOfLines={1}>
						{item.restaurantName}
					</Text>
					<Text style={styles.orderDate}>
						{item.orderDate.toLocaleDateString()}
						3
						{item.orderDate.toLocaleTimeString([], {
							hour: "numeric",
							minute: "2-digit",
						})}
					</Text>
				</View>
				<View style={styles.cardBody}>
					<Text style={styles.orderIdText}>ID: {item.orderId}</Text>
					<Text style={styles.totalPriceText}>
						{formatCurrency(item.totalPrice)}
					</Text>
				</View>
				<View style={styles.cardFooter}>
					<MaterialCommunityIcons
						name={statusIcon}
						size={18}
						color={statusColor}
					/>
					<Text style={[styles.statusText, { color: statusColor }]}>
						{item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
					</Text>
				</View>
			</TouchableOpacity>
		);
	};

	if (loading && orders.length === 0) {
		// Show loader only on initial load
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>Error: {error}</Text>
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<FlatList
				data={orders}
				renderItem={renderOrderItem}
				keyExtractor={(item) => item.docId}
				style={styles.list}
				contentContainerStyle={styles.listContent}
				ListEmptyComponent={() => (
					<View style={styles.centered}>
						<Text style={styles.emptyText}>
							You haven't placed any orders yet.
						</Text>
					</View>
				)}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
			/>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: colors.background || "#f4f4f8",
	},
	list: {
		flex: 1,
	},
	listContent: {
		padding: 15,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	errorText: {
		color: colors.danger || "red",
		fontSize: 16,
		textAlign: "center",
	},
	emptyText: {
		color: colors.textLight || "#6c757d",
		fontSize: 16,
		textAlign: "center",
		marginTop: 50,
	},
	orderCard: {
		backgroundColor: "#ffffff",
		borderRadius: 8,
		padding: 15,
		marginBottom: 15,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	cardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	restaurantName: {
		fontSize: 17,
		fontWeight: "bold",
		color: colors.textDark || "#333",
		flexShrink: 1, // Prevent long names from pushing date off
		marginRight: 8,
	},
	orderDate: {
		fontSize: 13,
		color: colors.textLight || "#777",
	},
	cardBody: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	orderIdText: {
		fontSize: 14,
		color: colors.textLight || "#6c757d",
		fontStyle: "italic",
	},
	totalPriceText: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.primary || "#0056b3",
	},
	cardFooter: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 5,
		paddingTop: 5,
		borderTopWidth: 1,
		borderTopColor: colors.lightGray || "#eee",
	},
	statusText: {
		fontSize: 14,
		fontWeight: "500",
		marginLeft: 5,
	},
});

export default OrderHistoryScreen;
