import { getApps, initializeApp } from "firebase/app";

import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
//import { getRemoteConfig, fetchAndActivate } from "firebase/remote-config";

export const ADMIN_ENV_STORAGE_KEY = "scerv-admin-environment";

export const ADMIN_ENVIRONMENTS = {
	dev: {
		key: "dev",
		label: "Development",
		shortLabel: "DEV",
		projectId: "scervmvp-dev",
		tone: "dev",
		description: "Testing restaurants, menus, customers, and support flows.",
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
		shortLabel: "PROD",
		projectId: "scervmvp",
		tone: "production",
		description: "Live Scerv data. Changes affect real operational records.",
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

export const getSelectedAdminEnvironmentKey = () => {
	if (typeof window === "undefined") return "dev";
	const storedKey = window.localStorage.getItem(ADMIN_ENV_STORAGE_KEY);
	return ADMIN_ENVIRONMENTS[storedKey] ? storedKey : "dev";
};

export const selectedAdminEnvironmentKey = getSelectedAdminEnvironmentKey();
export const selectedAdminEnvironment =
	ADMIN_ENVIRONMENTS[selectedAdminEnvironmentKey];

export const switchAdminEnvironment = (nextEnvironmentKey) => {
	if (!ADMIN_ENVIRONMENTS[nextEnvironmentKey]) return;
	window.localStorage.setItem(ADMIN_ENV_STORAGE_KEY, nextEnvironmentKey);
	window.location.assign("/signin");
};

const app = getApps()[0] || initializeApp(selectedAdminEnvironment.firebaseConfig);

export const db = getFirestore(app);
export const auth = initializeAuth(app, {
	persistence: browserLocalPersistence,
});

export const functions = getFunctions(app);

export default app;
