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

export const RestaurantDataContext = createContext({
	newCheckInCount: 0,
	newKitchenOrderCount: 0,
	serviceRequestCount: 0, // 🚨 NEW: Added to Context
});

export const RestaurantDataProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);

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
		const unsub = db
			.collection("checkIns")
			.where("restaurantId", "==", restaurantId)
			.where("status", "==", "AWAITING_TABLE")
			.onSnapshot((snap) => {
				if (!isCheckInInitialLoad.current) {
					snap.docChanges().forEach((change) => {
						if (change.type === "added") {
							checkInPlayer.current?.seekTo(0);
							checkInPlayer.current?.play();
						}
					});
				}
				isCheckInInitialLoad.current = false;
				setNewCheckInCount(snap.size);
			});
		return () => {
			isCheckInInitialLoad.current = true;
			unsub();
		};
	}, [restaurantId]);

	// --- KITCHEN LISTENER ---
	useEffect(() => {
		if (!restaurantId) {
			setNewKitchenOrderCount(0);
			return;
		}
		const unsub = db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("status", "==", "new")
			.onSnapshot((snap) => {
				if (!isKitchenInitialLoad.current) {
					snap.docChanges().forEach((change) => {
						if (change.type === "added") {
							kitchenPlayer.current?.seekTo(0);
							kitchenPlayer.current?.play();
						}
					});
				}
				isKitchenInitialLoad.current = false;
				setNewKitchenOrderCount(snap.size);
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

		const unsub = db
			.collection("parties")
			.where("restaurantId", "==", restaurantId)
			.where("serviceRequested", "==", true) // Only grab tables asking for help
			.onSnapshot((snap) => {
				if (!isServiceInitialLoad.current) {
					snap.docChanges().forEach((change) => {
						// When the flag flips to true, it enters this query as an "added" document
						if (change.type === "added") {
							console.log("Service requested at a table! Playing bell.");
							servicePlayer.current?.seekTo(0);
							servicePlayer.current?.play();
						}
					});
				}

				isServiceInitialLoad.current = false;

				// This updates a badge showing exactly how many tables currently need help
				setServiceRequestCount(snap.size);
			});

		return () => {
			isServiceInitialLoad.current = true;
			unsub();
		};
	}, [restaurantId]);

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
