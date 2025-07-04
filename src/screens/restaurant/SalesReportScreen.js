// screens/restaurant/SalesReportScreen.js
import React, { useEffect, useState, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
	TouchableOpacity,
	Dimensions,
	SafeAreaView,
} from "react-native";
import { httpsCallable } from "firebase/functions";
import {
	VictoryPie,
	VictoryBar,
	VictoryChart,
	VictoryAxis,
	VictoryLabel,
	VictoryTheme,
} from "victory-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

const { width } = Dimensions.get("window");

// --- Reusable Helper Components ---
const KPICard = ({ title, value, iconName }) => (
	<View style={styles.kpiCard}>
		<Ionicons name={iconName} size={24} color={colors.primary} />
		<Text style={styles.kpiValue}>{value}</Text>
		<Text style={styles.kpiTitle}>{title}</Text>
	</View>
);
const ChartCard = ({ title, children }) => (
	<View style={styles.chartCard}>
		<Text style={styles.chartTitle}>{title}</Text>
		{children}
	</View>
);
const PeriodSelector = ({ selectedPeriod, onSelectPeriod }) => (
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
					{period}
				</Text>
			</TouchableOpacity>
		))}
	</View>
);

// --- New Components for "Today's Snapshot" View ---
const DetailedReportCard = ({ title, children, iconName }) => (
	<View style={styles.detailCard}>
		<View style={styles.cardHeader}>
			<Ionicons name={iconName} size={20} color={colors.primary} />
			<Text style={styles.cardTitle}>{title}</Text>
		</View>
		<View style={styles.cardContent}>{children}</View>
	</View>
);
const DetailRow = ({ label, value, isDeduction = false }) => (
	<View style={styles.summaryRow}>
		<Text style={styles.summaryLabel}>{label}</Text>
		<Text style={[styles.summaryValue, isDeduction && styles.deductionValue]}>
			{value}
		</Text>
	</View>
);

const ItemsSoldList = ({ items, formatCurrency }) => (
	<View>
		<View style={styles.tableHeader}>
			<Text style={[styles.tableHeaderText, { flex: 3 }]}>Item</Text>
			<Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>
				Qty
			</Text>
			<Text style={[styles.tableHeaderText, { flex: 2, textAlign: "right" }]}>
				Revenue
			</Text>
		</View>
		{items.map((item, index) => (
			<View key={index} style={styles.tableRow}>
				<Text style={[styles.tableCell, { flex: 3 }]}>{item.name}</Text>
				<Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>
					{item.quantity}
				</Text>
				<Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>
					{formatCurrency(item.totalRevenue)}
				</Text>
			</View>
		))}
	</View>
);

