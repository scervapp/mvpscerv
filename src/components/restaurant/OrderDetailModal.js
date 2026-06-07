// components/restaurant/OrderDetailModal.js
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
import { useTranslation } from "react-i18next";
import { Button } from "react-native-paper";

import { db, functions } from "../../config/firebase";
import formatCurrency from "../../utils/currencyFormatter";
import colors from "../../utils/styles/appStyles";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";

import DiscountModal from "./DiscountModal";
import { httpsCallable } from "@react-native-firebase/functions";

// 🚨 THE FIX: Bulletproof normalizer to prevent silent crashes!
const normalizePartyItem = (item) => {
	// 1. Safely grab the user ID no matter what it was saved as
	const rawUserId =
		item.orderedByUserId || item.addedByUserId || item.userId || "0000";
	const safeUserId = String(rawUserId);

	return {
		id: item.id || Math.random().toString(),
		// 2. Safely grab the name (sometimes saved as 'name', sometimes 'dishName')
		dishName: item.dishName || item.name || "Order Item",
		quantity: item.quantity || 1,
		specialInstructions: item.specialInstructions || "",
		// 3. Safely grab the PIP name or fallback to the sliced ID
		orderedFor:
			item.orderedByPipName || item.pipName || `User ${safeUserId.slice(-4)}`,
		price: item.price || 0,
		discount: item.discount || 0,
		discountedPrice: item.discountedPrice || 0,
		status: item.status || "new",
	};
};

const normalizeIndividualItem = (docSnap) => {
	const item = docSnap.data();
	return {
		id: docSnap.id,
		dishName: item.dish?.name || item.name || "Order Item",
		quantity: item.quantity || 1,
		specialInstructions: item.specialInstructions || "",
		orderedFor: item.pipName || item.customerName || "Guest",
		price: item.dish?.price || item.price || 0,
		discount: item.discount || 0,
		discountedPrice: item.discountedPrice || 0,
		status: item.sentToChefQ ? "sent" : item.status || "new",
	};
};

