// src/context/authContext.js
import React, {
	createContext,
	useState,
	useEffect,
	useContext,
	useCallback,
} from "react";
import { Alert } from "react-native";

import { auth, db, functions } from "../config/firebase.native";
import { httpsCallable } from "@react-native-firebase/functions";
// 🚨 NEW: Import Google Sign-In
import { GoogleSignin } from "@react-native-google-signin/google-signin";

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
				try {
					let userRole = "customer";
					let restId = null;

					if (user.isAnonymous) {
						userRole = "guest";
						setCurrentUserData({ uid: user.uid, role: userRole });
						setCurrentUser(user);
						setIsLoading(false);
						return;
					} else {
						const tokenResult = await user.getIdTokenResult();
						userRole = tokenResult.claims.role || "customer";
						restId = tokenResult.claims.restaurantId || null;
					}

					const collectionName = ["owner", "manager", "worker"].includes(
						userRole,
					)
						? "restaurants"
						: "customers";

					const docRef = db.collection(collectionName).doc(user.uid);
					const unsubDoc = docRef.onSnapshot(
						(docSnap) => {
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
						},
						(err) => {
							console.error("[AUTH] Firestore snapshot error:", err);
							setIsLoading(false);
						},
					);

					setCurrentUser(user);
					return () => unsubDoc();
				} catch (error) {
					console.error("[AUTH] CRITICAL ERROR:", error);
					setIsLoading(false);
				}
			} else {
				setCurrentUser(null);
				setCurrentUserData(null);
				setIsLoading(false);
			}
		});

		return () => subscriber();
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
			const createUserAccount = httpsCallable(functions, "createUserAccount");
			await createUserAccount({ email, password, role, additionalData });
			await auth.signInWithEmailAndPassword(email, password);
		} catch (error) {
			setAuthError(error.message);
			throw error;
		}
	}, []);

	// 🚨 NEW: Google Sign-In Integration
	const signInWithGoogle = useCallback(async () => {
		setAuthError(null);
		setIsLoading(true);

		try {
			// Check for Google Play Services (Android mainly)
			await GoogleSignin.hasPlayServices({
				showPlayServicesUpdateDialog: true,
			});

			// Get the ID token from Google
			const { idToken, user: googleUser } = await GoogleSignin.signIn();

			// Create a Firebase credential
			const googleCredential = auth.GoogleAuthProvider.credential(idToken);

			// Sign in to Firebase
			const userCredential = await auth.signInWithCredential(googleCredential);
			const user = userCredential.user;

			// Sync user to Firestore if they are new
			const userDoc = await db.collection("customers").doc(user.uid).get();
			if (!userDoc.exists) {
				await db
					.collection("customers")
					.doc(user.uid)
					.set({
						email: user.email,
						displayName: user.displayName || googleUser.name,
						role: "customer",
						createdAt: new Date().toISOString(),
					});
			}
		} catch (error) {
			console.error("Google Sign-In error:", error);
			setAuthError("Google Sign-In failed or was canceled.");
			throw error;
		} finally {
			setIsLoading(false);
		}
	}, []);

	const signInWithPhoneCredential = useCallback(
		async (confirmation, verificationCode, formValues) => {
			setAuthError(null);
			setIsLoading(true);

			try {
				const userCredential = await confirmation.confirm(
					verificationCode.trim(),
				);
				const user = userCredential.user;

				if (formValues) {
					await db.collection("customers").doc(user.uid).set(
						{
							phoneNumber: formValues.fullPhoneNumber,
							isPhoneVerified: true,
							role: "customer",
							createdAt: new Date().toISOString(),
						},
						{ merge: true },
					);
				}
			} catch (error) {
				console.error("Phone verification error:", error);
				if (error.code === "auth/invalid-verification-code") {
					setAuthError("Invalid code. Try again.");
				} else if (error.code === "auth/code-expired") {
					setAuthError("Code expired. Request a new one.");
				} else {
					setAuthError(error.message);
				}
				throw error;
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	const signInWithTwilioCustomToken = useCallback(
		async (customToken, fullPhoneNumber) => {
			setAuthError(null);
			setIsLoading(true);

			try {
				const userCredential = await auth.signInWithCustomToken(customToken);
				const user = userCredential.user;

				await db.collection("customers").doc(user.uid).set(
					{
						phoneNumber: fullPhoneNumber,
						isPhoneVerified: true,
						role: "customer",
						createdAt: new Date().toISOString(),
					},
					{ merge: true },
				);
			} catch (error) {
				console.error("Twilio Custom Token verification error:", error);
				setAuthError("Invalid WhatsApp code or token expired.");
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
		signInWithTwilioCustomToken,
		signInWithGoogle, // 🚨 NEW: Exported to UI
	};

	return (
		<AuthContext.Provider value={value}>
			{!isLoading && children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => useContext(AuthContext);
