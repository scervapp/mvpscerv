// screens/customer/PartySessionScreen.js
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
	TouchableOpacity,
	Alert,
	SafeAreaView,
	FlatList,
	Modal,
	Share,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";

import { db } from "../../config/firebase";
import OrderItemCard from "../../components/customer/OrderItemCard";
import PartyBasketGuide from "../../components/customer/Party/PartyBasketGuide";
import PipInvitationModal from "../../components/customer/Party/PipInvitationModal";
import AddMembersModal from "../../components/customer/Party/AddMembersModal";
import { collection, onSnapshot } from "@react-native-firebase/firestore";
import formatTimeLeft from "../../utils/formatTimeLeft";
import { getRestaurantExperienceConfig } from "../../utils/restaurantExperience";
import { handleCancelCheckIn } from "../../utils/customerUtils";

const DRINK_CATEGORIES = [
	"Beer",
	"Wine",
	"Cocktails",
	"Spirits",
	"Sodas",
	"Drinks",
	"Juices",
	"Non-Alcoholic Drinks",
	"Alcoholic Drinks",
	"Beverages",
];

const PartySessionScreen = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const {
		currentPartyIds,
		partyDetails,
		isLoadingParty,
		cancelPartyCheckIn,
		sharedBaskets,
		joinParty,
		leaveParty,
		cancelParty,
		activatePartyCheckIn,
		addLocalPIPToParty,
		inviteToParty,
		sendMyItemsToKitchen,
		handlePartyItemQuantityChange,
	} = useParty();

	const route = useRoute();
	const { partyId } = route.params;
	const currentPartyId = route.params?.partyId || null;

	const [uiLoading, setUiLoading] = useState(false);
	const [isMembersModalVisible, setIsMembersModalVisible] = useState(false);
	const [isPipInviteModalVisible, setIsPipInviteModalVisible] = useState(false);
	const [isAddMembersModalVisible, setIsAddMembersModalVisible] =
		useState(false);
	const [userPips, setUserPips] = useState([]);
	const [hostPipsList, setHostPipsList] = useState([]);
	const [updatingItemId, setUpdatingItemId] = useState(null);
	const [isProcessingPartyCheckIn, setIsProcessingPartyCheckIn] =
		useState(false);
	const [isLoadingMembers, setIsLoadingMembers] = useState(false);
	const [isSendingItems, setIsSendingItems] = useState(false);
	const [lastServiceRequest, setLastServiceRequest] = useState(0);
	const [restaurantData, setRestaurantData] = useState(null);

	// UI Upgrades State
	const [showInviteCode, setShowInviteCode] = useState(false);
	const [localInviteCode, setLocalInviteCode] = useState(null);

	const currentParty = partyDetails[currentPartyId];
	const isHost = currentParty
		? currentParty.hostUserId === currentUserData?.uid
		: false;
	const displayInviteCode = currentParty?.inviteCode || localInviteCode;
	const displayInviteExpiry = currentParty?.inviteCodeExpiry || null;
	const restaurantConfig = useMemo(
		() => getRestaurantExperienceConfig(restaurantData || currentParty || {}),
		[restaurantData, currentParty],
	);
	const hasRestaurantFeatureConfig = Boolean(
		restaurantData ||
			currentParty?.features ||
			typeof currentParty?.qrSelfCheckIn === "boolean" ||
			typeof currentParty?.["features.qrSelfCheckIn"] === "boolean",
	);
	const hostCheckInEnabled =
		hasRestaurantFeatureConfig &&
		restaurantConfig.features.hostCheckInRequests === true;
	const qrSelfCheckInEnabled =
		hasRestaurantFeatureConfig &&
		restaurantConfig.features.qrSelfCheckIn === true;
	const pendingHostCheckInRequest = useMemo(() => {
		const activeCheckIn = currentUserData?.activeCheckIn || null;
		const activeStatus = String(activeCheckIn?.status || "").toUpperCase();
		const partyStatus = String(currentParty?.status || "").toUpperCase();

		return (
			(currentParty?.activeCheckInId && partyStatus === "AWAITING_TABLE") ||
			(activeCheckIn?.restaurantId === currentParty?.restaurantId &&
				["REQUESTED", "ACCEPTED"].includes(activeStatus))
		);
	}, [
		currentParty?.activeCheckInId,
		currentParty?.restaurantId,
		currentParty?.status,
		currentUserData?.activeCheckIn,
	]);

	useEffect(() => {
		const restaurantId = currentParty?.restaurantId;
		if (!restaurantId) {
			setRestaurantData(null);
			return undefined;
		}

		const unsubscribe = db
			.collection("restaurants")
			.doc(restaurantId)
			.onSnapshot(
				(docSnap) => {
					setRestaurantData(
						docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null,
					);
				},
				(error) => {
					console.error("Error loading party restaurant settings:", error);
					setRestaurantData(null);
				},
			);

		return () => unsubscribe();
	}, [currentParty?.restaurantId]);

	// --- Virtual Service Bell Action ---
	const handleCallServer = async () => {
		const now = Date.now();
		const cooldownMs = 60000;

		if (now - lastServiceRequest < cooldownMs) {
			Alert.alert(
				t("please_wait", "Please Wait"),
				t(
					"staff_already_notified",
					"We've already notified the staff. Someone will be right with you!",
				),
			);
			return;
		}

		if (!currentPartyId) return;

		try {
			await db
				.collection("parties")
				.doc(currentPartyId)
				.update({
					serviceRequested: true,
					serviceRequestType: "service",
					serviceRequestStatus: "new",
					serviceRequestedAt: new Date().toISOString(),
					serviceTableName: currentParty?.table?.name || "A table",
				});

			setLastServiceRequest(now);

			Alert.alert(
				t("service_requested", "Service Requested"),
				t(
					"a_staff_member_will_be_with_you_shortly",
					"A staff member has been alerted and will be with you shortly.",
				),
			);
		} catch (error) {
			console.error("Error requesting service:", error);
			Alert.alert(
				t("error", "Error"),
				t(
					"could_not_request_service",
					"Could not request service. Please try waving down a staff member.",
				),
			);
		}
	};

	useEffect(() => {
		let timeoutId;
		if (currentPartyId && !partyDetails[currentPartyId] && !isLoadingParty) {
			timeoutId = setTimeout(() => {
				if (!partyDetails[currentPartyId]) {
					console.log(
						"Party not found in state after wait. Replacing with PartyHub.",
					);
					navigation.replace("PartyHub");
				}
			}, 3000);
		}
		return () => {
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, [currentPartyId, partyDetails, isLoadingParty, navigation]);

	// Data fetching for PIPS
	useEffect(() => {
		if (currentUserData?.uid && currentUserData.role !== "guest") {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			const unsubscribe = onSnapshot(pipsRef, (snapshot) => {
				setUserPips(
					snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
				);
			});
			return () => unsubscribe();
		} else {
			setUserPips([]);
		}
	}, [currentUserData?.uid]);

	const myPartyStatus = useMemo(() => {
		if (
			!currentPartyId ||
			!partyDetails ||
			!partyDetails[currentPartyId] ||
			!currentUserData?.uid
		)
			return null;
		const party = partyDetails[currentPartyId];
		return party.guestPips?.find((p) => p.userId === currentUserData.uid);
	}, [currentPartyId, partyDetails, currentUserData?.uid]);

	// --- 🚨 NEW: Smart Leave Party Wrapper ---
	const handleLeavePartyPress = () => {
		// Prevent dine-and-dash by blocking exit if they have items in cart
		if (userHasKitchenItems && !userHasPaid) {
			Alert.alert(
				t("cannot_leave", "Cannot Leave"),
				t(
					"cannot_leave_with_items",
					"You have items that were sent to the kitchen. Please pay for your ordered items before leaving the party.",
				),
			);
			return;
		}

		handleLeaveParty();
	};

	const handleLeaveParty = async () => {
		Alert.alert(
			t("leave_party", "Leave Party"),
			t(
				"are_you_sure_you_want_to_leave_this_party",
				"Are you sure you want to leave this party?",
			),
			[
				{ text: t("cancel", "Cancel"), style: "cancel" },
				{
					text: t("leave", "Leave"),
					style: "destructive",
					onPress: async () => {
						setUiLoading(true);
						try {
							// 🚨 THE FIX: Pass the currentPartyId here!
							const success = await leaveParty(currentPartyId);
							if (success) {
								navigation.goBack();
							}
						} catch (e) {
							Alert.alert(
								t("error", "Error"),
								t("could_not_leave_party", "Could not leave party."),
							);
						} finally {
							setUiLoading(false);
						}
					},
				},
			],
		);
	};

	const handleCancelHostCheckInRequest = useCallback(() => {
		if (
			!pendingHostCheckInRequest ||
			!currentParty?.restaurantId ||
			!currentUserData?.uid
		) {
			return;
		}

		Alert.alert(
			t("cancel_check_in_request", "Cancel Check-In Request"),
			t(
				"cancel_check_in_request_confirm",
				"Cancel the request you sent to the host?",
			),
			[
				{ text: t("keep_request", "Keep Request"), style: "cancel" },
				{
					text: t("cancel_request", "Cancel Request"),
					style: "destructive",
					onPress: async () => {
						setIsProcessingPartyCheckIn(true);
						try {
							if (
								currentParty?.status === "AWAITING_TABLE" &&
								currentParty?.activeCheckInId
							) {
								await cancelPartyCheckIn(
									currentPartyId,
									currentParty.activeCheckInId,
								);
							} else {
								await handleCancelCheckIn(
									currentParty.restaurantId,
									currentUserData.uid,
								);
							}
						} finally {
							setIsProcessingPartyCheckIn(false);
						}
					},
				},
			],
		);
	}, [
		currentParty?.restaurantId,
		currentParty?.status,
		currentParty?.activeCheckInId,
		currentPartyId,
		currentUserData?.uid,
		cancelPartyCheckIn,
		pendingHostCheckInRequest,
		t,
	]);

	const handleShareInvite = async (codeOverride = null) => {
		if (!currentPartyId) return;

		let code = codeOverride || currentParty?.inviteCode;

		if (!code && isHost) {
			code = await inviteToParty(currentPartyId);
			if (code) {
				setLocalInviteCode(code);
			}
		}

		if (!code) {
			Alert.alert(
				t("invite_unavailable", "Invite Unavailable"),
				t("could_not_generate_invite", "Could not generate an invite code."),
			);
			return;
		}

		const restaurantName =
			partyDetails[currentPartyId]?.restaurantName ||
			t("a_restaurant", "a restaurant");
		const message = `${t("join_my_party_at", "Join my party at")} ${restaurantName} ${t("on_scerv", "on Scerv")}!\n\n${t("invite_code", "Invite Code")}: ${code}\n\n${t("iphone_users_download_here", "iPhone Users download here")}:\nhttps://apps.apple.com/app/id1591335061\n\n${t("android_users_download_here", "Android Users download here")}:\nhttps://play.google.com/store/apps/details?id=com.scerv.eat`;
		try {
			await Share.share({ message });
		} catch (error) {
			Alert.alert(
				t("share_failed", "Share Failed"),
				t("could_not_share_invite", "Could not share invite."),
			);
		}
	};

	const handleInvitePip = () => {
		if (!isHost) return;
		setIsPipInviteModalVisible(true);
	};

	const sendInviteToUserPIP = async (pipUserId, pipName) => {
		if (!currentPartyId || !pipUserId) return;
		setUiLoading(true);
		try {
			const result = await inviteToParty(currentPartyId, {
				inviteeUserId: pipUserId,
				returnFullResult: true,
			});
			if (result?.inviteCode) {
				Alert.alert(
					t("success", "Success"),
					`${t("invite_sent_to", "Invite sent to")} ${pipName}!`,
				);
				setIsPipInviteModalVisible(false);
			}
		} finally {
			setUiLoading(false);
		}
	};

	const handleShowInviteCode = async () => {
		if (!currentPartyId) return;

		if (displayInviteCode) {
			setShowInviteCode((visible) => !visible);
			return;
		}

		if (!isHost) return;

		setUiLoading(true);
		try {
			const code = await inviteToParty(currentPartyId);
			if (code) {
				setLocalInviteCode(code);
				setShowInviteCode(true);
			}
		} finally {
			setUiLoading(false);
		}
	};

	const addLocalPIP = async (localPIPId, localPIPName) => {
		const pipsToAdd = Array.isArray(localPIPId)
			? localPIPId
			: [{ id: localPIPId, name: localPIPName }];
		const validPipsToAdd = pipsToAdd.filter((pip) => pip?.id && pip?.name);

		if (!currentPartyId || validPipsToAdd.length === 0) return;
		setUiLoading(true);
		try {
			const success = await addLocalPIPToParty(currentPartyId, validPipsToAdd);
			if (success) {
				setIsPipInviteModalVisible(false);
				setIsAddMembersModalVisible(false);
			}
		} finally {
			setUiLoading(false);
		}
	};

	const onItemQuantityChangeCallbackForParty = useCallback(
		async (itemId, newQuantity) => {
			const partyIdToUse = partyDetails[partyId]?.id;
			if (!partyIdToUse || !currentUserData?.uid) return;
			setUpdatingItemId(itemId);
			try {
				await handlePartyItemQuantityChange(
					partyIdToUse,
					itemId,
					newQuantity,
					currentUserData.uid,
				);
			} catch (error) {
				console.error("Item Update Error", error);
			} finally {
				setUpdatingItemId(null);
			}
		},
		[
			partyDetails,
			partyId,
			currentUserData?.uid,
			handlePartyItemQuantityChange,
		],
	);

	const handleAddMyItems = () => {
		if (myPartyStatus?.paymentStatus === "paid") {
			Alert.alert(
				t("already_paid", "Already Paid"),
				t(
					"you_have_already_paid_your_portion_of_the_bill_and_cannot_add_more_items",
					"You have already paid your portion of the bill and cannot add more items.",
				),
			);
			return;
		}
		navigation.navigate("PartyMenu", {
			partyId: currentPartyId,
			restaurantId: partyDetails[currentPartyId]?.restaurantId,
			userId: currentUserData.uid,
		});
	};

	const groupedBasket = useMemo(() => {
		if (!sharedBaskets || !currentPartyId || !partyDetails[currentPartyId])
			return [];

		const rawBasket = sharedBaskets[currentPartyId] || {};
		const items = rawBasket.items || [];

		if (!items || items.length === 0) return [];

		const groups = {};
		items.forEach((item) => {
			const targetName =
				item.orderedByPipName ||
				item.pipName ||
				item.customerName ||
				(item.orderedByUserId === currentUserData?.uid
					? currentUserData?.firstName
					: null) ||
				t("guest", "Guest");

			const currentUserNames = [
				currentUserData?.fullName,
				currentUserData?.firstName,
				"Myself",
				t("myself", "Myself"),
			]
				.filter(Boolean)
				.map((name) => String(name).trim().toLowerCase());
			const normalizedTargetName = String(targetName).trim().toLowerCase();

			const isCurrentUserTarget =
				item.orderedByUserId === currentUserData?.uid &&
				currentUserNames.includes(normalizedTargetName);

			const groupKey = isCurrentUserTarget
				? currentUserData.uid
				: `target:${normalizedTargetName}`;

			if (!groups[groupKey]) {
				groups[groupKey] = {
					userId: groupKey,
					userName: isCurrentUserTarget
						? currentUserData?.firstName
							? `${currentUserData.firstName} (${t("you", "You")})`
							: t("your_items", "Your Items")
						: targetName,
					isCurrentUserTarget,
					items: [],
				};
			}
			groups[groupKey].items.push(item);
		});

		const currentUserGroupKey = currentUserData?.uid;
		const currentUserGroup = groups[currentUserGroupKey];
		if (currentUserGroupKey) delete groups[currentUserGroupKey];

		return currentUserGroup
			? [currentUserGroup, ...Object.values(groups)]
			: Object.values(groups);
	}, [sharedBaskets, currentPartyId, currentUserData, partyDetails, t]);

	const myItems = useMemo(() => {
		const rawBasket = sharedBaskets?.[currentPartyId] || {};
		const items = rawBasket.items || [];
		return items.filter((item) => item.orderedByUserId === currentUserData?.uid);
	}, [sharedBaskets, currentPartyId, currentUserData?.uid]);

	const userHasPaid = myPartyStatus?.paymentStatus === "paid";
	const userHasKitchenItems = useMemo(() => {
		return myItems.some((item) =>
			["sent", "processing", "completed"].includes(item.status),
		);
	}, [myItems]);

	const hasUnsentItems = useMemo(() => {
		return (
			myItems?.some((item) => item.status === "new" || !item.status) || false
		);
	}, [myItems]);

	const canCheckout = useMemo(() => {
		return myItems?.length > 0 && !hasUnsentItems && !userHasPaid;
	}, [myItems, hasUnsentItems, userHasPaid]);

	const getItemLiveStatus = (item) => {
		if (item.status === "new" || !item.status) {
			return null;
		}

		if (!item.ticketId) {
			return item.status;
		}

		const rawBasketData = sharedBaskets[currentPartyId] || {};
		const ticketStatuses = rawBasketData.ticketStatuses || {};
		const basketItems = Array.isArray(rawBasketData.items)
			? rawBasketData.items
			: [];

		const ticketInfo = ticketStatuses[item.ticketId];

		const category = item.category || "Other";
		const destination = DRINK_CATEGORIES.includes(category) ? "bar" : "kitchen";
		const itemStationStatus = item.stationStatuses?.[destination];

		if (itemStationStatus) {
			return itemStationStatus === "new" ? "sent" : itemStationStatus;
		}

		const hasItemLevelStatusForTicket = basketItems.some(
			(basketItem) =>
				basketItem.ticketId === item.ticketId &&
				basketItem.stationStatuses?.[destination],
		);

		if (hasItemLevelStatusForTicket) {
			return item.status;
		}

		if (!ticketInfo) {
			return item.status;
		}

		const liveStatus = ticketInfo[destination];

		if (liveStatus === "new") {
			return "sent";
		}

		const finalStatus = liveStatus || item.status;

		return finalStatus;
	};

	const handleSendMyItems = () => {
		if (!sendMyItemsToKitchen || !currentPartyId) return;

		setIsSendingItems(true);
		sendMyItemsToKitchen(currentPartyId)
			.catch((e) => console.error(e))
			.finally(() => setIsSendingItems(false));
	};

	const handleGoToCheckout = () => {
		navigation.navigate("PartyCheckout", { partyId: currentPartyId });
	};

	// --- RENDERS ---

	if (isLoadingParty || !currentPartyId || !partyDetails[currentPartyId]) {
		return (
			<SafeAreaView
				style={[
					styles.centeredScreen,
					{ backgroundColor: colors.backgroundLight },
				]}
			>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.statusText}>
					{t("loading_your_party_details", "Loading your party details")}...
				</Text>
			</SafeAreaView>
		);
	}

	const getInitials = (name) => {
		if (!name) return "GU";
		const parts = name.split(" ");
		if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
		return name.substring(0, 2).toUpperCase();
	};

	const partyIsPending = ["pending", "AWAITING_TABLE"].includes(
		currentParty.status,
	);
	const partyIsActive = currentParty.status === "active";
	const isMultiplayer = groupedBasket.length > 1;

	return (
		<SafeAreaView style={styles.screen}>
			{/* STICKY TOP HEADER */}
			<View style={styles.headerBar}>
				<View style={styles.headerInfo}>
					<Text style={styles.headerRestaurantName} numberOfLines={1}>
						{currentParty?.restaurantName}
					</Text>
					{partyIsActive && currentParty?.table?.name ? (
						<View style={styles.statusContainer}>
							<Ionicons
								name="checkmark-circle"
								size={16}
								color={colors.statusSuccess}
							/>
							<Text style={[styles.headerPartyStatus, styles.statusActive]}>
								{t("seated_at", "Seated at")} {currentParty.table.name}
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
								{currentParty?.status === "AWAITING_TABLE"
									? t("waiting_for_table", "Waiting for table")
									: `${t("status", "Status")}: ${currentParty?.status}`}
							</Text>
						</View>
					)}
				</View>

				{/* HEADER ACTIONS */}
				<View style={styles.headerActionsRow}>
					<TouchableOpacity
						style={styles.headerIconButton}
						onPress={handleCallServer}
					>
						<Ionicons
							name="notifications-outline"
							size={26}
							color={colors.textDark}
						/>
					</TouchableOpacity>

					{isHost && (
						<TouchableOpacity
							style={styles.headerIconButton}
							onPress={handleInvitePip}
						>
							<Ionicons
								name="person-add-outline"
								size={26}
								color={colors.primary}
							/>
						</TouchableOpacity>
					)}

					{isHost && (
						<TouchableOpacity
							style={styles.headerIconButton}
							onPress={handleShowInviteCode}
							disabled={uiLoading}
						>
							<Ionicons
								name="qr-code-outline"
								size={26}
								color={colors.primary}
							/>
						</TouchableOpacity>
					)}

					<TouchableOpacity
						style={styles.headerIconButton}
						onPress={() => setIsMembersModalVisible(true)}
					>
						<Ionicons name="people-outline" size={28} color={colors.textDark} />
					</TouchableOpacity>

					{/* 🚨 NEW: LEAVE PARTY BUTTON IN HEADER */}
					<TouchableOpacity
						style={styles.headerIconButton}
						onPress={handleLeavePartyPress}
					>
						<Ionicons
							name="exit-outline"
							size={28}
							color={colors.statusDanger}
						/>
					</TouchableOpacity>
				</View>
			</View>

			{/* EXPANDABLE SMART INVITE BANNER */}
			{displayInviteCode && showInviteCode && (
				<View style={styles.inviteCodeBanner}>
					<Text style={styles.inviteLabel}>
						{t("invite_code", "Invite Code")}
					</Text>
					<View style={styles.inviteCodeBox}>
						<Text style={styles.inviteCodeText}>{displayInviteCode}</Text>
						<TouchableOpacity
							onPress={() => handleShareInvite(displayInviteCode)}
						>
							<Ionicons name="share-social" size={28} color={colors.primary} />
						</TouchableOpacity>
					</View>
					{displayInviteExpiry && (
						<Text style={styles.expiryText}>
							{t("expires_in", "Expires in")}{" "}
							{formatTimeLeft(displayInviteExpiry)}
						</Text>
					)}
				</View>
			)}

			{currentParty?.reservationId ? (
				<View style={styles.reservationBanner}>
					<View style={styles.reservationIcon}>
						<Ionicons name="calendar-outline" size={18} color={colors.primary} />
					</View>
					<View style={styles.reservationTextWrap}>
						<Text style={styles.reservationTitle}>Reservation party</Text>
						<Text style={styles.reservationMeta} numberOfLines={2}>
							{currentParty.reservationDate || "Reservation date"}
							{currentParty.reservationTime
								? ` at ${currentParty.reservationTime}`
								: ""}
							{" - "}
							Party of {currentParty.reservationPartySize || 1}
						</Text>
					</View>
				</View>
			) : null}

			{/* BASKET LIST */}
			<FlatList
				data={groupedBasket}
				extraData={sharedBaskets}
				keyExtractor={(group) => group.userId || group.userName}
				contentContainerStyle={styles.flatListContentContainer}
				ListEmptyComponent={<PartyBasketGuide isHost={isHost} />}
				renderItem={({ item: group, index }) => {
					const isMyGroup = group.isCurrentUserTarget;
					// Highlight the current user's basket with your primary color, guests get a neutral/secondary color
					const accentColor = isMyGroup ? colors.primary : colors.textMedium;

					return (
						<View
							style={[
								styles.userBasketSection,
								{ borderLeftColor: accentColor },
							]}
						>
							<View style={styles.chameleonHeader}>
								<View style={styles.userInfoWrapper}>
									{/* New Avatar Icon */}
									<View
										style={[
											styles.avatarCircle,
											{ backgroundColor: accentColor + "20" },
										]}
									>
										<Text style={[styles.avatarText, { color: accentColor }]}>
											{getInitials(group.userName)}
										</Text>
									</View>
									<Text style={styles.userNameHeader}>{group.userName}</Text>
								</View>

								{currentParty?.guestPips?.find(
									(p) =>
										p.userId === group.userId ||
										String(p.name).trim().toLowerCase() ===
											String(group.userName).trim().toLowerCase(),
								)?.paymentStatus === "paid" && (
									<View style={styles.paidBadge}>
										<Text style={styles.paidBadgeText}>
											{t("paid", "Paid")}
										</Text>
									</View>
								)}
							</View>

							{group.items.length > 0 ? (
								<View style={styles.itemsWrapper}>
									{group.items.map((basketItem, itemIndex) => {
										const isLastItem = itemIndex === group.items.length - 1;
										const canEditItem =
											basketItem.orderedByUserId === currentUserData?.uid &&
											(basketItem.status === "new" || !basketItem.status) &&
											!userHasPaid;

										return (
											<View
												key={basketItem.id || `basket-item-${itemIndex}`}
												style={[
													styles.itemContainer,
													!isLastItem && styles.itemSeparator,
												]}
											>
												<OrderItemCard
													item={{
														...basketItem,
														status:
															getItemLiveStatus(basketItem) ||
															basketItem.status,
													}}
													onQuantityChange={
														onItemQuantityChangeCallbackForParty
													}
													variant="compact"
													hideOrderedFor
													liveTrackerStatus={getItemLiveStatus(basketItem)}
													isSentToKitchen={
														getItemLiveStatus(basketItem) !== "new" &&
														getItemLiveStatus(basketItem) !== null
													}
													allowEdit={canEditItem}
													isUpdating={updatingItemId === basketItem.id}
												/>
											</View>
										);
									})}
								</View>
							) : (
								<Text style={styles.emptyUserBasketText}>
									{t("no_items_added_yet", "No items added yet.")}
								</Text>
							)}
						</View>
					);
				}}
			/>

			{/* UI UPGRADE: THE STICKY BOTTOM ACTION BAR */}
			{(partyIsActive || partyIsPending) && (
				<View style={styles.stickyBottomBar}>
					{/* 1. THE PRE-BUILD STATE: User has a cart, but no table! */}
					{partyIsPending && (
						<View style={styles.pendingActionStack}>
							{/* Keep pre-ordering available while the host request is pending. */}
							<TouchableOpacity
								style={styles.pendingWideSecondaryBtn}
								onPress={handleAddMyItems}
							>
								<Text style={styles.pendingWideSecondaryText}>
									+ {t("add_more", "Add More")}
								</Text>
							</TouchableOpacity>

							{(qrSelfCheckInEnabled ||
								hostCheckInEnabled ||
								pendingHostCheckInRequest) && (
							<View style={styles.pendingPrimaryRow}>
								{qrSelfCheckInEnabled ? (
									<TouchableOpacity
										disabled={
											pendingHostCheckInRequest || isProcessingPartyCheckIn
										}
										style={[
											styles.pendingPrimaryBtn,
											{
												backgroundColor: pendingHostCheckInRequest
													? colors.textLight
													: colors.primary,
											},
											(pendingHostCheckInRequest ||
												isProcessingPartyCheckIn) &&
												styles.pendingPrimaryBtnDisabled,
										]}
										onPress={() =>
											navigation.navigate("QRScannerScreen", {
												restaurantId: currentParty?.restaurantId,
												partyId: currentPartyId,
											})
										}
									>
										<MaterialCommunityIcons
											name="qrcode-scan"
											size={18}
											color={colors.surfaceWhite}
											style={{ marginRight: 7 }}
										/>
										<Text style={styles.pendingPrimaryText}>
											{t("scan_table", "Scan Table")}
										</Text>
									</TouchableOpacity>
								) : null}

								{(hostCheckInEnabled || pendingHostCheckInRequest) && (
									<TouchableOpacity
										disabled={isProcessingPartyCheckIn}
										style={[
											styles.pendingPrimaryBtn,
											{
												backgroundColor: pendingHostCheckInRequest
													? colors.statusDanger
													: colors.brandOrange,
											},
											isProcessingPartyCheckIn &&
												styles.pendingPrimaryBtnDisabled,
										]}
										onPress={
											pendingHostCheckInRequest
												? handleCancelHostCheckInRequest
												: () =>
														navigation.navigate("HostCheckInRequest", {
															restaurant: restaurantData || {
																id: currentParty?.restaurantId,
																restaurantName:
																	currentParty?.restaurantName,
															},
														})
										}
									>
										<Ionicons
											name={
												pendingHostCheckInRequest
													? "close-circle-outline"
													: "person-add-outline"
											}
											size={18}
											color={colors.surfaceWhite}
											style={{ marginRight: 7 }}
										/>
										<Text style={styles.pendingPrimaryText}>
											{pendingHostCheckInRequest
												? t(
														"cancel_check_in_request",
														"Cancel Check-In Request",
													)
												: t("request_check_in", "Request Check-In")}
										</Text>
									</TouchableOpacity>
								)}
							</View>
							)}
						</View>
					)}

					{/* 2. THE ACTIVE STATE: Checked in and seated */}
					{partyIsActive && (
						<>
							{/* 🚨 NEW: Split row for Empty Cart */}
							{myItems.length === 0 && !userHasPaid && (
								<View style={styles.stickySplitRow}>
									<TouchableOpacity
										style={styles.stickySecondaryBtn}
										onPress={handleLeavePartyPress}
									>
										<Text
											style={[
												styles.stickySecondaryBtnText,
												{ color: colors.statusDanger },
											]}
										>
											{t("leave_party", "Leave Party")}
										</Text>
									</TouchableOpacity>

									<TouchableOpacity
										style={[
											styles.stickyPrimaryBtn,
											{ flex: 2, backgroundColor: colors.primary },
										]}
										onPress={handleAddMyItems}
									>
										<Ionicons
											name="restaurant-outline"
											size={20}
											color={colors.surfaceWhite}
											style={{ marginRight: 8 }}
										/>
										<Text style={styles.stickyPrimaryBtnText}>
											{t("browse_menu", "Browse Menu")}
										</Text>
									</TouchableOpacity>
								</View>
							)}

							{/* If user has un-sent items */}
							{myItems.length > 0 && hasUnsentItems && !userHasPaid && (
								<View>
									{/* INLINE DISCLAIMER */}
									<Text style={styles.inlineDisclaimerText}>
										{t(
											"kitchen_commitment_disclaimer",
											"Items sent to the kitchen are final and will be added to your bill.",
										)}
									</Text>

									<View style={styles.stickySplitRow}>
										<TouchableOpacity
											style={styles.stickySecondaryBtn}
											onPress={handleAddMyItems}
										>
											<Text style={styles.stickySecondaryBtnText}>
												+ {t("add_more", "Add More")}
											</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={[
												styles.stickyPrimaryBtn,
												{
													flex: 2,
													backgroundColor: colors.brandOrange || colors.primary,
												},
											]}
											onPress={handleSendMyItems}
											disabled={isSendingItems}
										>
											{isSendingItems ? (
												<ActivityIndicator
													size="small"
													color={colors.surfaceWhite}
												/>
											) : (
												<Text style={styles.stickyPrimaryBtnText}>
													{t("send_to_kitchen", "Send to Kitchen")}
												</Text>
											)}
										</TouchableOpacity>
									</View>
								</View>
							)}

							{/* If all items are sent and ready to checkout */}
							{canCheckout && (
								<View style={styles.stickySplitRow}>
									<TouchableOpacity
										style={styles.stickySecondaryBtn}
										onPress={handleAddMyItems}
									>
										<Text style={styles.stickySecondaryBtnText}>
											+ {t("order_more", "Order More")}
										</Text>
									</TouchableOpacity>
									<TouchableOpacity
										style={[
											styles.stickyPrimaryBtn,
											{ flex: 2, backgroundColor: colors.statusSuccess },
										]}
										onPress={handleGoToCheckout}
									>
										<MaterialCommunityIcons
											name="credit-card-check-outline"
											size={20}
											color={colors.surfaceWhite}
											style={{ marginRight: 8 }}
										/>
										<Text style={styles.stickyPrimaryBtnText}>
											{t("pay_my_bill", "Pay My Bill")}
										</Text>
									</TouchableOpacity>
								</View>
							)}

							{/* If user has fully paid */}
							{userHasPaid && (
								<View
									style={[
										styles.stickyPrimaryBtn,
										{ backgroundColor: colors.textMedium },
									]}
								>
									<Ionicons
										name="checkmark-done"
										size={20}
										color={colors.surfaceWhite}
										style={{ marginRight: 8 }}
									/>
									<Text style={styles.stickyPrimaryBtnText}>
										{t("order_complete", "Order Complete")}
									</Text>
								</View>
							)}
						</>
					)}
				</View>
			)}

			{/* Modals remain structurally identical */}
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
						<Text style={styles.modalTitle}>
							{t("party_members", "Party Members")}
						</Text>
						<FlatList
							data={currentParty?.guestPips || []}
							keyExtractor={(pip) => pip.userId || pip.localPipId}
							renderItem={({ item }) => {
								const isUserTheHost = item.userId === currentParty?.hostUserId;
								return (
									<View style={styles.memberItemContainer}>
										<Ionicons
											name={
												isUserTheHost
													? "person-circle"
													: "person-circle-outline"
											}
											size={28}
											color={isUserTheHost ? colors.primary : colors.textMedium}
										/>
										<Text style={styles.memberItemText}>{item.name}</Text>
										{isUserTheHost && (
											<Text style={styles.hostLabel}>
												({t("host", "Host")})
											</Text>
										)}
									</View>
								);
							}}
						/>
						<TouchableOpacity
							style={styles.modalCloseButton}
							onPress={() => setIsMembersModalVisible(false)}
						>
							<Text style={styles.modalCloseButtonText}>
								{t("close", "Close")}
							</Text>
						</TouchableOpacity>
					</TouchableOpacity>
				</TouchableOpacity>
			</Modal>

			<PipInvitationModal
				isVisible={isPipInviteModalVisible}
				onClose={() => setIsPipInviteModalVisible(false)}
				pips={userPips}
				isLoadingPips={isLoadingMembers}
				partyDetails={currentParty || {}}
				isActionLoading={uiLoading}
				onSelectUserPip={sendInviteToUserPIP}
				onSelectLocalPip={addLocalPIP}
				onAddLocalMembers={() => {
					setIsPipInviteModalVisible(false);
					setIsAddMembersModalVisible(true);
				}}
				onManagePips={() => {
					setIsPipInviteModalVisible(false);
					const rootNavigation = navigation.getParent() || navigation;
					rootNavigation.navigate("AccountScreen", {
						screen: "PipsScreenInner",
					});
				}}
			/>
			<AddMembersModal
				isVisible={isAddMembersModalVisible}
				onClose={() => setIsAddMembersModalVisible(false)}
				onConfirmAdd={addLocalPIP}
				hostPips={userPips.filter((pip) => !pip.isUser)}
				partyMembers={currentParty?.guestPips || []}
				isLoading={uiLoading}
				navigation={navigation}
			/>
		</SafeAreaView>
	);
};

