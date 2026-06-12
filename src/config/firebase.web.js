// src/config/firebase.js

import { initializeApp, getApps, getApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import {
	connectAuthEmulator,
	initializeAuth,
	getReactNativePersistence,
} from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Your web app's Firebase configuration
const configuredProjectId =
	Constants.expoConfig?.extra?.firebase?.projectId || "scervmvp";
const emulatorConfig = Constants.expoConfig?.extra?.firebase?.emulators;

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

if (emulatorConfig?.enabled && !globalThis.__SCERV_FIREBASE_EMULATORS_CONNECTED__) {
	const host = emulatorConfig.host || "127.0.0.1";

	connectFirestoreEmulator(db, host, emulatorConfig.firestorePort || 8080);
	connectFunctionsEmulator(functions, host, emulatorConfig.functionsPort || 5001);
	connectAuthEmulator(auth, `http://${host}:${emulatorConfig.authPort || 9099}`, {
		disableWarnings: true,
	});

	globalThis.__SCERV_FIREBASE_EMULATORS_CONNECTED__ = true;
}

export { app, auth, db, functions };

