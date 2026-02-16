import React, {
	useContext,
	useState,
	useEffect,
	useMemo,
	useCallback,
} from "react";
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
	Share,
	Platform,
} from "react-native";
import {
	useNavigation,
	useFocusEffect,
	useRoute,
} from "@react-navigation/native";
import {
	Ionicons,
	MaterialCommunityIcons,
	FontAwesome5,
} from "@expo/vector-icons"; // Popular icon sets
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";

import { db } from "../../config/firebase";
import OrderItemCard from "../../components/customer/OrderItemCard";
import PartyCheckInModal from "../../components/customer/Party/PartyCheckInModal";
import * as Yup from "yup";
import { requestPartyTableCheckIn } from "../../utils/customerUtils";
import AddMembersModal from "../../components/customer/Party/AddMembersModal";
import { Button } from "react-native-paper";
import PartyBasketGuide from "../../components/customer/Party/PartyBasketGuide";
import { collection, onSnapshot } from "@react-native-firebase/firestore";
import formatTimeLeft from "../../utils/formatTimeLeft";

/**
 * A reusable button component featuring an icon and text underneath.
 */

const IconTextButton = ({
	iconName,
	iconSet = "Ionicons",
	text,
	onPress,
	color,
	disabled = false,
	style,
	iconSize,
	fontSize,
	textStyle,
}) => {
	let IconComponent;
	switch (iconSet) {
		case "MaterialCommunityIcons":
			IconComponent = MaterialCommunityIcons;
			break;
		default:
			IconComponent = Ionicons;
			break;
	}
	const textColor = disabled ? colors.textLight : color || colors.textDark;
	const iconColor = disabled ? colors.textLight : color || colors.primary;

	return (
		<TouchableOpacity
			style={[styles.modalActionButton, style]}
			onPress={onPress}
			disabled={disabled}
		>
			<IconComponent name={iconName} size={iconSize || 26} color={iconColor} />
			<Text
				style={[
					styles.modalActionButtonText,
					{ color: textColor, fontSize: fontSize || 17 },
					textStyle,
				]}
			>
				{text}
			</Text>
		</TouchableOpacity>
	);
};

