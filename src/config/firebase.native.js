// src/config/firebase.native.js
// This file is ONLY used for iOS and Android.

import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import functionsService from "@react-native-firebase/functions";

// The native app is initialized automatically by the google-services.json file.
// We just export the initialized service instances.
export const db = firestore();
export const functions = functionsService();
export { auth };
