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
import { httpsCallable } from "@react-native-firebase/functions";
import { collection } from "@react-native-firebase/firestore";
import AddMembersModal from "../../components/customer/Party/AddMembersModal";

const PartyLobbyScreen = () => {
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
			!Object.values(currentPartyIds).includes(partyId)
		) {
			console.log(
				`PartyLobby: Party ID ${partyId} not found in currentPartyIds. Navigating back.`
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
		}
	}, [isLoadingParty, partyId, currentPartyIds, navigation]);

	// Effect to clear state on back navigation (optional)
	useEffect(() => {
		const unsubscribe = navigation.addListener("beforeRemove", (e) => {
			if (
				e.data.action.type === "GO_BACK" &&
				Object.values(currentPartyIds).includes(partyId)
			) {
				console.log("PartyLobby: Navigating back, clearing party state.");
				// clearPartyState(); // Uncomment if you want to clear state on back
			}
		});
		return unsubscribe;
	}, [navigation, currentPartyIds, partyId, clearPartyState]);

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
			Alert.alert("Error", "Could not load your PIPs list.");
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
			const result = await inviteToParty(partyId);
			if (result) {
				Alert.alert("Success", `Invite sent to ${pipName}!`);
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
		if (!partyId || !localPIPId || !localPIPName || isActionLoading) return;
		setIsActionLoading(true);
		try {
			const result = await addLocalPIPToParty(partyId, [
				{ id: localPIPId, name: localPIPName },
			]);
			if (result) {
				console.log(
					"PartyLobby: addLocalPip - addLocalPipToParty call successful."
				);
				setIsPipModalVisible(false);
			}
		} catch (error) {
			console.error("PartyLobby: Error adding local PIP:", error);
			Alert.alert("Error", `Failed to add local PIP: ${error.message}`);
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
				const message = `Join my party at ${
					partyDetails[partyId]?.restaurantName || "the restaurant"
				}! Use this code in the Scerv app: ${code}`;
				Alert.alert(
					"Invite Code Generated",
					`Code: ${code}\nExpires in approx 1 hour.`,
					[
						{ text: "Copy Code", onPress: () => Clipboard.setString(code) },
						{ text: "Share", onPress: () => Share.share({ message }) },
						{ text: "OK" },
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
		Alert.alert("Leave Party", "Are you sure you want to leave this party?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Leave",
				style: "destructive",
				onPress: async () => {
					setIsActionLoading(true);
					await leaveParty(restaurantId);
					setIsActionLoading(false);
				},
			},
		]);
	};

	const handleCancelParty = async () => {
		const restaurantId = partyDetails[partyId]?.restaurantId;
		if (!partyId || !isHost || !restaurantId || isActionLoading) return;
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
						await cancelParty(partyId);
						setIsActionLoading(false);
					},
				},
			]
		);
	};

	const handlePartyCheckInSubmit = async (values) => {
		if (!partyDetails[partyId]?.restaurantId) {
			Alert.alert("Error", "Restaurant details missing.");
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
			Alert.alert("Error", "Party or restaurant details missing.");
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
					orderingForPipName: currentUserData.firstName || "Me",
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
				"Cannot Send",
				"Party must be active and checked in to send the order."
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
			!partyId ||
			partyDetails[partyId]?.status !== "active" ||
			!partyDetails[partyId]?.checkInId
		) {
			Alert.alert(
				"Action Denied",
				"Only the host can perform this action when the party is active and checked in."
			);
			return;
		}
		setIsActionLoading(true);
		try {
			// Placeholder for cloud function
			Alert.alert(
				"Success (Placeholder)",
				"All new items would be sent to the kitchen!"
			);
		} catch (error) {
			console.error("Error in handleSendAllNewPartyItemsToChefsQ:", error);
			Alert.alert("Error", `Could not send all items: ${error.message}`);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleUpdatePartyBasketItemQuantity = async (itemId, newQuantity) => {
		if (!partyId || !currentUserData?.uid) {
			Alert.alert("Error", "Missing party or user information.");
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
			Alert.alert("Error", `Failed to update item quantity: ${error.message}`);
		} finally {
			setIsActionLoading(false);
		}
	};

	const handleCancelPartyCheckIn = async () => {
		const restaurantId = partyDetails[partyId]?.restaurantId;
		if (!partyId || !restaurantId || !isHost) return;
		Alert.alert(
			"Cancel Check-In Request",
			"Are you sure you want to cancel your request for a table?",
			[
				{ text: "Keep Request", style: "cancel" },
				{
					text: "Cancel Request",
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						try {
							await cancelPartyCheckIn(restaurantId);
						} catch (error) {
							console.error("PartyLobby: Error canceling check-in:", error);
							Alert.alert(
								"Error",
								`Failed to cancel check-in: ${error.message}`
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
			.min(1, "Party size must be at least 1")
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

	// Main Render Logic
	const isScreenLoading = isLoadingParty || (partyId && !partyDetails[partyId]);
	if (isScreenLoading) {
		return (
			<SafeAreaView style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>Loading Party Details...</Text>
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
					{partyError || "Party not found or has ended."}
				</Text>
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
					<Text style={styles.emptyText}>No guests have joined yet.</Text>
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
