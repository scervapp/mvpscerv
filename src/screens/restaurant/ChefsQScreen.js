// screens/restaurant/ChefsQScreen.js
import React, {
	useEffect,
	useState,
	useContext,
	useCallback,
	useRef,
	useMemo,
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
	Alert,
} from "react-native";


import moment from "moment";
import { Audio } from "expo-av";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// --- Kitchen Ticket Component ---
const KitchenTicket = ({ order, onUpdateStatus, viewMode }) => {
	const timeSince = moment(order.createdAt?.toDate()).fromNow();

	// Filter items based on the current view mode ('kitchen' or 'bar')
	const itemsToDisplay = order.items.filter(
		(item) => item.destination === viewMode
	);

	// If there are no items for the current view, don't render the ticket at all
	// This is a double-check; the main filtering happens in ChefsQScreen
	if (itemsToDisplay.length === 0) {
		return null;
	}

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
				{/* Map over the FILTERED items */}
				{itemsToDisplay.map((item, index) => (
					<View key={`${item.id}-${index}`} style={styles.ticketItemRow}>
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

// This component renders the 'Kitchen' and 'Bar' toggle buttons.
const ViewModeToggle = ({ viewMode, setViewMode }) => (
	<View style={styles.toggleContainer}>
		<TouchableOpacity
			style={[
				styles.toggleButton,
				viewMode === "kitchen" && styles.toggleButtonActive,
			]}
			onPress={() => setViewMode("kitchen")}
		>
			<MaterialCommunityIcons
				name="chef-hat"
				size={20}
				color={viewMode === "kitchen" ? colors.primary : colors.textMedium}
			/>
			<Text
				style={[
					styles.toggleButtonText,
					viewMode === "kitchen" && styles.toggleButtonTextActive,
				]}
			>
				Kitchen
			</Text>
		</TouchableOpacity>
		<TouchableOpacity
			style={[
				styles.toggleButton,
				viewMode === "bar" && styles.toggleButtonActive,
			]}
			onPress={() => setViewMode("bar")}
		>
			<MaterialCommunityIcons
				name="glass-cocktail"
				size={20}
				color={viewMode === "bar" ? colors.primary : colors.textMedium}
			/>
			<Text
				style={[
					styles.toggleButtonText,
					viewMode === "bar" && styles.toggleButtonTextActive,
				]}
			>
				Bar
			</Text>
		</TouchableOpacity>
	</View>
);

const ChefsQScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [orders, setOrders] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const previousOrderCount = useRef(0);
	const [sound, setSound] = useState();
	const [error, setError] = useState(null);
	const insets = useSafeAreaInsets();

	const [viewMode, setViewMode] = useState("kitchen"); // 'kitchen' or 'bar'

	async function playSound() {
		try {
			const { sound } = await Audio.Sound.createAsync(
				require("../../../assets/bell.mp3")
			);
			setSound(sound);
			await sound.playAsync();
		} catch (e) {
			console.warn("Could not play sound:", e);
		}
	}

	useEffect(() => {
		return sound
			? () => {
					sound.unloadAsync();
			  }
			: undefined;
	}, [sound]);

	useEffect(() => {
		// --- FIX: Use currentUserData.restaurantId for consistency ---
		const restaurantId = currentUserData?.uid;

		if (!restaurantId) {
			if (!currentUserData) return; // Don't show error while user data is loading
			console.warn(
				"ChefsQScreen: No restaurantId found on currentUserData. Cannot fetch orders."
			);
			setError("Your user profile is not linked to a restaurant.");
			setIsLoading(false);
			return;
		}

				const q = db.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("status", "in", ["new", "preparing", "ready"])
			.orderBy("createdAt", "desc");

		const unsubscribe = onSnapshot(
			q,
			(querySnapshot) => {
				const ordersData = querySnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));

				const newOrders = ordersData.filter((o) => o.status === "new");
				if (
					isLoading === false &&
					newOrders.length > previousOrderCount.current
				) {
					playSound();
				}
				previousOrderCount.current = newOrders.length;

				setOrders(ordersData);
				setIsLoading(false);
			},
			(err) => {
				console.error("ChefsQScreen snapshot error:", err);
				setError("Could not fetch orders.");
				setIsLoading(false);
			}
		);

		return () => unsubscribe();
	}, [currentUserData?.uid]); // Dependency on restaurantId

	const filteredOrders = useMemo(() => {
		if (!orders) return [];
		// An order should be shown if it contains at least one item for the current view
		return orders.filter(
			(order) =>
				order.items && order.items.some((item) => item.destination === viewMode)
		);
	}, [orders, viewMode]);

	const headingText = viewMode === "kitchen" ? "Chefs Q" : "Bar Q";
	const emptyQueueText =
		viewMode === "kitchen"
			? "The kitchen queue is clear!"
			: "The bar queue is clear!";

	if (isLoading) {
		return (
			<View style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}
	if (error) {
		return (
			<View style={styles.centeredContainer}>
				<Text style={styles.emptyQueueText}>{error}</Text>
			</View>
		);
	}

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
		<View style={[styles.container, { paddingTop: insets.top }]}>
			<View style={styles.headerRow}>
				<Text style={styles.heading}>{headingText}</Text>
				<ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
			</View>

			{filteredOrders.length === 0 ? (
				<View style={styles.centeredContainer}>
					<Ionicons name="receipt-outline" size={60} color={colors.textLight} />
					<Text style={styles.emptyQueueText}>{emptyQueueText}</Text>
				</View>
			) : (
				<FlatList
					data={filteredOrders}
					renderItem={({ item }) => (
						<KitchenTicket
							order={item}
							onUpdateStatus={handleUpdateOrderStatus}
							viewMode={viewMode}
						/>
					)}
					keyExtractor={(item) => item.id}
					contentContainerStyle={styles.listContainer}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 15,
		marginBottom: 10,
	},
	heading: {
		fontSize: 28,
		fontWeight: "bold",
		color: colors.textDark,
	},
	toggleContainer: {
		flexDirection: "row",
		backgroundColor: colors.backgroundMedium,
		borderRadius: 20,
		padding: 4,
		paddingTop: 10,
	},
	toggleButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 6,
		paddingHorizontal: 16,
		borderRadius: 16,
	},
	toggleButtonActive: {
		backgroundColor: colors.surfaceWhite,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 3,
	},
	toggleButtonText: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.textMedium,
		marginLeft: 6,
	},
	toggleButtonTextActive: {
		color: colors.primary,
	},
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	emptyQueueText: {
		fontSize: 18,
		color: colors.textMedium,
		marginTop: 15,
		textAlign: "center",
	},
	listContainer: { paddingHorizontal: 10, paddingBottom: 10 },
	ticketContainer: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		padding: 15,
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
		marginVertical: 6,
	},
	itemQuantity: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginRight: 10,
		width: 30,
	},
	itemDetails: { flex: 1 },
	itemName: {
		fontSize: 17,
		fontWeight: "500",
		color: colors.textDark,
		lineHeight: 22,
	},
	itemFor: {
		fontSize: 14,
		color: colors.textMedium,
		fontStyle: "italic",
		lineHeight: 18,
	},
	itemInstructions: {
		fontSize: 14,
		color: colors.statusDanger,
		fontWeight: "500",
		marginTop: 3,
		lineHeight: 18,
	},
	ticketActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 10,
		marginTop: 5,
	},
	actionButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
	preparingButton: { backgroundColor: colors.statusWarning + "20" },
	readyButton: { backgroundColor: colors.statusSuccess + "20" },
	actionButtonText: { fontSize: 16, fontWeight: "bold" },
});

export default ChefsQScreen;
