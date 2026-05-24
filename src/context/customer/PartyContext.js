// src/context/customer/PartyContext.js
import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useCallback,
	useMemo,
} from "react";
import { Alert } from "react-native";
import { db, functions } from "../../config/firebase";
import { AuthContext } from "../authContext";
import { httpsCallable } from "@react-native-firebase/functions";

export const PartyContext = createContext({
	currentPartyIds: {},
	partyStatus: null,
	partyDetails: {},
	isLoadingParty: true,
	partyError: null,
	sharedBaskets: {},
	isLoadingBasket: false,

	createParty: async (restaurantId, restaurantName, options = {}) => null,
	getOrCreatePickupParty: async (restaurantId, restaurantName) => null,
	joinParty: async (_inviteData) => false,
	leaveParty: async (_partyId) => false,
	activatePartyCheckIn: async (_checkInDocId, _partyIdOverride) => false,
	cancelPartyCheckIn: async (_partyIdOverride) => false,
	inviteToParty: async (_partyIdOverride) => null,
	cancelParty: async (_partyIdOverride) => false,
	clearPartyState: () => {},
	addLocalPIPToParty: async (_partyId, _localPIPId, _localPIPName) => false,
	addItemToPartyBasket: async (_partyContextData, _menuItemDetails) => null,
	handlePartyItemQuantityChange: async (
		_partyId,
		_itemId,
		_newQuantity,
		_userId,
	) => false,
	sendMyItemsToKitchen: async (_partyIdOverride) => false,
});

