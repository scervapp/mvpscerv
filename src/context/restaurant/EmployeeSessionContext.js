// src/context/restaurant/EmployeeSessionContext.js
import React, {
	createContext,
	useState,
	useContext,
	useMemo,
	useEffect,
	useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthContext } from "../authContext";

export const EmployeeSessionContext = createContext({
	activeSession: null,
	isRestoringSession: true,
	startSession: (employee) => {},
	endSession: () => {},
});

const getSessionStorageKey = (restaurantId) =>
	restaurantId ? `@scerv_pos_session:${restaurantId}` : null;

export const EmployeeSessionProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);

	// Starts as null. This means the POS is LOCKED by default.
	const [activeEmployee, setActiveEmployee] = useState(null);
	const [isRestoringSession, setIsRestoringSession] = useState(true);
	const restaurantId = currentUserData?.restaurantId || currentUserData?.uid;
	const currentUserId = currentUserData?.uid;

	useEffect(() => {
		let isMounted = true;
		const storageKey = getSessionStorageKey(restaurantId);

		const restoreSession = async () => {
			if (!currentUserId || !storageKey) {
				if (isMounted) {
					setActiveEmployee(null);
					setIsRestoringSession(false);
				}
				return;
			}

			setIsRestoringSession(true);
			try {
				const savedSession = await AsyncStorage.getItem(storageKey);
				if (!isMounted) return;

				if (savedSession) {
					const parsedSession = JSON.parse(savedSession);
					setActiveEmployee(parsedSession);
				} else {
					setActiveEmployee(null);
				}
			} catch (error) {
				console.error("[POS] Failed to restore staff session:", error);
				if (isMounted) setActiveEmployee(null);
			} finally {
				if (isMounted) setIsRestoringSession(false);
			}
		};

		restoreSession();

		return () => {
			isMounted = false;
		};
	}, [currentUserId, restaurantId]);

	const activeSession = useMemo(() => {
		if (!currentUserData) return null;

		// Return the verified employee (Server, Manager, or Owner)
		if (activeEmployee) {
			return activeEmployee;
		}

		// 🚨 CRITICAL CHANGE: We no longer default to a "worker".
		// If activeEmployee is null, the screen is locked.
		return null;
	}, [currentUserData, activeEmployee]);

	const startSession = useCallback(async (employeeProfile) => {
		const sessionProfile = {
			...employeeProfile,
			restaurantId:
				employeeProfile?.restaurantId ||
				employeeProfile?.restaurantUid ||
				restaurantId ||
				null,
		};
		console.log(
			`[POS] Session started for: ${sessionProfile.name} (${sessionProfile.role})`,
		);
		setActiveEmployee(sessionProfile);

		const storageKey = getSessionStorageKey(restaurantId);
		if (storageKey) {
			try {
				await AsyncStorage.setItem(storageKey, JSON.stringify(sessionProfile));
			} catch (error) {
				console.error("[POS] Failed to persist staff session:", error);
			}
		}
	}, [restaurantId]);

	const endSession = useCallback(async () => {
		console.log("[POS] Session ended. Device Locked.");
		setActiveEmployee(null);
		const storageKey = getSessionStorageKey(restaurantId);
		if (storageKey) {
			try {
				await AsyncStorage.removeItem(storageKey);
			} catch (error) {
				console.error("[POS] Failed to clear staff session:", error);
			}
		}
	}, [restaurantId]);

	return (
		<EmployeeSessionContext.Provider
			value={{ activeSession, isRestoringSession, startSession, endSession }}
		>
			{children}
		</EmployeeSessionContext.Provider>
	);
};

export const useEmployeeSession = () => useContext(EmployeeSessionContext);
