import React, { useContext, useEffect, useMemo, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import TableAndServerSelectionModal from "../../components/restaurant/TableAndServerSelectionModal";

const STATUS_LABELS = {
	requested: "Needs review",
	confirmed: "Confirmed",
	arrival_requested: "Arrived",
	seated: "Seated",
};

const TRUST_TONES = {
	"Preferred Guest": "success",
	"Reliable Guest": "success",
	"Confirmation Recommended": "warning",
	"New Guest": "neutral",
};

const getReservationSortKey = (reservation = {}) =>
	`${reservation.requestedDate || ""} ${reservation.requestedTime || ""}`;

const getTrustSnapshot = (reservation = {}) => ({
	completedReservations: Number(
		reservation.customerTrustSnapshot?.completedReservations || 0,
	),
	noShows: Number(reservation.customerTrustSnapshot?.noShows || 0),
	lateCancellations: Number(
		reservation.customerTrustSnapshot?.lateCancellations || 0,
	),
});

const getOperationalCue = (reservation = {}) => {
	const trust = getTrustSnapshot(reservation);
	if (trust.noShows >= 2 || trust.lateCancellations >= 3) {
		return {
			tone: "warning",
			label: "Confirm before holding peak table",
		};
	}
	if (reservation.status === "arrival_requested") {
		return { tone: "success", label: "Guest is here" };
	}
	if (reservation.status === "confirmed") {
		return { tone: "neutral", label: "Ready for arrival" };
	}
	if (reservation.status === "requested") {
		return { tone: "primary", label: "Review request" };
	}
	return { tone: "neutral", label: "Monitor" };
};

const RestaurantReservationsScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;

	const [reservations, setReservations] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [actionId, setActionId] = useState(null);
	const [selectedReservationForSeating, setSelectedReservationForSeating] =
		useState(null);
	const [isSeatingRequest, setIsSeatingRequest] = useState(false);

	useEffect(() => {
		if (!restaurantId) return undefined;

		setIsLoading(true);
		const unsubscribe = db
			.collection("reservations")
			.where("restaurantId", "==", restaurantId)
			.where("status", "in", [
				"requested",
				"confirmed",
				"arrival_requested",
				"seated",
			])
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.sort((a, b) => {
							const aKey = getReservationSortKey(a);
							const bKey = getReservationSortKey(b);
							return aKey.localeCompare(bKey);
						});
					setReservations(rows);
					setIsLoading(false);
				},
				(error) => {
					console.error("Error loading reservations:", error);
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [restaurantId]);

	const requestedReservations = useMemo(
		() =>
			reservations
				.filter((item) => item.status === "requested")
				.sort((a, b) => {
					const aTrust = getTrustSnapshot(a);
					const bTrust = getTrustSnapshot(b);
					const aRisk = aTrust.noShows * 2 + aTrust.lateCancellations;
					const bRisk = bTrust.noShows * 2 + bTrust.lateCancellations;
					if (aRisk !== bRisk) return bRisk - aRisk;
					return getReservationSortKey(a).localeCompare(getReservationSortKey(b));
				}),
		[reservations],
	);
	const activeReservations = useMemo(
		() =>
			reservations
				.filter((item) => item.status !== "requested")
				.sort((a, b) => {
					const priority = {
						arrival_requested: 0,
						confirmed: 1,
						seated: 2,
					};
					const aPriority = priority[a.status] ?? 3;
					const bPriority = priority[b.status] ?? 3;
					if (aPriority !== bPriority) return aPriority - bPriority;
					return getReservationSortKey(a).localeCompare(getReservationSortKey(b));
				}),
		[reservations],
	);
	const pendingCount = requestedReservations.length;
	const confirmedCount = activeReservations.filter(
		(item) => item.status === "confirmed" || item.status === "arrival_requested",
	).length;

	const runReservationAction = async (reservationId, functionName, payload = {}) => {
		setActionId(reservationId);
		try {
			const callable = httpsCallable(functions, functionName);
			await callable({ reservationId, ...payload });
		} catch (error) {
			console.error(`Reservation action failed: ${functionName}`, error);
			Alert.alert("Action failed", error.message || "Please try again.");
		} finally {
			setActionId(null);
		}
	};

	const handleSeatReservation = async ({ table, server }) => {
		if (!selectedReservationForSeating) return;
		setIsSeatingRequest(true);
		setActionId(selectedReservationForSeating.id);

		try {
			const seatReservation = httpsCallable(functions, "seatReservation");
			await seatReservation({
				reservationId: selectedReservationForSeating.id,
				table,
				server,
			});
			setSelectedReservationForSeating(null);
		} catch (error) {
			console.error("Error seating reservation:", error);
			Alert.alert("Could not seat reservation", error.message || "Please try again.");
		} finally {
			setIsSeatingRequest(false);
			setActionId(null);
		}
	};

	const renderReservationCard = (reservation) => {
		const isBusy = actionId === reservation.id;
		const isReadyToSeat =
			reservation.status === "confirmed" ||
			reservation.status === "arrival_requested";
		const isSeated = reservation.status === "seated";
		const trust = getTrustSnapshot(reservation);
		const cue = getOperationalCue(reservation);
		const trustLabel = reservation.customerReliabilityLabel || "New Guest";
		const trustTone = TRUST_TONES[trustLabel] || "neutral";
		const runNoShowAction = () => {
			Alert.alert(
				"Mark no-show?",
				"This will affect the guest's reservation credibility.",
				[
					{ text: "Cancel", style: "cancel" },
					{
						text: "Mark no-show",
						style: "destructive",
						onPress: () =>
							runReservationAction(reservation.id, "updateReservationStatus", {
								status: "no_show",
							}),
					},
				],
			);
		};

		return (
			<View key={reservation.id} style={styles.reservationCard}>
				<View style={styles.reservationTopRow}>
					<View>
						<Text style={styles.guestName}>{reservation.customerName}</Text>
						<Text style={styles.reservationMeta}>
							{reservation.requestedDate} at {reservation.requestedTime} • Party of{" "}
							{reservation.partySize}
						</Text>
					</View>
					<View style={styles.statusStack}>
						<Text style={[styles.statusPill, styles[`status_${reservation.status}`]]}>
							{STATUS_LABELS[reservation.status] || reservation.status}
						</Text>
						<Text style={[styles.cuePill, styles[`cue_${cue.tone}`]]}>
							{cue.label}
						</Text>
					</View>
				</View>
				<View style={[styles.trustBox, styles[`trust_${trustTone}`]]}>
					<View style={styles.trustRow}>
						<Ionicons
							name="shield-checkmark-outline"
							size={15}
							color={
								trustTone === "warning" ? colors.statusWarning : colors.primary
							}
						/>
						<Text style={styles.trustText}>{trustLabel}</Text>
					</View>
					<View style={styles.trustMetricRow}>
						<Text style={styles.trustMetric}>
							{trust.completedReservations} completed
						</Text>
						<Text style={styles.trustMetric}>{trust.noShows} no-shows</Text>
						<Text style={styles.trustMetric}>
							{trust.lateCancellations} late cancels
						</Text>
					</View>
				</View>

				{reservation.occasion ? (
					<Text style={styles.detailText}>Occasion: {reservation.occasion}</Text>
				) : null}
				{reservation.seatingPreference ? (
					<Text style={styles.detailText}>
						Seating: {reservation.seatingPreference}
					</Text>
				) : null}
				{reservation.allergyNotes ? (
					<Text style={styles.detailText}>
						Allergies: {reservation.allergyNotes}
					</Text>
				) : null}
				{reservation.guestNotes ? (
					<Text style={styles.detailText}>Notes: {reservation.guestNotes}</Text>
				) : null}

				{isBusy ? (
					<ActivityIndicator color={colors.primary} style={styles.cardLoader} />
				) : reservation.status === "requested" ? (
					<View style={styles.actionRow}>
						<TouchableOpacity
							style={[styles.actionButton, styles.approveButton]}
							onPress={() =>
								runReservationAction(reservation.id, "approveReservation")
							}
						>
							<Text style={styles.actionButtonText}>Approve</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.actionButton, styles.declineButton]}
							onPress={() =>
								runReservationAction(reservation.id, "declineReservation")
							}
						>
							<Text style={styles.actionButtonText}>Decline</Text>
						</TouchableOpacity>
					</View>
				) : isReadyToSeat ? (
					<View style={styles.actionRow}>
						<TouchableOpacity
							style={[styles.actionButton, styles.approveButton]}
							onPress={() => setSelectedReservationForSeating(reservation)}
						>
							<Text style={styles.actionButtonText}>Assign table</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.secondaryAction}
							onPress={runNoShowAction}
						>
							<Text style={styles.secondaryActionText}>No-show</Text>
						</TouchableOpacity>
					</View>
				) : isSeated ? (
					<View style={styles.actionRow}>
						<TouchableOpacity
							style={styles.secondaryAction}
							onPress={() =>
								runReservationAction(reservation.id, "updateReservationStatus", {
									status: "completed",
								})
							}
						>
							<Text style={styles.secondaryActionText}>Complete</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.secondaryAction}
							onPress={runNoShowAction}
						>
							<Text style={styles.secondaryActionText}>No-show</Text>
						</TouchableOpacity>
					</View>
				) : null}
				{reservation.table?.name ? (
					<Text style={styles.detailText}>Table: {reservation.table.name}</Text>
				) : null}
				{reservation.server?.name ? (
					<Text style={styles.detailText}>Server: {reservation.server.name}</Text>
				) : null}
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.title}>Reservations</Text>
				<Text style={styles.subtitle}>
					Approve reservation requests and manage confirmed reservation guests.
				</Text>

				<View style={styles.statsRow}>
					<View style={styles.statTile}>
						<Text style={styles.statValue}>{pendingCount}</Text>
						<Text style={styles.statLabel}>Requests</Text>
					</View>
					<View style={styles.statTile}>
						<Text style={styles.statValue}>{confirmedCount}</Text>
						<Text style={styles.statLabel}>Confirmed</Text>
					</View>
				</View>

				<Text style={styles.sectionTitle}>Requests</Text>
				{isLoading ? (
					<ActivityIndicator color={colors.primary} />
				) : requestedReservations.length === 0 ? (
					<Text style={styles.emptyText}>No pending requests.</Text>
				) : (
					requestedReservations.map(renderReservationCard)
				)}

				<Text style={styles.sectionTitle}>Confirmed and seated</Text>
				{activeReservations.length === 0 ? (
					<Text style={styles.emptyText}>No active reservations.</Text>
				) : (
					activeReservations.map(renderReservationCard)
				)}
			</ScrollView>
			<TableAndServerSelectionModal
				isVisible={Boolean(selectedReservationForSeating)}
				onClose={() => setSelectedReservationForSeating(null)}
				onConfirm={handleSeatReservation}
				currentRestaurantId={restaurantId}
				numInParty={selectedReservationForSeating?.partySize || 1}
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
		flex: 1,
		minHeight: 76,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
		justifyContent: "center",
		marginRight: 8,
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
	reservationCard: {
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
	reservationTopRow: {
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
	reservationMeta: {
		color: colors.textMedium,
		marginTop: 3,
	},
	statusStack: {
		alignItems: "flex-end",
		maxWidth: 150,
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
	status_requested: { backgroundColor: "#fff7ed", color: "#c2410c" },
	status_confirmed: { backgroundColor: "#eef6ff", color: colors.primary },
	status_arrival_requested: { backgroundColor: "#ecfdf3", color: colors.statusSuccess },
	status_seated: { backgroundColor: "#f5f3ff", color: "#6d28d9" },
	cuePill: {
		fontSize: 10,
		fontWeight: "900",
		paddingHorizontal: 7,
		paddingVertical: 4,
		borderRadius: 8,
		marginTop: 5,
		overflow: "hidden",
		textAlign: "center",
	},
	cue_primary: { backgroundColor: "#eef6ff", color: colors.primary },
	cue_success: { backgroundColor: "#ecfdf3", color: colors.statusSuccess },
	cue_warning: { backgroundColor: "#fff7ed", color: "#c2410c" },
	cue_neutral: { backgroundColor: colors.backgroundLight, color: colors.textMedium },
	trustBox: {
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		padding: 10,
		marginTop: 10,
	},
	trust_success: { backgroundColor: "#ecfdf3", borderColor: "#bbf7d0" },
	trust_warning: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
	trust_neutral: { backgroundColor: colors.backgroundLight },
	trustRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	trustText: {
		color: colors.primary,
		fontWeight: "900",
		fontSize: 12,
		marginLeft: 5,
	},
	trustMetricRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: 8,
	},
	trustMetric: {
		color: colors.textDark,
		fontSize: 11,
		fontWeight: "800",
		marginRight: 10,
		marginBottom: 3,
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
	approveButton: { backgroundColor: colors.statusSuccess || "#16a34a" },
	declineButton: { backgroundColor: colors.statusDanger || "#dc2626" },
	actionButtonText: { color: "#fff", fontWeight: "900" },
	secondaryAction: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 9,
		marginRight: 7,
		marginBottom: 7,
	},
	secondaryActionText: {
		color: colors.textDark,
		fontWeight: "800",
	},
	cardLoader: { marginTop: 12 },
});

export default RestaurantReservationsScreen;