// --- Styles ---
const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.backgroundLight },
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	statusText: { marginTop: 15, fontSize: 16, color: colors.textDark },

	flatListContentContainer: { paddingBottom: 120, paddingTop: 10 },

	headerBar: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 12,
		paddingHorizontal: 15,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	headerInfo: { flexShrink: 1, marginRight: 10 },
	headerRestaurantName: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 2,
	},
	statusContainer: { flexDirection: "row", alignItems: "center", marginTop: 2 },
	headerPartyStatus: { fontSize: 14, marginLeft: 4 },
	statusPending: { color: colors.statusWarning, fontWeight: "bold" },
	statusActive: { color: colors.statusSuccess, fontWeight: "bold" },

	headerActionsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	headerIconButton: {
		padding: 6,
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
	},

	inviteCodeBanner: {
		backgroundColor: colors.surfaceWhite,
		paddingVertical: 20,
		paddingHorizontal: 20,
		alignItems: "center",
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	inviteLabel: {
		fontSize: 14,
		color: colors.textMedium,
		fontWeight: "600",
		marginBottom: 10,
	},
	inviteCodeBox: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.primary + "15",
		paddingHorizontal: 30,
		paddingVertical: 15,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: colors.primary + "50",
		gap: 15,
	},
	inviteCodeText: {
		fontSize: 32,
		fontWeight: "900",
		letterSpacing: 8,
		color: colors.primary,
	},
	expiryText: {
		marginTop: 10,
		fontSize: 13,
		color: colors.textLight,
		fontStyle: "italic",
	},
	reservationBanner: {
		flexDirection: "row",
		alignItems: "center",
		marginHorizontal: 15,
		marginTop: 12,
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.primary + "30",
		backgroundColor: colors.surfaceWhite,
	},
	reservationIcon: {
		width: 36,
		height: 36,
		borderRadius: 8,
		backgroundColor: colors.primary + "12",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	reservationTextWrap: {
		flex: 1,
		minWidth: 0,
	},
	reservationTitle: {
		color: colors.textDark,
		fontSize: 13,
		fontWeight: "900",
	},
	reservationMeta: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "700",
		marginTop: 2,
	},

	// --- GROUPED BASKET VISUAL STYLES ---
	userBasketSection: {
		marginVertical: 10,
		marginHorizontal: 15,
		paddingTop: 12,
		paddingBottom: 4,
		paddingHorizontal: 12,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 14,
		borderLeftWidth: 6,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 3,
	},
	chameleonHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	userInfoWrapper: {
		flexDirection: "row",
		alignItems: "center",
	},
	avatarCircle: {
		width: 32,
		height: 32,
		borderRadius: 16,
		justifyContent: "center",
		alignItems: "center",
		marginRight: 10,
	},
	avatarText: {
		fontSize: 12,
		fontWeight: "bold",
	},
	userNameHeader: { fontSize: 16, fontWeight: "700", color: colors.textDark },
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
	emptyUserBasketText: {
		textAlign: "center",
		marginVertical: 10,
		fontSize: 14,
		color: colors.textLight,
		fontStyle: "italic",
	},
	itemsWrapper: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 10,
		padding: 8,
		marginBottom: 8,
	},
	itemContainer: {
		paddingVertical: 4,
	},
	itemSeparator: {
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		marginBottom: 8,
		paddingBottom: 8,
	},
	pipLabelPill: {
		alignSelf: "flex-start",
		backgroundColor: colors.primary + "15",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
		marginBottom: 6,
	},
	pipLabelText: {
		fontSize: 11,
		fontWeight: "bold",
		color: colors.primary,
		textTransform: "uppercase",
	},

	// --- STICKY BOTTOM BAR & ACTIONS ---
	stickyBottomBar: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 20,
		paddingTop: 15,
		paddingBottom: 30,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.1,
		shadowRadius: 5,
		elevation: 10,
	},
	stickySplitRow: {
		flexDirection: "row",
		gap: 15,
	},
	pendingActionStack: {
		gap: 10,
	},
	pendingWideSecondaryBtn: {
		width: "100%",
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 10,
		borderRadius: 10,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	pendingWideSecondaryText: {
		color: colors.textDark,
		fontSize: 14,
		fontWeight: "700",
	},
	pendingPrimaryRow: {
		flexDirection: "row",
		gap: 10,
	},
	pendingPrimaryBtn: {
		flex: 1,
		minHeight: 44,
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 10,
		borderRadius: 10,
	},
	pendingPrimaryBtnDisabled: {
		opacity: 0.65,
	},
	pendingPrimaryText: {
		color: colors.surfaceWhite,
		fontSize: 14,
		fontWeight: "800",
		textAlign: "center",
	},
	stickyPrimaryBtn: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 14,
		borderRadius: 12,
		flex: 1,
	},
	stickyPrimaryBtnText: {
		color: colors.surfaceWhite,
		fontSize: 16,
		fontWeight: "bold",
	},
	stickySecondaryBtn: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 14,
		borderRadius: 12,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	stickySecondaryBtnText: {
		color: colors.textDark,
		fontSize: 16,
		fontWeight: "600",
	},
	inlineDisclaimerText: {
		fontSize: 12,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 12,
		fontStyle: "italic",
		paddingHorizontal: 10,
	},

	// --- MODAL STYLES ---
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 20,
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 20,
		borderRadius: 16,
		width: "90%",
		maxHeight: "70%",
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 20,
		textAlign: "center",
		color: colors.textDark,
	},
	memberItemContainer: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	memberItemText: {
		fontSize: 16,
		color: colors.textDark,
		marginLeft: 10,
		fontWeight: "500",
	},
	hostLabel: {
		fontSize: 14,
		color: colors.primary,
		marginLeft: 8,
		fontStyle: "italic",
	},
	modalCloseButton: {
		backgroundColor: colors.textMedium,
		paddingVertical: 14,
		borderRadius: 10,
		alignItems: "center",
		marginTop: 20,
	},
	modalCloseButtonText: {
		color: colors.surfaceWhite,
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default PartySessionScreen;
