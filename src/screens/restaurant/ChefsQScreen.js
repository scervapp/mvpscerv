// screens/restaurant/ChefsQScreen.js
import React, {
	useEffect,
	useState,
	useContext,
	useCallback,
	useRef,
} from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
	RefreshControl,
} from "react-native";
import {
	collection,
	where,
	query,
	onSnapshot,
	orderBy,
	doc,
	updateDoc,
} from "firebase/firestore";

import moment from "moment";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";

// --- Kitchen Ticket Component ---
const KitchenTicket = ({ order, onUpdateStatus }) => {
	const timeSince = moment(order.createdAt?.toDate()).fromNow();

	const getStatusStyle = () => {
		if (order.status === "preparing")
			return {
				backgroundColor: colors.statusWarning + "30",
				borderColor: colors.statusWarning,
			};
		if (order.status === "ready")
			return {
				backgroundColor: colors.statusSuccess + "30",
				borderColor: colors.statusSuccess,
			};
		return {
			backgroundColor: colors.surfaceWhite,
			borderColor: colors.borderLight,
		};
	};

	return (
		<View style={[styles.ticketContainer, getStatusStyle()]}>
			<View style={styles.ticketHeader}>
				<View>
					<Text style={styles.ticketTable}>{order.table.name}</Text>
					<Text style={styles.ticketServer}>Server: {order.server.name}</Text>
				</View>
				<Text style={styles.ticketTime}>{timeSince}</Text>
			</View>
			<View style={styles.ticketItems}>
				{order.items.map((item) => (
					<View key={item.id} style={styles.ticketItemRow}>
						<Text style={styles.itemQuantity}>{item.quantity}x</Text>
						<View style={styles.itemDetails}>
							<Text style={styles.itemName}>{item.dishName}</Text>
							{item.orderedByPipName && (
								<Text style={styles.itemFor}>For: {item.orderedByPipName}</Text>
							)}
							{item.specialInstructions && (
								<Text style={styles.itemInstructions}>
									"{item.specialInstructions}"
								</Text>
							)}
						</View>
					</View>
				))}
			</View>
			<View style={styles.ticketActions}>
				{order.status === "new" && (
					<TouchableOpacity
						style={[styles.actionButton, styles.preparingButton]}
						onPress={() => onUpdateStatus(order.id, "preparing")}
					>
						<Text
							style={[styles.actionButtonText, { color: colors.statusWarning }]}
						>
							Start Preparing
						</Text>
					</TouchableOpacity>
				)}
				{order.status === "preparing" && (
					<TouchableOpacity
						style={[styles.actionButton, styles.readyButton]}
						onPress={() => onUpdateStatus(order.id, "ready")}
					>
						<Text
							style={[styles.actionButtonText, { color: colors.statusSuccess }]}
						>
							Mark as Ready
						</Text>
					</TouchableOpacity>
				)}
			</View>
		</View>
	);
};

const ChefsQScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [orders, setOrders] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const previousOrderCount = useRef(0);
	const [sound, setSound] = useState();

	async function playSound() {
		const { sound } = await Audio.Sound.createAsync(
			require("../../../assets/bell.mp3")
		);
		setSound(sound);
		await sound.playAsync();
	}

	useEffect(() => {
		return sound
			? () => {
					sound.unloadAsync();
			  }
			: undefined;
	}, [sound]);

	useEffect(() => {
		const restaurantId = currentUserData?.uid;

		if (!restaurantId) {
			console.warn(
				"ChefsQScreen: No restaurantId found on currentUserData. Cannot fetch orders."
			);
			setError("Your user profile is not linked to a restaurant.");
			setIsLoading(false);
			return;
		}

		console.log(
			`ChefsQScreen: Setting up listener for kitchen_orders at restaurant: ${restaurantId}`
		);

		const q = query(
			collection(db, "kitchen_orders"),
			where("restaurantId", "==", restaurantId),
			where("status", "in", ["new", "preparing", "ready"]), // Only show active orders
			orderBy("createdAt", "desc")
		);

		const unsubscribe = onSnapshot(q, (querySnapshot) => {
			const ordersData = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));

			// Check if there's a new order to play a sound
			if (ordersData.length > previousOrderCount.current && !isLoading) {
				const newOrders = ordersData.filter((o) => o.status === "new");
				if (newOrders.length > 0) playSound();
			}
			previousOrderCount.current = ordersData.length;

			setOrders(ordersData);
			setIsLoading(false);
		});

		return () => unsubscribe();
	}, [currentUserData?.restaurantId, isLoading]);

	const handleUpdateOrderStatus = async (orderId, newStatus) => {
		try {
			const orderRef = doc(db, "kitchen_orders", orderId);
			await updateDoc(orderRef, { status: newStatus });
			// The listener will automatically update the UI
		} catch (error) {
			console.error(`Error updating order ${orderId} to ${newStatus}:`, error);
			Alert.alert("Error", "Could not update order status.");
		}
	};

	if (isLoading) {
		return (
			<View style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				<Text style={styles.heading}>Chef's Queue</Text>
				{orders.length === 0 ? (
					<View style={styles.centeredContainer}>
						<Ionicons
							name="receipt-outline"
							size={60}
							color={colors.textLight}
						/>
						<Text style={styles.emptyQueueText}>
							The kitchen queue is clear!
						</Text>
					</View>
				) : (
					<FlatList
						data={orders}
						renderItem={({ item }) => (
							<KitchenTicket
								order={item}
								onUpdateStatus={handleUpdateOrderStatus}
							/>
						)}
						keyExtractor={(item) => item.id}
						contentContainerStyle={styles.listContainer}
					/>
				)}
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1, padding: 10, backgroundColor: colors.backgroundLight },
	heading: {
		fontSize: 28,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 10,
		paddingHorizontal: 10,
	},
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	emptyQueueText: { fontSize: 18, color: colors.textMedium, marginTop: 15 },
	listContainer: { paddingVertical: 10 },
	// Ticket Styles
	ticketContainer: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		padding: 15,
		marginHorizontal: 5,
		marginBottom: 15,
		borderLeftWidth: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3,
		elevation: 4,
	},
	ticketHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		paddingBottom: 10,
		marginBottom: 10,
	},
	ticketTable: { fontSize: 22, fontWeight: "bold", color: colors.primary },
	ticketServer: { fontSize: 14, color: colors.textMedium },
	ticketTime: { fontSize: 14, fontWeight: "500", color: colors.textMedium },
	ticketItems: { marginBottom: 15 },
	ticketItemRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginVertical: 5,
	},
	itemQuantity: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginRight: 10,
	},
	itemDetails: { flex: 1 },
	itemName: { fontSize: 17, fontWeight: "500", color: colors.textDark },
	itemFor: { fontSize: 14, color: colors.textMedium, fontStyle: "italic" },
	itemInstructions: {
		fontSize: 14,
		color: colors.statusDanger,
		fontWeight: "500",
		marginTop: 3,
	},
	ticketActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 10,
	},
	actionButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
	preparingButton: { backgroundColor: colors.statusWarning + "20" },
	readyButton: { backgroundColor: colors.statusSuccess + "20" },
	actionButtonText: { fontSize: 16, fontWeight: "bold" },
});

export default ChefsQScreen;
