// screens/restaurant/SalesReportScreen.js
import React, { useEffect, useState, useContext, useLayoutEffect } from "react";
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

const DetailedReportCard = ({ title, children, iconName }) => (
	<View style={styles.detailCard}>
		<View style={styles.cardHeader}>
			<Ionicons name={iconName} size={20} color={colors.primary} />
			<Text style={styles.cardTitle}>{title}</Text>
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
		{(items || []).map((item, index) => (
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

const SalesReportScreen = ({ navigation }) => {
	const { currentUserData, isLoading: isAuthLoading } = useContext(AuthContext);
	const [reportData, setReportData] = useState(null);
	const [isFetching, setIsFetching] = useState(true);
	const [selectedPeriod, setSelectedPeriod] = useState("Today");
	const insets = useSafeAreaInsets();

	const formatCurrency = (cents) => {
		if (typeof cents !== "number" || isNaN(cents)) return "$0.00";
		return `$${(cents / 100).toFixed(2)}`;
	};

	useLayoutEffect(() => {
		navigation.setOptions({
			headerRight: () => (
				<TouchableOpacity
					onPress={() => navigation.navigate("HistoricalReports")}
					style={{ marginRight: 15 }}
				>
					<Ionicons name="archive-outline" size={26} color={colors.primary} />
				</TouchableOpacity>
			),
		});
	}, [navigation]);

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

		return (
			<ScrollView contentContainerStyle={styles.scrollContent}>
				<View style={styles.kpiContainer}>
					<KPICard
						title="Gross Sales"
						value={formatCurrency(reportData.totalRevenue)}
						iconName="cash-outline"
					/>
					<KPICard
						title="Tips Collected"
						value={formatCurrency(reportData.totalGratuity)}
						iconName="gift-outline"
					/>
					<KPICard
						title="Transaction Fees"
						value={`-${formatCurrency(reportData.totalStripeFees)}`}
						iconName="trending-down-outline"
						isDeduction={true}
					/>
					<KPICard
						title="Net Payout"
						value={formatCurrency(reportData.netPayout)}
						iconName="wallet-outline"
					/>
				</View>

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

				<DetailedReportCard title="Items Sold" iconName="fast-food-outline">
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
						<Text style={styles.noDataText}>No tips were recorded yet.</Text>
					)}
				</DetailedReportCard>
			</ScrollView>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.header}>
				<Text style={styles.headerTitle}>Business Report</Text>
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
	kpiContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 20,
		marginHorizontal: -5,
	},
	kpiCard: {
		flex: 1,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		paddingVertical: 15,
		paddingHorizontal: 5,
		alignItems: "center",
		marginHorizontal: 5,
		elevation: 2,
		shadowColor: "#000",
		shadowOpacity: 0.05,
		shadowRadius: 5,
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
