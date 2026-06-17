// screens/restaurant/SalesReportScreen.js
import React, { useEffect, useState, useContext, useLayoutEffect } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";
import formatCurrency from "../../utils/currencyFormatter";
import { PICKUP_FLOW_ENABLED } from "../../config/featureFlags";

const ReportSection = ({ title, children, action }) => (
	<View style={styles.section}>
		<View style={styles.sectionHeader}>
			<Text style={styles.sectionTitle}>{title}</Text>
			{action}
		</View>
		{children}
	</View>
);

const MoneyRow = ({ label, value, tone = "neutral" }) => (
	<View style={styles.moneyRow}>
		<Text style={styles.moneyLabel}>{label}</Text>
		<Text
			style={[
				styles.moneyValue,
				tone === "positive" && styles.moneyPositive,
				tone === "negative" && styles.moneyNegative,
			]}
		>
			{value}
		</Text>
	</View>
);

const OpsTile = ({ label, value, iconName, urgent = false }) => (
	<View style={[styles.opsTile, urgent && styles.opsTileUrgent]}>
		<Ionicons
			name={iconName}
			size={18}
			color={urgent ? colors.statusDanger : colors.primary}
		/>
		<Text style={styles.opsValue}>{value}</Text>
		<Text style={styles.opsLabel}>{label}</Text>
	</View>
);

const RankedRow = ({ rank, label, value, subLabel }) => (
	<View style={styles.rankRow}>
		<View style={styles.rankBadge}>
			<Text style={styles.rankText}>{rank}</Text>
		</View>
		<View style={styles.rankBody}>
			<Text style={styles.rankLabel} numberOfLines={1}>
				{label}
			</Text>
			{!!subLabel && <Text style={styles.rankSubLabel}>{subLabel}</Text>}
		</View>
		<Text style={styles.rankValue}>{value}</Text>
	</View>
);

const normalizeCategorySalesCents = (amount, reportData) => {
	const value = Number(amount);
	if (!Number.isFinite(value)) return 0;

	const grossSales = Number(reportData?.grossSales || 0);
	const digitalSales = Number(reportData?.digitalSales || 0);
	const manualSales = Number(reportData?.manualSales || 0);
	const benchmark = grossSales || digitalSales + manualSales;

	// Older report payloads can return category revenue inflated by 100x.
	if (benchmark > 0 && value > benchmark * 10) {
		return Math.round(value / 100);
	}

	return value;
};

const PeriodSelector = ({ selectedPeriod, onSelectPeriod }) => {
	const { t } = useTranslation();

	return (
		<View style={styles.periodSelectorContainer}>
			{["Today", "Week", "Month"].map((period) => (
				<TouchableOpacity
					key={period}
					style={[
						styles.periodButton,
						selectedPeriod === period && styles.periodButtonActive,
					]}
					onPress={() => onSelectPeriod(period)}
				>
					<Text
						style={[
							styles.periodButtonText,
							selectedPeriod === period && styles.periodButtonTextActive,
						]}
					>
						{t(period.toLowerCase())}
					</Text>
				</TouchableOpacity>
			))}
		</View>
	);
};

