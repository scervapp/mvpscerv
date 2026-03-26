import React, { useEffect, useState, useContext } from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
	Alert,
} from "react-native";
import moment from "moment";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import colors from "../../utils/styles/appStyles";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";

const ServiceRequestsScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [requests, setRequests] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const insets = useSafeAreaInsets();
	const { t } = useTranslation();

	const restaurantId = currentUserData?.uid;

	// --- 1. Real-Time Listener for Service Requests ---
	useEffect(() => {
		if (!restaurantId) {
			setIsLoading(false);
			return;
		}

		const unsubscribe = db
			.collection("parties")
			.where("restaurantId", "==", restaurantId)
			.where("serviceRequested", "==", true) // 🚨 Only fetch tables needing help
			.orderBy("serviceRequestedAt", "asc") // Oldest requests at the top
			.onSnapshot(
				(snapshot) => {
					const activeRequests = snapshot.docs.map((doc) => ({
						id: doc.id,
						...doc.data(),
					}));
					setRequests(activeRequests);
					setIsLoading(false);
				},
				(error) => {
					console.error("Error fetching service requests:", error);
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [restaurantId]);

	// --- 2. The Resolve Action ---
	const handleAcknowledge = async (partyId, tableName) => {
		try {
			// 🚨 Flipping this to false instantly removes it from the list and clears the badge!
			await db.collection("parties").doc(partyId).update({
				serviceRequested: false,
			});
			console.log(`[Service] Cleared request for ${tableName}`);
		} catch (error) {
			console.error("Error clearing service request:", error);
			Alert.alert(
				t("error", "Error"),
				t(
					"could_not_clear_request",
					"Could not clear the request. Please try again.",
				),
			);
		}
	};

	// --- 3. UI Components ---
	const renderRequestCard = ({ item }) => {
		const timeWaiting = moment(item.serviceRequestedAt).fromNow();
		const tableName = item.serviceTableName || item.table?.name || "A Table";

		// 🚨 NEW: Check if this is a checkout request
		const isCheckoutRequest = item.customerStatus === "ready_to_pay";

		return (
			<View
				style={[
					styles.cardContainer,
					isCheckoutRequest && { borderLeftColor: colors.statusSuccess },
				]}
			>
				<View style={styles.cardHeader}>
					<View style={styles.tableInfoRow}>
						<MaterialCommunityIcons
							// Change icon based on type
							name={isCheckoutRequest ? "cash-register" : "bell-ring"}
							size={24}
							color={
								isCheckoutRequest ? colors.statusSuccess : colors.statusDanger
							}
							style={{ marginRight: 8 }}
						/>
						<Text style={styles.tableName}>{tableName}</Text>
					</View>
					<Text
						style={[
							styles.timeText,
							isCheckoutRequest && { color: colors.statusSuccess },
						]}
					>
						{timeWaiting}
					</Text>
				</View>

				{/* 🚨 NEW: Show a clear label so the server knows what they want */}
				{isCheckoutRequest && (
					<Text
						style={{
							fontSize: 16,
							fontWeight: "bold",
							color: colors.statusSuccess,
							marginBottom: 15,
							paddingLeft: 32,
						}}
					>
						{t("ready_to_pay", "Ready to Pay / Needs Check")}
					</Text>
				)}

				<View style={styles.cardActions}>
					<TouchableOpacity
						style={styles.acknowledgeButton}
						onPress={() =>
							handleAcknowledge(item.id, tableName, isCheckoutRequest)
						}
					>
						<Ionicons
							name="checkmark-done"
							size={20}
							color={colors.surfaceWhite}
							style={{ marginRight: 6 }}
						/>
						<Text style={styles.acknowledgeButtonText}>
							{t("acknowledge", "Acknowledge")}
						</Text>
					</TouchableOpacity>
				</View>
			</View>
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
				<Text style={styles.heading}>
					{t("service_requests", "Service Requests")}
				</Text>
				<View style={styles.badgeContainer}>
					<Text style={styles.badgeText}>{requests.length}</Text>
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
		paddingHorizontal: 20,
		paddingBottom: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
	},
	heading: {
		fontSize: 28,
		fontWeight: "bold",
		color: colors.textDark,
		marginRight: 10,
	},
	badgeContainer: {
		backgroundColor: colors.statusDanger,
		borderRadius: 12,
		paddingHorizontal: 10,
		paddingVertical: 2,
		justifyContent: "center",
		alignItems: "center",
	},
	badgeText: {
		color: colors.surfaceWhite,
		fontSize: 14,
		fontWeight: "bold",
	},
	emptyText: {
		fontSize: 18,
		color: colors.textMedium,
		marginTop: 15,
		textAlign: "center",
	},
	listContainer: {
		padding: 15,
	},
	cardContainer: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		marginBottom: 15,
		borderLeftWidth: 6,
		borderLeftColor: colors.statusDanger,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	cardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 15,
	},
	tableInfoRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	tableName: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
	},
	timeText: {
		fontSize: 14,
		color: colors.statusDanger,
		fontWeight: "600",
	},
	cardActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 12,
	},
	acknowledgeButton: {
		flexDirection: "row",
		backgroundColor: colors.statusSuccess,
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
		alignItems: "center",
	},
	acknowledgeButtonText: {
		color: colors.surfaceWhite,
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default ServiceRequestsScreen;
