// screens/customer/RestaurantDetailScreen.js
import React, {
	useContext,
	useEffect,
	useState,
	useMemo,
	useCallback,
} from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
	SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import { AuthContext } from "../../context/authContext";
import { useParty } from "../../context/customer/PartyContext";
import colors from "../../utils/styles/appStyles";
import {
	handleCancelCheckIn,
	useCheckInStatus,
} from "../../utils/customerUtils";
import MenuItemsList from "./MenuItemsList";
import { db, functions } from "../../config/firebase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button as PaperButton } from "react-native-paper";
import { httpsCallable } from "@react-native-firebase/functions";
import RestaurantHeader from "./RestaurantHeader";
import AuthPromptModal from "../global/AuthPromptModal";
import {
	collection,
	onSnapshot,
	query,
	where,
} from "@react-native-firebase/firestore";

const RestaurantDetailScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();
	const { restaurant, initialView } = route.params;

	const { currentUserData, logout } = useContext(AuthContext);

	// 🚨 UNIFIED ARCHITECTURE: Pulling everything from PartyContext
	const {
		createParty,
		isLoadingParty,
		currentPartyIds,
		partyDetails,
		activatePartyCheckIn,
		sharedBaskets,
		addItemToPartyBasket, // 👈 Correct function name
	} = useParty();

	// Local loading states
	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);
	const [isProcessingCheckInAction, setIsProcessingCheckInAction] =
		useState(false);
	const [userPips, setUserPips] = useState([]);
	const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
	const [liveRestaurantData, setLiveRestaurantData] = useState(restaurant);
	const [isLoadingRestaurant, setIsLoadingRestaurant] = useState(true);

	const customerCancelSeatedCheckIn = httpsCallable(
		functions,
		"customerCancelSeatedCheckIn",
	);

	// --- Check-In Status ---
	const {
		checkInStatus,
		isLoading: isLoadingCheckInStatus,
		checkInObj,
	} = useCheckInStatus(
		currentUserData?.role === "customer" && restaurant?.id
			? restaurant.id
			: null,
		currentUserData?.role === "customer" && currentUserData?.uid
			? currentUserData.uid
			: null,
	);

	// 🚨 THE NEW BASKET COUNT: Look only at the party's shared basket
	const currentPartyId =
		restaurant?.id && currentPartyIds ? currentPartyIds[restaurant.id] : null;
	const currentPartyItems =
		currentPartyId && sharedBaskets ? sharedBaskets[currentPartyId] : [];

	// Count only the items the current user added
	const basketCount =
		currentPartyItems?.filter(
			(item) => item.orderedByUserId === currentUserData?.uid,
		).length || 0;

	// Fetch user's PIPs
	useEffect(() => {
		if (currentUserData?.uid && currentUserData.role !== "guest") {
			const pipsRef = db.collection(`customers/${currentUserData.uid}/pips`);
			const unsubscribe = pipsRef.onSnapshot(
				(snapshot) => {
					setUserPips(
						snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
					);
				},
				(error) => {
					console.error("RestaurantDetailScreen: Error fetching PIPs:", error);
					setUserPips([]);
				},
			);
			return () => unsubscribe();
		} else {
			setUserPips([]);
		}
	}, [currentUserData?.uid]);

	// Fetch Live Restaurant Data
	useEffect(() => {
		if (!restaurant?.id) {
			setIsLoadingRestaurant(false);
			return;
		}
		const restaurantRef = db.collection("restaurants").doc(restaurant.id);
		const unsubscribe = restaurantRef.onSnapshot(
			(docSnap) => {
				if (docSnap.exists()) {
					setLiveRestaurantData({ id: docSnap.id, ...docSnap.data() });
				}
				setIsLoadingRestaurant(false);
			},
			(error) => {
				console.error("Error fetching real-time restaurant data:", error);
				setIsLoadingRestaurant(false);
			},
		);
		return () => unsubscribe();
	}, [restaurant?.id]);

	// Fetch Menu
	useEffect(() => {
		if (!restaurant?.id) {
			setIsLoadingMenu(false);
			return;
		}
		const menuQuery = query(
			collection(db, "menuItems"),
			where("restaurantId", "==", restaurant.id),
		);
		const unsubscribe = onSnapshot(
			menuQuery,
			(querySnapshot) => {
				const menuItems = querySnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setMenuItems(menuItems);
				setIsLoadingMenu(false);
			},
			(err) => {
				console.error("Error fetching menu: ", err);
				setIsLoadingMenu(false);
			},
		);
		return () => unsubscribe();
	}, [restaurant.id]);

	// Activate Party on Check-In
	useEffect(() => {
		if (
			checkInStatus === "ACCEPTED" &&
			checkInObj?.id &&
			currentPartyId &&
			partyDetails?.id === currentPartyId &&
			partyDetails?.status === "pending" &&
			partyDetails?.restaurantId === restaurant?.id &&
			partyDetails?.hostUserId === currentUserData?.uid
		) {
			activatePartyCheckIn(checkInObj.id);
		}
	}, [
		checkInStatus,
		checkInObj?.id,
		currentPartyId,
		partyDetails,
		restaurant?.id,
		currentUserData?.uid,
		activatePartyCheckIn,
	]);

	// --- Actions ---
	const handleViewParty = () => {
		if (currentPartyId) {
			navigation.navigate("PartyTab", {
				screen: "PartySession",
				params: {
					partyId: currentPartyId,
				},
			});
		}
	};

	const handleLeaveTable = () => {
		if (!checkInObj?.id || isProcessingCheckInAction) return;

		Alert.alert(
			t("leave_table_title", "Leave Table"),
			t("leave_table_message", "Are you sure you want to leave this table?"),
			[
				{ text: t("stay_button", "Stay"), style: "cancel" },
				{
					text: t("leave_button", "Leave"),
					style: "destructive",
					onPress: async () => {
						setIsProcessingCheckInAction(true);
						try {
							await customerCancelSeatedCheckIn({ checkInId: checkInObj.id });
						} catch (error) {
							Alert.alert(
								t("error_title", "Error"),
								error.message ||
									t("could_not_leave_table_message", "Could not leave table."),
							);
						} finally {
							setIsProcessingCheckInAction(false);
						}
					},
				},
			],
		);
	};

	const handleCancelIndividualCheckIn = async () => {
		if (!checkInObj?.id || isProcessingCheckInAction) return;
		setIsProcessingCheckInAction(true);
		try {
			const success = await handleCancelCheckIn(
				restaurant.id,
				currentUserData.uid,
				checkInObj.id,
			);
			if (success) {
				Alert.alert(
					t("success_title", "Success"),
					t("check_in_cancelled_message", "Check-in cancelled successfully."),
				);
			} else {
				Alert.alert(
					t("error_title", "Error"),
					t("could_not_cancel_check_in_message", "Could not cancel check-in."),
				);
			}
		} catch (error) {
			Alert.alert(
				t("error_title", "Error"),
				t(
					"an_error_occurred_while_cancelling_check_in_message",
					"An error occurred while cancelling.",
				),
			);
		} finally {
			setIsProcessingCheckInAction(false);
		}
	};

	// 🚨 THE NEW "ADD TO BASKET" WITH AUTO-PARTY CREATION
	const handleAddItemToPartyBasket = useCallback(
		async (itemDataFromModal) => {
			if (!currentUserData?.uid) {
				setIsAuthModalVisible(true);
				return;
			}

			try {
				let targetPartyId = currentPartyId;

				// THE PRE-BUILD FEATURE: If no party exists, create one silently!
				if (!targetPartyId) {
					console.log("Pre-building cart: Creating a table-less party...");

					targetPartyId = await createParty(
						restaurant.id,
						restaurant.restaurantName || t("restaurant", "Restaurant"),
					);

					if (!targetPartyId)
						throw new Error(
							t("error_initializing_order", "Could not initialize order."),
						);
				}

				const {
					menuItemDetails,
					quantity,
					individualPips,
					specialInstructions,
				} = itemDataFromModal;

				// Format the PIP name if one is selected, otherwise default to "Myself"
				const firstPip =
					individualPips && individualPips.length > 0
						? individualPips[0]
						: null;
				const orderingForId = firstPip ? firstPip.id : currentUserData.uid;
				const orderingForName = firstPip
					? firstPip.name
					: t("myself", "Myself");

				// Bundle the context data exactly how your PartyContext expects it
				const partyContextData = {
					partyId: targetPartyId,
					orderingForUserId: orderingForId,
					orderingForPipName: orderingForName,
				};

				// Bundle the menu item data exactly how your PartyContext expects it
				const formattedMenuItemDetails = {
					id: menuItemDetails.id,
					name: menuItemDetails.name,
					price: menuItemDetails.price,
					category: menuItemDetails.category,
					imageUri: menuItemDetails.imageUri,
					restaurantId: restaurant.id,
					quantity: quantity || 1,
					specialInstructions: specialInstructions || "",
				};

				await addItemToPartyBasket(partyContextData, formattedMenuItemDetails);

				console.log("Item added to shared basket successfully!");
			} catch (error) {
				console.error("Add to basket error:", error);
				Alert.alert(
					t("error_title", "Error"),
					error.message ||
						t("error_adding_item", "Could not add item to order."),
				);
			}
		},
		[
			currentUserData,
			currentPartyId,
			restaurant,
			createParty,
			addItemToPartyBasket,
			t,
		],
	);

	const optionsForIndividualOrder = useMemo(() => {
		if (!currentUserData) return [];
		const myselfOption = {
			id: currentUserData.uid,
			name: currentUserData.firstName || t("myself", "Myself"),
		};
		const otherPips = (userPips || []).filter(
			(p) => p.id !== currentUserData.uid,
		);
		return [myselfOption, ...otherPips];
	}, [userPips, currentUserData, t]);

	// --- DYNAMIC UI BUTTONS (QR FIRST FLOW) ---
	const renderActionButtons = () => {
		if (isLoadingCheckInStatus || isLoadingParty) {
			return (
				<View style={styles.actionsRow}>
					<ActivityIndicator size="small" color={colors.primary} />
				</View>
			);
		}

		// Check if the current party actually has a table assigned to it yet
		const activeParty = currentPartyId ? partyDetails?.[currentPartyId] : null;
		const hasTable =
			checkInStatus === "ACCEPTED" || (activeParty && activeParty.table?.id);

		// 1. FULLY SEATED SESSION (Has Party/Check-in AND a Table)
		if (hasTable) {
			return (
				<View style={styles.actionsRow}>
					<TouchableOpacity
						style={styles.actionButtonCheckedIn}
						onPress={handleViewParty}
					>
						<MaterialCommunityIcons
							name="silverware-fork-knife"
							size={28}
							color={colors.statusSuccess}
						/>
						<Text style={styles.actionButtonTextCheckedIn}>
							{t("view_your_order", "View Order")}
						</Text>
						{checkInObj?.table?.name ? (
							<Text style={styles.tableText}>{checkInObj.table.name}</Text>
						) : activeParty?.table?.name ? (
							<Text style={styles.tableText}>{activeParty.table.name}</Text>
						) : null}
					</TouchableOpacity>

					{/* Only show Leave Table if they are physically checked in */}
					{checkInStatus === "ACCEPTED" && (
						<TouchableOpacity
							style={styles.cancelButton}
							onPress={handleLeaveTable}
							disabled={isProcessingCheckInAction}
						>
							{isProcessingCheckInAction ? (
								<ActivityIndicator size="small" color="#fff" />
							) : (
								<MaterialCommunityIcons
									name="exit-run"
									size={24}
									color="#fff"
								/>
							)}
							<Text style={styles.cancelButtonText}>
								{t("leave_table_button", "Leave Table")}
							</Text>
						</TouchableOpacity>
					)}
				</View>
			);
		}

		// 2. WAITING STATE
		if (checkInStatus === "REQUESTED") {
			return (
				<View style={styles.actionsRow}>
					<View style={styles.actionButtonDisabled}>
						<MaterialCommunityIcons
							name="timer-sand"
							size={28}
							color={colors.textLight}
						/>
						<Text style={styles.actionButtonTextDisabled}>
							{t("waiting_to_be_seated", "Waiting...")}
						</Text>
					</View>
					<TouchableOpacity
						style={styles.cancelButton}
						onPress={handleCancelIndividualCheckIn}
					>
						<MaterialCommunityIcons name="cancel" size={24} color="#fff" />
						<Text style={styles.cancelButtonText}>
							{t("cancel_button", "Cancel")}
						</Text>
					</TouchableOpacity>
				</View>
			);
		}

		// 3. 🚨 THE PRE-BUILD STATE: Has a cart, but NO table yet
		if (currentPartyId && !hasTable) {
			return (
				<View style={styles.actionsRow}>
					<TouchableOpacity
						style={[styles.actionButtonCheckedIn, { marginRight: 10 }]}
						onPress={handleViewParty}
					>
						<MaterialCommunityIcons
							name="basket"
							size={24}
							color={colors.statusSuccess}
						/>
						<Text style={styles.actionButtonTextCheckedIn}>
							{t("view_cart", "View Basket")}
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.primaryScanButton}
						onPress={() =>
							navigation.navigate("QRScannerScreen", {
								restaurantId: restaurant.id,
							})
						}
					>
						<MaterialCommunityIcons name="qrcode-scan" size={24} color="#fff" />
						<Text style={styles.primaryScanText}>
							{t("scan_to_dine", "Scan to Order")}
						</Text>
					</TouchableOpacity>
				</View>
			);
		}

		// 4. DEFAULT STATE: Empty cart, no check-in
		return (
			<View style={styles.actionsRow}>
				<TouchableOpacity
					style={styles.primaryScanButton}
					onPress={() => {
						if (currentUserData?.role === "guest") {
							setIsAuthModalVisible(true);
						} else {
							navigation.navigate("QRScannerScreen", {
								restaurantId: restaurant.id,
							});
						}
					}}
				>
					<MaterialCommunityIcons name="qrcode-scan" size={24} color="#fff" />
					<Text style={styles.primaryScanText}>
						{t("scan_table_qr_order", "Scan Table QR to Order")}
					</Text>
				</TouchableOpacity>
			</View>
		);
	};

	if (!restaurant) {
		return (
			<SafeAreaView style={styles.centered}>
				<Text style={{ color: colors.statusDanger }}>
					{t("restaurant_data_not_found", "Restaurant not found")}
				</Text>
				<PaperButton onPress={() => navigation.goBack()}>
					{t("go_back_button", "Go Back")}
				</PaperButton>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<MenuItemsList
				menuItems={menuItems}
				isLoading={isLoadingMenu}
				ListHeaderComponent={
					<RestaurantHeader
						restaurant={restaurant}
						initialView={initialView}
						renderActionButtons={renderActionButtons}
					/>
				}
				pips={optionsForIndividualOrder}
				onConfirmAddItemToContext={handleAddItemToPartyBasket}
				orderingMode="individual" // 🚨 Kept as individual so UI modal works perfectly
			/>

			{/* 🚨 UPDATED FLOATING BASKET BUTTON: Navigates to the Party Session */}
			{currentUserData?.role === "customer" && basketCount > 0 && (
				<TouchableOpacity style={styles.fabContainer} onPress={handleViewParty}>
					<View style={styles.fabContent}>
						<MaterialCommunityIcons name="basket" size={32} color="white" />
						<View style={styles.badge}>
							<Text style={styles.badgeText}>{basketCount}</Text>
						</View>
					</View>
				</TouchableOpacity>
			)}

			<AuthPromptModal
				isVisible={isAuthModalVisible}
				onClose={() => setIsAuthModalVisible(false)}
				onLoginPress={() => {
					setIsAuthModalVisible(false);
					logout("Login");
				}}
				onSignupPress={() => {
					setIsAuthModalVisible(false);
					logout("CustomerSignup");
				}}
			/>
		</SafeAreaView>
	);
};

