import React, { useEffect, useState, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	Dimensions,
	ActivityIndicator,
} from "react-native";
import { httpsCallable } from "firebase/functions";
import {
	VictoryChart,
	VictoryBar,
	VictoryTheme,
	VictoryAxis,
} from "victory-native";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";

const SalesReportScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [salesData, setSalesData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	const fetchDailySalesReport = async () => {
		setIsLoading(true);
		try {
			const getSalesReport = httpsCallable(functions, "getDailySalesReport");
			const response = await getSalesReport({
				restaurantId: currentUserData.uid,
			});

			const formattedSalesData = response.data.map((report) => {
				// Log topSellingItems for each report

				return {
					...report,
					totalSales: report.totalSales ? report.totalSales.toFixed(2) : "0.00",
					topSellingItems: report.topSellingItems
						? report.topSellingItems.map((item) => {
								// Ensure totalRevenue is a number before calling toFixed
								const totalRevenue = parseFloat(item.totalRevenue);

								return {
									...item,
									name: item.name || "Unknown Item",
									totalRevenue: !isNaN(totalRevenue)
										? totalRevenue.toFixed(2)
										: "0.00", // Call toFixed on a valid number
									displayName: `${item.name} x ${item.count}`,
								};
						  })
						: [], // Handle undefined topSellingItems by returning an empty array
					serverTips: Array.isArray(report.serverTips)
						? report.serverTips.map((tip) => ({
								serverName: tip.serverName || "Unknown Server",
								tipAmount: tip.tipAmount ? tip.tipAmount.toFixed(2) : "0.00",
						  }))
						: [],
				};
			});

			setSalesData(formattedSalesData);
		} catch (error) {
			console.error("Error fetching sales report:", error);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchDailySalesReport();
	}, []);

	const windowWidth = Dimensions.get("window").width;

	if (isLoading) {
		return (
			<ActivityIndicator
				size="large"
				color={colors.primary}
				style={styles.loader}
			/>
		);
	}

	return (
		<ScrollView style={styles.container}>
			<Text style={styles.header}>Daily Sales Report</Text>

			{salesData &&
				salesData.map((dayReport, index) => (
					<View key={index} style={styles.reportContainer}>
						<Text style={styles.dateText}>{dayReport.date}</Text>

						{/* Total Sales */}
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Total Sales</Text>
							<Text style={styles.salesValue}>${dayReport.totalSales}</Text>
						</View>

						{/* Top Selling Items */}
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Top-Selling Items</Text>
							{dayReport &&
								dayReport.topSellingItems.map((item, itemIndex) => (
									<View key={itemIndex} style={styles.itemRow}>
										<Text style={styles.itemName}>{item.displayName}</Text>
										<Text style={styles.itemRevenue}>${item.totalRevenue}</Text>
									</View>
								))}
							<Text style={{ fontSize: 16, marginTop: 8 }}>Server Tips:</Text>
						</View>
						{/* Server Tips */}
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Server Tips</Text>
							{dayReport.serverTips.map((server, serverIndex) => (
								<View key={serverIndex} style={styles.itemRow}>
									<Text style={styles.serverName}>{server.name}</Text>
									<Text style={styles.serverTips}>${server.tips}</Text>
								</View>
							))}
						</View>

						{/* Sales by Category */}
						{/* <View style={styles.section}>
							<Text style={styles.sectionTitle}>Sales by Category</Text>
							<VictoryChart
								theme={VictoryTheme.material}
								domainPadding={{ x: 50 }}
								width={windowWidth * 0.9}
							>
								<VictoryAxis />
								<VictoryBar
									data={dayReport.salesByCategory}
									x="category"
									y="totalRevenue"
									style={{ data: { fill: colors.primary } }}
								/>
							</VictoryChart>
						</View> */}

						{/* Server Performance */}
						{/* <View style={styles.section}>
							<Text style={styles.sectionTitle}>Server Performance</Text>
							{dayReport.serverPerformance.map((server, serverIndex) => (
								<View key={serverIndex} style={styles.itemRow}>
									<Text style={styles.serverName}>
										{server.firstName} {server.lastName}
									</Text>
									<Text style={styles.serverSales}>${server.totalSales}</Text>
								</View>
							))}
						</View> */}

						{/* Payment Status */}
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Payment Status</Text>
							<View style={styles.itemRow}>
								<Text style={styles.paymentStatusLabel}>Paid Orders:</Text>
								<Text style={styles.paymentStatusValue}>
									{dayReport.paidOrders}
								</Text>
							</View>
							<View style={styles.itemRow}>
								<Text style={styles.paymentStatusLabel}>Unpaid Orders:</Text>
								<Text style={styles.paymentStatusValue}>
									{dayReport.unpaidOrders}
								</Text>
							</View>
						</View>
					</View>
				))}
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f9f9f9",
		padding: 20,
	},
	loader: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	header: {
		fontSize: 24,
		fontWeight: "bold",
		color: "#333",
		textAlign: "center",
		marginBottom: 20,
	},
	reportContainer: {
		backgroundColor: "#fff",
		padding: 15,
		marginBottom: 20,
		borderRadius: 10,
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 10,
		elevation: 5,
	},
	dateText: {
		fontSize: 18,
		fontWeight: "600",
		color: "#555",
		marginBottom: 10,
	},
	section: {
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "bold",
		color: "#333",
		marginBottom: 10,
	},
	salesValue: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.primary,
	},
	itemRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 10,
	},
	itemName: {
		fontSize: 16,
		color: "#777",
	},
	itemRevenue: {
		fontSize: 16,
		fontWeight: "500",
		color: "#333",
	},
	serverName: {
		fontSize: 16,
		color: "#555",
	},
	serverSales: {
		fontSize: 16,
		fontWeight: "500",
		color: "#333",
	},
	paymentStatusLabel: {
		fontSize: 16,
		color: "#555",
	},
	paymentStatusValue: {
		fontSize: 16,
		fontWeight: "500",
		color: "#333",
	},
});

export default SalesReportScreen;
