import { initializeApp, getApp } from "firebase/app";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
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

export default app;
