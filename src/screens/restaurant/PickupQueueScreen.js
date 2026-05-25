// screens/restaurant/PickupQueueScreen.js
import React, { useState, useEffect, useContext, useCallback } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	FlatList,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import moment from "moment";

import colors from "../../utils/styles/appStyles";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { httpsCallable } from "@react-native-firebase/functions";
import printOrderReceipt from "../../utils/printOrderReceipt";
import { mockPrinterConfig } from "../../utils/printerConfigExamples";
import { formatCurrencyFromDollars } from "../../utils/currencyFormatter";
import RestaurantLockButton from "../../components/restaurant/RestaurantLockButton";

const PickupQueueScreen = () => {
	const { t, i18n } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const completePickupOrderHandoffFunction = httpsCallable(
		functions,
		"completePickupOrderHandoff",
	);

	const [orders, setOrders] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [printingOrderId, setPrintingOrderId] = useState(null);

	useEffect(() => {
		if (!currentUserData?.uid) return;

		const unsubscribe = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", currentUserData.uid)
			.where("overallStatus", "==", "active")
			.where("fulfillmentType", "==", "hotel_pickup")
			.onSnapshot((snap) => {
				if (!snap) return;

				const fetchedOrders = snap.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));

				fetchedOrders.sort((a, b) => {
					const timeA = a.createdAt?.toMillis() || 0;
					const timeB = b.createdAt?.toMillis() || 0;
					return timeA - timeB;
				});

				setOrders(fetchedOrders);
				setIsLoading(false);
			});

		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const getModifierName = useCallback(
		(modifier) => {
			if (!modifier) return "";
			if (typeof modifier.name === "string") return modifier.name;

			return (
				modifier.name?.[i18n.language?.substring(0, 2)] ||
				modifier.name?.en ||
				modifier.name?.es ||
				modifier.name?.original ||
				""
			);
		},
		[i18n.language],
	);

	const buildPrintableOrder = useCallback((order) => {
		const subtotalCents =
			Number(order.subtotal) ||
			(Array.isArray(order.items)
				? order.items.reduce((sum, item) => {
						const unitPrice =
							item.price !== undefined && item.price !== null
								? Number(item.price)
								: 0;
						const quantity = Number(item.quantity || 1);
						return sum + Math.round(unitPrice * 100) * quantity;
					}, 0)
				: 0);

		const taxCents = Number(order.taxAmount || order.tax || 0);
		const gratuityCents = Number(order.gratuityAmount || order.gratuity || 0);
		const platformFeeCents = Number(order.platformFee || 0);
		const totalPriceCents =
			Number(order.totalPrice) ||
			subtotalCents + taxCents + gratuityCents + platformFeeCents;

		return {
			id: order.id,
			orderId: order.orderId || order.id,
			readableOrderId: order.readableOrderId || order.id,
			restaurantName: order.restaurantName || "Scerv Partner",
			customerName:
				order.customerName ||
				order.orderedByPipName ||
				order.customerEmail ||
				"Pickup Guest",
			table: order.table || { name: "Pickup Window" },
			server: order.server || { name: "Pickup Queue" },
			orderMode: "pickup",
			fulfillmentType: "hotel_pickup",
			subtotal: subtotalCents,
			taxAmount: taxCents,
			gratuityAmount: gratuityCents,
			platformFee: platformFeeCents,
			totalPrice: totalPriceCents,
			items: Array.isArray(order.items) ? order.items : [],
		};
	}, []);

	const handlePrintReceipt = async (order) => {
		try {
			setPrintingOrderId(order.id);

			const printableOrder = buildPrintableOrder(order);

			const result = await printOrderReceipt(
				printableOrder,
				mockPrinterConfig,
				{
					type: "pickup",
					showBarcode: true,
					barcodeValue: printableOrder.readableOrderId || printableOrder.id,
					lang: i18n.language || "en",
				},
			);

			if (!result.success && !result.skipped) {
				Alert.alert(
					t("print_failed", "Print Failed"),
					result.error ||
						t("could_not_print_receipt", "Could not print receipt."),
				);
			}
		} catch (error) {
			console.error("Pickup print error:", error);
			Alert.alert(
				t("print_failed", "Print Failed"),
				t("could_not_print_receipt", "Could not print receipt."),
			);
		} finally {
			setPrintingOrderId(null);
		}
	};

	const handleHandOff = async (order) => {
		Alert.alert(
			t("confirm_handoff", "Confirm Handoff"),
			t(
				"handoff_message",
				"Has this order been handed to the guest or the runner?",
			),
			[
				{ text: t("cancel", "Cancel"), style: "cancel" },
				{
					text: t("confirm", "Confirm"),
					style: "default",
					onPress: async () => {
						try {
							await completePickupOrderHandoffFunction({
								orderId: order.id,
								staffId: activeSession?.id || null,
								staffName:
									activeSession?.name ||
									`${activeSession?.firstName || ""} ${
										activeSession?.lastName || ""
									}`.trim(),
							});
						} catch (error) {
							console.error("Error closing out pickup order:", error);
							Alert.alert(
								t("error", "Error"),
								t(
									"could_not_close_out_order_try_again",
									"Could not close out the order. Try again.",
								),
							);
						}
					},
				},
			],
		);
	};

	const renderOrderItem = ({ item }) => {
		const kitchenStatus = item.stationStatuses?.kitchen || item.status || "new";

		let statusText = t("pending", "Waiting on Kitchen");
		let statusColor = colors.statusWarning;
		let isReady = false;

		if (kitchenStatus === "preparing") {
			statusText = t("cooking", "Kitchen Preparing");
			statusColor = colors.primary;
		} else if (kitchenStatus === "ready") {
			statusText = t("ready_for_pickup", "READY FOR PICKUP");
			statusColor = colors.statusSuccess;
			isReady = true;
		}

		const waitTime = item?.createdAt?.toDate
			? moment(item.createdAt.toDate()).fromNow(true)
			: "Just now";

		const customerDisplayName =
			item.customerName ||
			item.orderedByPipName ||
			item.customerEmail ||
			t("pickup_guest", "Pickup Guest");

		const pickupInstructions =
			item.pickupSpecialInstructions || item.specialInstructions || "";

		return (
			<View style={[styles.orderCard, isReady && styles.orderCardReady]}>
				<View style={styles.cardHeader}>
					<View style={{ flex: 1, marginRight: 10 }}>
						<Text style={styles.orderTitle}>
							{item?.locationName || item?.table?.name || "Hotel Pickup"}
						</Text>

						<Text style={styles.customerName}>
							{t("customer", "Customer")}: {customerDisplayName}
						</Text>

						<Text style={styles.orderSubtitle}>
							{item.items?.length || 0} {t("items", "items")} •{" "}
							{t("waiting", "Waiting:")} {waitTime}
						</Text>
					</View>

					<View
						style={[
							styles.statusBadge,
							{ backgroundColor: statusColor + "20" },
						]}
					>
						<Text style={[styles.statusText, { color: statusColor }]}>
							{statusText.toUpperCase()}
						</Text>
					</View>
				</View>

				{!!pickupInstructions && (
					<View style={styles.specialInstructionsBanner}>
						<Text style={styles.specialInstructionsLabel}>
							{t("pickup_note", "PICKUP NOTE")}
						</Text>
						<Text style={styles.specialInstructionsText}>
							{pickupInstructions}
						</Text>
					</View>
				)}

				<View style={styles.itemsList}>
					{item.items?.map((dish, index) => (
						<View key={index} style={styles.itemBlock}>
							<Text style={styles.itemText}>
								<Text style={styles.itemQuantity}>{dish.quantity}x</Text>{" "}
								{dish.dishName || dish.name}
							</Text>

							{Array.isArray(dish.selectedModifiers) &&
								dish.selectedModifiers.length > 0 && (
									<View style={styles.modifiersWrap}>
										{dish.selectedModifiers.map((modifier, modIndex) => (
											<Text
												key={`${modifier.optionId || modifier.name || "mod"}-${modIndex}`}
												style={styles.modifierText}
											>
												• {getModifierName(modifier)}
												{Number(modifier.price || 0) > 0
													? ` (+${formatCurrencyFromDollars(modifier.price)})`
													: ""}
											</Text>
										))}
									</View>
								)}

							{dish.specialInstructions ? (
								<Text style={styles.dishInstructions}>
									"
									{typeof dish.specialInstructions === "object"
										? dish.specialInstructions?.[
												i18n.language?.substring(0, 2)
											] ||
											dish.specialInstructions?.en ||
											dish.specialInstructions?.es ||
											dish.specialInstructions?.original ||
											""
										: dish.specialInstructions}
									"
								</Text>
							) : null}
						</View>
					))}
				</View>

				<View style={styles.actionRow}>
					<TouchableOpacity
						style={styles.printButton}
						onPress={() => handlePrintReceipt(item)}
						disabled={printingOrderId === item.id}
					>
						{printingOrderId === item.id ? (
							<ActivityIndicator size="small" color={colors.primary} />
						) : (
							<>
								<Ionicons
									name="print-outline"
									size={18}
									color={colors.primary}
								/>
								<Text style={styles.printButtonText}>
									{t("print_receipt", "Print Receipt")}
								</Text>
							</>
						)}
					</TouchableOpacity>

					<TouchableOpacity
						style={[
							styles.handoffButton,
							!isReady && styles.handoffButtonDisabled,
						]}
						onPress={() => handleHandOff(item)}
					>
						<Ionicons
							name={isReady ? "checkmark-circle" : "time-outline"}
							size={20}
							color={isReady ? "#FFF" : colors.textMedium}
						/>
						<Text
							style={[
								styles.handoffButtonText,
								!isReady && { color: colors.textMedium },
							]}
						>
							{t("mark_as_handed_off", "Mark as Handed Off")}
						</Text>
					</TouchableOpacity>
				</View>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<Ionicons name="bag-handle" size={28} color={colors.primary} />
				<Text style={styles.title}>{t("pickup_queue", "Pickup Queue")}</Text>

				{!isLoading && orders.length > 0 && (
					<View style={styles.counterPill}>
						<Text style={styles.counterText}>{orders.length}</Text>
					</View>
				)}
				<RestaurantLockButton style={styles.headerLockButton} />
			</View>

			{isLoading ? (
				<View style={styles.centerContent}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			) : (
				<FlatList
					data={orders}
					keyExtractor={(item) => item.id}
					renderItem={renderOrderItem}
					contentContainerStyle={styles.listContent}
					ListEmptyComponent={
						<View style={styles.centerContent}>
							<Ionicons
								name="checkmark-done-circle"
								size={80}
								color="#E2E8F0"
							/>
							<Text style={styles.placeholderText}>
								{t("no_pickup_orders", "No active pickup orders right now.")}
							</Text>
						</View>
					}
				/>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.backgroundLight || "#F8FAFC" },
	header: {
		flexDirection: "row",
		alignItems: "center",
		padding: 20,
		backgroundColor: "#FFF",
		borderBottomWidth: 1,
		borderBottomColor: "#E2E8F0",
	},
	headerLockButton: {
		marginLeft: "auto",
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.textDark,
		marginLeft: 10,
	},
	counterPill: {
		backgroundColor: colors.statusDanger,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
		marginLeft: 12,
	},
	counterText: {
		color: "#FFF",
		fontWeight: "bold",
		fontSize: 14,
	},
	centerContent: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	placeholderText: {
		fontSize: 16,
		color: colors.textMedium,
		marginTop: 15,
		fontWeight: "600",
	},
	listContent: {
		padding: 15,
		paddingBottom: 100,
	},
	orderCard: {
		backgroundColor: "#FFF",
		borderRadius: 12,
		padding: 15,
		marginBottom: 15,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	orderCardReady: {
		borderColor: colors.statusSuccess,
		borderLeftWidth: 6,
	},
	cardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 15,
		borderBottomWidth: 1,
		borderBottomColor: "#F1F5F9",
		paddingBottom: 15,
	},
	orderTitle: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
	},
	customerName: {
		fontSize: 15,
		fontWeight: "700",
		color: colors.primary,
		marginTop: 5,
	},
	orderSubtitle: {
		fontSize: 14,
		color: colors.textMedium,
		marginTop: 4,
	},
	statusBadge: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 8,
	},
	statusText: {
		fontSize: 11,
		fontWeight: "900",
		letterSpacing: 0.5,
	},
	specialInstructionsBanner: {
		backgroundColor: "#FFF7ED",
		borderWidth: 1,
		borderColor: "#FDBA74",
		borderRadius: 10,
		padding: 10,
		marginBottom: 14,
	},
	specialInstructionsLabel: {
		fontSize: 11,
		fontWeight: "800",
		color: "#C2410C",
		marginBottom: 4,
	},
	specialInstructionsText: {
		fontSize: 14,
		fontWeight: "600",
		color: "#7C2D12",
		lineHeight: 18,
	},
	itemsList: {
		marginBottom: 15,
	},
	itemBlock: {
		marginBottom: 10,
	},
	itemText: {
		fontSize: 15,
		color: colors.textDark,
	},
	itemQuantity: {
		fontWeight: "bold",
		color: colors.primary,
	},
	modifiersWrap: {
		marginTop: 4,
		marginLeft: 10,
	},
	modifierText: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	dishInstructions: {
		fontSize: 12,
		color: colors.statusDanger,
		marginTop: 4,
		marginLeft: 10,
	},
	actionRow: {
		flexDirection: "row",
		gap: 10,
	},
	printButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#FFF",
		paddingVertical: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.primary,
	},
	printButtonText: {
		color: colors.primary,
		fontWeight: "bold",
		fontSize: 15,
		marginLeft: 8,
	},
	handoffButton: {
		flex: 1.4,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.statusSuccess,
		paddingVertical: 12,
		borderRadius: 8,
	},
	handoffButtonDisabled: {
		backgroundColor: "#F1F5F9",
		borderWidth: 1,
		borderColor: "#E2E8F0",
	},
	handoffButtonText: {
		color: "#FFF",
		fontWeight: "bold",
		fontSize: 16,
		marginLeft: 8,
	},
});

export default PickupQueueScreen;
