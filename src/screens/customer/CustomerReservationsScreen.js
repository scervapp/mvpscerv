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
import { useNavigation } from "@react-navigation/native";

import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { useParty } from "../../context/customer/PartyContext";

const ACTIVE_CANCELABLE_STATUSES = ["requested", "confirmed", "arrival_requested"];

const statusLabels = {
	requested: "Requested",
	confirmed: "Confirmed",
	arrival_requested: "Arrival requested",
	seated: "Seated",
	completed: "Completed",
	cancelled: "Cancelled",
	declined: "Declined",
	no_show: "No show",
};

const getSortKey = (reservation = {}) =>
	`${reservation.requestedDate || ""} ${reservation.requestedTime || ""}`;

const CustomerReservationsScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const navigation = useNavigation();
	const { currentPartyIds, partyDetails } = useParty();
	const [reservations, setReservations] = useState([]);
	const [waitlistEntries, setWaitlistEntries] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(true);
	const [actionId, setActionId] = useState(null);

	useEffect(() => {
		if (!currentUserData?.uid) {
			setReservations([]);
			setIsLoading(false);
			return undefined;
		}

		setIsLoading(true);
		const unsubscribe = db
			.collection("reservations")
			.where("customerId", "==", currentUserData.uid)
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.sort((a, b) => getSortKey(b).localeCompare(getSortKey(a)));
					setReservations(rows);
					setIsLoading(false);
				},
				(error) => {
					console.error("Error loading customer reservations:", error);
					Alert.alert("Could not load reservations", error.message);
					setIsLoading(false);
				},
			);

		return () => unsubscribe();
	}, [currentUserData?.uid]);

	useEffect(() => {
		if (!currentUserData?.uid) {
			setWaitlistEntries([]);
			setIsLoadingWaitlist(false);
			return undefined;
		}

		setIsLoadingWaitlist(true);
		const unsubscribe = db
			.collection("reservationWaitlist")
			.where("customerId", "==", currentUserData.uid)
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.sort((a, b) => {
							const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
							const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
							return bTime - aTime;
						});
					setWaitlistEntries(rows);
					setIsLoadingWaitlist(false);
				},
				(error) => {
					console.error("Error loading customer waitlist:", error);
					setIsLoadingWaitlist(false);
				},
			);

		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const groupedReservations = useMemo(() => {
		const active = [];
		const history = [];

		reservations.forEach((reservation) => {
			const linkedParty = reservation.partyId
				? partyDetails?.[reservation.partyId] || null
				: null;
			const linkedPartyIsClosed = ["checkedOut", "completed"].includes(
				linkedParty?.status,
			);

			if (
				!linkedPartyIsClosed &&
				["requested", "confirmed", "arrival_requested", "seated"].includes(
					reservation.status,
				)
			) {
				active.push(reservation);
			} else {
				history.push(reservation);
			}
		});

		return { active, history };
	}, [partyDetails, reservations]);

	const activeWaitlistEntries = useMemo(
		() =>
			waitlistEntries.filter((entry) =>
				["waiting", "offer_pending"].includes(entry.status),
			),
		[waitlistEntries],
	);

	const handleCancelReservation = (reservation) => {
		Alert.alert(
			"Cancel reservation",
			`Cancel your reservation at ${reservation.restaurantName || "this restaurant"}?`,
			[
				{ text: "Keep", style: "cancel" },
				{
					text: "Cancel reservation",
					style: "destructive",
					onPress: async () => {
						setActionId(reservation.id);
						try {
							const cancelReservation = httpsCallable(
								functions,
								"cancelCustomerReservation",
							);
							await cancelReservation({ reservationId: reservation.id });
						} catch (error) {
							console.error("Error cancelling reservation:", error);
							Alert.alert(
								"Could not cancel",
								error.message || "Please try again.",
							);
						} finally {
							setActionId(null);
						}
					},
				},
			],
		);
	};

	const getRestaurantParty = (reservation) => {
		const partyId =
			reservation.partyId || currentPartyIds?.[reservation.restaurantId]?.dineIn || null;
		const party = partyId ? partyDetails?.[partyId] : null;
		if (reservation.partyId && !party) {
			return { partyId: reservation.partyId, party: null };
		}
		if (!party || party.hostUserId !== currentUserData?.uid) return null;
		if (!["pending", "AWAITING_TABLE", "active"].includes(party.status)) {
			return null;
		}
		return { partyId, party };
	};

	const openParty = (partyId) => {
		if (!partyId) return;
		navigation.navigate("PartyTab", {
			screen: "PartySession",
			params: { partyId },
		});
	};

	const handleCreateReservationParty = async (reservation) => {
		if (reservation.partyId) {
			openParty(reservation.partyId);
			return;
		}

		setActionId(reservation.id);
		try {
			const createReservationParty = httpsCallable(
				functions,
				"createReservationParty",
			);
			const result = await createReservationParty({
				reservationId: reservation.id,
			});
			const partyId = result?.data?.partyId;
			if (!partyId) {
				throw new Error("The reservation party could not be created.");
			}
			openParty(partyId);
		} catch (error) {
			console.error("Error creating reservation party:", error);
			Alert.alert(
				"Could not create party",
				error.message || "Please try again.",
			);
		} finally {
			setActionId(null);
		}
	};

	const submitArrivalRequest = async (reservation, partyContext = null) => {
		setActionId(reservation.id);
		try {
			const createRequest = httpsCallable(functions, "createHostCheckInRequest");
			const partySize = partyContext
				? Math.max(
						1,
						partyContext.party?.guestPips?.length ||
							partyContext.party?.guestUserIds?.length ||
							reservation.partySize ||
							1,
					)
				: reservation.partySize || 1;

			await createRequest({
				restaurantId: reservation.restaurantId,
				reservationId: reservation.id,
				partyId: partyContext?.partyId || null,
				numberOfPeople: partySize,
				customerName:
					reservation.customerName ||
					`${currentUserData?.firstName || ""} ${
						currentUserData?.lastName || ""
					}`.trim() ||
					"Guest",
				occasion: reservation.occasion || "",
				seatingPreference: reservation.seatingPreference || "",
				allergyNotes: reservation.allergyNotes || "",
				guestNotes: reservation.guestNotes || "",
			});

			Alert.alert(
				"Arrival sent",
				"The host knows you're here and can seat you.",
			);
		} catch (error) {
			console.error("Error requesting reservation arrival:", error);
			Alert.alert("Could not check in", error.message || "Please try again.");
		} finally {
			setActionId(null);
		}
	};

	const handleRequestArrival = (reservation) => {
		const partyContext = getRestaurantParty(reservation);
		if (!partyContext) {
			submitArrivalRequest(reservation);
			return;
		}

		Alert.alert(
			"Bring your party?",
			"Do you want the host to seat everyone in your party?",
			[
				{ text: "Just me", onPress: () => submitArrivalRequest(reservation) },
				{
					text: "Bring everyone",
					onPress: () => submitArrivalRequest(reservation, partyContext),
				},
				{ text: "Cancel", style: "cancel" },
			],
		);
	};

	const runWaitlistAction = async (entry, functionName) => {
		setActionId(entry.id);
		try {
			const callable = httpsCallable(functions, functionName);
			await callable({ waitlistId: entry.id });
			if (functionName === "acceptWaitlistOffer") {
				Alert.alert("Reservation confirmed", "Your waitlist spot is booked.");
			}
		} catch (error) {
			console.error(`Waitlist action failed: ${functionName}`, error);
			Alert.alert("Action failed", error.message || "Please try again.");
		} finally {
			setActionId(null);
		}
	};

	const renderWaitlistEntry = (entry) => {
		const isOffer = entry.status === "offer_pending";
		const isBusy = actionId === entry.id;

		return (
			<View key={entry.id} style={styles.card}>
				<View style={styles.cardHeader}>
					<View style={styles.cardTitleWrap}>
						<Text style={styles.restaurantName} numberOfLines={1}>
							{entry.restaurantName || "Restaurant"}
						</Text>
						<Text style={styles.reservationMeta}>
							{entry.requestedDate}
							{entry.offeredTime ? ` at ${entry.offeredTime}` : ""}
						</Text>
						<Text style={styles.reservationMeta}>
							Party of {entry.partySize || 1}
						</Text>
						{entry.preferredTimeWindow ? (
							<Text style={styles.reservationMeta}>
								Preferred: {entry.preferredTimeWindow}
							</Text>
						) : null}
					</View>
					<View style={styles.statusPill}>
						<Text style={styles.statusText}>
							{isOffer ? "Offer" : "Waitlist"}
						</Text>
					</View>
				</View>

				{isOffer ? (
					<Text style={styles.detailText}>
						A spot opened. Confirm before the offer expires.
					</Text>
				) : (
					<View style={styles.queueNotice}>
						<Ionicons
							name="people-outline"
							size={17}
							color={colors.primary}
						/>
						<Text style={styles.queueNoticeText}>
							{entry.queuePosition && entry.queueTotal
								? `You're #${entry.queuePosition} of ${entry.queueTotal} on this waitlist.`
								: "You're on the waitlist. We'll let you know if a time opens."}
						</Text>
					</View>
				)}

				{isOffer ? (
					<View style={styles.offerActionRow}>
						<TouchableOpacity
							style={[styles.offerButton, styles.acceptOfferButton]}
							onPress={() => runWaitlistAction(entry, "acceptWaitlistOffer")}
							disabled={isBusy}
						>
							<Text style={styles.offerButtonText}>Accept</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.offerButton, styles.passOfferButton]}
							onPress={() => runWaitlistAction(entry, "passWaitlistOffer")}
							disabled={isBusy}
						>
							<Text style={styles.passOfferButtonText}>Pass</Text>
						</TouchableOpacity>
					</View>
				) : null}
			</View>
		);
	};

	const renderReservation = (reservation) => {
		const canCancel = ACTIVE_CANCELABLE_STATUSES.includes(reservation.status);
		const isBusy = actionId === reservation.id;
		const canRequestArrival = reservation.status === "confirmed";
		const isWaitingForHost = reservation.status === "arrival_requested";
		const hasLinkedParty = Boolean(reservation.partyId);
		const canPlanParty =
			["confirmed", "arrival_requested"].includes(reservation.status) ||
			(reservation.status === "seated" && hasLinkedParty);

		return (
			<View key={reservation.id} style={styles.card}>
				<View style={styles.cardHeader}>
					<View style={styles.cardTitleWrap}>
						<Text style={styles.restaurantName} numberOfLines={1}>
							{reservation.restaurantName || "Restaurant"}
						</Text>
						<Text style={styles.reservationMeta}>
							{reservation.requestedDate} at {reservation.requestedTime}
						</Text>
						<Text style={styles.reservationMeta}>
							Party of {reservation.partySize || 1}
						</Text>
					</View>
					<View style={styles.statusPill}>
						<Text style={styles.statusText}>
							{statusLabels[reservation.status] || reservation.status || "Status"}
						</Text>
					</View>
				</View>

				{reservation.occasion ? (
					<Text style={styles.detailText}>Occasion: {reservation.occasion}</Text>
				) : null}
				{reservation.guestNotes ? (
					<Text style={styles.detailText}>Notes: {reservation.guestNotes}</Text>
				) : null}
				{reservation.table?.name ? (
					<Text style={styles.detailText}>Table: {reservation.table.name}</Text>
				) : null}
				{reservation.server?.name ? (
					<Text style={styles.detailText}>Server: {reservation.server.name}</Text>
				) : null}

				{canPlanParty ? (
					<TouchableOpacity
						style={styles.partyButton}
						onPress={() => handleCreateReservationParty(reservation)}
						disabled={isBusy}
					>
						{isBusy ? (
							<ActivityIndicator size="small" color={colors.primary} />
						) : (
							<>
								<Ionicons
									name={hasLinkedParty ? "people" : "people-outline"}
									size={18}
									color={colors.primary}
								/>
								<Text style={styles.partyButtonText}>
									{hasLinkedParty
										? reservation.status === "seated"
											? "Open table"
											: "Open party"
										: "Invite guests"}
								</Text>
							</>
						)}
					</TouchableOpacity>
				) : null}

				{canRequestArrival ? (
					<TouchableOpacity
						style={styles.arrivalButton}
						onPress={() => handleRequestArrival(reservation)}
						disabled={isBusy}
					>
						{isBusy ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<>
								<Ionicons name="walk-outline" size={18} color="#fff" />
								<Text style={styles.arrivalButtonText}>I'm here</Text>
							</>
						)}
					</TouchableOpacity>
				) : null}

				{isWaitingForHost ? (
					<View style={styles.waitingNotice}>
						<Ionicons
							name="time-outline"
							size={17}
							color={colors.textMedium}
						/>
						<Text style={styles.waitingNoticeText}>
							The host will seat you soon.
						</Text>
					</View>
				) : null}

				{canCancel ? (
					<TouchableOpacity
						style={styles.cancelButton}
						onPress={() => handleCancelReservation(reservation)}
						disabled={isBusy}
					>
						{isBusy ? (
							<ActivityIndicator size="small" color={colors.statusDanger} />
						) : (
							<>
								<Ionicons
									name="close-circle-outline"
									size={18}
									color={colors.statusDanger}
								/>
								<Text style={styles.cancelButtonText}>
									Cancel reservation
								</Text>
							</>
						)}
					</TouchableOpacity>
				) : null}
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.title}>My Reservations</Text>
				<Text style={styles.subtitle}>
					View upcoming reservations, waitlist offers, and arrival status.
				</Text>

				{isLoading ? (
					<ActivityIndicator color={colors.primary} style={styles.loader} />
				) : (
					<>
						<Text style={styles.sectionTitle}>Upcoming</Text>
						{groupedReservations.active.length > 0 ? (
							groupedReservations.active.map(renderReservation)
						) : (
							<Text style={styles.emptyText}>
								No upcoming reservations yet.
							</Text>
						)}

						<Text style={styles.sectionTitle}>Waitlist</Text>
						{isLoadingWaitlist ? (
							<ActivityIndicator color={colors.primary} />
						) : activeWaitlistEntries.length > 0 ? (
							activeWaitlistEntries.map(renderWaitlistEntry)
						) : (
							<Text style={styles.emptyText}>No active waitlist spots.</Text>
						)}

						<Text style={styles.sectionTitle}>History</Text>
						{groupedReservations.history.length > 0 ? (
							groupedReservations.history.map(renderReservation)
						) : (
							<Text style={styles.emptyText}>No reservation history.</Text>
						)}
					</>
				)}
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { padding: 20, paddingBottom: 36 },
	title: {
		fontSize: 26,
		fontWeight: "900",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 14,
		color: colors.textMedium,
		marginTop: 4,
		marginBottom: 18,
	},
	loader: { marginTop: 40 },
	sectionTitle: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 18,
		marginBottom: 10,
	},
	card: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
		marginBottom: 12,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
	},
	cardTitleWrap: { flex: 1, paddingRight: 10 },
	restaurantName: {
		fontSize: 17,
		fontWeight: "900",
		color: colors.textDark,
	},
	reservationMeta: {
		fontSize: 13,
		color: colors.textMedium,
		marginTop: 3,
		fontWeight: "700",
	},
	statusPill: {
		borderRadius: 999,
		paddingHorizontal: 9,
		paddingVertical: 5,
		backgroundColor: colors.primary + "15",
	},
	statusText: {
		color: colors.primary,
		fontSize: 11,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	detailText: {
		color: colors.textMedium,
		fontSize: 13,
		marginTop: 8,
		lineHeight: 18,
	},
	arrivalButton: {
		marginTop: 12,
		minHeight: 42,
		borderRadius: 8,
		backgroundColor: colors.primary,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	arrivalButtonText: {
		color: "#fff",
		fontWeight: "900",
		marginLeft: 6,
	},
	partyButton: {
		marginTop: 12,
		minHeight: 42,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.primary,
		backgroundColor: colors.primary + "10",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	partyButtonText: {
		color: colors.primary,
		fontWeight: "900",
		marginLeft: 6,
	},
	waitingNotice: {
		marginTop: 12,
		borderRadius: 8,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 10,
		flexDirection: "row",
		alignItems: "center",
	},
	waitingNoticeText: {
		color: colors.textMedium,
		fontWeight: "700",
		marginLeft: 7,
		flex: 1,
	},
	queueNotice: {
		marginTop: 12,
		borderRadius: 8,
		backgroundColor: colors.primary + "10",
		borderWidth: 1,
		borderColor: colors.primary + "25",
		padding: 10,
		flexDirection: "row",
		alignItems: "center",
	},
	queueNoticeText: {
		color: colors.textDark,
		fontWeight: "800",
		marginLeft: 7,
		flex: 1,
	},
	cancelButton: {
		marginTop: 12,
		minHeight: 42,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.statusDanger,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	cancelButtonText: {
		color: colors.statusDanger,
		fontWeight: "900",
		marginLeft: 6,
	},
	emptyText: {
		color: colors.textMedium,
		fontSize: 14,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 14,
	},
	offerActionRow: {
		flexDirection: "row",
		marginTop: 12,
	},
	offerButton: {
		flex: 1,
		minHeight: 42,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 8,
	},
	acceptOfferButton: {
		backgroundColor: colors.primary,
	},
	passOfferButton: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	offerButtonText: {
		color: "#fff",
		fontWeight: "900",
	},
	passOfferButtonText: {
		color: colors.textDark,
		fontWeight: "900",
	},
});

export default CustomerReservationsScreen;
