import React, { useEffect, useState, useContext } from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	ActivityIndicator,
	Dimensions,
	ScrollView,
} from "react-native";

import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import {
	VictoryChart,
	VictoryBar,
	VictoryTheme,
	VictoryAxis,
} from "victory-native";
import { Button } from "react-native-elements";
import colors from "../../utils/styles/appStyles";
import { httpsCallable } from "firebase/functions";

const SalesReportScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [reportData, setReportData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [salesData, setSalesData] = useState(null);
	const [selectedReportType, setSelectedReportType] = useState("daily");

	// Get window width for responsive chart
	const windowWidth = Dimensions.get("window").width;

	const fetchDailySalesReport = async () => {
		setIsLoading(true);
		try {
			const getSalesReport = httpsCallable(functions, "getDailySalesReport");
			const response = await getSalesReport({
				restaurantId: currentUserData.uid,
			});

			const salesData = response.data;
			// Loop through the array to format totalSales for each report
			const formattedSalesData = salesData.map((report) => {
				return {
					...report,
					totalSales: report.totalSales ? report.totalSales.toFixed(2) : "0.00",
					// You can also format the items if needed
					topSellingItems: report.topSellingItems.map((item) => ({
						...item,
						totalRevenue: item.totalRevenue
							? item.totalRevenue.toFixed(2)
							: "0.00",
					})),
				};
			});

			console.log("Formatted Sales Data: ", formattedSalesData);
			setSalesData(formattedSalesData);
			setIsLoading(false);

			setIsLoading(false);
		} catch (error) {
			console.error("Error fetching daily sales report:", error);
			setIsLoading(false);
		} finally {
			setIsLoading(false);
		}
	};
	// Function to format sales data (fetchDailySalesReport here)
	useEffect(() => {
		fetchDailySalesReport();
	}, []);

	return (
		<ScrollView style={styles.container}>
			<Text style={styles.header}>Daily Sales Report</Text>
			{salesData &&
				salesData.map((dayReport, index) => (
					<View key={index} style={styles.dateContainer}>
						<Text style={styles.dateText}>{dayReport.date}</Text>
						<View style={styles.salesRow}>
							<Text style={styles.salesLabel}>Total Sales:</Text>
							<Text style={styles.salesValue}>${dayReport.totalSales}</Text>
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
	header: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		color: "#333",
		textAlign: "center",
	},
	dateContainer: {
		backgroundColor: "#fff",
		padding: 15,
		marginBottom: 10,
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
	},
	salesRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 10,
	},
	salesLabel: {
		fontSize: 16,
		fontWeight: "500",
		color: "#777",
	},
	salesValue: {
		fontSize: 16,
		fontWeight: "500",
		color: "#333",
	},
});
export default SalesReportScreen;
