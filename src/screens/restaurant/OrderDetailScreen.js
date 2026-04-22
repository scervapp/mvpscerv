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

	const formatCurrency = (cents) =>
		`$${((Number(cents) || 0) / 100).toFixed(2)}`;

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
											? ` (+$${Number(modifier.price).toFixed(2)})`
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
					<Text style={styles.finRow}>
						Subtotal: {formatCurrency(order.subtotal)}
					</Text>
					<Text style={styles.finRow}>
						Discounts: {formatCurrency(order.discountTotal)}
					</Text>
					<Text style={styles.finRow}>
						Tax: {formatCurrency(order.taxAmount)}
					</Text>
					<Text style={styles.finRow}>
						Gratuity: {formatCurrency(order.gratuityAmount)}
					</Text>
					<Text style={styles.finRow}>
						Platform Fee: {formatCurrency(order.platformFee)}
					</Text>
					<Text style={styles.finRow}>
						Processor Fee: {formatCurrency(order.processorFee)}
					</Text>
					<Text style={styles.totalRow}>
						Total: {formatCurrency(order.totalPrice)}
					</Text>
				</View>
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
	finRow: { fontSize: 15, color: colors.textDark, marginBottom: 6 },
	totalRow: {
		fontSize: 17,
		fontWeight: "700",
		color: colors.primary,
		marginTop: 8,
	},
});

export default OrderDetailScreen;
