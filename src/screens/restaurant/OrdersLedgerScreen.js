// screens/restaurant/OrdersLedgerScreen.js
import React, { useContext, useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	FlatList,
	TouchableOpacity,
	ActivityIndicator,
	TextInput,
} from "react-native";
import { httpsCallable } from "@react-native-firebase/functions";
import { functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import formatCurrency from "../../utils/currencyFormatter";
import { PICKUP_FLOW_ENABLED } from "../../config/featureFlags";

const FilterChip = ({ label, active, onPress }) => (
	<TouchableOpacity
		style={[styles.filterChip, active && styles.filterChipActive]}
		onPress={onPress}
	>
		<Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
			{label}
		</Text>
	</TouchableOpacity>
);

const StatusChip = ({ label, tone = "neutral" }) => (
	<View style={[styles.statusChip, styles[`statusChip_${tone}`]]}>
		<Text style={[styles.statusChipText, styles[`statusChipText_${tone}`]]}>
			{label}
		</Text>
	</View>
);

const getStatusTone = (status) => {
	const normalized = String(status || "").toLowerCase();
	if (["paid", "closed", "completed", "fulfilled"].includes(normalized)) {
		return "success";
	}
	if (["pending", "open", "active", "requested"].includes(normalized)) {
		return "warning";
	}
	return "neutral";
};

const getRestaurantNetReceived = (order) => {
	if (Number.isFinite(Number(order.restaurantTransferAmount))) {
		return Number(order.restaurantTransferAmount);
	}

	return Math.max(
		0,
		Number(order.totalPrice || 0) -
			Number(order.platformFee || 0) -
			Number(order.processorFee || 0),
	);
};

const humanizeValue = (value) =>
	String(value || "")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());

const getOrderSourceLabel = (order) => {
	if (order.isManualRestaurantOrder || order.closeoutSource === "restaurant_pos") {
		return "Staff / Restaurant POS";
	}
	if (order.paymentProcessor === "stripe") return "Customer App / Stripe";
	return humanizeValue(order.orderEntryMode || order.paymentProcessor || "Order");
};

const LedgerMoneyMetric = ({ label, value, highlight = false }) => (
	<View style={styles.moneyMetric}>
		<Text style={styles.moneyMetricLabel}>{label}</Text>
		<Text
			style={[
				styles.moneyMetricValue,
				highlight && styles.moneyMetricValueHighlight,
			]}
		>
			{formatCurrency(value)}
		</Text>
	</View>
);

