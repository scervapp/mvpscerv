import React, { createContext, useState, useEffect, useContext } from "react";

import { doc, onSnapshot } from "@react-native-firebase/firestore";
import { db } from "../config/firebase.native";

export const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
	const [notification, setNotification] = useState(null);

	useEffect(() => {
		// Reference to the specific document in Firestore
		const notificationRef = doc(db, "appConfig", "notifications");

		// onSnapshot creates a real-time listener
		const unsubscribe = onSnapshot(notificationRef, (docSnap) => {
			if (docSnap.exists() && docSnap.data().isActive) {
				// If the document exists and is active, set the notification data
				setNotification(docSnap.data());
			} else {
				// Otherwise, clear the notification
				setNotification(null);
			}
		});

		// Clean up the listener when the component unmounts
		return () => unsubscribe();
	}, []);

	return (
		<NotificationContext.Provider value={notification}>
			{children}
		</NotificationContext.Provider>
	);
};

// Custom hook to easily access the notification data
export const useNotification = () => {
	return useContext(NotificationContext);
};
