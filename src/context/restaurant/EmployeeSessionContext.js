// src/context/restaurant/EmployeeSessionContext.js
import React, { createContext, useState, useContext, useMemo } from "react";
import { AuthContext } from "../authContext"; // Adjust path

export const EmployeeSessionContext = createContext({
	activeSession: null, // Will hold { name, role } of the active user
	startSession: (employee) => {}, // Function to enter Manager Mode
	endSession: () => {}, // Function to return to Regular Mode
});

export const EmployeeSessionProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const [activeEmployee, setActiveEmployee] = useState(null);

	// The activeSession memo determines the current operational mode.
	const activeSession = useMemo(() => {
		if (!currentUserData) return null;

		// If a manager has verified with a PIN, their session is active.
		if (activeEmployee) {
			return activeEmployee;
		}

		// Otherwise, default to a 'worker' session based on the main logged-in account.
		// This ensures the app is always in a limited state by default.
		return {
			name: currentUserData.firstName || "Staff",
			role: "worker", // Default to the most restrictive role
			uid: currentUserData.uid,
		};
	}, [currentUserData, activeEmployee]);

	const startSession = (employeeProfile) => {
		console.log(`Starting manager/owner session for: ${employeeProfile.name}`);
		setActiveEmployee(employeeProfile);
	};

	const endSession = () => {
		console.log("Ending manager/owner session. Reverting to regular mode.");
		setActiveEmployee(null);
	};

	const value = {
		activeSession,
		startSession,
		endSession,
	};

	return (
		<EmployeeSessionContext.Provider value={value}>
			{children}
		</EmployeeSessionContext.Provider>
	);
};

export const useEmployeeSession = () => useContext(EmployeeSessionContext);