const SalesReportScreen = ({ navigation }) => {
	const { t } = useTranslation();
	const { currentUserData, isLoading: isAuthLoading } = useContext(AuthContext);
	const [reportData, setReportData] = useState(null);
	const [isFetching, setIsFetching] = useState(true);
	const [selectedPeriod, setSelectedPeriod] = useState("Today");

	useLayoutEffect(() => {
		navigation.setOptions({
			headerRight: () => (
				<TouchableOpacity
					onPress={() =>
						navigation.navigate("OrdersLedgerScreen", {
							initialPeriod: selectedPeriod.toLowerCase(),
						})
					}
					style={{ marginRight: 15 }}
				>
					<Ionicons name="receipt-outline" size={26} color={colors.primary} />
				</TouchableOpacity>
			),
		});
	}, [navigation, selectedPeriod]);

	useEffect(() => {
		if (isAuthLoading || !currentUserData?.uid) return;

		const fetchReport = async () => {
			setIsFetching(true);
			try {
				const getReport = httpsCallable(functions, "getReportingDashboard");
				const response = await getReport({
					restaurantId: currentUserData.uid,
					period: selectedPeriod.toLowerCase(),
				});
				setReportData(response.data);
			} catch (error) {
				console.error("Error fetching dashboard report:", error);
				setReportData(null);
			} finally {
				setIsFetching(false);
			}
		};

		fetchReport();
	}, [selectedPeriod, currentUserData?.uid, isAuthLoading]);

	const renderContent = () => {
		if (isFetching) {
			return (
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={{ flex: 1 }}
				/>
			);
		}

		if (!reportData) {
			return (
				<Text style={styles.noDataText}>
					{t(
						"no_sales_data_available_for_this_period",
						"No sales data available for this period.",
					)}
				</Text>
			);
		}

		const topItems = Array.isArray(reportData.topSellingItems)
			? reportData.topSellingItems.slice(0, 5)
			: [];
		const serverTips = Array.isArray(reportData.serverTips)
			? reportData.serverTips.slice(0, 4)
			: [];
		const customerServiceFees = Number(
			reportData.totalCustomerFees ??
				Number(reportData.totalPlatformFees || 0) +
					Number(reportData.totalCustomerServiceFees || 0),
		);
		const restaurantCosts = Number(
			reportData.totalRestaurantCosts ??
				Number(reportData.totalProcessorFees || 0) +
					Number(reportData.totalRestaurantProcessingFees || 0),
		);
		const grossSales = Number(
			reportData.grossSales ||
				Number(reportData.netSales || reportData.grossSales || 0) +
					Number(reportData.totalDiscounts || 0),
		);
		const netSales = Number(reportData.netSales ?? reportData.grossSales ?? 0);
		const customerPayments = Number(
			reportData.customerPayments ||
				netSales +
					Number(reportData.totalTax || 0) +
					Number(reportData.totalGratuity || 0) +
					Number(reportData.totalPlatformFees || 0),
		);
		const estimatedDeposit = Number(
			reportData.estimatedDeposit ?? reportData.netPayout ?? 0,
		);
		const activeTables = Number(reportData.ownerPulse?.activeTables || 0);
		const openTickets = Number(reportData.ownerPulse?.openTickets || 0);
		const serviceRequests = Number(reportData.ownerPulse?.serviceRequests || 0);
		const checksRequested = Number(reportData.ownerPulse?.checksRequested || 0);
		const pickupOrders = Number(reportData.ownerPulse?.pickupOrders || 0);

		return (
			<ScrollView contentContainerStyle={styles.scrollContent}>
				<View style={styles.moneyHero}>
					<View style={styles.moneyHeroTop}>
						<View>
							<Text style={styles.heroLabel}>{t("net_sales", "Net Sales")}</Text>
							<Text style={styles.heroValue}>
								{formatCurrency(netSales)}
							</Text>
						</View>
						<TouchableOpacity
							style={styles.ledgerButton}
							onPress={() =>
								navigation.navigate("OrdersLedgerScreen", {
									initialPeriod: selectedPeriod.toLowerCase(),
								})
							}
						>
							<Ionicons
								name="receipt-outline"
								size={18}
								color={colors.surfaceWhite}
							/>
							<Text style={styles.ledgerButtonText}>
								{t("ledger", "Ledger")}
							</Text>
						</TouchableOpacity>
					</View>
					<View style={styles.heroStats}>
						<View style={styles.heroStat}>
							<Text style={styles.heroStatValue}>
								{formatCurrency(customerPayments)}
							</Text>
							<Text style={styles.heroStatLabel}>
								{t("customer_paid", "Customer Paid")}
							</Text>
						</View>
						<View style={styles.heroStat}>
							<Text style={styles.heroStatValue}>
								{reportData.totalOrders || 0}
							</Text>
							<Text style={styles.heroStatLabel}>
								{t("orders", "Orders")}
							</Text>
						</View>
						<View style={styles.heroStat}>
							<Text style={styles.heroStatValue}>
								{formatCurrency(reportData.averageOrderValue)}
							</Text>
							<Text style={styles.heroStatLabel}>
								{t("avg_order", "Avg Order")}
							</Text>
						</View>
					</View>
					<Text style={styles.lastUpdatedText}>
						{reportData.lastUpdatedAt
							? `${t("updated", "Updated")} ${new Date(
									reportData.lastUpdatedAt,
								).toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								})}`
							: ""}
					</Text>
				</View>

				<ReportSection title={t("floor_status", "Floor Status")}>
					<View style={styles.opsGrid}>
						<OpsTile
							label={t("active_tables", "Active Tables")}
							value={activeTables}
							iconName="restaurant-outline"
						/>
						<OpsTile
							label={t("open_tickets", "Open Tickets")}
							value={openTickets}
							iconName="receipt-outline"
						/>
						<OpsTile
							label={t("service_requests", "Service Requests")}
							value={serviceRequests}
							iconName="notifications-outline"
							urgent={serviceRequests > 0}
						/>
						<OpsTile
							label={t("checks_requested", "Checks Requested")}
							value={checksRequested}
							iconName="cash-outline"
							urgent={checksRequested > 0}
						/>
						{PICKUP_FLOW_ENABLED && (
							<OpsTile
								label={t("pickup_orders", "Pickup Orders")}
								value={pickupOrders}
								iconName="bag-handle-outline"
							/>
						)}
						<OpsTile
							label={t("turnover", "Turnover")}
							value={`${reportData.avgTurnoverRate || 0}m`}
							iconName="time-outline"
						/>
					</View>
				</ReportSection>

				<ReportSection title={t("money_breakdown", "Money Breakdown")}>
					<MoneyRow
						label={t("gross_item_sales", "Gross Item Sales")}
						value={formatCurrency(grossSales)}
					/>
					{Number(reportData.totalDiscounts || 0) > 0 && (
						<MoneyRow
							label={t("discounts", "Discounts")}
							value={`-${formatCurrency(reportData.totalDiscounts)}`}
							tone="negative"
						/>
					)}
					<MoneyRow
						label={t("net_sales", "Net Sales")}
						value={formatCurrency(netSales)}
						tone="positive"
					/>
					<MoneyRow
						label={t("digital_sales", "Digital Sales")}
						value={formatCurrency(reportData.digitalSales)}
					/>
					<MoneyRow
						label={t("manual_sales", "Manual Sales")}
						value={formatCurrency(reportData.manualSales)}
					/>
					<MoneyRow
						label={t("tax_collected", "Tax Collected")}
						value={formatCurrency(reportData.totalTax)}
					/>
					<MoneyRow
						label={t("tips_collected", "Tips Collected")}
						value={formatCurrency(reportData.totalGratuity)}
					/>
					<MoneyRow
						label={t("customer_service_fees", "Customer Service Fees")}
						value={formatCurrency(customerServiceFees)}
					/>
					<MoneyRow
						label={t("restaurant_costs", "Restaurant Costs")}
						value={`-${formatCurrency(restaurantCosts)}`}
						tone="negative"
					/>
					<MoneyRow
						label={t("estimated_deposit", "Estimated Deposit")}
						value={formatCurrency(estimatedDeposit)}
						tone="positive"
					/>
				</ReportSection>

				<ReportSection title={t("sales_mix", "Sales Mix")}>
					<MoneyRow
						label={t("food_sales", "Food Sales")}
						value={formatCurrency(
							normalizeCategorySalesCents(
								reportData.salesByCategory?.Food,
								reportData,
							),
						)}
					/>
					<MoneyRow
						label={t("bar_sales", "Bar / Beverage Sales")}
						value={formatCurrency(
							normalizeCategorySalesCents(
								reportData.salesByCategory?.Bar,
								reportData,
							),
						)}
					/>
				</ReportSection>

				<ReportSection title={t("top_sellers", "Top Sellers")}>
					{topItems.length > 0 ? (
						topItems.map((item, index) => (
							<RankedRow
								key={`${item.name || "item"}-${index}`}
								rank={index + 1}
								label={item.name || t("unknown_item", "Unknown Item")}
								subLabel={t("quantity_sold", "{{count}} sold", {
									count: item.quantity || 0,
								})}
								value={formatCurrency(item.totalRevenue)}
							/>
						))
					) : (
						<Text style={styles.emptySectionText}>
							{t("no_item_sales_yet", "No item sales yet.")}
						</Text>
					)}
				</ReportSection>

				<ReportSection title={t("server_tips", "Server Tips")}>
					{serverTips.length > 0 ? (
						serverTips.map((server, index) => (
							<RankedRow
								key={`${server.serverId || "server"}-${index}`}
								rank={index + 1}
								label={server.serverName || t("unassigned", "Unassigned")}
								value={formatCurrency(server.gratuityTotal)}
							/>
						))
					) : (
						<Text style={styles.emptySectionText}>
							{t("no_server_tips_yet", "No server tips yet.")}
						</Text>
					)}
				</ReportSection>
			</ScrollView>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.header}>
				<Text style={styles.headerTitle}>
					{t("business_report", "Business Report")}
				</Text>
				<PeriodSelector
					selectedPeriod={selectedPeriod}
					onSelectPeriod={setSelectedPeriod}
				/>
			</View>
			<View style={styles.container}>{renderContent()}</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.surfaceWhite },
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	header: {
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	headerTitle: {
		fontSize: 24,
		fontWeight: "800",
		color: colors.textDark,
		marginBottom: 12,
	},
	periodSelectorContainer: {
		flexDirection: "row",
		backgroundColor: colors.backgroundMedium,
		borderRadius: 8,
		padding: 4,
		alignSelf: "stretch",
	},
	periodButton: {
		flex: 1,
		paddingVertical: 9,
		borderRadius: 6,
		alignItems: "center",
	},
	periodButtonActive: {
		backgroundColor: colors.surfaceWhite,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 3,
	},
	periodButtonText: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.textMedium,
	},
	periodButtonTextActive: { color: colors.primary },
	scrollContent: { padding: 14, paddingBottom: 30 },
	moneyHero: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		padding: 16,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	moneyHeroTop: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	},
	heroLabel: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
		textTransform: "uppercase",
	},
	heroValue: {
		fontSize: 34,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 4,
	},
	ledgerButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: colors.primary,
		borderRadius: 6,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	ledgerButtonText: {
		color: colors.surfaceWhite,
		fontSize: 13,
		fontWeight: "800",
	},
	heroStats: {
		flexDirection: "row",
		marginTop: 16,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 14,
	},
	heroStat: {
		flex: 1,
		paddingRight: 8,
	},
	heroStatValue: {
		fontSize: 17,
		fontWeight: "900",
		color: colors.textDark,
	},
	heroStatLabel: {
		fontSize: 11,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 3,
		textTransform: "uppercase",
	},
	lastUpdatedText: {
		fontSize: 12,
		color: colors.textMedium,
		fontWeight: "600",
		marginTop: 12,
	},
	section: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingTop: 14,
		paddingBottom: 8,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.textDark,
	},
	opsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		paddingHorizontal: 10,
		paddingBottom: 10,
	},
	opsTile: {
		width: "50%",
		minHeight: 82,
		padding: 10,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	opsTileUrgent: {
		backgroundColor: colors.dangerLight || "#fff5f5",
	},
	opsValue: {
		fontSize: 22,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 6,
	},
	opsLabel: {
		fontSize: 11,
		fontWeight: "700",
		color: colors.textMedium,
		textTransform: "uppercase",
		marginTop: 2,
	},
	moneyRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 14,
		paddingVertical: 11,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	moneyLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.textMedium,
		flex: 1,
		paddingRight: 12,
	},
	moneyValue: {
		fontSize: 15,
		fontWeight: "800",
		color: colors.textDark,
	},
	moneyPositive: {
		color: colors.statusSuccess,
	},
	moneyNegative: {
		color: colors.statusDanger,
	},
	rankRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 11,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	rankBadge: {
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: colors.backgroundMedium,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	rankText: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textDark,
	},
	rankBody: {
		flex: 1,
		minWidth: 0,
	},
	rankLabel: {
		fontSize: 14,
		fontWeight: "800",
		color: colors.textDark,
	},
	rankSubLabel: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	rankValue: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
		marginLeft: 10,
	},
	emptySectionText: {
		paddingHorizontal: 14,
		paddingVertical: 14,
		fontSize: 14,
		color: colors.textMedium,
	},
	noDataText: {
		textAlign: "center",
		marginTop: 20,
		fontSize: 16,
		color: colors.textLight,
		paddingVertical: 10,
	},
});

export default SalesReportScreen;
