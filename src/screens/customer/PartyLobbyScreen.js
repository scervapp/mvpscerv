import React, {
	useState,
	useEffect,
	useContext,
	useCallback,
	useMemo,
} from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	FlatList,
	Alert,
	Button, // Or use TouchableOpacity/react-native-paper Button
	SafeAreaView,
	RefreshControl,
	Share,
} from "react-native";
import {
	useRoute,
	useNavigation,
	CommonActions,
} from "@react-navigation/native";

import colors from "../../utils/styles/appStyles";

import { AuthContext } from "../../context/authContext";
import { useParty } from "../../context/customer/PartyContext"; // Import the hook

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"; // For icons
import * as Clipboard from "expo-clipboard";
import * as Yup from "yup";
import {
	handlePartyCheckInRequest,
	useCheckInStatus,
} from "../../utils/customerUtils";

import { db, functions } from "../../config/firebase";

import { IconButton } from "react-native-paper";
import PartyLobbyFooter from "../../components/customer/Party/PartyLobbyFooter";
import PartyLobbyHeaderContent from "../../components/customer/Party/PartyLobbyHeaderContent";
import PipInvitationModal from "../../components/customer/Party/PipInvitationModal";
import PartyCheckInModal from "../../components/customer/Party/PartyCheckInModal";

const PartyLobbyScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const initialPartyIdFromRoute = route.params?.partyId;

	const { currentUserData } = useContext(AuthContext);

	const {
		currentPartyId, // Get the ID managed by context
		partyDetails,
		partyStatus,
		isLoadingParty,
		partyError,
		sharedBasketItems,
		isLoadingBasket,
		addItemToPartyBasket,
		removePartyBasketItem,
		updatePartyBasketQuantity,
		inviteToParty, // Use context functions
		addLocalPIPToParty,
		activatePartyCheckIn,
		leaveParty,
		clearPartyState, // To clear state if user manually navigates away
		cancelParty,
	} = useParty();

	const isHost = useMemo(() => {
		if (!currentUserData?.uid || !partyDetails?.hostUserId) {
			return false;
		}
		return currentUserData.uid === partyDetails.hostUserId;
	}, [currentUserData?.uid, partyDetails?.hostUserId]);

	// --- 2. Call ALL hooks UNCONDITIONALLY at the top level ---
	const restaurantIdForCheckIn = useMemo(() => {
		return isHost && partyDetails?.restaurantId
			? partyDetails.restaurantId
			: null;
	}, [isHost, partyDetails?.restaurantId]);

	const userIdForCheckIn = useMemo(() => {
		return isHost && currentUserData?.uid ? currentUserData.uid : null;
	}, [isHost, currentUserData?.uid]);

	const showLoading = isLoadingParty || (isHost && isLoadingHostCheckIn);

	const {
		checkInStatus: hostCheckInStatus,
		isLoading: isLoadingHostCheckIn,
		checkInObj: hostCheckInObj,
	} = useCheckInStatus(restaurantIdForCheckIn, userIdForCheckIn);

	const [isActionLoading, setIsActionLoading] = useState(false); // Specific loading for invite/leave actions
	const [refreshing, setRefreshing] = useState(false);
	const [isLoadingCheckInAction, setIsLoadingCheckInAction] = useState(false); // <<< NEW: Loading for check-in action
	const [isPipModalVisible, setIsPipModalVisible] = useState(false);
	const [pips, setPips] = useState([]);
	const [isCheckInModalVisible, setIsCheckInModalVisible] = useState(false);
	const [isLoadingPips, setIsLoadingPips] = useState(false);

	const currentPartyStatus = partyDetails?.status || "unknown"; // Use status from details

	const openCheckInModal = () => setIsCheckInModalVisible(true);
	const closeCheckInModal = () => setIsCheckInModalVisible(false);

	const onRefresh = useCallback(() => {
		// Manual refresh is less critical with the real-time listener,
		// but can be kept as a fallback or removed.
		// If kept, it doesn't need to do anything as the listener handles updates.
		setRefreshing(true);
		// Simulate refresh end after a short delay
		setTimeout(() => setRefreshing(false), 1000);
	}, []);
	// --- Effect to handle navigation if party context doesn't match route param ---
	useEffect(() => {
		// This effect runs when the context's idea of the party changes,
		// or when the initial loading state of the context resolves.
		if (!isLoadingParty && partyDetails && currentPartyId) {
			// Wait for all context loading to settle

			if (currentPartyId !== initialPartyIdFromRoute) {
				// If context has no party, or a DIFFERENT party than what this screen was opened for,
				// it implies the party ended, user left, or an error occurred.
				console.log(
					`PartyLobby: Mismatch or party cleared. ContextPartyId: ${currentPartyId}, RoutePartyId: ${initialPartyIdFromRoute}. Navigating back.`
				);
				Alert.alert("Party Ended", "This party session is no longer active.");
				if (navigation.canGoBack()) {
					navigation.goBack();
				} else {
					navigation.dispatch(
						CommonActions.reset({
							index: 0,
							routes: [{ name: "CustomerHome" }],
						})
					);
				}
			} else {
				// Context currentPartyId matches initialPartyIdFromRoute, and not loading
				// This means partyDetails should be loading or loaded by the context listener.
				console.log(
					`PartyLobby: Context matches route. Party ID: ${currentPartyId}`
				);
			}

			// If initialPartyIdFromRoute is null/undefined, this screen was likely opened incorrectly.
			// The rendering logic below should handle !partyDetails.
		}
	}, [
		currentPartyId,
		isLoadingParty,
		initialPartyIdFromRoute,
		navigation,
		partyDetails,
	]);

	// Effect to clear party state if user manually navigates away using back button
	useEffect(() => {
		const unsubscribe = navigation.addListener("beforeRemove", (e) => {
			// Only clear state if navigating back from this screen and user is still in a party
			if (e.data.action.type === "GO_BACK" && currentPartyId) {
				console.log("PartyLobby: Navigating back, clearing party state.");
				// We don't prevent navigation, just clear the context state
				// Note: This assumes leaving the lobby means leaving the party context.
				// If you want context to persist, remove this listener.
				// clearPartyState(); // Decide if this is the desired behavior
			}
		});
		return unsubscribe;
	}, [navigation, currentPartyId, clearPartyState]);

	// --- NEW: Group Shared Basket Items for Display ---
	const groupedBasketItems = useMemo(() => {
		if (!sharedBasketItems || sharedBasketItems.length === 0) return [];
		const groups = {};
		sharedBasketItems.forEach((item) => {
			// Group by the PIP name stored on the item, or fallback
			const groupKey =
				item.orderedByPipName ||
				`User: ${item.orderedByUserId?.slice(-4) || "Unknown"}`;
			if (!groups[groupKey]) {
				groups[groupKey] = {
					groupName: groupKey,
					isCurrentUserGroup: item.orderedByUserId === currentUserData?.uid,
					items: [],
				};
			}
			groups[groupKey].items.push(item);
		});
		return Object.values(groups);
	}, [sharedBasketItems, currentUserData?.uid]);

	// Visual loading feedback — but don't block effects/hooks
	if (isLoadingParty || !partyDetails) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}
	// --- Action Handlers ---

	const fetchPips = async () => {
		if (!currentUserData?.uid) return;
		setIsLoadingPips(true);
		try {
			// --- REFACTORED FIRESTORE QUERY ---
			const pipsQuery = db
				.collection(`customers/${currentUserData.uid}/pips`)
				.orderBy("name");
			const querySnapshot = await pipsQuery.get();
			const pipsArray = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setPips(pipsArray);
		} catch (error) {
			console.error("PartyLobby: Error fetching PIPs:", error);
			Alert.alert("Error", "Could not load your PIPs list.");
		} finally {
			setIsLoadingPips(false);
		}
	};
	const handleInvitePip = async () => {
		console.log("PartyLobby: handleInvitePip - Invite PIP button pressed."); // <-- Log start
		// Keep existing checks
		if (!currentPartyId || isActionLoading || isLoadingPips) return;

		// --- MODIFICATION START ---
		await fetchPips(); // Fetch/refresh PIPs before opening modal
		// Only open if fetch didn't immediately fail and component is still mounted
		// (isLoadingPips check handles potential immediate failure)
		if (!isLoadingPips) {
			console.log("PartyLobby: handleInvitePip - Opening PIP selection modal."); // <-- Log modal open
			setIsPipModalVisible(true); // Open the modal
		}

		// --- MODIFICATION END ---
	};
	// Helper for inviting specific user after selection
	const sendInviteToUserPIP = async (pipUserId, pipName) => {
		console.log(
			`PartyLobby: invitePipById - Attempting to invite PIP: ID=${pipUserId}, Name=${pipName}`
		);

		if (!currentPartyId || !pipUserId || isActionLoading) return;
		setIsActionLoading(true);
		try {
			const result = await inviteToParty({
				partyId: currentPartyId,
				inviteeUserId: pipUserId,
			});

			if (result?.success) {
				Alert.alert("Success", `Invite sent to ${pipName}!`);
				setIsPipModalVisible(false); // Close modal
			} else {
				// Error was likely already shown by context alert, but log here too
				console.log(
					"PartyLobby: sendInviteToUserPip - inviteToParty context function reported failure."
				);
			}
		} catch (error) {
			// Error already shown by context Alert
			console.error("PartyLobby: Error inviting PIP:", error);
		} finally {
			setIsActionLoading(false);
			console.log(
				`PartyLobby: invitePipById - Finished attempt for PIP ID: ${pipUserId}`
			);
		}
	};

	const addLocalPIP = async (localPIPId, localPIPName) => {
		console.log(
			`PartyLobby: addLocalPip - Adding local PIP: ID=${localPipId}, Name=${localPipName}`
		);
		if (!currentPartyId || !localPipId || !localPipName || isActionLoading)
			return;
		setIsActionLoading(true);
		try {
			console.log(
				`PartyLobby: addLocalPip - Calling addLocalPipToParty context function for party ${currentPartyId}`
			);
			// Use the new context function
			const result = await addLocalPipToParty(
				currentPartyId,
				localPipId,
				localPipName
			);
			// Check if the context function indicated success
			if (result?.success) {
				console.log(
					"PartyLobby: addLocalPip - addLocalPipToParty call successful."
				);
				// Alert.alert("Success", `${localPipName} added to the party!`); // Optional confirmation
				setIsPipModalVisible(false); // Close modal
			} else {
				console.log(
					"PartyLobby: addLocalPip - addLocalPipToParty context function reported failure."
				);
			}
		} catch (error) {
			console.error("PartyLobby: Error adding local PIP:", error);
			Alert.alert("Error", `Failed to add local PIP: ${error.message}`);
		} finally {
			setIsActionLoading(false);
			console.log(
				`PartyLobby: addLocalPip - Finished attempt for local PIP ID: ${localPipId}`
			);
		}
	};

	const handleGenerateCode = async () => {
		if (!currentPartyId || isActionLoading) return;
		setIsActionLoading(true);
		try {
			const result = await inviteToParty({
				partyId: currentPartyId,
				generateCode: true,
			});
			if (result?.inviteCode) {
				const code = result.inviteCode;
				const message = `Join my party at ${
					partyDetails?.restaurantName || "the restaurant"
				}! Use this code in the Scerv app: ${code}`;
				Alert.alert(
					"Invite Code Generated",
					`Code: ${code}\nExpires in approx 1 hour.`,
					[
						{ text: "Copy Code", onPress: () => Clipboard.setString(code) }, // Needs Clipboard setup
						{ text: "Share", onPress: () => Share.share({ message }) }, // Needs Share setup
						{ text: "OK" },
					]
				);
			} else {
				throw new Error("Failed to get invite code from function.");
			}
		} catch (error) {
			// Error already shown by context Alert
			console.error("PartyLobby: Error generating code:", error);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleLeaveParty = async () => {
		if (!currentPartyId || isActionLoading) return;
		Alert.alert("Leave Party", "Are you sure you want to leave this party?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Leave",
				style: "destructive",
				onPress: async () => {
					setIsActionLoading(true);
					await leaveParty(); // Context handles state clearing and errors
					// Navigation back is handled by the useEffect watching currentPartyId
					// No need to manually navigate here if context clears state properly.
					setIsActionLoading(false); // Reset loading if leaveParty fails
				},
			},
		]);
	};

	// --- NEW: Handle Cancel Party ---
	const handleCancelParty = async () => {
		if (!currentPartyId || !isHost || isActionLoading) return; // Add isHost check
		Alert.alert(
			"Cancel Party",
			"Are you sure you want to cancel this party? This cannot be undone.",
			[
				{ text: "Keep Party", style: "cancel" },
				{
					text: "Cancel Party",
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						await cancelParty(); // Call context function
						// Navigation back is handled by the useEffect watching currentPartyId
						setIsActionLoading(false); // Reset loading if cancelParty fails
					},
				},
			]
		);
	};

	// --- MODIFIED: Handle Check-in Submit using Utility ---
	const handlePartyCheckInSubmit = async (values) => {
		if (!partyDetails?.restaurantId) {
			Alert.alert("Error", "Restaurant details missing.");
			return;
		}
		setIsLoadingCheckInAction(true);
		// Call utility WITHOUT activatePartyCheckIn function
		const { success, checkInId } = await handlePartyCheckInRequest(
			currentUserData,
			partyDetails.restaurantId,
			values.partySize,
			currentPartyId,
			partyStatus
			// <<< activatePartyCheckIn removed from arguments >>>
		);

		setIsLoadingCheckInAction(false);
		if (success) {
			closeCheckInModal(); // Close modal on success
			// Activation will happen later via the listener in RestaurantDetail
			console.log(
				`PartyLobby: Check-in request ${checkInId} submitted successfully.`
			);
		}
		// Errors are handled by Alerts within the utility
	};

	// --- NEW: Navigate to Menu for Adding Party Items ---
	const handleNavigateToAddItems = () => {
		if (!partyDetails?.restaurantId || !currentPartyId) {
			Alert.alert("Error", "Party or restaurant details missing.");
			return;
		}
		navigation.navigate("RestaurantDetail", {
			// Or your Menu screen name
			restaurant: {
				// Pass necessary restaurant info
				id: partyDetails.restaurantId,
				name: partyDetails.restaurantName,
				taxRate: partyDetails.restaurantTaxRate, // Ensure this is on partyDetails
			},
			partyContext: {
				// Indicate party mode and who is ordering
				partyId: currentPartyId,
				orderingForUserId: currentUserData.uid,
				orderingForPipName: currentUserData.firstName || "Me", // Or selected PIP if host adds for others
			},
		});
	};

	// --- NEW: Send Party Order to Kitchen ---
	const handleSendPartyOrderToChefsQ = async () => {
		if (
			!currentPartyId ||
			partyStatus !== "active" ||
			!partyDetails?.checkInId
		) {
			Alert.alert(
				"Cannot Send",
				"Party must be active and checked in to send the order."
			);
			return;
		}
		// This function will call a new Cloud Function: sendPartyOrderToChefsQ
		// That CF will find all items in shared_baskets/{currentPartyId} where sentToChefQ is false,
		// process them, and update their sentToChefQ status.
		setIsActionLoading(true);
		try {
			const sendOrderFunction = functions.httpsCallable(
				"sendPartyOrderToChefsQ"
			);
			const result = await sendOrderFunction({ partyId: currentPartyId });
			if (result.data.success) {
				Alert.alert("Success", "New items sent to the kitchen!");
			} else {
				throw new Error(result.data.error || "Failed to send party order.");
			}
		} catch (error) {
			console.error("Error sending party order:", error);
			Alert.alert("Error", `Could not send order: ${error.message}`);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleSendAllNewPartyItemsToChefsQ = async () => {
		if (
			!isHost ||
			!currentPartyId ||
			partyStatus !== "active" ||
			!partyDetails?.checkInId
		) {
			Alert.alert(
				"Action Denied",
				"Only the host can perform this action when the party is active and checked in."
			);
			return;
		}
		setIsActionLoading(true);
		try {
			// This would typically call a cloud function
			// const sendAllItemsFunction = httpsCallable(funcsInstance, "sendAllPartyItemsToChefsQ");
			// const result = await sendAllItemsFunction({ partyId: currentPartyId });
			// if (result.data.success) {
			Alert.alert(
				"Success (Placeholder)",
				"All new items would be sent to the kitchen!"
			);
			// } else {
			// 	throw new Error(result.data.error || "Failed to send all items.");
			// }
		} catch (error) {
			console.error("Error in handleSendAllNewPartyItemsToChefsQ:", error);
			Alert.alert("Error", `Could not send all items: ${error.message}`);
		} finally {
			setIsActionLoading(false);
		}
	};

	// --- Validation Schema (Copied from RestaurantDetail) ---
	const validationSchema = Yup.object().shape({
		partySize: Yup.number()
			.min(1, "Party size must be atleast 1")
			.required("Party size is required"),
	});

	// --- Render Guest Item ---
	const renderGuest = ({ item }) => (
		<View style={styles.guestItem}>
			<Ionicons name="person-circle-outline" size={24} color="gray" />
			<Text style={styles.guestName}>
				{item.name}
				{item.userId === currentUserData?.uid ? " (You)" : ""}
			</Text>
		</View>
	);

	// --- Main Render Logic ---
	// Use a combined loading state for the screen's main content
	const isScreenLoading =
		isLoadingParty ||
		(initialPartyIdFromRoute &&
			(!partyDetails || partyDetails.id !== initialPartyIdFromRoute));
	if (isScreenLoading) {
		return (
			<SafeAreaView style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>Loading Party Details...</Text>
			</SafeAreaView>
		);
	}

	// Handle errors shown by context
	if (partyError && !partyDetails) {
		// Show error if context has error and no details
		return (
			<SafeAreaView style={styles.centered}>
				<MaterialCommunityIcons
					name="alert-circle-outline"
					size={40}
					color={colors.danger}
				/>
				<Text style={styles.errorText}>{partyError}</Text>
				<Button
					title="Go Back"
					onPress={() =>
						navigation.canGoBack()
							? navigation.goBack()
							: navigation.navigate("CustomerHome")
					}
				/>
			</SafeAreaView>
		);
	}
	if (!partyDetails && initialPartyIdFromRoute) {
		// Party was expected but not found after loading
		return (
			<SafeAreaView style={styles.centered}>
				<Text style={styles.errorText}>Party not found or has ended.</Text>
				<Button title="Go Back" onPress={() => navigation.goBack()} />
			</SafeAreaView>
		);
	}

	// If no partyDetails at all (e.g. navigated here without a partyId somehow)
	if (!partyDetails) {
		return (
			<SafeAreaView style={styles.centered}>
				<Text style={styles.errorText}>No active party session.</Text>
				<Button
					title="Go Home"
					onPress={() => navigation.navigate("CustomerHome")}
				/>
			</SafeAreaView>
		);
	}

	const guests = partyDetails.guestPips || []; // Use guestPips
	const currentPartyStatusDisplay = partyDetails.status || "unknown";

	return (
		<SafeAreaView style={styles.safeArea}>
			<FlatList
				style={styles.container}
				ListHeaderComponent={
					<PartyLobbyHeaderContent
						partyDetails={partyDetails}
						partyStatus={currentPartyStatusDisplay} // Use the display status
						partyError={partyError}
						isHost={isHost}
					/>
				}
				data={partyDetails?.guestPips || []}
				renderItem={renderGuest}
				keyExtractor={(item) => item.userId}
				ListEmptyComponent={
					<Text style={styles.emptyText}>No guests have joined yet.</Text>
				}
				ListFooterComponent={
					<PartyLobbyFooter
						isHost={isHost} // Pass the correctly defined isHost
						partyStatus={currentPartyStatusDisplay}
						partyDetails={partyDetails}
						currentUserData={currentUserData}
						isLoadingPartyAction={isActionLoading}
						isLoadingPips={isLoadingPips}
						isLoadingHostCheckIn={isLoadingHostCheckIn} // Pass host's individual check-in loading
						hostCheckInStatus={hostCheckInStatus} // Pass host's individual check-in status
						sharedBasketItems={sharedBasketItems}
						isLoadingBasket={isLoadingBasket}
						groupedBasketItems={groupedBasketItems}
						handleNavigateToAddItems={handleNavigateToAddItems}
						handleInvitePip={handleInvitePip}
						handleGenerateCode={handleGenerateCode}
						setIsCheckInModalVisible={setIsCheckInModalVisible}
						handleSendPartyOrderToChefsQ={handleSendPartyOrderToChefsQ}
						handleSendAllNewPartyItemsToChefsQ={
							handleSendAllNewPartyItemsToChefsQ
						}
						handleLeaveParty={handleLeaveParty}
						handleCancelParty={handleCancelParty}
						navigation={navigation}
					/>
				}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
			/>

			<PipInvitationModal
				isVisible={isPipModalVisible}
				onClose={() => setIsPipModalVisible(false)}
				pips={pips}
				isLoadingPips={isLoadingPips}
				partyDetails={partyDetails}
				isActionLoading={isActionLoading}
				onSelectUserPip={sendInviteToUserPIP}
				onSelectLocalPip={addLocalPIP}
			/>

			{/* --- Check-In Modal --- */}
			<PartyCheckInModal
				isVisible={isCheckInModalVisible}
				onClose={closeCheckInModal}
				initialPartySize={(partyDetails?.guestPips?.length || 0) + 1}
				validationSchema={validationSchema}
				onSubmit={handlePartyCheckInSubmit}
				isLoadingAction={isLoadingCheckInAction}
			/>
			{/* --- End Check-In Modal --- */}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.background || "#f8f9fa" },
	container: { flex: 1, padding: 15 },
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},

	statusValue: { fontWeight: "bold", color: colors.textDark },
	status_pending: { color: colors.warning || "#ffc107" },
	status_active: { color: colors.success || "green" },
	status_completed: { color: colors.textLight || "gray" },
	status_cancelled: { color: colors.danger || "red" },
	hostSection: { marginBottom: 20 },
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
		color: colors.primary,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
		paddingBottom: 5,
	},
	guestItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
		backgroundColor: "#fff",
		borderRadius: 5,
		marginBottom: 5,
		paddingHorizontal: 10,
	},
	guestName: { marginLeft: 10, fontSize: 16, color: colors.textDark },
	emptyText: {
		textAlign: "center",
		color: colors.textLight,
		marginTop: 20,
		fontStyle: "italic",
	},
	errorText: {
		color: colors.danger || "red",
		fontSize: 16,
		textAlign: "center",
		marginTop: 10,
	},
	inlineErrorText: {
		color: colors.danger || "red",
		textAlign: "center",
		marginVertical: 10,
		paddingHorizontal: 10,
	},
	buttonContainer: { marginTop: 20, paddingHorizontal: 10, marginBottom: 20 },
	actionButton: {
		paddingVertical: 12,
		paddingHorizontal: 20,
		borderRadius: 8,
		alignItems: "center",
		marginBottom: 10,
	},
	inviteButton: { backgroundColor: colors.primary },
	leaveButton: { backgroundColor: colors.danger },
	checkInButton: { backgroundColor: colors.success || "green" }, // Style for check-in button
	actionButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
	disabledButton: {
		backgroundColor: colors.mediumGray || "#cccccc",
		opacity: 0.7,
	},
	infoText: {
		textAlign: "center",
		marginTop: 20,
		fontSize: 15,
		color: colors.text,
		fontStyle: "italic",
		paddingBottom: 20,
	},

	actionsRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "flex-start",
		paddingVertical: 10,
		marginTop: 10,
		marginBottom: 10,
		// borderTopWidth: 1,
		// borderTopColor: colors.lightGray,
	},
	actionIcon: {
		alignItems: "center",
		padding: 8,
		minWidth: 80, // Give icons some space
	},
	actionIconText: {
		fontSize: 11,
		color: colors.primary,
		marginTop: 4,
		textAlign: "center",
	},
	actionIconDisabled: {
		alignItems: "center",
		padding: 8,
		minWidth: 80,
		opacity: 0.5,
	},
	actionIconTextDisabled: {
		fontSize: 11,
		color: colors.textLight,
		marginTop: 4,
		textAlign: "center",
	},
	section: {
		marginBottom: 20,
		padding: 15,
		backgroundColor: colors.white || "#ffffff",
		borderRadius: 8,
		marginHorizontal: 5, // Slight horizontal margin for sections
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 12,
		color: colors.primary,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
		paddingBottom: 6,
	},

	emptyText: {
		textAlign: "center",
		color: colors.textLight,
		marginTop: 15,
		fontStyle: "italic",
		paddingBottom: 10,
	},
	infoText: {
		// For messages like "Party ended"
		textAlign: "center",
		marginTop: 20,
		fontSize: 15,
		color: colors.text,
		fontStyle: "italic",
		paddingBottom: 20,
	},

	input: {
		borderWidth: 1,
		borderColor: colors.mediumGray || "#ccc",
		padding: 12,
		borderRadius: 8,
		marginBottom: 10,
		marginTop: 5,
		textAlign: "center",
		fontSize: 18,
		width: "60%",
	},
	modalButtonRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		width: "100%",
		marginTop: 20,
	},
	modalButton: {
		paddingVertical: 12,
		paddingHorizontal: 10,
		borderRadius: 8,
		alignItems: "center",
		flex: 1,
		marginHorizontal: 5,
		backgroundColor: colors.primary,
	},
	cancelModalButton: { backgroundColor: colors.mediumGray || "#ccc" },
	modalButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
});

export default PartyLobbyScreen;

