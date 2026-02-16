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
import { useTranslation } from 'react-i18next';
import { Button } from "react-native-paper";

import { db, functions } from "../../config/firebase"; // Adjust path
import formatCurrency from "../../utils/currencyFormatter";
import colors from "../../utils/styles/appStyles"; // Adjust path

// Import the newly created component
import DiscountModal from "./DiscountModal";
import { httpsCallable } from "@react-native-firebase/functions";

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
		orderedFor: item.pipName || item.customerName || t('guest'),
		price: item.dish?.price,
		discount: item.discount,
		discountedPrice: item.discountedPrice,
		status: item.sentToChefQ ? "sent" : "new",
	};
};

const OrderDetailsModal = ({ isVisible, onClose, table }) => {
	const { t } = useTranslation();
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

		const checkInRef = db.collection("checkIns").doc(table.currentCheckInId);
		let unsubscribe = () => {};

		const setupSubscription = async () => {
			try {
				const checkInSnap = await checkInRef.get();
				if (!checkInSnap.exists()) {
					throw new Error(t('associated_check_in_document_not_found_error'));
				}

				const checkInData = checkInSnap.data();

				setCheckInType(checkInData.type);
				if (checkInData.type === "party") {
					setAssociatedPartyId(checkInData.associatedPartyId);
				}

				if (checkInData.type === "party" && checkInData.associatedPartyId) {
					const sharedBasketRef = db
						.collection("shared_baskets")
						.doc(checkInData.associatedPartyId);
					unsubscribe = sharedBasketRef.onSnapshot((basketSnap) => {
						const items = basketSnap.exists()
							? (basketSnap.data().items || []).map(normalizePartyItem)
							: [];
						setOrderedItems(items);
						setIsLoading(false);
					});
				} else {
					const itemsQuery = db
						.collection("baskets")
						.where("checkInId", "==", table.currentCheckInId);
					unsubscribe = itemsQuery.onSnapshot((snapshot) => {
						const items = snapshot.docs.map(normalizeIndividualItem);
						setOrderedItems(items);
						setIsLoading(false);
					});
				}
			} catch (err) {
				console.error("Error setting up order details listener:", err);
				setError(t('could_not_load_order_details_error'));
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
				t('invalid_input_title'),
				t('enter_valid_discount_amount_and_reason_message')
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
					t('could_not_determine_party_or_check_in_id_for_discount_error')
				);
			}

			await discountFunction(payload);
			Alert.alert(t('success_title'), t('discount_applied_message'));
		} catch (error) {
			console.error("Error applying discount on client:", error);
			Alert.alert(t('error_title'), error.message || t('could_not_apply_discount_message'));
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
					<Text style={styles.itemFor}>{t('for_label')}: {item.orderedFor}</Text>
					{item.specialInstructions && (
						<Text style={styles.itemInstructions}>
							"{item.specialInstructions}"
						</Text>
					)}
					{item.discount > 0 && (
						<Text style={styles.discountText}>
							{t('discounted_by_label')} {formatCurrency(item.discount * 100)} - {t('new_price_label')}:{" "}
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
						<Text style={styles.modalTitle}>
							{t('order_details_for_table', { tableName: table?.name })}
						</Text>
					</View>

					<View style={styles.content}>
						{isLoading ? (
							<ActivityIndicator size="large" color={colors.primary} />
						) : error ? (
							<Text style={styles.errorText}>{error}</Text>
						) : (
							<>
								<FlatList
									data={orderedItems}
									renderItem={renderOrderItem}
									keyExtractor={(item) => item.id}
									ListEmptyComponent={
										<Text style={styles.noDataText}>
											{t('no_items_sent_to_kitchen_yet_message')}
										</Text>
									}
								/>
								{orderedItems.length > 0 && (
									<Text style={styles.tooltipText}>
										{t('long_press_item_for_discount_tooltip')}
									</Text>
								)}
							</>
						)}
					</View>

					<View style={styles.footer}>
						<Button onPress={onClose} mode="contained">
							{t('close_button')}
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
	tooltipText: {
		textAlign: "center",
		fontSize: 13,
		color: colors.textMedium,
		fontStyle: "italic",
		paddingVertical: 10,
	},
});

export default OrderDetailsModal;

