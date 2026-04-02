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

export const RestaurantDataContext = createContext({
	newCheckInCount: 0,
	newKitchenOrderCount: 0,
	serviceRequestCount: 0, // 🚨 NEW: Added to Context
});

export const RestaurantDataProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();

	const isCheckInInitialLoad = useRef(true);
	const isKitchenInitialLoad = useRef(true);
	const isServiceInitialLoad = useRef(true); // 🚨 NEW: Initial load tracker

	/* ──────────────────────────────
     1.  State & refs
    ────────────────────────────── */
	const [newCheckInCount, setNewCheckInCount] = useState(0);
	const [newKitchenOrderCount, setNewKitchenOrderCount] = useState(0);
	const [serviceRequestCount, setServiceRequestCount] = useState(0); // 🚨 NEW: Badge state

	const checkInPlayer = useRef(null);
	const kitchenPlayer = useRef(null);
	const servicePlayer = useRef(null); // 🚨 NEW: Audio player ref

	const restaurantId = currentUserData?.uid;

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
			return;
		}

		const unsub = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active") // 🚨 THE FIX: Ignore archived tickets!
			.onSnapshot((snap) => {
				let newTicketsCount = 0;

				snap.docs.forEach((doc) => {
					const ticket = doc.data();
					// Count it for the badge if it's genuinely new
					if (ticket.status === "new") {
						newTicketsCount++;
					}
				});

				if (!isKitchenInitialLoad.current) {
					snap.docChanges().forEach((change) => {
						const ticket = change.doc.data();
						// Play the bell ONLY if a fresh, active, new ticket drops in
						if (change.type === "added" && ticket.status === "new") {
							kitchenPlayer.current?.seekTo(0);
							kitchenPlayer.current?.play();
						}
					});
				}

				isKitchenInitialLoad.current = false;
				setNewKitchenOrderCount(newTicketsCount); // 🚨 Update the badge with the correct math
			});

		return () => {
			isKitchenInitialLoad.current = true;
			unsub();
		};
	}, [restaurantId]);

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
							const isManager = activeSession?.role !== "worker";

							if (isMyTable || isManager) {
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

	/* ──────────────────────────────
     4.  Context value
    ────────────────────────────── */
	const value = {
		newCheckInCount,
		newKitchenOrderCount,
		serviceRequestCount, // 🚨 NEW: Exported so NavBar can show the red badge
	};

	return (
		<RestaurantDataContext.Provider value={value}>
			{children}
		</RestaurantDataContext.Provider>
	);
};

export const useRestaurantData = () => useContext(RestaurantDataContext);
