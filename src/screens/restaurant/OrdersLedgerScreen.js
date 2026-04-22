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

const OrdersLedgerScreen = ({ navigation, route }) => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const [period, setPeriod] = useState(route.params?.initialPeriod || "today");
	const [searchText, setSearchText] = useState("");
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
	}, [currentUserData?.uid, period, searchText]);

	const formatCurrency = (cents) =>
		`$${((Number(cents) || 0) / 100).toFixed(2)}`;

	const renderOrder = ({ item }) => (
		<TouchableOpacity
			style={styles.row}
			onPress={() =>
				navigation.navigate("OrderDetailScreen", { orderId: item.id })
			}
		>
			<View style={styles.rowTop}>
				<Text style={styles.orderId}>{item.readableOrderId || item.id}</Text>
				<Text style={styles.total}>{formatCurrency(item.totalPrice)}</Text>
			</View>

			<View style={styles.metaRow}>
				<Text style={styles.metaText}>
					{item.orderMode} • {item.paymentMethod}
				</Text>
				<Text style={styles.metaText}>
					{item.table?.name || item.fulfillmentType || "-"}
				</Text>
			</View>

			<View style={styles.metaRow}>
				<Text style={styles.metaText}>
					{item.server?.name || t("unassigned", "Unassigned")}
				</Text>
				<Text style={styles.metaText}>
					{item.fulfilledAt ? new Date(item.fulfilledAt).toLocaleString() : "-"}
				</Text>
			</View>

			<View style={styles.financialRow}>
				<Text style={styles.financialText}>
					{t("subtotal", "Subtotal")}: {formatCurrency(item.subtotal)}
				</Text>
				<Text style={styles.financialText}>
					{t("tax", "Tax")}: {formatCurrency(item.taxAmount)}
				</Text>
			</View>
		</TouchableOpacity>
	);

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
	},
	total: {
		fontWeight: "700",
		color: colors.primary,
		fontSize: 15,
	},
	metaRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 2,
	},
	metaText: {
		color: colors.textMedium,
		fontSize: 13,
	},
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
	emptyText: {
		textAlign: "center",
		color: colors.textMedium,
		marginTop: 40,
		fontSize: 16,
	},
});

export default OrdersLedgerScreen;
