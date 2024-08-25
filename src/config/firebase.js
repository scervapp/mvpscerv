import { initializeApp, getApp } from "firebase/app";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getStorage } from "firebase/storage";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import {
	initializeAuth,
	getAuth,
	getReactNativePersistence,
	connectAuthEmulator,
} from "firebase/auth";

const firebaseConfig = {
	apiKey: "AIzaSyB4Bi4Ql9nqG73nCzlJ_mv8WNQHKB0ugVI",

	authDomain: "scervmvp.firebaseapp.com",

	projectId: "scervmvp",

	storageBucket: "scervmvp.appspot.com",

	messagingSenderId: "606076519772",

	appId: "1:606076519772:web:cd28a806d4cfae324a2d99",

	measurementId: "G-PD1WJ2X732",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = initializeAuth(app, {
	persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

export const functions = getFunctions(app);

// // connect to emulators if in development mode
// if (__DEV__) {
// 	connectAuthEmulator(auth, "http://localhost:9099");
// 	connectFirestoreEmulator(db, "localhost", 8080);
// 	connectFunctionsEmulator(functions, "localhost", 5001);
// }

export default app;
