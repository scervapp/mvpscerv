import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	SafeAreaView,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { httpsCallable } from "@react-native-firebase/functions";

import { functions } from "../../config/firebase.native";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import formatCurrency from "../../utils/currencyFormatter";
import colors from "../../utils/styles/appStyles";

const getDayBounds = (date) => {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);
	const end = new Date(start);
	end.setDate(end.getDate() + 1);
	return {
		startAt: start.toISOString(),
		endAt: end.toISOString(),
		label: start.toLocaleDateString(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
			year: "numeric",
		}),
	};
};

const formatTime = (value) => {
	if (!value) return "-";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "-";
	return parsed.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
};

const buildReceiptText = ({ report, dayLabel }) => {
	const summary = report?.summary || {};
	const transactions = report?.transactions || [];
	const lines = [
		"SCERV PAY LITE DAILY RECEIPT",
		report?.restaurantName || "Restaurant",
		dayLabel,
		"",
		`Transactions: ${summary.transactionCount || 0}`,
		`POS sales entered: ${formatCurrency(summary.merchantNetSalesAmount)}`,
		`Tips: ${formatCurrency(summary.gratuityAmount)}`,
		`Card totals collected: ${formatCurrency(summary.amount)}`,
		`Customer card fees: ${formatCurrency(summary.customerServiceFeeAmount)}`,
		`Scerv fees: ${formatCurrency(summary.applicationFeeAmount)}`,
		`Restaurant target: ${formatCurrency(summary.restaurantTransferAmount)}`,
		"",
		"TRANSACTIONS",
	];

	transactions.forEach((item, index) => {
		lines.push(
			`${index + 1}. ${formatTime(item.paidAt)} - ${item.staffName || "Staff"}`,
			`POS sale ${formatCurrency(item.merchantNetSalesAmount)} | Tip ${formatCurrency(
				item.gratuityAmount,
			)} | Card total ${formatCurrency(item.amount)}`,
			`Reader ${item.readerLabel || "-"}${
				item.readerSerialNumber ? ` (${item.readerSerialNumber})` : ""
			}`,
			`Payment ${item.paymentIntentId || item.id}`,
			item.note ? `Note: ${item.note}` : "",
			"",
		);
	});

	if (!transactions.length) {
		lines.push("No Scerv Pay Lite payments found for this day.");
	}

	return lines.filter((line) => line !== null && line !== undefined).join("\n");
};

const Metric = ({ label, value, accent = false }) => (
	<View style={styles.metricCard}>
		<Text style={styles.metricLabel}>{label}</Text>
		<Text style={[styles.metricValue, accent && styles.metricValueAccent]}>
			{formatCurrency(value)}
		</Text>
	</View>
);

const PayLiteDailyReportScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const [selectedDate, setSelectedDate] = useState(() => new Date());
	const [isLoading, setIsLoading] = useState(true);
	const [report, setReport] = useState(null);

	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
	const dayBounds = useMemo(() => getDayBounds(selectedDate), [selectedDate]);

	const loadReport = useCallback(async () => {
		if (!restaurantId) return;
		setIsLoading(true);
		try {
			const getReport = httpsCallable(functions, "getScervPayLiteDailyReport");
			const response = await getReport({
				restaurantId,
				staffId: activeSession?.id || null,
				startAt: dayBounds.startAt,
				endAt: dayBounds.endAt,
			});
			setReport(response?.data || null);
		} catch (error) {
			console.error("PayLiteDailyReportScreen load error:", error);
			Alert.alert(
				"Report unavailable",
				error?.message || "Could not load the Pay Lite daily report.",
			);
			setReport(null);
		} finally {
			setIsLoading(false);
		}
	}, [activeSession?.id, dayBounds.endAt, dayBounds.startAt, restaurantId]);

	useEffect(() => {
		loadReport();
	}, [loadReport]);

	const moveDay = (delta) => {
		setSelectedDate((current) => {
			const next = new Date(current);
			next.setDate(next.getDate() + delta);
			return next;
		});
	};

	const shareReport = async () => {
		try {
			await Share.share({
				title: "Scerv Pay Lite Daily Receipt",
				message: buildReceiptText({ report, dayLabel: dayBounds.label }),
			});
		} catch (error) {
			Alert.alert("Share failed", "Could not open the share sheet.");
		}
	};

	const summary = report?.summary || {};
	const transactions = report?.transactions || [];

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView
				contentContainerStyle={styles.content}
				refreshControl={
					<RefreshControl refreshing={isLoading} onRefresh={loadReport} />
				}
			>
				<View style={styles.header}>
					<View>
						<Text style={styles.eyebrow}>SCERV PAY LITE</Text>
						<Text style={styles.title}>Daily receipt</Text>
						<Text style={styles.subtitle}>
							Payments, tips, staff, and times for POS reconciliation.
						</Text>
					</View>
				</View>

				<View style={styles.dateBar}>
					<TouchableOpacity style={styles.dateButton} onPress={() => moveDay(-1)}>
						<MaterialCommunityIcons name="chevron-left" size={24} color={colors.textDark} />
					</TouchableOpacity>
					<View style={styles.dateCenter}>
						<Text style={styles.dateLabel}>{dayBounds.label}</Text>
						<Text style={styles.dateMeta}>
							{summary.transactionCount || 0} payment
							{summary.transactionCount === 1 ? "" : "s"}
						</Text>
					</View>
					<TouchableOpacity style={styles.dateButton} onPress={() => moveDay(1)}>
						<MaterialCommunityIcons name="chevron-right" size={24} color={colors.textDark} />
					</TouchableOpacity>
				</View>

				<View style={styles.actionsRow}>
					<TouchableOpacity
						style={[styles.actionButton, styles.secondaryButton]}
						onPress={loadReport}
						disabled={isLoading}
					>
						<MaterialCommunityIcons name="refresh" size={18} color={colors.primary} />
						<Text style={styles.secondaryButtonText}>Refresh</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[styles.actionButton, styles.primaryButton]}
						onPress={shareReport}
						disabled={isLoading}
					>
						<MaterialCommunityIcons name="printer-outline" size={18} color="#FFF" />
						<Text style={styles.primaryButtonText}>Share / Print</Text>
					</TouchableOpacity>
				</View>

				{isLoading && !report ? (
					<View style={styles.loadingCard}>
						<ActivityIndicator color={colors.primary} />
						<Text style={styles.loadingText}>Loading daily receipt...</Text>
					</View>
				) : (
					<>
						<View style={styles.summaryGrid}>
							<Metric
								label="POS sales entered"
								value={summary.merchantNetSalesAmount}
								accent
							/>
							<Metric label="Tips" value={summary.gratuityAmount} />
							<Metric label="Card totals" value={summary.amount} />
							<Metric
								label="Restaurant target"
								value={summary.restaurantTransferAmount}
							/>
							<Metric
								label="Customer card fees"
								value={summary.customerServiceFeeAmount}
							/>
							<Metric label="Scerv fees" value={summary.applicationFeeAmount} />
						</View>

						{report?.truncated ? (
							<View style={styles.warningBox}>
								<Text style={styles.warningText}>
									This report reached the current row limit. Narrow the day or export
									from the dashboard before using it for final accounting.
								</Text>
							</View>
						) : null}

						<View style={styles.sectionHeader}>
							<Text style={styles.sectionTitle}>Transactions</Text>
						</View>

						{transactions.length === 0 ? (
							<View style={styles.emptyCard}>
								<MaterialCommunityIcons
									name="receipt-text-outline"
									size={28}
									color={colors.textMedium}
								/>
								<Text style={styles.emptyTitle}>No Pay Lite payments</Text>
								<Text style={styles.emptyText}>
									Payments collected through Scerv Pay Lite will appear here.
								</Text>
							</View>
						) : (
							transactions.map((item) => (
								<View key={item.id} style={styles.transactionCard}>
									<View style={styles.transactionTop}>
										<View>
											<Text style={styles.transactionTime}>
												{formatTime(item.paidAt)}
											</Text>
											<Text style={styles.transactionStaff}>
												{item.staffName || "Staff"}
											</Text>
										</View>
										<Text style={styles.transactionAmount}>
											{formatCurrency(item.amount)}
										</Text>
									</View>
									<View style={styles.transactionGrid}>
										<View style={styles.transactionMetric}>
											<Text style={styles.transactionLabel}>POS sale</Text>
											<Text style={styles.transactionValue}>
												{formatCurrency(item.merchantNetSalesAmount)}
											</Text>
										</View>
										<View style={styles.transactionMetric}>
											<Text style={styles.transactionLabel}>Tip</Text>
											<Text style={styles.transactionValue}>
												{formatCurrency(item.gratuityAmount)}
											</Text>
										</View>
										<View style={styles.transactionMetric}>
											<Text style={styles.transactionLabel}>Card fee</Text>
											<Text style={styles.transactionValue}>
												{formatCurrency(item.customerServiceFeeAmount)}
											</Text>
										</View>
										<View style={styles.transactionMetric}>
											<Text style={styles.transactionLabel}>Scerv fee</Text>
											<Text style={styles.transactionValue}>
												{formatCurrency(item.applicationFeeAmount)}
											</Text>
										</View>
									</View>
									<Text style={styles.transactionMeta} numberOfLines={1}>
										{item.readerLabel || "Reader"}{" "}
										{item.readerSerialNumber ? `- ${item.readerSerialNumber}` : ""}
									</Text>
									<Text style={styles.transactionMeta} numberOfLines={1}>
										{item.paymentIntentId || item.id}
									</Text>
									{item.note ? (
										<Text style={styles.transactionNote}>{item.note}</Text>
									) : null}
								</View>
							))
						)}
					</>
				)}
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
	},
	content: {
		padding: 18,
		paddingBottom: 42,
	},
	header: {
		marginBottom: 16,
	},
	eyebrow: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
		letterSpacing: 1,
	},
	title: {
		fontSize: 28,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 3,
	},
	subtitle: {
		fontSize: 14,
		fontWeight: "700",
		color: colors.textMedium,
		lineHeight: 20,
		marginTop: 4,
	},
	dateBar: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 10,
		marginBottom: 12,
	},
	dateButton: {
		width: 42,
		height: 42,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 12,
		backgroundColor: colors.backgroundLight,
	},
	dateCenter: {
		flex: 1,
		alignItems: "center",
	},
	dateLabel: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textDark,
	},
	dateMeta: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 2,
	},
	actionsRow: {
		flexDirection: "row",
		gap: 10,
		marginBottom: 14,
	},
	actionButton: {
		flex: 1,
		minHeight: 46,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: 8,
	},
	primaryButton: {
		backgroundColor: colors.primary,
	},
	secondaryButton: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	primaryButtonText: {
		fontSize: 14,
		fontWeight: "900",
		color: "#FFF",
	},
	secondaryButtonText: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.primary,
	},
	loadingCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 22,
		alignItems: "center",
		gap: 10,
	},
	loadingText: {
		fontSize: 14,
		fontWeight: "800",
		color: colors.textMedium,
	},
	summaryGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
		marginBottom: 16,
	},
	metricCard: {
		flexBasis: "48%",
		flexGrow: 1,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
	},
	metricLabel: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.textMedium,
		textTransform: "uppercase",
	},
	metricValue: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 7,
	},
	metricValueAccent: {
		color: colors.primary,
	},
	warningBox: {
		backgroundColor: colors.statusWarning + "14",
		borderWidth: 1,
		borderColor: colors.statusWarning + "55",
		borderRadius: 12,
		padding: 12,
		marginBottom: 14,
	},
	warningText: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
		lineHeight: 18,
	},
	sectionHeader: {
		marginBottom: 10,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "900",
		color: colors.textDark,
	},
	emptyCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 22,
		alignItems: "center",
	},
	emptyTitle: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 10,
	},
	emptyText: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.textMedium,
		textAlign: "center",
		lineHeight: 18,
		marginTop: 4,
	},
	transactionCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 12,
	},
	transactionTop: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		gap: 12,
		marginBottom: 12,
	},
	transactionTime: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textDark,
	},
	transactionStaff: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 2,
	},
	transactionAmount: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.primary,
	},
	transactionGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 10,
		gap: 8,
	},
	transactionMetric: {
		flexBasis: "48%",
		flexGrow: 1,
	},
	transactionLabel: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.textMedium,
		textTransform: "uppercase",
	},
	transactionValue: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 2,
	},
	transactionMeta: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 8,
	},
	transactionNote: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
		backgroundColor: colors.backgroundLight,
		borderRadius: 10,
		padding: 10,
		marginTop: 10,
	},
});

export default PayLiteDailyReportScreen;
