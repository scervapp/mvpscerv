import React, { useEffect, useState, useContext } from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	SectionList,
	TouchableOpacity,
	LayoutAnimation,
} from "react-native";
import {
	collection,
	query,
	where,
	onSnapshot,
	orderBy,
	doc,
	getDoc,
	getDocs,
	collectionGroup,
	updateDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { ActivityIndicator } from "react-native-paper";
import colors from "../../utils/styles/appStyles";
import OrderItem from "../../components/restaurant/OrderItem";

const ChefsQScreen = () => {
	const [orders, setOrders] = useState([]);
	const { currentUserData } = useContext(AuthContext);
	const [ordersByTable, setOrdersByTable] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [expandTables, setExpandTables] = useState(false);
	const [newItemsCount, setNewItemsCount] = useState({});

	useEffect(() => {
		// 1. Fetch orders from the top-level "chefsQ" collection
		const fetchOrders = async () => {
			setIsLoading(true);
			try {
				const chefsQueueRef = collectionGroup(db, "baskets");
				const q = query(
					chefsQueueRef,
					where("restaurantId", "==", currentUserData.uid),
					where("sentToChefQ", "==", true)
					//orderBy("timestamp", "desc")
				);

				const unsubscribe = onSnapshot(q, (querySnapshot) => {
					const newOrderByTable = {};
					const updatedNewItemsCount = { ...(newItemsCount || {}) };

					querySnapshot.forEach((doc) => {
						const orderItemData = doc.data();
						const tableId = orderItemData.table.id;
						const tableNumber = orderItemData.table.name;
						const docId = doc.id;

						if (!newOrderByTable[tableId]) {
							newOrderByTable[tableId] = {
								tableNumber,
								items: [],
								allItemsCompleted: true,
							};

							// Initialize new item count for this table if it doesnt exist
							if (!updatedNewItemsCount[tableId]) {
								updatedNewItemsCount[tableId] = 0;
							}
						}
						// Check if any item for this table is not completed
						if (orderItemData.itemStatus !== "completed") {
							newOrderByTable[tableId].allItemsCompleted = false;
						}

						// If the item is new (itemStatus == pending) increment the newcount by 1
						Object.keys(newOrderByTable).forEach((tableId) => {
							const pendingItemsCount = newOrderByTable[tableId].items.filter(
								(item) => item.itemStatus === "pending"
							).length;
							updatedNewItemsCount[tableId] = pendingItemsCount;

							// Animate if there are pending items
							if (pendingItemsCount > 0) {
								LayoutAnimation.configureNext(
									LayoutAnimation.Presets.easeInEaseOut
								);
							}
						});

						newOrderByTable[tableId].items.push({
							...orderItemData,
							id: docId,
						});
					});
					//	LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
					setOrdersByTable(newOrderByTable);
					setNewItemsCount(updatedNewItemsCount);
					setIsLoading(false);
				});

				return () => unsubscribe();
			} catch {
				console.log("Error fetching orders:", error);
			} finally {
				setIsLoading(false);
			}
		};
		fetchOrders();
	}, []);

	const handleMarkItemInProgress = async (itemId) => {
		try {
			// 1. Update the 'itemStatus' field in the corresponding basketItem document to 'preparing'
			const basketItemDocRef = doc(db, "baskets", itemId);

			const basketItemSnapshot = await getDoc(basketItemDocRef);

			if (basketItemSnapshot.exists()) {
				await updateDoc(basketItemDocRef, { itemStatus: "preparing" });

				// 2. Optionally, you can also update the corresponding item in the 'chefsQueue' collection
				//    (You'll need to implement the logic to find the correct document in the chefsQueue)

				// 3. Optionally, send a notification to the customer
				// ...
			} else {
				console.error("Basket item not found:", itemId);
				// Handle the error
			}
		} catch (error) {
			console.error("Error marking item as in progress:", error);
			// Handle the error
		}
	};

	const handleMarkItemComplete = async (itemId) => {
		const basketItemDocRef = doc(db, "baskets", itemId);
		const basketItemSnapshot = await getDoc(basketItemDocRef);

		try {
			if (basketItemSnapshot.exists()) {
				await updateDoc(basketItemDocRef, { itemStatus: "completed" });
			}
		} catch (error) {
			console.error("Basket item not found: ", itemId);
		}
	};

	const handleToggleTableSection = (tableId) => {
		setExpandTables((prevExpandTables) => ({
			...prevExpandTables,
			[tableId]: !prevExpandTables[tableId],
		}));
	};

	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Chef's Queue</Text>

			{isLoading ? (
				<ActivityIndicator />
			) : (
				<FlatList
					data={Object.entries(ordersByTable)}
					keyExtractor={([tableId]) => tableId}
					renderItem={({ item: [tableId, tableData] }) => (
						<View key={tableId} style={styles.tableSection}>
							{/* Table Number with Highlighted Style */}
							<TouchableOpacity
								style={[
									styles.tableHeaderContainer,
									!tableData.allItemsCompleted &&
										styles.tableHeaderContainerActive,
								]}
								onPress={() => handleToggleTableSection(tableId)}
							>
								<View>
									<Text style={styles.tableHeaderText}>
										{tableData.tableNumber}
									</Text>
								</View>
								{newItemsCount[tableId] > 0 && (
									<View style={styles.newItemIndicator}>
										<Text style={styles.newItemCount}>
											{newItemsCount[tableId]}
										</Text>
									</View>
								)}
							</TouchableOpacity>

							{/* Conditionally render order items */}
							{expandTables[tableId] && (
								<FlatList
									data={tableData.items}
									keyExtractor={(item) => item.id}
									renderItem={({ item }) => (
										<OrderItem
											item={item}
											onMarkComplete={handleMarkItemComplete}
											onMarkInProgress={handleMarkItemInProgress}
										/>
									)}
								/>
							)}
						</View>
					)}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	// ... your styles ...

	container: {
		flex: 1,
		padding: 16,
		backgroundColor: colors.background,
	},
	heading: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.primary,
	},
	tableSection: {
		marginBottom: 20,
		borderWidth: 1,
		borderColor: colors.lightGray,
		borderRadius: 8,
		padding: 10,
	},
	tableHeader: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
	},
	tableSectionActive: {
		// Style for active tables with unresolved items
		borderColor: colors.primary, // Or any suitable color to highlight active tables
		borderWidth: 4,
	},
	tableHeaderContainer: {
		backgroundColor: colors.lightGray, // Or any suitable background color
		padding: 10,
		borderRadius: 5,
		marginBottom: 10,
		alignItems: "center", // Center the text horizontally
	},
	tableHeaderContainerActive: {
		backgroundColor: colors.primary, // Or a color that stands out more
	},
	tableHeaderText: {
		fontSize: 18,
		fontWeight: "bold",
		color: "white", // Or any suitable contrasting color
	},
	newItemIndicator: {
		backgroundColor: "red", // Or any suitable color
		borderRadius: 50,
		width: 30,
		height: 30,
		justifyContent: "center",
		alignItems: "center",
		position: "absolute",
		top: 5,
		right: 10,
	},
	newItemCount: {
		color: "white",
		fontSize: 20,
		fontWeight: "bold",
	},
});

export default ChefsQScreen;
