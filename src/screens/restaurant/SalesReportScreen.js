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

const SalesReportScreen = ({ navigation }) => {
	const { currentUserData, isLoading: isAuthLoading } = useContext(AuthContext);
	const [reportData, setReportData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedPeriod, setSelectedPeriod] = useState("Week");
	const [isFetching, setIsFetching] = useState(true);

	const insets = useSafeAreaInsets();

	const formatCurrency = (cents) => {
		const num = Number(cents); // Coerce to a number first
		if (typeof num !== "number" || isNaN(num)) {
			return "$0.00"; // Return a default value if input is invalid
		}
		return `$${(num / 100).toFixed(2)}`;
	};
	// This function will fetch our new, aggregated report data
	useEffect(() => {
		// This guard clause prevents the function from running if auth is still loading or user data isn't available.
		if (isAuthLoading || !currentUserData?.uid) {
			return;
		}

		const fetchSalesReport = async () => {
			setIsFetching(true);
			if (!currentUserData?.uid) return;
			setIsLoading(true);
			try {
				// We will create this new, more powerful Cloud Function next
				const getAggregatedSalesReport = httpsCallable(
					functions,
					"getAggregatedSalesReport"
				);
				const response = await getAggregatedSalesReport({
					restaurantId: currentUserData.uid,
					period: selectedPeriod.toLowerCase(), // 'today', 'week', 'month'
				});

				setReportData(response.data);
			} catch (error) {
				console.error("Error fetching sales report:", error);
				setReportData(null); // Clear data on error
				Alert.alert("Error", "Could not fetch sales data. Please try again.");
			} finally {
				setIsFetching(false);
			}
		};

		fetchSalesReport();
	}, [selectedPeriod, currentUserData?.uid, isAuthLoading]);

	if (isAuthLoading || isFetching) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (!reportData) {
		return (
			<View style={styles.centered}>
				<Ionicons
					name="alert-circle-outline"
					size={60}
					color={colors.textLight}
				/>
				<Text style={styles.noDataText}>
					No sales data available for this period.
				</Text>
				<PeriodSelector
					selectedPeriod={selectedPeriod}
					onSelectPeriod={setSelectedPeriod}
				/>
			</View>
		);
	}

	const totalRevenue = reportData.totalRevenue || 0;
	const totalOrders = reportData.totalOrders || 0;
	const avgCheckSize = reportData.avgCheckSize || 0;

	// Data for charts, derived from the reportData object
	const categoryChartData = reportData.salesByCategory
		? Object.entries(reportData.salesByCategory).map(([key, value]) => ({
				x: key,
				y: value / 100,
		  }))
		: [];

	const topItemsChartData = reportData.topSellingItems
		? reportData.topSellingItems.map((item) => ({
				x: item.name,
				y: item.quantity,
		  }))
		: [];
	return (
		<View style={[styles.container, { paddingTop: insets.top }]}>
			<View style={styles.header}>
				<Text style={styles.headerTitle}>Business Pulse</Text>
				<PeriodSelector
					selectedPeriod={selectedPeriod}
					onSelectPeriod={setSelectedPeriod}
				/>
			</View>
			<ScrollView contentContainerStyle={styles.scrollContent}>
				<View style={styles.kpiContainer}>
					{/* The values being passed are now guaranteed to be numbers */}
					<KPICard
						title="Total Revenue"
						value={formatCurrency(totalRevenue)}
						iconName="cash-outline"
					/>
					<KPICard
						title="Total Orders"
						value={totalOrders.toString()}
						iconName="receipt-outline"
					/>
					<KPICard
						title="Avg. Check Size"
						value={formatCurrency(avgCheckSize)}
						iconName="analytics-outline"
					/>
				</View>
				<ChartCard title="Sales by Category">
					<VictoryPie
						data={categoryChartData}
						colorScale={["#4CAF50", "#FFC107", "#2196F3", "#F44336"]}
						innerRadius={50}
						padAngle={2}
						labelRadius={({ innerRadius }) => innerRadius + 15}
						style={{
							labels: { fill: "white", fontSize: 12, fontWeight: "bold" },
						}}
						labels={({ datum }) => `${datum.x}\n${formatCurrency(datum.y)}`} // Format the cents value
						width={width - 60}
						height={220}
					/>
				</ChartCard>

				{/* The Bar Chart remains commented out for now. */}

				<ChartCard title="Top Selling Items (by Quantity)">
					<VictoryChart
						theme={VictoryTheme.material}
						domainPadding={{ x: 20 }}
						width={width - 40}
						height={Math.max(200, topItemsChartData.length * 50 + 50)}
					>
						<VictoryBar
							horizontal
							style={{ data: { fill: colors.primary } }}
							data={topItemsChartData}
							barWidth={25}
							labels={({ datum }) =>
								`${datum.x.substring(0, 15)}... (${datum.y})`
							}
							labelComponent={
								<VictoryLabel
									dx={5}
									textAnchor="start"
									style={{ fill: colors.textDark, fontSize: 12 }}
								/>
							}
						/>
						<VictoryAxis
							style={{
								ticks: { stroke: "transparent" },
								tickLabels: { fill: "transparent" },
							}}
						/>
					</VictoryChart>
				</ChartCard>
			</ScrollView>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	header: { paddingHorizontal: 15, paddingTop: 10 },
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
	scrollContent: { paddingHorizontal: 15, paddingBottom: 30 },
	kpiContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginBottom: 15,
	},
	kpiCard: {
		flex: 1,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		alignItems: "center",
		marginHorizontal: 5,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 5,
		elevation: 2,
	},
	kpiValue: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
		marginVertical: 5,
	},
	kpiTitle: { fontSize: 12, color: colors.textMedium },
	chartCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		marginBottom: 20,
		alignItems: "center",
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
		marginTop: 20,
		fontSize: 16,
		color: colors.textLight,
	},
});

export default SalesReportScreen;
