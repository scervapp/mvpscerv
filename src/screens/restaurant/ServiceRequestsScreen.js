import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
} from "react-native";
import moment from "moment";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "@react-native-firebase/functions";

import colors from "../../utils/styles/appStyles";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { getRestaurantPermissions } from "../../utils/restaurantPermissions";

const getStaffDisplayName = (employee) =>
	employee?.name ||
	`${employee?.firstName || ""} ${employee?.lastName || ""}`.trim();

const getRequestDate = (value) => {
	if (!value) return null;
	if (value.toDate) return value.toDate();
	if (value instanceof Date) return value;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getRequestType = (party) => {
	if (party?.serviceRequestType) return party.serviceRequestType;
	if (party?.customerStatus === "ready_to_pay") return "checkout";
	return "service";
};

const getVisibleRequestsForSession = (requests, activeSession) => {
	if (
		activeSession?.role === "worker" &&
		activeSession?.jobTitle === "server"
	) {
		return requests.filter((party) => party.server?.id === activeSession.id);
	}

	return requests;
};

const ServiceRequestsScreen = ({ navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const [requests, setRequests] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [acknowledgingIds, setAcknowledgingIds] = useState({});
	const insets = useSafeAreaInsets();
	const { t } = useTranslation();
	const permissions = useMemo(
		() => getRestaurantPermissions(activeSession),
		[activeSession],
	);

	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
	const requestPulse = useMemo(
		() => ({
			service: requests.filter((request) => getRequestType(request) === "service")
				.length,
			checkout: requests.filter((request) => getRequestType(request) === "checkout")
				.length,
		}),
		[requests],
	);
	const acknowledgePartyServiceRequestFunction = httpsCallable(
		functions,
		"acknowledgePartyServiceRequest",
	);

	useEffect(() => {
		if (!restaurantId) {
			setIsLoading(false);
			return undefined;
		}

		const unsubscribe = db
			.collection("parties")
			.where("restaurantId", "==", restaurantId)
			.where("serviceRequested", "==", true)
			.onSnapshot(
				(snapshot) => {
					const activeRequests = snapshot.docs
						.map((doc) => ({
							id: doc.id,
							...doc.data(),
						}))
						.filter((party) => party.fulfillmentType !== "hotel_pickup")
						.sort((a, b) => {
							const aDate = getRequestDate(a.serviceRequestedAt);
							const bDate = getRequestDate(b.serviceRequestedAt);
							return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
						});

					setRequests(
						getVisibleRequestsForSession(activeRequests, activeSession),
					);
					setIsLoading(false);
				},
				(error) => {
					console.error("Error fetching service requests:", error);
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [
		activeSession?.id,
		activeSession?.jobTitle,
		activeSession?.role,
		restaurantId,
	]);

	const handleAcknowledge = useCallback(
		async (partyId, tableName) => {
			setAcknowledgingIds((current) => ({ ...current, [partyId]: true }));
			try {
				await acknowledgePartyServiceRequestFunction({
					partyId,
					staffId: activeSession?.id || null,
					staffName: getStaffDisplayName(activeSession),
				});
				console.log(`[Service] Acknowledged request for ${tableName}`);
			} catch (error) {
				console.error("Error clearing service request:", error);
				Alert.alert(
					t("error", "Error"),
					t(
						"could_not_clear_request",
						"Could not clear the request. Please try again.",
					),
				);
			} finally {
				setAcknowledgingIds((current) => {
					const next = { ...current };
					delete next[partyId];
					return next;
				});
			}
		},
		[acknowledgePartyServiceRequestFunction, activeSession, t],
	);

	const handleOpenTable = useCallback(
		(partyId) => {
			navigation.navigate("ManagePartyScreen", { partyId });
		},
		[navigation],
	);

	const renderRequestCard = ({ item }) => {
		const requestDate = getRequestDate(item.serviceRequestedAt);
		const timeWaiting = requestDate
			? moment(requestDate).fromNow()
			: t("just_now", "Just now");
		const tableName = item.serviceTableName || item.table?.name || "A Table";
		const requestType = getRequestType(item);
		const isCheckoutRequest = requestType === "checkout";
		const iconName = isCheckoutRequest ? "cash-register" : "bell-ring";
		const accentColor = isCheckoutRequest
			? colors.statusSuccess
			: colors.statusDanger;
		const requestLabel = isCheckoutRequest
			? t("ready_to_pay", "Ready to Pay")
			: t("service_requested", "Service Requested");
		const guestName = item.hostName || item.customerName || t("guest", "Guest");
		const partySize = Array.isArray(item.guestPips)
			? item.guestPips.length
			: Number(item.partySize || 1);
		const serverName = item.server?.name || t("unassigned", "Unassigned");
		const isAcknowledging = acknowledgingIds[item.id];

		return (
			<TouchableOpacity
				style={[styles.cardContainer, { borderLeftColor: accentColor }]}
				activeOpacity={0.9}
				onPress={() => handleOpenTable(item.id)}
			>
				<View style={styles.cardHeader}>
					<View style={styles.tableInfoRow}>
						<MaterialCommunityIcons
							name={iconName}
							size={26}
							color={accentColor}
							style={styles.cardIcon}
						/>
						<View style={styles.tableTextBlock}>
							<Text style={styles.tableName} numberOfLines={1}>
								{tableName}
							</Text>
							<Text style={[styles.requestLabel, { color: accentColor }]}>
								{requestLabel}
							</Text>
						</View>
					</View>
					<Text style={[styles.timeText, { color: accentColor }]}>
						{timeWaiting}
					</Text>
				</View>

				<View style={styles.detailGrid}>
					<View style={styles.detailPill}>
						<Ionicons name="person" size={15} color={colors.textMedium} />
						<Text style={styles.detailText} numberOfLines={1}>
							{guestName}
						</Text>
					</View>
					<View style={styles.detailPill}>
						<Ionicons name="people" size={15} color={colors.textMedium} />
						<Text style={styles.detailText}>{partySize}</Text>
					</View>
					{!permissions.isServer && (
						<View style={styles.detailPill}>
							<MaterialCommunityIcons
								name="account-tie"
								size={15}
								color={colors.textMedium}
							/>
							<Text style={styles.detailText} numberOfLines={1}>
								{serverName}
							</Text>
						</View>
					)}
				</View>

				<View style={styles.cardActions}>
					<TouchableOpacity
						style={styles.openButton}
						onPress={() => handleOpenTable(item.id)}
					>
						<Ionicons
							name="open-outline"
							size={20}
							color={colors.primary}
							style={styles.buttonIcon}
						/>
						<Text style={styles.openButtonText}>
							{t("open_table", "Open Table")}
						</Text>
					</TouchableOpacity>
					<TouchableOpacity
						disabled={isAcknowledging}
						style={[
							styles.acknowledgeButton,
							{ backgroundColor: accentColor },
							isAcknowledging && styles.disabledButton,
						]}
						onPress={() => handleAcknowledge(item.id, tableName)}
					>
						{isAcknowledging ? (
							<ActivityIndicator size="small" color={colors.surfaceWhite} />
						) : (
							<Ionicons
								name="checkmark-done"
								size={20}
								color={colors.surfaceWhite}
								style={styles.buttonIcon}
							/>
						)}
						<Text style={styles.acknowledgeButtonText}>
							{t("on_my_way", "On My Way")}
						</Text>
					</TouchableOpacity>
				</View>
			</TouchableOpacity>
		);
	};

	if (isLoading) {
		return (
			<View style={styles.centeredContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<View style={[styles.container, { paddingTop: insets.top }]}>
			<View style={styles.headerRow}>
				<View>
					<Text style={styles.eyebrow}>{t("floor_queue", "Floor Queue")}</Text>
					<Text style={styles.heading}>
						{t("service_requests", "Service Requests")}
					</Text>
				</View>
				<View style={styles.badgeContainer}>
					<Text style={styles.badgeText}>{requests.length}</Text>
				</View>
			</View>
			<View style={styles.pulseRow}>
				<View style={styles.pulseTile}>
					<Text style={[styles.pulseValue, { color: colors.statusDanger }]}>
						{requestPulse.service}
					</Text>
					<Text style={styles.pulseLabel}>{t("service", "Service")}</Text>
				</View>
				<View style={styles.pulseTile}>
					<Text style={[styles.pulseValue, { color: colors.statusSuccess }]}>
						{requestPulse.checkout}
					</Text>
					<Text style={styles.pulseLabel}>{t("checkout", "Checkout")}</Text>
				</View>
			</View>

			{requests.length === 0 ? (
				<View style={styles.centeredContainer}>
					<MaterialCommunityIcons
						name="bell-sleep"
						size={64}
						color={colors.textLight}
					/>
					<Text style={styles.emptyText}>
						{t("no_service_requests", "No tables currently need assistance.")}
					</Text>
				</View>
			) : (
				<FlatList
					data={requests}
					keyExtractor={(item) => item.id}
					renderItem={renderRequestCard}
					contentContainerStyle={styles.listContainer}
					removeClippedSubviews
					initialNumToRender={12}
					maxToRenderPerBatch={12}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingTop: 16,
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
	},
	eyebrow: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
		textTransform: "uppercase",
		marginBottom: 3,
	},
	heading: {
		fontSize: 24,
		fontWeight: "900",
		color: colors.textDark,
	},
	badgeContainer: {
		backgroundColor: colors.statusDanger,
		borderRadius: 8,
		minWidth: 34,
		height: 34,
		justifyContent: "center",
		alignItems: "center",
	},
	badgeText: {
		color: colors.surfaceWhite,
		fontSize: 14,
		fontWeight: "900",
	},
	pulseRow: {
		flexDirection: "row",
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 2,
	},
	pulseTile: {
		flex: 1,
		minHeight: 62,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		paddingHorizontal: 12,
		justifyContent: "center",
		marginHorizontal: 4,
	},
	pulseValue: {
		fontSize: 22,
		fontWeight: "900",
	},
	pulseLabel: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.textMedium,
		textTransform: "uppercase",
		marginTop: 2,
	},
	emptyText: {
		fontSize: 18,
		color: colors.textMedium,
		marginTop: 15,
		textAlign: "center",
	},
	listContainer: {
		padding: 14,
	},
	cardContainer: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		padding: 13,
		marginBottom: 10,
		borderLeftWidth: 5,
		borderLeftColor: colors.statusDanger,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.04,
		shadowRadius: 3,
		elevation: 1,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	cardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 14,
	},
	tableInfoRow: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		minWidth: 0,
	},
	cardIcon: { marginRight: 10 },
	tableTextBlock: { flex: 1, minWidth: 0 },
	tableName: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.textDark,
	},
	requestLabel: {
		fontSize: 13,
		fontWeight: "800",
		marginTop: 2,
	},
	timeText: {
		fontSize: 14,
		fontWeight: "800",
		marginLeft: 10,
	},
	detailGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: 14,
	},
	detailPill: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#F8FAFC",
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 5,
		marginRight: 8,
		marginBottom: 8,
		maxWidth: "100%",
	},
	detailText: {
		color: colors.textMedium,
		fontSize: 13,
		fontWeight: "700",
		marginLeft: 5,
	},
	cardActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 12,
	},
	openButton: {
		flexDirection: "row",
		backgroundColor: "#EFF6FF",
		paddingVertical: 9,
		paddingHorizontal: 13,
		borderRadius: 8,
		alignItems: "center",
		marginRight: 10,
	},
	openButtonText: {
		color: colors.primary,
		fontSize: 15,
		fontWeight: "900",
	},
	acknowledgeButton: {
		flexDirection: "row",
		backgroundColor: colors.statusSuccess,
		paddingVertical: 9,
		paddingHorizontal: 13,
		borderRadius: 8,
		alignItems: "center",
	},
	disabledButton: { opacity: 0.75 },
	buttonIcon: { marginRight: 6 },
	acknowledgeButtonText: {
		color: colors.surfaceWhite,
		fontSize: 15,
		fontWeight: "900",
	},
});

export default ServiceRequestsScreen;
