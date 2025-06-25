// src/context/authContext.js
import React, {
	createContext,
	useState,
	useEffect,
	useContext,
	useCallback,
} from "react";
import {
	getAuth,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signOut,
	signInAnonymously,
	sendPasswordResetEmail,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db, functions } from "../config/firebase";
import { httpsCallable } from "firebase/functions";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
	const [currentUser, setCurrentUser] = useState(null);
	const [currentUserData, setCurrentUserData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [authError, setAuthError] = useState(null);
	const [redirectPath, setRedirectPath] = useState(null);

	const auth = getAuth();

	// This single listener is now the source of truth for the user's auth state.
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			setIsLoading(true);
			if (user) {
				// --- Logic to determine user's role and data ---
				let collectionName;
				let userRole;
				let restId;

				// 1. Check if user is anonymous (a guest).
				if (user.isAnonymous) {
					userRole = "guest";
					console.log(`AuthContext: Guest user detected. UID: ${user.uid}`);
					setCurrentUserData({ uid: user.uid, role: userRole });
					setCurrentUser(user);
					setIsLoading(false);
					return; // Stop here for guests.
				}

				// 2. For non-guest users, get their auth token to read their custom role.
				const tokenResult = await user.getIdTokenResult(true);
				userRole = tokenResult.claims.role || "customer"; // Default to 'customer'
				restId =
					tokenResult.claims.restaurantId ||
					(userRole !== "customer" ? user.uid : null);

				console.log(
					`AuthContext: Full user authenticated. Role: "${userRole}", RestaurantID: "${restId}"`
				);

				// 3. Listen to the correct Firestore document based on the role.
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
						// This can happen briefly during signup before the onUserCreate trigger runs.
						// We set a temporary user data object so the app knows the user is logged in.
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
				return () => unsubDoc(); // Cleanup document listener
			} else {
				// No user is signed in.
				setCurrentUser(null);
				setCurrentUserData(null);
				setIsLoading(false);
			}
		});
		return () => unsubscribe(); // Cleanup auth state listener on component unmount
	}, []);

	// --- Action Functions ---

	const login = useCallback(
		async (email, password) => {
			setAuthError(null);
			try {
				await signInWithEmailAndPassword(auth, email, password);
				// The onAuthStateChanged listener handles the rest.
			} catch (error) {
				console.error("Login Error:", error.code);
				setAuthError(error.message || "Invalid email or password.");
				throw error;
			}
		},
		[auth]
	);

	// Calls a Cloud Function to securely create the auth user and set their role.
	const signup = useCallback(async (email, password, role, additionalData) => {
		setAuthError(null);
		try {
			const createUserAccount = httpsCallable(functions, "createUserAccount");

			// Step 1: Create user via Cloud Function
			await createUserAccount({ email, password, role, additionalData });

			// ✅ Step 2: Immediately sign in the user on the client
			await signInWithEmailAndPassword(auth, email, password);

			// The onAuthStateChanged listener will now trigger and hydrate user state
		} catch (error) {
			console.error("Signup Error:", error);
			setAuthError(error.message);
			throw error;
		}
	}, []);

	const continueAsGuest = useCallback(async () => {
		setAuthError(null);
		try {
			await signInAnonymously(auth);
			// The listener will automatically handle setting the guest state.
		} catch (error) {
			console.error("Error signing in as guest:", error);
			setAuthError("Could not start a guest session.");
			throw error;
		}
	}, [auth]);

	const logout = useCallback(
		async (redirectTo = null) => {
			if (redirectTo) setRedirectPath(redirectTo);
			try {
				await signOut(auth);
			} catch (error) {
				console.error("Logout Error:", error);
			}
		},
		[auth]
	);

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
		// No signInWithGoogle here as requested
	};

	return (
		<AuthContext.Provider value={value}>
			{!isLoading && children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => useContext(AuthContext);
