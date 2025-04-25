// src/context/customer/PartyContext.js
import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useCallback,
} from "react";
import { Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "./authContext"; // Assuming authContext provides currentUserData

// --- Create Context ---
export const PartyContext = createContext({
	currentPartyId: null,
	partyStatus: null, // 'pending', 'active', 'completed', 'cancelled', null
	partyDetails: null,
	isLoadingParty: false,
	partyError: null,
	createParty: async (restaurantId, restaurantName) => {},
	joinParty: async (inviteData) => {}, // inviteData can be { partyId } or { inviteCode }
	leaveParty: async () => {},
	activatePartyCheckIn: async (checkInDocId) => {},
	clearPartyState: () => {},
});

// --- Create Provider Component ---
export const PartyProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);
	const navigation = useNavigation();

	const [currentPartyId, setCurrentPartyId] = useState(null);
	const [partyStatus, setPartyStatus] = useState(null);
	const [partyDetails, setPartyDetails] = useState(null);
	const [isLoadingParty, setIsLoadingParty] = useState(false); // Loading for actions like create/join/leave
	const [isListening, setIsListening] = useState(false); // Loading for listener setup
	const [partyError, setPartyError] = useState(null);

	// --- Cloud Function References ---
	const createPartyFunction = httpsCallable(functions, "createParty");
	const joinPartyFunction = httpsCallable(functions, "joinParty");
	const leavePartyFunction = httpsCallable(functions, "leaveParty");
	const activatePartyCheckInFunction = httpsCallable(
		functions,
		"activatePartyCheckIn"
	); // Assuming this exists or will be created

	// --- Clear State ---
	const clearPartyState = useCallback(() => {
		console.log("PartyContext: Clearing party state.");
		setCurrentPartyId(null);
		setPartyStatus(null);
		setPartyDetails(null);
		setIsLoadingParty(false);
		setPartyError(null);
	}, []);

	// --- Listener for Party Document ---
	useEffect(() => {
		let unsubscribe = () => {}; // Initialize unsubscribe function

		if (currentUserData?.uid && currentPartyId) {
			console.log(
				`PartyContext: Setting up listener for party ID: ${currentPartyId}`
			);
			setIsListening(true); // Indicate listener setup is in progress
			setPartyError(null);
			const partyRef = doc(db, "parties", currentPartyId);

			unsubscribe = onSnapshot(
				partyRef,
				(docSnap) => {
					if (docSnap.exists()) {
						const data = docSnap.data();
						console.log("PartyContext: Snapshot received:", data);
						setPartyDetails({ id: docSnap.id, ...data });
						setPartyStatus(data.status); // Update status from snapshot
						// Check if the current user is still part of the party
						const userIsMember =
							data.hostUserId === currentUserData.uid ||
							data.guestUserIds?.includes(currentUserData.uid);
						if (!userIsMember && data.status !== "completed") {
							// User was removed or left, clear state unless party is completed
							console.log(
								"PartyContext: User no longer member, clearing state."
							);
							clearPartyState();
						}
					} else {
						console.log(
							`PartyContext: Party ${currentPartyId} not found or deleted.`
						);
						setPartyError("The party session was not found or has ended.");
						clearPartyState(); // Clear state if party doc disappears
					}
					setIsListening(false); // Listener is active or failed
				},
				(err) => {
					console.error(
						"PartyContext: Error listening to party snapshot:",
						err
					);
					setPartyError("Failed to sync party details.");
					setIsListening(false);
					// Optionally clear state on listener error?
					// clearPartyState();
				}
			);
		} else {
			// No user or no party ID, ensure state is clear
			if (partyDetails || partyStatus || currentPartyId) {
				clearPartyState();
			}
		}

		// Cleanup listener on unmount or when partyId/user changes
		return () => {
			console.log("PartyContext: Cleaning up listener.");
			unsubscribe();
		};
	}, [currentPartyId, currentUserData?.uid, clearPartyState]); // Dependencies for the listener

	// --- Action: Create Party ---
	const createParty = async (restaurantId, restaurantName) => {
		if (!currentUserData?.uid || isLoadingParty) return;
		console.log(`PartyContext: Attempting to create party for ${restaurantId}`);
		setIsLoadingParty(true);
		setPartyError(null);
		try {
			const result = await createPartyFunction({
				restaurantId,
				restaurantName,
			});
			if (result.data.success && result.data.partyId) {
				const newPartyId = result.data.partyId;
				console.log("PartyContext: Party created successfully:", newPartyId);
				setCurrentPartyId(newPartyId); // Trigger listener
				setPartyStatus("pending"); // Set initial status
				// Navigate to Lobby (pass necessary info)
				navigation.navigate("PartyLobby", {
					partyId: newPartyId,
					// Pass restaurant details if needed, or let lobby fetch
					// restaurant: { id: restaurantId, restaurantName: restaurantName },
				});
			} else {
				throw new Error(result.data.error || "Failed to create party.");
			}
		} catch (error) {
			console.error("PartyContext: Error creating party:", error);
			setPartyError(`Could not create party: ${error.message}`);
			Alert.alert("Error", `Could not create party: ${error.message}`);
		} finally {
			setIsLoadingParty(false);
		}
	};

	// --- Action: Join Party ---
	const joinParty = async (inviteData) => {
		// inviteData = { partyId: '...' } OR { inviteCode: '...' }
		if (!currentUserData?.uid || isLoadingParty) return;
		console.log("PartyContext: Attempting to join party with:", inviteData);
		setIsLoadingParty(true);
		setPartyError(null);
		try {
			const result = await joinPartyFunction(inviteData);
			if (result.data.success && result.data.partyId) {
				const joinedPartyId = result.data.partyId;
				console.log("PartyContext: Joined party successfully:", joinedPartyId);
				setCurrentPartyId(joinedPartyId); // Trigger listener
				setPartyStatus("pending"); // Assume pending initially
				// Navigate to Lobby
				navigation.navigate("PartyLobby", {
					partyId: joinedPartyId,
				});
			} else {
				throw new Error(result.data.error || "Failed to join party.");
			}
		} catch (error) {
			console.error("PartyContext: Error joining party:", error);
			setPartyError(`Could not join party: ${error.message}`);
			Alert.alert("Error", `Could not join party: ${error.message}`);
		} finally {
			setIsLoadingParty(false);
		}
	};

	// --- Action: Leave Party ---
	const leaveParty = async () => {
		if (!currentUserData?.uid || !currentPartyId || isLoadingParty) return;
		// Confirmation Alert is handled in the UI component calling this
		console.log(`PartyContext: Attempting to leave party: ${currentPartyId}`);
		setIsLoadingParty(true);
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
			setIsLoadingParty(false); // Ensure loading stops on error
		}
		// No finally here, state cleared on success path
	};

	// --- Action: Activate Party on Check-in ---
	const activatePartyCheckIn = async (checkInDocId) => {
		if (
			!currentUserData?.uid ||
			!currentPartyId ||
			partyStatus !== "pending" ||
			isLoadingParty
		) {
			console.log("PartyContext: activatePartyCheckIn prerequisites not met.", {
				currentPartyId,
				partyStatus,
				isLoadingParty,
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
		setIsLoadingParty(true); // Use general loading or a specific one?
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
			setIsLoadingParty(false);
		}
	};

	// --- Context Value ---
	const value = {
		currentPartyId,
		partyStatus,
		partyDetails,
		isLoadingParty: isLoadingParty || isListening, // Combine loading states
		partyError,
		createParty,
		joinParty,
		leaveParty,
		activatePartyCheckIn,
		clearPartyState,
	};

	return (
		<PartyContext.Provider value={value}>{children}</PartyContext.Provider>
	);
};

// --- Custom Hook for easy consumption ---
export const useParty = () => {
	return useContext(PartyContext);
};
