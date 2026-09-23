import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useRef,
} from "react";

import { AuthContext } from "../authContext";
import { db } from "../../config/firebase";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useEmployeeSession } from "./EmployeeSessionContext";
import { isPickupEnabledForRestaurant } from "../../config/featureFlags";
import { buildReadyStationInfo } from "../../utils/restaurantStationStatus";

export const RestaurantDataContext = createContext({
	newCheckInCount: 0,
	newKitchenOrderCount: 0,
	serviceRequestCount: 0, //
	readyItemAlertCount: 0,
	pickupOrderCount: 0,
	setKitchenQueueFocused: () => {},
});

export const RestaurantDataProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const pickupEnabled = isPickupEnabledForRestaurant(currentUserData);

	const isCheckInInitialLoad = useRef(true);
	const isKitchenInitialLoad = useRef(true);
	const isServiceInitialLoad = useRef(true); // 🚨 NEW: Initial load tracker
	const isKitchenQueueFocused = useRef(false);
	const readyCountsByTicket = useRef({});

	/* ──────────────────────────────
     1.  State & refs
    ────────────────────────────── */
	const [newCheckInCount, setNewCheckInCount] = useState(0);
	const [newKitchenOrderCount, setNewKitchenOrderCount] = useState(0);
	const [serviceRequestCount, setServiceRequestCount] = useState(0);
	const [readyItemAlertCount, setReadyItemAlertCount] = useState(0);
	const [pickupOrderCount, setPickupOrderCount] = useState(0); // 🚨 NEW: Badge state

	const checkInPlayer = useRef(null);
	const kitchenPlayer = useRef(null);
	const servicePlayer = useRef(null); // 🚨 NEW: Audio player ref

	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
	const activeJobTitle = String(activeSession?.jobTitle || "").toLowerCase();
	const isBackOfHouseDevice = ["chef", "kitchen", "bartender", "bar"].includes(
		activeJobTitle,
	);
	const canReceiveReadyItemAlerts =
		!isBackOfHouseDevice &&
		(activeSession?.role !== "worker" ||
			["server", "runner", "support", "host"].includes(activeJobTitle));

	/* ──────────────────────────────
     2.  Configure audio + preload
    ────────────────────────────── */
	useEffect(() => {
		setAudioModeAsync({
			playsInSilentMode: true,
			interruptionModeAndroid: "duckOthers",
			interruptionMode: "duckOthers",
		});

		checkInPlayer.current = createAudioPlayer(
			require("../../../assets/checkIn.mp3"),
		);
		kitchenPlayer.current = createAudioPlayer(
			require("../../../assets/order.mp3"),
		);

		// 🚨 NEW: Preload the service bell sound! (Make sure you have this file)
		servicePlayer.current = createAudioPlayer(
			require("../../../assets/serviceBell.mp3"),
		);

		return () => {
			checkInPlayer.current?.remove();
			kitchenPlayer.current?.remove();
			servicePlayer.current?.remove();
		};
	}, []);

	/* ──────────────────────────────
     3.  Firestore listeners 
    ────────────────────────────── */

	// --- CHECK-IN LISTENER ---
	useEffect(() => {
		if (!restaurantId) {
			setNewCheckInCount(0);
			return;
		}

		// Determine if the person holding the tablet cares about the front door
		const isHostOrManager =
			activeSession?.role !== "worker" || activeSession?.jobTitle === "host";

		// Listen to the active parties to match the cards on the Host Hub
		const unsub = db
			.collection("parties")
			.where("restaurantId", "==", restaurantId)
			.where("status", "==", "active")
			.onSnapshot((snap) => {
				// Filter down to parties that need a server assigned
				const unassignedParties = snap.docs
					.map((doc) => doc.data())
					.filter((party) => !party.server || party.server.id === "unassigned");

				// Play the sound ONLY if a new table needs a server, and ONLY if I am a Host/Manager
				if (!isCheckInInitialLoad.current && isHostOrManager) {
					snap.docChanges().forEach((change) => {
						if (change.type === "added") {
							const newParty = change.doc.data();
							const needsServer =
								!newParty.server || newParty.server.id === "unassigned";

							if (needsServer) {
								console.log("New QR Check-in! Playing Host Bell.");
								checkInPlayer.current?.seekTo(0);
								checkInPlayer.current?.play();
							}
						}
					});
				}

				isCheckInInitialLoad.current = false;

				// Update the badge for Hosts/Managers. Servers see a clean '0'.
				setNewCheckInCount(isHostOrManager ? unassignedParties.length : 0);
			});

		return () => {
			isCheckInInitialLoad.current = true;
			unsub();
		};
	}, [restaurantId, activeSession?.role, activeSession?.jobTitle]);

	// --- KITCHEN LISTENER ---
	useEffect(() => {
		if (!restaurantId) {
			setNewKitchenOrderCount(0);
			setReadyItemAlertCount(0);
			readyCountsByTicket.current = {};
			return;
		}

		const unsub = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active") // Ignores voided/archived tickets
			.onSnapshot((snap) => {
				let newTicketsCount = 0;
				let readyTicketCount = 0;
				let shouldPlayReadyItemBell = false;
				const nextReadyCountsByTicket = {};

				snap.docs.forEach((doc) => {
					const ticket = doc.data();
					const ticketWithId = { id: doc.id, ...ticket };
					const isPacingHeld =
						ticket.pacingStatus === "scheduled" || ticket.pacingStatus === "held";

					// 🚨 THE FIX: Smart Badge Math
					let isNewTicket = false;

					if (isPacingHeld) {
						isNewTicket = false;
					} else if (ticket.stationStatuses) {
						// Enterprise Way: Only count it if a specific station is explicitly "new"
						isNewTicket =
							ticket.stationStatuses.kitchen === "new" ||
							ticket.stationStatuses.bar === "new";
					} else {
						// Legacy Fallback (so older test tickets don't break the app)
						isNewTicket = ticket.status === "new";
					}

					// Increment the badge ONLY for genuinely untouched tickets
					if (isNewTicket) {
						newTicketsCount++;
					}

					if (ticket.fulfillmentType !== "hotel_pickup") {
						const readyInfo = buildReadyStationInfo([ticketWithId]);
						nextReadyCountsByTicket[doc.id] = readyInfo.readyItemCount;
						if (readyInfo.readyItemCount > 0) {
							readyTicketCount++;
						}

						const previousReadyCount = readyCountsByTicket.current[doc.id] || 0;
						const ticketServerId =
							ticket.server?.id || ticket.serverId || ticket.assignedServerId;
						const belongsToThisServer =
							activeJobTitle !== "server" ||
							!activeSession?.id ||
							ticketServerId === activeSession.id;

						if (
							!isKitchenInitialLoad.current &&
							canReceiveReadyItemAlerts &&
							belongsToThisServer &&
							readyInfo.readyItemCount > previousReadyCount
						) {
							shouldPlayReadyItemBell = true;
						}
					}
				});

				if (!isKitchenInitialLoad.current) {
					snap.docChanges().forEach((change) => {
						const ticket = change.doc.data();
						const isPacingHeld =
							ticket.pacingStatus === "scheduled" ||
							ticket.pacingStatus === "held";

						let isNewTicket = false;
						if (isPacingHeld) {
							isNewTicket = false;
						} else if (ticket.stationStatuses) {
							isNewTicket =
								ticket.stationStatuses.kitchen === "new" ||
								ticket.stationStatuses.bar === "new";
						} else {
							isNewTicket = ticket.status === "new";
						}

						// Production tablets only ring for brand-new fired tickets, never
						// when staff mark tickets started or ready.
						if (
							change.type === "added" &&
							isNewTicket &&
							isKitchenQueueFocused.current
						) {
							console.log("New Kitchen/Bar Order! Playing Bell.");
							kitchenPlayer.current?.seekTo(0);
							kitchenPlayer.current?.play();
						}
					});
				}

				if (shouldPlayReadyItemBell) {
					console.log("Kitchen/bar item ready for service. Playing server bell.");
					servicePlayer.current?.seekTo(0);
					servicePlayer.current?.play();
				}

				isKitchenInitialLoad.current = false;
				readyCountsByTicket.current = nextReadyCountsByTicket;

				// 🚨 Update the badge with the true count of unstarted tickets
				setNewKitchenOrderCount(newTicketsCount);
				setReadyItemAlertCount(readyTicketCount);
			});

		return () => {
			isKitchenInitialLoad.current = true;
			readyCountsByTicket.current = {};
			unsub();
		};
	}, [
		activeJobTitle,
		activeSession?.id,
		activeSession?.role,
		canReceiveReadyItemAlerts,
		restaurantId,
	]);

	// --- 🚨 NEW: SERVICE REQUEST LISTENER ---
	useEffect(() => {
		if (!restaurantId) {
			setServiceRequestCount(0);
			return;
		}

		// We still fetch all active requests to ensure the query doesn't fail
		const unsub = db
			.collection("parties")
			.where("restaurantId", "==", restaurantId)
			.where("serviceRequested", "==", true)
			.onSnapshot((snap) => {
				// 1. Convert snapshot to a normal array
				const allRequests = snap.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));

				// 2. Filter down to ONLY the tables this server owns
				let myRequests = allRequests;
				if (
					activeSession?.role === "worker" &&
					activeSession?.jobTitle === "server"
				) {
					myRequests = allRequests.filter(
						(party) => party.server?.id === activeSession.id,
					);
				}

				// 3. Play the bell ONLY if a table I care about was just added
				if (!isServiceInitialLoad.current) {
					snap.docChanges().forEach((change) => {
						if (change.type === "added") {
							const newParty = change.doc.data();
							const isMyTable = newParty.server?.id === activeSession?.id;
							const canHandleAllRequests =
								activeSession?.role !== "worker" ||
								["host", "support", "busser", "runner"].includes(
									activeSession?.jobTitle,
								);

							if (isMyTable || canHandleAllRequests) {
								console.log("Service requested at MY table! Playing bell.");
								servicePlayer.current?.seekTo(0);
								servicePlayer.current?.play();
							}
						}
					});
				}

				isServiceInitialLoad.current = false;

				// 4. Update the badge with the FILTERED mathematical count
				setServiceRequestCount(myRequests.length);
			});

		return () => {
			isServiceInitialLoad.current = true;
			unsub();
		};
	}, [
		restaurantId,
		activeSession?.id,
		activeSession?.role,
		activeSession?.jobTitle,
	]);

	// --- 🚨 NEW: PICKUP QUEUE LISTENER ---
	useEffect(() => {
		if (!restaurantId || !pickupEnabled) {
			setPickupOrderCount(0);
			return;
		}

		// Listen for active orders explicitly flagged for hotel pickup
		const unsub = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.where("fulfillmentType", "==", "hotel_pickup")
			.onSnapshot((snap) => {
				if (!snap) return;
				setPickupOrderCount(snap.docs.length);
			});

		return () => unsub();
	}, [restaurantId, pickupEnabled]);

	/* ──────────────────────────────
     4.  Context value
    ────────────────────────────── */
	const value = {
		newCheckInCount,
		newKitchenOrderCount,
		serviceRequestCount,
		readyItemAlertCount,
		pickupOrderCount,
		setKitchenQueueFocused: (isFocused) => {
			isKitchenQueueFocused.current = isFocused === true;
		},
	};

	return (
		<RestaurantDataContext.Provider value={value}>
			{children}
		</RestaurantDataContext.Provider>
	);
};

export const useRestaurantData = () => useContext(RestaurantDataContext);
