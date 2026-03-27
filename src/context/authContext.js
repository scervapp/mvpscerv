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
					let userRole = "customer";
					let restId = null;

					if (user.isAnonymous) {
						const customerDoc = await db
							.collection("customers")
							.doc(user.uid)
							.get();

						if (!customerDoc.exists) {
							console.log("[AUTH] 3a. True anonymous user → guest");
							userRole = "guest";
							setCurrentUserData({ uid: user.uid, role: userRole });
							setCurrentUser(user);
							setIsLoading(false);
							return;
						}

						console.log("[AUTH] 3b. Bypassed customer detected (doc exists)");
						// ← NO early return anymore — we want the listener below
					} else {
						// Normal authenticated flow (phone/email)
						const tokenResult = await user.getIdTokenResult();
						userRole = tokenResult.claims.role || "customer";
						restId = tokenResult.claims.restaurantId || null;
					}

					// ← This now runs for BOTH bypassed anonymous AND real users
					const collectionName = ["owner", "manager", "worker"].includes(
						userRole,
					)
						? "restaurants"
						: "customers";

					console.log(
						`[AUTH] 5. Attaching listener to /${collectionName}/${user.uid}`,
					);

					const docRef = db.collection(collectionName).doc(user.uid);
					const unsubDoc = docRef.onSnapshot(
						(docSnap) => {
							if (docSnap.exists) {
								setCurrentUserData({
									uid: user.uid,
									role: userRole,
									restaurantId: restId,
									...docSnap.data(), // ← phoneNumber will be here
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

	const bypassPhoneAuth = useCallback(async (phoneNumber) => {
		setAuthError(null);
		setIsLoading(true);

		console.log("[BYPASS] 1. Received phoneNumber from screen:", phoneNumber);

		if (
			!phoneNumber ||
			(!phoneNumber.startsWith("+507") && !phoneNumber.startsWith("+1"))
		) {
			console.error("[BYPASS] ❌ Invalid or missing phoneNumber passed!");
			setAuthError("Invalid phone number");
			return;
		}

		try {
			const userCredential = await auth.signInAnonymously();
			const uid = userCredential.user.uid;

			console.log("[BYPASS] 2. Anonymous sign-in successful. UID:", uid);

			const customerData = {
				phoneNumber: phoneNumber, // ← this is what we want to see
				isPhoneVerified: false,
				role: "customer",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				bypassMode: true, // extra flag so we know it's bypassed
			};

			console.log("[BYPASS] 3. About to write this data:", customerData);

			await db
				.collection("customers")
				.doc(uid)
				.set(customerData, { merge: true });

			console.log("[BYPASS] 4. Write completed successfully!");

			// Double-check it actually saved
			const verifyDoc = await db.collection("customers").doc(uid).get();
			const verifiedData = verifyDoc.data();

			console.log("[BYPASS] 5. VERIFIED doc from Firestore:", verifiedData);
			console.log(
				"[BYPASS] 6. phoneNumber in Firestore right now:",
				verifiedData?.phoneNumber,
			);

			if (verifiedData?.phoneNumber === phoneNumber) {
				console.log("[BYPASS] ✅ SUCCESS — phoneNumber was saved correctly");
			} else {
				console.error(
					"[BYPASS] ❌ PhoneNumber is STILL null/missing after write!",
				);
			}
		} catch (error) {
			console.error("[BYPASS] Critical error:", error.code, error.message);
			setAuthError("Bypass failed — check console");
			throw error;
		} finally {
			// Listener will handle the rest
		}
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
		async (confirmation, verificationCode, formValues) => {
			// ← added 3rd param
			setAuthError(null);
			setIsLoading(true);

			try {
				const userCredential = await confirmation.confirm(
					verificationCode.trim(),
				);
				const user = userCredential.user;
				console.log("[PHONE] ✅ Verified! uid:", user.uid);

				// ← Create customer doc here too for REAL phone auth (prevents null phoneNumber)
				if (formValues) {
					await db
						.collection("customers")
						.doc(user.uid)
						.set(
							{
								phoneNumber: `${formValues.countryCode || "+507"}${formValues.phoneNumber}`,
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
		bypassPhoneAuth,
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
