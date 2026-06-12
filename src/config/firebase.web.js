// src/config/firebase.js

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Your web app's Firebase configuration
const configuredProjectId =
	Constants.expoConfig?.extra?.firebase?.projectId || "scervmvp";

const firebaseConfig = {
	apiKey:
		process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
		"AIzaSyB4Bi4Ql9nqG73nCzlJ_mv8WNQHKB0ugVI",
	authDomain:
		process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
		`${configuredProjectId}.firebaseapp.com`,
	projectId: configuredProjectId,
	storageBucket:
		process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
		`${configuredProjectId}.appspot.com`,
	messagingSenderId:
		process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "606076519772",
	appId:
		process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
		"1:606076519772:web:cd28a806d4cfae324a2d99",
	measurementId:
		process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-PD1WJ2X732",
};

// Initialize Firebase
let app;
const apps = getApps();
if (!apps.length) {
	app = initializeApp(firebaseConfig);
} else {
	app = getApp();
}

const db = getFirestore(app);
const functions = getFunctions(app);

// Initialize Auth with persistence
const auth = initializeAuth(app, {
	persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

export { app, auth, db, functions };

