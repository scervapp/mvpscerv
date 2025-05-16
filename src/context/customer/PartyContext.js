// src/context/customer/PartyContext.js
import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useCallback,
} from "react";
import { Alert } from "react-native";
import {
	doc,
	onSnapshot,
	collection,
	query,
	where,
	limit,
	getDocs,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../authContext";

// --- Create Context ---
export const PartyContext = createContext({
	currentPartyId: null,
	partyStatus: null, // 'pending', 'active', 'completed', 'cancelled', null
	partyDetails: null,
	isLoadingParty: false,
	partyError: null,
	sharedBasketItems: [],
	isLoadingBasket: false,
	createParty: async (restaurantId, restaurantName) => {},
	joinParty: async (inviteData) => {}, // inviteData can be { partyId } or { inviteCode }
	leaveParty: async () => {},
	activatePartyCheckIn: async (checkInDocId) => {},
	inviteToParty: async () => {},
	cancelParty: async () => {},
	clearPartyState: () => {},
	addLocalPIPToParty: async (partyId, localPIPId, localPIPName) => {},
});

// --- Create Provider Component ---
export const PartyProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);

	const [currentPartyId, setCurrentPartyId] = useState(null);
	const [partyStatus, setPartyStatus] = useState(null);
	const [partyDetails, setPartyDetails] = useState(null);
	const [isLoadingPartyAction, setIsLoadingPartyAction] = useState(false); // Loading for actions like create/join/leave
	const [isInitializing, setIsInitializing] = useState(true); // <<< NEW: Loading state for initial check/listener
	const [isInitializingParty, setIsInitializingParty] = useState(true); // For initial party check
	const [partyError, setPartyError] = useState(null);
	const [sharedBasketItems, setSharedBasketItems] = useState([]);
	const [isLoadingBasket, setIsLoadingBasket] = useState(true);
	const [isCheckingExistingParty, setIsCheckingExistingParty] = useState(true);
	const [isPartyDetailsListenerLoading, setIsPartyDetailsListenerLoading] =
		useState(false);

	// --- Cloud Function References ---
	const createPartyFunction = httpsCallable(functions, "createParty");
	const joinPartyFunction = httpsCallable(functions, "joinParty");
	const leavePartyFunction = httpsCallable(functions, "leaveParty");
	const activatePartyCheckInFunction = httpsCallable(
		functions,
		"activatePartyCheckIn"
	); // Assuming this exists or will be created
	const cancelPartyFunction = httpsCallable(functions, "cancelParty");
	const inviteToPartyFunction = httpsCallable(functions, "inviteToParty");
	const addLocalPIPToPartyFunction = httpsCallable(
		functions,
		"addLocalPIPToParty"
	);
	const addItemToPartyBasketFunction = httpsCallable(
		functions,
		"addItemToSharedBasket"
	);
	const updatePartyBasketItemQuantityFunction = httpsCallable(
		functions,
		"updateSharedBasketItemQuantity"
	);
	const removePartyBasketItemFunction = httpsCallable(
		functions,
		"removeSharedBasketItem"
	);

	// --- Clear State ---
	const clearPartyState = useCallback(() => {
		console.log("PartyContext: Clearing party state.");
		setCurrentPartyId(null);
		setPartyStatus(null);
		setPartyDetails(null);
		setSharedBasketItems([]); // Also clear shared basket items
		setIsLoadingPartyAction(false);
		setPartyError(null);
		setIsLoadingBasket(false); // No basket to load if no party
	}, []);

	// --- NEW: Effect to check for existing party on load ---
	useEffect(() => {
		let isMounted = true;
		if (!currentUserData?.uid) {
			console.log(
				"PartyContext: No user, clearing party state and stopping initial check."
			);
			clearPartyState();
			setIsCheckingExistingParty(false); // Finished this check (no user)
			return;
		}

		if (currentPartyId || !isCheckingExistingParty) {
			// If a partyId is already set (e.g., by createParty/joinParty or from route params via a loadPartyById call),
			// or if we've already completed the initial check, don't re-run the queries.
			// The partyDetails listener will take over if currentPartyId is set.
			// If currentPartyId is null AND isCheckingExistingParty is false, it means no party was found.
			if (!currentPartyId) setIsCheckingExistingParty(false); // Ensure it's false if no party ID
			return;
		}
		console.log(
			"PartyContext: Starting initial check for existing party for user:",
			currentUserData.uid
		);

		const checkForExistingParty = async (userId) => {
			setPartyError(null);
			try {
				const partiesRef = collection(db, "parties");
				const hostQuery = query(
					partiesRef,
					where("hostUserId", "==", userId),
					where("status", "in", ["pending", "active"]),
					limit(1)
				);
				const guestQuery = query(
					partiesRef,
					where("guestUserIds", "array-contains", userId),
					where("status", "in", ["pending", "active"]),
					limit(1)
				);

				const [hostSnapshot, guestSnapshot] = await Promise.all([
					getDocs(hostQuery),
					getDocs(guestQuery),
				]);
				let foundPartyDoc = null;
				if (!hostSnapshot.empty) foundPartyDoc = hostSnapshot.docs[0];
				else if (!guestSnapshot.empty) foundPartyDoc = guestSnapshot.docs[0];

				if (isMounted && foundPartyDoc) {
					const partyData = foundPartyDoc.data();
					console.log(
						`PartyContext: Found existing party ${foundPartyDoc.id}, status: ${partyData.status}. Setting currentPartyId.`
					);
					setCurrentPartyId(foundPartyDoc.id); // This will trigger the partyDetails listener
					// setPartyStatus(partyData.status); // Listener will set this
					// setPartyDetails({ id: foundPartyDoc.id, ...partyData }); // Listener will set this
				} else if (isMounted) {
					console.log(
						"PartyContext: No active/pending party found for user during initial check."
					);
					// No need to call clearPartyState here, as currentPartyId remains null
					// and other listeners won't activate.
				}
			} catch (error) {
				console.error(
					"PartyContext: Error checking for existing party:",
					error
				);
				if (isMounted) setPartyError("Failed to check party status.");
			} finally {
				if (isMounted) setIsCheckingExistingParty(false); // Finished this specific check
			}
		};

		checkForExistingParty(currentUserData.uid);

		return () => {
			isMounted = false;
		};
	}, [currentUserData?.uid, clearPartyState]); // Rerun if user changes

	// --- Listener for Party Document ---
	// Listener for Party Document Details
	useEffect(() => {
		let unsubscribeParty = () => {};
		// Only listen if initial check is done, user exists, and currentPartyId is set
		if (!isCheckingExistingParty && currentUserData?.uid && currentPartyId) {
			console.log(
				`PartyContext: Setting up listener for party details: parties/${currentPartyId}`
			);
			setIsPartyDetailsListenerLoading(true); // Start loading for this listener
			setPartyError(null);
			const partyRef = doc(db, "parties", currentPartyId);
			unsubscribeParty = onSnapshot(
				partyRef,
				(docSnap) => {
					if (docSnap.exists()) {
						const data = docSnap.data();
						console.log("PartyContext: PartyDetails snapshot received:", data);
						setPartyDetails({ id: docSnap.id, ...data });
						setPartyStatus(data.status);
						// Check if current user is still a member
						const userIsMember =
							data.hostUserId === currentUserData.uid ||
							data.guestUserIds?.includes(currentUserData.uid);
						if (
							!userIsMember &&
							data.status !== "completed" &&
							data.status !== "cancelled"
						) {
							console.log(
								"PartyContext: User no longer member of active party, clearing state."
							);
							clearPartyState();
						}
					} else {
						console.log(
							`PartyContext: Party ${currentPartyId} not found by listener or deleted.`
						);
						setPartyError("The party session was not found or has ended.");
						clearPartyState();
					}
					setIsPartyDetailsListenerLoading(false); // Done loading for this listener
				},
				(err) => {
					console.error(
						"PartyContext: Error listening to party snapshot:",
						err
					);
					setPartyError("Failed to sync party details.");
					setIsPartyDetailsListenerLoading(false);
				}
			);
		} else {
			// If no currentPartyId or still in initial check, ensure details are null and not loading
			if (partyDetails) setPartyDetails(null);
			if (partyStatus) setPartyStatus(null);
			if (isPartyDetailsListenerLoading)
				setIsPartyDetailsListenerLoading(false);
		}
		return () => {
			console.log("PartyContext: Cleaning up party details listener.");
			unsubscribeParty();
		};
	}, [
		currentPartyId,
		currentUserData?.uid,
		isCheckingExistingParty,
		clearPartyState,
	]); // Added isCheckingExistingParty

	// Listener for Shared Basket
	useEffect(() => {
		let unsubscribeBasket = () => {};
		if (
			!isCheckingExistingParty &&
			!isPartyDetailsListenerLoading &&
			currentPartyId &&
			(partyStatus === "pending" || partyStatus === "active")
		) {
			setIsLoadingBasket(true);
			const sharedBasketRef = doc(db, "shared_baskets", currentPartyId);
			console.log(
				`PartyContext: Setting up listener for shared_baskets/${currentPartyId}`
			);
			unsubscribeBasket = onSnapshot(
				sharedBasketRef,
				(docSnap) => {
					if (docSnap.exists()) {
						setSharedBasketItems(docSnap.data().items || []);
					} else {
						setSharedBasketItems([]);
					}
					setIsLoadingBasket(false);
				},
				(error) => {
					console.error(
						"PartyContext: Error listening to shared basket:",
						error
					);
					setSharedBasketItems([]);
					setIsLoadingBasket(false);
				}
			);
		} else {
			if (sharedBasketItems.length > 0) setSharedBasketItems([]);
			if (isLoadingBasket) setIsLoadingBasket(false);
		}
		return () => unsubscribeBasket();
	}, [
		currentPartyId,
		partyStatus,
		isCheckingExistingParty,
		isPartyDetailsListenerLoading,
	]); // Added more loading flags
	// --- END NEW Shared Basket Listener ---

	// --- Action: Create Party ---
	const createParty = async (restaurantId) => {
		// Log 1: Function entry and initial state check
		console.log(
			`[PartyContext.createParty] Attempting for restaurantId: ${restaurantId}. CurrentUser UID: ${currentUserData?.uid}. isLoadingPartyAction: ${isLoadingPartyAction}`
		);
		if (!currentUserData?.uid || isLoadingPartyAction) {
			console.warn(
				`[PartyContext.createParty] Aborted: Missing UID or action already in progress.`
			);
			return null;
		}
		console.log(`PartyContext: Attempting to create party for ${restaurantId}`);
		setIsLoadingPartyAction(true);
		setPartyError(null);
		setIsCheckingExistingParty(false);
		try {
			// Log 3: Before calling the Cloud Function
			console.log(
				`[PartyContext.createParty] Calling Firebase Cloud Function 'createPartyFunction' with restaurantId: ${restaurantId}`
			);
			const result = await createPartyFunction({
				restaurantId,
			});
			// Log 4: After Cloud Function call, inspect the raw result
			console.log(
				`[PartyContext.createParty] Cloud Function 'createPartyFunction' result:`,
				JSON.stringify(result, null, 2) // Stringify to see the whole structure
			);
			if (result.data.success && result.data.partyId) {
				const newPartyId = result.data.partyId;
				console.log("PartyContext: Party created successfully:", newPartyId);
				setCurrentPartyId(newPartyId); // Trigger listener

				setPartyStatus("pending"); // Set initial status
				// Log 8: Returning newPartyId (navigation will happen outside this function)
				console.log(
					`[PartyContext.createParty] Successfully processed. Returning newPartyId: ${newPartyId}`
				);
				// Navigate to Lobby (pass necessary info)
				return newPartyId;
			} else {
				throw new Error(result.data.error || "Failed to create party.");
			}
		} catch (error) {
			console.error("PartyContext: Error creating party:", error);
			setPartyError(`Could not create party: ${error.message}`);
			Alert.alert("Error", `Could not create party: ${error.message}`);
		} finally {
			// Log 11: Finally block, resetting action loading state
			console.log(
				`[PartyContext.createParty] FINALLY BLOCK: Setting isLoadingPartyAction: false`
			);
			setIsLoadingPartyAction(false);
		}
	};

	// --- Action: Join Party ---
	const joinParty = async (inviteData) => {
		// inviteData = { partyId: '...' } OR { inviteCode: '...' }
		if (!currentUserData?.uid || isLoadingPartyAction) return;
		console.log("PartyContext: Attempting to join party with:", inviteData);
		setIsLoadingPartyAction(true);
		setPartyError(null);
		try {
			const result = await joinPartyFunction(inviteData);
			if (result.data.success && result.data.partyId) {
				const joinedPartyId = result.data.partyId;
				console.log("PartyContext: Joined party successfully:", joinedPartyId);
				setCurrentPartyId(joinedPartyId); // Trigger listener
				setPartyStatus("pending"); // Assume pending initially
				return joinedPartyId;
			} else {
				throw new Error(result.data.error || "Failed to join party.");
			}
		} catch (error) {
			console.error("PartyContext: Error joining party:", error);
			setPartyError(`Could not join party: ${error.message}`);
			Alert.alert("Error", `Could not join party: ${error.message}`);
		} finally {
			setIsLoadingPartyAction(false);
		}
	};

	// --- Action: Leave Party ---
	const leaveParty = async () => {
		if (!currentUserData?.uid || !currentPartyId || isLoadingPartyAction)
			return;
		// Confirmation Alert is handled in the UI component calling this
		console.log(`PartyContext: Attempting to leave party: ${currentPartyId}`);
		setIsLoadingPartyAction(true);
		setPartyError(null);
		try {
			const result = await leavePartyFunction({ partyId: currentPartyId });
			if (result.data.success) {
				console.log("PartyContext: Left party successfully.");
				clearPartyState(); // Clear state after leaving
				// Navigation back is handled in the UI component
			} else {
				throw new Error(result.data.error || "Failed to leave party.");
			}
		} catch (error) {
			console.error("PartyContext: Error leaving party:", error);
			setPartyError(`Could not leave party: ${error.message}`);
			Alert.alert("Error", `Could not leave party: ${error.message}`);
			// Don't clear state on error, user is technically still in
			setIsLoadingPartyAction(false); // Ensure loading stops on error
		}
		// No finally here, state cleared on success path
	};

	// --- Action: Activate Party on Check-in ---
	const activatePartyCheckIn = async (checkInDocId) => {
		if (
			!currentUserData?.uid ||
			!currentPartyId ||
			partyStatus !== "pending" ||
			isLoadingPartyAction
		) {
			console.log("PartyContext: activatePartyCheckIn prerequisites not met.", {
				currentPartyId,
				partyStatus,
				isLoadingPartyAction,
			});
			return; // Only host of a pending party can activate
		}
		// Add check: Ensure current user is the host? (Backend function also checks)
		if (partyDetails?.hostUserId !== currentUserData.uid) {
			console.log(
				"PartyContext: Only the host can activate the party check-in."
			);
			return;
		}

		console.log(
			`PartyContext: Activating party ${currentPartyId} with checkIn ${checkInDocId}`
		);
		setIsLoadingPartyAction(true); // Use general loading or a specific one?
		setPartyError(null);
		try {
			const result = await activatePartyCheckInFunction({
				partyId: currentPartyId,
				checkInDocId: checkInDocId,
			});
			if (result.data.success) {
				console.log("PartyContext: Party activated successfully.");
				// State (status, checkInId) will update via the listener
			} else {
				throw new Error(result.data.error || "Failed to activate party.");
			}
		} catch (error) {
			console.error("PartyContext: Error activating party:", error);
			setPartyError(`Could not activate party: ${error.message}`);
			Alert.alert("Error", `Could not activate party: ${error.message}`);
		} finally {
			setIsLoadingPartyAction(false);
		}
	};

	// --- NEW Action: Cancel Party (for Host) ---
	const cancelParty = async () => {
		if (!currentUserData?.uid || !currentPartyId || isLoadingPartyAction)
			return;
		// Add host check? Backend function will verify anyway.
		// if (partyDetails?.hostUserId !== currentUserData.uid) return;

		// Confirmation Alert is handled in the UI component
		console.log(`PartyContext: Attempting to cancel party: ${currentPartyId}`);
		setIsLoadingPartyAction(true);
		setPartyError(null);
		try {
			const result = await cancelPartyFunction({ partyId: currentPartyId });
			if (result.data.success) {
				console.log("PartyContext: Cancelled party successfully.");
				clearPartyState(); // Clear state after cancelling
			} else {
				throw new Error(result.data.error || "Failed to cancel party.");
			}
		} catch (error) {
			console.error("PartyContext: Error cancelling party:", error);
			setPartyError(`Could not cancel party: ${error.message}`);
			Alert.alert("Error", `Could not cancel party: ${error.message}`);
			setIsLoadingPartyAction(false); // Reset loading only on error
		}
		// No finally needed
	};

	const addLocalPIPToParty = async (partyId, localPipId, localPipName) => {
		if (
			!currentUserData?.uid ||
			!partyId ||
			!localPipId ||
			!localPipName ||
			isLoadingPartyAction
		) {
			console.warn("addLocalPipToParty prerequisites not met");
			return null; // Indicate failure
		}

		// Optional: Client-side host check (backend also checks)
		if (partyDetails?.hostUserId !== currentUserData.uid) {
			Alert.alert("Error", "Only the host can add guests.");
			return null;
		}

		console.log(
			`PartyContext: Attempting to add local PIP ${localPipId} (${localPipName}) to party ${partyId}`
		);
		setIsLoadingPartyAction(true);
		setPartyError(null);

		try {
			const result = await addLocalPipToPartyFunction({
				partyId,
				localPipId,
				localPipName,
			});

			if (result.data.success) {
				console.log("PartyContext: Local PIP added successfully.");
				// The party listener will update the UI with the new guest
				return { success: true };
			} else {
				throw new Error(result.data.error || "Failed to add local PIP.");
			}
		} catch (error) {
			console.error("PartyContext: Error adding local PIP:", error);
			setPartyError(`Add local PIP failed: ${error.message}`);
			Alert.alert("Error", `Could not add local PIP: ${error.message}`);
			return null; // Indicate failure
		} finally {
			setIsLoadingPartyAction(false);
		}
	};

	// --- Action: Invite to Party ---
	const inviteToParty = async (inviteData) => {
		// inviteData = { partyId: '...', inviteeUserId: '...' } OR { partyId: '...', generateCode: true }
		if (!currentUserData?.uid || !inviteData?.partyId || isLoadingPartyAction) {
			console.warn("inviteToParty prerequisites not met", {
				uid: currentUserData?.uid,
				partyId: inviteData?.partyId,
				isLoading: isLoadingPartyAction,
			});
			// Optionally throw an error or return a specific failure object
			return null; // Indicate failure or inability to proceed
		}

		// Optional: Client-side check if current user is the host (backend also checks)
		if (partyDetails?.hostUserId !== currentUserData.uid) {
			Alert.alert("Error", "Only the host can send invites.");
			return null;
		}

		console.log(
			`PartyContext: Attempting invite for party ${inviteData.partyId}`,
			inviteData
		);
		setIsLoadingPartyAction(true);
		setPartyError(null);

		try {
			// Call the cloud function, passing the necessary data
			const result = await inviteToPartyFunction(inviteData);

			if (result.data.success) {
				console.log("PartyContext: Invite action successful.");
				// If a code was generated, the function returns it
				if (result.data.inviteCode) {
					console.log("Generated invite code:", result.data.inviteCode);
					// Return the result so the UI can display the code/expiry
					return {
						success: true,
						inviteCode: result.data.inviteCode,
						expiresAt: result.data.expiresAt,
					};
				}
				// If inviting a specific user, just return success
				return { success: true };
			} else {
				// Handle specific errors returned from the function
				throw new Error(result.data.error || "Failed to process invite.");
			}
		} catch (error) {
			console.error("PartyContext: Error inviting to party:", error);
			setPartyError(`Invite failed: ${error.message}`);
			Alert.alert("Invite Error", `Could not process invite: ${error.message}`);
			return null; // Indicate failure
		} finally {
			setIsLoadingPartyAction(false);
		}
	};
	// --- End Invite Action ---

	// --- Context Value ---
	const value = {
		currentPartyId,
		partyStatus,
		partyDetails,
		isLoadingParty:
			isLoadingPartyAction ||
			isCheckingExistingParty ||
			isPartyDetailsListenerLoading ||
			isLoadingBasket,
		partyError,
		sharedBasketItems,
		createParty,
		joinParty,
		leaveParty,
		activatePartyCheckIn,
		clearPartyState,
		inviteToParty,
		cancelParty,
		addLocalPIPToParty,
	};

	return (
		<PartyContext.Provider value={value}>{children}</PartyContext.Provider>
	);
};

// --- Custom Hook for easy consumption ---
export const useParty = () => {
	return useContext(PartyContext);
};
