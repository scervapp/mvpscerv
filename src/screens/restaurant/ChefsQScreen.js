import React, { useEffect, useState, useContext, useRef } from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TouchableOpacity,
	LayoutAnimation,
	Animated,
	Dimensions,
	Modal,
	Button,
	TextInput,
	SectionList,
} from "react-native";
import {
	collectionGroup,
	query,
	where,
	onSnapshot,
	updateDoc,
	doc,
	getDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { ActivityIndicator } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import OrderItem from "../../components/restaurant/OrderItem";
import { Audio } from "expo-av";

const ChefsQScreen = () => {
	const [orders, setOrders] = useState([]);
	const { currentUserData } = useContext(AuthContext);
	const [isLoading, setIsLoading] = useState(true);
	const [expandTables, setExpandTables] = useState({});
	const [newItemsCount, setNewItemsCount] = useState({});
	const [sound, setSound] = useState();

	const [isSectionExpanded, setIsSectionExpanded] = useState({});

	// Ref to store the previous orders count
	const previousOrderCount = useRef(0);

	const handleToggleSection = (tableName) => {
		setIsSectionExpanded((prevExpanded) => ({
			...prevExpanded,
			[tableName]: !prevExpanded[tableName],
		}));
	};

	const handleApplyDiscount = async (itemId, discount) => {
		// itemId and discount are passed as arguments
		try {
			const basketItemRef = doc(db, "baskets", itemId);
			const basketItemSnapshot = await getDoc(basketItemRef);

			if (basketItemSnapshot.exists()) {
				const itemData = basketItemSnapshot.data();

				await updateDoc(basketItemRef, {
					discount,
					discountedPrice: (itemData.dish.price - discount).toFixed(2),
				});

				// ... (Optional: Update the UI to reflect the discount) ...
			} else {
				console.error("Basket item not found:", itemId);
			}
		} catch (error) {
			console.error("Error applying discount:", error);
		}
	};

	const removeCompletedItems = () => {
		const now = new Date();
		const cutoffTime = new Date(now.getTime() - 3 * 60 * 1000); // 3 minutes ago

		setOrders((prevOrders) =>
			prevOrders.filter(
				(order) =>
					order.itemStatus !== "completed" ||
					order.timestamp.toDate() > cutoffTime
			)
		);
	};

	// Play notification sound
	const playSound = async () => {
		const { sound } = await Audio.Sound.createAsync(
			require("../../../assets/bell.mp3")
		);
		setSound(sound);
		await sound.playAsync();
	};

	useEffect(() => {
		return sound ? () => sound.unloadAsync() : undefined;
	}, [sound]);

	// Fetch orders
	useEffect(() => {
		const fetchOrders = async () => {
			setIsLoading(true);
			try {
				const chefsQueueRef = collectionGroup(db, "baskets");
				const q = query(
					chefsQueueRef,
					where("restaurantId", "==", currentUserData.uid),
					where("sentToChefQ", "==", true)
				);

				const unsubscribe = onSnapshot(q, (querySnapshot) => {
					const ordersData = [];
					querySnapshot.forEach((doc) => {
						const orderData = doc.data();

						const orderId = doc.id;

						// Group by orderId within each table
						const existingOrderIndex = ordersData.findIndex(
							(order) => order.orderId === orderData.orderId
						);

						if (existingOrderIndex !== -1) {
							// Add the new item to the existing order
							ordersData[existingOrderIndex].items.push({
								id: doc.id,
								...orderData,
							});
						} else {
							// Create a new order entry
							ordersData.push({
								orderId: orderId,
								table: orderData.table,
								items: [{ id: doc.id, ...orderData }],
								server: orderData.server,
							});
						}
					});

					setOrders(ordersData);

					setIsLoading(false);
				});

				return () => unsubscribe();
			} catch (error) {
				console.log("Error fetching orders:", error);
			} finally {
				setIsLoading(false);
			}
		};
		fetchOrders();
	}, []);

	// Play sound when a new order is added
	useEffect(() => {
		if (orders.length > previousOrderCount.current) {
			playSound();
		}
		previousOrderCount.current = orders.length;
	}, [orders]);

	// Group orders by table
	const groupOrdersByTable = (orders) => {
		const groupedOrders = {};
		orders.forEach((order) => {
			const tableNumber = order.table.name;
			if (!groupedOrders[tableNumber]) {
				groupedOrders[tableNumber] = [];
			}
			groupedOrders[tableNumber].push(order);
		});

		// Return an array of objects suitable for SectionList
		return Object.entries(groupedOrders).map(([table, orders]) => ({
			table, // The table name as the key
			server: orders[0].server, // Flatten the server array for this table))
			data: orders.flatMap((order) => order.items), // Flatten the items array for this table
		}));
	};

	const handleOpenModal = (item) => {
		setSelectedItem(item);
		setModalVisible(true);
	};

	const handleToggleTableSection = (tableId) => {
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setExpandTables((prevExpandTables) => ({
			...prevExpandTables,
			[tableId]: !prevExpandTables[tableId],
		}));
	};

	// Mark item as preparing
	const handleMarkItemInProgress = async (itemId) => {
		try {
			const basketItemDocRef = doc(db, "baskets", itemId);
			await updateDoc(basketItemDocRef, { itemStatus: "preparing" });
		} catch (error) {
			console.error("Error marking item as in progress:", error);
		}
	};

	// Mark item as completed
	const handleMarkItemComplete = async (itemId) => {
		try {
			const basketItemDocRef = doc(db, "baskets", itemId);
			await updateDoc(basketItemDocRef, { itemStatus: "completed" });
		} catch (error) {
			console.error("Error marking item as completed:", error);
		}
	};

	// Call removeCompletedItems periodically (e.g., every 15 seconds)
	useEffect(() => {
		const interval = setInterval(removeCompletedItems, 15 * 1000); // 15 seconds
		return () => clearInterval(interval);
	}, []);

	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Chef's Queue</Text>

			{isLoading ? (
				<ActivityIndicator />
			) : orders.length === 0 ? (
				<View style={styles.emptyQueueContainer}>
					<Text style={styles.emptyQueueText}>No items in the queue.</Text>
				</View>
			) : (
				<SectionList // Use SectionList to display grouped items
					sections={groupOrdersByTable(orders)}
					keyExtractor={(item, index) => item.id.toString() + index}
					renderItem={({ item, section }) => (
						<View>
							{isSectionExpanded[section.table] && (
								<OrderItem
									item={item}
									onMarkComplete={handleMarkItemComplete}
									onMarkInProgress={handleMarkItemInProgress}
									onApplyDiscount={handleApplyDiscount}
									onPress={() => handleOpenModal(item)}
								/>
							)}
						</View>
					)}
					renderSectionHeader={({ section: { table, server } }) => {
						return (
							<TouchableOpacity onPress={() => handleToggleSection(table)}>
								<View style={styles.tableHeaderContainer}>
									<Text style={styles.tableHeaderText}>
										{table.replace("Table ", "")} -{" "}
										{/* Display table number only */}
										{server.firstName}
									</Text>
								</View>
							</TouchableOpacity>
						);
					}}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
		backgroundColor: colors.background,
	},
	heading: {
		textAlign: "center",
		fontSize: 24,
		fontWeight: "bold",
		color: "#333",
		marginBottom: 20,
	},
	orderSection: {
		marginBottom: 20,
		borderWidth: 1,
		borderColor: "#ddd",
		borderRadius: 8,
		overflow: "hidden",
	},
	tableHeader: {
		backgroundColor: "#f0f0f0",
		padding: 10,
		fontWeight: "bold",
		display: "flex",
		alignItems: "center",
	},
	tableHeaderText: {
		fontSize: 24, // Use a larger font size for better readability
		fontWeight: "bold", // Make the text bold
		color: colors.primary, // Use your primary color for the text
		marginRight: 10, // Add some space between the text and other elements
		textAlign: "center",
	},
	tableNumber: {
		fontSize: 18,
		marginRight: 10,
	},
	orderItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
	},
	itemName: {
		fontSize: 16,
		flex: 1,
	},
	specialInstructions: {
		fontSize: 14,
		color: "#d9534f",
		marginTop: 5,
	},
	itemPrice: {
		fontSize: 16,
		fontWeight: "bold",
	},
	orderTime: {
		fontSize: 12,
		color: "#888",
	},
	tableHeaderContainer: {
		backgroundColor: colors.secondary,
		padding: 10,
	},
	emptyQueueContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
});

export default ChefsQScreen;