const OrderDetailsModal = ({ isVisible, onClose, table }) => {
	const { t } = useTranslation();
	const { activeSession } = useEmployeeSession();
	const [orderedItems, setOrderedItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isDiscountModalVisible, setIsDiscountModalVisible] = useState(false);
	const [itemToDiscount, setItemToDiscount] = useState(null);
	const [isDiscounting, setIsDiscounting] = useState(false);
	const [checkInType, setCheckInType] = useState(null);
	const [associatedPartyId, setAssociatedPartyId] = useState(null);

	const fetchOrders = useCallback(() => {
		if (!table?.currentCheckInId) {
			setIsLoading(false);
			return () => {};
		}

		setIsLoading(true);
		setError(null);

		const checkInRef = db.collection("checkIns").doc(table.currentCheckInId);
		let unsubscribe = () => {};

		const setupSubscription = async () => {
			try {
				const checkInSnap = await checkInRef.get();
				if (!checkInSnap.exists()) {
					throw new Error(t("associated_check_in_document_not_found_error"));
				}

				const checkInData = checkInSnap.data();

				setCheckInType(checkInData.type);
				// Handle fallback if it's saved as partyId instead of associatedPartyId
				const safePartyId =
					checkInData.associatedPartyId || checkInData.partyId;

				if (checkInData.type === "party") {
					setAssociatedPartyId(safePartyId);
				}

				if (checkInData.type === "party" && safePartyId) {
					const sharedBasketRef = db
						.collection("shared_baskets")
						.doc(safePartyId);

					unsubscribe = sharedBasketRef.onSnapshot((basketSnap) => {
						const items = basketSnap.exists()
							? (basketSnap.data().items || [])
									.map(normalizePartyItem)
									// 🚨 THE FIX: Explicitly hide items that haven't been sent yet!
									.filter((item) => item.status !== "new")
							: [];
						setOrderedItems(items);
						setIsLoading(false);
					});
				} else {
					const itemsQuery = db
						.collection("baskets")
						.where("checkInId", "==", table.currentCheckInId);

					unsubscribe = itemsQuery.onSnapshot((snapshot) => {
						const items = snapshot.docs
							.map(normalizeIndividualItem)
							// 🚨 Filter individuals too
							.filter((item) => item.status !== "new");

						setOrderedItems(items);
						setIsLoading(false);
					});
				}
			} catch (err) {
				console.error("Error setting up order details listener:", err);
				setError(t("could_not_load_order_details_error"));
				setIsLoading(false);
			}
		};

		setupSubscription();
		return unsubscribe;
	}, [table?.currentCheckInId, t]);

	useEffect(() => {
		let unsubscribe;
		if (isVisible) {
			unsubscribe = fetchOrders();
		} else {
			setOrderedItems([]);
		}
		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [isVisible, fetchOrders]);

	const handleOpenDiscountModal = useCallback((item) => {
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
				t("invalid_input_title"),
				t("enter_valid_discount_amount_and_reason_message"),
			);
		}

		setIsDiscounting(true);
		try {
			const discountFunction = httpsCallable(functions, "discountOrderItem");

			const payload = {
				partyId: checkInType === "party" ? associatedPartyId : null,
				checkInId: checkInType === "individual" ? table.currentCheckInId : null,
				itemId: item.id,
				discountAmount,
				reason,
				staffId: activeSession?.id || null,
			};

			if (!payload.partyId && !payload.checkInId) {
				throw new Error(
					t("could_not_determine_party_or_check_in_id_for_discount_error"),
				);
			}

			await discountFunction(payload);
			Alert.alert(t("success_title"), t("discount_applied_message"));
		} catch (error) {
			console.error("Error applying discount on client:", error);
			Alert.alert(
				t("error_title"),
				error.message || t("could_not_apply_discount_message"),
			);
		} finally {
			setIsDiscounting(false);
			setIsDiscountModalVisible(false);
		}
	};

	const renderOrderItem = useCallback(
		({ item }) => (
			<TouchableOpacity
				style={styles.itemRow}
				onLongPress={() => handleOpenDiscountModal(item)}
			>
				<Text style={styles.itemQuantity}>{item.quantity}x</Text>
				<View style={styles.itemDetails}>
					<Text style={styles.itemName}>{item.dishName}</Text>
					<Text style={styles.itemFor}>
						{t("for_label")}: {item.orderedFor}
					</Text>
					{item.specialInstructions ? (
						<Text style={styles.itemInstructions}>
							"{item.specialInstructions}"
						</Text>
					) : null}
					{item.discount > 0 && (
						<Text style={styles.discountText}>
							{t("discounted_by_label")} {formatCurrency(item.discount * 100)} -{" "}
							{t("new_price_label")}:{" "}
							{formatCurrency(item.discountedPrice * 100)}
						</Text>
					)}
				</View>
				<Text style={styles.itemPrice}>
					{formatCurrency(item.price * item.quantity * 100)}
				</Text>
			</TouchableOpacity>
		),
		[handleOpenDiscountModal, t],
	);

	return (
		<Modal
			transparent={true}
			visible={isVisible}
			animationType="slide"
			onRequestClose={onClose}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContainer}>
					<View style={styles.header}>
						<Text style={styles.modalTitle}>
							{t("order_details_for_table", { tableName: table?.name })}
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
											{t("no_items_sent_to_kitchen_yet_message")}
										</Text>
									}
								/>
								{orderedItems.length > 0 && (
									<Text style={styles.tooltipText}>
										{t("long_press_item_for_discount_tooltip")}
									</Text>
								)}
							</>
						)}
					</View>

					<View style={styles.footer}>
						<Button onPress={onClose} mode="contained">
							{t("close_button")}
						</Button>
					</View>
				</View>
			</View>

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
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
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
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
	},
	content: {
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
	itemRow: {
		flexDirection: "row",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		alignItems: "center",
	},
	itemQuantity: {
		fontSize: 16,
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
