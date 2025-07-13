// src/context/authContext.js
import React, {
	createContext,
	useState,
	useEffect,
	useContext,
	useCallback,
} from "react";
import auth from "@react-native-firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db, functions } from "../config/firebase";
import { httpsCallable } from "firebase/functions";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
	const [currentUser, setCurrentUser] = useState(null);
	const [currentUserData, setCurrentUserData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [authError, setAuthError] = useState(null);
	const [redirectPath, setRedirectPath] = useState(null);

	// This single listener is now the source of truth for the user's auth state.
	useEffect(() => {
		// --- Use the onAuthStateChanged listener from @react-native-firebase/auth ---
		const subscriber = auth().onAuthStateChanged(async (user) => {
			setIsLoading(true);
			if (user) {
				let collectionName;
				let userRole;
				let restId;

				if (user.isAnonymous) {
					userRole = "guest";
					console.log(`AuthContext: Guest user detected. UID: ${user.uid}`);
					setCurrentUserData({ uid: user.uid, role: userRole });
					setCurrentUser(user);
					setIsLoading(false);
					return;
				}

				// The logic for getting claims remains the same
				const tokenResult = await user.getIdTokenResult(true);
				userRole = tokenResult.claims.role || "customer";
				restId =
					tokenResult.claims.restaurantId ||
					(userRole !== "customer" ? user.uid : null);

				console.log(
					`AuthContext: Full user authenticated. Role: "${userRole}", RestaurantID: "${restId}"`
				);

				collectionName = ["owner", "manager", "worker"].includes(userRole)
					? "restaurants"
					: "customers";
				const docRef = doc(db, collectionName, user.uid);

				const unsubDoc = onSnapshot(docRef, (docSnap) => {
					if (docSnap.exists()) {
						setCurrentUserData({
							uid: user.uid,
							role: userRole,
							restaurantId: restId,
							...docSnap.data(),
						});
					} else {
						console.warn(
							`AuthContext: No Firestore document yet for user ${user.uid}. Awaiting creation...`
						);
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
		return subscriber; // unsubscribe on unmount
	}, []);

	// --- Action Functions ---

	const login = useCallback(async (email, password) => {
		setAuthError(null);
		try {
			// Use the new auth() function
			await auth().signInWithEmailAndPassword(email, password);
		} catch (error) {
			console.error("Login Error:", error.code);
			setAuthError(error.message || "Invalid email or password.");
			throw error;
		}
	}, []);

	// Calls a Cloud Function to securely create the auth user and set their role.
	const signup = useCallback(async (email, password, role, additionalData) => {
		setAuthError(null);
		try {
			const createUserAccount = httpsCallable(functions, "createUserAccount");
			await createUserAccount({ email, password, role, additionalData });
			// Use the new auth() function
			await auth().signInWithEmailAndPassword(email, password);
		} catch (error) {
			console.error("Signup Error:", error);
			setAuthError(error.message);
			throw error;
		}
	}, []);

	const signInWithPhoneCredential = useCallback(
		async (confirmation, verificationCode, additionalData) => {
			setAuthError(null);
			setIsLoading(true);
			try {
				const userCredential = await confirmation.confirm(verificationCode);
				const user = userCredential.user;

				if (additionalData) {
					const userDocRef = doc(db, "customers", user.uid);
					const userDoc = await getDoc(userDocRef);

					if (!userDoc.exists()) {
						console.log(
							"New phone user detected. Creating customer document..."
						);
						await setDoc(userDocRef, {
							uid: user.uid,
							phoneNumber: user.phoneNumber,
							firstName: additionalData.firstName,
							lastName: additionalData.lastName,
							role: "customer",
							createdAt: new Date(),
						});
					}
				}
			} catch (error) {
				console.error("Phone Sign-In Error:", error);
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
		[db]
	);

	const continueAsGuest = useCallback(async () => {
		setAuthError(null);
		try {
			// Use the new auth() function
			await auth().signInAnonymously();
		} catch (error) {
			console.error("Error signing in as guest:", error);
			setAuthError("Could not start a guest session.");
			throw error;
		}
	}, []);

	const logout = useCallback(async (redirectTo = null) => {
		if (redirectTo) setRedirectPath(redirectTo);
		try {
			// Use the new auth() function
			await auth().signOut();
		} catch (error) {
			console.error("Logout Error:", error);
		}
	}, []);

	const sendPasswordResetEmail = useCallback(async (email) => {
		setAuthError(null);
		try {
			await auth().sendPasswordResetEmail(email);
			Alert.alert(
				"Password Reset",
				"A password reset link has been sent to your email."
			);
		} catch (error) {
			console.error("Password Reset Error:", error);
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
		sendPasswordResetEmail, // Keep your password reset function if needed

		signInWithPhoneCredential,
	};

	return (
		<AuthContext.Provider value={value}>
			{!isLoading && children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => useContext(AuthContext);
