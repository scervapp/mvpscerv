// src/context/restaurant/RestaurantDataContext.js
import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useRef,
	useCallback,
} from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { AuthContext } from "../authContext";
import { db } from "../../config/firebase";

import { Audio } from "expo-av";

export const RestaurantDataContext = createContext({
	newCheckInCount: 0,
	newKitchenOrderCount: 0,
	loadSounds: async () => {}, // The new function to load sounds
});

export const RestaurantDataProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const [newCheckInCount, setNewCheckInCount] = useState(0);
	const [newKitchenOrderCount, setNewKitchenOrderCount] = useState(0);

	const checkInSound = useRef(null);
	const kitchenSound = useRef(null);

	const prevCheckInCount = useRef(0);
	const prevKitchenOrderCount = useRef(0);

	const restaurantId = currentUserData?.uid;

	useEffect(() => {
		const setAudioMode = async () => {
			try {
				await Audio.setAudioModeAsync({
					playsInSilentModeIOS: true, // Allows sound to play on iOS even in silent mode
					allowsRecordingIOS: false,
					interruptionModeIOS: 1, // Duck others, aka Audio.INTERRUPTION_MODE_IOS_DUCK_OTHERS
					shouldDuckAndroid: true,
					interruptionModeAndroid: 1, // Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS
					playThroughEarpieceAndroid: false,
					staysActiveInBackground: true,
				});
				console.log("Audio mode set successfully.");
			} catch (e) {
				console.error("Failed to set audio mode", e);
			}
		};

		setAudioMode();
	}, []);

	// This function loads the sound files into memory so they are ready to play instantly.
	const loadSounds = useCallback(async () => {
		console.log("Loading sounds...");
		try {
			// Load the check-in sound
			if (!checkInSound.current) {
				const { sound } = await Audio.Sound.createAsync(
					// IMPORTANT: Replace this with your own hosted MP3 file for production
					require("../../../assets/checkIn.mp3")
				);
				checkInSound.current = sound;
			}
			// Load the kitchen order sound
			if (!kitchenSound.current) {
				const { sound } = await Audio.Sound.createAsync(
					// IMPORTANT: Replace this with your own hosted MP3 file for production
					require("../../../assets/order.mp3")
				);
				kitchenSound.current = sound;
			}
			console.log("Sounds loaded successfully.");
		} catch (error) {
			console.error("Failed to load sounds", error);
		}
	}, []);

	// Listener for new check-in requests
	useEffect(() => {
		if (!restaurantId) {
			setNewCheckInCount(0);
			return;
		}

		const checkInsRef = collection(db, "checkIns");
		const q = query(
			checkInsRef,
			where("restaurantId", "==", restaurantId),
			where("status", "==", "REQUESTED")
		);

		const unsubscribe = onSnapshot(q, (snapshot) => {
			console.log(
				"[RestaurantDataContext] New Check-In Count from Firestore:",
				snapshot.size
			);

			setNewCheckInCount(snapshot.size);
		});

		return () => unsubscribe();
	}, [restaurantId]);

	// Listener for new kitchen orders
	useEffect(() => {
		if (!restaurantId) {
			setNewKitchenOrderCount(0);
			return;
		}

		const kitchenOrdersRef = collection(db, "kitchen_orders");
		const q = query(
			kitchenOrdersRef,
			where("restaurantId", "==", restaurantId),
			where("status", "==", "new")
		);

		const unsubscribe = onSnapshot(q, (snapshot) => {
			setNewKitchenOrderCount(snapshot.size);
		});

		return () => unsubscribe();
	}, [restaurantId]);

	// This useEffect hook listens for changes in the counts and plays sounds.

	// The sound-playing effects now use the loaded sound objects.
	useEffect(() => {
		if (checkInSound.current && newCheckInCount > prevCheckInCount.current) {
			console.log("New Check-In Detected! Playing sound.");
			checkInSound.current.replayAsync();
		}
		prevCheckInCount.current = newCheckInCount;
	}, [newCheckInCount]);

	useEffect(() => {
		if (
			kitchenSound.current &&
			newKitchenOrderCount > prevKitchenOrderCount.current
		) {
			console.log("New Kitchen Order Detected! Playing sound.");
			kitchenSound.current.replayAsync();
		}
		prevKitchenOrderCount.current = newKitchenOrderCount;
	}, [newKitchenOrderCount]);

	const value = {
		newCheckInCount,
		newKitchenOrderCount,
		loadSounds,
	};

	return (
		<RestaurantDataContext.Provider value={value}>
			{children}
		</RestaurantDataContext.Provider>
	);
};

export const useRestaurantData = () => useContext(RestaurantDataContext);

