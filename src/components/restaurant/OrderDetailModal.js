import React, { useState, useEffect, useCallback } from "react";
import {
	View,
	Text,
	Modal,
	StyleSheet,
	FlatList,
	Alert,
	ActivityIndicator,
	TouchableOpacity,
	SafeAreaView,
} from "react-native";
import { Button } from "react-native-paper";
import {
	collection,
	query,
	where,
	onSnapshot,
	doc,
	getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions"; // Import for cloud function
import { db, functions } from "../../config/firebase"; // Adjust path
import formatCurrency from "../../utils/currencyFormatter";
import colors from "../../utils/styles/appStyles"; // Adjust path

// Import the newly created component
import DiscountModal from "./DiscountModal";

// Helper function to normalize party items
const normalizePartyItem = (item) => ({
	id: item.id,
	dishName: item.dishName,
	quantity: item.quantity,
	specialInstructions: item.specialInstructions,
	orderedFor: item.orderedByPipName || `User ${item.orderedByUserId.slice(-4)}`,
	price: item.price,
	discount: item.discount,
	discountedPrice: item.discountedPrice,
	status: item.status,
});

// Helper function to normalize individual items
const normalizeIndividualItem = (docSnap) => {
	const item = docSnap.data();
	return {
		id: docSnap.id,
		dishName: item.dish?.name,
		quantity: item.quantity,
		specialInstructions: item.specialInstructions,
		orderedFor: item.pipName || item.customerName || "Guest",
		price: item.dish?.price,
		discount: item.discount,
		discountedPrice: item.discountedPrice,
		status: item.sentToChefQ ? "sent" : "new",
	};
};

const OrderDetailsModal = ({ isVisible, onClose, table }) => {
	const [orderedItems, setOrderedItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isDiscountModalVisible, setIsDiscountModalVisible] = useState(false);
	const [itemToDiscount, setItemToDiscount] = useState(null);
	const [isDiscounting, setIsDiscounting] = useState(false);
	const [checkInType, setCheckInType] = useState(null);
	const [associatedPartyId, setAssociatedPartyId] = useState(null);

	// Using useCallback ensures this function isn't recreated on every render
	const fetchOrders = useCallback(() => {
		if (!table?.currentCheckInId) {
			setIsLoading(false);
			return () => {}; // Return an empty unsubscribe function
		}

		setIsLoading(true);
		setError(null);

		const checkInRef = doc(db, "checkIns", table.currentCheckInId);
		let unsubscribe = () => {};

		const setupSubscription = async () => {
			try {
				const checkInSnap = await getDoc(checkInRef);
				if (!checkInSnap.exists()) {
					throw new Error("Associated check-in document could not be found.");
				}

				const checkInData = checkInSnap.data();

				setCheckInType(checkInData.type);
				if (checkInData.type === "party") {
					setAssociatedPartyId(checkInData.associatedPartyId);
				}

				if (checkInData.type === "party" && checkInData.associatedPartyId) {
					const sharedBasketRef = doc(
						db,
						"shared_baskets",
						checkInData.associatedPartyId
					);
					unsubscribe = onSnapshot(sharedBasketRef, (basketSnap) => {
						const items = basketSnap.exists()
							? (basketSnap.data().items || []).map(normalizePartyItem)
							: [];
						setOrderedItems(items);
						setIsLoading(false);
					});
				} else {
					const itemsQuery = query(
						collection(db, "baskets"),
						where("checkInId", "==", table.currentCheckInId)
					);
					unsubscribe = onSnapshot(itemsQuery, (snapshot) => {
						const items = snapshot.docs.map(normalizeIndividualItem);
						setOrderedItems(items);
						setIsLoading(false);
					});
				}
			} catch (err) {
				console.error("Error setting up order details listener:", err);
				setError("Could not load order details.");
				setIsLoading(false);
			}
		};

		setupSubscription();
		return unsubscribe; // Return the firestore listener's unsubscribe function
	}, [table?.currentCheckInId]); // Dependency is now more specific

	useEffect(() => {
		let unsubscribe;
		if (isVisible) {
			unsubscribe = fetchOrders();
		} else {
			// Clear data when modal is not visible
			setOrderedItems([]);
		}
		// This is the cleanup function for useEffect
		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [isVisible, fetchOrders]);

	const handleOpenDiscountModal = useCallback((item) => {
		console.log("Opening discount modal for item:", item.dishName);
		setItemToDiscount(item);
		setIsDiscountModalVisible(true);
	}, []);

	const handleApplyDiscount = async (discountAmount, reason, item) => {
		if (
			!item ||
			isNaN(discountAmount) ||
			discountAmount <= 0 ||
			!reason?.trim()
		) {
			return Alert.alert(
				"Invalid Input",
				"Please enter a valid discount amount and reason."
			);
		}
		console.log("CLIENT-SIDE: Attempting to discount item with this data:", {
			partyId: checkInType === "party" ? associatedPartyId : null,
			checkInId: checkInType === "individual" ? table.currentCheckInId : null,
			itemId: item.id, // The ID we are sending
			itemName: item.dishName, // For context
		});

		setIsDiscounting(true);
		try {
			const discountFunction = httpsCallable(functions, "discountOrderItem");

			// This payload now reliably uses the stored context from state
			const payload = {
				partyId: checkInType === "party" ? associatedPartyId : null,
				checkInId: checkInType === "individual" ? table.currentCheckInId : null,
				itemId: item.id,
				discountAmount,
				reason,
			};

			// This check prevents sending a request that is guaranteed to fail
			if (!payload.partyId && !payload.checkInId) {
				throw new Error(
					"Could not determine Party ID or Check-In ID for the discount."
				);
			}

			await discountFunction(payload);
			Alert.alert("Success", "Discount has been applied.");
		} catch (error) {
			console.error("Error applying discount on client:", error);
			Alert.alert("Error", error.message || "Could not apply discount.");
		} finally {
			setIsDiscounting(false);
			setIsDiscountModalVisible(false);
		}
	};

	// Using useCallback for renderItem is a performance best practice
	const renderOrderItem = useCallback(
		({ item }) => (
			<TouchableOpacity
				style={styles.itemRow}
				onLongPress={() => handleOpenDiscountModal(item)}
			>
				<Text style={styles.itemQuantity}>{item.quantity}x</Text>
				<View style={styles.itemDetails}>
					<Text style={styles.itemName}>{item.dishName}</Text>
					<Text style={styles.itemFor}>For: {item.orderedFor}</Text>
					{item.specialInstructions && (
						<Text style={styles.itemInstructions}>
							"{item.specialInstructions}"
						</Text>
					)}
					{item.discount > 0 && (
						<Text style={styles.discountText}>
							Discounted by {formatCurrency(item.discount * 100)} - New Price:{" "}
							{formatCurrency(item.discountedPrice * 100)}
						</Text>
					)}
				</View>
				<Text style={styles.itemPrice}>
					{formatCurrency(item.price * item.quantity * 100)}
				</Text>
			</TouchableOpacity>
		),
		[handleOpenDiscountModal]
	);

	return (
		<Modal
			transparent={true}
			visible={isVisible}
			animationType="slide"
			onRequestClose={onClose}
		>
			<View style={styles.modalOverlay}>
				{/* The new container that acts as the centered "card" */}
				<View style={styles.modalContainer}>
					<View style={styles.header}>
						<Text style={styles.modalTitle}>Order Details for {table?.name}</Text>
					</View>

					<View style={styles.content}>
						{isLoading ? (
							<ActivityIndicator size="large" color={colors.primary} />
						) : error ? (
							<Text style={styles.errorText}>{error}</Text>
						) : (
							<FlatList
								data={orderedItems}
								renderItem={renderOrderItem}
								keyExtractor={(item) => item.id}
								ListEmptyComponent={
									<Text style={styles.noDataText}>
										No items sent to the kitchen yet.
									</Text>
								}
							/>
						)}
					</View>

					<View style={styles.footer}>
						<Button onPress={onClose} mode="contained">
							Close
						</Button>
					</View>
				</View>
			</View>
			{/* The new DiscountModal component is used here */}
			{itemToDiscount && (
				<DiscountModal
					isVisible={isDiscountModalVisible}
					onClose={() => setIsDiscountModalVisible(false)}
					onSubmit={handleApplyDiscount}
					item={itemToDiscount}
					isLoading={isDiscounting}
				/>
			)}
		</Modal>
	);
};

// Only keep styles relevant to OrderDetailsModal
const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContainer: {
		width: "90%",
		maxHeight: "80%",
		backgroundColor: colors.backgroundLight,
		borderRadius: 15,
		overflow: "hidden", // Ensures content respects the border radius
		shadowColor: "#000",
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		elevation: 5,
	},
	header: {
		paddingVertical: 15,
		paddingHorizontal: 20,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	modalTitle: {
		fontSize: 20, // Slightly smaller for a card view
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
	},
	content: {
		// Let content grow but not shrink, FlatList will handle scrolling
		flexGrow: 1,
		flexShrink: 1,
		padding: 15,
	},
	footer: {
		padding: 15,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	errorText: {
		textAlign: "center",
		color: colors.statusDanger,
		fontSize: 16,
		paddingVertical: 40,
	},
	noDataText: {
		textAlign: "center",
		color: colors.textMedium,
		fontSize: 16,
		paddingVertical: 40,
	},
	// --- Item styles remain the same ---
	itemRow: {
		flexDirection: "row",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		alignItems: "center",
	},
	itemQuantity: {
		fontSize: 16, // Adjusted for smaller modal
		fontWeight: "bold",
		color: colors.primary,
		marginRight: 15,
	},
	itemDetails: { flex: 1 },
	itemName: { fontSize: 16, fontWeight: "600", color: colors.textDark },
	itemFor: {
		fontSize: 14,
		color: colors.textMedium,
		fontStyle: "italic",
		marginTop: 2,
	},
	itemInstructions: { fontSize: 14, color: colors.statusDanger, marginTop: 4 },
	discountText: {
		fontSize: 13,
		color: colors.statusSuccess,
		marginTop: 4,
		fontWeight: "500",
	},
	itemPrice: { fontSize: 16, fontWeight: "bold", color: colors.textDark },
});

export default OrderDetailsModal;
