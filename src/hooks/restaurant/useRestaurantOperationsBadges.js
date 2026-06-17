import { useEffect, useMemo, useState } from "react";

import { db } from "../../config/firebase";

const ACTIVE_RESERVATION_STATUSES = [
	"requested",
	"confirmed",
	"arrival_requested",
	"seated",
];

const HOST_CHECK_IN_TYPES = ["reservation_arrival", "host_assigned_walk_in"];

const getTodayKey = () => {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const isCurrentOrFutureReservation = (reservation = {}) => {
	const requestedDate = String(reservation.requestedDate || "");
	if (!requestedDate) return true;
	return requestedDate >= getTodayKey();
};

export const useRestaurantOperationsBadges = (restaurantId) => {
	const [reservationRows, setReservationRows] = useState([]);
	const [checkInRows, setCheckInRows] = useState([]);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (!restaurantId) {
			setReservationRows([]);
			setCheckInRows([]);
			setIsLoading(false);
			return undefined;
		}

		setIsLoading(true);
		let reservationsReady = false;
		let checkInsReady = false;

		const markReady = (type) => {
			if (type === "reservations") reservationsReady = true;
			if (type === "checkIns") checkInsReady = true;
			if (reservationsReady && checkInsReady) setIsLoading(false);
		};

		const unsubscribeReservations = db
			.collection("reservations")
			.where("restaurantId", "==", restaurantId)
			.where("status", "in", ACTIVE_RESERVATION_STATUSES)
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.filter(isCurrentOrFutureReservation);
					setReservationRows(rows);
					markReady("reservations");
				},
				(error) => {
					console.error("Error loading reservation badge counts:", error);
					setReservationRows([]);
					markReady("reservations");
				},
			);

		const unsubscribeCheckIns = db
			.collection("checkIns")
			.where("restaurantId", "==", restaurantId)
			.where("status", "==", "REQUESTED")
			.onSnapshot(
				(snapshot) => {
					const rows = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.filter((item) => HOST_CHECK_IN_TYPES.includes(item.type));
					setCheckInRows(rows);
					markReady("checkIns");
				},
				(error) => {
					console.error("Error loading host check-in badge counts:", error);
					setCheckInRows([]);
					markReady("checkIns");
				},
			);

		return () => {
			unsubscribeReservations();
			unsubscribeCheckIns();
		};
	}, [restaurantId]);

	return useMemo(() => {
		const pendingReservations = reservationRows.filter(
			(reservation) => reservation.status === "requested",
		).length;
		const arrivingReservations = reservationRows.filter(
			(reservation) => reservation.status === "arrival_requested",
		).length;
		const confirmedReservations = reservationRows.filter(
			(reservation) => reservation.status === "confirmed",
		).length;
		const seatedReservations = reservationRows.filter(
			(reservation) => reservation.status === "seated",
		).length;
		const checkInRequests = checkInRows.length;

		return {
			isLoading,
			reservationsTotal: reservationRows.length,
			pendingReservations,
			arrivingReservations,
			confirmedReservations,
			seatedReservations,
			checkInRequests,
			attentionCount: pendingReservations + arrivingReservations + checkInRequests,
		};
	}, [checkInRows.length, isLoading, reservationRows]);
};
