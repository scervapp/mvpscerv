import React, { useContext, useState, useEffect, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	ScrollView,
	TouchableOpacity,
	TextInput,
	Alert, // For placeholder actions
	SafeAreaView,
	FlatList,
	Modal,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import {
	Ionicons,
	MaterialCommunityIcons,
	FontAwesome5,
} from "@expo/vector-icons"; // Popular icon sets

import colors from "../../utils/styles/appStyles";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import OrderItemCard from "../../components/customer/OrderItemCard";
import PartyCheckInModal from "../../components/customer/Party/PartyCheckInModal";
import * as Yup from "yup";
import { requestPartyTableCheckIn } from "../../utils/customerUtils";
import AddMembersModal from "../../components/customer/Party/AddMembersModal";
import { Button } from "react-native-paper";

/**
 * A reusable button component featuring an icon and text underneath.
 */

const IconTextButton = ({
	iconName,
	iconSet = "Ionicons", // Default to Ionicons
	text,
	onPress,
	color, // Optional: color for icon and text
	iconSize = 32,
	fontSize = 13,
	style, // Optional: additional style for the touchable container
	disabled = false,
}) => {
	let IconComponent;
	switch (iconSet) {
		case "MaterialCommunityIcons":
			IconComponent = MaterialCommunityIcons;
			break;
		case "FontAwesome5":
			IconComponent = FontAwesome5;
			break;
		case "Ionicons":
		default:
			IconComponent = Ionicons;
			break;
	}

	const activeColor = disabled ? colors.textLight : color || colors.primary;

	return (
		<TouchableOpacity
			onPress={onPress}
			style={[styles.iconTextButtonContainer, style]}
			disabled={disabled}
		>
			<IconComponent name={iconName} size={iconSize} color={activeColor} />
			<Text
				style={[
					styles.iconTextButtonText,
					{ color: activeColor, fontSize: fontSize },
				]}
			>
				{text}
			</Text>
		</TouchableOpacity>
	);
};

const PartySessionScreen = () => {
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const {
		currentPartyId,
		partyDetails,
		isLoadingParty, // True when context is loading party details for currentPartyId
		partyError,
		cancelPartyCheckIn,
		sharedBasketItems, // Needed for the active party view
		// --- Context Actions ---
		// Assuming these functions exist in PartyContext and handle backend + context state updates:
		joinParty, // ({ inviteCode }) => Promise<boolean> (returns true on success)
		leaveParty, // () => Promise<void>
		cancelParty, // () => Promise<void>
		activatePartyCheckIn, // (checkInDocId) => Promise<void>
		addLocalPIPToParty,
		inviteToParty,
		// sendMyItemsToKitchen, // (itemsToSend) => Promise<void>
		handlePartyItemQuantityChange,
	} = useParty();

	const [inviteCode, setInviteCode] = useState("");
	const [uiLoading, setUiLoading] = useState(false); // For local actions like join attempt
	const [uiError, setUiError] = useState(null);
	const [isMembersModalVisible, setIsMembersModalVisible] = useState(false);
	const [isActionsModalVisible, setIsActionsModalVisible] = useState(false);
	const [isAddMembersModalVisible, setIsAddMembersModalVisible] =
		useState(false);
	const [userPips, setUserPips] = useState([]);
	const [hostPipsList, setHostPipsList] = useState([]);
	const [updatingItemId, setUpdatingItemId] = useState(null);
	const [isPartyCheckInModalVisible, setIsPartyCheckInModalVisible] =
		useState(false);
	const [isProcessingPartyCheckIn, setIsProcessingPartyCheckIn] =
		useState(false);
	const [isLoadingMembers, setIsLoadingMembers] = useState(false);

	const partyCheckInValidationSchema = Yup.object().shape({
		partySize: Yup.number()
			.min(1, "Party must have at least 1 person.")
			.max(50, "Party size cannot exceed 50.") // Example max
			.required("Party size is required.")
			.typeError("Must be a valid number."),
	});

	useEffect(() => {
		if (currentUserData?.uid && currentUserData.role !== "guest") {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			const unsubscribe = onSnapshot(pipsRef, (snapshot) => {
				setUserPips(
					snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
				);
			});
			return () => unsubscribe();
		} else {
			setUserPips([]);
		}
	}, [currentUserData?.uid]);

	useEffect(() => {
		// Fetch only if the "Add Members" modal is about to be opened by the host
		if (isHost && isAddMembersModalVisible) {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			const unsubscribe = onSnapshot(pipsRef, (snapshot) => {
				const pipsArray = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setHostPipsList(pipsArray);
			});
			return () => unsubscribe();
		}
	}, [isHost, isAddMembersModalVisible, currentUserData?.uid]);

	const calculatedInitialPartySize = useMemo(() => {
		if (!partyDetails) return 1; // Default if no details
		// Assuming guestPips includes all guests, and host is one person
		return (
			(partyDetails.guestPips?.length || 0) +
				(partyDetails.hostUserId ? 1 : 0) || 1
		);
	}, [partyDetails]);

	// Derived state
	const isHost =
		partyDetails && currentUserData?.uid === partyDetails.hostUserId;

	// --- Action Handlers ---
	const handleStartNewPartyGuidance = () => {
		Alert.alert(
			"Start a New Party",
			"To begin a new party, please find a restaurant from the Home screen. You can then start a party directly from the restaurant's detail page.",
			[
				{
					text: "Go to Home",
					// Navigate to your main restaurant discovery tab/screen.
					// Replace 'CustomerDashboard' with the actual route name of your home/discovery tab/stack.
					onPress: () => navigation.navigate("CustomerDashboard"),
				},
				{
					text: "OK",
					style: "cancel",
				},
			]
		);
	};

	const handleJoinPartyAttempt = async () => {
		if (!inviteCode.trim()) {
			setUiError("Please enter an invite code.");
			return;
		}
		setUiLoading(true);
		setUiError(null);
		try {
			const joined = await joinParty({ inviteCode }); // Assuming joinParty is from context
			if (!joined) {
				// If joinParty returns false or PartyContext sets an error, reflect it
				setUiError(
					partyError ||
						"Failed to join party. The code might be invalid, expired, or the party is full."
				);
			}
			// If joinParty is successful, PartyContext will update currentPartyId,
			// and this component will re-render into the "Active Party State".
			// No explicit navigation needed from here if context drives the state.
		} catch (error) {
			console.error("PartySessionScreen: Error joining party", error);
			setUiError(
				error.message || "An unexpected error occurred while trying to join."
			);
		} finally {
			setUiLoading(false);
			setInviteCode(""); // Clear input after attempt
		}
	};

	const handleLeaveParty = async () => {
		Alert.alert("Leave Party", "Are you sure you want to leave this party?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Leave",
				style: "destructive",
				onPress: async () => {
					setUiLoading(true);
					try {
						await leaveParty(); // Context handles navigation or state clearing
					} catch (e) {
						Alert.alert("Error", "Could not leave party.");
					} finally {
						setUiLoading(false);
					}
				},
			},
		]);
	};

	const handleCancelPartyAction = async () => {
		// Host only
		Alert.alert(
			"Cancel Party",
			"Are you sure you want to cancel this entire party? This cannot be undone.",
			[
				{ text: "Keep Party", style: "cancel" },
				{
					text: "Cancel Party",
					style: "destructive",
					onPress: async () => {
						setUiLoading(true);
						try {
							await cancelParty(); // Context handles navigation or state clearing
						} catch (e) {
							Alert.alert("Error", "Could not cancel party.");
						} finally {
							setUiLoading(false);
						}
					},
				},
			]
		);
	};

	const handleOpenPartyCheckInModal = () => {
		setIsActionsModalVisible(false); // Close actions modal if open
		if (isHost && partyDetails?.status === "pending") {
			setIsPartyCheckInModalVisible(true); // Open the party check-in modal
		} else {
			Alert.alert(
				"Info",
				"Only the host can activate a pending party by checking in."
			);
		}
	};

	const handleCancelCheckInRequest = () => {
		setIsActionsModalVisible(false); // Close the actions modal first
		Alert.alert(
			"Cancel Check-In Request",
			"Are you sure you want to cancel your request for a table? This will revert the party to a 'pending' state.",
			[
				{ text: "Don't Cancel", style: "cancel" },
				{
					text: "Yes, Cancel",
					style: "destructive",
					onPress: async () => {
						// Call the context function. It already handles loading states and alerts.
						await cancelPartyCheckIn();
					},
				},
			]
		);
	};

	const handleSubmitPartyCheckIn = async (values) => {
		// values will contain { partySize } from the PartyCheckInModal's Formik
		if (!partyDetails || !currentUserData) {
			Alert.alert("Error", "Missing party or user information.");
			setIsPartyCheckInModalVisible(false); // Close modal on error
			return;
		}
		setIsProcessingPartyCheckIn(true);
		try {
			const checkInResult = await requestPartyTableCheckIn(
				partyDetails.restaurantId,
				currentUserData.uid,
				currentUserData.firstName || "Party Host",
				values.partySize,
				currentPartyId
			);

			if (checkInResult.success && checkInResult.checkInId) {
				const activationSuccess = await activatePartyCheckIn(
					checkInResult.checkInId
				);
				if (activationSuccess) {
					Alert.alert(
						"Party Activated!",
						"Your party is now active and checked in."
					);
				}
				// Error alerts for activation failure are likely handled within activatePartyCheckIn context function
			} else {
				Alert.alert(
					"Check-In Failed",
					checkInResult.error || "Could not request a table for the party."
				);
			}
		} catch (error) {
			console.error(
				"PartySessionScreen: Error during party check-in process:",
				error
			);
			Alert.alert(
				"Error",
				"An unexpected error occurred during party check-in."
			);
		} finally {
			setIsProcessingPartyCheckIn(false);
			setIsPartyCheckInModalVisible(false); // Close modal regardless of success/failure
		}
	};
	const handleInviteAction = () => {
		setIsActionsModalVisible(false);
		Alert.alert("Invite Guests", "This will open the invitation flow.");
		// await inviteToParty({ partyId: currentPartyId, generateCode: true });
	};

	const onItemQuantityChangeInParty = async (
		restaurantId,
		itemId,
		newQuantity
	) => {
		if (!currentPartyId || !currentUserData?.uid) {
			Alert.alert(
				"Error",
				"Cannot update item: Party or user information missing."
			);
			return;
		}
		console.log(
			"PartySessionScreen: About to call context function. Type of 'handlePartyItemQuantityChange' from useParty():",
			typeof handlePartyItemQuantityChange
		);

		if (typeof handlePartyItemQuantityChange !== "function") {
			Alert.alert(
				"Error",
				"Cannot update item: Update function not available."
			);
			console.error(
				"PartySessionScreen: updatePartyBasketItemQuantity is not a function from context!"
			);
			return;
		}

		console.log(
			`PartySessionScreen: Updating item ${itemId} in party ${currentPartyId} to quantity ${newQuantity} by user ${currentUserData.uid}`
		);
		setUpdatingItemId(itemId);
		try {
			// The updatePartyBasketItemQuantity in PartyContext will handle calling
			// removePartyBasketItem if newQuantity is 0.
			const success = await handlePartyItemQuantityChange(
				currentPartyId,
				itemId,
				newQuantity,
				currentUserData.uid
			);

			console.log(
				"PartySessionScreen: Call to PartyContext.handlePartyItemQuantityChange has COMPLETED (either successfully or context handled its error)."
			);

			if (success) {
				console.log(
					"PartySessionScreen: Item quantity/removal processed by context."
				);
			} else {
				// Error alert likely shown by context, or you can show a generic one here
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
			setUpdatingItemId(null);
		}
	};

	const handleAddMembersToParty = async (pipsToAdd) => {
		if (!currentPartyId || pipsToAdd.length === 0) return;

		// Use a local loading state for the button in AddMembersModal
		setIsLoadingMembers(true);
		try {
			console.log(
				`PartySessionScreen: Calling context.addLocalPIPsToParty for ${pipsToAdd.length} members.`
			);
			// Call the correct, new context function
			const success = await addLocalPIPToParty(currentPartyId, pipsToAdd);
			if (success) {
				Alert.alert(
					"Success",
					`${pipsToAdd.length} member(s) added to the party.`
				);
				setIsAddMembersModalVisible(false); // Close the modal on success
			}
			// Errors are handled and alerted by the context function
		} catch (error) {
			// This catch is for unexpected client-side errors during the call
			console.error(
				"PartySessionScreen: Error in handleAddMembersToParty:",
				error
			);
			Alert.alert("Error", "An unexpected error occurred.");
		} finally {
			setIsLoadingMembers(false);
		}
	};

	// --- END OF FUNCTION DEFINITION ---

	const groupedBasket = useMemo(() => {
		if (!sharedBasketItems || sharedBasketItems.length === 0) return [];
		const groups = {};
		sharedBasketItems.forEach((item) => {
			const groupOwnerUserId = item.orderedByUserId || "unassigned_items";

			if (!groups[groupOwnerUserId]) {
				// Determine the display name for the group's header
				let groupDisplayName;
				if (groupOwnerUserId === currentUserData?.uid) {
					// If the group owner is the current logged-in user
					groupDisplayName = currentUserData.firstName || "Your Items";
				} else if (partyDetails?.guestPips) {
					// Try to find the name from the party's guest list
					const guestInfo = partyDetails.guestPips.find(
						(p) => p.userId === groupOwnerUserId
					);
					if (guestInfo && guestInfo.name) {
						groupDisplayName = guestInfo.name;
					} else {
						// Fallback if guest not found or name is missing
						groupDisplayName = `User ${
							groupOwnerUserId.slice(-4) || "Unknown"
						}`;
					}
				} else {
					// Fallback if no guestPips list
					groupDisplayName = `User ${groupOwnerUserId.slice(-4) || "Unknown"}`;
				}

				groups[groupOwnerUserId] = {
					userId: groupOwnerUserId,
					userName: groupDisplayName, // This is for the section header
					items: [],
				};
			}
			// The item itself still carries its own orderedByPipName for display within OrderItemCard
			groups[groupOwnerUserId].items.push(item);
		});
		const currentUserGroupKey = currentUserData?.uid;
		const currentUserGroup = groups[currentUserGroupKey];
		if (currentUserGroupKey) delete groups[currentUserGroupKey]; // Remove to re-insert at top
		return currentUserGroup
			? [currentUserGroup, ...Object.values(groups)]
			: Object.values(groups);
	}, [sharedBasketItems, currentUserData?.uid, partyDetails?.guestPips]);

	const handleAddMyItems = () => {
		if (!partyDetails?.restaurantId || !currentPartyId || !currentUserData) {
			Alert.alert("Error", "Party, restaurant, or user details are missing.");
			return;
		}

		if (!currentPartyId) {
			Alert.alert(
				"Error",
				"You are not currently in a party or it's still loading."
			);
			return;
		}
		navigation.navigate("PartyMenu", {
			// Navigate to the new PartyMenuScreen route
			partyId: currentPartyId,
		});
	};

	const handleSendUserItemsToChefsQ = async (userId) => {
		if (partyDetails?.status !== "active") {
			Alert.alert(
				"Party Not Active",
				"The party must be checked in and active to send items."
			);
			return;
		}
		const itemsToSend = sharedBasketItems.filter(
			(item) =>
				item.orderedByUserId === userId &&
				(item.status === "new" || !item.status)
		);
		if (itemsToSend.length === 0) {
			Alert.alert("No New Items", "You have no new items to send.");
			return;
		}
		const itemIds = itemsToSend.map((item) => item.id); // Make sure item.id is the unique ID of the basket item
		Alert.alert(
			"Confirm Send",
			`Send ${itemsToSend.length} of your item(s) to the kitchen?`,
			[
				{ text: "Cancel" },
				{
					text: "Send",
					onPress: async () => {
						setUiLoading(true); // Use a specific loading state if preferred
						console.log(
							`Simulating send to kitchen for user ${userId}, items:`,
							itemIds
						);
						// TODO: await sendPartyItemsToKitchen(currentPartyId, userId, itemIds);
						setTimeout(() => {
							Alert.alert(
								"Items Sent!",
								`${itemsToSend.length} item(s) would be sent to the kitchen.`
							);
							setUiLoading(false);
						}, 1500);
					},
				},
			]
		);
	};

	// --- Render Logic ---
	const renderMemberItem = ({ item }) => {
		const isUserTheHost = item.userId === partyDetails.hostUserId;
		return (
			<View style={styles.memberItemContainer}>
				<Ionicons
					name={isUserTheHost ? "person-circle" : "person-circle-outline"}
					size={28}
					color={isUserTheHost ? colors.primary : colors.textMedium}
				/>
				<Text style={styles.memberItemText}>{item.name}</Text>
				{isUserTheHost && <Text style={styles.hostLabel}>(Host)</Text>}
			</View>
		);
	};

	// State 1: Context is loading details for an *existing* party reference
	if (isLoadingParty && currentPartyId && !partyDetails) {
		return (
			<View style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.statusText}>Loading your party details...</Text>
			</View>
		);
	}

	// State 2: User is IN an active party
	// --- ACTIVE PARTY LOBBY UI ---
	if (currentPartyId && partyDetails) {
		const partyIsPending = partyDetails.status === "pending";
		const partyIsActive = partyDetails.status === "active";

		if (
			groupedBasket &&
			groupedBasket.length > 0 &&
			groupedBasket[0].items &&
			groupedBasket[0].items.length > 0
		) {
		} else if (
			groupedBasket &&
			groupedBasket.length > 0 &&
			(!groupedBasket[0].items || groupedBasket[0].items.length === 0)
		) {
			console.log(
				"PartySessionScreen: First group in groupedBasket has no items or items array is missing."
			);
		} else {
			console.log("PartySessionScreen: groupedBasket is empty or undefined.");
		}
		// --- END LOGS ---
		const canCurrentUserSendItems =
			partyIsActive &&
			sharedBasketItems.some(
				(item) =>
					item.orderedByUserId === currentUserData?.uid &&
					(item.status === "new" || !item.status)
			);

		return (
			<SafeAreaView style={styles.screen}>
				<View style={styles.headerBar}>
					<View style={styles.headerInfo}>
						<Text style={styles.headerRestaurantName} numberOfLines={1}>
							{partyDetails.restaurantName}
						</Text>
						<Text style={styles.headerPartyStatus}>
							Status:{" "}
							<Text
								style={
									partyIsActive ? styles.statusActive : styles.statusPending
								}
							>
								{partyDetails.status}
							</Text>
						</Text>
					</View>
					<View style={styles.headerActions}>
						<IconTextButton
							iconName="people-outline"
							text={null}
							onPress={() => setIsMembersModalVisible(true)}
							iconSize={28}
							color={colors.primary}
							style={styles.headerIconButton}
						/>
						<IconTextButton
							iconName="ellipsis-vertical"
							text={null}
							onPress={() => setIsActionsModalVisible(true)}
							iconSize={26}
							color={colors.primary}
							style={styles.headerIconButton}
						/>
					</View>
				</View>

				<FlatList
					data={groupedBasket}
					keyExtractor={(group) => group.userId || group.userName}
					renderItem={({ item: group }) => (
						<View style={styles.userBasketSection}>
							<Text style={styles.userNameHeader}>{group.userName}</Text>
							{group.items.length > 0 ? (
								group.items.map((basketItem, index) => {
									if (!basketItem || typeof basketItem.dishName !== "string") {
										console.warn(
											`PartySessionScreen: Item for ${group.userName} at index ${index} is missing dishName or is invalid. Item:`,
											basketItem
										);
									}
									// --- END LOG ---
									return (
										<OrderItemCard
											key={basketItem.id} // Use the unique ID of the item in the shared basket
											item={basketItem} // Pass the full item from sharedBasketItems
											onQuantityChange={onItemQuantityChangeInParty} // Use the new handler
											allowEdit={
												basketItem.orderedByUserId === currentUserData.uid &&
												(basketItem.status === "new" || !basketItem.status) // Only current user can edit their new items
											}
											restaurantId={basketItem.restaurantId}
											isSentToKitchen={basketItem.status === "sentToChefQ"}
											isUpdating={updatingItemId === basketItem.id}
										/>
									);
								})
							) : (
								<Text style={styles.emptyUserBasketText}>
									No items added yet.
								</Text>
							)}

							{/* "Send My New Items" button at the bottom of the current user's section */}
							{group.userId === currentUserData?.uid &&
								group.items.some((i) => !i.status || i.status === "new") && (
									<TouchableOpacity
										style={[
											styles.sendAllUserItemsButton,
											!partyIsActive && styles.disabledButtonVisual,
										]}
										onPress={() =>
											handleSendUserItemsToChefsQ(currentUserData.uid)
										}
										disabled={!partyIsActive || uiLoading}
									>
										<Text style={styles.sendAllUserItemsButtonText}>
											{partyIsActive
												? "Send My New Items"
												: "Party Not Active to Send"}
										</Text>
										{uiLoading && (
											<ActivityIndicator
												size="small"
												color={colors.textOnPrimaryBrand}
												style={{ marginLeft: 10 }}
											/>
										)}
									</TouchableOpacity>
								)}
						</View>
					)}
					ListEmptyComponent={
						<View style={styles.emptyBasketContainer}>
							<FontAwesome5
								name="shopping-basket"
								size={48}
								color={colors.textLight}
							/>
							<Text style={styles.emptyBasketText}>Party basket is empty.</Text>
							<Text style={styles.emptyBasketSubText}>
								Tap the '+' button to add your items!
							</Text>
						</View>
					}
					contentContainerStyle={styles.flatListContentContainer}
				/>

				{/* Add My Items FAB: Available if party is pending or active */}
				{(partyIsPending || partyIsActive) && (
					<TouchableOpacity
						style={styles.addItemFab}
						onPress={handleAddMyItems}
					>
						<Ionicons name="add" size={30} color={colors.textOnPrimaryBrand} />
					</TouchableOpacity>
				)}

				{/* Modals */}
				<Modal
					transparent={true}
					visible={isMembersModalVisible}
					onRequestClose={() => setIsMembersModalVisible(false)}
					animationType="fade"
				>
					<TouchableOpacity
						style={styles.modalOverlay}
						activeOpacity={1}
						onPressOut={() => setIsMembersModalVisible(false)}
					>
						<TouchableOpacity style={styles.modalContent} activeOpacity={1}>
							<Text style={styles.modalTitle}>Party Members</Text>
							<FlatList
								data={partyDetails.guestPips || []}
								keyExtractor={(pip) => pip.userId || pip.localPipId}
								renderItem={renderMemberItem}
							/>
							{isHost && (
								<Button
									icon="account-plus-outline"
									mode="contained"
									onPress={() => {
										setIsMembersModalVisible(false); // Close current modal
										setIsAddMembersModalVisible(true); // Open the new one
									}}
									style={styles.addMemberButton}
								>
									Add Members from PIPs
								</Button>
							)}
							<TouchableOpacity
								style={styles.modalCloseButton}
								onPress={() => setIsMembersModalVisible(false)}
							>
								<Text style={styles.modalCloseButtonText}>Close</Text>
							</TouchableOpacity>
						</TouchableOpacity>
					</TouchableOpacity>
				</Modal>
				<AddMembersModal
					isVisible={isAddMembersModalVisible}
					onClose={() => setIsAddMembersModalVisible(false)}
					onConfirmAdd={handleAddMembersToParty}
					hostPips={hostPipsList}
					partyMembers={partyDetails.guestPips || []}
					isLoading={isLoadingMembers}
				/>

				<Modal
					transparent={true}
					visible={isActionsModalVisible}
					onRequestClose={() => setIsActionsModalVisible(false)}
					animationType="fade"
				>
					<TouchableOpacity
						style={styles.modalOverlay}
						activeOpacity={1}
						onPressOut={() => setIsActionsModalVisible(false)}
					>
						<TouchableOpacity
							style={styles.modalActionsContent}
							activeOpacity={1}
						>
							<Text style={styles.modalTitle}>Party Actions</Text>
							{isHost && partyDetails.status === "AWAITING_TABLE" && (
								<IconTextButton
									text="Cancel Check-In Request"
									iconName="close-circle-outline"
									iconSet="MaterialCommunityIcons"
									onPress={handleCancelCheckInRequest}
									style={styles.modalActionButton}
									textStyle={styles.modalActionButtonText}
									color={colors.statusDanger}
									disabled={isLoadingParty} // Disable if any party action is happening
								/>
							)}
							{isHost && (partyIsPending || partyIsActive) && (
								<IconTextButton
									text="Invite Guests"
									iconName="person-add-outline"
									onPress={handleInviteAction}
									style={styles.modalActionButton}
									textStyle={styles.modalActionButtonText}
									color={colors.primary}
								/>
							)}
							{isHost && partyIsPending && (
								<IconTextButton
									text="Activate Party Check-In"
									iconName="location-enter"
									iconSet="MaterialCommunityIcons"
									onPress={handleOpenPartyCheckInModal} // THIS OPENS THE PartyCheckInModal
									style={styles.modalActionButton}
									textStyle={styles.modalActionButtonText}
									color={colors.primary}
									disabled={isProcessingPartyCheckIn || isLoadingParty}
								/>
							)}
							{isHost && partyIsPending ? (
								<IconTextButton
									text="Cancel Party"
									iconName="close-circle-outline"
									iconSet="MaterialCommunityIcons"
									color={colors.statusDanger}
									onPress={handleCancelPartyAction}
									style={styles.modalActionButton}
									textStyle={styles.modalActionButtonText}
								/>
							) : (
								<IconTextButton
									text="Leave Party"
									iconName="exit-outline"
									color={colors.statusDanger}
									onPress={handleLeaveParty}
									style={styles.modalActionButton}
									textStyle={styles.modalActionButtonText}
								/>
							)}
							<TouchableOpacity
								style={[
									styles.modalCloseButton,
									styles.actionsModalCloseButton,
								]}
								onPress={() => setIsActionsModalVisible(false)}
							>
								<Text style={styles.modalCloseButtonText}>Close</Text>
							</TouchableOpacity>
						</TouchableOpacity>
					</TouchableOpacity>
				</Modal>
				<PartyCheckInModal
					isVisible={isPartyCheckInModalVisible}
					onClose={() => setIsPartyCheckInModalVisible(false)}
					onSubmit={handleSubmitPartyCheckIn}
					initialPartySize={calculatedInitialPartySize}
					validationSchema={partyCheckInValidationSchema}
					isLoadingAction={isProcessingPartyCheckIn}
				/>
			</SafeAreaView>
		);
	}

	// State 3: User is NOT in a party (or an error occurred trying to load a previous party)
	return (
		<View style={styles.centeredScreen}>
			<FontAwesome5
				name="glass-cheers"
				size={60}
				color={colors.primary}
				style={{ marginBottom: 20 }}
			/>
			<Text style={styles.hubTitle}>Party Hub</Text>
			<Text style={styles.hubSubtitle}>
				Join an existing party or start a new one from a restaurant's page.
			</Text>

			{partyError && <Text style={styles.errorText}>{partyError}</Text>}
			{uiError && <Text style={styles.errorText}>{uiError}</Text>}

			<View style={styles.noPartyActionsContainer}>
				{/* Modified "Start a Party" guidance */}
				<IconTextButton
					iconSet="MaterialCommunityIcons"
					iconName="creation" // Changed icon to reflect guidance
					text="How to Start a Party"
					onPress={handleStartNewPartyGuidance} // Calls the guidance alert
					style={styles.mainAction}
					iconSize={40}
					fontSize={16}
					color={colors.primary} // Use your primary color
				/>

				<Text style={styles.orText}>or</Text>

				<View style={styles.joinPartyContainer}>
					<TextInput
						placeholder="Enter Party Code"
						value={inviteCode}
						onChangeText={setInviteCode}
						style={styles.joinInput}
						autoCapitalize="characters"
						placeholderTextColor={colors.textLight}
						maxLength={6}
					/>
					<IconTextButton
						iconSet="Ionicons"
						iconName="log-in-outline"
						text="Join Party"
						onPress={handleJoinPartyAttempt}
						disabled={uiLoading || !inviteCode}
						color={
							!inviteCode || uiLoading ? colors.textLight : colors.statusSuccess
						} // Use success color
						style={styles.joinButton}
						iconSize={28}
						fontSize={15}
					/>
				</View>
				{uiLoading && (
					<ActivityIndicator style={{ marginTop: 15 }} color={colors.primary} />
				)}
			</View>
		</View>
	);
};

