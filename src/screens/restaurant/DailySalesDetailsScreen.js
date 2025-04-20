import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import colors from "../../utils/styles/appStyles";

const formatCurrency = (cents) => {
	// ... (keep the helper function) ...
	if (typeof cents !== "number" || isNaN(cents)) {
		return "$0.00"; // Handle invalid input
	}
	return `$${(cents / 100).toFixed(2)}`;
};

const DailySalesDetailsScreen = ({ route }) => {
	const { dayReport } = route.params;

	console.log("Day report", dayReport);

	return (
		<ScrollView style={styles.container}>
			<Text style={styles.dateText}>{dayReport.date}</Text>
			<Text style={styles.orderCountText}>({dayReport.orderCount} Orders)</Text>

			{/* --- Financial Summary --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Financial Summary</Text>
				{/* NEW: Gross Sales */}
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Gross Sales:</Text>
					<Text style={styles.amount}>
						{formatCurrency(dayReport.grossSales)}
					</Text>
				</View>
				{/* NEW: Discounts */}
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Discounts Applied:</Text>
					<Text style={styles.amount}>
						-{formatCurrency(dayReport.totalDiscountApplied)}
					</Text>
				</View>
				{/* Net Sales (Subtotal After Discounts) */}
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Net Sales:</Text>
					<Text style={styles.amount}>
						{formatCurrency(dayReport.netSales)}
					</Text>
				</View>
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Tax Collected:</Text>
					<Text style={styles.amount}>
						{formatCurrency(dayReport.totalTaxCollected)}
					</Text>
				</View>
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Gratuity Received:</Text>
					<Text style={styles.amount}>
						{formatCurrency(dayReport.totalGratuityReceived)}
					</Text>
				</View>
				{/* Optional: Base Total */}
				{/* <View style={[styles.summaryRow, styles.subTotalRow]}>
				 <Text style={styles.subTotalLabel}>Total (Net Sales+Tax+Tip):</Text>
				 <Text style={styles.subTotalAmount}>{formatCurrency(dayReport.restaurantBaseTotal)}</Text>
			 </View> */}

				{/* Fee Deduction/Waiver Info */}
				{!dayReport.wasAnyFeeWaived ? (
					<View style={styles.summaryRow}>
						<Text style={styles.deductionLabel}>
							Less: Est. Processing Fees:
						</Text>
						<Text style={styles.deductionAmount}>
							-{formatCurrency(dayReport.estimatedProcessingFeesDeducted)}
						</Text>
					</View>
				) : (
					<View style={[styles.summaryRow, styles.waivedRow]}>
						<Text style={[styles.label, styles.lineThrough]}>
							Platform Fee:
						</Text>
						<Text style={[styles.amount, styles.lineThrough]}>
							({formatCurrency(dayReport.potentialPlatformFee)})
						</Text>
						<MaterialCommunityIcons
							name="tag-off-outline"
							size={16}
							color={colors.success || "green"}
							style={{ marginLeft: 5 }}
						/>
						<Text style={styles.waiverText}>Waived</Text>
					</View>
				)}
				{/* Net Payout */}
				<View style={[styles.summaryRow, styles.netPayoutRow]}>
					<Text style={styles.netLabel}>Estimated Net Payout:</Text>
					<Text style={styles.netAmount}>
						{formatCurrency(dayReport.estimatedNetPayout)}
					</Text>
				</View>
				{/* NEW: Average Order Value */}
				<View style={styles.summaryRow}>
					<Text style={styles.label}>Average Order Value:</Text>
					<Text style={styles.amount}>
						{formatCurrency(dayReport.averageOrderValue)}
					</Text>
				</View>
			</View>

			{/* --- Payment Methods --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Payment Methods</Text>
				{dayReport.paymentMethodSummary &&
				dayReport.paymentMethodSummary.length > 0 ? (
					dayReport.paymentMethodSummary.map((pm, index) => (
						<View key={index} style={styles.summaryRow}>
							<Text style={styles.label}>
								{pm.type === "card" ? "Card Payments:" : `${pm.type} Payments:`}
							</Text>
							<Text style={styles.amount}>{pm.count}</Text>
						</View>
					))
				) : (
					<Text style={styles.noDataText}>No payment method data.</Text>
				)}
			</View>

			{/* --- Items Sold --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>All Items Sold</Text>
				{/* Use allItemsSold instead of topSellingItems */}
				{dayReport.allItemsSold && dayReport.allItemsSold.length > 0 ? (
					dayReport.allItemsSold.map((item, index) => (
						<View key={`${item.name}-${index}`} style={styles.itemRow}>
							<View style={styles.itemDetails}>
								<Text style={styles.itemName}>
									{item.name} x {item.count}
								</Text>
								{item.totalDiscount > 0 && (
									<Text style={styles.itemDiscountText}>
										(Original:{" "}
										{formatCurrency(item.originalPricePerUnit * item.count)},
										Discount: -{formatCurrency(item.totalDiscount)})
									</Text>
								)}
							</View>
							<Text style={styles.itemRevenue}>
								{formatCurrency(item.totalRevenue)}
							</Text>
						</View>
					))
				) : (
					<Text style={styles.noDataText}>No item data available.</Text>
				)}
			</View>

			{/* --- Server Tips --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Server Tips Breakdown</Text>
				{/* ... existing server tips map ... */}
				{dayReport.serverTips && dayReport.serverTips.length > 0 ? (
					dayReport.serverTips.map((tip, index) => (
						<View key={`${tip.serverName}-${index}`} style={styles.itemRow}>
							<Text style={styles.serverName}>{tip.serverName}</Text>
							<Text style={styles.serverTipsAmount}>
								{formatCurrency(tip.gratuityTotal)}
							</Text>
						</View>
					))
				) : (
					<Text style={styles.noDataText}>No tips recorded separately.</Text>
				)}
			</View>
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
	itemDetails: {
		flex: 1,
		marginRight: 10,
	},
	itemDiscountText: {
		fontSize: 12,
		color: colors.textLight || "#6c757d",
		fontStyle: "italic",
	},
	// ... styles for payment status if needed ...
});

export default DailySalesDetailsScreen;
