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
			console.log("Additional Data", additionalData);
			setAuthError(null);
			setIsLoading(true);
			try {
				// 1. Confirm the verification code to sign the user in
				const userCredential = await confirmation.confirm(verificationCode);
				const user = userCredential.user;

				// 2. This now runs only if `additionalData` (first name, last name) is provided,
				// which happens during the initial signup flow.
				if (additionalData) {
					const userDocRef = doc(db, "customers", user.uid);

					// 3. Use `setDoc` with `{ merge: true }`.
					// This will CREATE the document if it doesn't exist, or
					// UPDATE the firstName and lastName fields if it already exists.
					// This resolves the race condition permanently.
					await setDoc(
						userDocRef,
						{
							firstName: additionalData.firstName,
							lastName: additionalData.lastName,
							// We also include the other essential fields in case this runs first.
							uid: user.uid,
							phoneNumber: user.phoneNumber,
							role: "customer",
							createdAt: new Date(),
						},
						{ merge: true }
					);
				}
				// The onAuthStateChanged listener will handle setting the final user data in state.
			} catch (error) {
				if (error.code === "auth/invalid-verification-code") {
					setAuthError("Invalid code. Please try again.");
				} else {
					setAuthError(error.message);
				}
				throw error;
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
