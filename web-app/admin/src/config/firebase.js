import { initializeApp } from "firebase/app";

import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
//import { getRemoteConfig, fetchAndActivate } from "firebase/remote-config";

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
	persistence: browserLocalPersistence,
});

export const functions = getFunctions(app);

export default app;
