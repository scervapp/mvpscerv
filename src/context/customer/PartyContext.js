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
	isLoadingParty: true,
	partyError: null,
	sharedBasketItems: [],
	isLoadingBasket: false,
	createParty: async (restaurantId, restaurantName) => {},
	joinParty: async (inviteData) => {}, // inviteData can be { partyId } or { inviteCode }
	leaveParty: async () => {},
	activatePartyCheckIn: async (checkInDocId) => {},
	cancelPartyCheckIn: async () => {
		console.warn("Default cancelPartyCheckIn called");
		return false;
	},
	inviteToParty: async () => {},
	cancelParty: async () => {},
	clearPartyState: () => {},
	addLocalPIPToParty: async (partyId, localPIPId, localPIPName) => {},
	addItemToPartyBasket: async (partyContextData, menuItemDetails) => {},
});

// --- Create Provider Component ---
export const PartyProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);

	const [currentPartyId, setCurrentPartyId] = useState(null);
	const [partyStatus, setPartyStatus] = useState(null);
	const [partyDetails, setPartyDetails] = useState(null);
	const [isLoadingPartyAction, setIsLoadingPartyAction] = useState(false); // Loading for actions like create/join/leave
	const [partyError, setPartyError] = useState(null);
	const [sharedBasketItems, setSharedBasketItems] = useState([]);
	const [isLoadingBasket, setIsLoadingBasket] = useState(true);
	const [isCheckingExistingParty, setIsCheckingExistingParty] = useState(true);
	const [isPartyDetailsListenerLoading, setIsPartyDetailsListenerLoading] =
		useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingAction, setIsLoadingAction] = useState(false);

	const [uiItemIsUpdating, setUiItemUpdateLoading] = useState(false);
	// --- Cloud Function References ---
	const createPartyFunction = httpsCallable(functions, "createParty");
	const joinPartyFunction = httpsCallable(functions, "joinParty");
	const leavePartyFunction = httpsCallable(functions, "leaveParty");
	const activatePartyCheckInFunction = httpsCallable(
		functions,
		"activatePartyCheckIn"
	);
	const cancelPartyCheckInFunction = httpsCallable(
		functions,
		"cancelPartyCheckIn"
	);
	const cancelPartyFunction = httpsCallable(functions, "cancelParty");
	const inviteToPartyFunction = httpsCallable(functions, "inviteToParty");
	const addLocalPIPToPartyFunction = httpsCallable(
		functions,
		"addLocalPIPToParty"
	);
	const addItemToSharedBasketFunction = httpsCallable(
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

	const sendItemsToChefsQFunction = httpsCallable(
		functions,
		"sendItemsToChefsQ"
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

	// Effect to reset checking state when user changes (e.g., login/logout)
	useEffect(() => {
		console.log(
			"PartyContext: User changed or initial load. UID:",
			currentUserData?.uid
		);
		if (currentUserData?.uid) {
			// If there's a user but no current party ID from a previous session/action,
			// ensure we are in a state to check for existing parties.
			if (!currentPartyId) {
				console.log(
					"PartyContext: User present, no active party in context. Setting isCheckingExistingParty to true."
				);
				setIsCheckingExistingParty(true);
			}
		} else {
			// No user, clear any existing party state and stop checks.
			console.log(
				"PartyContext: No user. Clearing party state and resetting check flags."
			);
			clearPartyState();
			setIsCheckingExistingParty(false); // No user, so no check needed.
			setIsPartyDetailsListenerLoading(false);
			setIsLoadingBasket(false);
		}
	}, [currentUserData?.uid, clearPartyState]); // currentPartyId removed from here to avoid loop with below effect

	// --- NEW: Effect to check for existing party on load ---
	// Effect to check for existing party on load or when isCheckingExistingParty is true

	useEffect(() => {
		// This effect will find an existing party when the app loads or the user changes.
		// It will NOT set up a continuous listener itself, but rather find the ID to pass
		// to the other effects which DO set up listeners.

		const findAndSetInitialParty = async (userId) => {
			setIsLoading(true);
			console.log(
				`PartyContext: Running findAndSetInitialParty for user: ${userId}`
			);

			// Query 1: Find a party where the user is the host
			const hostQuery = query(
				collection(db, "parties"),
				where("hostUserId", "==", userId),
				where("status", "in", ["pending", "AWAITING_TABLE", "active"]),
				limit(1)
			);

			// Query 2: Find a party where the user is a guest
			const guestQuery = query(
				collection(db, "parties"),
				where("guestUserIds", "array-contains", userId),
				where("status", "in", ["pending", "AWAITING_TABLE", "active"]),
				limit(1)
			);

			try {
				const [hostSnapshot, guestSnapshot] = await Promise.all([
					getDocs(hostQuery),
					getDocs(guestQuery),
				]);

				let foundPartyDoc = null;
				if (!hostSnapshot.empty) {
					foundPartyDoc = hostSnapshot.docs[0];
					console.log(
						`PartyContext: Found user as HOST of party: ${foundPartyDoc.id}`
					);
				} else if (!guestSnapshot.empty) {
					foundPartyDoc = guestSnapshot.docs[0];
					console.log(
						`PartyContext: Found user as GUEST in party: ${foundPartyDoc.id}`
					);
				}

				if (foundPartyDoc) {
					setCurrentPartyId(foundPartyDoc.id);
				} else {
					console.log("PartyContext: No active party found for user.");
					setCurrentPartyId(null);
				}
			} catch (error) {
				console.error("PartyContext: Error finding initial party:", error);
				setPartyError("Could not check for an existing party.");
				setCurrentPartyId(null);
			} finally {
				setIsLoading(false); // Finished checking
			}
		};

		if (currentUserData?.uid) {
			findAndSetInitialParty(currentUserData.uid);
		} else {
			// No user, clear everything and stop loading.
			setCurrentPartyId(null);
			setPartyDetails(null);
			setSharedBasketItems([]);
			setIsLoading(false);
		}
	}, [currentUserData?.uid]); // This effect runs only when the user changes.

	// This effect listens to the SPECIFIC party document once its ID is known.
	useEffect(() => {
		if (!currentPartyId) return; // Do nothing if there's no party ID

		console.log(
			`PartyContext: Attaching listener to party document: ${currentPartyId}`
		);
		const partyRef = doc(db, "parties", currentPartyId);
		const unsubscribePartyDetails = onSnapshot(partyRef, (docSnap) => {
			if (docSnap.exists()) {
				setPartyDetails({ id: docSnap.id, ...docSnap.data() });
			} else {
				// The party was deleted, the main listener above will handle clearing the state.
				console.log(
					`PartyContext: Party document ${currentPartyId} was deleted.`
				);
			}
		});

		return () => unsubscribePartyDetails();
	}, [currentPartyId]); // Re-run only when the party ID changes

	// Listener for Shared Basket
	useEffect(() => {
		if (!currentPartyId) {
			setSharedBasketItems([]); // Clear basket if no party
			return;
		}

		console.log(
			`PartyContext: Attaching listener to shared basket: ${currentPartyId}`
		);
		const basketRef = doc(db, "shared_baskets", currentPartyId);
		const unsubscribeBasket = onSnapshot(basketRef, (docSnap) => {
			if (docSnap.exists()) {
				setSharedBasketItems(docSnap.data().items || []);
			} else {
				console.warn(
					`PartyContext: No shared basket found for party ${currentPartyId}.`
				);
				setSharedBasketItems([]);
			}
			setIsLoading(false); // Consider loading complete after basket is fetched/checked
		});

		return () => unsubscribeBasket();
	}, [currentPartyId]); // Re-run only when the party ID changes
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

	const isHost = partyDetails?.hostUserId === currentUserData?.uid; // Make sure partyDetails is up-to-date

	const activatePartyCheckIn = useCallback(
		async (checkInDocId) => {
			// Log parameters received and current context state
			console.log(
				`PartyContext: activatePartyCheckIn INVOKED. Received checkInDocId: "${checkInDocId}"`
			);
			console.log(
				`PartyContext: Current partyId from context state: "${currentPartyId}"`
			);
			console.log(`PartyContext: Is current user host? ${isHost}`); // Verify host status

			// Ensure currentPartyId is valid and the user is the host (host check also in CF)
			if (
				!currentPartyId ||
				typeof currentPartyId !== "string" ||
				currentPartyId.trim() === ""
			) {
				Alert.alert("Error", "No active party selected to activate.");
				console.error(
					"PartyContext.activatePartyCheckIn: currentPartyId is invalid or missing.",
					currentPartyId
				);
				return false;
			}
			if (
				!checkInDocId ||
				typeof checkInDocId !== "string" ||
				checkInDocId.trim() === ""
			) {
				Alert.alert("Error", "Check-In ID is missing for party activation.");
				console.error(
					"PartyContext.activatePartyCheckIn: checkInDocId is invalid or missing.",
					checkInDocId
				);
				return false;
			}
			// Client-side check for host status (Cloud Function will also verify)
			if (!isHost) {
				Alert.alert(
					"Permission Denied",
					"Only the party host can activate the check-in."
				);
				console.warn(
					"PartyContext.activatePartyCheckIn: Non-host attempting to activate."
				);
				return false;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			const payloadToCloudFunction = {
				partyId: currentPartyId, // Use the partyId from the context's state
				checkInId: checkInDocId,
			};

			console.log(
				"PartyContext: Payload for activatePartyCheckInFunction CF:",
				JSON.stringify(payloadToCloudFunction, null, 2)
			);

			try {
				const result = await activatePartyCheckInFunction(
					payloadToCloudFunction
				);

				if (result.data.success) {
					console.log(
						"PartyContext: activatePartyCheckIn CF successful. Party status should update via listener."
					);
					// The partyDetails listener should pick up the status change to "AWAITING_TABLE"
					// and the activeCheckInId.
					return true;
				} else {
					// If CF returns { success: false, error: "..." }
					console.error(
						"PartyContext: Cloud function reported failure for party activation:",
						result.data.error
					);
					Alert.alert(
						"Activation Failed",
						result.data.error || "Could not activate party check-in."
					);
					setPartyError(
						result.data.error || "Could not activate party check-in."
					);
					return false;
				}
			} catch (error) {
				// This catches errors from the httpsCallable itself or if CF throws an HttpsError
				console.error(
					"PartyContext: Error calling activatePartyCheckInFunction:",
					error
				);
				const message =
					error.message || "Could not activate party check-in link.";
				setPartyError(message);
				Alert.alert("Activation Error", message);
				return false;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[
			currentPartyId,
			isHost,
			activatePartyCheckInFunction,
			setIsLoadingPartyAction,
			setPartyError,
		]
	);

	// --- NEW cancelPartyCheckIn function ---
	const cancelPartyCheckIn = useCallback(async () => {
		// This function doesn't need arguments as it gets them from the context's state.
		const partyId = partyDetails?.id;
		const checkInId = partyDetails?.activeCheckInId;
		const isHost = partyDetails?.hostUserId === currentUserData?.uid;
		const currentStatus = partyDetails?.status;

		console.log(
			`PartyContext: Attempting to cancel check-in. PartyID: ${partyId}, CheckInID: ${checkInId}, IsHost: ${isHost}, Status: ${currentStatus}`
		);

		if (
			!isHost ||
			currentStatus !== "AWAITING_TABLE" ||
			!partyId ||
			!checkInId
		) {
			Alert.alert(
				"Cannot Cancel",
				"This check-in request cannot be cancelled at this time."
			);
			console.error("PartyContext.cancelPartyCheckIn: Pre-conditions not met.");
			return false;
		}

		setIsLoadingPartyAction(true);
		setPartyError(null);

		try {
			const result = await cancelPartyCheckInFunction({ partyId, checkInId });
			if (result.data.success) {
				console.log(
					"PartyContext: Check-in cancellation successful. Listener will update UI."
				);
				// The party listener will automatically see the status change back to 'pending'.
				return true;
			} else {
				throw new Error(
					result.data.error || "Cloud function failed to cancel check-in."
				);
			}
		} catch (error) {
			console.error(
				"PartyContext: Error calling cancelPartyCheckIn CF:",
				error
			);
			const message = error.message || "Could not cancel the check-in request.";
			setPartyError(message);
			Alert.alert("Cancellation Failed", message);
			return false;
		} finally {
			setIsLoadingPartyAction(false);
		}
	}, [
		partyDetails,
		currentUserData?.uid,
		setIsLoadingPartyAction,
		setPartyError,
		cancelPartyCheckInFunction,
	]);

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

	const addLocalPIPToParty = useCallback(
		async (partyId, pipsToAdd) => {
			// pipsToAdd is an array of {id, name}
			if (!partyId || !pipsToAdd || pipsToAdd.length === 0) {
				console.warn(
					"PartyContext.addLocalPIPsToParty: Prerequisites not met (missing partyId or pipsToAdd)."
				);
				return false;
			}

			setIsLoading(true);
			setPartyError(null);
			try {
				console.log(
					`PartyContext: Calling addLocalPIPsToParty CF for party ${partyId}`
				);
				const result = await addLocalPIPToPartyFunction({
					partyId,
					pipsToAdd,
				});
				if (result.data.success) {
					console.log(
						"PartyContext: Members added successfully. Listener will update UI."
					);
					return true;
				} else {
					throw new Error(
						result.data.error || "Cloud function failed to add members."
					);
				}
			} catch (error) {
				console.error(
					"PartyContext: Error calling addLocalPIPsToParty CF:",
					error
				);
				const message = error.message || "Could not add members to the party.";
				setPartyError(message);
				Alert.alert("Failed to Add Members", message);
				return false;
			} finally {
				setIsLoading(false);
			}
		},
		[addLocalPIPToPartyFunction, setIsLoading, setPartyError]
	);

	// --- Action: Invite to Party ---
	const inviteToParty = useCallback(async () => {
		const partyId = partyDetails?.id;
		if (!isHost || !partyId) {
			Alert.alert(
				"Permission Denied",
				"Only the party host can generate an invite code."
			);
			return null; // Return null to indicate failure
		}

		setIsLoadingAction(true);
		setPartyError(null);
		try {
			console.log(
				`PartyContext: Calling inviteToParty CF for party ${partyId}`
			);
			const result = await inviteToPartyFunction({ partyId });

			if (result.data.success && result.data.inviteCode) {
				console.log(
					`PartyContext: Invite code generated: ${result.data.inviteCode}`
				);
				return result.data.inviteCode; // Return the code to the UI
			} else {
				throw new Error(
					result.data.error ||
						"Cloud function failed to generate an invite code."
				);
			}
		} catch (error) {
			console.error("PartyContext: Error calling inviteToParty CF:", error);
			const message = error.message || "Could not generate an invite code.";
			setPartyError(message);
			Alert.alert("Invite Error", message);
			return null; // Indicate failure
		} finally {
			setIsLoadingAction(false);
		}
	}, [
		isHost,
		partyDetails?.id,
		setIsLoadingAction,
		setPartyError,
		inviteToPartyFunction,
	]);
	// --- End Invite Action ---
	// --- Action: Join Party ---
	const joinParty = useCallback(
		async ({ inviteCode }) => {
			if (!inviteCode) {
				Alert.alert("Error", "An invite code is required.");
				return false;
			}

			setIsLoadingAction(true);
			setPartyError(null);
			try {
				console.log(
					`PartyContext: Calling joinParty CF with code: ${inviteCode}`
				);
				const result = await joinPartyFunction({ inviteCode });

				if (result.data.success && result.data.partyId) {
					console.log(
						`PartyContext: Successfully joined party ${result.data.partyId}.`
					);
					// The main context listener will automatically pick up the party details
					// once the user is added to guestUserIds. We can also manually set it
					// to speed up the UI transition.
					setCurrentPartyId(result.data.partyId);
					return true; // Indicate success
				} else {
					throw new Error(
						result.data.error || "Cloud function failed to join party."
					);
				}
			} catch (error) {
				console.error("PartyContext: Error calling joinParty CF:", error);
				const message =
					error.message ||
					"Could not join the party. Please check the code and try again.";
				setPartyError(message);
				Alert.alert("Join Failed", message);
				return false; // Indicate failure
			} finally {
				setIsLoadingAction(false);
			}
		},
		[setIsLoadingAction, setPartyError, joinPartyFunction, setCurrentPartyId]
	);

	/**
	 * Adds an item to the shared party basket.
	 * @param {object} partyContextData - Contains partyId, orderingForUserId, orderingForPipName.
	 * @param {object} menuItemDetails - Contains details of the menu item (id, name, price, quantity, specialInstructions).
	 * @returns {Promise<string | null>} The ID of the added basket item, or null on failure.
	 */
	const addItemToPartyBasket = async (partyContextData, menuItemDetails) => {
		const { partyId, orderingForUserId, orderingForPipName } = partyContextData;

		console.log("Party Context Add Item To Basket Called");

		if (!currentUserData?.uid) {
			Alert.alert("Error", "You must be logged in to add items.");
			return null;
		}
		if (!partyId || !orderingForUserId || !menuItemDetails) {
			Alert.alert(
				"Error",
				"Missing required information to add item to party basket."
			);
			console.error("addItemToPartyBasket: Missing data", {
				partyContextData,
				menuItemDetails,
			});
			return null;
		}
		// Optional: Use isLoadingPartyAction or a new specific loading state
		// For simplicity, we can reuse isLoadingPartyAction if this action is modal
		// or if multiple "add item" calls aren't expected rapidly.
		// If rapid calls are expected without blocking UI, a separate, non-global loading state might be better.
		setIsLoadingPartyAction(true); // Or a more specific e.g., setIsLoadingBasketAction(true)
		setPartyError(null);

		try {
			console.log(
				`PartyContext: Calling addItemToSharedBasket CF for party ${partyId}`,
				{ orderingForUserId, orderingForPipName, menuItemDetails }
			);
			const result = await addItemToSharedBasketFunction({
				partyId,
				orderingForUserId,
				orderingForPipName,
				menuItemData: {
					// Ensure structure matches what CF expects
					id: menuItemDetails.id, // menuItemId
					name: menuItemDetails.name,
					price: menuItemDetails.price,
					quantity: menuItemDetails.quantity,
					specialInstructions: menuItemDetails.specialInstructions || "",
					// Pass any other menuItem fields your CF expects or uses
					category: menuItemDetails.category,
					imageUri: menuItemDetails.imageUri,
					restaurantId: menuItemDetails.restaurantId,
				},
			});

			if (result.data.success && result.data.basketItemId) {
				console.log(
					`PartyContext: Item ${result.data.basketItemId} added successfully to shared basket for party ${partyId}.`
				);
				// The onSnapshot listener for sharedBasketItems will automatically update the UI.
				// No need to manually update sharedBasketItems state here.
				return result.data.basketItemId; // Return the new basket item's ID
			} else {
				throw new Error(
					result.data.error ||
						"Cloud function failed to add item to shared basket."
				);
			}
		} catch (error) {
			console.error(
				"PartyContext: Error calling addItemToSharedBasket CF:",
				error
			);
			const message = error.message || "Could not add item to party basket.";
			setPartyError(message); // Set context error
			Alert.alert("Add Item Failed", message);
			return null; // Indicate failure
		} finally {
			setIsLoadingPartyAction(false); // Or setIsLoadingBasketAction(false)
		}
	};

	const handlePartyItemQuantityChange = async (
		partyId,
		itemId,
		newQuantity,
		userId
	) => {
		console.log("HandleParty Pressed quantity is", newQuantity);
		if (!currentPartyId || !currentUserData?.uid) {
			Alert.alert(
				"Error",
				"Cannot update item: Party or user information missing."
			);
			return;
		}

		console.log(
			`PartySessionScreen: Updating item ${itemId} in party ${currentPartyId} to quantity ${newQuantity} by user ${currentUserData.uid}`
		);
		let numericQuantity = Number(newQuantity);
		if (isNaN(numericQuantity)) {
			Alert.alert("Error", "Invalid quantity provided to context.");
			return false;
		}
		numericQuantity = Math.max(0, Math.min(10, numericQuantity)); // Clamp

		if (numericQuantity === 0) {
			console.log(
				`PartyContext: Quantity is 0 for item ${itemId}. Calling removePartyBasketItem.`
			);
			return await removePartyBasketItem(partyId, itemId, userId);
		}
		const payload = {
			partyId: partyId,
			itemId: itemId,
			newQuantity: numericQuantity,
			userId: userId, // This is the calling user, for permissions in CF
		};

		setUiItemUpdateLoading(true); // Optional: local loading state for this action
		try {
			// The updatePartyBasketItemQuantity in PartyContext will handle calling
			// removePartyBasketItem if newQuantity is 0.
			const success = await updatePartyBasketItemQuantityFunction(payload);
			if (success) {
				console.log(
					"PartySessionScreen: Item quantity/removal processed by context."
				);
			} else {
				// Context likely showed an alert
				console.log(
					"PartySessionScreen: Context reported issue processing item quantity/removal."
				);
			}
		} catch (error) {
			console.error(
				"PartySessionScreen: Error calling updatePartyBasketItemQuantity from context:",
				error
			);
			Alert.alert("Error", "Failed to update item in party basket.");
		} finally {
			setUiItemUpdateLoading(false);
		}
	};
	const removePartyBasketItem = useCallback(
		async (partyId, itemId, userIdPerformingAction) => {
			// userIdPerformingAction is context.auth.uid from the CF, but good to pass for clarity or if CF needs it in `data`
			// For the CF we defined, it uses context.auth.uid primarily for the requesting user.
			// The `userId` in the CF's `data` payload is used for checking item ownership if not host.

			if (!currentUserData?.uid) {
				// Check against the logged-in user from AuthContext
				Alert.alert("Error", "You must be logged in to remove items.");
				return false;
			}
			if (!partyId || !itemId) {
				Alert.alert("Error", "Missing information to remove item.");
				console.error(
					"PartyContext.removePartyBasketItem: Missing partyId or itemId",
					{ partyId, itemId }
				);
				return false;
			}

			// The userId to check against for ownership in the Cloud Function should be the item's orderedByUserId.
			// However, the Cloud Function will fetch the item and check its orderedByUserId itself.
			// The userId passed here is more about who is *requesting* the action for logging/CF-side checks.
			// For simplicity, we pass the current user's ID as the 'userId' in the data payload,
			// and the CF will use context.auth.uid for the actual permission checks against item owner or host.

			setIsLoadingPartyAction(true);
			setPartyError(null);
			try {
				console.log(
					`PartyContext: Calling removeSharedBasketItem CF for party ${partyId}, item ${itemId}, by user ${currentUserData.uid}`
				);
				const result = await removePartyBasketItemFunction({
					partyId,
					itemId,
					userId: currentUserData.uid, // User initiating the request
				});

				if (result.data.success) {
					console.log(
						`PartyContext: Item ${itemId} reported as removed successfully by CF.`
					);
					// Listener for sharedBasketItems will update the UI.
					return true;
				} else {
					throw new Error(
						result.data.error ||
							"Cloud function failed to remove item but returned success:false."
					);
				}
			} catch (error) {
				console.error(
					"PartyContext: Error calling removeSharedBasketItem CF:",
					error
				);
				const message =
					error.message || "Could not remove item from party basket.";
				setPartyError(message);
				Alert.alert("Remove Item Failed", message);
				return false;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[
			currentUserData?.uid,
			removePartyBasketItemFunction,
			setIsLoadingPartyAction,
			setPartyError,
		]
	);

	const sendMyItemsToKitchen = useCallback(async () => {
		const partyId = partyDetails?.id;
		const partyStatus = partyDetails?.status;

		if (partyStatus !== "active" || !partyId) {
			Alert.alert(
				"Cannot Send Order",
				"The party must be active and seated to send items to the kitchen."
			);
			return false;
		}

		setIsLoadingAction(true);
		setPartyError(null);
		try {
			console.log(
				`PartyContext: Calling sendItemsToChefsQ CF for party ${partyId}`
			);
			const result = await sendItemsToChefsQFunction({ partyId });

			if (result.data.success) {
				console.log(
					`PartyContext: Successfully sent ${result.data.itemsSent} item(s). Listener will update UI.`
				);
				if (result.data.itemsSent === 0) {
					Alert.alert(
						"No New Items",
						"All your current items have already been sent to the kitchen."
					);
				}
				return true;
			} else {
				throw new Error(
					result.data.error || "Cloud function failed to send items."
				);
			}
		} catch (error) {
			console.error("PartyContext: Error calling sendItemsToChefsQ CF:", error);
			const message = error.message || "Could not send items to the kitchen.";
			setPartyError(message);
			Alert.alert("Order Send Failed", message);
			return false;
		} finally {
			setIsLoadingAction(false);
		}
	}, [
		partyDetails,
		setIsLoadingAction,
		setPartyError,
		sendItemsToChefsQFunction,
	]);

	// --- Context Value ---
	const value = {
		currentPartyId,
		partyStatus,
		partyDetails,
		isLoadingParty: isLoading,

		partyError,
		sharedBasketItems,
		createParty,
		joinParty,
		leaveParty,
		activatePartyCheckIn,
		cancelPartyCheckIn,
		clearPartyState,
		inviteToParty,
		cancelParty,
		addLocalPIPToParty,
		addItemToPartyBasket,
		handlePartyItemQuantityChange,
		sendMyItemsToKitchen,
	};

	return (
		<PartyContext.Provider value={value}>{children}</PartyContext.Provider>
	);
};

// --- Custom Hook for easy consumption ---
export const useParty = () => {
	return useContext(PartyContext);
};