export const PartyProvider = ({ children }) => {
	const { currentUserData } = useContext(AuthContext);

	const [currentPartyIds, setCurrentPartyIds] = useState({});
	const [partyStatus, setPartyStatus] = useState(null);
	const [partyDetails, setPartyDetails] = useState({});
	const [sharedBaskets, setSharedBaskets] = useState({});
	const [partyError, setPartyError] = useState(null);

	const [isLoadingPartyAction, setIsLoadingPartyAction] = useState(false);
	const [isLoadingBasket, setIsLoadingBasket] = useState(true);
	const [isLoading, setIsLoading] = useState(false);

	// Cloud Functions
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
	const sendOrderToKitchenFunction = httpsCallable(
		functions,
		"sendOrderToKitchen",
	);

	const clearPartyState = useCallback(() => {
		setCurrentPartyIds({});
		setPartyStatus(null);
		setPartyDetails({});
		setSharedBaskets({});
		setPartyError(null);
		setIsLoadingBasket(false);
		setIsLoadingPartyAction(false);
	}, []);

	// Reset when user logs out
	useEffect(() => {
		if (!currentUserData?.uid) {
			clearPartyState();
			setIsLoading(false);
		}
	}, [currentUserData?.uid, clearPartyState]);

	// Listen to all active parties for this user
	useEffect(() => {
		if (!currentUserData?.uid) {
			setCurrentPartyIds({});
			setIsLoading(false);
			return;
		}

		setIsLoading(true);

		const userPartiesQuery = db
			.collection("parties")
			.where("guestUserIds", "array-contains", currentUserData.uid)
			.where("status", "in", ["pending", "AWAITING_TABLE", "active"]);

		const unsubscribeUserParty = userPartiesQuery.onSnapshot(
			(snapshot) => {
				const nextPartyIds = {};
				const nextPartyStatus = {};

				snapshot.docs.forEach((doc) => {
					const data = doc.data();
					if (!data?.restaurantId) return;

					const restaurantId = data.restaurantId;
					const mode = data.orderMode === "pickup" ? "pickup" : "dineIn";

					if (!nextPartyIds[restaurantId]) {
						nextPartyIds[restaurantId] = {
							dineIn: null,
							pickup: null,
						};
					}

					nextPartyIds[restaurantId][mode] = doc.id;
					nextPartyStatus[doc.id] = data.status || null;
				});

				setCurrentPartyIds(nextPartyIds);

				// Keep a coarse top-level status for compatibility
				const firstSessionGroup = Object.values(nextPartyIds)[0];
				const firstPartyId =
					firstSessionGroup?.dineIn || firstSessionGroup?.pickup || null;

				setPartyStatus(firstPartyId ? nextPartyStatus[firstPartyId] : null);
				setIsLoading(false);
			},
			(error) => {
				console.error(
					"PartyContext: Error listening for user's active parties:",
					error,
				);
				setPartyError("Could not check for active parties.");
				setIsLoading(false);
			},
		);

		return () => unsubscribeUserParty();
	}, [currentUserData?.uid]);

	// Listen to party docs
	useEffect(() => {
		const partyIds = Object.values(currentPartyIds || {})
			.flatMap((sessionGroup) => [sessionGroup?.dineIn, sessionGroup?.pickup])
			.filter(Boolean);
		if (partyIds.length === 0) {
			setPartyDetails({});
			return;
		}

		const unsubscribers = partyIds.map((partyId) => {
			return db
				.collection("parties")
				.doc(partyId)
				.onSnapshot(
					(docSnap) => {
						if (docSnap.exists()) {
							setPartyDetails((prev) => ({
								...prev,
								[partyId]: { id: partyId, ...docSnap.data() },
							}));
						} else {
							setPartyDetails((prev) => {
								const next = { ...prev };
								delete next[partyId];
								return next;
							});
						}
					},
					(error) => {
						console.error(
							`PartyContext: Error listening to party ${partyId}:`,
							error,
						);
					},
				);
		});

		return () => unsubscribers.forEach((unsub) => unsub());
	}, [currentPartyIds]);

	// Listen to shared baskets
	useEffect(() => {
		const partyIds = Object.values(currentPartyIds || {})
			.flatMap((sessionGroup) => [sessionGroup?.dineIn, sessionGroup?.pickup])
			.filter(Boolean);
		if (partyIds.length === 0) {
			setSharedBaskets({});
			setIsLoadingBasket(false);
			return;
		}

		setIsLoadingBasket(true);

		const unsubscribers = partyIds.map((partyId) => {
			return db
				.collection("shared_baskets")
				.doc(partyId)
				.onSnapshot(
					(docSnap) => {
						const basketData = docSnap.exists()
							? docSnap.data()
							: { items: [] };
						setSharedBaskets((prev) => ({
							...prev,
							[partyId]: basketData,
						}));
						setIsLoadingBasket(false);
					},
					(error) => {
						console.error(
							`PartyContext: Error listening to shared basket ${partyId}:`,
							error,
						);
						setIsLoadingBasket(false);
					},
				);
		});

		return () => unsubscribers.forEach((unsub) => unsub());
	}, [currentPartyIds]);

	const getFirstActivePartyId = useCallback(() => {
		const sessionGroups = Object.values(currentPartyIds || {});

		for (const sessionGroup of sessionGroups) {
			if (sessionGroup?.dineIn) return sessionGroup.dineIn;
			if (sessionGroup?.pickup) return sessionGroup.pickup;
		}

		return null;
	}, [currentPartyIds]);

	const createParty = useCallback(
		async (restaurantId, restaurantName, options = {}) => {
			if (!currentUserData?.uid || !restaurantId || isLoadingPartyAction) {
				return null;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			try {
				const payload = {
					restaurantId,
					orderMode: options.orderMode || "dineIn",
					fulfillmentType:
						options.fulfillmentType ||
						(options.orderMode === "pickup" ? "hotel_pickup" : "table"),
					joinable: options.joinable ?? options.orderMode !== "pickup",
				};

				const result = await createPartyFunction(payload);

				if (result?.data?.success && result?.data?.partyId) {
					const newPartyId = result.data.partyId;

					const modeKey = payload.orderMode === "pickup" ? "pickup" : "dineIn";

					setCurrentPartyIds((prev) => ({
						...prev,
						[restaurantId]: {
							dineIn: prev?.[restaurantId]?.dineIn || null,
							pickup: prev?.[restaurantId]?.pickup || null,
							[modeKey]: newPartyId,
						},
					}));
					setPartyStatus(payload.orderMode === "pickup" ? "active" : "pending");

					return newPartyId;
				}

				throw new Error(result?.data?.error || "Failed to create party.");
			} catch (error) {
				console.error("PartyContext: Error creating party:", error);
				const message = error?.message || "Could not create party.";
				setPartyError(message);
				Alert.alert("Error", message);
				return null;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[currentUserData?.uid, isLoadingPartyAction, createPartyFunction],
	);

	const getOrCreatePickupParty = useCallback(
		async (restaurantId, restaurantName) => {
			if (!restaurantId) return null;

			const existingPartyId = currentPartyIds?.[restaurantId]?.pickup || null;
			const existingParty = existingPartyId
				? partyDetails?.[existingPartyId]
				: null;

			if (
				existingPartyId &&
				existingParty &&
				existingParty.orderMode === "pickup"
			) {
				return existingPartyId;
			}

			return createParty(restaurantId, restaurantName, {
				orderMode: "pickup",
				fulfillmentType: "hotel_pickup",
				joinable: false,
			});
		},
		[currentPartyIds, partyDetails, createParty],
	);

	const getRestaurantSessions = useCallback(
		(restaurantId) => {
			if (!restaurantId) {
				return {
					dineInPartyId: null,
					pickupPartyId: null,
				};
			}

			return {
				dineInPartyId: currentPartyIds?.[restaurantId]?.dineIn || null,
				pickupPartyId: currentPartyIds?.[restaurantId]?.pickup || null,
			};
		},
		[currentPartyIds],
	);

	const leaveParty = useCallback(
		async (partyId) => {
			if (!currentUserData?.uid || !partyId || isLoadingPartyAction) {
				return false;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			try {
				const result = await leavePartyFunction({ partyId });

				if (result?.data?.success) {
					const {
						preservedPartyId,
						restaurantId,
						orderMode = "dineIn",
					} = result.data || {};
					const modeKey = orderMode === "pickup" ? "pickup" : "dineIn";

					setCurrentPartyIds((prev) => {
						const next = { ...prev };

						Object.entries(next).forEach(([currentRestaurantId, sessions]) => {
							const nextSessions = { ...(sessions || {}) };

							if (nextSessions.dineIn === partyId) {
								nextSessions.dineIn = null;
							}
							if (nextSessions.pickup === partyId) {
								nextSessions.pickup = null;
							}

							if (
								preservedPartyId &&
								restaurantId &&
								currentRestaurantId === restaurantId
							) {
								nextSessions[modeKey] = preservedPartyId;
							}

							if (nextSessions.dineIn || nextSessions.pickup) {
								next[currentRestaurantId] = nextSessions;
							} else {
								delete next[currentRestaurantId];
							}
						});

						if (preservedPartyId && restaurantId && !next[restaurantId]) {
							next[restaurantId] = {
								dineIn: modeKey === "dineIn" ? preservedPartyId : null,
								pickup: modeKey === "pickup" ? preservedPartyId : null,
							};
						}

						return next;
					});

					setPartyDetails((prev) => {
						const next = { ...prev };
						delete next[partyId];
						return next;
					});

					setSharedBaskets((prev) => {
						const next = { ...prev };
						delete next[partyId];
						return next;
					});

					return true;
				}

				throw new Error(result?.data?.error || "Failed to leave party.");
			} catch (error) {
				console.error("PartyContext: Error leaving party:", error);
				const message = error?.message || "Could not leave party.";
				setPartyError(message);
				Alert.alert("Error", message);
				return false;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[currentUserData?.uid, isLoadingPartyAction, leavePartyFunction],
	);

	const activatePartyCheckIn = useCallback(
		async (checkInDocId, partyIdOverride = null) => {
			const partyId = partyIdOverride || getFirstActivePartyId();
			const partyData = partyId ? partyDetails?.[partyId] || {} : {};
			const isHost = partyData.hostUserId === currentUserData?.uid;

			if (!partyId) {
				Alert.alert("Error", "No active party selected to activate.");
				return false;
			}

			if (!checkInDocId || typeof checkInDocId !== "string") {
				Alert.alert("Error", "Check-In ID is missing for party activation.");
				return false;
			}

			if (!isHost) {
				Alert.alert(
					"Permission Denied",
					"Only the party host can activate the check-in.",
				);
				return false;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			try {
				const result = await activatePartyCheckInFunction({
					partyId,
					checkInId: checkInDocId,
				});

				if (result?.data?.success) {
					return true;
				}

				throw new Error(
					result?.data?.error || "Could not activate party check-in.",
				);
			} catch (error) {
				console.error(
					"PartyContext: Error calling activatePartyCheckInFunction:",
					error,
				);
				const message = error?.message || "Could not activate party check-in.";
				setPartyError(message);
				Alert.alert("Activation Failed", message);
				return false;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[
			getFirstActivePartyId,
			partyDetails,
			currentUserData?.uid,
			activatePartyCheckInFunction,
		],
	);

	const cancelPartyCheckIn = useCallback(
		async (partyIdOverride = null) => {
			const partyId = partyIdOverride || getFirstActivePartyId();
			if (!partyId) return false;

			setIsLoadingPartyAction(true);
			setPartyError(null);

			try {
				const result = await cancelPartyCheckInFunction({ partyId });

				if (result?.data?.success) {
					return true;
				}

				throw new Error(
					result?.data?.error || "Could not cancel party check-in.",
				);
			} catch (error) {
				console.error("PartyContext: Error cancelling party check-in:", error);
				const message = error?.message || "Could not cancel party check-in.";
				setPartyError(message);
				Alert.alert("Error", message);
				return false;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[getFirstActivePartyId, cancelPartyCheckInFunction],
	);

	const cancelParty = useCallback(
		async (partyIdOverride = null) => {
			const partyId = partyIdOverride || getFirstActivePartyId();
			if (!partyId) return false;

			setIsLoadingPartyAction(true);
			setPartyError(null);

			try {
				const result = await cancelPartyFunction({ partyId });

				if (result?.data?.success) {
					return true;
				}

				throw new Error(result?.data?.error || "Could not cancel party.");
			} catch (error) {
				console.error("PartyContext: Error cancelling party:", error);
				const message = error?.message || "Could not cancel party.";
				setPartyError(message);
				Alert.alert("Error", message);
				return false;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[getFirstActivePartyId, cancelPartyFunction],
	);

	const inviteToParty = useCallback(
		async (partyIdOverride = null) => {
			const partyId = partyIdOverride || getFirstActivePartyId();
			const partyData = partyId ? partyDetails?.[partyId] || {} : {};
			const isHost = partyData.hostUserId === currentUserData?.uid;

			if (!isHost || !partyId) {
				Alert.alert(
					"Permission Denied",
					"Only the party host can generate an invite code.",
				);
				return null;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			try {
				const result = await inviteToPartyFunction({ partyId });

				if (result?.data?.success && result?.data?.inviteCode) {
					return result.data.inviteCode;
				}

				throw new Error(
					result?.data?.error || "Could not generate an invite code.",
				);
			} catch (error) {
				console.error("PartyContext: Error calling inviteToParty CF:", error);
				const message = error?.message || "Could not generate an invite code.";
				setPartyError(message);
				Alert.alert("Invite Error", message);
				return null;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[
			getFirstActivePartyId,
			partyDetails,
			currentUserData?.uid,
			inviteToPartyFunction,
		],
	);

	const joinParty = useCallback(
		async ({ inviteCode }) => {
			if (!inviteCode) {
				Alert.alert("Error", "An invite code is required.");
				return false;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			try {
				const result = await joinPartyFunction({ inviteCode });

				if (result?.data?.success && result?.data?.partyId) {
					return true;
				}

				throw new Error(result?.data?.error || "Could not join party.");
			} catch (error) {
				console.error("PartyContext: Error joining party:", error);
				const message = error?.message || "Could not join party.";
				setPartyError(message);
				Alert.alert("Join Error", message);
				return false;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[joinPartyFunction],
	);

	const addLocalPIPToParty = useCallback(
		async (partyId, localPIPId, localPIPName) => {
			if (!partyId || !localPIPId || !localPIPName) {
				Alert.alert("Error", "Missing member information.");
				return false;
			}

			setIsLoading(true);
			setPartyError(null);

			try {
				const result = await addLocalPIPToPartyFunction({
					partyId,
					localPIPId,
					localPIPName,
				});

				if (result?.data?.success) {
					return true;
				}

				throw new Error(
					result?.data?.error || "Could not add members to the party.",
				);
			} catch (error) {
				console.error(
					"PartyContext: Error calling addLocalPIPToParty CF:",
					error,
				);
				const message = error?.message || "Could not add members to the party.";
				setPartyError(message);
				Alert.alert("Failed to Add Members", message);
				return false;
			} finally {
				setIsLoading(false);
			}
		},
		[addLocalPIPToPartyFunction],
	);

	const addItemToPartyBasket = useCallback(
		async (partyContextData, menuItemDetails) => {
			const { partyId, orderingForUserId, orderingForPipName } =
				partyContextData || {};

			if (!partyId || !orderingForUserId || !menuItemDetails?.id) {
				Alert.alert("Error", "Missing basket item details.");
				return null;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			try {
				let processedInstructions = menuItemDetails.specialInstructions || "";

				if (
					typeof processedInstructions === "string" &&
					processedInstructions.trim() !== ""
				) {
					try {
						const translateInstruction = httpsCallable(
							functions,
							"translateInstruction",
						);
						const translationResponse = await translateInstruction({
							text: processedInstructions,
						});

						if (translationResponse?.data?.en) {
							processedInstructions = translationResponse.data;
						}
					} catch (translationError) {
						console.error(
							"Translation API failed, falling back to original text:",
							translationError,
						);
						processedInstructions = {
							original: processedInstructions,
							en: processedInstructions,
							es: processedInstructions,
						};
					}
				}

				const result = await addItemToSharedBasketFunction({
					partyId,
					orderingForUserId,
					orderingForPipName,
					menuItemData: {
						id: menuItemDetails.id,
						name: menuItemDetails.name,

						// final price customer is actually paying for this item
						price:
							menuItemDetails.finalUnitPrice !== undefined &&
							menuItemDetails.finalUnitPrice !== null
								? menuItemDetails.finalUnitPrice
								: menuItemDetails.price,

						// keep original base item price too
						basePrice:
							menuItemDetails.basePrice !== undefined &&
							menuItemDetails.basePrice !== null
								? menuItemDetails.basePrice
								: menuItemDetails.price,

						modifiersTotal:
							menuItemDetails.modifiersTotal !== undefined &&
							menuItemDetails.modifiersTotal !== null
								? menuItemDetails.modifiersTotal
								: 0,

						selectedModifiers: Array.isArray(menuItemDetails.selectedModifiers)
							? menuItemDetails.selectedModifiers
							: [],

						quantity: menuItemDetails.quantity,
						specialInstructions: processedInstructions,
						category: menuItemDetails.category,
						imageUri: menuItemDetails.imageUri,
						restaurantId: menuItemDetails.restaurantId,
						itbmsRate:
							menuItemDetails.itbmsRate !== undefined &&
							menuItemDetails.itbmsRate !== null
								? menuItemDetails.itbmsRate
								: 7,
					},
				});

				if (result?.data?.success && result?.data?.basketItemId) {
					return result.data.basketItemId;
				}

				throw new Error(
					result?.data?.error ||
						"Cloud function failed to add item to shared basket.",
				);
			} catch (error) {
				console.error(
					"PartyContext: Error calling addItemToSharedBasket CF:",
					error,
				);
				const message = error?.message || "Could not add item to basket.";
				setPartyError(message);
				Alert.alert("Add Item Failed", message);
				return null;
			} finally {
				setIsLoadingPartyAction(false);
			}
		},
		[addItemToSharedBasketFunction],
	);

	const handlePartyItemQuantityChange = useCallback(
		async (partyId, itemId, newQuantity, userId) => {
			if (!partyId || !itemId || !userId) return false;

			const numericQuantity = Math.max(0, Number(newQuantity));
			if (Number.isNaN(numericQuantity)) return false;

			try {
				if (numericQuantity === 0) {
					const removeResult = await removePartyBasketItemFunction({
						partyId,
						itemId,
						userId,
					});

					if (removeResult?.data?.success) {
						return true;
					}

					throw new Error(
						removeResult?.data?.error || "Could not remove basket item.",
					);
				}

				const updateResult = await updatePartyBasketItemQuantityFunction({
					partyId,
					itemId,
					newQuantity: numericQuantity,
					userId,
				});

				if (updateResult?.data?.success) {
					return true;
				}

				throw new Error(
					updateResult?.data?.error || "Could not update basket item.",
				);
			} catch (error) {
				console.error(
					"PartyContext: Error changing basket item quantity:",
					error,
				);
				const message = error?.message || "Could not update the item quantity.";
				setPartyError(message);
				Alert.alert("Update Failed", message);
				return false;
			}
		},
		[removePartyBasketItemFunction, updatePartyBasketItemQuantityFunction],
	);

	const sendMyItemsToKitchen = useCallback(
		async (partyIdOverride = null) => {
			console.log("=== START: sendMyItemsToKitchen ===");

			const partyId = partyIdOverride;
			console.log("1. Resolved Party ID:", partyId);
			console.log("2. Current User UID:", currentUserData?.uid);

			if (!partyId || !currentUserData?.uid) {
				console.log("-> EXIT: Missing partyId or uid.");
				Alert.alert("Error", "No active order found.");
				return false;
			}

			const party = partyDetails?.[partyId];
			console.log("3. Party Details Found:", !!party);

			if (!party) {
				console.log("-> EXIT: Party details are missing in context.");
				Alert.alert("Error", "Party details are missing.");
				return false;
			}

			const isPickup = party.orderMode === "pickup";
			console.log("4. Order Mode isPickup:", isPickup);

			// Dine-in requires table + server
			if (!isPickup && !party.table) {
				console.log("-> EXIT: Missing table or server for dine-in.");
				Alert.alert(
					"Error",
					"Table or server information is missing for this dine-in order.",
				);
				return false;
			}

			setIsLoadingPartyAction(true);
			setPartyError(null);

			// Extract the payload so we can log it clearly before sending
			const payload = {
				sourceId: partyId,
				table: isPickup
					? { id: "hotel_pickup", name: "Hotel Pickup" }
					: party.table,
				server: isPickup
					? { id: "pickup_queue", name: "Pickup Queue" }
					: party.server,
				allowedUserIds: [currentUserData.uid],
				orderMode: party.orderMode || "dineIn",
				fulfillmentType:
					party.fulfillmentType || (isPickup ? "hotel_pickup" : "table"),
			};

			console.log(
				"5. Sending Payload to Firebase:",
				JSON.stringify(payload, null, 2),
			);

			try {
				const result = await sendOrderToKitchenFunction(payload);
				console.log(
					"6. Received Response from Firebase:",
					JSON.stringify(result?.data, null, 2),
				);

				if (result?.data?.success) {
					// Catch the silent exit if the backend processed successfully but found 0 items
					if (result.data.itemsSent === 0) {
						console.log(
							"-> ALERT: Backend returned success, but 0 items were sent.",
						);
						Alert.alert(
							"Notice",
							"No new items found in your cart to send. Make sure the item status is 'new'.",
						);
						return false;
					}

					console.log("-> SUCCESS: Items successfully sent to kitchen.");
					return true;
				}

				console.log("-> THROWING ERROR: Success was false or missing.");
				throw new Error(result?.data?.error || "Could not send items.");
			} catch (error) {
				console.error("7. CATCH BLOCK: Error sending items to kitchen:", error);
				const message = error?.message || "Could not send items.";
				setPartyError(message);
				Alert.alert("Send Failed", message);
				return false;
			} finally {
				console.log("8. FINALLY: Resetting loading state.");
				setIsLoadingPartyAction(false);
				console.log("=== END: sendMyItemsToKitchen ===");
			}
		},
		[
			getFirstActivePartyId,
			currentUserData?.uid,
			partyDetails,
			sendOrderToKitchenFunction,
		],
	);
	const isLoadingParty = useMemo(() => {
		return isLoading || isLoadingPartyAction;
	}, [isLoading, isLoadingPartyAction]);

	const value = useMemo(
		() => ({
			currentPartyIds,
			partyStatus,
			partyDetails,
			isLoadingParty,
			partyError,
			sharedBaskets,
			isLoadingBasket,

			createParty,
			getOrCreatePickupParty,
			getRestaurantSessions,
			joinParty,
			leaveParty,
			activatePartyCheckIn,
			cancelPartyCheckIn,
			inviteToParty,
			cancelParty,
			clearPartyState,
			addLocalPIPToParty,
			addItemToPartyBasket,
			handlePartyItemQuantityChange,
			sendMyItemsToKitchen,
		}),
		[
			currentPartyIds,
			partyStatus,
			partyDetails,
			isLoadingParty,
			partyError,
			sharedBaskets,
			isLoadingBasket,
			createParty,
			getOrCreatePickupParty,
			joinParty,
			leaveParty,
			activatePartyCheckIn,
			cancelPartyCheckIn,
			inviteToParty,
			cancelParty,
			clearPartyState,
			addLocalPIPToParty,
			addItemToPartyBasket,
			handlePartyItemQuantityChange,
			sendMyItemsToKitchen,
		],
	);

	return (
		<PartyContext.Provider value={value}>{children}</PartyContext.Provider>
	);
};

export const useParty = () => useContext(PartyContext);
