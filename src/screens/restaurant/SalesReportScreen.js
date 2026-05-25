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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";
import formatCurrency from "../../utils/currencyFormatter";
import { PICKUP_FLOW_ENABLED } from "../../config/featureFlags";

// --- Reusable Helper Components ---
const KPICard = ({ title, value, iconName, isDeduction = false }) => (
	<View style={styles.kpiCard}>
		<Ionicons
			name={iconName}
			size={22}
			color={isDeduction ? colors.statusDanger : colors.primary}
		/>
		<Text style={[styles.kpiValue, isDeduction && styles.deductionValue]}>
			{value}
		</Text>
		<Text style={styles.kpiTitle}>{title}</Text>
	</View>
);

const DetailedReportCard = ({ title, children, iconName, action }) => (
	<View style={styles.detailCard}>
		<View style={styles.cardHeader}>
			<View style={styles.cardHeaderLeft}>
				<Ionicons name={iconName} size={20} color={colors.primary} />
				<Text style={styles.cardTitle}>{title}</Text>
			</View>
			{action}
		</View>
		<View style={styles.cardContent}>{children}</View>
	</View>
);

const DetailRow = ({ label, value }) => (
	<View style={styles.summaryRow}>
		<Text style={styles.summaryLabel}>{label}</Text>
		<Text style={styles.summaryValue}>{value}</Text>
	</View>
);

