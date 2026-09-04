import React, { useContext, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Modal,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
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

const extractTimeFromWindow = (value = "") => {
	const match = String(value).match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
	return match ? match[0] : "";
};

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
	const [waitlistEntries, setWaitlistEntries] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(true);
	const [actionId, setActionId] = useState(null);
	const [selectedReservationForSeating, setSelectedReservationForSeating] =
		useState(null);
	const [isSeatingRequest, setIsSeatingRequest] = useState(false);
	const [selectedWaitlistGroup, setSelectedWaitlistGroup] = useState(null);
	const [waitlistOfferTime, setWaitlistOfferTime] = useState("");
	const [isOfferingWaitlistSlot, setIsOfferingWaitlistSlot] = useState(false);

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

	useEffect(() => {
		if (!restaurantId) return undefined;

		setIsLoadingWaitlist(true);
		const unsubscribe = db
			.collection("reservationWaitlist")
			.where("restaurantId", "==", restaurantId)
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.sort((a, b) => {
							const aTime = a.createdAt?.toMillis?.() || 0;
							const bTime = b.createdAt?.toMillis?.() || 0;
							if (aTime !== bTime) return aTime - bTime;
							return a.id.localeCompare(b.id);
						});
					setWaitlistEntries(rows);
					setIsLoadingWaitlist(false);
				},
				(error) => {
					console.error("Error loading reservation waitlist:", error);
					setIsLoadingWaitlist(false);
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
	const activeWaitlistEntries = useMemo(
		() =>
			waitlistEntries.filter((entry) =>
				["waiting", "offer_pending"].includes(entry.status),
			),
		[waitlistEntries],
	);
	const waitlistDemandGroups = useMemo(() => {
		const groups = new Map();
		activeWaitlistEntries.forEach((entry) => {
			const windowLabel = entry.preferredTimeWindow || "Any time";
			const key = `${entry.requestedDate || "Date TBD"}|${windowLabel}`;
			const existing = groups.get(key) || {
				key,
				date: entry.requestedDate || "Date TBD",
				windowLabel,
				count: 0,
				covers: 0,
				offers: 0,
				entries: [],
			};
			existing.count += 1;
			existing.covers += Number(entry.partySize || 1);
			if (entry.status === "offer_pending") existing.offers += 1;
			existing.entries.push(entry);
			groups.set(key, existing);
		});
		return Array.from(groups.values()).sort((a, b) => {
			if (a.date !== b.date) return a.date.localeCompare(b.date);
			return b.covers - a.covers;
		});
	}, [activeWaitlistEntries]);

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

	const openWaitlistOfferModal = (group) => {
		setSelectedWaitlistGroup(group);
		setWaitlistOfferTime(extractTimeFromWindow(group.windowLabel));
	};

	const closeWaitlistOfferModal = () => {
		if (isOfferingWaitlistSlot) return;
		setSelectedWaitlistGroup(null);
		setWaitlistOfferTime("");
	};

	const handleOfferWaitlistSlot = async () => {
		if (!selectedWaitlistGroup) return;
		if (!/^\d{2}:\d{2}$/.test(waitlistOfferTime)) {
			Alert.alert("Time required", "Enter the offer time as HH:MM.");
			return;
		}

		setIsOfferingWaitlistSlot(true);
		try {
			const offerSlot = httpsCallable(functions, "restaurantOfferWaitlistSlot");
			const result = await offerSlot({
				restaurantId,
				date: selectedWaitlistGroup.date,
				time: waitlistOfferTime,
				preferredTimeWindow:
					selectedWaitlistGroup.windowLabel === "Any time"
						? ""
						: selectedWaitlistGroup.windowLabel,
			});
			const offeredGuest = result?.data?.customerName || "the next guest";
			Alert.alert(
				"Offer sent",
				`${offeredGuest} has 10 minutes to confirm this reservation.`,
			);
			setSelectedWaitlistGroup(null);
			setWaitlistOfferTime("");
		} catch (error) {
			console.error("Waitlist offer failed:", error);
			Alert.alert("Could not send offer", error.message || "Please try again.");
		} finally {
			setIsOfferingWaitlistSlot(false);
		}
	};

	const renderWaitlistDemandGroup = (group) => {
		const shouldOpenCapacity = group.count >= 3 || group.covers >= 8;
		const topEntries = group.entries.slice(0, 3);

		return (
			<View key={group.key} style={styles.waitlistCard}>
				<View style={styles.waitlistTopRow}>
					<View style={styles.cardTitleBlock}>
						<Text style={styles.waitlistTitle}>{group.date}</Text>
						<Text style={styles.reservationMeta}>{group.windowLabel}</Text>
					</View>
					<View
						style={[
							styles.waitlistCue,
							shouldOpenCapacity && styles.waitlistCueHot,
						]}
					>
						<Text
							style={[
								styles.waitlistCueText,
								shouldOpenCapacity && styles.waitlistCueTextHot,
							]}
						>
							{shouldOpenCapacity ? "Add capacity?" : "Monitor"}
						</Text>
					</View>
				</View>
				<View style={styles.waitlistMetricRow}>
					<View style={styles.waitlistMetric}>
						<Text style={styles.waitlistMetricValue}>{group.count}</Text>
						<Text style={styles.waitlistMetricLabel}>parties</Text>
					</View>
					<View style={styles.waitlistMetric}>
						<Text style={styles.waitlistMetricValue}>{group.covers}</Text>
						<Text style={styles.waitlistMetricLabel}>covers</Text>
					</View>
					<View style={styles.waitlistMetric}>
						<Text style={styles.waitlistMetricValue}>{group.offers}</Text>
						<Text style={styles.waitlistMetricLabel}>offers out</Text>
					</View>
				</View>
				{topEntries.map((entry) => (
					<View key={entry.id} style={styles.waitlistGuestRow}>
						<Text style={styles.waitlistGuestName} numberOfLines={1}>
							#{entry.queuePosition || "-"} {entry.customerName || "Guest"}
						</Text>
						<Text style={styles.waitlistGuestMeta}>
							Party of {entry.partySize || 1} -{" "}
							{entry.customerReliabilityLabel || "New Guest"}
						</Text>
					</View>
				))}
				{group.entries.length > topEntries.length ? (
					<Text style={styles.waitlistMoreText}>
						+{group.entries.length - topEntries.length} more waiting
					</Text>
				) : null}
				<TouchableOpacity
					style={styles.waitlistOfferButton}
					onPress={() => openWaitlistOfferModal(group)}
				>
					<Ionicons name="ticket-outline" size={17} color={colors.primary} />
					<Text style={styles.waitlistOfferButtonText}>Offer slot</Text>
				</TouchableOpacity>
			</View>
		);
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
				{reservation.partyId ? (
					<View style={styles.linkedPartyBadge}>
						<Ionicons name="people-outline" size={15} color={colors.primary} />
						<Text style={styles.linkedPartyText}>Linked table order</Text>
					</View>
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
					Approve requests, seat arrivals, and watch waitlist demand.
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

				<Text style={styles.sectionTitle}>Waitlist demand</Text>
				{isLoadingWaitlist ? (
					<ActivityIndicator color={colors.primary} />
				) : waitlistDemandGroups.length === 0 ? (
					<Text style={styles.emptyText}>No active waitlist demand.</Text>
				) : (
					waitlistDemandGroups.map(renderWaitlistDemandGroup)
				)}

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
			<Modal
				visible={Boolean(selectedWaitlistGroup)}
				transparent
				animationType="fade"
				onRequestClose={closeWaitlistOfferModal}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.offerModal}>
						<Text style={styles.offerModalTitle}>Offer waitlist slot</Text>
						<Text style={styles.offerModalMeta}>
							{selectedWaitlistGroup?.date} -{" "}
							{selectedWaitlistGroup?.windowLabel || "Any time"}
						</Text>
						<Text style={styles.offerModalHelp}>
							Enter the exact time to offer the top eligible guest.
						</Text>
						<TextInput
							value={waitlistOfferTime}
							onChangeText={setWaitlistOfferTime}
							style={styles.offerInput}
							placeholder="HH:MM"
							placeholderTextColor={colors.textLight}
							keyboardType="numbers-and-punctuation"
							maxLength={5}
						/>
						<View style={styles.offerModalActions}>
							<TouchableOpacity
								style={styles.offerCancelButton}
								onPress={closeWaitlistOfferModal}
								disabled={isOfferingWaitlistSlot}
							>
								<Text style={styles.offerCancelText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.offerConfirmButton}
								onPress={handleOfferWaitlistSlot}
								disabled={isOfferingWaitlistSlot}
							>
								{isOfferingWaitlistSlot ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.offerConfirmText}>Send offer</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
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
	waitlistCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 12,
	},
	waitlistTopRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
	},
	waitlistTitle: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textDark,
	},
	waitlistCue: {
		borderRadius: 8,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 8,
		paddingVertical: 5,
	},
	waitlistCueHot: {
		backgroundColor: "#fff7ed",
	},
	waitlistCueText: {
		color: colors.textMedium,
		fontSize: 11,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	waitlistCueTextHot: {
		color: "#c2410c",
	},
	waitlistMetricRow: {
		flexDirection: "row",
		marginTop: 12,
		marginBottom: 8,
	},
	waitlistMetric: {
		flex: 1,
		borderRadius: 8,
		backgroundColor: colors.backgroundLight,
		padding: 10,
		marginRight: 8,
	},
	waitlistMetricValue: {
		fontSize: 18,
		fontWeight: "900",
		color: colors.primary,
	},
	waitlistMetricLabel: {
		fontSize: 10,
		fontWeight: "900",
		color: colors.textMedium,
		textTransform: "uppercase",
		marginTop: 2,
	},
	waitlistGuestRow: {
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 8,
		marginTop: 8,
	},
	waitlistGuestName: {
		color: colors.textDark,
		fontWeight: "900",
	},
	waitlistGuestMeta: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "700",
		marginTop: 2,
	},
	waitlistMoreText: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: "900",
		marginTop: 8,
	},
	waitlistOfferButton: {
		minHeight: 42,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.primary,
		backgroundColor: colors.primary + "10",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginTop: 12,
	},
	waitlistOfferButtonText: {
		color: colors.primary,
		fontWeight: "900",
		marginLeft: 6,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.45)",
		justifyContent: "center",
		padding: 20,
	},
	offerModal: {
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		padding: 18,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	offerModalTitle: {
		fontSize: 19,
		fontWeight: "900",
		color: colors.textDark,
	},
	offerModalMeta: {
		color: colors.primary,
		fontWeight: "900",
		marginTop: 5,
	},
	offerModalHelp: {
		color: colors.textMedium,
		fontWeight: "700",
		marginTop: 10,
		lineHeight: 19,
	},
	offerInput: {
		minHeight: 50,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 12,
		color: colors.textDark,
		fontSize: 16,
		fontWeight: "900",
		marginTop: 14,
	},
	offerModalActions: {
		flexDirection: "row",
		marginTop: 16,
	},
	offerCancelButton: {
		flex: 1,
		minHeight: 44,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 8,
	},
	offerCancelText: {
		color: colors.textDark,
		fontWeight: "900",
	},
	offerConfirmButton: {
		flex: 1,
		minHeight: 44,
		borderRadius: 8,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	offerConfirmText: {
		color: "#fff",
		fontWeight: "900",
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
	linkedPartyBadge: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		marginTop: 10,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.primary + "30",
		backgroundColor: colors.primary + "10",
		paddingHorizontal: 9,
		paddingVertical: 6,
	},
	linkedPartyText: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: "900",
		marginLeft: 5,
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
