// src/context/customer/PartyContext.js
import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useCallback,
} from "react";
import { Alert } from "react-native";

import { db, functions } from "../../config/firebase";
import { AuthContext } from "../authContext";
import { httpsCallable } from "@react-native-firebase/functions";

// --- Create Context ---
export const PartyContext = createContext({
	currentPartyIds: {},
	partyStatus: null, // 'pending', 'active', 'completed', 'cancelled', null
	partyDetails: {},
	isLoadingParty: true,
	partyError: null,
	sharedBaskets: [],
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

	const [currentPartyIds, setCurrentPartyIds] = useState({});
	const [partyStatus, setPartyStatus] = useState(null);
	const [partyDetails, setPartyDetails] = useState({});
	const [isLoadingPartyAction, setIsLoadingPartyAction] = useState(false); // Loading for actions like create/join/leave
	const [partyError, setPartyError] = useState(null);
	const [sharedBaskets, setSharedBaskets] = useState([]);
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
		"activatePartyCheckIn",
	);
	const cancelPartyCheckInFunction = httpsCallable(
		functions,
		"cancelPartyCheckIn",
	);
	const cancelPartyFunction = httpsCallable(functions, "cancelParty");
	const inviteToPartyFunction = httpsCallable(functions, "inviteToParty");
	const addLocalPIPToPartyFunction = httpsCallable(
		functions,
		"addLocalPIPToParty",
	);
	const addItemToSharedBasketFunction = httpsCallable(
		functions,
		"addItemToSharedBasket",
	);
	const updatePartyBasketItemQuantityFunction = httpsCallable(
		functions,
		"updateSharedBasketItemQuantity",
	);
	const removePartyBasketItemFunction = httpsCallable(
		functions,
		"removeSharedBasketItem",
	);

	const sendItemsToChefsQFunction = httpsCallable(
		functions,
		"sendItemsToChefsQ",
	);

	const sendOrderToKitchenFunction = httpsCallable(
		functions,
		"sendOrderToKitchen",
	);

	// --- Clear State ---
	const clearPartyState = useCallback(() => {
		setCurrentPartyIds({});
		setPartyStatus(null);
		setPartyDetails({});
		setSharedBaskets([]); // Also clear shared basket items
		setIsLoadingPartyAction(false);
		setPartyError(null);
		setIsLoadingBasket(false); // No basket to load if no party
	}, []);

	useEffect(() => {
		console.log(
			"PartyContext: User changed or initial load. UID:",
			currentUserData?.uid,
		);
		if (currentUserData?.uid) {
			if (Object.keys(currentPartyIds).length === 0) {
				console.log(
					"PartyContext: User present, no active party in context. Setting isCheckingExistingParty to true.",
				);
				setIsCheckingExistingParty(true);
			}
		} else {
			console.log(
				"PartyContext: No user. Clearing party state and resetting check flags.",
			);
			clearPartyState();
			setIsCheckingExistingParty(false);
			setIsPartyDetailsListenerLoading(false);
			setIsLoadingBasket(false);
		}
	}, [currentUserData?.uid, clearPartyState]);

	// --- EFFECT 1: Find the user's active party and listen for changes (like deletion) ---
	useEffect(() => {
		console.log(
			`PartyContext: Main party listener effect running. User ID: ${currentUserData?.uid}`,
		);

		// If there's no user, clear everything and stop.
		if (!currentUserData?.uid) {
			setCurrentPartyIds({});
			setIsLoading(false); // No user, so loading is finished.
			return;
		}

		setIsLoading(true); // Start loading when we begin the check for a valid user

		// This query finds any party where the user is listed as a guest (the host is also a guest).
		// It only looks for parties that are not yet completed or cancelled.
		const userPartiesQuery = db
			.collection("parties")
			.where("guestUserIds", "array-contains", currentUserData.uid)
			.where("status", "in", ["pending", "AWAITING_TABLE", "active"]);

		// --- THE FIX: Use onSnapshot for real-time updates ---
		// This listener will fire when the app loads, AND when the document it finds is modified or deleted.
		const unsubscribeUserParty = userPartiesQuery.onSnapshot(
			(snapshot) => {
				const partyIds = {};
				snapshot.docs.forEach((doc) => {
					const partyData = doc.data();
					partyIds[partyData.restaurantId] = doc.id; // Map restaurantId to partyId
				});
				setCurrentPartyIds(partyIds);
				// The initial check is now complete, so we can stop the main loading indicator.
				setIsLoading(false);
			},
			(error) => {
				console.error(
					"PartyContext: Error listening for user's active party:",
					error,
				);
				setPartyError("Could not check for an active party.");
				setIsLoading(false); // Stop loading on error too.
			},
		);

		// Cleanup this main listener when the component unmounts
		return () => unsubscribeUserParty();
	}, [currentUserData?.uid]);
	// --- EFFECT 2: Listen to the SPECIFIC party document once its ID is known ---
	useEffect(() => {
		if (Object.keys(currentPartyIds).length === 0) {
			setPartyDetails({});
			return;
		}

		const unsubscribeDetails = [];

		Object.values(currentPartyIds).forEach((partyId) => {
			console.log(
				`PartyContext: Attaching listener to party document: ${partyId}`,
			);
			const partyRef = db.collection("parties").doc(partyId);
			const unsubscribe = partyRef.onSnapshot((docSnap) => {
				if (docSnap.exists()) {
					setPartyDetails((prev) => ({
						...prev,
						[partyId]: { id: partyId, ...docSnap.data() },
					}));
				} else {
					// If the doc is deleted, the main listener above will set currentPartyIds to null,
					// which will cause this listener to clean up and state to be cleared.
					console.log(`PartyContext: Party document ${partyId} was deleted.`);
				}
			});
			unsubscribeDetails.push(unsubscribe);
		});

		return () => unsubscribeDetails.forEach((unsub) => unsub());
	}, [currentPartyIds]);

	// --- EFFECT 3: Listen to the SHARED BASKET of the specific party ---
	useEffect(() => {
		if (Object.keys(currentPartyIds).length === 0) {
			setSharedBaskets({}); // Reset to an empty object
			return;
		}

		const unsubscribeBaskets = [];

		// Loop through all the parties the user is in
		Object.values(currentPartyIds).forEach((partyId) => {
			console.log(
				`PartyContext: Attaching listener to shared basket: ${partyId}`,
			);
			const basketRef = db.collection("shared_baskets").doc(partyId);
			const unsubscribe = basketRef.onSnapshot((docSnap) => {
				const items = docSnap.exists() ? docSnap.data().items || [] : [];

				// Store this party's basket items under its own partyId in the object.
				setSharedBaskets((prevBaskets) => ({
					...prevBaskets,
					[partyId]: items,
				}));
			});
			unsubscribeBaskets.push(unsubscribe);
		});

		return () => unsubscribeBaskets.forEach((unsub) => unsub());
	}, [currentPartyIds]);

	// --- Action: Create Party ---
	const createParty = async (restaurantId, restaurantName) => {
		// Log 1: Function entry and initial state check
		console.log(
			`[PartyContext.createParty] Attempting for restaurantId: ${restaurantId}. CurrentUser UID: ${currentUserData?.uid}. isLoadingPartyAction: ${isLoadingPartyAction}`,
		);
		if (!currentUserData?.uid || isLoadingPartyAction) {
			console.warn(
				`[PartyContext.createParty] Aborted: Missing UID or action already in progress.`,
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
				`[PartyContext.createParty] Calling Firebase Cloud Function 'createPartyFunction' with restaurantId: ${restaurantId}`,
			);
			const result = await createPartyFunction({
				restaurantId,
			});
			// Log 4: After Cloud Function call, inspect the raw result
			console.log(
				`[PartyContext.createParty] Cloud Function 'createPartyFunction' result:`,
				JSON.stringify(result, null, 2), // Stringify to see the whole structure
			);
			if (result.data.success && result.data.partyId) {
				const newPartyId = result.data.partyId;
				console.log("PartyContext: Party created successfully:", newPartyId);
				setCurrentPartyIds((prev) => ({ ...prev, [restaurantId]: newPartyId })); // Update for this restaurant
				setPartyStatus("pending"); // Set initial status
				// Log 8: Returning newPartyId (navigation will happen outside this function)
				console.log(
					`[PartyContext.createParty] Successfully processed. Returning newPartyId: ${newPartyId}`,
				);
				// Navigate to Lobby (pass necessary info)
				return newPartyId;
			} else {
				throw new Error("Failed to create party.");
			}
		} catch (error) {
			console.error("PartyContext: Error creating party:", error);
			setPartyError(`Could not create party: ${error.message}`);
			Alert.alert("Error", `Could not create party: ${error.message}`);
		} finally {
			// Log 11: Finally block, resetting action loading state
			console.log(
				`[PartyContext.createParty] FINALLY BLOCK: Setting isLoadingPartyAction: false`,
			);
			setIsLoadingPartyAction(false);
		}
	};
	// --- Action: Leave Party ---
	const leaveParty = async (partyId) => {
		if (!currentUserData?.uid || !partyId || isLoadingPartyAction) return;

		console.log(`PartyContext: Attempting to leave party: ${partyId}`);

		setIsLoadingPartyAction(true);
		setPartyError(null);

		try {
			const result = await leavePartyFunction({ partyId }); // Fixed: string

			if (result.data.success) {
				console.log(
					"PartyContext: Left party successfully. Listener will clean up state.",
				);
				// DO NOT call clearPartyState() — let Firestore listener remove party from currentPartyIds
			} else {
				throw new Error(result.data.error || "Failed to leave party.");
			}
		} catch (error) {
			console.error("PartyContext: Error leaving party:", error);
			const message = error.message || "Could not leave party.";
			setPartyError(message);
			Alert.alert("Error", message);
			setIsLoadingPartyAction(false);
		}
	};

	const activatePartyCheckIn = useCallback(
		async (checkInDocId) => {
			// Get the current party ID from currentPartyIds object
			const partyId = Object.values(currentPartyIds)[0];
			const partyData = partyDetails[partyId] || {};
			const isHost = partyData.hostUserId === currentUserData?.uid;

			console.log("Is Host", isHost);

			// Debug logs
			console.log(
				`PartyContext: activatePartyCheckIn INVOKED. Received checkInDocId: "${checkInDocId}"`,
			);
			console.log(
				`PartyContext: Current partyId: "${partyId}", isHost: ${isHost}`,
			);
			console.log("PartyContext: Host check", {
				partyId,
				hostUserId: partyData.hostUserId,
				currentUserId: currentUserData?.uid,
			});

			// Validate partyId
			if (!partyId) {
				Alert.alert("Error", "No active party selected to activate.");
				console.error(
					"PartyContext.activatePartyCheckIn: No valid partyId found.",
					currentPartyIds,
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
					checkInDocId,
				);
				return false;
			}

			// Client-side check for host status (Cloud Function will also verify)
			if (!isHost) {
				Alert.alert(
					"Permission Denied",
					"Only the party host can activate the check-in.",
				);
				console.warn(
					"PartyContext.activatePartyCheckIn: Non-host attempting to activate.",
				);
				return false;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			const payloadToCloudFunction = {
				partyId: partyId, // Fixed: Use actual partyId string
				checkInId: checkInDocId,
			};

			console.log(
				"PartyContext: Payload for activatePartyCheckInFunction CF:",
				JSON.stringify(payloadToCloudFunction, null, 2),
			);

			try {
				const result = await activatePartyCheckInFunction(
					payloadToCloudFunction,
				);

				if (result.data.success) {
					console.log(
						"PartyContext: activatePartyCheckIn CF successful. Party status should update via listener.",
					);
					// The partyDetails listener will pick up the status change to "AWAITING_TABLE"
					// and the activeCheckInId.
					return true;
				} else {
					console.error(
						"PartyContext: Cloud function reported failure for party activation:",
						result.data.error,
					);
					Alert.alert(
						"Activation Failed",
						result.data.error || "Could not activate party check-in.",
					);
					setPartyError(
						result.data.error || "Could not activate party check-in.",
					);
					return false;
				}
			} catch (error) {
				console.error(
					"PartyContext: Error calling activatePartyCheckInFunction:",
					error,
				);
				const message = error.message || "Could not activate party check-in.";
				setPartyError(message);
				Alert.alert("Activation Error", message);
				return false;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[
			currentPartyIds,
			partyDetails,
			currentUserData?.uid, // Fixed dependency: use currentUserData.uid instead of isHost
			activatePartyCheckInFunction,
			setIsLoadingPartyAction,
			setPartyError,
		],
	);

	// --- NEW cancelPartyCheckIn function ---
	const cancelPartyCheckIn = useCallback(async () => {
		// Get current party ID from context (object → first value)
		const partyId = Object.values(currentPartyIds)[0];
		const partyData = partyDetails[partyId] || {};

		const checkInId = partyData.activeCheckInId;
		const isHost = partyData.hostUserId === currentUserData?.uid;
		const currentStatus = partyData.status;

		console.log(
			`PartyContext: Attempting to cancel check-in. PartyID: ${partyId}, CheckInID: ${checkInId}, IsHost: ${isHost}, Status: ${currentStatus}`,
		);

		if (
			!isHost ||
			currentStatus !== "AWAITING_TABLE" ||
			!partyId ||
			!checkInId
		) {
			Alert.alert(
				"Cannot Cancel",
				"This check-in request cannot be cancelled at this time.",
			);
			console.error(
				"PartyContext.cancelPartyCheckIn: Pre-conditions not met.",
				{
					partyId,
					checkInId,
					isHost,
					currentStatus,
				},
			);
			return false;
		}

		setIsLoadingPartyAction(true);
		setPartyError(null);

		try {
			const result = await cancelPartyCheckInFunction({ partyId, checkInId });
			if (result.data.success) {
				console.log(
					"PartyContext: Check-in cancellation successful. Listener will update UI.",
				);
				return true;
			} else {
				throw new Error(
					result.data.error || "Cloud function failed to cancel check-in.",
				);
			}
		} catch (error) {
			console.error(
				"PartyContext: Error calling cancelPartyCheckIn CF:",
				error,
			);
			const message = error.message || "Could not cancel the check-in request.";
			setPartyError(message);
			Alert.alert("Cancellation Failed", message);
			return false;
		} finally {
			setIsLoadingPartyAction(false);
		}
	}, [
		currentPartyIds,
		partyDetails,
		currentUserData?.uid,
		setIsLoadingPartyAction,
		setPartyError,
		cancelPartyCheckInFunction,
	]);

	// --- NEW Action: Cancel Party (for Host) ---
	const cancelParty = async () => {
		if (!currentUserData?.uid || !currentPartyIds || isLoadingPartyAction)
			return;

		// Extract the actual partyId (string) from the object
		const partyId = Object.values(currentPartyIds)[0];
		const partyData = partyDetails[partyId] || {};
		const isHost = partyData.hostUserId === currentUserData?.uid;

		// Optional: Add client-side host check (Cloud Function still verifies)
		if (!isHost) {
			Alert.alert(
				"Permission Denied",
				"Only the party host can cancel the party.",
			);
			console.warn("PartyContext.cancelParty: Non-host attempted to cancel.");
			return;
		}

		console.log(`PartyContext: Attempting to cancel party: ${partyId}`);

		setIsLoadingPartyAction(true);
		setPartyError(null);

		try {
			const result = await cancelPartyFunction({ partyId }); // Fixed: pass string

			if (result.data.success) {
				console.log("PartyContext: Cancelled party successfully.");
				// clearPartyState(); // Clear state after cancelling
			} else {
				throw new Error(result.data.error || "Failed to cancel party.");
			}
		} catch (error) {
			console.error("PartyContext: Error cancelling party:", error);
			const message = error.message || "Could not cancel party.";
			setPartyError(message);
			Alert.alert("Error", message);
			setIsLoadingPartyAction(false); // Reset only on error
		} finally {
			setIsLoadingPartyAction(false);
		}
	};

	const addLocalPIPToParty = useCallback(
		async (partyId, pipsToAdd) => {
			// pipsToAdd is an array of {id, name}
			if (!partyId || !pipsToAdd || pipsToAdd.length === 0) {
				console.warn(
					"PartyContext.addLocalPIPsToParty: Prerequisites not met (missing partyId or pipsToAdd).",
				);
				return false;
			}

			setIsLoading(true);
			setPartyError(null);
			try {
				console.log(
					`PartyContext: Calling addLocalPIPsToParty CF for party ${partyId}`,
				);
				const result = await addLocalPIPToPartyFunction({
					partyId,
					pipsToAdd,
				});
				if (result.data.success) {
					console.log(
						"PartyContext: Members added successfully. Listener will update UI.",
					);
					return true;
				} else {
					throw new Error(
						result.data.error || "Cloud function failed to add members.",
					);
				}
			} catch (error) {
				console.error(
					"PartyContext: Error calling addLocalPIPsToParty CF:",
					error,
				);
				const message = error.message || "Could not add members to the party.";
				setPartyError(message);
				Alert.alert("Failed to Add Members", message);
				return false;
			} finally {
				setIsLoading(false);
			}
		},
		[addLocalPIPToPartyFunction, setIsLoading, setPartyError],
	);

	// --- Action: Invite to Party ---
	const inviteToParty = useCallback(async () => {
		const partyId = Object.values(currentPartyIds)[0] || null; // Use currentPartyId
		const partyData = partyDetails[partyId] || {};
		const isHost = partyData.hostUserId === currentUserData?.uid;

		// Debug
		console.log("inviteToParty: Checking host", {
			partyId,
			isHost,
			hostUserId: partyData.hostUserId,
			currentUserId: currentUserData?.uid,
		});

		if (!isHost || !partyId) {
			console.log("inviteToParty: Failed - Not host or missing partyId", {
				isHost,
				partyId,
			});
			Alert.alert(
				"Permission Denied",
				"Only the party host can generate an invite code.",
				[{ text: "OK", style: "cancel" }],
				{ cancelable: true },
			);
			return null;
		}

		setIsLoadingAction(true);
		setPartyError(null);
		try {
			console.log(
				`PartyContext: Calling inviteToParty CF for party ${partyId}`,
			);
			const result = await inviteToPartyFunction({ partyId });

			if (result.data.success && result.data.inviteCode) {
				console.log(
					`PartyContext: Invite code generated: ${result.data.inviteCode}`,
				);
				return result.data.inviteCode;
			} else {
				throw new Error(
					result.data.error ||
						"Cloud function failed to generate an invite code.",
				);
			}
		} catch (error) {
			console.error("PartyContext: Error calling inviteToParty CF:", error);
			const message = error.message || "Could not generate an invite code.";
			setPartyError(message);
			Alert.alert("Invite Error", message, [{ text: "OK", style: "cancel" }], {
				cancelable: true,
			});
			return null;
		} finally {
			setIsLoadingAction(false);
		}
	}, [
		currentPartyIds,
		partyDetails,
		currentUserData?.uid,
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
					`PartyContext: Calling joinParty CF with code: ${inviteCode}`,
				);
				const result = await joinPartyFunction({ inviteCode });

				if (result.data.success && result.data.partyId) {
					console.log(
						`PartyContext: Successfully joined party ${result.data.partyId}.`,
					);
					// The main context listener will automatically pick up the party details
					// once the user is added to guestUserIds. We can also manually set it
					// to speed up the UI transition.
					setCurrentPartyIds({
						[result.data.restaurantId]: result.data.partyId,
					});
					return true; // Indicate success
				} else {
					throw new Error(
						result.data.error || "Cloud function failed to join party.",
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
		[setIsLoadingAction, setPartyError, joinPartyFunction, setCurrentPartyIds],
	);

	/**
	 * Adds an item to the shared party basket.
	 * @param {object} partyContextData - Contains partyId, orderingForUserId, orderingForPipName.
	 * @param {object} menuItemDetails - Contains details of the menu item (id, name, price, quantity, specialInstructions).
	 * @returns {Promise<string | null>} The ID of the added basket item, or null on failure.
	 */
	const addItemToPartyBasket = async (partyContextData, menuItemDetails) => {
		console.log("This is Context", partyDetails);
		const { partyId, orderingForUserId, orderingForPipName } = partyContextData;

		console.log("Party Context Add Item To Basket Called");

		if (!currentUserData?.uid) {
			Alert.alert("Error", "You must be logged in to add items.");
			return null;
		}
		if (!partyId || !orderingForUserId || !menuItemDetails) {
			Alert.alert(
				"Error",
				"Missing required information to add item to party basket.",
			);
			console.error("addItmToPartyBasket: Missing data", {
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
				{ orderingForUserId, orderingForPipName, menuItemDetails },
			);
			const result = await addItemToSharedBasketFunction({
				partyId,
				orderingForUserId,
				orderingForPipName,
				menuItemData: {
					// Ensure structure matches what CF expects
					id: menuItemDetails.id, // menuItemIdd
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
					`PartyContext: Item ${result.data.basketItemId} added successfully to shared basket for party ${partyId}.`,
				);
				// The onSnapshot listener for sharedBaskets will automatically update the UI.
				// No need to manually update sharedBaskets state here.
				return result.data.basketItemId; // Return the new basket item's ID
			} else {
				throw new Error(
					result.data.error ||
						"Cloud function failed to add item to shared basket.",
				);
			}
		} catch (error) {
			console.error(
				"PartyContext: Error calling addItemToSharedBasket CF:",
				error,
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
		userId,
	) => {
		// This log should now be the first thing you see when the function is successfully called.
		console.log(
			`PartyContext: handlePartyItemQuantityChange INVOKED with qty: ${newQuantity}`,
		);

		let numericQuantity = Math.max(0, Number(newQuantity));
		if (isNaN(numericQuantity)) return false;

		if (numericQuantity === 0) {
			return await removePartyBasketItem(partyId, itemId, userId);
		}

		try {
			const payload = { partyId, itemId, newQuantity: numericQuantity, userId };
			await updatePartyBasketItemQuantityFunction(payload);
			return true;
		} catch (error) {
			Alert.alert(
				"Update Failed",
				error.message || "Could not update item quantity.",
			);
			return false;
		}
	};
	const removePartyBasketItem = useCallback(
		async (partyId, itemId, userId) => {
			console.log("Triggered", userId, partyId, itemId);
			if (!userId || !partyId || !itemId) {
				Alert.alert("Error", "Missing information to remove item from party.");
				return false;
			}

			setIsLoadingAction(true);
			setPartyError(null);

			// Construct a single payload object for the Cloud Function.
			const payload = {
				partyId: partyId,
				itemId: itemId,
				userId: userId, // The user performing the action
			};

			console.log(
				"PartyContext: Calling removeSharedBasketItem CF with payload:",
				payload,
			);

			try {
				const result = await removePartyBasketItemFunction(payload);
				if (result.data.success) {
					console.log(
						`PartyContext: Item ${itemId} reported as removed by CF.`,
					);
					return true;
				} else {
					throw new Error(
						result.data.error || "Cloud function failed to remove item.",
					);
				}
			} catch (error) {
				console.error(
					"PartyContext: Error calling removeSharedBasketItem CF:",
					error,
				);
				const message = error.message || "Could not remove the item.";
				setPartyError(message);
				Alert.alert("Remove Failed", message);
				return false;
			} finally {
				setIsLoadingAction(false);
			}
		},
		[
			currentUserData?.uid,
			removePartyBasketItemFunction,
			setIsLoadingPartyAction,
			setPartyError,
		],
	);

	const sendMyItemsToKitchen = useCallback(async () => {
		const partyId = Object.values(currentPartyIds)[0] || null;
		const party = partyDetails[partyId] || {};

		const { id, status, table, restaurantId } = party;
		const server = party.server || { id: "unassigned", name: "Self-Seated" };

		const { uid: userId } = currentUserData || {};

		if (status !== "active") {
			Alert.alert("Cannot Send Order", "The party must be active and seated.");
			return false;
		}

		if (!partyId || !table?.id || !server?.id || !userId || !restaurantId) {
			Alert.alert("Error", "Missing critical party information.");
			return false;
		}

		setIsLoadingAction(true);
		setPartyError(null);

		try {
			// 🚨 THE FIX: Get a list of ALL your PIPs from Firestore before sending the request
			const pipsRef = db.collection(`customers/${userId}/pips`);
			const pipsSnapshot = await pipsRef.get();
			const myPipIds = pipsSnapshot.docs.map((doc) => doc.id);

			// Add the user's actual ID to the list of acceptable IDs
			const allAllowedUserIds = [userId, ...myPipIds];

			console.log(
				`Calling sendOrderToKitchen CF for party ${partyId}. Allowed IDs:`,
				allAllowedUserIds,
			);

			// --- Call the new Cloud Function with the PIPs included ---
			const result = await sendOrderToKitchenFunction({
				type: "party",
				sourceId: partyId,
				table: { id: table.id, name: table.name },
				server: { id: server.id, name: server.name },

				// 🚨 Pass the full array of IDs to the backend!
				allowedUserIds: allAllowedUserIds,
			});

			if (result.data.success) {
				const itemsSent = result.data.itemsSent;
				console.log(`Successfully sent ${itemsSent} item(s) to the kitchen.`);
				if (itemsSent === 0) {
					Alert.alert(
						"No New Items",
						"All of your current items have already been sent.",
					);
				}
				return true;
			} else {
				throw new Error(result.data.error || "Cloud function failed.");
			}
		} catch (error) {
			console.error(
				"PartyContext: Error calling sendOrderToKitchen CF:",
				error,
			);
			const message = error.message || "Could not send items to the kitchen.";
			setPartyError(message);
			Alert.alert("Order Send Failed", message);
			return false;
		} finally {
			setIsLoadingAction(false);
		}
	}, [
		currentPartyIds,
		partyDetails,
		currentUserData,
		sendOrderToKitchenFunction,
	]);

	// --- Context Value ---
	const value = {
		currentPartyIds,
		partyStatus,
		partyDetails,
		isLoadingParty: isLoading,

		partyError,
		sharedBaskets,
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
