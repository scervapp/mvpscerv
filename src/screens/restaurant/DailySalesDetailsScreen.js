import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";

const DailySalesDetailsScreen = ({ route }) => {
	const { dayReport } = route.params;

	return (
		<ScrollView style={styles.container}>
			<Text style={styles.dateText}>{dayReport.date}</Text>

			{/* Total Sales */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Total Sales</Text>
				<Text style={styles.salesValue}>
					${(dayReport.totalSales / 100).toFixed(2)}
				</Text>
			</View>

			{/* Total Tax */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Total Tax</Text>
				<Text style={styles.salesValue}>
					${(dayReport.totalTax / 100).toFixed(2)}
				</Text>
				{/* Display totalTax */}
			</View>

			{/* Top Selling Items */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Top-Selling Items</Text>
				{dayReport.topSellingItems.map((item, itemIndex) => (
					<View key={itemIndex} style={styles.itemRow}>
						<Text style={styles.itemName}>{item.displayName}</Text>
						<Text style={styles.itemRevenue}>${item.totalRevenue}</Text>
					</View>
				))}
			</View>

			{/* Server Tips */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Server Tips</Text>
				{dayReport.serverTips.map((tip, tipIndex) => (
					<View key={tipIndex} style={styles.itemRow}>
						<Text style={styles.serverName}>{tip.serverName}</Text>
						<Text style={styles.serverTips}>
							${(tip.gratuityTotal / 100).toFixed(2)}
						</Text>
					</View>
				))}
			</View>

			{/* Payment Status (If you have this data in your dayReport) */}
			{/* <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Status</Text>
        <View style={styles.itemRow}>
          <Text style={styles.paymentStatusLabel}>Paid Orders:</Text>
          <Text style={styles.paymentStatusValue}>{dayReport.paidOrders}</Text> 
        </View>
        <View style={styles.itemRow}>
          <Text style={styles.paymentStatusLabel}>Unpaid Orders:</Text>
          <Text style={styles.paymentStatusValue}>{dayReport.unpaidOrders}</Text> 
        </View>
      </View> */}
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
	},
	dateText: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 20,
	},
	section: {
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
	},
	itemRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 5,
	},
	itemName: {
		fontSize: 16,
	},
	itemRevenue: {
		fontSize: 16,
	},
	serverName: {
		fontSize: 16,
	},
	serverTips: {
		fontSize: 16,
	},
	// ... styles for payment status if needed ...
});

export default DailySalesDetailsScreen;
