// src/config/firebase.js

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

// Your web app's Firebase configuration
const firebaseConfig = {
	apiKey: "AIzaSyB4Bi4Ql9nqG73nCzlJ_mv8WNQHKB0ugVI",
	authDomain: "scervmvp.firebaseapp.com",
	projectId: "scervmvp",
	storageBucket: "scervmvp.appspot.com",
	messagingSenderId: "606076519772",
	appId: "1:606076519772:web:cd28a806d4cfae324a2d99",
	measurementId: "G-PD1WJ2X732",
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

