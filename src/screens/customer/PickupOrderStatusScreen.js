import React, { useEffect, useState, useContext, useMemo } from "react";
import {
	View,
	Text,
	SafeAreaView,
	ActivityIndicator,
	StyleSheet,
	ScrollView,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { AuthContext } from "../../context/authContext";
import { useTranslation } from "react-i18next";

const StatusPill = ({ label, tone = "neutral" }) => {
	const toneStyles = {
		neutral: {
			backgroundColor: colors.backgroundMedium,
			color: colors.textDark,
		},
		warning: {
			backgroundColor: colors.statusWarning + "20",
			color: colors.statusWarning,
		},
		info: {
			backgroundColor: colors.primary + "15",
			color: colors.primary,
		},
		success: {
			backgroundColor: colors.statusSuccess + "15",
			color: colors.statusSuccess,
		},
	};

	const selectedTone = toneStyles[tone] || toneStyles.neutral;

	return (
		<View
			style={[
				styles.statusPill,
				{ backgroundColor: selectedTone.backgroundColor },
			]}
		>
			<Text style={[styles.statusPillText, { color: selectedTone.color }]}>
				{label}
			</Text>
		</View>
	);
};

const StationStatusCard = ({ title, status, icon }) => {
	let tone = "neutral";
	let label = status || "pending";

	if (status === "new") {
		tone = "warning";
		label = "Queued";
	} else if (status === "preparing") {
		tone = "info";
		label = "Preparing";
	} else if (status === "ready") {
		tone = "success";
		label = "Ready";
	}

	return (
		<View style={styles.stationCard}>
			<View style={styles.stationCardHeader}>
				<Ionicons name={icon} size={18} color={colors.primary} />
				<Text style={styles.stationTitle}>{title}</Text>
			</View>
			<StatusPill label={label} tone={tone} />
		</View>
	);
};

const PickupOrderStatusScreen = () => {
	const route = useRoute();
	const { t } = useTranslation();
	const { currentUser } = useContext(AuthContext);

	const routeOrderId = route.params?.orderId || null;

	const [resolvedOrderId, setResolvedOrderId] = useState(routeOrderId);
	const [order, setOrder] = useState(null);
	const [loading, setLoading] = useState(true);
	const [resolvingOrder, setResolvingOrder] = useState(true);

	// Step 1: Resolve which order to watch
	useEffect(() => {
		let isMounted = true;

		const resolveOrderId = async () => {
			try {
				if (routeOrderId) {
					if (isMounted) {
						setResolvedOrderId(routeOrderId);
						setResolvingOrder(false);
					}
					return;
				}

				if (!currentUser?.uid) {
					if (isMounted) {
						setResolvedOrderId(null);
						setResolvingOrder(false);
					}
					return;
				}

				const customerDoc = await db
					.collection("customers")
					.doc(currentUser.uid)
					.get();

				const customerData = customerDoc.exists ? customerDoc.data() : {};
				const fallbackOrderId = customerData?.activePickupOrderId || null;

				if (isMounted) {
					setResolvedOrderId(fallbackOrderId);
					setResolvingOrder(false);
				}
			} catch (error) {
				console.error("Error resolving pickup order:", error);
				if (isMounted) {
					setResolvedOrderId(null);
					setResolvingOrder(false);
				}
			}
		};

		resolveOrderId();

		return () => {
			isMounted = false;
		};
	}, [routeOrderId, currentUser?.uid]);

	// Step 2: Watch kitchen order
	useEffect(() => {
		if (resolvingOrder) return;

		if (!resolvedOrderId) {
			setLoading(false);
			return;
		}

		const unsubscribe = db
			.collection("kitchen_orders")
			.doc(resolvedOrderId)
			.onSnapshot(
				(doc) => {
					if (doc.exists) {
						setOrder({ id: doc.id, ...doc.data() });
					} else {
						setOrder(null);
					}
					setLoading(false);
				},
				(error) => {
					console.error("Pickup order listener error:", error);
					setLoading(false);
				},
			);

		return () => unsubscribe();
	}, [resolvedOrderId, resolvingOrder]);

	const kitchenStatus = order?.stationStatuses?.kitchen || null;
	const barStatus = order?.stationStatuses?.bar || null;

	const allReady = useMemo(() => {
		return (
			(!kitchenStatus || kitchenStatus === "ready") &&
			(!barStatus || barStatus === "ready")
		);
	}, [kitchenStatus, barStatus]);

	const overallLabel = useMemo(() => {
		if (order?.overallStatus === "completed") {
			return {
				title: t("completed", "Completed"),
				subtitle: t(
					"pickup_completed_message",
					"Your order has been handed off.",
				),
				tone: "success",
				icon: "checkmark-circle",
			};
		}

		if (allReady) {
			return {
				title: t("ready_for_pickup", "Ready for Pickup"),
				subtitle: t(
					"pickup_ready_message",
					"Your order is ready at the pickup window.",
				),
				tone: "success",
				icon: "bag-check-outline",
			};
		}

		return {
			title: t("preparing", "Preparing"),
			subtitle: t(
				"pickup_preparing_message",
				"We’re preparing your order now.",
			),
			tone: "info",
			icon: "time-outline",
		};
	}, [order?.overallStatus, allReady, t]);

	if (loading || resolvingOrder) {
		return (
			<SafeAreaView style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</SafeAreaView>
		);
	}

	if (!resolvedOrderId || !order) {
		return (
			<SafeAreaView style={styles.centered}>
				<Ionicons name="receipt-outline" size={72} color={colors.textLight} />
				<Text style={styles.emptyTitle}>
					{t("no_active_pickup_order", "No Active Pickup Order")}
				</Text>
				<Text style={styles.emptySubtitle}>
					{t(
						"no_active_pickup_order_message",
						"We couldn’t find an active pickup order to track.",
					)}
				</Text>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.heroCard}>
					<View style={styles.heroIconWrap}>
						<Ionicons
							name={overallLabel.icon}
							size={34}
							color={
								overallLabel.tone === "success"
									? colors.statusSuccess
									: colors.primary
							}
						/>
					</View>

					<Text style={styles.heroTitle}>{overallLabel.title}</Text>
					<Text style={styles.heroSubtitle}>{overallLabel.subtitle}</Text>

					<View style={styles.orderIdWrap}>
						<Text style={styles.orderIdLabel}>
							{t("order_number", "Order")}
						</Text>
						<Text style={styles.orderIdValue}>#{resolvedOrderId}</Text>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						{t("pickup_summary", "Pickup Summary")}
					</Text>

					<View style={styles.summaryRow}>
						<Text style={styles.summaryLabel}>
							{t("pickup_location", "Pickup Location")}
						</Text>
						<Text style={styles.summaryValue}>
							{order?.table?.name || "Pickup Window"}
						</Text>
					</View>

					<View style={styles.summaryRow}>
						<Text style={styles.summaryLabel}>{t("items", "Items")}</Text>
						<Text style={styles.summaryValue}>
							{Array.isArray(order?.items) ? order.items.length : 0}
						</Text>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						{t("station_status", "Station Status")}
					</Text>

					<View style={styles.stationGrid}>
						{!!kitchenStatus && (
							<StationStatusCard
								title={t("kitchen", "Kitchen")}
								status={kitchenStatus}
								icon="restaurant-outline"
							/>
						)}

						{!!barStatus && (
							<StationStatusCard
								title={t("bar", "Bar")}
								status={barStatus}
								icon="wine-outline"
							/>
						)}
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						{t("your_order", "Your Order")}
					</Text>

					{Array.isArray(order?.items) &&
						order.items.map((item, index) => (
							<View key={item.id || index} style={styles.itemRow}>
								<Text style={styles.itemName}>
									{item.quantity || 1}x {item.dishName || item.name}
								</Text>
							</View>
						))}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
	},
	content: {
		padding: 16,
		paddingBottom: 40,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
		padding: 24,
	},
	emptyTitle: {
		fontSize: 22,
		fontWeight: "700",
		color: colors.textDark,
		marginTop: 18,
	},
	emptySubtitle: {
		fontSize: 15,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 8,
		lineHeight: 22,
	},
	heroCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 18,
		padding: 22,
		alignItems: "center",
		marginBottom: 16,
	},
	heroIconWrap: {
		width: 72,
		height: 72,
		borderRadius: 36,
		backgroundColor: colors.primary + "12",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 14,
	},
	heroTitle: {
		fontSize: 28,
		fontWeight: "800",
		color: colors.textDark,
		textAlign: "center",
	},
	heroSubtitle: {
		fontSize: 15,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 8,
		lineHeight: 22,
	},
	orderIdWrap: {
		marginTop: 16,
		paddingHorizontal: 14,
		paddingVertical: 10,
		backgroundColor: colors.backgroundMedium,
		borderRadius: 12,
		alignItems: "center",
	},
	orderIdLabel: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		textTransform: "uppercase",
	},
	orderIdValue: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.primary,
		marginTop: 2,
	},
	section: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 16,
		padding: 16,
		marginBottom: 14,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: colors.textDark,
		marginBottom: 12,
	},
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	summaryLabel: {
		fontSize: 15,
		color: colors.textMedium,
	},
	summaryValue: {
		fontSize: 15,
		fontWeight: "700",
		color: colors.textDark,
	},
	stationGrid: {
		flexDirection: "row",
		gap: 10,
	},
	stationCard: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		borderRadius: 14,
		padding: 14,
	},
	stationCardHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 10,
	},
	stationTitle: {
		fontSize: 15,
		fontWeight: "700",
		color: colors.textDark,
		marginLeft: 8,
	},
	statusPill: {
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 999,
		alignSelf: "flex-start",
	},
	statusPillText: {
		fontSize: 13,
		fontWeight: "700",
	},
	itemRow: {
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	itemName: {
		fontSize: 15,
		color: colors.textDark,
		fontWeight: "600",
	},
});

export default PickupOrderStatusScreen;
