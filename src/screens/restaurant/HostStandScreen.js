import React, { useContext, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import TableAndServerSelectionModal from "../../components/restaurant/TableAndServerSelectionModal";

const normalizeAssignment = ({ table, server }) => ({
	table: {
		id: table?.id,
		name: table?.name || table?.tableName || table?.label || "Table",
	},
	server: {
		id: server?.id,
		name:
			server?.name ||
			`${server?.firstName || ""} ${server?.lastName || ""}`.trim() ||
			server?.displayName ||
			"Server",
	},
});

const HostStandScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;

	const [checkInRequests, setCheckInRequests] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedCheckInRequest, setSelectedCheckInRequest] = useState(null);
	const [isSeatingRequest, setIsSeatingRequest] = useState(false);

	useEffect(() => {
		if (!restaurantId) return undefined;

		setIsLoading(true);
		const unsubscribe = db
			.collection("checkIns")
			.where("restaurantId", "==", restaurantId)
			.where("status", "==", "REQUESTED")
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.filter((item) =>
							["reservation_arrival", "host_assigned_walk_in"].includes(
								item.type,
							),
						)
						.sort((a, b) => {
							const aTime = a.createdAt?.toMillis?.() || 0;
							const bTime = b.createdAt?.toMillis?.() || 0;
							return aTime - bTime;
						});
					setCheckInRequests(rows);
					setIsLoading(false);
				},
				(error) => {
					console.error("Error loading host check-in requests:", error);
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [restaurantId]);

	const handleSeatCheckInRequest = async ({ table, server }) => {
		if (!selectedCheckInRequest) return;
		setIsSeatingRequest(true);

		try {
			const assignment = normalizeAssignment({ table, server });
			const handleResponse = httpsCallable(functions, "handleCheckInResponse");
			await handleResponse({
				checkInId: selectedCheckInRequest.id,
				action: "ACCEPTED",
				table: assignment.table,
				server: assignment.server,
				customerId: selectedCheckInRequest.customerId,
				restaurantId,
			});
			setSelectedCheckInRequest(null);
		} catch (error) {
			console.error("Error seating check-in request:", error);
			Alert.alert("Could not seat party", error.message || "Please try again.");
		} finally {
			setIsSeatingRequest(false);
		}
	};

	const renderCheckInRequestCard = (request) => {
		const isReservationArrival = request.type === "reservation_arrival";

		return (
			<View key={request.id} style={styles.requestCard}>
				<View style={styles.requestTopRow}>
					<View style={styles.cardTitleBlock}>
						<Text style={styles.guestName}>{request.customerName}</Text>
						<Text style={styles.requestMeta}>
							{isReservationArrival ? "Reservation arrival" : "Walk-in request"} - Party of{" "}
							{request.numberOfPeople || 1}
						</Text>
					</View>
					<Text
						style={[
							styles.statusPill,
							isReservationArrival && styles.statusReservationArrival,
						]}
					>
						{isReservationArrival ? "arrived" : "waiting"}
					</Text>
				</View>

				{/* Hosts need the same guest context here that servers need at the table. */}
				{request.occasion ? (
					<Text style={styles.detailText}>Occasion: {request.occasion}</Text>
				) : null}
				{request.seatingPreference ? (
					<Text style={styles.detailText}>
						Seating: {request.seatingPreference}
					</Text>
				) : null}
				{request.allergyNotes ? (
					<Text style={styles.detailText}>
						Allergies: {request.allergyNotes}
					</Text>
				) : null}
				{request.guestNotes ? (
					<Text style={styles.detailText}>Notes: {request.guestNotes}</Text>
				) : null}

				<View style={styles.actionRow}>
					<TouchableOpacity
						style={[styles.actionButton, styles.seatButton]}
						onPress={() => setSelectedCheckInRequest(request)}
					>
						<Text style={styles.actionButtonText}>Assign table</Text>
					</TouchableOpacity>
				</View>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.title}>Host Stand</Text>
				<Text style={styles.subtitle}>
					Seat walk-ins and reservation arrivals as soon as guests reach the door.
				</Text>

				<View style={styles.statsRow}>
					<View style={styles.statTile}>
						<Text style={styles.statValue}>{checkInRequests.length}</Text>
						<Text style={styles.statLabel}>Waiting</Text>
					</View>
				</View>

				<Text style={styles.sectionTitle}>Waiting to be seated</Text>
				{isLoading ? (
					<ActivityIndicator color={colors.primary} />
				) : checkInRequests.length === 0 ? (
					<Text style={styles.emptyText}>No guests waiting at the host stand.</Text>
				) : (
					checkInRequests.map(renderCheckInRequestCard)
				)}
			</ScrollView>
			<TableAndServerSelectionModal
				isVisible={Boolean(selectedCheckInRequest)}
				onClose={() => setSelectedCheckInRequest(null)}
				onConfirm={handleSeatCheckInRequest}
				currentRestaurantId={restaurantId}
				numInParty={selectedCheckInRequest?.numberOfPeople || 1}
				isProcessing={isSeatingRequest}
			/>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { padding: 18, paddingBottom: 40 },
	title: {
		fontSize: 26,
		fontWeight: "900",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 14,
		color: colors.textMedium,
		marginTop: 4,
		marginBottom: 16,
	},
	statsRow: {
		flexDirection: "row",
		marginBottom: 16,
	},
	statTile: {
		minHeight: 76,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
		justifyContent: "center",
		minWidth: 120,
	},
	statValue: {
		fontSize: 24,
		fontWeight: "900",
		color: colors.primary,
	},
	statLabel: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.textMedium,
		marginTop: 3,
		textTransform: "uppercase",
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 10,
		marginBottom: 10,
	},
	emptyText: {
		color: colors.textMedium,
		marginBottom: 14,
	},
	requestCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 3,
		elevation: 1,
	},
	requestTopRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
	},
	cardTitleBlock: {
		flex: 1,
		paddingRight: 10,
	},
	guestName: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textDark,
	},
	requestMeta: {
		color: colors.textMedium,
		marginTop: 3,
	},
	statusPill: {
		backgroundColor: "#EFF8F8",
		color: colors.primary,
		fontWeight: "900",
		fontSize: 12,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 8,
		textTransform: "capitalize",
		overflow: "hidden",
		textAlign: "center",
	},
	statusReservationArrival: {
		backgroundColor: "#ecfdf3",
		color: colors.statusSuccess,
	},
	detailText: {
		color: colors.textDark,
		marginTop: 8,
		lineHeight: 19,
	},
	actionRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: 14,
	},
	actionButton: {
		flex: 1,
		minHeight: 44,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 8,
	},
	seatButton: { backgroundColor: colors.statusSuccess || "#16a34a" },
	actionButtonText: { color: "#fff", fontWeight: "900" },
});

export default HostStandScreen;