// --- Styles ---
const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	actionsRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "center",
		paddingVertical: 15,
		paddingHorizontal: 15,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: colors.borderLight,
		marginBottom: 10,
	},
	primaryScanButton: {
		flex: 1,
		flexDirection: "row",
		backgroundColor: colors.primary,
		paddingVertical: 14,
		borderRadius: 8,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.3,
		shadowRadius: 4,
		elevation: 4,
	},
	primaryScanText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "bold",
		marginLeft: 10,
	},
	actionButtonCheckedIn: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 12,
		borderRadius: 8,
		marginRight: 10,
		backgroundColor: colors.statusSuccess + "1A",
		borderWidth: 1,
		borderColor: colors.statusSuccess + "33",
	},
	actionButtonTextCheckedIn: {
		marginTop: 4,
		fontSize: 14,
		color: colors.statusSuccess,
		fontWeight: "bold",
	},
	tableText: {
		fontSize: 12,
		color: colors.statusSuccess,
		fontWeight: "600",
		marginTop: 2,
	},
	cancelButton: {
		flex: 0.4,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		backgroundColor: colors.danger || "#dc3545",
		borderRadius: 8,
	},
	cancelButtonText: {
		marginTop: 4,
		fontSize: 12,
		color: "#ffffff",
		fontWeight: "bold",
	},
	actionButtonDisabled: {
		flex: 1,
		alignItems: "center",
		padding: 10,
		opacity: 0.6,
	},
	actionButtonTextDisabled: {
		marginTop: 4,
		fontSize: 13,
		color: colors.textLight,
		fontWeight: "500",
	},
	fabContainer: {
		position: "absolute",
		right: 20,
		bottom: 20,
		backgroundColor: colors.brandOrange,
		width: 64,
		height: 64,
		borderRadius: 32,
		justifyContent: "center",
		alignItems: "center",
		elevation: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 4,
	},
	fabContent: { justifyContent: "center", alignItems: "center" },
	badge: {
		position: "absolute",
		right: -5,
		top: -5,
		backgroundColor: colors.statusDanger,
		borderRadius: 12,
		width: 24,
		height: 24,
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 2,
		borderColor: colors.surfaceWhite,
	},
	badgeText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
});

export default RestaurantDetailScreen;
