// screens/restaurant/HistoricalReportsScreen.js
import React, { useEffect, useState, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	FlatList,
	ActivityIndicator,
	TouchableOpacity,
	SafeAreaView,
	Alert,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import colors from "../../utils/styles/appStyles";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";
import formatCurrency from "../../utils/currencyFormatter";

// A reusable component for each row in the list
const ReportRow = ({ item, onPress }) => {
	const { t } = useTranslation();
	return (
		<TouchableOpacity style={styles.dayCard} onPress={onPress}>
			<View style={styles.row}>
				<Text style={styles.dateText}>{item.date}</Text>
				<View style={styles.netPayoutContainer}>
					<Text style={styles.netLabelSmall}>{t("est_net_payout")}:</Text>
					<Text style={styles.netAmountSmall}>
						{formatCurrency(item.estimatedNetPayout)}
					</Text>
				</View>
			</View>
			<View style={styles.row}>
				<Text style={styles.detailLabel}>{t("net_sales")}:</Text>
				<Text style={styles.detailAmount}>{formatCurrency(item.netSales)}</Text>
				<Text style={styles.orderCountText}>
					({item.orderCount} {t("orders")})
				</Text>
			</View>
		</TouchableOpacity>
	);
};

const HistoricalReportsScreen = () => {
	const { t } = useTranslation();
	const [dailyReports, setDailyReports] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const { currentUserData } = useContext(AuthContext);
	const navigation = useNavigation();

	// This useEffect fetches the list of daily summaries.
	// It uses your original `getDailySalesReport` function.
	useEffect(() => {
		const fetchReports = async () => {
			if (!currentUserData?.uid) {
				setIsLoading(false);
				return;
			}
			setIsLoading(true);
			try {
				// This is your original function that returns a list of daily reports
				const getSalesReport = httpsCallable(functions, "getDailySalesReport");
				const response = await getSalesReport({
					restaurantId: currentUserData.uid,
				});
				setDailyReports(response.data || []);
			} catch (error) {
				console.error("Error fetching daily sales reports:", error);
				Alert.alert(t("error"), t("could_not_load_historical_reports"));
				setDailyReports([]);
			} finally {
				setIsLoading(false);
			}
		};

		fetchReports();
	}, [currentUserData?.uid]);

	// This handler navigates to the new, revamped details screen
	const handleViewDetails = (dayReport) => {
		navigation.navigate("DailySalesDetails", { dayReport });
	};

	if (isLoading) {
		return (
			<View style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<FlatList
				data={dailyReports}
				keyExtractor={(item) => item.date}
				renderItem={({ item }) => (
					<ReportRow item={item} onPress={() => handleViewDetails(item)} />
				)}
				contentContainerStyle={styles.listContainer}
				ListHeaderComponent={
					<Text style={styles.header}>{t("historical_reports")}</Text>
				}
				ListEmptyComponent={
					<View style={styles.centeredContainer}>
						<Ionicons
							name="document-text-outline"
							size={60}
							color={colors.textLight}
						/>
						<Text style={styles.noDataText}>
							{t("no_daily_reports_have_been_generated_yet")}
						</Text>
					</View>
				}
			/>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	listContainer: { paddingHorizontal: 15, paddingBottom: 20 },
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingTop: 100,
	},
	header: {
		fontSize: 26,
		fontWeight: "bold",
		marginBottom: 25,
		color: colors.textDark,
		textAlign: "center",
		paddingTop: 20,
	},
	noDataText: {
		textAlign: "center",
		marginTop: 20,
		fontSize: 16,
		color: colors.textLight,
	},
	dayCard: {
		backgroundColor: colors.surfaceWhite,
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
	},
	dateText: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary,
	},
	netPayoutContainer: { alignItems: "flex-end" },
	netLabelSmall: { fontSize: 13, color: colors.textLight },
	netAmountSmall: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.primary,
	},
	detailLabel: { fontSize: 14, color: colors.textMedium },
	detailAmount: { fontSize: 14, fontWeight: "500", color: colors.textDark },
	orderCountText: {
		fontSize: 13,
		color: colors.textLight,
		marginLeft: 10,
	},
});

export default HistoricalReportsScreen;

