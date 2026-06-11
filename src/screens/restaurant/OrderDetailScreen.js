// screens/restaurant/OrderDetailScreen.js
import React, { useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	ScrollView,
	ActivityIndicator,
} from "react-native";
import { httpsCallable } from "@react-native-firebase/functions";
import { functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import formatCurrency, {
	formatCurrencyFromDollars,
} from "../../utils/currencyFormatter";

const MoneyRow = ({ label, value, isDeduction = false, isTotal = false }) => (
	<View style={[styles.moneyRow, isTotal && styles.moneyTotalRow]}>
		<Text style={[styles.moneyLabel, isTotal && styles.moneyTotalLabel]}>
			{label}
		</Text>
		<Text
			style={[
				styles.moneyValue,
				isDeduction && styles.moneyDeduction,
				isTotal && styles.moneyTotalValue,
			]}
		>
			{isDeduction ? `-${formatCurrency(value)}` : formatCurrency(value)}
		</Text>
	</View>
);

const TraceRow = ({ label, value }) => {
	if (!value) return null;

	return (
		<View style={styles.traceRow}>
			<Text style={styles.traceLabel}>{label}</Text>
			<Text style={styles.traceValue} selectable>
				{value}
			</Text>
		</View>
	);
};

const humanizeValue = (value) =>
	String(value || "")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());

