import React, { useState, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
} from "react-native";

import colors from "../../utils/styles/appStyles";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import formatCurrency from "../../utils/currencyFormatter";
const ReportCard = ({ title, children, iconName }) => (
	<View style={styles.card}>
		<View style={styles.cardHeader}>
			<Ionicons name={iconName} size={20} color={colors.primary} />
			<Text style={styles.cardTitle}>{title}</Text>
		</View>
		<View style={styles.cardContent}>{children}</View>
	</View>
);

// A reusable row for the financial summary
const SummaryRow = ({ label, value, isTotal = false, isDeduction = false }) => (
	<View style={styles.summaryRow}>
		<Text style={[styles.summaryLabel, isTotal && styles.totalLabel]}>
			{label}
		</Text>
		<Text
			style={[
				styles.summaryValue,
				isTotal && styles.totalValue,
				isDeduction && styles.deductionValue,
			]}
		>
			{value}
		</Text>
	</View>
);

// The list component for top items, now with sorting
const TopItemsList = ({ items, formatCurrency, sortBy }) => {
	const { t } = useTranslation();
	const sortedItems = useMemo(() => {
		if (!items) return [];
		// Sort by the selected criteria
		return [...items].sort((a, b) => b[sortBy] - a[sortBy]);
	}, [items, sortBy]);

	return (
		<View>
			<View style={styles.tableHeader}>
				<Text style={[styles.tableHeaderText, { flex: 3 }]}>{t("item")}</Text>
				<Text
					style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}
				>
					{t("qty")}
				</Text>
				<Text style={[styles.tableHeaderText, { flex: 2, textAlign: "right" }]}>
					{t("revenue")}
				</Text>
			</View>
			{sortedItems.map((item, index) => (
				<View key={index} style={styles.tableRow}>
					<Text style={[styles.tableCell, { flex: 3 }]}>{item.name}</Text>
					<Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>
						{item.count}
					</Text>
					<Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>
						{formatCurrency(item.totalRevenue)}
					</Text>
				</View>
			))}
		</View>
	);
};

