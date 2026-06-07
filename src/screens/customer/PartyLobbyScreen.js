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
import { useTranslation } from "react-i18next";
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
import { httpsCallable } from "@react-native-firebase/functions";
import { collection } from "@react-native-firebase/firestore";
import AddMembersModal from "../../components/customer/Party/AddMembersModal";

const PartyLobbyScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();
	const initialPartyIdFromRoute = route.params?.partyId;

	const partyId = route.params?.partyId;

	const { currentUserData } = useContext(AuthContext);

	const {
		currentPartyIds, // Now {restaurantId: partyId}
		partyDetails, // Now {partyId: details}
		isLoadingParty,
		partyError,
		sharedBaskets, // Now {partyId: items[]}
		addItemToPartyBasket,
		removePartyBasketItem,
		updatePartyBasketQuantity,
		inviteToParty,
		addLocalPIPToParty,
		activatePartyCheckIn,
		leaveParty,
		clearPartyState,
		cancelParty,
	} = useParty();

	const isHost = useMemo(() => {
		if (!currentUserData?.uid || !partyDetails[partyId]?.hostUserId) {
			return false;
		}
		return currentUserData.uid === partyDetails[partyId]?.hostUserId;
	}, [currentUserData?.uid, partyDetails, partyId]);

	const activePartyIds = useMemo(
		() =>
			Object.values(currentPartyIds || {})
				.flatMap((sessionGroup) =>
					typeof sessionGroup === "string"
						? [sessionGroup]
						: [sessionGroup?.dineIn, sessionGroup?.pickup],
				)
				.filter(Boolean),
		[currentPartyIds],
	);

	// Memoized values for check-in status
	const restaurantIdForCheckIn = useMemo(() => {
		return isHost && partyDetails[partyId]?.restaurantId
			? partyDetails[partyId].restaurantId
			: null;
	}, [isHost, partyDetails, partyId]);

	const userIdForCheckIn = useMemo(() => {
		return isHost && currentUserData?.uid ? currentUserData.uid : null;
	}, [isHost, currentUserData?.uid]);

	const {
		checkInStatus: hostCheckInStatus,
		isLoading: isLoadingHostCheckIn,
		checkInObj: hostCheckInObj,
	} = useCheckInStatus(restaurantIdForCheckIn, userIdForCheckIn);

	const [isActionLoading, setIsActionLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [isLoadingCheckInAction, setIsLoadingCheckInAction] = useState(false);
	const [isPipModalVisible, setIsPipModalVisible] = useState(false);
	const [pips, setPips] = useState([]);
	const [isCheckInModalVisible, setIsCheckInModalVisible] = useState(false);
	const [isLoadingPips, setIsLoadingPips] = useState(false);
	const [isAddMembersModalVisible, setIsAddMembersModalVisible] =
		useState(false);

	const openCheckInModal = () => setIsCheckInModalVisible(true);
	const closeCheckInModal = () => setIsCheckInModalVisible(false);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	// Effect to handle navigation if party is not found
	useEffect(() => {
		if (
			!isLoadingParty &&
			partyId &&
			!activePartyIds.includes(partyId)
		) {
			console.log(
				`PartyLobby: Party ID ${partyId} not found in currentPartyIds. Navigating back.`
			);
			Alert.alert(t("party_ended"), t("this_party_session_is_no_longer_active"));
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
		}
	}, [isLoadingParty, partyId, activePartyIds, navigation, t]);

	// Effect to clear state on back navigation (optional)
	useEffect(() => {
		const unsubscribe = navigation.addListener("beforeRemove", (e) => {
			if (
				e.data.action.type === "GO_BACK" &&
				activePartyIds.includes(partyId)
			) {
				console.log("PartyLobby: Navigating back, clearing party state.");
				// clearPartyState(); // Uncomment if you want to clear state on back
			}
		});
		return unsubscribe;
	}, [navigation, activePartyIds, partyId, clearPartyState]);

	useEffect(() => {
		const partyDetail = partyDetails[partyId];
		if (partyDetail?.status === "active" && partyId) {
			console.log(
				`PartyLobby: Status changed to 'active' for party ${partyId}, navigating to PartySession`
			);
			navigation.navigate("PartyTab", {
				screen: "PartySession", // Fixed screen name
				params: {
					partyId,
					restaurantId: partyDetail.restaurantId,
				},
			});
		}
	}, [partyDetails, partyId, navigation]);

	// Group Shared Basket Items for Display
	const groupedBasketItems = useMemo(() => {
		const basketItems = sharedBaskets[partyId] || [];
		if (!basketItems.length) return [];
		const groups = {};
		basketItems.forEach((item) => {
			const groupKey =
				item.orderedByPipName ||
				`${t("user")}: ${item.orderedByUserId?.slice(-4) || t("unknown")}`;
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
	}, [sharedBaskets, partyId, currentUserData?.uid]);

	// Action Handlers
	const fetchPips = async () => {
		if (!currentUserData?.uid) return;
		setIsLoadingPips(true);
		try {
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
			Alert.alert(t("error"), t("could_not_load_your_pips_list"));
		} finally {
			setIsLoadingPips(false);
		}
	};

	const handleInvitePip = async () => {
		console.log(
			"PartyLobby: handleInvitePip - Invite PIP button pressed for party:",
			partyId
		);
		if (!partyId || isActionLoading || isLoadingPips) return;
		await fetchPips();
		if (!isLoadingPips) {
			console.log("PartyLobby: handleInvitePip - Opening PIP selection modal.");
			setIsPipModalVisible(true);
		}
	};

	const sendInviteToUserPIP = async (pipUserId, pipName) => {
		console.log(
			`PartyLobby: invitePipById - Attempting to invite PIP: ID=${pipUserId}, Name=${pipName}`
		);
		if (!partyId || !pipUserId || isActionLoading) return;
		setIsActionLoading(true);
		try {
			const result = await inviteToParty(partyId, {
				inviteeUserId: pipUserId,
				returnFullResult: true,
			});
			if (result) {
				Alert.alert(t("success"), `${t("invite_sent_to")} ${pipName}!`);
				setIsPipModalVisible(false);
			}
		} catch (error) {
			console.error("PartyLobby: Error inviting PIP:", error);
		} finally {
			setIsActionLoading(false);
		}
	};

	const addLocalPIP = async (localPIPId, localPIPName) => {
		console.log(
			`PartyLobby: addLocalPip - Adding local PIP: ID=${localPIPId}, Name=${localPIPName}`
		);
		const pipsToAdd = Array.isArray(localPIPId)
			? localPIPId
			: [{ id: localPIPId, name: localPIPName }];
		const validPipsToAdd = pipsToAdd.filter((pip) => pip?.id && pip?.name);

		if (!partyId || validPipsToAdd.length === 0 || isActionLoading) return;
		setIsActionLoading(true);
		try {
			const result = await addLocalPIPToParty(partyId, validPipsToAdd);
			if (result) {
				console.log(
					"PartyLobby: addLocalPip - addLocalPipToParty call successful."
				);
				setIsPipModalVisible(false);
				setIsAddMembersModalVisible(false);
			}
		} catch (error) {
			console.error("PartyLobby: Error adding local PIP:", error);
			Alert.alert(t("error"), `${t("failed_to_add_local_pip")}: ${error.message}`);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleGenerateCode = async () => {
		if (!partyId || isActionLoading) return;
		setIsActionLoading(true);
		try {
			const result = await inviteToParty(partyId);
			if (result) {
				const code = result;
				const message = `${t("join_my_party_at")} ${
					partyDetails[partyId]?.restaurantName || t("the_restaurant")
				}! ${t("use_this_code_in_the_scerv_app")}: ${code}`;
				Alert.alert(
					t("invite_code_generated"),
					`${t("code")}: ${code}\n${t("expires_in_approx_1_hour")}.`,
					[
						{
							text: t("copy_code"),
							onPress: () => Clipboard.setString(code),
						},
						{ text: t("share"), onPress: () => Share.share({ message }) },
						{ text: t("ok") },
					]
				);
			}
		} catch (error) {
			console.error("PartyLobby: Error generating code:", error);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleLeaveParty = async () => {
		const restaurantId = partyDetails[partyId]?.restaurantId;
		if (!partyId || !restaurantId || isActionLoading) return;
		Alert.alert(
			t("leave_party"),
			t("are_you_sure_you_want_to_leave_this_party"),
			[
				{ text: t("cancel"), style: "cancel" },
				{
					text: t("leave"),
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						await leaveParty(partyId);
						setIsActionLoading(false);
					},
				},
			]
		);
	};

	const handleCancelParty = async () => {
		const restaurantId = partyDetails[partyId]?.restaurantId;
		if (!partyId || !isHost || !restaurantId || isActionLoading) return;
		Alert.alert(
			t("cancel_party"),
			t("are_you_sure_you_want_to_cancel_this_party_this_cannot_be_undone"),
			[
				{ text: t("keep_party"), style: "cancel" },
				{
					text: t("cancel_party"),
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						await cancelParty(partyId);
						setIsActionLoading(false);
					},
				},
			]
		);
	};

	const handlePartyCheckInSubmit = async (values) => {
		if (!partyDetails[partyId]?.restaurantId) {
			Alert.alert(t("error"), t("restaurant_details_missing"));
			return;
		}
		setIsLoadingCheckInAction(true);
		const { success, checkInId } = await handlePartyCheckInRequest(
			currentUserData,
			partyDetails[partyId].restaurantId,
			values.partySize,
			partyId,
			partyDetails[partyId]?.status
		);
		setIsLoadingCheckInAction(false);
		if (success) {
			closeCheckInModal();
			console.log(
				`PartyLobby: Check-in request ${checkInId} submitted successfully for party ${partyId}.`
			);
		}
	};

	const handleNavigateToAddItems = () => {
		if (!partyDetails[partyId]?.restaurantId || !partyId) {
			Alert.alert(t("error"), t("party_or_restaurant_details_missing"));
			return;
		}

		const restaurantData = partyDetails[partyId];
		navigation.navigate("CustomerDashboard", {
			screen: "RestaurantDetail",
			params: {
				restaurant: {
					id: restaurantData.restaurantId,
					name: restaurantData.restaurantName,
					taxRate: restaurantData.restaurantTaxRate,
				},
				partyContext: {
					partyId,
					orderingForUserId: currentUserData.uid,
					orderingForPipName: currentUserData.firstName || t("me"),
				},
			},
		});
	};

	const handleSendPartyOrderToChefsQ = async () => {
		if (
			!partyId ||
			partyDetails[partyId]?.status !== "active" ||
			!partyDetails[partyId]?.checkInId
		) {
			Alert.alert(
				t("cannot_send"),
				t("party_must_be_active_and_checked_in_to_send_the_order")
			);
			return;
		}
		setIsActionLoading(true);
		try {
			const sendOrderFunction = httpsCallable(
				functions,
				"sendPartyOrderToChefsQ"
			);
			const result = await sendOrderFunction({ partyId });
			if (result.data.success) {
				Alert.alert(t("success"), t("new_items_sent_to_the_kitchen"));
			} else {
				throw new Error(result.data.error || t("failed_to_send_party_order"));
			}
		} catch (error) {
			console.error("Error sending party order:", error);
			Alert.alert(t("error"), `${t("could_not_send_order")}: ${error.message}`);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleSendAllNewPartyItemsToChefsQ = async () => {
		if (
			!isHost ||
			!partyId ||
			partyDetails[partyId]?.status !== "active" ||
			!partyDetails[partyId]?.checkInId
		) {
			Alert.alert(
				t("action_denied"),
				t(
					"only_the_host_can_perform_this_action_when_the_party_is_active_and_checked_in"
				)
			);
			return;
		}
		setIsActionLoading(true);
		try {
			// Placeholder for cloud function
			Alert.alert(
				t("success_placeholder"),
				t("all_new_items_would_be_sent_to_the_kitchen")
			);
		} catch (error) {
			console.error("Error in handleSendAllNewPartyItemsToChefsQ:", error);
			Alert.alert(
				t("error"),
				`${t("could_not_send_all_items")}: ${error.message}`
			);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleUpdatePartyBasketItemQuantity = async (itemId, newQuantity) => {
		if (!partyId || !currentUserData?.uid) {
			Alert.alert(t("error"), t("missing_party_or_user_information"));
			return;
		}
		setIsActionLoading(true);
		try {
			await updatePartyBasketQuantity(
				partyId,
				itemId,
				newQuantity,
				currentUserData.uid
			);
		} catch (error) {
			console.error("PartyLobby: Error updating item quantity:", error);
			Alert.alert(
				t("error"),
				`${t("failed_to_update_item_quantity")}: ${error.message}`
			);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleCancelPartyCheckIn = async () => {
		const restaurantId = partyDetails[partyId]?.restaurantId;
		if (!partyId || !restaurantId || !isHost) return;
		Alert.alert(
			t("cancel_check_in_request"),
			t("are_you_sure_you_want_to_cancel_your_request_for_a_table"),
			[
				{ text: t("keep_request"), style: "cancel" },
				{
					text: t("cancel_request"),
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						try {
							await cancelPartyCheckIn(restaurantId);
						} catch (error) {
							console.error("PartyLobby: Error canceling check-in:", error);
							Alert.alert(
								t("error"),
								`${t("failed_to_cancel_check_in")}: ${error.message}`
							);
						} finally {
							setIsActionLoading(false);
						}
					},
				},
			]
		);
	};

	// Validation Schema
	const validationSchema = Yup.object().shape({
		partySize: Yup.number()
			.min(1, t("party_size_must_be_at_least_1"))
			.required(t("party_size_is_required")),
	});

	// --- Render Guest Item ---
	const renderGuest = ({ item }) => (
		<View style={styles.guestItem}>
			<Ionicons name="person-circle-outline" size={24} color="gray" />
			<Text style={styles.guestName}>
				{item.name}
				{item.userId === currentUserData?.uid ? ` (${t("you")})` : ""}
			</Text>
		</View>
	);

	// Main Render Logic
	const isScreenLoading = isLoadingParty || (partyId && !partyDetails[partyId]);
	if (isScreenLoading) {
		return (
			<SafeAreaView style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>
					{t("loading_party_details")}...
				</Text>
			</SafeAreaView>
		);
	}

	if (partyError || !partyDetails[partyId]) {
		return (
			<SafeAreaView style={styles.centered}>
				<MaterialCommunityIcons
					name="alert-circle-outline"
					size={40}
					color={colors.danger}
				/>
				<Text style={styles.errorText}>
					{partyError || t("party_not_found_or_has_ended")}
				</Text>
				<Button
					title={t("go_back")}
					onPress={() =>
						navigation.canGoBack()
							? navigation.goBack()
							: navigation.navigate("CustomerHome")
					}
				/>
			</SafeAreaView>
		);
	}

	const guests = partyDetails[partyId]?.guestPips || [];
	const partyStatus = partyDetails[partyId]?.status || "unknown";

	return (
		<SafeAreaView style={styles.safeArea}>
			<FlatList
				style={styles.container}
				data={guests}
				renderItem={renderGuest}
				keyExtractor={(item) => item.userId || item.localPipId}
				ListHeaderComponent={
					<PartyLobbyHeaderContent
						partyId={partyId}
						partyDetails={partyDetails[partyId]}
						partyStatus={partyStatus}
						partyError={partyError}
						isHost={isHost}
					/>
				}
				ListEmptyComponent={
					<Text style={styles.emptyText}>
						{t("no_guests_have_joined_yet")}
					</Text>
				}
				ListFooterComponent={
					<PartyLobbyFooter
						partyId={partyId}
						isHost={isHost}
						partyStatus={partyStatus}
						partyDetails={partyDetails[partyId]}
						currentUserData={currentUserData}
						isLoadingPartyAction={isActionLoading}
						isLoadingPips={isLoadingPips}
						hostCheckInStatus={hostCheckInStatus}
						isLoadingHostCheckIn={isLoadingHostCheckIn}
						sharedBasketItems={sharedBaskets[partyId] || []}
						isLoadingBasket={false}
						groupedBasketItems={groupedBasketItems}
						updatePartyBasketItemQuantity={handleUpdatePartyBasketItemQuantity}
						handleNavigateToAddItems={handleNavigateToAddItems}
						handleInvitePip={handleInvitePip}
						handleGenerateCode={handleGenerateCode}
						setIsCheckInModalVisible={setIsCheckInModalVisible}
						handleCancelCheckIn={handleCancelPartyCheckIn}
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
				partyDetails={partyDetails[partyId] || {}}
				isActionLoading={isActionLoading}
				onSelectUserPip={sendInviteToUserPIP}
				onSelectLocalPip={() => setIsAddMembersModalVisible(true)}
				onAddLocalMembers={() => {
					setIsPipModalVisible(false);
					setIsAddMembersModalVisible(true);
				}}
				onManagePips={() => {
					setIsPipModalVisible(false);
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
				hostPips={pips}
				partyMembers={partyDetails[partyId]?.guestPips || []}
				isLoading={isLoadingPips}
			/>
			<PartyCheckInModal
				isVisible={isCheckInModalVisible}
				onClose={() => setIsCheckInModalVisible(false)}
				initialPartySize={(partyDetails[partyId]?.guestPips?.length || 0) + 1}
				validationSchema={validationSchema}
				onSubmit={handlePartyCheckInSubmit}
				isLoadingAction={isLoadingCheckInAction}
			/>
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
	loadingText: {
		marginTop: 10,
		fontSize: 16,
		color: colors.textDark,
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
	checkInButton: { backgroundColor: colors.success || "green" },
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
	},
	actionIcon: {
		alignItems: "center",
		padding: 8,
		minWidth: 80,
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
		marginHorizontal: 5,
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
});

export default PartyLobbyScreen;
