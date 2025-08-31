// src/context/restaurant/RestaurantDataContext.js
import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useRef,
	useCallback,
} from "react";

import { AuthContext } from "../authContext";
import { db } from "../../config/firebase";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

export const RestaurantDataContext = createContext({
	newCheckInCount: 0,
	newKitchenOrderCount: 0,
});

export const RestaurantDataProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const isCheckInInitialLoad = useRef(true);
	const isKitchenInitialLoad = useRef(true);

	/* ──────────────────────────────
     1.  State & refs
  ────────────────────────────── */
	const [newCheckInCount, setNewCheckInCount] = useState(0);
	const [newKitchenOrderCount, setNewKitchenOrderCount] = useState(0);

	const checkInPlayer = useRef(null);
	const kitchenPlayer = useRef(null);

	const prevCheckIn = useRef(0);
	const prevKitchen = useRef(0);

	const restaurantId = currentUserData?.uid;

	/* ──────────────────────────────
     2.  Configure audio + preload
  ────────────────────────────── */
	useEffect(() => {
		// Allow playback in silent‑mode (iOS) and duck other audio (Android)
		setAudioModeAsync({
			playsInSilentMode: true,
			interruptionModeAndroid: "duckOthers",
			interruptionMode: "duckOthers",
		});

		console.log("--- Check-in Sound Effect Fired ---");
		console.log(`isLoaded: ${checkInPlayer.current?.isLoaded}`);
		console.log(`New Count: ${newCheckInCount}`);
		console.log(`Previous Count: ${prevCheckIn.current}`);
		console.log(
			`Condition Met (new > prev): ${newCheckInCount > prevCheckIn.current}`
		);

		checkInPlayer.current = createAudioPlayer(
			require("../../../assets/checkIn.mp3")
		);
		kitchenPlayer.current = createAudioPlayer(
			require("../../../assets/order.mp3")
		);

		return () => {
			// free native resources
			checkInPlayer.current?.remove();
			kitchenPlayer.current?.remove();
		};
	}, []);

	/* ──────────────────────────────
     3.  Play sounds on counter ↑
  ────────────────────────────── */
	useEffect(() => {
		if (
			checkInPlayer.current?.isLoaded &&
			newCheckInCount > prevCheckIn.current
		) {
			checkInPlayer.current.seekTo(0);
			checkInPlayer.current.play();
		}
		prevCheckIn.current = newCheckInCount;
	}, [newCheckInCount]);

	useEffect(() => {
		if (
			kitchenPlayer.current?.isLoaded &&
			newKitchenOrderCount > prevKitchen.current
		) {
			kitchenPlayer.current.seekTo(0);
			kitchenPlayer.current.play();
		}
		prevKitchen.current = newKitchenOrderCount;
	}, [newKitchenOrderCount]);

	/* ──────────────────────────────
     4.  Firestore listeners
  ────────────────────────────── */
	useEffect(() => {
		if (!restaurantId) {
			setNewCheckInCount(0);
			return;
		}

		const unsub = db
			.collection("checkIns")
			.where("restaurantId", "==", restaurantId)
			.where("status", "==", "REQUESTED")
			.onSnapshot((snap) => {
				if (!isCheckInInitialLoad.current) {
					snap.docChanges().forEach((change) => {
						// If a new check-in was added, play the sound
						if (change.type === "added") {
							console.log("New check-in document added. Playing sound.");
							checkInPlayer.current?.seekTo(0);
							checkInPlayer.current?.play();
						}
					});
				}

				// The initial load is now complete
				isCheckInInitialLoad.current = false;

				// Always update the count for your UI
				setNewCheckInCount(snap.size);
			});

		return () => {
			isCheckInInitialLoad.current = true; // Reset on cleanup
			unsub();
		};
	}, [restaurantId]);

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
				// Check for changes, but only play sounds after the initial load
				if (!isKitchenInitialLoad.current) {
					snap.docChanges().forEach((change) => {
						// If a new kitchen order was added, play the sound
						if (change.type === "added") {
							console.log("New kitchen order document added. Playing sound.");
							kitchenPlayer.current?.seekTo(0);
							kitchenPlayer.current?.play();
						}
					});
				}

				// The initial load for this listener is now complete
				isKitchenInitialLoad.current = false;

				// Always update the count for your UI
				setNewKitchenOrderCount(snap.size);
			});

		return () => {
			isKitchenInitialLoad.current = true; // Reset on cleanup
			unsub();
		};
	}, [restaurantId]);

	/* ──────────────────────────────
     5.  Context value
  ────────────────────────────── */
	const value = { newCheckInCount, newKitchenOrderCount };

	return (
		<RestaurantDataContext.Provider value={value}>
			{children}
		</RestaurantDataContext.Provider>
	);
};

export const useRestaurantData = () => useContext(RestaurantDataContext);
