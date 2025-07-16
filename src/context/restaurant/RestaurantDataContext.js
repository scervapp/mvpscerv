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
			.onSnapshot((snap) => setNewCheckInCount(snap.size));

		return unsub;
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
			.onSnapshot((snap) => setNewKitchenOrderCount(snap.size));

		return unsub;
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

