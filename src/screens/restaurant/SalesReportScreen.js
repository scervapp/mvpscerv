import React, { useEffect, useState, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	Dimensions,
	ActivityIndicator,
	FlatList,
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

const SalesReportScreen = ({ navigation }) => {
	const [salesData, setSalesData] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const { currentUserData } = useContext(AuthContext);

	const fetchDailySalesReport = async () => {
		setIsLoading(true);
		try {
			const getSalesReport = httpsCallable(functions, "getDailySalesReport");
			const response = await getSalesReport({
				restaurantId: currentUserData.uid,
			});

			const formattedSalesData = response.data.map((report) => ({
				...report,
				totalSales: report.totalSales
					? parseFloat(report.totalSales).toFixed(2)
					: "0.00",
				topSellingItems: report.topSellingItems
					? report.topSellingItems.map((item) => ({
							...item,
							totalRevenue: parseFloat(item.totalRevenue || 0).toFixed(2),
							displayName: `${item.name} x ${item.count}`,
					  }))
					: [],
				serverTips: Array.isArray(report.serverTips)
					? report.serverTips.map((tip) => ({
							serverName: tip.serverName || "Unknown Server",
							gratuityTotal: parseFloat(tip.gratuityTotal || 0).toFixed(2),
					  }))
					: [],
			}));

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

	const renderItem = ({ item }) => (
		<View style={styles.dateContainer}>
			<Text
				style={styles.dateText}
				onPress={() =>
					navigation.navigate("DailySalesDetails", { dayReport: item })
				}
			>
				{item.date} - Total Sales: ${(item.totalSales / 100).toFixed(2)}
			</Text>
		</View>
	);

	return (
		<View style={styles.container}>
			<Text style={styles.header}>Daily Sales Report</Text>
			{isLoading ? (
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={styles.loader}
				/>
			) : (
				<FlatList
					data={salesData}
					renderItem={renderItem}
					keyExtractor={(item, index) => index.toString()}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
	},
	header: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
	},
	loader: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	dateContainer: {
		padding: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#ccc",
	},
	dateText: {
		fontSize: 18,
	},
});

export default SalesReportScreen;