// --- Styles --- (Modern, clean, professional)
const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.backgroundLight },
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 20,
		backgroundColor: colors.backgroundLight,
	},
	statusText: { marginTop: 15, fontSize: 16, color: colors.textDark },
	flatListContentContainer: { paddingBottom: 100, paddingTop: 10 }, // Ensure space for FAB

	headerBar: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 15,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	headerInfo: { flex: 1, marginRight: 10 },
	headerRestaurantName: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 2,
	},
	headerPartyStatus: { fontSize: 14, color: colors.textMedium },
	statusPending: { color: colors.statusWarning, fontWeight: "bold" },
	statusActive: { color: colors.statusSuccess, fontWeight: "bold" },
	headerActions: { flexDirection: "row", alignItems: "center" },
	headerIconButton: { paddingHorizontal: 8 }, // Add padding to header icons for better touch area

	userBasketSection: {
		marginVertical: 8,
		marginHorizontal: 12,
		padding: 12,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 10,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 2.5,
		elevation: 2,
	},
	userNameHeader: {
		fontSize: 18,
		fontWeight: "600",
		color: colors.textDark,
		marginBottom: 10,
		paddingBottom: 6,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	itemCard: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 10,
		marginTop: 5,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight + "60", // Lighter border for items
	},
	itemInfo: { flex: 1 }, // Allow text to wrap
	itemName: {
		fontSize: 16,
		color: colors.textDark,
		fontWeight: "500",
		marginBottom: 3,
	},
	itemDetails: { fontSize: 13, color: colors.textMedium },
	itemOrderedBy: {
		fontSize: 12,
		color: colors.textLight,
		fontStyle: "italic",
		marginTop: 3,
	},
	itemStatusContainer: { paddingLeft: 10, alignItems: "flex-end" },
	itemStatusSent: {
		fontSize: 13,
		color: colors.statusSuccess,
		fontWeight: "bold",
	},
	itemStatusNew: { fontSize: 13, color: colors.statusInfo, fontWeight: "500" },

	sendAllUserItemsButton: {
		backgroundColor: colors.primary,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 15,
		flexDirection: "row",
		justifyContent: "center",
	},
	sendAllUserItemsButtonText: {
		color: colors.textOnPrimaryBrand,
		fontSize: 16,
		fontWeight: "bold",
	},
	disabledButtonVisual: { backgroundColor: colors.textLight },

	emptyBasketContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 30,
		marginTop: 50,
	},
	emptyBasketText: {
		textAlign: "center",
		marginTop: 15,
		fontSize: 18,
		color: colors.textMedium,
		fontWeight: "500",
	},
	emptyBasketSubText: {
		textAlign: "center",
		marginTop: 5,
		fontSize: 14,
		color: colors.textLight,
	},
	emptyUserBasketText: {
		textAlign: "center",
		marginVertical: 10,
		fontSize: 14,
		color: colors.textLight,
		fontStyle: "italic",
	},

	addItemFab: {
		position: "absolute",
		right: 20,
		bottom: 25,
		backgroundColor: colors.brandOrange,
		width: 60,
		height: 60,
		borderRadius: 30,
		justifyContent: "center",
		alignItems: "center",
		elevation: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 4,
	},

	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 20,
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		paddingVertical: 20,
		paddingHorizontal: 15,
		borderRadius: 12,
		width: "90%",
		maxHeight: "70%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalActionsContent: {
		backgroundColor: colors.surfaceWhite,
		paddingVertical: 10,
		paddingHorizontal: 5,
		borderRadius: 12,
		width: "90%",
		alignItems: "stretch",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 21,
		fontWeight: "bold",
		marginBottom: 20,
		textAlign: "center",
		color: colors.textDark,
	},
	memberItemContainer: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	memberItemText: { fontSize: 17, color: colors.textMedium, marginLeft: 10 },
	modalEmptyText: {
		textAlign: "center",
		color: colors.textMedium,
		marginVertical: 10,
	},
	modalActionButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 15,
		paddingHorizontal: 15,
	},
	iconTextButtonContainer: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
	}, // General purpose
	iconTextButtonText: { fontWeight: "500" }, // General purpose
	modalActionButtonText: {
		// Specific for text next to icon in modal actions
		marginLeft: 18,
		fontSize: 17,
		color: colors.textDark, // Default text color for modal actions
	},
	modalCloseButton: {
		backgroundColor: colors.textMedium,
		paddingVertical: 12,
		paddingHorizontal: 20,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 20,
	},
	actionsModalCloseButton: { marginTop: 10, marginHorizontal: 10 }, // Specific margin for actions modal close
	modalCloseButtonText: {
		color: colors.surfaceWhite,
		fontSize: 16,
		fontWeight: "bold",
	},

	// Styles for the "No Active Party" Hub
	hubTitle: {
		fontSize: 32,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 8,
		textAlign: "center",
	},
	hubSubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 30,
		paddingHorizontal: 10,
	},
	noPartyActionsContainer: {
		width: "100%",
		alignItems: "center",
		marginTop: 20,
	},
	mainAction: {
		paddingVertical: 15,
		paddingHorizontal: 20,
		backgroundColor: colors.accent,
		borderRadius: 12,
		// Shadow for a modern "card" feel
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 5,
		marginBottom: 25,
	},
	orText: {
		fontSize: 16,
		color: colors.textLight,
		marginVertical: 20,
		fontWeight: "500",
	},
	joinPartyContainer: {
		width: "100%",
		alignItems: "center",
		padding: 15,
		backgroundColor: colors.accent,
		borderRadius: 12,
		shadowColor: "#000", // Consistent shadow
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 2.0,
		elevation: 3,
	},
	joinInput: {
		width: "90%",
		borderWidth: 1,
		borderColor: colors.mediumGray,
		backgroundColor: colors.white, // Input often looks good on white
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 8,
		fontSize: 18, // Larger for easy tapping
		color: colors.textDark,
		marginBottom: 15,
		textAlign: "center",
	},
	joinButton: {
		paddingVertical: 8, // Slightly smaller padding for a secondary action feel
	},
	iconTextButtonContainer: {
		// Container for individual icon+text buttons
		alignItems: "center",
		paddingVertical: 10, // Vertical spacing for touch target
		paddingHorizontal: 5, // Horizontal spacing if they are in a row
		minWidth: 80, // Ensure touch target width
	},
	iconTextButtonText: {
		marginTop: 6, // Space between icon and text
		textAlign: "center",
		fontWeight: "500", // Medium weight for clarity
	},
	errorText: {
		color: colors.danger,
		fontSize: 14,
		textAlign: "center",
		marginBottom: 15, // Space below error
		paddingHorizontal: 10,
	},
	addMemberButton: {
		marginTop: 20,
		backgroundColor: colors.brandOrange,
	},
});

export default PartySessionScreen;