const PartySessionScreen = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const {
		currentPartyIds,
		partyDetails,
		isLoadingParty, // True when context is loading party details for currentPartyId
		partyError,
		cancelPartyCheckIn,
		sharedBaskets, // Needed for the active party view
		// --- Context Actions ---
		// Assuming these functions exist in PartyContext and handle backend + context state updates:
		joinParty, // ({ inviteCode }) => Promise<boolean> (returns true on success)
		leaveParty, // () => Promise<void>
		cancelParty, // () => Promise<void>
		activatePartyCheckIn, // (checkInDocId) => Promise<void>
		addLocalPIPToParty,
		inviteToParty,
		sendMyItemsToKitchen,

		handlePartyItemQuantityChange,
	} = useParty();

	const route = useRoute();

	const { partyId } = route.params;

	const currentPartyId = route.params?.partyId || null;

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
	const [uiJoinLoading, setUiJoinLoading] = useState(false);
	const [isSendingItems, setIsSendingItems] = useState(false);
	const [isLoadingAction, setIsLoadingAction] = useState(false);
	const [isGeneratingCode, setIsGeneratingCode] = useState(false);
	const [showInviteCode, setShowInviteCode] = useState(true);

	const currentParty = partyDetails[currentPartyId];

	const partyCheckInValidationSchema = Yup.object().shape({
		partySize: Yup.number()
			.min(1, t("party_must_have_at_least_1_person"))
			.max(50, t("party_size_cannot_exceed_50")) // Example max
			.required(t("party_size_is_required"))
			.typeError(t("must_be_a_valid_number")),
	});

	useEffect(() => {
		if (currentPartyId && !partyDetails[currentPartyId]) {
			console.log("Party gone. Replacing with PartyHub.");
			navigation.replace("PartyHub"); // ← Replace, not navigate
		}
	}, [currentPartyId, partyDetails, navigation]);

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
		if (!partyDetails || !currentPartyId || !partyDetails[currentPartyId])
			return 1; // Default if no details or party not loaded yet

		const party = partyDetails[currentPartyId];
		// Assuming guestPips includes all guests, and host is one person
		return (party.guestPips?.length || 0) + (party.hostUserId ? 1 : 0) || 1;
	}, [partyDetails, currentPartyId]);

	const myPartyStatus = useMemo(() => {
		if (
			!currentPartyId ||
			!partyDetails ||
			!partyDetails[currentPartyId] ||
			!currentUserData?.uid
		) {
			return null;
		}
		const party = partyDetails[currentPartyId];
		return party.guestPips?.find((p) => p.userId === currentUserData.uid);
	}, [currentPartyId, partyDetails, currentUserData?.uid]);

	const party = partyDetails[currentPartyId];
	const isHost = party ? party.hostUserId === currentUserData?.uid : false;

	// --- Action Handlers ---
	const handleStartNewPartyGuidance = () => {
		Alert.alert(
			t("start_a_new_party"),
			t(
				"to_begin_a_new_party_please_find_a_restaurant_from_the_home_screen_you_can_then_start_a_party_directly_from_the_restaurants_detail_page"
			),
			[
				{
					text: t("go_to_home"),
					// Navigate to your main restaurant discovery tab/screen.
					// Replace 'CustomerDashboard' with the actual route name of your home/discovery tab/stack.
					onPress: () => navigation.navigate("CustomerDashboard"),
				},
				{
					text: t("ok"),
					style: "cancel",
				},
			]
		);
	};

	// Handler for the "Join Party" button on the hub screen
	const handleJoinPartyAttempt = async () => {
		if (!inviteCode.trim()) {
			Alert.alert(t("invalid_code"), t("please_enter_an_invite_code"));
			return;
		}
		setUiJoinLoading(true);
		// Context function handles alerts for success/failure
		await joinParty({ inviteCode: inviteCode.trim() });
		setUiJoinLoading(false);
		setInviteCode(""); // Clear input
	};

	const handleLeaveParty = async () => {
		Alert.alert(
			t("leave_party"),
			t("are_you_sure_you_want_to_leave_this_party"),
			[
				{ text: t("cancel"), style: "cancel" },
				{
					text: t("leave"),
					style: "destructive",
					onPress: async () => {
						setUiLoading(true);
						try {
							await leaveParty(); // Context handles navigation or state clearing
						} catch (e) {
							Alert.alert(t("error"), t("could_not_leave_party"));
						} finally {
							setUiLoading(false);
						}
					},
				},
			]
		);
	};
	const handleLeavePartyAction = useCallback(() => {
		setIsActionsModalVisible(false); // Close the modal first
		Alert.alert(t("leave_party"), t("are_you_sure"), [
			{ text: t("cancel"), style: "cancel" },
			{
				text: t("leave"),
				style: "destructive",
				onPress: async () => await leaveParty(currentPartyId),
			},
		]);
	}, [leaveParty, currentPartyId]);

	const handleCancelPartyAction = async () => {
		// Host only
		Alert.alert(
			t("cancel_party"),
			t("are_you_sure_you_want_to_cancel_this_entire_party_this_cannot_be_undone"),
			[
				{ text: t("keep_party"), style: "cancel" },
				{
					text: t("cancel_party"),
					style: "destructive",
					onPress: async () => {
						setUiLoading(true);
						try {
							await cancelParty(); // Context handles navigation or state clearing
						} catch (e) {
							Alert.alert(t("error"), t("could_not_cancel_party"));
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
		if (isHost && partyDetails[partyId]?.status === "pending") {
			setIsPartyCheckInModalVisible(true); // Open the party check-in modal
		} else {
			Alert.alert(
				t("info"),
				t("only_the_host_can_activate_a_pending_party_by_checking_in")
			);
		}
	};

	const handleCancelCheckInRequest = useCallback(() => {
		setIsActionsModalVisible(false); // Close the modal first
		Alert.alert(
			t("cancel_check_in_request"),
			t(
				"are_you_sure_you_want_to_cancel_your_request_for_a_table_this_will_revert_the_party_to_a_pending_state"
			),
			[
				{ text: t("dont_cancel"), style: "cancel" },
				{
					text: t("yes_cancel"),
					style: "destructive",
					onPress: async () => {
						// The context function handles loading states and alerts
						await cancelPartyCheckIn();
					},
				},
			]
		);
	}, [cancelPartyCheckIn]);

	const handleCancelParty = useCallback(() => {
		setIsActionsModalVisible(false);
		Alert.alert(
			t("cancel_entire_party"),
			t(
				"are_you_sure_you_want_to_permanently_cancel_this_party_this_action_cannot_be_undone"
			),
			[
				{ text: t("keep_party"), style: "cancel" },
				{
					text: t("cancel_party"),
					style: "destructive",
					onPress: async () => {
						await cancelParty();
					},
				},
			]
		);
	}, [cancelParty]);

	const handleSubmitPartyCheckIn = async (values) => {
		// values will contain { partySize } from the PartyCheckInModal's Formik
		if (
			!partyDetails ||
			!currentUserData ||
			!currentPartyId ||
			!partyDetails[currentPartyId]
		) {
			Alert.alert(t("error"), t("missing_party_or_user_information"));
			setIsPartyCheckInModalVisible(false); // Close modal on error
			return;
		}
		setIsProcessingPartyCheckIn(true);
		try {
			const checkInResult = await requestPartyTableCheckIn(
				partyDetails[currentPartyId].restaurantId,
				currentUserData.uid,
				currentUserData.firstName || t("party_host"),
				values.partySize,
				currentPartyId
			);

			if (checkInResult.success && checkInResult.checkInId) {
				const activationSuccess = await activatePartyCheckIn(
					checkInResult.checkInId
				);
				if (activationSuccess) {
					console.log(
						"Party Activated! Your party is now active and checked in."
					);
				}
				// Error alerts for activation failure are likely handled within activatePartyCheckIn context function
			} else {
				Alert.alert(
					t("check-in_failed"),
					checkInResult.error || t("could_not_request_a_table_for_the_party")
				);
			}
		} catch (error) {
			console.error(
				"PartySessionScreen: Error during party check-in process:",
				error
			);
			Alert.alert(
				t("error"),
				t("an_unexpected_error_occurred_during_party_check-in")
			);
		} finally {
			setIsProcessingPartyCheckIn(false);
			setIsPartyCheckInModalVisible(false); // Close modal regardless of success/failure
		}
	};

	const handleInviteAction = async () => {
		setIsActionsModalVisible(false);
		setIsGeneratingCode(true); // ← ADD THIS

		try {
			if (typeof inviteToParty !== "function") {
				Alert.alert(t("error"), t("invite_function_is_not_available"));
				return;
			}

			const generatedCode = await inviteToParty();

			if (generatedCode) {
				const message = `${t("join_my_party_at")} ${
					partyDetails[currentPartyId]?.restaurantName || t("the_restaurant")
				}! ${t("use_this_code_in_the_scerv_app")}: ${generatedCode}`;

				Alert.alert(
					t("invite_code_generated"),
					`${t("code")}: ${generatedCode}\n\n${t(
						"this_code_expires_in_about_1_hour"
					)}`,
					[
						{
							text: t("copy_code"),
							onPress: () => Clipboard.setString(generatedCode),
						},
						{
							text: t("share"),
							onPress: () =>
								Share.share({
									message,
									title: t("scerv_party_invite"),
								}),
						},
						{ text: t("ok"), style: "cancel" },
					]
				);
			}
		} catch (error) {
			// Error already handled by context
		} finally {
			setIsGeneratingCode(false); // ← ADD THIS
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
					t("success"),
					`${pipsToAdd.length} ${t("member_s_added_to_the_party")}`
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
			Alert.alert(t("error"), t("an_unexpected_error_occurred"));
		} finally {
			setIsLoadingMembers(false);
		}
	};

	const onItemQuantityChangeCallbackForParty = useCallback(
		async (
			itemId, // OrderItemCard now only sends itemId and newQuantity
			newQuantity
		) => {
			// Use partyDetails[currentPartyId].id as the most reliable source of the partyId for this screen
			const partyIdToUse = partyDetails[partyId]?.id;

			// --- Add a strong guard clause ---
			if (!partyIdToUse || !currentUserData?.uid) {
				console.error(
					"PartySessionScreen: Cannot update item. Party ID or User ID is missing.",
					{ partyIdToUse, uid: currentUserData?.uid }
				);
				Alert.alert(
					t("error"),
					t("there_was_a_problem_updating_your_item_please_try_again")
				);
				return;
			}

			if (typeof handlePartyItemQuantityChange !== "function") {
				console.error(
					"PartySessionScreen: The handlePartyItemQuantityChange function from context is not available!"
				);
				Alert.alert(t("error"), t("action_is_currently_unavailable"));
				return;
			}

			console.log(
				`PartySessionScreen: Calling context to update item "${itemId}" in party "${partyIdToUse}" to quantity ${newQuantity}`
			);
			setUpdatingItemId(itemId);
			try {
				console.log("Entering ");
				// Call the context function with the correct arguments
				await handlePartyItemQuantityChange(
					partyIdToUse,
					itemId,
					newQuantity,
					currentUserData.uid
				);
			} catch (error) {
				console.error(
					"PartySessionScreen: Error calling context function:",
					error
				);
				// Alert is likely handled by the context, but we log the error here.
			} finally {
				setUpdatingItemId(null);
			}
		},
		[
			partyDetails[partyId]?.id,
			currentUserData?.uid,
			handlePartyItemQuantityChange,
		]
	); // Add dependencies

	// --- END OF FUNCTION DEFINITION ---

	const groupedBasket = useMemo(() => {
		if (!sharedBaskets || !currentPartyId || !partyDetails[currentPartyId]) {
			console.log(
				"PartySessionScreen: sharedBaskets, currentPartyId, or partyDetails[currentPartyId] is undefined, returning empty array"
			);
			return [];
		}
		const items = sharedBaskets[currentPartyId] || [];
		if (!items || items.length === 0) {
			console.log(
				"PartySessionScreen: No items in sharedBaskets for party:",
				currentPartyId
			);
			return [];
		}
		const groups = {};
		items.forEach((item) => {
			const groupOwnerUserId = item.orderedByUserId || "unassigned_items";
			if (!groups[groupOwnerUserId]) {
				let groupDisplayName;
				if (groupOwnerUserId === currentUserData?.uid) {
					groupDisplayName = currentUserData.firstName || t("your_items");
				} else if (partyDetails[currentPartyId]?.guestPips) {
					const guestInfo = partyDetails[currentPartyId].guestPips.find(
						(p) => p.userId === groupOwnerUserId
					);
					groupDisplayName =
						guestInfo?.name ||
						`${t("user")} ${groupOwnerUserId.slice(-4) || t("unknown")}`;
				} else {
					groupDisplayName = `${t("user")} ${
						groupOwnerUserId.slice(-4) || t("unknown")
					}`;
				}
				groups[groupOwnerUserId] = {
					userId: groupOwnerUserId,
					userName: groupDisplayName,
					items: [],
				};
			}
			groups[groupOwnerUserId].items.push(item);
		});
		const currentUserGroupKey = currentUserData?.uid;
		const currentUserGroup = groups[currentUserGroupKey];
		if (currentUserGroupKey) delete groups[currentUserGroupKey];

		return currentUserGroup
			? [currentUserGroup, ...Object.values(groups)]
			: Object.values(groups);
	}, [sharedBaskets, currentPartyId, currentUserData?.uid, partyDetails]);

	const handleAddMyItems = () => {
		if (myPartyStatus?.paymentStatus === "paid") {
			Alert.alert(
				t("already_paid"),
				t(
					"you_have_already_paid_your_portion_of_the_bill_and_cannot_add_more_items"
				)
			);
			return;
		}
		if (
			!partyDetails[currentPartyId]?.restaurantId ||
			!currentPartyId ||
			!currentUserData
		) {
			Alert.alert(
				t("error"),
				t("party_restaurant_or_user_details_are_missing")
			);
			return;
		}

		if (!currentPartyId) {
			Alert.alert(
				t("error"),
				t("you_are_not_currently_in_a_party_or_its_still_loading")
			);
			return;
		}
		navigation.navigate("PartyMenu", {
			// Navigate to the new PartyMenuScreen route
			partyId: currentPartyId,
			restaurantId: partyDetails[currentPartyId]?.restaurantId,
			userId: currentUserData.uid,
		});
	};

	const handleShareInvite = async (code) => {
		const restaurantName =
			partyDetails[currentPartyId]?.restaurantName || t("a_restaurant");

		const message = `${t("join_my_party_at")} ${restaurantName} ${t("on_scerv")}!

${t("invite_code")}: ${code}

${t("iphone_users_download_here")}:
https://apps.apple.com/app/id1591335061

${t("android_users_download_here")}:
https://play.google.com/store/apps/details?id=com.scerv.eat`;

		try {
			await Share.share({ message });
		} catch (error) {
			Alert.alert(t("share_failed"), t("could_not_share_invite"));
		}
	};

	// Handler for the button press
	const handleSendMyItems = () => {
		if (!sendMyItemsToKitchen) {
			Alert.alert(t("error"), t("action_not_available"));
			return;
		}
		Alert.alert(
			t("confirm_order"),
			t(
				"are_you_sure_you_want_to_send_your_new_items_to_the_kitchen_you_wont_be_able_to_edit_them_after"
			),
			[
				{ text: t("cancel"), style: "cancel" },
				{
					text: t("yes_send"),
					onPress: async () => {
						setIsSendingItems(true); // <<< Set local loading state immediately
						try {
							await sendMyItemsToKitchen();
							// Success/Error Alerts are handled within the context function
						} catch (error) {
							// This catch is for unexpected errors during the call itself
							console.error(
								"PartySessionScreen: Error calling sendMyItemsToKitchen:",
								error
							);
						} finally {
							setIsSendingItems(false); // <<< Reset local loading state
						}
					},
				},
			]
		);
	};

	// --- NEW: Memoized calculation to determine checkout readiness ---
	const canCurrentUserCheckout = useMemo(() => {
		if (
			!partyDetails ||
			!currentPartyId ||
			partyDetails[currentPartyId]?.status !== "active" ||
			!currentUserData?.uid ||
			!sharedBaskets
		) {
			return false;
		}

		// User cannot checkout if they have already paid.
		if (myPartyStatus?.paymentStatus === "paid") {
			return false;
		}
		// Find items belonging to the current user
		const myItems = sharedBaskets[currentPartyId].filter(
			(item) => item.orderedByUserId === currentUserData.uid
		);
		// User must have at least one item to check out
		if (myItems.length === 0) {
			return false;
		}
		// Check if there are ANY items that have NOT been sent to the kitchen
		const hasUnsentItems = myItems.some(
			(item) => item.status === "new" || !item.status
		);
		// The user can checkout only if they have items and none of them are new/unsent.
		return !hasUnsentItems;
	}, [partyDetails, sharedBaskets, currentUserData?.uid]);

	// --- NEW: Handler to navigate to the checkout screen ---
	const handleGoToCheckout = () => {
		if (!canCurrentUserCheckout) {
			Alert.alert(
				t("not_ready"),
				t(
					"you_can_only_checkout_when_the_party_is_active_and_all_your_items_have_been_sent_to_the_kitchen"
				)
			);
			return;
		}
		console.log(
			`PartySessionScreen: Navigating to checkout for partyId: ${currentPartyId}`
		);
		navigation.navigate("PartyCheckout", {
			// This should be the route name for PartyCheckoutScreen
			partyId: currentPartyId,
		});
	};
	// State 1: Context is loading details for an *existing* party reference
	if (isLoadingParty || !currentPartyId || !partyDetails[currentPartyId]) {
		return (
			<SafeAreaView
				style={[
					styles.centeredScreen,
					{ backgroundColor: colors.backgroundLight },
				]}
			>
				<ActivityIndicator size="large" color={colors.primary || "#2196F3"} />
				<Text style={[styles.statusText, { color: colors.textDark || "#333" }]}>
					{t("loading_your_party_details")}...
				</Text>
			</SafeAreaView>
		);
	}
	// Now safe
	const guestPips = party.guestPips || [];

	// --- Render Logic ---
	const renderMemberItem = ({ item }) => {
		const isUserTheHost =
			item.userId === partyDetails[currentPartyId]?.hostUserId;
		return (
			<View style={styles.memberItemContainer}>
				<Ionicons
					name={isUserTheHost ? "person-circle" : "person-circle-outline"}
					size={28}
					color={isUserTheHost ? colors.primary : colors.textMedium}
				/>
				<Text style={styles.memberItemText}>{item.name}</Text>
				{isUserTheHost && <Text style={styles.hostLabel}>({t("host")})</Text>}
			</View>
		);
	};

	// State 2: User is IN an active party
	// --- ACTIVE PARTY LOBBY UI ---
	if (currentPartyId && partyDetails[currentPartyId]) {
		const partyIsPending = partyDetails[currentPartyId].status === "pending";
		const partyIsActive = partyDetails[currentPartyId].status === "active";
		const userHasPaid = myPartyStatus?.paymentStatus === "paid";

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

		return (
			<SafeAreaView style={styles.screen}>
				<View style={styles.headerBar}>
					<View style={styles.headerInfo}>
						<Text style={styles.headerRestaurantName} numberOfLines={1}>
							{partyDetails[currentPartyId]?.restaurantName}
						</Text>

						{/* STATUS ROW */}
						{partyIsActive && partyDetails[currentPartyId]?.table?.name ? (
							<View style={styles.statusContainer}>
								<Ionicons
									name="checkmark-circle"
									size={16}
									color={colors.statusSuccess}
								/>
								<Text style={[styles.headerPartyStatus, styles.statusActive]}>
									{t("seated_at")}{" "}
									{partyDetails[currentPartyId].table.name}
								</Text>
							</View>
						) : (
							<View style={styles.statusContainer}>
								<Ionicons
									name="time-outline"
									size={16}
									color={colors.statusWarning}
								/>
								<Text style={[styles.headerPartyStatus, styles.statusPending]}>
									{partyDetails[currentPartyId]?.status === "AWAITING_TABLE"
										? t("waiting_for_table")
										: `${t("status")}: ${
												partyDetails[currentPartyId]?.status
										  }`}
								</Text>
							</View>
						)}
					</View>

					{/* RIGHT-SIDE ACTION BUTTONS */}
					<View style={styles.headerActions}>
						{/* 1. Invite / Regenerate */}
						{isHost && (
							<TouchableOpacity
								style={[
									styles.actionButton,
									isLoadingAction && styles.disabledButton,
								]}
								onPress={handleInviteAction}
								disabled={isLoadingAction}
							>
								{isLoadingAction ? (
									<ActivityIndicator size={24} color={colors.primary} />
								) : currentParty?.inviteCode ? (
									<Ionicons
										name="refresh-outline"
										size={26}
										color={colors.primary}
									/>
								) : (
									<Ionicons
										name="person-add"
										size={26}
										color={colors.primary}
									/>
								)}
							</TouchableOpacity>
						)}

						{/* 2. Activate Check-In */}
						{isHost && partyDetails[currentPartyId]?.status === "pending" && (
							<TouchableOpacity
								style={styles.actionButton}
								onPress={handleOpenPartyCheckInModal}
								disabled={isLoadingAction}
							>
								<MaterialCommunityIcons
									name="location-enter"
									size={26}
									color={isLoadingAction ? colors.textLight : colors.primary}
								/>
							</TouchableOpacity>
						)}

						{/* 3. Cancel Check-In Request */}
						{isHost &&
							partyDetails[currentPartyId]?.status === "AWAITING_TABLE" && (
								<TouchableOpacity
									style={styles.actionButton}
									onPress={handleCancelCheckInRequest}
									disabled={isLoadingAction}
								>
									<MaterialCommunityIcons
										name="close-circle-outline"
										size={26}
										color={
											isLoadingAction ? colors.textLight : colors.statusDanger
										}
									/>
								</TouchableOpacity>
							)}

						{/* 4. View Members */}
						<TouchableOpacity
							style={styles.actionButton}
							onPress={() => setIsMembersModalVisible(true)}
							disabled={isLoadingAction}
						>
							<Ionicons
								name="people-outline"
								size={28}
								color={isLoadingAction ? colors.textLight : colors.primary}
							/>
						</TouchableOpacity>

						{/* 5. Cancel Party (Host) or Leave Party (Guest) */}
						{isHost && partyDetails[currentPartyId]?.status === "pending" ? (
							<TouchableOpacity
								style={styles.actionButton}
								onPress={handleCancelParty}
								disabled={isLoadingAction}
							>
								<Ionicons
									name="close-circle"
									size={28}
									color={
										isLoadingAction ? colors.textLight : colors.statusDanger
									}
								/>
							</TouchableOpacity>
						) : (
							<TouchableOpacity
								style={styles.actionButton}
								onPress={handleLeavePartyAction}
								disabled={isLoadingAction}
							>
								<Ionicons
									name="exit-outline"
									size={28}
									color={
										isLoadingAction ? colors.textLight : colors.statusDanger
									}
								/>
							</TouchableOpacity>
						)}
					</View>
				</View>
				{currentParty?.inviteCode && (
					<TouchableOpacity
						onPress={() => setShowInviteCode((prev) => !prev)}
						style={styles.actionButton}
					>
						<Text style={styles.toggleText}>
							{showInviteCode ? t("hide_code") : t("show_invite_code")}
						</Text>
					</TouchableOpacity>
				)}

				{/* The display block remains the same */}
				{currentParty?.inviteCode && showInviteCode && (
					<View style={styles.inviteCodeBanner}>
						<Text style={styles.inviteLabel}>{t("invite_code")}</Text>
						<View style={styles.inviteCodeBox}>
							<Text style={styles.inviteCodeText}>
								{currentParty.inviteCode}
							</Text>
							<TouchableOpacity
								onPress={() => handleShareInvite(currentParty.inviteCode)}
							>
								<Ionicons
									name="share-social"
									size={28}
									color={colors.primary}
								/>
							</TouchableOpacity>
						</View>
						<Text style={styles.expiryText}>
							{t("expires_in")} {formatTimeLeft(currentParty.inviteCodeExpiry)}
						</Text>
					</View>
				)}
				<FlatList
					data={groupedBasket}
					keyExtractor={(group) => group.userId || group.userName}
					renderItem={({ item: group }) => (
						<View style={styles.userBasketSection}>
							<Text style={styles.userNameHeader}>{group.userName}</Text>
							{partyDetails[currentPartyId]?.guestPips?.find(
								(p) => p.userId === group.userId
							)?.paymentStatus === "paid" && (
								<View style={styles.paidBadge}>
									<Text style={styles.paidBadgeText}>{t("paid")}</Text>
								</View>
							)}
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
											key={basketItem.id || `basket-item-${index}`}
											item={basketItem}
											onQuantityChange={onItemQuantityChangeCallbackForParty}
											// --- CORRECTED isSentToKitchen LOGIC ---
											isSentToKitchen={basketItem.status === "sent"} // Check for 'sent' status
											allowEdit={
												basketItem.orderedByUserId === currentUserData.uid &&
												basketItem.status === "new" && // Only allow editing new items
												!userHasPaid
											}
											isUpdating={updatingItemId === basketItem.id} // For per-item loading
										/>
									);
								})
							) : (
								<Text style={styles.emptyUserBasketText}>
									{t("no_items_added_yet")}
								</Text>
							)}

							{/* "Send My New Items" button at the bottom of the current user's section */}
							{group.userId === currentUserData.uid && (
								<View style={styles.userActionContainer}>
									{/* Conditionally render "Send Items" button */}
									{group.items.some((i) => i.status === "new" || !i.status) && (
										<TouchableOpacity
											style={[
												styles.actionButton,
												styles.sendButton,
												!partyIsActive && styles.disabledButtonVisual,
											]}
											onPress={handleSendMyItems}
											disabled={!partyIsActive || isSendingItems}
										>
											{isSendingItems ? (
												<ActivityIndicator
													size="small"
													color={colors.textOnPrimaryBrand}
												/>
											) : (
												<Text style={styles.actionButtonText}>
													{t("send_my_new_items")}
												</Text>
											)}
										</TouchableOpacity>
									)}

									{/* Conditionally render "Checkout" button */}
									{canCurrentUserCheckout && (
										<TouchableOpacity
											style={[styles.actionButton, styles.checkoutButton]}
											onPress={handleGoToCheckout}
										>
											<MaterialCommunityIcons
												name="credit-card-check-outline"
												size={20}
												color={colors.surfaceWhite}
												style={{ marginRight: 8 }}
											/>
											<Text style={styles.actionButtonText}>
												{t("checkout_my_items")}
											</Text>
										</TouchableOpacity>
									)}
								</View>
							)}
						</View>
					)}
					ListEmptyComponent={<PartyBasketGuide isHost={isHost} />}
					contentContainerStyle={styles.flatListContentContainer}
				/>

				{/* Add My Items FAB: Available if party is pending, active, or awaiting table */}

				{!userHasPaid &&
					(partyIsPending ||
						partyIsActive ||
						partyDetails[currentPartyId]?.status === "AWAITING_TABLE") && (
						<TouchableOpacity
							style={styles.addItemFab}
							onPress={handleAddMyItems}
						>
							<Ionicons
								name="add"
								size={30}
								color={colors.textOnPrimaryBrand}
							/>
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
							<Text style={styles.modalTitle}>{t("party_members")}</Text>
							<FlatList
								data={partyDetails[currentPartyId]?.guestPips || []}
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
									{t("add_members_from_pips")}
								</Button>
							)}
							<TouchableOpacity
								style={styles.modalCloseButton}
								onPress={() => setIsMembersModalVisible(false)}
							>
								<Text style={styles.modalCloseButtonText}>{t("close")}</Text>
							</TouchableOpacity>
						</TouchableOpacity>
					</TouchableOpacity>
				</Modal>
				<AddMembersModal
					isVisible={isAddMembersModalVisible}
					onClose={() => setIsAddMembersModalVisible(false)}
					onConfirmAdd={handleAddMembersToParty}
					hostPips={hostPipsList}
					partyMembers={partyDetails[currentPartyId]?.guestPips || []}
					isLoading={isLoadingMembers}
					navigation={navigation}
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
							<Text style={styles.modalTitle}>{t("party_actions")}</Text>
							{isHost &&
								partyDetails[currentPartyId].status === "AWAITING_TABLE" && (
									<IconTextButton
										text={t("cancel_check_in_request")}
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
									text={t("invite_guests")}
									iconName="person-add-outline"
									onPress={handleInviteAction}
									style={styles.modalActionButton}
									textStyle={styles.modalActionButtonText}
									color={colors.primary}
								/>
							)}
							{isHost && partyIsPending && (
								<IconTextButton
									text={t("activate_party_check_in")}
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
									text={t("cancel_party")}
									iconName="close-circle-outline"
									iconSet="MaterialCommunityIcons"
									color={colors.statusDanger}
									onPress={handleCancelPartyAction}
									style={styles.modalActionButton}
									textStyle={styles.modalActionButtonText}
								/>
							) : (
								<IconTextButton
									text={t("leave_party")}
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
								<Text style={styles.modalCloseButtonText}>{t("close")}</Text>
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
			<Text style={styles.hubTitle}>{t("party_hub")}</Text>
			<Text style={styles.hubSubtitle}>
				{t(
					"join_an_existing_party_or_start_a_new_one_from_a_restaurants_page"
				)}
			</Text>

			{partyError && <Text style={styles.errorText}>{partyError}</Text>}
			{uiError && <Text style={styles.errorText}>{uiError}</Text>}

			<View style={styles.noPartyActionsContainer}>
				{/* Modified "Start a Party" guidance */}
				<IconTextButton
					iconSet="MaterialCommunityIcons"
					iconName="creation" // Changed icon to reflect guidance
					text={t("how_to_start_a_party")}
					onPress={handleStartNewPartyGuidance} // Calls the guidance alert
					style={styles.mainAction}
					iconSize={40}
					fontSize={16}
					color={colors.primary} // Use your primary color
				/>

				<Text style={styles.orText}>{t("or")}</Text>

				<View style={styles.joinPartyContainer}>
					<TextInput
						placeholder={t("enter_party_code")}
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
						text={t("join_party")}
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
	statusContainer: {
		// New container for status icon and text
		flexDirection: "row",
		alignItems: "center",
	},

	headerRestaurantName: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 2,
	},
	headerPartyStatus: { fontSize: 14, color: colors.textMedium },
	statusPending: { color: colors.statusWarning, fontWeight: "bold" },
	statusActive: { color: colors.statusSuccess, fontWeight: "bold" },

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
	paidBadge: {
		backgroundColor: colors.statusSuccess,
		borderRadius: 5,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	paidBadgeText: {
		color: colors.surfaceWhite,
		fontSize: 10,
		fontWeight: "bold",
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
	disabledButtonVisual: {
		opacity: 0.7,
		backgroundColor: colors.textMedium, // Example disabled color
	},
	sendAllUserItemsButton: {
		backgroundColor: colors.primary,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 15,
		flexDirection: "row",
		justifyContent: "center",
		marginHorizontal: 15,
		minHeight: 48, // Ensure consistent height when spinner is showing
	},
	sendAllUserItemsButtonText: {
		color: colors.textOnPrimaryBrand,
		fontSize: 16,
		fontWeight: "bold",
	},

	userActionContainer: {
		marginTop: 15,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		paddingTop: 15,
	},
	actionButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		borderRadius: 8,
		marginHorizontal: 15,
		marginBottom: 10, // Space between buttons if both are visible
	},
	sendButton: {
		backgroundColor: colors.primary,
	},
	checkoutButton: {
		backgroundColor: colors.statusSuccess, // Use a success/green color for checkout
	},
	headerActions: {
		flexDirection: "row",
		gap: 14,
		alignItems: "center",
	},
	actionButton: {
		padding: 8,
		borderRadius: 8,
	},
	disabledButton: {
		opacity: 0.5,
	},
	inviteCodeHeader: {
		marginTop: 12,
		alignItems: "center",
	},
	inviteCodeSection: {
		marginVertical: 20,
		alignItems: "center",
		width: "100%",
	},

	headerInfo: {
		flexShrink: 1,
		marginRight: 10,
		paddingRight: 20,
	},
	headerActions: {
		flexDirection: "row",
		gap: 16,
		alignItems: "center",
	},
	inviteCodeBanner: {
		backgroundColor: colors.surfaceWhite,
		paddingVertical: 24,
		paddingHorizontal: 20,
		alignItems: "center",
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	inviteLabel: {
		fontSize: 15,
		color: colors.textMedium,
		fontWeight: "600",
		marginBottom: 10,
	},
	inviteCodeBox: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.primary + "15",
		paddingHorizontal: 40,
		paddingVertical: 24,
		borderRadius: 24,
		borderWidth: 2,
		borderColor: colors.primary + "50",
		gap: 20,
		minWidth: 320,
	},
	inviteCodeText: {
		fontSize: 42,
		fontWeight: "900",
		letterSpacing: 10,
		color: colors.primary,
		includeFontPadding: false,
	},
	shareButton: {
		padding: 12,
		backgroundColor: colors.primary + "25",
		borderRadius: 50,
	},
	expiryText: {
		marginTop: 10,
		fontSize: 14,
		color: colors.textLight,
		fontStyle: "italic",
	},
	toggleText: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.primary,
		textDecorationLine: "underline",
	},
});

export default PartySessionScreen;
