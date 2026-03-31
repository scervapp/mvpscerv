// src/context/restaurant/EmployeeSessionContext.js
import React, { createContext, useState, useContext, useMemo } from "react";
import { AuthContext } from "../authContext";

export const EmployeeSessionContext = createContext({
	activeSession: null,
	startSession: (employee) => {},
	endSession: () => {},
});

export const EmployeeSessionProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);

	// Starts as null. This means the POS is LOCKED by default.
	const [activeEmployee, setActiveEmployee] = useState(null);

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

	const startSession = (employeeProfile) => {
		console.log(
			`[POS] Session started for: ${employeeProfile.name} (${employeeProfile.role})`,
		);
		setActiveEmployee(employeeProfile);
	};

	const endSession = () => {
		console.log("[POS] Session ended. Device Locked.");
		setActiveEmployee(null);
	};

	return (
		<EmployeeSessionContext.Provider
			value={{ activeSession, startSession, endSession }}
		>
			{children}
		</EmployeeSessionContext.Provider>
	);
};

export const useEmployeeSession = () => useContext(EmployeeSessionContext);
