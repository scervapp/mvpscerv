// src/context/authContext.js
import React, {
	createContext,
	useState,
	useEffect,
	useContext,
	useCallback,
} from "react";

import { auth, db, functions } from "../config/firebase.native";
import { httpsCallable } from "@react-native-firebase/functions";
import { doc, getDoc, setDoc } from "@react-native-firebase/firestore";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
	const [currentUser, setCurrentUser] = useState(null);
	const [currentUserData, setCurrentUserData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [authError, setAuthError] = useState(null);
	const [redirectPath, setRedirectPath] = useState(null);

	useEffect(() => {
		const subscriber = auth.onAuthStateChanged(async (user) => {
			setIsLoading(true);
			if (user) {
				let userRole;
				let restId;

				if (user.isAnonymous) {
					userRole = "guest";
					setCurrentUserData({ uid: user.uid, role: userRole });
					setCurrentUser(user);
					setIsLoading(false);
					return;
				}

				const tokenResult = await user.getIdTokenResult(true);
				userRole = tokenResult.claims.role || "customer";
				restId =
					tokenResult.claims.restaurantId ||
					(userRole !== "customer" ? user.uid : null);

				// --- NATIVE FIRESTORE LOGIC ---
				// The collection name logic is the same
				const collectionName = ["owner", "manager", "worker"].includes(userRole)
					? "restaurants"
					: "customers";

				// Use the native 'db' object to create a reference
				const docRef = db.collection(collectionName).doc(user.uid);

				const unsubDoc = docRef.onSnapshot((docSnap) => {
					if (docSnap.exists) {
						setCurrentUserData({
							uid: user.uid,
							role: userRole,
							restaurantId: restId,
							...docSnap.data(),
						});
					} else {
						setCurrentUserData({
							uid: user.uid,
							role: userRole,
							restaurantId: restId,
						});
					}
					setIsLoading(false);
				});
				setCurrentUser(user);
				return () => unsubDoc();
			} else {
				setCurrentUser(null);
				setCurrentUserData(null);
				setIsLoading(false);
			}
		});
		return subscriber;
	}, []);

	const login = useCallback(async (email, password) => {
		setAuthError(null);
		try {
			await auth.signInWithEmailAndPassword(email, password);
		} catch (error) {
			setAuthError(error.message || "Invalid email or password.");
			throw error;
		}
	}, []);

	const signup = useCallback(async (email, password, role, additionalData) => {
		setAuthError(null);
		try {
			// Use the native 'funcs' object to call the cloud function
			const createUserAccount = httpsCallable(functions, "createUserAccount");
			await createUserAccount({ email, password, role, additionalData });
			await auth.signInWithEmailAndPassword(email, password);
		} catch (error) {
			setAuthError(error.message);
			throw error;
		}
	}, []);

	const signInWithPhoneCredential = useCallback(
		async (confirmation, verificationCode, additionalData) => {
			setAuthError(null);
			setIsLoading(true);

			// **CRITICAL VALIDATION**: Check code before attempting confirmation
			if (!verificationCode || verificationCode.trim().length !== 6) {
				setIsLoading(false);
				setAuthError("Please enter a valid 6-digit verification code.");
				return; // Exit early - don't even attempt Firebase call
			}

			try {
				console.log(
					"Starting phone verification with code:",
					verificationCode.substring(0, 2) + "***"
				); // Log partial code for security

				// 1. Confirm the verification code - this will throw if invalid
				const userCredential = await confirmation.confirm(
					verificationCode.trim()
				);
				const user = userCredential.user;

				console.log("Phone auth successful, user:", user.uid);

				// 2. Now create/update user document with additional data (if provided)
				if (
					additionalData &&
					additionalData.firstName &&
					additionalData.lastName
				) {
					console.log("Creating customer document with additional data:", {
						firstName: additionalData.firstName,
						lastName: additionalData.lastName,
						phoneNumber: additionalData.phoneNumber,
					});

					const userDocRef = doc(db, "customers", user.uid);

					// Use setDoc with merge: true to create or update
					await setDoc(
						userDocRef,
						{
							firstName: additionalData.firstName,
							lastName: additionalData.lastName,
							phoneNumber: additionalData.phoneNumber,
							uid: user.uid,
							role: "customer",
							canViewHiddenRestaurants: false,
							createdAt: new Date(),
						},
						{ merge: true } // This ensures it creates if new, updates if exists
					);

					console.log("Customer document created/updated successfully");
				}

				// 3. The onAuthStateChanged listener will pick up the user and fetch full data
				// No need to manually set state here - let the listener handle it
			} catch (error) {
				console.error("Phone verification error:", error);

				// Handle specific Firebase errors
				if (error.code === "auth/invalid-verification-code") {
					setAuthError(
						"Invalid verification code. Please check and try again."
					);
				} else if (error.code === "auth/code-expired") {
					setAuthError(
						"Verification code has expired. Please request a new one."
					);
				} else {
					setAuthError(`Verification failed: ${error.message}`);
				}

				throw error; // Re-throw for the screen to handle
			} finally {
				setIsLoading(false);
			}
		},
		[]
	);

	const continueAsGuest = useCallback(async () => {
		setAuthError(null);
		try {
			await auth.signInAnonymously();
		} catch (error) {
			setAuthError("Could not start a guest session.");
			throw error;
		}
	}, []);

	const logout = useCallback(async (redirectTo = null) => {
		if (redirectTo) setRedirectPath(redirectTo);
		try {
			await auth.signOut();
		} catch (error) {
			console.error("Logout Error:", error);
		}
	}, []);

	const sendPasswordResetEmail = useCallback(async (email) => {
		setAuthError(null);
		try {
			await auth.sendPasswordResetEmail(email);
			Alert.alert(
				"Password Reset",
				"A password reset link has been sent to your email."
			);
		} catch (error) {
			setAuthError(error.message);
			throw error;
		}
	}, []);

	const clearRedirectPath = useCallback(() => setRedirectPath(null), []);

	const value = {
		currentUser,
		currentUserData,
		isLoading,
		authError,
		login,
		signup,
		logout,
		continueAsGuest,
		redirectPath,
		clearRedirectPath,
		sendPasswordResetEmail,
		signInWithPhoneCredential,
	};

	return (
		<AuthContext.Provider value={value}>
			{!isLoading && children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => useContext(AuthContext);
