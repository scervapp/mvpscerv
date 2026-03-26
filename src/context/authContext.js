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

	console.log(
		"INITIAL MOUNT CHECK. auth.currentUser is:",
		auth.currentUser ? auth.currentUser.uid : "NULL",
	);

	useEffect(() => {
		console.log("[AUTH] 1. Setting up onAuthStateChanged listener...");

		const subscriber = auth.onAuthStateChanged(async (user) => {
			console.log("[AUTH] 2. onAuthStateChanged fired. User exists?", !!user);
			setIsLoading(true);

			if (user) {
				try {
					console.log(`[AUTH] 3. User found: ${user.uid}. Fetching token...`);
					let userRole;
					let restId;

					if (user.isAnonymous) {
						console.log("[AUTH] 3a. User is anonymous. Setting as guest.");
						userRole = "guest";
						setCurrentUserData({ uid: user.uid, role: userRole });
						setCurrentUser(user);
						setIsLoading(false);
						return;
					}

					const tokenResult = await user.getIdTokenResult();
					console.log(
						"[AUTH] 4. Token fetched successfully. Claims:",
						tokenResult.claims,
					);

					userRole = tokenResult.claims.role || "customer";
					restId =
						tokenResult.claims.restaurantId ||
						(userRole !== "customer" ? user.uid : null);

					const collectionName = ["owner", "manager", "worker"].includes(
						userRole,
					)
						? "restaurants"
						: "customers";

					console.log(
						`[AUTH] 5. Attaching Firestore listener to /${collectionName}/${user.uid}...`,
					);
					const docRef = db.collection(collectionName).doc(user.uid);

					const unsubDoc = docRef.onSnapshot(
						(docSnap) => {
							console.log(
								"[AUTH] 6. Firestore snapshot received. Exists?",
								docSnap.exists,
							);
							if (docSnap.exists) {
								setCurrentUserData({
									uid: user.uid,
									role: userRole,
									restaurantId: restId,
									...docSnap.data(),
								});
							} else {
								console.log("[AUTH] 6a. Document does not exist in Firestore.");
								setCurrentUserData({
									uid: user.uid,
									role: userRole,
									restaurantId: restId,
								});
							}
							setIsLoading(false);
						},
						(firestoreError) => {
							console.error(
								"[AUTH] ❌ Firestore snapshot ERROR:",
								firestoreError,
							);
							setIsLoading(false);
						},
					);

					setCurrentUser(user);

					return () => {
						console.log("[AUTH] Cleaning up Firestore listener.");
						unsubDoc();
					};
				} catch (error) {
					console.error(
						"[AUTH] ❌ CRITICAL ERROR inside onAuthStateChanged:",
						error,
					);
					setIsLoading(false);
				}
			} else {
				console.log("[AUTH] No user logged in. Clearing state.");
				setCurrentUser(null);
				setCurrentUserData(null);
				setIsLoading(false);
			}
		});

		return () => {
			console.log("[AUTH] Cleaning up auth subscriber.");
			subscriber();
		};
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
		async (confirmation, verificationCode) => {
			setAuthError(null);
			setIsLoading(true);

			if (!verificationCode || verificationCode.trim().length !== 6) {
				setIsLoading(false);
				setAuthError("Please enter a valid 6-digit verification code.");
				return;
			}

			try {
				console.log(
					"Verifying code:",
					verificationCode.substring(0, 2) + "***",
				);

				const userCredential = await confirmation.confirm(
					verificationCode.trim(),
				);
				const user = userCredential.user;

				console.log("Phone auth successful, user:", user.uid);

				// DO NOTHING HERE
				// Profile will be completed in CompleteProfileScreen
				// onAuthStateChanged + CustomerDashboard will redirect automatically
			} catch (error) {
				console.error("Phone verification error:", error);
				if (error.code === "auth/invalid-verification-code") {
					setAuthError("Invalid code. Please try again.");
				} else if (error.code === "auth/code-expired") {
					setAuthError("Code expired. Request a new one.");
				} else {
					setAuthError(`Verification failed: ${error.message}`);
				}
				throw error;
			} finally {
				setIsLoading(false);
			}
		},
		[],
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
				"A password reset link has been sent to your email.",
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
