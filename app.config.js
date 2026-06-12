const baseConfig = require("./app.json");

const APP_ENV = process.env.APP_ENV || "production";
const USE_FIREBASE_EMULATORS =
	process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true";
const FIREBASE_EMULATOR_HOST =
	process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";

const ENV_CONFIG = {
	development: {
		name: "Scerv Dev",
		slug: "scerv-dev",
		scheme: "scerv-dev",
		iosBundleIdentifier: "com.scerv.app.dev",
		androidPackage: "com.scerv.eat.dev",
		googleServicesFile: {
			ios: "./credentials/firebase/development/GoogleService-Info.plist",
			android: "./credentials/firebase/development/google-services.json",
		},
		firebaseProjectId:
			process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "scervmvp-dev",
	},
	testing: {
		name: "Scerv Testing",
		slug: "scerv-testing",
		scheme: "scerv-testing",
		iosBundleIdentifier: "com.scerv.app.testing",
		androidPackage: "com.scerv.eat.testing",
		googleServicesFile: {
			ios: "./credentials/firebase/testing/GoogleService-Info.plist",
			android: "./credentials/firebase/testing/google-services.json",
		},
		firebaseProjectId:
			process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "scervmvp-testing",
	},
	production: {
		name: "Scerv",
		slug: "scerv",
		scheme: "scerv",
		iosBundleIdentifier: "com.scerv.app",
		androidPackage: "com.scerv.eat",
		googleServicesFile: {
			ios: "./GoogleService-Info.plist",
			android: "./google-services.json",
		},
		firebaseProjectId:
			process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "scervmvp",
	},
};

const envConfig = ENV_CONFIG[APP_ENV] || ENV_CONFIG.production;

module.exports = {
	...baseConfig,
	expo: {
		...baseConfig.expo,
		name: envConfig.name,
		slug: envConfig.slug,
		scheme: envConfig.scheme,
		ios: {
			...baseConfig.expo.ios,
			bundleIdentifier: envConfig.iosBundleIdentifier,
			googleServicesFile: envConfig.googleServicesFile.ios,
		},
		android: {
			...baseConfig.expo.android,
			package: envConfig.androidPackage,
			googleServicesFile: envConfig.googleServicesFile.android,
		},
		extra: {
			...baseConfig.expo.extra,
			appEnv: APP_ENV,
			firebase: {
				projectId: envConfig.firebaseProjectId,
				emulators: {
					enabled: USE_FIREBASE_EMULATORS && APP_ENV !== "production",
					host: FIREBASE_EMULATOR_HOST,
					authPort: 9099,
					firestorePort: 8080,
					functionsPort: 5001,
				},
			},
		},
	},
};
