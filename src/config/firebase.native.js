// src/config/firebase.native.js
// This file is ONLY used for iOS and Android.

import authService from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import functionsService from "@react-native-firebase/functions";
import Constants from "expo-constants";

import storage from "@react-native-firebase/storage";

// The native app is initialized automatically by the google-services.json file.
// We just export the initialized service instances.
export const db = firestore();
export const functions = functionsService();
export const auth = authService();

export const nativeStorage = storage();

const emulatorConfig = Constants.expoConfig?.extra?.firebase?.emulators;
const shouldUseEmulators = emulatorConfig?.enabled === true;

if (shouldUseEmulators && !globalThis.__SCERV_FIREBASE_EMULATORS_CONNECTED__) {
	const host = emulatorConfig.host || "127.0.0.1";

	db.useEmulator(host, emulatorConfig.firestorePort || 8080);
	functions.useEmulator(host, emulatorConfig.functionsPort || 5001);
	auth.useEmulator(`http://${host}:${emulatorConfig.authPort || 9099}`);

	globalThis.__SCERV_FIREBASE_EMULATORS_CONNECTED__ = true;
}
