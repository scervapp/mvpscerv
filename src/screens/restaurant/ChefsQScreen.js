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
import { Ionicons } from "@expo/vector-icons";

const ChefsQScreen = () => {
	const [ordersByTable, setOrdersByTable] = useState([]);
	const { currentUserData } = useContext(AuthContext);
	const [isLoading, setIsLoading] = useState(true);
	const [expandTables, setExpandTables] = useState({});
	const [newItemsCount, setNewItemsCount] = useState({});
	const [sound, setSound] = useState();
	const pulseAnim = useRef(new Animated.Value(1)).current;
	const [screenWidth, setScreenWidth] = useState(
		Dimensions.get("window").width
	);
	const [numColumns, setNumColumns] = useState(2);
	const [modalVisible, setModalVisible] = useState(false);
	const [selectedTable, setSelectedTable] = useState(null);
	const [clearTableModalVisible, setCleartableModalvisible] = useState(false);
	const [discountModalVisible, setDiscountModalVisible] = useState(false);
	const [discountItem, setDiscountItem] = useState(null);
	const [discountAmount, setDiscountAmount] = useState("");

	const handleTablePress = (tableId, tableData) => {
		setSelectedTable(tableData);
		setModalVisible(true);
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

	// Play notification sound
	const playSound = async () => {
		const { sound } = await Audio.Sound.createAsync(
			require("../../../assets/notification.mp3")
		);
		setSound(sound);
		await sound.playAsync();
	};

	useEffect(() => {
		return sound ? () => sound.unloadAsync() : undefined;
	}, [sound]);

	// Calculate number of columns based on screen width
	useEffect(() => {
		const calculateColumns = () => {
			const usableScreenWidth = screenWidth - 40; // Acount for padding and margins
			const minItemWidth = 150; // Minimum width for each table section
			const columns = Math.floor(usableScreenWidth / minItemWidth);
			setNumColumns(Math.max(columns, 1)); // Ensure at least 1 column
		};

		calculateColumns(); // Initial calculation

		// Update on screen width changes
		const subscription = Dimensions.addEventListener("change", ({ window }) => {
			setScreenWidth(window.width);
			calculateColumns();
		});
		return () => subscription?.remove(); // Cleanup on unmount
	}, [screenWidth]);

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
					const newOrderByTable = {};
					const updatedNewItemsCount = { ...newItemsCount };

					querySnapshot.forEach((doc) => {
						const orderItemData = doc.data();
						const tableId = orderItemData.table.id;
						const tableNumber = orderItemData.table.name;

						if (!newOrderByTable[tableId]) {
							newOrderByTable[tableId] = {
								tableNumber,
								items: [],
								allItemsCompleted: true,
							};
						}

						// Check item status
						if (orderItemData.itemStatus !== "completed") {
							newOrderByTable[tableId].allItemsCompleted = false;
						}

						newOrderByTable[tableId].items.push({
							...orderItemData,
							id: doc.id,
						});

						// Count pending items
						const pendingItemsCount = newOrderByTable[tableId].items.filter(
							(item) => item.itemStatus === "pending"
						).length;

						updatedNewItemsCount[tableId] = pendingItemsCount;

						if (pendingItemsCount > 0) {
							LayoutAnimation.configureNext(
								LayoutAnimation.Presets.easeInEaseOut
							);
						}
					});

					setOrdersByTable(newOrderByTable);
					setNewItemsCount(updatedNewItemsCount);
					setIsLoading(false);

					// Trigger sound if there's a new pending item
					if (Object.values(updatedNewItemsCount).some((count) => count > 0)) {
						playSound();
						Animated.loop(
							Animated.sequence([
								Animated.timing(pulseAnim, {
									toValue: 1.2,
									duration: 500,
									useNativeDriver: true,
								}),
							])
						).start();
					}
				});
				return () => unsubscribe();
			} catch (error) {
				console.log("Error fetching orders:", error);
				setIsLoading(false);
			}
		};
		fetchOrders();
	}, []);

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

	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Chef's Queue</Text>

			{isLoading ? (
				<ActivityIndicator />
			) : (
				<>
					{Object.keys(ordersByTable).length === 0 ? (
						<View style={styles.emptyQueueContainer}>
							<Text style={styles.emptyQueueText}>No items in the queue.</Text>
							<Text style={styles.tipsText}>
								When orders arrive, they'll appear here grouped by table.
							</Text>
							<Text>
								Tap on a table to view its orders and mark them as complete.
							</Text>
						</View>
					) : (
						<View style={styles.tableContainer}>
							<FlatList
								data={Object.entries(ordersByTable)}
								keyExtractor={([tableId]) => tableId}
								numColumns={numColumns}
								columnWrapperStyle={styles.columnWrapper}
								renderItem={({ item: [tableId, tableData] }) => (
									<TouchableOpacity
										key={tableId}
										style={styles.tableSection}
										onPress={() => handleTablePress(tableId, tableData)}
									>
										<View style={styles.tableHeaderContainer}>
											<Text style={styles.tableHeaderText}>
												{tableData.tableNumber}
											</Text>
											{newItemsCount[tableId] > 0 && (
												<Animated.View
													style={[
														styles.newItemIndicator,
														{ transform: [{ scale: pulseAnim }] },
													]}
												>
													<Text style={styles.newItemCount}>
														{newItemsCount[tableId]}
													</Text>
												</Animated.View>
											)}
										</View>
									</TouchableOpacity>
								)}
							/>

							{/* Modal for displaying order details */}
							<Modal
								visible={modalVisible}
								animationType="slide"
								transparent={true}
							>
								<View style={styles.modalContainer}>
									<View style={styles.modalContent}>
										{selectedTable && (
											<>
												<Text style={styles.modalTitle}>
													{selectedTable.tableNumber}
												</Text>
												<FlatList
													data={selectedTable.items}
													keyExtractor={(item) => item.id}
													renderItem={({ item }) => (
														<OrderItem
															item={item}
															onMarkComplete={handleMarkItemComplete}
															onMarkInProgress={handleMarkItemInProgress}
															onApplyDiscount={handleApplyDiscount}
														/>
													)}
												/>
												<Button
													title="Close"
													onPress={() => setModalVisible(false)}
												/>
											</>
										)}
									</View>
								</View>
							</Modal>
						</View>
					)}
				</>
			)}
			{/* Modal for applying discount */}
			<Modal
				visible={discountModalVisible}
				animationType="slide"
				transparent={true}
			>
				<View style={styles.modalContainer}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>Apply Discount</Text>
						{discountItem && (
							<>
								<Text style={styles.modalItemText}>
									{discountItem.dish.name}
								</Text>
								<TextInput
									style={styles.discountInput}
									placeholder="Enter discount amount"
									value={discountAmount}
									onChangeText={setDiscountAmount}
									keyboardType="numeric"
								/>
								<Button title="Apply Discount" onPress={handleApplyDiscount} />
								<Button
									title="Cancel"
									onPress={() => {
										setDiscountModalVisible(false);
										setDiscountAmount("");
									}}
								/>
							</>
						)}
					</View>
				</View>
			</Modal>
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
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.primary,
		textAlign: "center",
	},
	emptyQueueContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	emptyQueueText: {
		fontSize: 18,
		color: colors.gray,
	},
	tableContainer: {
		flex: 1,
		position: "relative",
	},
	tableSection: {
		marginBottom: 20,
		borderWidth: 1,
		borderColor: colors.lightGray,
		borderRadius: 8,
		overflow: "hidden",
		marginHorizontal: 5,
	},
	tableHeaderContainer: {
		backgroundColor: "#90ee90", // Light green background
		padding: 10,
		flexDirection: "row",
		alignItems: "center",
	},
	tableHeaderContainerActive: {
		backgroundColor: "#e0f2f7",
	},
	tableHeaderContent: {
		flexDirection: "row",
		alignItems: "center",
	},
	tableHeaderText: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.text,
		marginRight: 10,
	},
	tableHeaderTextCompleted: {
		color: colors.success,
	},
	completedIcon: {
		color: colors.success,
	},
	newItemIndicator: {
		backgroundColor: "red",
		borderRadius: 50,
		width: 24,
		height: 24,
		justifyContent: "center",
		alignItems: "center",
		marginLeft: 10,
	},
	newItemCount: {
		color: "white",
		fontSize: 14,
		fontWeight: "bold",
	},
	modalContainer: {
		// Styles for the modal
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContent: {
		backgroundColor: "white",
		padding: 20,
		borderRadius: 10,
		width: "80%",
		maxHeight: "80%",
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 15,
	},
	tipsText: {
		justifyContent: "center",
		alignItems: "center",
		textAlign: "center",
	},
});

export default ChefsQScreen;