const OrdersLedgerScreen = ({ navigation, route }) => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const [period, setPeriod] = useState(route.params?.initialPeriod || "today");
	const [searchText, setSearchText] = useState("");
	const [paymentMethod, setPaymentMethod] = useState("");
	const [orderMode, setOrderMode] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [orders, setOrders] = useState([]);

	useEffect(() => {
		if (!currentUserData?.uid) return;

		const load = async () => {
			setIsLoading(true);
			try {
				const fn = httpsCallable(functions, "getOrdersLedger");
				const res = await fn({
					restaurantId: currentUserData.uid,
					period,
					searchText,
					paymentMethod: paymentMethod || undefined,
					orderMode: orderMode || undefined,
					limit: 150,
				});
				setOrders(res?.data?.orders || []);
			} catch (e) {
				console.error("OrdersLedgerScreen load error:", e);
				setOrders([]);
			} finally {
				setIsLoading(false);
			}
		};

		load();
	}, [currentUserData?.uid, period, searchText, paymentMethod, orderMode]);

	const renderOrder = ({ item }) => {
		const netReceived = getRestaurantNetReceived(item);

		return (
			<TouchableOpacity
				style={styles.row}
				onPress={() =>
					navigation.navigate("OrderDetailScreen", { orderId: item.id })
				}
			>
				<View style={styles.rowTop}>
					<Text style={styles.orderId}>{item.readableOrderId || item.id}</Text>
					<Text style={styles.orderDate}>
						{item.fulfilledAt
							? new Date(item.fulfilledAt).toLocaleDateString()
							: "-"}
					</Text>
				</View>

				<View style={styles.moneyMetricRow}>
					<LedgerMoneyMetric
						label={t("customer_paid", "Customer Paid")}
						value={item.totalPrice}
					/>
					<LedgerMoneyMetric
						label={t("net_received", "Net Received")}
						value={netReceived}
						highlight
					/>
				</View>

				<View style={styles.metaGrid}>
					<Text style={styles.metaText}>
						{t("payment", "Payment")}:{" "}
						{[item.paymentMethod, item.paymentProcessor]
							.filter(Boolean)
							.join(" / ")}
					</Text>
					<Text style={styles.metaText}>
						{t("table", "Table")}: {item.table?.name || item.fulfillmentType || "-"}
					</Text>
					<Text style={styles.metaText}>
						{t("server", "Server")}:{" "}
						{item.server?.name || t("unassigned", "Unassigned")}
					</Text>
					<Text style={styles.metaText}>
						{t("mode", "Mode")}: {item.orderMode || "-"}
					</Text>
				</View>

				<View style={styles.chipRow}>
					<StatusChip
						label={getOrderSourceLabel(item)}
						tone={item.isManualRestaurantOrder ? "warning" : "neutral"}
					/>
					<StatusChip
						label={item.paymentStatus || t("unknown_payment", "Unknown payment")}
						tone={getStatusTone(item.paymentStatus)}
					/>
					<StatusChip
						label={item.orderStatus || t("unknown_status", "Unknown status")}
						tone={getStatusTone(item.orderStatus)}
					/>
					{item.restaurantTransferStatus ? (
						<StatusChip
							label={`${t("transfer", "Transfer")}: ${item.restaurantTransferStatus}`}
							tone={getStatusTone(item.restaurantTransferStatus)}
						/>
					) : null}
				</View>

				<View style={styles.financialRow}>
					<Text style={styles.financialText}>
						{t("subtotal", "Subtotal")}: {formatCurrency(item.subtotal)}
					</Text>
					<Text style={styles.financialText}>
						{item.isManualRestaurantOrder
							? t("fee_waived", "Scerv Fee Waived")
							: `${t("fees", "Fees")}: ${formatCurrency(
									Number(item.platformFee || 0) +
										Number(item.processorFee || 0),
								)}`}
					</Text>
				</View>

				{item.isManualRestaurantOrder ? (
					<View style={styles.manualAuditRow}>
						<Text style={styles.manualAuditText}>
							{t("tender", "Tender")}:{" "}
							{humanizeValue(item.tenderType || item.paymentMethod)}
						</Text>
						<Text style={styles.manualAuditText}>
							{t("closed_by", "Closed by")}:{" "}
							{item.closedBy?.name || item.closedByName || "-"}
						</Text>
						<Text style={styles.manualAuditText}>
							{t("tax", "Tax")}:{" "}
							{item.taxRate !== null && item.taxRate !== undefined
								? `${(Number(item.taxRate || 0) * 100).toFixed(2)}%`
								: "-"}{" "}
							{item.taxSource ? `(${item.taxSource})` : ""}
						</Text>
					</View>
				) : null}
			</TouchableOpacity>
		);
	};

	return (
		<SafeAreaView style={styles.container}>
			<Text style={styles.title}>{t("orders_ledger", "Orders Ledger")}</Text>

			<TextInput
				style={styles.search}
				value={searchText}
				onChangeText={setSearchText}
				placeholder={t("search_orders", "Search orders")}
				placeholderTextColor={colors.textMedium}
			/>

			<View style={styles.tabs}>
				{["today", "week", "month"].map((value) => (
					<TouchableOpacity
						key={value}
						style={[styles.tab, period === value && styles.tabActive]}
						onPress={() => setPeriod(value)}
					>
						<Text
							style={[styles.tabText, period === value && styles.tabTextActive]}
						>
							{t(value)}
						</Text>
					</TouchableOpacity>
				))}
			</View>

			<View style={styles.filterGroup}>
				{[
					["", t("all_payments", "All payments")],
					["stripe", "Stripe"],
					["cash", t("cash", "Cash")],
					["external_terminal", t("card_terminal", "Card Terminal")],
				].map(([value, label]) => (
					<FilterChip
						key={value || "all-payments"}
						label={label}
						active={paymentMethod === value}
						onPress={() => setPaymentMethod(value)}
					/>
				))}
			</View>

			<View style={styles.filterGroup}>
				{[
					["", t("all_orders", "All orders")],
					["dineIn", t("dine_in", "Dine In")],
					...(PICKUP_FLOW_ENABLED ? [["pickup", t("pickup", "Pickup")]] : []),
				].map(([value, label]) => (
					<FilterChip
						key={value || "all-orders"}
						label={label}
						active={orderMode === value}
						onPress={() => setOrderMode(value)}
					/>
				))}
			</View>

			{isLoading ? (
				<ActivityIndicator size="large" color={colors.primary} />
			) : (
				<FlatList
					data={orders}
					keyExtractor={(item) => item.id}
					renderItem={renderOrder}
					contentContainerStyle={{ paddingBottom: 30 }}
					ListEmptyComponent={
						<Text style={styles.emptyText}>
							{t("no_orders_found", "No orders found.")}
						</Text>
					}
				/>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		padding: 16,
	},
	title: {
		fontSize: 26,
		fontWeight: "700",
		color: colors.textDark,
		marginBottom: 12,
	},
	search: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 10,
		padding: 12,
		marginBottom: 12,
		color: colors.textDark,
	},
	tabs: {
		flexDirection: "row",
		marginBottom: 12,
	},
	tab: {
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 20,
		backgroundColor: colors.backgroundMedium,
		marginRight: 8,
	},
	tabActive: { backgroundColor: colors.primary },
	tabText: { color: colors.textMedium, fontWeight: "600" },
	tabTextActive: { color: "#fff" },
	filterGroup: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: 8,
	},
	filterChip: {
		paddingVertical: 7,
		paddingHorizontal: 12,
		borderRadius: 18,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginRight: 8,
		marginBottom: 8,
	},
	filterChipActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	filterChipText: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "700",
	},
	filterChipTextActive: { color: "#fff" },
	row: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 14,
		marginBottom: 10,
	},
	rowTop: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 6,
	},
	orderId: {
		fontWeight: "700",
		color: colors.textDark,
		fontSize: 15,
		flex: 1,
		marginRight: 10,
	},
	orderDate: {
		fontWeight: "700",
		color: colors.textMedium,
		fontSize: 12,
	},
	moneyMetricRow: {
		flexDirection: "row",
		marginTop: 8,
	},
	moneyMetric: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		paddingVertical: 9,
		paddingHorizontal: 10,
		marginRight: 10,
	},
	moneyMetricLabel: {
		color: colors.textMedium,
		fontSize: 11,
		fontWeight: "700",
		textTransform: "uppercase",
	},
	moneyMetricValue: {
		color: colors.textDark,
		fontSize: 16,
		fontWeight: "900",
		marginTop: 3,
	},
	moneyMetricValueHighlight: {
		color: colors.primary,
	},
	metaGrid: {
		marginTop: 8,
	},
	metaText: {
		color: colors.textMedium,
		fontSize: 13,
		marginTop: 2,
	},
	chipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: 8,
	},
	statusChip: {
		borderRadius: 14,
		paddingVertical: 4,
		paddingHorizontal: 9,
		marginRight: 6,
		marginBottom: 4,
	},
	statusChip_success: { backgroundColor: `${colors.statusSuccess}18` },
	statusChip_warning: { backgroundColor: `${colors.statusWarning}18` },
	statusChip_neutral: { backgroundColor: colors.backgroundMedium },
	statusChipText: {
		fontSize: 11,
		fontWeight: "800",
		textTransform: "uppercase",
	},
	statusChipText_success: { color: colors.statusSuccess },
	statusChipText_warning: { color: colors.statusWarning },
	statusChipText_neutral: { color: colors.textMedium },
	financialRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 8,
		paddingTop: 8,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	financialText: {
		color: colors.textDark,
		fontSize: 13,
		fontWeight: "600",
	},
	manualAuditRow: {
		marginTop: 8,
		paddingTop: 8,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	manualAuditText: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "600",
		marginTop: 2,
	},
	emptyText: {
		textAlign: "center",
		color: colors.textMedium,
		marginTop: 40,
		fontSize: 16,
	},
});

export default OrdersLedgerScreen;