const DailySalesDetailsScreen = ({ route }) => {
	const { t } = useTranslation();
	const { dayReport } = route.params;
	const insets = useSafeAreaInsets();
	const [itemSortKey, setItemSortKey] = useState("totalRevenue"); // 'totalRevenue' or 'count'

	const transactionFeePercentage = useMemo(() => {
		if (!dayReport.grossSales || !dayReport.estimatedProcessingFeesDeducted) {
			return "0.00%";
		}
		// Avoid division by zero
		if (dayReport.grossSales === 0) {
			return "0.00%";
		}
		const percentage =
			(dayReport.estimatedProcessingFeesDeducted / dayReport.grossSales) * 100;
		return `${percentage.toFixed(2)}%`;
	}, [dayReport.grossSales, dayReport.estimatedProcessingFeesDeducted]);
	return (
		<SafeAreaView style={[styles.safeArea, { paddingBottom: insets.bottom }]}>
			<ScrollView contentContainerStyle={styles.scrollContent}>
				<View style={styles.header}>
					<Text style={styles.headerDate}>{dayReport.date}</Text>
					<Text style={styles.headerSubtitle}>
						{dayReport.orderCount} {t("orders")}
					</Text>
				</View>

				<ReportCard title={t("financials")} iconName="cash-outline">
					<SummaryRow
						label={t("gross_sales")}
						value={formatCurrency(dayReport.grossSales)}
					/>
					<SummaryRow
						label={t("discounts_applied")}
						value={`-${formatCurrency(dayReport.totalDiscountApplied)}`}
						isDeduction
					/>
					<View style={styles.divider} />
					<SummaryRow
						label={t("net_sales")}
						value={formatCurrency(dayReport.netSales)}
					/>
					<SummaryRow
						label={t("tax_collected")}
						value={formatCurrency(dayReport.totalTaxCollected)}
					/>
					<SummaryRow
						label={t("gratuity_received")}
						value={formatCurrency(dayReport.totalGratuityReceived)}
					/>
					<SummaryRow
						label={`${t("transaction_fees")} (${transactionFeePercentage})`}
						value={`-${formatCurrency(
							dayReport.estimatedProcessingFeesDeducted
						)}`}
						isDeduction
					/>
					<View style={styles.divider} />
					<SummaryRow
						label={t("est_net_payout")}
						value={formatCurrency(dayReport.estimatedNetPayout)}
						isTotal
					/>
				</ReportCard>

				<ReportCard title={t("top_selling_items")} iconName="star-outline">
					<View style={styles.tabContainer}>
						<TouchableOpacity
							style={[
								styles.tabButton,
								itemSortKey === "totalRevenue" && styles.tabButtonActive,
							]}
							onPress={() => setItemSortKey("totalRevenue")}
						>
							<Text
								style={[
									styles.tabText,
									itemSortKey === "totalRevenue" && styles.tabTextActive,
								]}
							>
								{t("by_revenue")}
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.tabButton,
								itemSortKey === "count" && styles.tabButtonActive,
							]}
							onPress={() => setItemSortKey("count")}
						>
							<Text
								style={[
									styles.tabText,
									itemSortKey === "count" && styles.tabTextActive,
								]}
							>
								{t("by_quantity")}
							</Text>
						</TouchableOpacity>
					</View>
					<TopItemsList
						items={dayReport.allItemsSold}
						formatCurrency={formatCurrency}
						sortBy={itemSortKey}
					/>
				</ReportCard>

				<ReportCard
					title={t("server_performance")}
					iconName="people-outline"
				>
					{dayReport.serverTips && dayReport.serverTips.length > 0 ? (
						dayReport.serverTips.map((tip, index) => (
							<SummaryRow
								key={index}
								label={tip.serverName}
								value={formatCurrency(tip.gratuityTotal)}
							/>
						))
					) : (
						<Text style={styles.noDataText}>
							{t("no_tips_were_recorded_for_this_day")}
						</Text>
					)}
				</ReportCard>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	scrollContent: { padding: 15, paddingBottom: 30 },
	header: { alignItems: "center", marginBottom: 20 },
	headerDate: { fontSize: 24, fontWeight: "bold", color: colors.textDark },
	headerSubtitle: { fontSize: 16, color: colors.textMedium },
	card: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		marginBottom: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 5,
		elevation: 2,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		padding: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	cardTitle: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginLeft: 10,
	},
	cardContent: { padding: 15 },
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	summaryLabel: { fontSize: 16, color: colors.textMedium },
	summaryValue: { fontSize: 16, fontWeight: "500", color: colors.textDark },
	totalLabel: { fontWeight: "bold", color: colors.textDark },
	totalValue: { fontWeight: "bold", color: colors.primary },
	deductionValue: { color: colors.statusDanger },
	divider: {
		height: 1,
		backgroundColor: colors.borderLight,
		marginVertical: 8,
	},
	tabContainer: {
		flexDirection: "row",
		backgroundColor: colors.backgroundMedium,
		borderRadius: 20,
		padding: 4,
		alignSelf: "center",
		marginBottom: 15,
	},
	tabButton: { paddingVertical: 8, paddingHorizontal: 25, borderRadius: 16 },
	tabButtonActive: {
		backgroundColor: colors.surfaceWhite,
		elevation: 2,
		shadowColor: "#000",
		shadowOpacity: 0.1,
	},
	tabText: { fontSize: 14, fontWeight: "600", color: colors.textMedium },
	tabTextActive: { color: colors.primary },
	tableHeader: {
		flexDirection: "row",
		borderBottomWidth: 2,
		borderBottomColor: colors.borderLight,
		paddingBottom: 10,
		marginBottom: 5,
	},
	tableHeaderText: {
		fontWeight: "bold",
		color: colors.textMedium,
		fontSize: 12,
	},
	tableRow: {
		flexDirection: "row",
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	tableCell: { color: colors.textDark, fontSize: 14 },
	noDataText: {
		fontSize: 14,
		color: colors.textLight,
		textAlign: "center",
		paddingVertical: 10,
	},
});

export default DailySalesDetailsScreen;
