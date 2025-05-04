import React, { useState, useEffect, useContext, useCallback } from "react";
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
	TouchableOpacity, // For invite/leave buttons if not using Button component
	Share,
	Modal,
	TextInput, // To share invite code
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
import { Formik } from "formik";
import * as Yup from "yup";
import {
	handlePartyCheckInRequest,
	useCheckInStatus,
} from "../../utils/customerUtils";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../config/firebase";

const PartyLobbyScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	// Get partyId from navigation. If it's missing, context listener won't start.
	const [isCheckInModalVisible, setIsCheckInModalVisible] = useState(false);
	const initialPartyId = route.params?.partyId;

	const { currentUserData } = useContext(AuthContext);
	const {
		currentPartyId, // Get the ID managed by context
		partyDetails,
		partyStatus,
		isLoadingParty,
		partyError,
		inviteToParty, // Use context functions
		addLocalPIPToParty,
		leaveParty,
		clearPartyState, // To clear state if user manually navigates away
		cancelParty,
	} = useParty();

	const [isActionLoading, setIsActionLoading] = useState(false); // Specific loading for invite/leave actions
	const [refreshing, setRefreshing] = useState(false);
	const [isLoadingCheckInAction, setIsLoadingCheckInAction] = useState(false); // <<< NEW: Loading for check-in action
	const [isPipModalVisible, setIsPipModalVisible] = useState(false);
	const [pips, setPips] = useState([]);
	const [isLoadingPips, setIsLoadingPips] = useState(false);

	// Only call if we have the necessary IDs and the current user is the host
	const isHost = currentUserData?.uid === partyDetails?.hostUserId;

	const {
		checkInStatus: hostCheckInStatus, // Rename to avoid conflict
		isLoading: isLoadingHostCheckIn, // Rename to avoid conflict
		checkInObj: hostCheckInObj, // Get the object if needed
	} = useCheckInStatus(
		isHost ? partyDetails?.restaurantId : null, // Only fetch if host
		isHost ? currentUserData?.uid : null // Only fetch if host
	);

	if ((isLoadingParty || (isHost && isLoadingHostCheckIn)) && !partyDetails) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	const guests = partyDetails?.guestNames || [];
	const currentPartyStatus = partyDetails?.status || "unknown"; // Use status from details

	const openCheckInModal = () => setIsCheckInModalVisible(true);
	const closeCheckInModal = () => setIsCheckInModalVisible(false);

	// Effect to handle navigation if partyId mismatch or context clears
	useEffect(() => {
		// If the context clears the partyId (e.g., user left/kicked), navigate back
		if (!isLoadingParty && !currentPartyId && initialPartyId) {
			console.log("PartyLobby: Context cleared partyId, navigating back.");
			if (navigation.canGoBack()) {
				navigation.goBack();
			} else {
				// If cannot go back (e.g., deep link), reset to home
				navigation.dispatch(
					CommonActions.reset({
						index: 0,
						routes: [{ name: "CustomerHome" }], // Adjust route name if needed
					})
				);
			}
		}
		// If the route param doesn't match context (shouldn't happen often, but safety check)
		else if (
			currentPartyId &&
			initialPartyId &&
			currentPartyId !== initialPartyId
		) {
			console.warn("PartyLobby: Route partyId and Context partyId mismatch!");
			// Decide how to handle: trust context or navigate back? Let's trust context for now.
		}
	}, [currentPartyId, isLoadingParty, initialPartyId, navigation]);

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

	// --- Action Handlers ---

	const fetchPips = async () => {
		if (!currentUserData?.uid) return;
		console.log("PartyLobby: Fetching PIPs...");
		setIsLoadingPips(true);
		try {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			const q = query(pipsRef, orderBy("name")); // Order alphabetically
			const querySnapshot = await getDocs(q);
			const pipsArray = querySnapshot.docs.map((doc) => ({
				id: doc.id, // Use the Firestore document ID as the PIP's unique ID
				...doc.data(),
			}));
			setPips(pipsArray);
			console.log("PartyLobby: PIPs fetched:", pipsArray);
		} catch (error) {
			console.error("PartyLobby: Error fetching PIPs:", error);
			Alert.alert("Error", "Could not load your PIPs list.");
		} finally {
			setIsLoadingPips(false);
			console.log("PartyLobby: fetchPips - Finished."); // <-- Log finish
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
			console.log(
				`PartyLobby: invitePipById - Calling inviteToParty function with partyId: ${currentPartyId}, inviteeUserId: ${pipUserId}`
			);
			const result = await inviteToParty({
				partyId: currentPartyId,
				inviteeUserId: pipUserId,
			});

			if (result?.success) {
				console.log(
					"PartyLobby: sendInviteToUserPip - inviteToParty call successful."
				);
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
	const handleCheckinSubmit = async (values) => {
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

	// --- Validation Schema (Copied from RestaurantDetail) ---
	const validationSchema = Yup.object().shape({
		partySize: Yup.number()
			.min(1, "Party size must be atleast 1")
			.required("Party size is required"),
	});

	const onRefresh = useCallback(() => {
		// Manual refresh is less critical with the real-time listener,
		// but can be kept as a fallback or removed.
		// If kept, it doesn't need to do anything as the listener handles updates.
		setRefreshing(true);
		// Simulate refresh end after a short delay
		setTimeout(() => setRefreshing(false), 500);
	}, []);

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

	// --- Render PIP Item for Modal ---
	const renderPipSelectionItem = ({ item: pip }) => {
		// Check if this PIP is already a guest in the party
		// Ensure partyDetails and guestUserIds exist before checking

		const relevantIdTocheck = pip.isUser ? pip.userId : pip.id;

		// Check if this PIP (user or placeholder) is already a guest
		// Ensure guestUserIds exists and relevantIdToCheck is valid
		const isAlreadyGuest =
			partyDetails?.guestUserIds?.includes(pip.id) ?? false; // Assuming pip.id is the userId

		const isDisabled =
			isAlreadyGuest ||
			(pip.isUser && !pip.userId) || // Cannot invite a 'user' PIP without a userId
			isActionLoading;

		return (
			<TouchableOpacity
				style={[
					styles.pipSelectionItem,
					isDisabled && styles.disabledPipItem, // Apply disabled style
				]}
				onPress={() => {
					// --- Log tap details ---
					console.log(
						"PartyLobby: Tapped PIP:",
						JSON.stringify(pip),
						`isAlreadyGuest: ${isAlreadyGuest}, isDisabled: ${isDisabled}`
					);
''
					// --- Decide action based on PIP type ---
					if (!isDisabled) {
						if (pip.isUser && pip.userId) {
							// It's an external user, send an invite notification
							sendInviteToUserPIP(pip.userId, pip.name);
						} else if (!pip.isUser) {
							// It's a local placeholder, add directly to party
							addLocalPip(pip.id, pip.name); // Pass placeholder ID (pip.id)
						} else {
							console.warn("PartyLobby: Invalid PIP state on tap:", pip);
						}
					} else {
						console.log(
							"PartyLobby: Tap ignored (PIP disabled/already guest)."
						);
					}
				}}
				disabled={isDisabled} // Disable button
			>
				<Ionicons
					// Use different icons based on PIP type
					name={pip.isUser ? "person-circle" : "person-outline"}
					size={24}
					// Dim icon color if disabled
					color={isDisabled ? colors.textLight : colors.text}
					style={styles.pipIcon}
				/>
				<Text
					style={[
						styles.pipSelectionName,
						// Dim text color if disabled
						isDisabled && styles.disabledPipText,
					]}
				>
					{pip.name}
				</Text>
				{/* Show different indicators based on status */}
				{isAlreadyGuest && (
					<Text style={styles.alreadyInvitedText}>(Already in party)</Text>
				)}
				{!pip.isUser && !isAlreadyGuest && (
					<Text style={styles.alreadyInvitedText}>(Local)</Text> // Indicate local PIP
				)}
				{pip.isUser && !pip.userId && !isAlreadyGuest && (
					<Text style={styles.alreadyInvitedText}>(Invalid User Data)</Text> // Indicate bad data
				)}
			</TouchableOpacity>
		);
	};

	// --- Main Render Logic ---
	if (isLoadingParty && !partyDetails) {
		// Show loading only on initial load
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
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

	// Handle case where context has loaded but details are null (e.g., party deleted)
	if (!isLoadingParty && !partyDetails && initialPartyId) {
		return (
			<SafeAreaView style={styles.centered}>
				<Text style={styles.errorText}>Party not found or has ended.</Text>
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

	return (
		<SafeAreaView style={styles.safeArea}>
			<FlatList
				style={styles.container}
				ListHeaderComponent={
					<>
						<Text style={styles.title}>Party Lobby</Text>
						<Text style={styles.restaurantName}>
							{partyDetails?.restaurantName || "Restaurant"}
						</Text>
						<Text style={styles.statusText}>
							Status:{" "}
							<Text
								style={[
									styles.statusValue,
									styles[`status_${currentPartyStatus}`],
								]}
							>
								{currentPartyStatus.toUpperCase()}
							</Text>
						</Text>
						{partyError && (
							<Text style={styles.inlineErrorText}>{partyError}</Text>
						)}
						<View style={styles.hostSection}>
							<Text style={styles.sectionTitle}>Host</Text>
							<View style={styles.guestItem}>
								<Ionicons
									name="person-circle"
									size={24}
									color={colors.primary}
								/>
								<Text style={styles.guestName}>
									{partyDetails?.hostName || "Host"} {isHost ? "(You)" : ""}
								</Text>
							</View>
						</View>
						<Text style={styles.sectionTitle}>Guests ({guests.length})</Text>
					</>
				}
				data={guests}
				renderItem={renderGuest}
				keyExtractor={(item) => item.userId}
				ListEmptyComponent={
					<Text style={styles.emptyText}>No guests have joined yet.</Text>
				}
				ListFooterComponent={
					<>
						{/* --- Host Buttons --- */}
						{isHost && ( // Keep outer check for host
							<View style={styles.buttonContainer}>
								{/* Invite/Code Buttons: Show if PENDING or ACTIVE */}
								{(currentPartyStatus === "pending" ||
									currentPartyStatus === "active") && (
									<>
										{/* Invite PIP Button */}
										<TouchableOpacity
											style={[
												styles.actionButton,
												styles.inviteButton,
												(isLoadingParty || isActionLoading || isLoadingPips) &&
													styles.disabledButton,
											]}
											onPress={handleInvitePip}
											disabled={
												isLoadingParty || isActionLoading || isLoadingPips
											}
										>
											{isLoadingParty || isActionLoading || isLoadingPips ? (
												<ActivityIndicator color="#fff" />
											) : (
												<Text style={styles.actionButtonText}>Invite PIP</Text>
											)}
										</TouchableOpacity>
										{/* Generate Code Button */}
										<TouchableOpacity
											style={[
												styles.actionButton,
												styles.inviteButton,
												(isLoadingParty || isActionLoading) &&
													styles.disabledButton,
											]}
											onPress={handleGenerateCode}
											disabled={isLoadingParty || isActionLoading}
										>
											{isLoadingParty || isActionLoading ? (
												<ActivityIndicator color="#fff" />
											) : (
												<Text style={styles.actionButtonText}>
													Get Invite Code
												</Text>
											)}
										</TouchableOpacity>
									</>
								)}

								{/* Check In / Waiting / Cancel Buttons: Show ONLY if PENDING */}
								{currentPartyStatus === "pending" && (
									<>
										{/* --- MODIFIED: Check In / Waiting Button --- */}
										{hostCheckInStatus === "REQUESTED" ? (
											// Show "Waiting" state
											<View style={styles.waitingContainer}>
												<ActivityIndicator
													size="small"
													color={colors.primary}
													style={styles.waitingIndicator}
												/>
												<Text style={styles.waitingText}>
													Waiting for Table...
												</Text>
												{/* Optionally add cancel button here if needed */}
											</View>
										) : hostCheckInStatus === "ACCEPTED" ? (
											// This case shouldn't really happen if party activation works,
											// but good to handle. Party status should become 'active'.
											<View style={styles.waitingContainer}>
												<Ionicons
													name="checkmark-circle"
													size={24}
													color={colors.success}
												/>
												<Text style={styles.waitingText}>
													Check-In Accepted!
												</Text>
											</View>
										) : (
											// Show "Check In Party" button
											<TouchableOpacity
												style={[
													styles.actionButton,
													styles.checkInButton,
													(isLoadingParty ||
														isActionLoading ||
														isLoadingCheckInAction ||
														isLoadingHostCheckIn) && // Also disable if check-in status is loading
														styles.disabledButton,
												]}
												onPress={openCheckInModal}
												disabled={
													isLoadingParty ||
													isActionLoading ||
													isLoadingCheckInAction ||
													isLoadingHostCheckIn // Disable if loading status
												}
											>
												{isLoadingCheckInAction ? (
													<ActivityIndicator color="#fff" />
												) : (
													<Text style={styles.actionButtonText}>
														Check In Party
													</Text>
												)}
											</TouchableOpacity>
										)}
										{/* --- End MODIFIED Button --- */}

										{/* --- Cancel Party Button --- */}
										<TouchableOpacity
											style={[
												styles.actionButton,
												styles.cancelPartyButton,
												(isLoadingParty || isActionLoading) &&
													styles.disabledButton,
											]}
											onPress={handleCancelParty} // <<< Call new handler
											disabled={isLoadingParty || isActionLoading}
										>
											{isLoadingParty || isActionLoading ? (
												<ActivityIndicator color="#fff" />
											) : (
												<Text style={styles.actionButtonText}>
													Cancel Party
												</Text>
											)}
										</TouchableOpacity>
										{/* --- End Cancel Party Button --- */}
									</>
								)}
							</View>
						)}

						{/* --- Leave Button (Guests Only) --- */}
						{/* Allow leaving if PENDING OR ACTIVE */}
						{!isHost &&
							(currentPartyStatus === "pending" ||
								currentPartyStatus === "active") && (
								<View style={styles.buttonContainer}>
									<TouchableOpacity
										style={[
											styles.actionButton,
											styles.leaveButton,
											(isLoadingParty || isActionLoading) &&
												styles.disabledButton,
										]}
										onPress={handleLeaveParty}
										disabled={isLoadingParty || isActionLoading}
									>
										{isLoadingParty || isActionLoading ? (
											<ActivityIndicator color="#fff" />
										) : (
											<Text style={styles.actionButtonText}>Leave Party</Text>
										)}
									</TouchableOpacity>
								</View>
							)}

						{/* --- Status Messages --- */}
						{currentPartyStatus === "active" && (
							<Text style={styles.infoText}>
								Party is active! Add items to your basket.
							</Text>
						)}
						{currentPartyStatus === "completed" && (
							<Text style={styles.infoText}>This party has ended.</Text>
						)}
						{currentPartyStatus === "cancelled" && (
							<Text style={styles.infoText}>This party was cancelled.</Text>
						)}
					</>
				}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
			/>

			{/* --- PIP Selection Modal --- */}
			<Modal
				visible={isPipModalVisible}
				animationType="slide"
				transparent={true}
				onRequestClose={() => setIsPipModalVisible(false)}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>Select PIP to Invite</Text>
						{isLoadingPips ? (
							<ActivityIndicator size="small" color={colors.primary} />
						) : pips.length === 0 ? (
							<Text style={styles.noPipsText}>
								You haven't added any PIPs yet.
							</Text>
						) : (
							<FlatList
								data={pips}
								renderItem={renderPipSelectionItem}
								keyExtractor={(item) => item.id}
								style={styles.pipModalList}
							/>
						)}
						<TouchableOpacity
							style={styles.closeButton}
							onPress={() => setIsPipModalVisible(false)}
						>
							<Text style={styles.closeButtonText}>Close</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			{/* --- Check-In Modal --- */}
			{isCheckInModalVisible && (
				<Modal
					transparent={true}
					onRequestClose={closeCheckInModal}
					visible={isCheckInModalVisible}
					animationType="fade"
				>
					<View style={styles.modalOverlay}>
						<View style={styles.modalContent}>
							<Formik
								// Pre-fill party size
								initialValues={{
									partySize: (
										partyDetails?.guestUserIds?.length + 1 || 1
									).toString(),
								}}
								validationSchema={validationSchema}
								onSubmit={handleCheckinSubmit} // Use the new handler
							>
								{({
									handleChange,
									handleBlur,
									handleSubmit,
									values,
									errors,
									touched,
								}) => (
									<>
										<Text style={styles.modalTitle}>Confirm Party Size</Text>
										<TextInput
											style={styles.input} // Add input style
											onChangeText={handleChange("partySize")}
											onBlur={handleBlur("partySize")}
											value={values.partySize}
											keyboardType="numeric"
											placeholder="Party Size"
										/>
										{errors.partySize && touched.partySize && (
											<Text style={styles.errorText}>{errors.partySize}</Text> // Use error style
										)}
										<View style={styles.modalButtonRow}>
											<TouchableOpacity
												onPress={closeCheckInModal}
												style={[styles.modalButton, styles.cancelModalButton]} // Add specific cancel style
											>
												<Text style={styles.modalButtonText}>Cancel</Text>
											</TouchableOpacity>
											<TouchableOpacity
												onPress={handleSubmit}
												style={[
													styles.modalButton,
													isLoadingCheckInAction && styles.disabledButton,
												]} // Use confirm style
												disabled={isLoadingCheckInAction}
											>
												{isLoadingCheckInAction ? (
													<ActivityIndicator size="small" color="white" />
												) : (
													<Text style={styles.modalButtonText}>
														Confirm Check In
													</Text>
												)}
											</TouchableOpacity>
										</View>
									</>
								)}
							</Formik>
						</View>
					</View>
				</Modal>
			)}
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
	title: {
		fontSize: 24,
		fontWeight: "bold",
		textAlign: "center",
		marginBottom: 10,
		color: colors.textDark,
	},
	restaurantName: {
		fontSize: 18,
		fontWeight: "500",
		textAlign: "center",
		marginBottom: 15,
		color: colors.text,
	},
	statusText: {
		fontSize: 16,
		textAlign: "center",
		marginBottom: 20,
		color: colors.textLight,
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
	cancelPartyButton: {
		backgroundColor: colors.warning, // Use danger color for cancelling
		marginTop: 10, // Add some space above it
	},

	waitingContainer: {
		// Style for the "Waiting for Table..." indicator
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		padding: 15,
		backgroundColor: colors.warningBackground || "#fff8e1", // Light yellow
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.warning || "#ffc107",
		marginTop: 10, // Match button margin
		marginBottom: 10,
	},
	waitingIndicator: {
		marginRight: 10,
	},
	waitingText: {
		fontSize: 16,
		fontWeight: "500",
		color: colors.warningText || "#856404", // Darker yellow
	},

	// --- Modal Styles ---
	modalOverlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.6)",
	},
	modalContent: {
		backgroundColor: "white",
		borderRadius: 10,
		padding: 20,
		width: "85%",
		maxHeight: "70%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
		alignItems: "center",
	}, // Added alignItems
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 15,
		textAlign: "center",
		color: colors.textDark,
	},
	pipModalList: { marginBottom: 15, width: "100%" }, // Ensure list takes width
	pipSelectionItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
		width: "100%",
	},
	pipSelectionName: {
		marginLeft: 10,
		fontSize: 16,
		flex: 1,
		color: colors.textDark,
	},
	disabledPipItem: { opacity: 0.5 },
	disabledPipText: { color: colors.textLight },
	alreadyInvitedText: {
		fontSize: 12,
		fontStyle: "italic",
		color: colors.textLight,
	},
	noPipsText: {
		textAlign: "center",
		color: colors.textLight,
		marginVertical: 20,
		fontStyle: "italic",
	},
	closeButton: {
		backgroundColor: colors.mediumGray || "#ccc",
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 10,
	},
	closeButtonText: { color: colors.textDark, fontSize: 16, fontWeight: "bold" },
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
