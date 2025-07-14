// src/context/restaurant/WorkDayContext.js
import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useCallback,
} from "react";
import { Alert } from "react-native";

import { AuthContext } from "../authContext";
import { db, functions } from "../../config/firebase";

export const WorkDayContext = createContext({
	currentWorkDay: null, // Will hold the 'OPEN' work day document
	workDayStatus: "CLOSED", // 'OPEN', 'CLOSED', or 'LOADING'
	isLoading: true,
	startWorkDay: async () => {},
	endWorkDay: async () => {},
});

export const WorkDayProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);

	const [currentWorkDay, setCurrentWorkDay] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	const startWorkDayFunction = functions.httpsCallable("startWorkDay");
	const endWorkDayFunction = functions.httpsCallable("endWorkDay");

	// This listener automatically finds the current open work day for the restaurant
	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) {
			setCurrentWorkDay(null);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		const workDaysRef = db.collection("restaurants").doc(restaurantId).collection("work_days");
		const q = workDaysRef.where("status", "==", "OPEN").limit(1);

		const unsubscribe = q.onSnapshot(
			(snapshot) => {
				if (!snapshot.empty) {
					const workDayDoc = snapshot.docs[0];
					console.log(`WorkDayContext: Found OPEN work day: ${workDayDoc.id}`);
					setCurrentWorkDay({ id: workDayDoc.id, ...workDayDoc.data() });
				} else {
					console.log("WorkDayContext: No OPEN work day found.");
					setCurrentWorkDay(null);
				}
				setIsLoading(false);
			},
			(error) => {
				console.error(
					"WorkDayContext: Error listening for open work day:",
					error
				);
				setIsLoading(false);
			}
		);

		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const startWorkDay = useCallback(async () => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) {
			Alert.alert("Error", "Cannot start day: Restaurant ID not found.");
			return false;
		}
		try {
			await startWorkDayFunction({ restaurantId });
			// The listener will automatically update the state
			return true;
		} catch (error) {
			Alert.alert("Error Starting Day", error.message);
			return false;
		}
	}, [currentUserData?.uid, startWorkDayFunction]);

	const endWorkDay = useCallback(async () => {
		const restaurantId = currentUserData?.uid;
		const workDayId = currentWorkDay?.id;
		if (!restaurantId || !workDayId) {
			Alert.alert("Error", "Cannot end day: No open work day found.");
			return false;
		}
		try {
			await endWorkDayFunction({ restaurantId, workDayId });
			// The listener will automatically clear the state
			return true;
		} catch (error) {
			Alert.alert("Error Ending Day", error.message);
			return false;
		}
	}, [currentUserData?.uid, currentWorkDay?.id, endWorkDayFunction]);

	const value = {
		currentWorkDay,
		workDayStatus: currentWorkDay ? "OPEN" : "CLOSED",
		isLoading,
		startWorkDay,
		endWorkDay,
	};

	return (
		<WorkDayContext.Provider value={value}>{children}</WorkDayContext.Provider>
	);
};

export const useWorkDay = () => useContext(WorkDayContext);