const PulseMetric = ({ label, value, iconName, highlight = false }) => (
	<View style={[styles.pulseMetric, highlight && styles.pulseMetricHighlight]}>
		<Ionicons
			name={iconName}
			size={18}
			color={highlight ? colors.surfaceWhite : colors.primary}
		/>
		<Text style={[styles.pulseValue, highlight && styles.pulseTextHighlight]}>
			{value}
		</Text>
		<Text style={[styles.pulseLabel, highlight && styles.pulseTextHighlight]}>
			{label}
		</Text>
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
	const insets = useSafeAreaInsets();

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

		return (
			<ScrollView contentContainerStyle={styles.scrollContent}>
				<DetailedReportCard
					title={t("owner_pulse", "Owner Pulse")}
					iconName="pulse-outline"
					action={
						<Text style={styles.lastUpdatedText}>
							{reportData.lastUpdatedAt
								? new Date(reportData.lastUpdatedAt).toLocaleTimeString([], {
										hour: "2-digit",
										minute: "2-digit",
									})
								: ""}
						</Text>
					}
				>
					<View style={styles.pulseGrid}>
						<PulseMetric
							label={t("active_tables", "Active Tables")}
							value={reportData.ownerPulse?.activeTables || 0}
							iconName="restaurant-outline"
						/>
						<PulseMetric
							label={t("open_tickets", "Open Tickets")}
							value={reportData.ownerPulse?.openTickets || 0}
							iconName="receipt-outline"
						/>
						<PulseMetric
							label={t("service_requests", "Service Requests")}
							value={reportData.ownerPulse?.serviceRequests || 0}
							iconName="notifications-outline"
							highlight={Number(reportData.ownerPulse?.serviceRequests || 0) > 0}
						/>
						<PulseMetric
							label={t("checks_requested", "Checks Requested")}
							value={reportData.ownerPulse?.checksRequested || 0}
							iconName="cash-outline"
							highlight={Number(reportData.ownerPulse?.checksRequested || 0) > 0}
						/>
						{PICKUP_FLOW_ENABLED && (
							<PulseMetric
								label={t("pickup_orders", "Pickup Orders")}
								value={reportData.ownerPulse?.pickupOrders || 0}
								iconName="bag-handle-outline"
							/>
						)}
						<PulseMetric
							label={t("average_order", "Avg Order")}
							value={formatCurrency(reportData.averageOrderValue)}
							iconName="trending-up-outline"
						/>
					</View>
				</DetailedReportCard>

				<View style={styles.kpiContainer}>
					<KPICard
						title={t("gross_sales", "Gross Sales")}
						value={formatCurrency(reportData.grossSales)}
						iconName="cash-outline"
					/>
					<KPICard
						title={t("tax_collected", "Tax Collected")}
						value={formatCurrency(reportData.totalTax)}
						iconName="calculator-outline"
					/>
					<KPICard
						title={t("tips_collected", "Tips Collected")}
						value={formatCurrency(reportData.totalGratuity)}
						iconName="gift-outline"
					/>
					<KPICard
						title={t("net_payout", "Net Payout")}
						value={formatCurrency(reportData.netPayout)}
						iconName="wallet-outline"
					/>

					<View style={styles.fullWidthKpiWrapper}>
						<View style={styles.centeredKpi}>
							<KPICard
								title={t("discounts_voids", "Discounts & Voids")}
								value={`-${formatCurrency(reportData.totalDiscounts)}`}
								iconName="pricetag-outline"
								isDeduction={true}
							/>
						</View>
					</View>
				</View>

				<DetailedReportCard
					title={t("operational_metrics", "Operational Metrics")}
					iconName="stats-chart-outline"
					action={
						<TouchableOpacity
							onPress={() =>
								navigation.navigate("OrdersLedgerScreen", {
									initialPeriod: selectedPeriod.toLowerCase(),
								})
							}
						>
							<Text style={styles.viewAllText}>
								{t("view_orders", "View Orders")}
							</Text>
						</TouchableOpacity>
					}
				>
					<DetailRow
						label={t("total_orders", "Total Orders")}
						value={reportData.totalOrders?.toString() || "0"}
					/>
					<DetailRow
						label={t("avg_order_value", "Average Order Value")}
						value={formatCurrency(reportData.averageOrderValue)}
					/>
					<DetailRow
						label={t("avg_table_turnover", "Avg Table Turnover")}
						value={`${reportData.avgTurnoverRate || 0} min`}
					/>

					<View style={styles.divider} />

					<Text style={styles.subSectionTitle}>
						{t("fee_breakdown", "Fee Breakdown")}
					</Text>
					<DetailRow
						label={t("platform_fees", "Scerv Platform Fees")}
						value={`-${formatCurrency(reportData.totalPlatformFees)}`}
					/>
					<DetailRow
						label={t("payment_processing", "Payment Processing")}
						value={`-${formatCurrency(reportData.totalProcessorFees)}`}
					/>
					<DetailRow
						label={t("total_fees", "Total Fees")}
						value={`-${formatCurrency(reportData.totalFees)}`}
					/>
				</DetailedReportCard>

				<DetailedReportCard
					title={t("revenue_breakdown", "Revenue Breakdown")}
					iconName="pie-chart-outline"
				>
					<DetailRow
						label={t("digital_in_app", "In-App / Digital Sales")}
						value={formatCurrency(reportData.digitalSales)}
					/>
					<DetailRow
						label={t("manual_sales", "Cash / External Terminal")}
						value={formatCurrency(reportData.manualSales)}
					/>
					<View style={styles.divider} />
					<DetailRow
						label={t("food_sales", "Food Sales")}
						value={formatCurrency(
							normalizeCategorySalesCents(
								reportData.salesByCategory?.Food,
								reportData,
							),
						)}
					/>
					<DetailRow
						label={t("bar_sales", "Bar / Beverage Sales")}
						value={formatCurrency(
							normalizeCategorySalesCents(
								reportData.salesByCategory?.Bar,
								reportData,
							),
						)}
					/>
				</DetailedReportCard>
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
		paddingHorizontal: 15,
		paddingTop: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	headerTitle: {
		fontSize: 28,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 15,
	},
	periodSelectorContainer: {
		flexDirection: "row",
		backgroundColor: colors.backgroundMedium,
		borderRadius: 20,
		padding: 4,
		alignSelf: "center",
		marginBottom: 15,
	},
	periodButton: { paddingVertical: 8, paddingHorizontal: 25, borderRadius: 16 },
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
	scrollContent: { padding: 15, paddingBottom: 30 },
	lastUpdatedText: {
		fontSize: 12,
		color: colors.textMedium,
		fontWeight: "600",
	},
	pulseGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
		gap: 10,
	},
	pulseMetric: {
		width: "48%",
		minHeight: 86,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		padding: 12,
		backgroundColor: colors.backgroundLight,
		justifyContent: "space-between",
	},
	pulseMetricHighlight: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	pulseValue: {
		fontSize: 22,
		fontWeight: "800",
		color: colors.textDark,
		marginTop: 8,
	},
	pulseLabel: {
		fontSize: 11,
		color: colors.textMedium,
		textTransform: "uppercase",
		fontWeight: "700",
	},
	pulseTextHighlight: {
		color: colors.surfaceWhite,
	},

	kpiContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
		marginBottom: 20,
	},
	kpiCard: {
		flexBasis: "48%",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		paddingVertical: 15,
		paddingHorizontal: 5,
		alignItems: "center",
		marginBottom: 15,
		elevation: 2,
		shadowColor: "#000",
		shadowOpacity: 0.05,
		shadowRadius: 5,
	},
	fullWidthKpiWrapper: {
		width: "100%",
		alignItems: "center",
		marginTop: -5,
	},
	centeredKpi: {
		width: "48%",
	},

	kpiValue: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
		marginVertical: 6,
	},
	deductionValue: { color: colors.statusDanger },
	kpiTitle: {
		fontSize: 10,
		color: colors.textMedium,
		textTransform: "uppercase",
		textAlign: "center",
		fontWeight: "600",
	},
	noDataText: {
		textAlign: "center",
		marginTop: 20,
		fontSize: 16,
		color: colors.textLight,
		paddingVertical: 10,
	},
	detailCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		marginBottom: 20,
		elevation: 2,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	cardHeaderLeft: {
		flexDirection: "row",
		alignItems: "center",
	},
	cardTitle: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginLeft: 10,
	},
	cardContent: { paddingHorizontal: 15, paddingTop: 5, paddingBottom: 15 },
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	summaryLabel: { fontSize: 16, color: colors.textMedium },
	summaryValue: { fontSize: 16, fontWeight: "500", color: colors.textDark },
	divider: {
		height: 1,
		backgroundColor: colors.borderLight,
		marginVertical: 10,
	},
	subSectionTitle: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 5,
		marginTop: 5,
	},
	viewAllText: {
		color: colors.primary,
		fontWeight: "700",
		fontSize: 14,
	},
});

export default SalesReportScreen;