const OrderDetailScreen = ({ route }) => {
	const { orderId } = route.params;
	const [order, setOrder] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const load = async () => {
			setIsLoading(true);
			try {
				const fn = httpsCallable(functions, "getOrderDetail");
				const res = await fn({ orderId });
				setOrder(res.data);
			} catch (e) {
				console.error("OrderDetailScreen load error:", e);
				setOrder(null);
			} finally {
				setIsLoading(false);
			}
		};
		load();
	}, [orderId]);

	const getModifierName = (modifier) =>
		typeof modifier?.name === "string"
			? modifier.name
			: modifier?.name?.en ||
				modifier?.name?.es ||
				modifier?.name?.original ||
				"";

	if (isLoading) {
		return (
			<SafeAreaView style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</SafeAreaView>
		);
	}

	if (!order) {
		return (
			<SafeAreaView style={styles.centered}>
				<Text style={styles.emptyText}>Order not found.</Text>
			</SafeAreaView>
		);
	}

	const customerPaid = Number(order.totalPrice || 0);
	const customerServiceFee = Number(
		order.customerServiceFeeAmount || order.customerServiceFee || 0,
	);
	const platformFee = Number(order.platformFee || 0);
	const processorFee = Number(order.processorFee || 0);
	const restaurantProcessingFee = Number(
		order.restaurantProcessingFeeAmount ||
			order.processorFeeAppliedToRestaurantSales ||
			processorFee ||
			0,
	);
	const restaurantNetReceived = Number.isFinite(
		Number(order.restaurantTransferAmount),
	)
		? Number(order.restaurantTransferAmount)
		: Math.max(0, customerPaid - platformFee - restaurantProcessingFee);
	const totalProcessingFees = Math.max(
		0,
		customerPaid - restaurantNetReceived,
	);
	const stripePaymentIntentId =
		order.stripePaymentIntentId || order.paymentIntentId || order.paymentProcessorId;
	const isManualRestaurantOrder =
		order.isManualRestaurantOrder || order.closeoutSource === "restaurant_pos";
	const sourceLabel = isManualRestaurantOrder
		? "Staff / Restaurant POS"
		: order.paymentProcessor === "stripe"
			? "Customer App / Stripe"
			: humanizeValue(order.orderEntryMode || order.paymentProcessor || "Order");
	const taxRateLabel =
		order.taxRate !== null && order.taxRate !== undefined
			? `${(Number(order.taxRate || 0) * 100).toFixed(2)}%`
			: null;

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView contentContainerStyle={{ padding: 16 }}>
				<Text style={styles.title}>{order.readableOrderId || order.id}</Text>
				<Text style={styles.meta}>
					{order.restaurantName} • {order.orderMode} • {order.paymentMethod}
				</Text>
				<Text style={styles.meta}>
					{order.table?.name || order.fulfillmentType || "-"} •{" "}
					{order.server?.name || "Unassigned"}
				</Text>
				<Text style={styles.meta}>
					{order.fulfilledAt
						? new Date(order.fulfilledAt).toLocaleString()
						: "-"}
				</Text>
				<View style={styles.sourceBanner}>
					<Text style={styles.sourceBannerTitle}>{sourceLabel}</Text>
					<Text style={styles.sourceBannerText}>
						{isManualRestaurantOrder
							? "Manual tender recorded in Scerv. Processing fees waived for cash/external terminal."
							: "Paid through customer checkout."}
					</Text>
				</View>

				<View style={styles.card}>
					<Text style={styles.cardTitle}>Items</Text>
					{(order.items || []).map((item, index) => (
						<View key={`${item.id || index}`} style={styles.itemBlock}>
							<Text style={styles.itemName}>
								{item.quantity || 1}x {item.dishName || item.name}
							</Text>

							{Array.isArray(item.selectedModifiers) &&
								item.selectedModifiers.map((modifier, modIndex) => (
									<Text key={modIndex} style={styles.modifierText}>
										• {getModifierName(modifier)}
										{Number(modifier.price || 0) > 0
											? ` (+${formatCurrencyFromDollars(modifier.price)})`
											: ""}
									</Text>
								))}

							{item.specialInstructions ? (
								<Text style={styles.instructions}>
									"
									{typeof item.specialInstructions === "object"
										? item.specialInstructions.en ||
											item.specialInstructions.es ||
											item.specialInstructions.original ||
											""
										: item.specialInstructions}
									"
								</Text>
							) : null}
						</View>
					))}
				</View>

				<View style={styles.card}>
					<Text style={styles.cardTitle}>Financials</Text>
					<MoneyRow label="Subtotal" value={order.subtotal} />
					<MoneyRow label="Discounts" value={order.discountTotal} isDeduction />
					<MoneyRow label="Tax" value={order.taxAmount} />
					<TraceRow label="Tax rate" value={taxRateLabel} />
					<TraceRow label="Tax source" value={order.taxSource} />
					<MoneyRow label="Gratuity" value={order.gratuityAmount} />
					{customerServiceFee > 0 ? (
						<MoneyRow label="Service Fee" value={customerServiceFee} />
					) : null}
					<MoneyRow label="Customer Paid" value={order.totalPrice} isTotal />
				</View>

				<View style={styles.card}>
					<Text style={styles.cardTitle}>Restaurant Payout</Text>
					<MoneyRow label="Customer payment" value={order.totalPrice} />
					<MoneyRow
						label="Less processing fees"
						value={totalProcessingFees}
						isDeduction
					/>
					<MoneyRow
						label="Transfer to restaurant"
						value={restaurantNetReceived}
						isTotal
					/>
					<TraceRow
						label="Stripe PaymentIntent"
						value={stripePaymentIntentId}
					/>
					<TraceRow label="Stripe charge" value={order.stripeChargeId} />
					<TraceRow
						label="Stripe transfer"
						value={order.stripeTransferId || order.stripeDestinationTransferId}
					/>
					<TraceRow
						label="Processing fees"
						value={formatCurrency(totalProcessingFees)}
					/>
					<TraceRow
						label="Transfer status"
						value={order.restaurantTransferStatus}
					/>
				</View>

				{isManualRestaurantOrder ? (
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Manual Closeout Audit</Text>
						<TraceRow label="Source" value={sourceLabel} />
						<TraceRow
							label="Tender"
							value={humanizeValue(order.tenderType || order.paymentMethod)}
						/>
						<TraceRow label="Closed by" value={order.closedBy?.name} />
						<TraceRow label="Closed role" value={order.closedBy?.role} />
						<TraceRow label="Fee policy" value={humanizeValue(order.feePolicy)} />
						<TraceRow label="Fee reason" value={humanizeValue(order.manualFeeReason)} />
						<TraceRow label="External reference" value={order.externalReference} />
					</View>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	centered: { flex: 1, justifyContent: "center", alignItems: "center" },
	emptyText: { color: colors.textMedium, fontSize: 16 },
	title: { fontSize: 26, fontWeight: "700", color: colors.textDark },
	meta: { color: colors.textMedium, marginTop: 4 },
	sourceBanner: {
		backgroundColor: colors.backgroundMedium,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
		marginTop: 14,
	},
	sourceBannerTitle: {
		color: colors.textDark,
		fontSize: 14,
		fontWeight: "800",
	},
	sourceBannerText: {
		color: colors.textMedium,
		fontSize: 13,
		marginTop: 4,
		lineHeight: 18,
	},
	card: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 16,
		marginTop: 16,
	},
	cardTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: colors.textDark,
		marginBottom: 12,
	},
	itemBlock: { marginBottom: 14 },
	itemName: { fontSize: 15, fontWeight: "700", color: colors.textDark },
	modifierText: { fontSize: 13, color: colors.textMedium, marginTop: 3 },
	instructions: { fontSize: 13, color: colors.statusDanger, marginTop: 4 },
	moneyRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 6,
	},
	moneyLabel: { fontSize: 15, color: colors.textMedium },
	moneyValue: { fontSize: 15, color: colors.textDark, fontWeight: "600" },
	moneyDeduction: { color: colors.statusDanger },
	moneyTotalRow: {
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		marginTop: 8,
		paddingTop: 12,
	},
	moneyTotalLabel: { color: colors.textDark, fontWeight: "800" },
	moneyTotalValue: { color: colors.primary, fontSize: 17, fontWeight: "900" },
	traceRow: {
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		marginTop: 8,
		paddingTop: 8,
	},
	traceLabel: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
		textTransform: "uppercase",
	},
	traceValue: {
		fontSize: 12,
		color: colors.textDark,
		marginTop: 3,
	},
});

export default OrderDetailScreen;