const SalesReportScreen = ({ navigation }) => {
	const { currentUserData, isLoading: isAuthLoading } = useContext(AuthContext);
	const [reportData, setReportData] = useState(null);
	const [isFetching, setIsFetching] = useState(true);
	const [selectedPeriod, setSelectedPeriod] = useState("Today"); // Default to Today
	const insets = useSafeAreaInsets();

	const formatCurrency = (cents) => {
		if (typeof cents !== "number" || isNaN(cents)) return "$0.00";
		return `$${(cents / 100).toFixed(2)}`;
	};

	useEffect(() => {
		if (isAuthLoading || !currentUserData?.uid) return;
		const fetchReport = async () => {
			setIsFetching(true);
			try {
				const getReport = httpsCallable(functions, "getDashboardReport");
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

	const renderTodayView = () => (
		<ScrollView contentContainerStyle={styles.scrollContent}>
			<DetailedReportCard title="Financial Snapshot" iconName="cash-outline">
				<DetailRow
					label="Gross Revenue"
					value={formatCurrency(reportData.totalRevenue)}
				/>
				<DetailRow
					label="Discounts"
					value={`-${formatCurrency(reportData.totalDiscounts)}`}
					isDeduction
				/>
				<View style={styles.divider} />
				<DetailRow
					label="Trransaction Fees"
					value={`-${formatCurrency(reportData.totalStripeFees)}`}
					isDeduction
				/>
				<View style={styles.divider} />
				<DetailRow
					label="Net Payout"
					value={formatCurrency(reportData.netPayout)}
				/>
			</DetailedReportCard>
			<DetailedReportCard
				title="Operational Metrics"
				iconName="stats-chart-outline"
			>
				<DetailRow
					label="Total Orders"
					value={reportData.totalOrders?.toString() || "0"}
				/>
				<DetailRow
					label="Avg. Table Turnover"
					value={`${reportData.avgTurnoverRate || 0} min`}
				/>
			</DetailedReportCard>
			<DetailedReportCard title="Items Sold Today" iconName="fast-food-outline">
				<ItemsSoldList
					items={reportData.allItemsSold || []}
					formatCurrency={formatCurrency}
				/>
			</DetailedReportCard>
			<DetailedReportCard title="Server Tips" iconName="people-outline">
				{(reportData.serverTips || []).length > 0 ? (
					reportData.serverTips.map((tip, index) => (
						<DetailRow
							key={index}
							label={tip.serverName}
							value={formatCurrency(tip.gratuityTotal)}
						/>
					))
				) : (
					<Text style={styles.noDataText}>No tips recorded yet.</Text>
				)}
			</DetailedReportCard>
		</ScrollView>
	);

	const renderAggregateView = () => (
		<ScrollView contentContainerStyle={styles.scrollContent}>
			<View style={styles.kpiContainer}>
				<KPICard
					title="Net Payout"
					value={formatCurrency(reportData.netPayout)}
					iconName="wallet-outline"
				/>
				<KPICard
					title="Gross Revenue"
					value={formatCurrency(reportData.totalRevenue)}
					iconName="cash-outline"
				/>
				<KPICard
					title="Total Orders"
					value={reportData.totalOrders?.toString() || "0"}
					iconName="receipt-outline"
				/>
			</View>
			<ChartCard title="Sales by Category">
				<VictoryPie
					data={
						reportData.salesByCategory
							? Object.entries(reportData.salesByCategory).map(([k, v]) => ({
									x: k,
									y: v,
							  }))
							: []
					}
					colorScale={["#4CAF50", "#FFC107"]}
					innerRadius={50}
					labels={({ datum }) => `${datum.x}\n${formatCurrency(datum.y)}`}
					style={{
						labels: { fill: "white", fontSize: 12, fontWeight: "bold" },
					}}
					width={width - 60}
					height={220}
				/>
			</ChartCard>
			<ChartCard title="Busiest Days">
				<VictoryChart height={250} width={width - 50} domainPadding={{ x: 25 }}>
					<VictoryBar
						style={{ data: { fill: colors.statusSuccess } }}
						data={(reportData.salesByDay || []).map((sales, day) => ({
							x: ["S", "M", "T", "W", "T", "F", "S"][day],
							y: sales,
						}))}
					/>
					<VictoryAxis style={{ tickLabels: { fontSize: 10, padding: 5 } }} />
					<VictoryAxis
						dependentAxis
						tickFormat={(x) => `$${x / 100}`}
						style={{ tickLabels: { fontSize: 10 } }}
					/>
				</VictoryChart>
			</ChartCard>
			<ChartCard title="Busiest Times">
				<VictoryChart height={250} width={width - 50} domainPadding={{ x: 10 }}>
					<VictoryBar
						style={{ data: { fill: colors.primary } }}
						data={(reportData.salesByHour || []).map((sales, hour) => ({
							x: hour,
							y: sales,
						}))}
					/>
					<VictoryAxis
						tickValues={[0, 6, 12, 18, 23]}
						tickFormat={["12a", "6a", "12p", "6p", "11p"]}
						style={{ tickLabels: { fontSize: 10, padding: 5 } }}
					/>
					<VictoryAxis
						dependentAxis
						tickFormat={(x) => `$${x / 100}`}
						style={{ tickLabels: { fontSize: 10 } }}
					/>
				</VictoryChart>
			</ChartCard>
		</ScrollView>
	);

	const renderContent = () => {
		if (isFetching)
			return (
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={{ flex: 1 }}
				/>
			);
		if (!reportData)
			return (
				<Text style={styles.noDataText}>
					No sales data available for this period.
				</Text>
			);

		return selectedPeriod === "Today"
			? renderTodayView()
			: renderAggregateView();
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.header}>
				<Text style={styles.headerTitle}>Business Pulse</Text>
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
	centered: { flex: 1, justifyContent: "center", alignItems: "center" },
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
	kpiContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginBottom: 20,
	},
	kpiCard: {
		flex: 1,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		alignItems: "center",
		marginHorizontal: 5,
		elevation: 2,
	},
	kpiValue: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginVertical: 5,
	},
	kpiTitle: {
		fontSize: 11,
		color: colors.textMedium,
		textTransform: "uppercase",
		textAlign: "center",
	},
	chartCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		marginBottom: 20,
		alignItems: "center",
		elevation: 2,
	},
	chartTitle: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
		alignSelf: "flex-start",
		marginBottom: 10,
	},
	noDataText: {
		textAlign: "center",
		marginTop: 40,
		fontSize: 16,
		color: colors.textLight,
	},
	// Styles for "Today" view
	detailCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		marginBottom: 20,
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
	cardContent: { paddingHorizontal: 15, paddingTop: 5, paddingBottom: 15 },
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	summaryLabel: { fontSize: 16, color: colors.textMedium },
	summaryValue: { fontSize: 16, fontWeight: "500", color: colors.textDark },
	deductionValue: { color: colors.statusDanger },
	divider: {
		height: 1,
		backgroundColor: colors.borderLight,
		marginVertical: 8,
	},
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
		alignItems: "center",
	},
	tableCell: { color: colors.textDark, fontSize: 14 },
});

export default SalesReportScreen;
