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
import { TouchableOpacity } from "react-native";

const SalesReportScreen = ({ navigation }) => {
	const [salesData, setSalesData] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const { currentUserData } = useContext(AuthContext);

	// Helper function for formatting cents to dollars (Make sure this is accessible)
	const formatCurrency = (cents) => {
		if (typeof cents !== "number" || isNaN(cents)) {
			console.warn("Invalid input to formatCurrency:", cents);
			return "$0.00";
		}
		const value = cents / 100;
		return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
	};

	const fetchDailySalesReport = async () => {
		setIsLoading(true);
		try {
			const getSalesReport = httpsCallable(functions, "getDailySalesReport");
			const response = await getSalesReport({
				restaurantId: currentUserData.uid,
			});

			setSalesData(response.data || []);
		} catch (error) {
			console.error("Error fetching sales report:", error);
			setSalesData([]);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchDailySalesReport();
	}, []);

	// --- RENDER LIST ITEM (UPDATED) ---
	const renderItem = (
		{ item } // item is a dayReport object with cents
	) => (
		<TouchableOpacity
			style={styles.dayCard} // Use the detailed card style
			onPress={() =>
				navigation.navigate("DailySalesDetails", { dayReport: item })
			}
		>
			{/* Row 1: Date and Net Payout */}
			<View style={styles.row}>
				<Text style={styles.dateText}>{item.date}</Text>
				<View style={styles.netPayoutContainer}>
					<Text style={styles.netLabelSmall}>Est. Net Payout:</Text>
					<Text style={styles.netAmountSmall}>
						{formatCurrency(item.estimatedNetPayout)}
					</Text>
				</View>
			</View>

			{/* Row 2: Sales and Order Count */}
			<View style={styles.row}>
				<Text style={styles.detailLabel}>Net Sales:</Text>
				<Text style={styles.detailAmount}>{formatCurrency(item.netSales)}</Text>
				<Text style={styles.orderCountText}>({item.orderCount} Orders)</Text>
			</View>

			{/* Row 3: Fee Information */}
			<View style={styles.row}>
				<Text style={styles.feeLabel}>Platform Fee Charged:</Text>
				<View style={{ flexDirection: "row", alignItems: "center" }}>
					<Text style={styles.feeAmount}>
						{formatCurrency(
							item.potentialPlatformFee - item.estimatedProcessingFeesDeducted
						)}{" "}
						{/* Show what platform netted */}
					</Text>
					{/* Show waiver indicator */}
					{item.wasAnyFeeWaived && (
						<View style={styles.waiverIndicator}>
							<MaterialCommunityIcons
								name="tag-off-outline"
								size={14}
								color={colors.success || "green"}
							/>
							<Text style={styles.waiverText}>Waived</Text>
						</View>
					)}
					{/* Or show processing fee if not waived */}
					{!item.wasAnyFeeWaived &&
						item.estimatedProcessingFeesDeducted > 0 && (
							<Text style={styles.processingFeeText}>
								{" "}
								(Less Est. Proc. Fees: -
								{formatCurrency(item.estimatedProcessingFeesDeducted)})
							</Text>
						)}
				</View>
			</View>
		</TouchableOpacity>
	);
	// --- END RENDER LIST ITEM ---

	return (
		<View style={styles.container}>
			<Text style={styles.header}>Daily Sales Summary</Text>
			{isLoading ? (
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={styles.loader}
				/>
			) : salesData.length === 0 ? (
				<Text style={styles.noDataText}>No sales data available yet.</Text>
			) : (
				<FlatList
					data={salesData}
					renderItem={renderItem}
					keyExtractor={(item) => item.date}
					contentContainerStyle={{ paddingBottom: 20 }}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingVertical: 20,
		paddingHorizontal: 15,
		backgroundColor: colors.background || "#f8f9fa",
	},
	header: {
		fontSize: 26,
		fontWeight: "bold",
		marginBottom: 25,
		color: colors.primary || "#007bff",
		textAlign: "center",
	},
	loader: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		marginTop: 50,
	},
	noDataText: {
		textAlign: "center",
		marginTop: 40,
		fontSize: 16,
		color: colors.textLight || "#6c757d",
	},
	dayCard: {
		backgroundColor: "#fff",
		borderRadius: 8,
		padding: 15,
		marginBottom: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 3,
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	}, // General row style
	dateText: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary || "#0056b3",
	},
	netPayoutContainer: { alignItems: "flex-end" },
	netLabelSmall: { fontSize: 13, color: colors.textLight || "#6c757d" },
	netAmountSmall: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.primary || "#0056b3",
	},
	detailLabel: { fontSize: 14, color: colors.text || "#495057" },
	detailAmount: { fontSize: 14, fontWeight: "500" },
	orderCountText: {
		fontSize: 13,
		color: colors.textLight || "#6c757d",
		marginLeft: 10,
	}, // Added style
	feeLabel: { fontSize: 14, color: colors.text || "#495057" },
	feeAmount: { fontSize: 14, fontWeight: "500" },
	waiverIndicator: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#e6f9e6",
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 8,
		marginLeft: 8,
	},
	waiverText: {
		fontSize: 11,
		color: colors.success || "green",
		marginLeft: 3,
		fontWeight: "500",
	},
	processingFeeText: {
		fontSize: 12,
		color: colors.textLight || "#6c757d",
		marginLeft: 5,
		fontStyle: "italic",
	},
});

export default SalesReportScreen;
