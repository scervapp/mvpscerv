import { getApps, initializeApp } from "firebase/app";

import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
//import { getRemoteConfig, fetchAndActivate } from "firebase/remote-config";

const WEB_ENVIRONMENTS = {
	development: {
		key: "development",
		label: "Development",
		firebaseConfig: {
			apiKey: "AIzaSyBlejZVzTAdevMwT8T5Vhl7yYNQ4BIwD9U",
			authDomain: "scervmvp-dev.firebaseapp.com",
			projectId: "scervmvp-dev",
			storageBucket: "scervmvp-dev.firebasestorage.app",
			messagingSenderId: "464887665401",
			appId: "1:464887665401:web:208fbf2c5c7163e1480828",
		},
	},
	production: {
		key: "production",
		label: "Production",
		firebaseConfig: {
			apiKey: "AIzaSyB4Bi4Ql9nqG73nCzlJ_mv8WNQHKB0ugVI",
			authDomain: "scervmvp.firebaseapp.com",
			projectId: "scervmvp",
			storageBucket: "scervmvp.appspot.com",
			messagingSenderId: "606076519772",
			appId: "1:606076519772:web:cd28a806d4cfae324a2d99",
			measurementId: "G-PD1WJ2X732",
		},
	},
};

const requestedEnvironment =
	process.env.REACT_APP_SCERV_ENV === "development"
		? "development"
		: "production";
export const selectedWebEnvironment = WEB_ENVIRONMENTS[requestedEnvironment];

const app =
	getApps()[0] || initializeApp(selectedWebEnvironment.firebaseConfig);
export const db = getFirestore(app);
export const auth = initializeAuth(app, {
	persistence: browserLocalPersistence,
});

export const functions = getFunctions(app);

export default app;
