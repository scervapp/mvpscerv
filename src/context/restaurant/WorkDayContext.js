// src/context/restaurant/WorkDayContext.js
import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useCallback,
	useMemo,
} from "react";
import { Alert } from "react-native";

import { AuthContext } from "../authContext";
import { useEmployeeSession } from "./EmployeeSessionContext";
import { functions } from "../../config/firebase";
import { httpsCallable } from "@react-native-firebase/functions";

export const WorkDayContext = createContext({
	currentWorkDay: null, // Will hold the 'OPEN' work day document
	workDayStatus: "CLOSED", // 'OPEN', 'CLOSED', or 'LOADING'
	isLoading: true,
	startWorkDay: async () => {},
	endWorkDay: async () => {},
});

export const WorkDayProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const { activeSession, isRestoringSession } = useEmployeeSession();
	const role = String(currentUserData?.role || "").toLowerCase();
	const canUseAccountUidAsRestaurantId = [
		"restaurant",
		"restaurant_owner",
		"owner",
		"manager",
	].includes(role);
	const restaurantId =
		activeSession?.restaurantId ||
		currentUserData?.restaurantId ||
		(canUseAccountUidAsRestaurantId ? currentUserData?.uid : null);

	const [currentWorkDay, setCurrentWorkDay] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	const startWorkDayFunction = useMemo(
		() => httpsCallable(functions, "startWorkDay"),
		[],
	);
	const endWorkDayFunction = useMemo(
		() => httpsCallable(functions, "endWorkDay"),
		[],
	);
	const getCurrentWorkDayStatusFunction = useMemo(
		() => httpsCallable(functions, "getCurrentWorkDayStatus"),
		[],
	);

	const buildWorkDayFromStatus = useCallback((statusData = {}) => {
		if (!statusData.isOpen || !statusData.workDayId) return null;
		const openedDate = statusData.openedAt
			? new Date(statusData.openedAt)
			: null;
		const openedAt =
			openedDate && !Number.isNaN(openedDate.getTime())
				? openedDate
				: new Date();

		return {
			id: statusData.workDayId,
			status: statusData.status || "OPEN",
			openedAt: statusData.openedAt || null,
			closedAt: statusData.closedAt || null,
			managerWhoOpened: statusData.openedBy || null,
			startTime: {
				toDate: () => openedAt,
			},
		};
	}, []);

	const loadWorkDayStatus = useCallback(async () => {
		if (isRestoringSession) {
			setCurrentWorkDay(null);
			setIsLoading(true);
			return;
		}

		if (!restaurantId) {
			setCurrentWorkDay(null);
			setIsLoading(false);
			return;
		}

		try {
			const result = await getCurrentWorkDayStatusFunction({
				restaurantId,
				staffId: activeSession?.id || null,
			});
			const nextWorkDay = buildWorkDayFromStatus(result.data || {});
			setCurrentWorkDay(nextWorkDay);
			setIsLoading(false);
		} catch (error) {
			const message = String(error?.message || "");
			const code = String(error?.code || "");
			const isMissingRestaurant =
				code.includes("not-found") ||
				message.toLowerCase().includes("restaurant not found");
			if (isMissingRestaurant) {
				console.warn("WorkDayContext: Restaurant not ready for work day status.", {
					restaurantId,
					activeSessionRestaurantId: activeSession?.restaurantId || null,
					accountRestaurantId: currentUserData?.restaurantId || null,
					accountRole: role || null,
				});
			} else {
				console.error("WorkDayContext: Failed to load work day status:", error);
			}
			setIsLoading(false);
		}
	}, [
		activeSession?.id,
		activeSession?.restaurantId,
		buildWorkDayFromStatus,
		currentUserData?.restaurantId,
		getCurrentWorkDayStatusFunction,
		isRestoringSession,
		restaurantId,
		role,
	]);

	useEffect(() => {
		if (isRestoringSession) {
			setCurrentWorkDay(null);
			setIsLoading(true);
			return undefined;
		}

		if (!restaurantId) {
			setCurrentWorkDay(null);
			setIsLoading(false);
			return undefined;
		}

		setIsLoading(true);
		let cancelled = false;
		let timer = null;

		const pollWorkDayStatus = async () => {
			if (cancelled) return;
			await loadWorkDayStatus();
		};

		pollWorkDayStatus();
		timer = setInterval(pollWorkDayStatus, 30000);

		return () => {
			cancelled = true;
			if (timer) clearInterval(timer);
		};
	}, [isRestoringSession, loadWorkDayStatus, restaurantId]);

	const startWorkDay = useCallback(async () => {
		if (!restaurantId) {
			Alert.alert("Error", "Cannot start day: Restaurant ID not found.");
			return false;
		}
		try {
			await startWorkDayFunction({
				restaurantId,
				staffId: activeSession?.id || null,
				staffName: activeSession?.name || null,
			});
			await loadWorkDayStatus();
			return true;
		} catch (error) {
			Alert.alert("Error Starting Day", error.message);
			return false;
		}
	}, [
		activeSession?.id,
		activeSession?.name,
		loadWorkDayStatus,
		restaurantId,
		startWorkDayFunction,
	]);

	const endWorkDay = useCallback(async () => {
		const workDayId = currentWorkDay?.id;
		if (!restaurantId || !workDayId) {
			Alert.alert("Error", "Cannot end day: No open work day found.");
			return false;
		}
		try {
			const result = await endWorkDayFunction({
				restaurantId,
				workDayId,
				staffId: activeSession?.id || null,
				staffName: activeSession?.name || null,
			});
			await loadWorkDayStatus();
			return result?.data || { success: true };
		} catch (error) {
			Alert.alert("Error Ending Day", error.message);
			return false;
		}
	}, [
		activeSession?.id,
		activeSession?.name,
		currentWorkDay?.id,
		endWorkDayFunction,
		loadWorkDayStatus,
		restaurantId,
	]);

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

