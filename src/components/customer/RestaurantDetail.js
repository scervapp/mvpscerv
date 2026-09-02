// screens/customer/RestaurantDetailScreen.js
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
	SafeAreaView,
	Linking,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button as PaperButton } from "react-native-paper";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { useParty } from "../../context/customer/PartyContext";
import colors from "../../utils/styles/appStyles";
import {
	handleCancelCheckIn,
	fetchMenu,
	useCheckInStatus,
} from "../../utils/customerUtils";
import { db, functions } from "../../config/firebase";
import RestaurantHeader from "./RestaurantHeader";
import AuthPromptModal from "../global/AuthPromptModal";
import MenuItemsList from "./MenuItemsList";
import { isPickupEnabledForRestaurant } from "../../config/featureFlags";
import {
	getRestaurantExperienceConfig,
	isScervEnabledRestaurant,
} from "../../utils/restaurantExperience";

const RestaurantDetailScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();

	const restaurant = route.params?.restaurant ?? null;
	const initialView = route.params?.initialView;

	const { currentUserData, logout } = useContext(AuthContext);

	const {
		isLoadingParty,
		currentPartyIds,
		partyDetails,
		createParty,
		activatePartyCheckIn,
		addItemToPartyBasket,
		leaveParty,
		sharedBaskets,
		getOrCreatePickupParty,
	} = useParty();

	const [isProcessingCheckInAction, setIsProcessingCheckInAction] =
		useState(false);
	const [isStartingPickup, setIsStartingPickup] = useState(false);
	const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
	const [liveRestaurantData, setLiveRestaurantData] = useState(restaurant);
	const [isLoadingRestaurant, setIsLoadingRestaurant] = useState(true);
	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);
	const [isAddingDineInItem, setIsAddingDineInItem] = useState(false);
	const [activeReservation, setActiveReservation] = useState(null);

	const hasAttemptedAutoActivateRef = useRef(false);

	const pickupEnabled = useMemo(
		() => isPickupEnabledForRestaurant(liveRestaurantData || restaurant),
		[liveRestaurantData, restaurant],
	);
	const experienceConfig = useMemo(
		() => getRestaurantExperienceConfig(liveRestaurantData || restaurant),
		[liveRestaurantData, restaurant],
	);
	const reservationsEnabled = experienceConfig.features.reservations;
	const hostCheckInEnabled = experienceConfig.features.hostCheckInRequests;
	const qrSelfCheckInEnabled = experienceConfig.features.qrSelfCheckIn === true;
	const isScervEnabled = isScervEnabledRestaurant(liveRestaurantData || restaurant);
	const isOrderingAvailable =
		isScervEnabled &&
		experienceConfig.features.parties === true &&
		experienceConfig.features.tableScanOrdering === true;
	const reservationStatusCopy = useMemo(() => {
		if (!activeReservation) {
			return {
				title: t("request_reservation", "Request Reservation"),
				subtitle: t(
					"reservation_manual_approval",
					"Choose a restaurant-defined time and wait for confirmation.",
				),
				icon: "calendar-clock",
				tone: "default",
			};
		}

		const dateTime = `${activeReservation.requestedDate || ""}${
			activeReservation.requestedTime
				? ` at ${activeReservation.requestedTime}`
				: ""
		}`.trim();

		if (activeReservation.status === "requested") {
			return {
				title: t("reservation_requested", "Reservation Requested"),
				subtitle: dateTime || t("waiting_for_confirmation", "Waiting for confirmation."),
				icon: "calendar-alert",
				tone: "warning",
			};
		}
		if (activeReservation.status === "arrival_requested") {
			return {
				title: t("arrival_sent", "Arrival Sent"),
				subtitle: t("host_will_seat_you", "The host will assign your table."),
				icon: "walk",
				tone: "success",
			};
		}
		if (activeReservation.status === "seated") {
			return {
				title: t("reservation_seated", "You're Seated"),
				subtitle:
					activeReservation.table?.name ||
					t("open_your_table", "Open your table and order."),
				icon: "silverware-fork-knife",
				tone: "success",
			};
		}
		return {
			title: t("reservation_confirmed", "Reservation Confirmed"),
			subtitle: dateTime || t("ready_for_arrival", "Ready for arrival."),
			icon: "calendar-check",
			tone: "success",
		};
	}, [activeReservation, t]);

	const customerCancelSeatedCheckIn = httpsCallable(
		functions,
		"customerCancelSeatedCheckIn",
	);

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
	const hasActiveHostCheckInRequest = useMemo(() => {
		const activeCheckIn = currentUserData?.activeCheckIn || null;
		const activeStatus = String(activeCheckIn?.status || "").toUpperCase();
		const liveStatus = String(checkInObj?.status || checkInStatus || "").toUpperCase();
		const activeRestaurantId = activeCheckIn?.restaurantId || checkInObj?.restaurantId;
		const isSameRestaurant = activeRestaurantId === restaurant?.id;

		return (
			isSameRestaurant &&
			(["REQUESTED", "ACCEPTED"].includes(activeStatus) ||
				["REQUESTED", "ACCEPTED"].includes(liveStatus))
		);
	}, [
		checkInObj?.restaurantId,
		checkInObj?.status,
		checkInStatus,
		currentUserData?.activeCheckIn,
		restaurant?.id,
	]);

	const handleClaimRestaurant = async () => {
		const sourceRestaurant = liveRestaurantData || restaurant || {};
		const restaurantName =
			sourceRestaurant.restaurantName || sourceRestaurant.name || "this restaurant";
		const subject = encodeURIComponent(`Claim ${restaurantName} on Scerv`);
		const body = encodeURIComponent(
			`Hi Scerv,\n\nI would like to claim ${restaurantName} on Scerv.\n\nRestaurant ID: ${
				sourceRestaurant.id || restaurant?.id || ""
			}\nRestaurant address: ${sourceRestaurant.address || ""}\n\nMy name:\nMy role:\nBest phone number:\n`,
		);
		const url = `mailto:admin@scerv.com?subject=${subject}&body=${body}`;

		try {
			const canOpen = await Linking.canOpenURL(url);
			if (canOpen) {
				await Linking.openURL(url);
			} else {
				Alert.alert(
					t("claim_restaurant_title", "Claim this restaurant"),
					t(
						"claim_restaurant_email_fallback",
						"Email admin@scerv.com and include the restaurant name so Scerv can verify ownership.",
					),
				);
			}
		} catch (error) {
			console.error("Failed to open restaurant claim email:", error);
			Alert.alert(
				t("claim_restaurant_title", "Claim this restaurant"),
				t(
					"claim_restaurant_email_fallback",
					"Email admin@scerv.com and include the restaurant name so Scerv can verify ownership.",
				),
			);
		}
	};

	// --- NEW: dual session shape from PartyContext ---
	const restaurantSessions = useMemo(() => {
		if (!restaurant?.id) {
			return { dineIn: null, pickup: null };
		}
		return currentPartyIds?.[restaurant.id] || { dineIn: null, pickup: null };
	}, [restaurant?.id, currentPartyIds]);

	const dineInPartyId = restaurantSessions?.dineIn || null;
	const pickupPartyId = restaurantSessions?.pickup || null;

	const dineInParty = useMemo(() => {
		return dineInPartyId ? partyDetails?.[dineInPartyId] || null : null;
	}, [dineInPartyId, partyDetails]);

	const pickupParty = useMemo(() => {
		if (!pickupEnabled) return null;
		return pickupPartyId ? partyDetails?.[pickupPartyId] || null : null;
	}, [pickupEnabled, pickupPartyId, partyDetails]);

	const dineInItems = useMemo(() => {
		if (!dineInPartyId) return [];
		return sharedBaskets?.[dineInPartyId]?.items || [];
	}, [dineInPartyId, sharedBaskets]);

	const pickupItems = useMemo(() => {
		if (!pickupEnabled) return [];
		if (!pickupPartyId) return [];
		return sharedBaskets?.[pickupPartyId]?.items || [];
	}, [pickupEnabled, pickupPartyId, sharedBaskets]);

	const dineInBasketCount = useMemo(() => {
		if (!currentUserData?.uid) return 0;
		return (
			dineInItems?.filter(
				(item) => item.orderedByUserId === currentUserData.uid,
			).length || 0
		);
	}, [dineInItems, currentUserData?.uid]);

	const pickupBasketCount = useMemo(() => {
		if (!pickupEnabled) return 0;
		if (!currentUserData?.uid) return 0;

		return (
			pickupItems?.filter(
				(item) =>
					item && !item.deleted && item.orderedByUserId === currentUserData.uid,
			).length || 0
		);
	}, [pickupEnabled, pickupItems, currentUserData?.uid]);

	// Prefer showing the basket FAB for whichever flow currently has items
	const basketCount = pickupEnabled
		? pickupBasketCount > 0
			? pickupBasketCount
			: dineInBasketCount
		: dineInBasketCount;
	const hasDineInTable =
		checkInStatus === "ACCEPTED" || Boolean(dineInParty?.table?.id);

	const basketTargetMode = hasDineInTable
		? "dineIn"
		: pickupEnabled && pickupBasketCount > 0
			? "pickup"
			: "dineIn";

	useEffect(() => {
		if (!restaurant?.id) {
			setIsLoadingRestaurant(false);
			return;
		}

		setIsLoadingRestaurant(true);

		const restaurantRef = db.collection("restaurants").doc(restaurant.id);
		const unsubscribe = restaurantRef.onSnapshot(
			(docSnap) => {
				if (docSnap.exists) {
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

	useEffect(() => {
		let isMounted = true;

		const loadMenu = async () => {
			if (!restaurant?.id) {
				if (isMounted) {
					setMenuItems([]);
					setIsLoadingMenu(false);
				}
				return;
			}

			setIsLoadingMenu(true);

			try {
				const fetchedMenu = await fetchMenu(restaurant.id);

				if (isMounted) {
					setMenuItems(Array.isArray(fetchedMenu) ? fetchedMenu : []);
				}
			} catch (error) {
				console.error("RestaurantDetailScreen: Error fetching menu:", error);

				if (isMounted) {
					Alert.alert(
						t("error_title", "Error"),
						t("could_not_load_menu_items", "Could not load menu items."),
					);
					setMenuItems([]);
				}
			} finally {
				if (isMounted) {
					setIsLoadingMenu(false);
				}
			}
		};

		loadMenu();

		return () => {
			isMounted = false;
		};
	}, [restaurant?.id, t]);

	useEffect(() => {
		if (!restaurant?.id || !currentUserData?.uid || currentUserData?.role !== "customer") {
			setActiveReservation(null);
			return undefined;
		}

		const unsubscribe = db
			.collection("reservations")
			.where("customerId", "==", currentUserData.uid)
			.where("restaurantId", "==", restaurant.id)
			.onSnapshot(
				(snapshot) => {
					const active = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.filter((reservation) =>
							["requested", "confirmed", "arrival_requested", "seated"].includes(
								reservation.status,
							),
						)
						.sort((a, b) =>
							`${a.requestedDate || ""} ${a.requestedTime || ""}`.localeCompare(
								`${b.requestedDate || ""} ${b.requestedTime || ""}`,
							),
						);
					setActiveReservation(active[0] || null);
				},
				(error) => {
					console.error("Error loading active restaurant reservation:", error);
					setActiveReservation(null);
				},
			);

		return () => unsubscribe();
	}, [currentUserData?.role, currentUserData?.uid, restaurant?.id]);

	useEffect(() => {
		hasAttemptedAutoActivateRef.current = false;
	}, [dineInPartyId]);

	// Only auto-activate dine-in parties
	useEffect(() => {
		if (!dineInPartyId || !dineInParty || hasAttemptedAutoActivateRef.current) {
			return;
		}

		const shouldAutoActivate =
			checkInStatus === "ACCEPTED" &&
			!!checkInObj?.id &&
			dineInParty?.id === dineInPartyId &&
			dineInParty?.status === "pending" &&
			dineInParty?.restaurantId === restaurant?.id &&
			dineInParty?.hostUserId === currentUserData?.uid;

		if (!shouldAutoActivate) return;

		hasAttemptedAutoActivateRef.current = true;

		(async () => {
			try {
				await activatePartyCheckIn(checkInObj.id, dineInPartyId);
			} catch (error) {
				console.error("Failed to auto-activate party check-in:", error);
				hasAttemptedAutoActivateRef.current = false;
			}
		})();
	}, [
		checkInStatus,
		checkInObj?.id,
		dineInPartyId,
		dineInParty,
		restaurant?.id,
		currentUserData?.uid,
		activatePartyCheckIn,
	]);

	const handleRequireAuth = () => {
		setIsAuthModalVisible(true);
	};

	const getRestaurantDisplayName = () =>
		liveRestaurantData?.restaurantName ||
		liveRestaurantData?.name ||
		restaurant?.restaurantName ||
		restaurant?.name ||
		t("restaurant", "Restaurant");

	const getItbmsRateFromCategory = (categoryValue) => {
		const category = String(categoryValue || "")
			.trim()
			.toLowerCase();

		const isAlcohol =
			category === "beer" ||
			category === "wine" ||
			category === "cocktails" ||
			category === "spirits" ||
			category === "alcoholic drinks";

		return isAlcohol ? 10 : 7;
	};

	const getOrCreateDineInParty = async () => {
		if (!restaurant?.id) return null;
		if (dineInPartyId) return dineInPartyId;

		return createParty(restaurant.id, getRestaurantDisplayName(), {
			orderMode: "dineIn",
			fulfillmentType: "table",
			joinable: true,
		});
	};

	const handleAddDineInMenuItem = async (itemDataFromModal) => {
		if (currentUserData?.role === "guest") {
			handleRequireAuth();
			throw new Error("Authentication required.");
		}

		if (!restaurant?.id || !currentUserData?.uid) {
			throw new Error(t("restaurant_data_not_found", "Restaurant not found"));
		}

		if (isAddingDineInItem) {
			throw new Error(t("please_wait", "Please Wait"));
		}

		setIsAddingDineInItem(true);

		try {
			const resolvedPartyId = await getOrCreateDineInParty();

			if (!resolvedPartyId) {
				throw new Error(
					t("could_not_create_party", "Could not create your basket."),
				);
			}

			const menuItemDetails = itemDataFromModal?.menuItemDetails || {};
			const targets =
				Array.isArray(itemDataFromModal?.individualPips) &&
				itemDataFromModal.individualPips.length > 0
					? itemDataFromModal.individualPips
					: [
							{
								name:
									currentUserData?.fullName ||
									currentUserData?.firstName ||
									t("myself", "Myself"),
								specialInstructions: "",
							},
						];

			for (const target of targets) {
				await addItemToPartyBasket(
					{
						partyId: resolvedPartyId,
						orderingForUserId: currentUserData.uid,
						orderingForPipName:
							target?.name ||
							currentUserData?.fullName ||
							currentUserData?.firstName ||
							t("myself", "Myself"),
					},
					{
						id: menuItemDetails.id,
						name: menuItemDetails.name,
						price:
							menuItemDetails.finalUnitPrice !== undefined &&
							menuItemDetails.finalUnitPrice !== null
								? menuItemDetails.finalUnitPrice
								: menuItemDetails.price,
						basePrice:
							menuItemDetails.basePrice !== undefined &&
							menuItemDetails.basePrice !== null
								? menuItemDetails.basePrice
								: menuItemDetails.price || 0,
						modifiersTotal:
							menuItemDetails.modifiersTotal !== undefined &&
							menuItemDetails.modifiersTotal !== null
								? menuItemDetails.modifiersTotal
								: 0,
						selectedModifiers: Array.isArray(
							menuItemDetails.selectedModifiers,
						)
							? menuItemDetails.selectedModifiers
							: [],
						category: menuItemDetails.category,
						quantity: itemDataFromModal?.quantity || 1,
						specialInstructions: target?.specialInstructions || "",
						restaurantId: menuItemDetails.restaurantId || restaurant.id,
						imageUri: menuItemDetails.imageUri || menuItemDetails.image || null,
						itbmsRate: getItbmsRateFromCategory(menuItemDetails.category),
					},
				);
			}
		} finally {
			setIsAddingDineInItem(false);
		}
	};

	const handleStartDineIn = () => {
		if (currentUserData?.role === "guest") {
			handleRequireAuth();
			return;
		}

		navigation.navigate("QRScannerScreen", {
			restaurantId: restaurant.id,
			restaurantName: getRestaurantDisplayName(),
			partyId: dineInPartyId,
		});
	};

	const handleStartParty = async () => {
		if (currentUserData?.role === "guest") {
			handleRequireAuth();
			return;
		}

		if (isAddingDineInItem || isLoadingParty) return;

		setIsAddingDineInItem(true);
		try {
			const resolvedPartyId = await getOrCreateDineInParty();

			if (!resolvedPartyId) {
				Alert.alert(
					t("error_title", "Error"),
					t("could_not_create_party", "Could not create your party."),
				);
				return;
			}

			navigation.navigate("PartyTab", {
				screen: "PartySession",
				params: {
					partyId: resolvedPartyId,
					restaurantId: restaurant.id,
				},
			});
		} catch (error) {
			Alert.alert(
				t("error_title", "Error"),
				error?.message ||
					t("could_not_create_party", "Could not create your party."),
			);
		} finally {
			setIsAddingDineInItem(false);
		}
	};

	const handleViewDineInParty = () => {
		if (!dineInPartyId) return;

		navigation.navigate("PartyTab", {
			screen: "PartySession",
			params: {
				partyId: dineInPartyId,
			},
		});
	};

	const handleOpenReservationRequest = () => {
		if (currentUserData?.role === "guest") {
			handleRequireAuth();
			return;
		}

		if (activeReservation) {
			if (activeReservation.status === "seated" && activeReservation.partyId) {
				navigation.navigate("PartyTab", {
					screen: "PartySession",
					params: { partyId: activeReservation.partyId },
				});
				return;
			}
			navigation.navigate("AccountScreen", {
				screen: "CustomerReservationsScreen",
			});
			return;
		}

		navigation.navigate("ReservationRequest", {
			restaurant: liveRestaurantData || restaurant,
		});
	};

	const handleOpenHostCheckInRequest = () => {
		if (currentUserData?.role === "guest") {
			handleRequireAuth();
			return;
		}
		if (hasActiveHostCheckInRequest) {
			Alert.alert(
				t("check_in_request_sent", "Check-in request sent"),
				t(
					"host_has_your_request",
					"The host already has your request and will seat you soon.",
				),
			);
			return;
		}

		navigation.navigate("HostCheckInRequest", {
			restaurant: liveRestaurantData || restaurant,
		});
	};

	const handleOpenPickupFlow = async () => {
		if (!pickupEnabled) return;

		if (!restaurant?.id) {
			Alert.alert(
				t("error_title", "Error"),
				t("restaurant_data_not_found", "Restaurant not found"),
			);
			return;
		}

		if (currentUserData?.role === "guest") {
			handleRequireAuth();
			return;
		}

		// Existing pickup with items -> go to cart
		if (pickupPartyId && pickupBasketCount > 0) {
			navigation.navigate("PartyTab", {
				screen: "PickupCart",
				params: {
					partyId: pickupPartyId,
					restaurantId: restaurant.id,
				},
			});
			return;
		}

		// Existing pickup without items -> go to menu
		if (pickupPartyId) {
			navigation.navigate("PartyTab", {
				screen: "PartyMenu",
				params: {
					partyId: pickupPartyId,
					restaurantId: restaurant.id,
				},
			});
			return;
		}

		// No pickup yet -> create/reuse one
		if (isStartingPickup) return;

		setIsStartingPickup(true);
		try {
			const resolvedPickupPartyId = await getOrCreatePickupParty(
				restaurant.id,
				liveRestaurantData?.restaurantName ||
					liveRestaurantData?.name ||
					restaurant?.restaurantName ||
					restaurant?.name ||
					"Restaurant",
			);

			if (!resolvedPickupPartyId) {
				Alert.alert(
					t("error_title", "Error"),
					t("could_not_start_pickup_order", "Could not start pickup order."),
				);
				return;
			}

			navigation.navigate("PartyTab", {
				screen: "PartyMenu",
				params: {
					partyId: resolvedPickupPartyId,
					restaurantId: restaurant.id,
				},
			});
		} catch (error) {
			console.error("Error starting pickup:", error);
			Alert.alert(
				t("error_title", "Error"),
				error?.message ||
					t("could_not_start_pickup_order", "Could not start pickup order."),
			);
		} finally {
			setIsStartingPickup(false);
		}
	};

	const handlePrimaryFabPress = () => {
		if (pickupEnabled && basketTargetMode === "pickup" && pickupPartyId) {
			navigation.navigate("PartyTab", {
				screen: "PickupCart",
				params: {
					partyId: pickupPartyId,
					restaurantId: restaurant?.id,
				},
			});
			return;
		}

		if (dineInPartyId) {
			navigation.navigate("PartyTab", {
				screen: "PartySession",
				params: {
					partyId: dineInPartyId,
				},
			});
			return;
		}

		if (pickupEnabled && pickupPartyId) {
			navigation.navigate("PartyTab", {
				screen: "PickupCart",
				params: {
					partyId: pickupPartyId,
					restaurantId: restaurant?.id,
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
							if (dineInPartyId) {
								const leftParty = await leaveParty(dineInPartyId);
								if (!leftParty) {
									return;
								}
							}

							await customerCancelSeatedCheckIn({ checkInId: checkInObj.id });
						} catch (error) {
							Alert.alert(
								t("error_title", "Error"),
								error?.message ||
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
		if (!checkInObj?.id || isProcessingCheckInAction || !restaurant?.id) return;

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
				error?.message ||
					t(
						"an_error_occurred_while_cancelling_check_in_message",
						"An error occurred while cancelling.",
					),
			);
		} finally {
			setIsProcessingCheckInAction(false);
		}
	};

	const renderActionButtons = () => {
		if (isLoadingCheckInStatus || isLoadingParty || isLoadingRestaurant) {
			return (
				<View style={styles.actionsRow}>
					<ActivityIndicator size="small" color={colors.primary} />
				</View>
			);
		}

		const hasDineInTable =
			checkInStatus === "ACCEPTED" || Boolean(dineInParty?.table?.id);

		if (
			!isOrderingAvailable &&
			!reservationsEnabled &&
			!hostCheckInEnabled &&
			!pickupEnabled
		) {
			return (
				<View style={styles.discoveryOnlyPanel}>
					<MaterialCommunityIcons
						name="silverware-clean"
						size={24}
						color={colors.primary}
					/>
					<View style={styles.discoveryOnlyTextWrap}>
						<Text style={styles.discoveryOnlyTitle}>
							{t("discovery_profile_title", "Menu and reviews")}
						</Text>
						<Text style={styles.discoveryOnlySubtitle}>
							{t(
								"discovery_profile_subtitle",
								"This restaurant is listed for food discovery. Ordering, check-in, rewards, and reservations are not enabled yet.",
							)}
						</Text>
						<TouchableOpacity
							style={styles.claimRestaurantButton}
							activeOpacity={0.78}
							onPress={handleClaimRestaurant}
						>
							<Text style={styles.claimRestaurantButtonText}>
								{t("claim_this_restaurant", "Own this restaurant? Claim it")}
							</Text>
							<MaterialCommunityIcons
								name="arrow-right"
								size={16}
								color={colors.primary}
							/>
						</TouchableOpacity>
					</View>
				</View>
			);
		}

		// 1. FULLY SEATED DINE-IN SESSION
		if (hasDineInTable) {
			return (
				<View style={styles.actionsRow}>
					<TouchableOpacity
						style={styles.actionButtonCheckedIn}
						onPress={handleViewDineInParty}
						activeOpacity={0.85}
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
						) : dineInParty?.table?.name ? (
							<Text style={styles.tableText}>{dineInParty.table.name}</Text>
						) : null}
					</TouchableOpacity>

					{pickupEnabled && (
						<TouchableOpacity
							style={styles.secondaryActionButton}
							onPress={handleOpenPickupFlow}
							activeOpacity={0.85}
						>
							<MaterialCommunityIcons
								name={pickupBasketCount > 0 ? "basket" : "shopping-outline"}
								size={20}
								color={colors.primary}
							/>
							<Text style={styles.secondaryActionButtonText}>
								{pickupBasketCount > 0
									? t("continue_pickup_order", "Continue Pickup")
									: t("pickup", "Pickup")}
							</Text>
						</TouchableOpacity>
					)}

					{checkInStatus === "ACCEPTED" && (
						<TouchableOpacity
							style={styles.cancelButton}
							onPress={handleLeaveTable}
							disabled={isProcessingCheckInAction}
							activeOpacity={0.85}
						>
							{isProcessingCheckInAction ? (
								<ActivityIndicator size="small" color="#fff" />
							) : (
								<>
									<MaterialCommunityIcons
										name="exit-run"
										size={24}
										color="#fff"
									/>
									<Text style={styles.cancelButtonText}>
										{t("leave_table_button", "Leave Table")}
									</Text>
								</>
							)}
						</TouchableOpacity>
					)}
				</View>
			);
		}

		// 2. WAITING TO BE SEATED
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

					{pickupEnabled && (
						<TouchableOpacity
							style={styles.secondaryActionButton}
							onPress={handleOpenPickupFlow}
							activeOpacity={0.85}
						>
							<MaterialCommunityIcons
								name={pickupBasketCount > 0 ? "basket" : "shopping-outline"}
								size={20}
								color={colors.primary}
							/>
							<Text style={styles.secondaryActionButtonText}>
								{pickupBasketCount > 0
									? t("continue_pickup_order", "Continue Pickup")
									: t("pickup", "Pickup")}
							</Text>
						</TouchableOpacity>
					)}

					<TouchableOpacity
						style={styles.cancelButton}
						onPress={handleCancelIndividualCheckIn}
						disabled={isProcessingCheckInAction}
						activeOpacity={0.85}
					>
						{isProcessingCheckInAction ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<>
								<MaterialCommunityIcons name="cancel" size={24} color="#fff" />
								<Text style={styles.cancelButtonText}>
									{t("cancel_button", "Cancel")}
								</Text>
							</>
						)}
					</TouchableOpacity>
				</View>
			);
		}

		// 3. DINE-IN PRE-BUILD + PICKUP ALWAYS AVAILABLE
		if (dineInPartyId && !hasDineInTable) {
			return (
				<View style={styles.actionsRow}>
					<View style={styles.prebuiltBasketPanel}>
						<View style={styles.prebuiltBasketInfo}>
							<View style={styles.prebuiltBasketIcon}>
								<MaterialCommunityIcons
									name="basket-outline"
									size={22}
									color={colors.primary}
								/>
							</View>
							<View style={styles.prebuiltBasketTextWrap}>
								<Text style={styles.prebuiltBasketTitle}>
									{t("party_started_title", "Party started")}
								</Text>
								<Text style={styles.prebuiltBasketSubtitle} numberOfLines={1}>
									{t("items_ready_to_scan", {
										count: dineInBasketCount,
										defaultValue:
											dineInBasketCount === 1
												? "1 item saved for dine-in"
												: dineInBasketCount > 1
													? `${dineInBasketCount} items saved for dine-in`
													: "Invite PIPs or build the basket before you arrive",
									})}
								</Text>
							</View>
						</View>

						{qrSelfCheckInEnabled ? (
							<TouchableOpacity
								style={styles.compactScanButton}
								onPress={handleStartDineIn}
								activeOpacity={0.85}
							>
								<MaterialCommunityIcons
									name="qrcode-scan"
									size={20}
									color="#fff"
								/>
								<Text style={styles.compactScanText} numberOfLines={1}>
									{t("scan_table", "Scan Table")}
								</Text>
							</TouchableOpacity>
						) : null}
					</View>

					<View style={styles.compactActionRow}>
						<TouchableOpacity
							style={styles.compactSecondaryButton}
							onPress={handleViewDineInParty}
							activeOpacity={0.85}
						>
							<MaterialCommunityIcons
								name="party-popper"
								size={18}
								color={colors.primary}
							/>
							<Text style={styles.compactSecondaryText} numberOfLines={1}>
								{t("party_room", "Party Room")}
							</Text>
						</TouchableOpacity>

						{pickupEnabled && (
							<TouchableOpacity
								style={styles.compactSecondaryButton}
								onPress={handleOpenPickupFlow}
								disabled={isStartingPickup}
								activeOpacity={0.85}
							>
								{isStartingPickup ? (
									<ActivityIndicator size="small" color={colors.primary} />
								) : (
									<>
										<MaterialCommunityIcons
											name={
												pickupBasketCount > 0
													? "basket"
													: "shopping-outline"
											}
											size={18}
											color={colors.primary}
										/>
										<Text
											style={styles.compactSecondaryText}
											numberOfLines={1}
										>
											{pickupBasketCount > 0
												? t("continue_pickup_order", "Continue Pickup")
												: t("pickup", "Pickup")}
										</Text>
									</>
								)}
							</TouchableOpacity>
						)}
					</View>
				</View>
			);
		}

		// 4. DEFAULT STATE: always show both
		return (
			<View style={styles.actionsRow}>
				{isOrderingAvailable ? (
					<TouchableOpacity
						style={styles.primaryScanButton}
						onPress={handleStartParty}
						disabled={isAddingDineInItem}
						activeOpacity={0.85}
					>
						{isAddingDineInItem ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<>
								<MaterialCommunityIcons
									name="party-popper"
									size={22}
									color="#fff"
								/>
								<Text style={styles.primaryScanText} numberOfLines={1}>
									{t("start_party", "Start Party")}
								</Text>
							</>
						)}
					</TouchableOpacity>
				) : null}

				{qrSelfCheckInEnabled || pickupEnabled ? (
				<View style={styles.compactActionRow}>
					{qrSelfCheckInEnabled ? (
						<TouchableOpacity
							style={styles.compactSecondaryButton}
							onPress={handleStartDineIn}
							activeOpacity={0.85}
						>
							<MaterialCommunityIcons
								name="qrcode-scan"
								size={18}
								color={colors.primary}
							/>
							<Text style={styles.compactSecondaryText} numberOfLines={1}>
								{t("scan_table", "Scan Table")}
							</Text>
						</TouchableOpacity>
					) : null}
					{pickupEnabled && (
						<TouchableOpacity
							style={styles.compactSecondaryButton}
							onPress={handleOpenPickupFlow}
							disabled={isStartingPickup}
							activeOpacity={0.85}
						>
							{isStartingPickup ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<>
									<MaterialCommunityIcons
										name={
											pickupBasketCount > 0
												? "basket"
												: "shopping-outline"
										}
										size={20}
										color={colors.primary}
									/>
									<Text
										style={styles.compactSecondaryText}
										numberOfLines={1}
									>
										{pickupBasketCount > 0
											? t("continue_pickup_order", "Continue Pickup")
											: t("pickup", "Pickup")}
									</Text>
								</>
							)}
						</TouchableOpacity>
					)}
				</View>
				) : null}
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
					<>
						<RestaurantHeader
							restaurant={liveRestaurantData || restaurant}
							initialView={initialView}
							renderActionButtons={renderActionButtons}
						/>
						{reservationsEnabled || hostCheckInEnabled ? (
							<View style={styles.actionPanel}>
								<View style={styles.actionPanelHeader}>
									<Text style={styles.actionPanelTitle}>
										{t("visit_options", "Visit Options")}
									</Text>
									<Text style={styles.actionPanelHint}>
										{experienceConfig.hospitalityStyle === "fine_dining"
											? t("premium_hosted_visit", "Hosted arrival")
											: t("choose_how_to_visit", "Choose your flow")}
									</Text>
								</View>
								{reservationsEnabled ? (
									<TouchableOpacity
										style={[
											styles.reservationButton,
											reservationStatusCopy.tone === "warning" &&
												styles.reservationButtonWarning,
											reservationStatusCopy.tone === "success" &&
												styles.reservationButtonSuccess,
										]}
										onPress={handleOpenReservationRequest}
										activeOpacity={0.85}
									>
										<MaterialCommunityIcons
											name={reservationStatusCopy.icon}
											size={20}
											color={
												reservationStatusCopy.tone === "warning"
													? colors.statusWarning
													: reservationStatusCopy.tone === "success"
														? colors.statusSuccess
														: colors.primary
											}
										/>
										<View style={styles.reservationTextWrap}>
											<Text style={styles.reservationButtonTitle}>
												{reservationStatusCopy.title}
											</Text>
											<Text style={styles.reservationButtonSubtitle}>
												{reservationStatusCopy.subtitle}
											</Text>
										</View>
										<MaterialCommunityIcons
											name="chevron-right"
											size={20}
											color={colors.textLight}
										/>
									</TouchableOpacity>
								) : null}
								{hostCheckInEnabled ? (
									<TouchableOpacity
										style={[
											styles.reservationButton,
											!reservationsEnabled && styles.firstVisitOption,
											hasActiveHostCheckInRequest &&
												styles.reservationButtonDisabled,
										]}
										onPress={handleOpenHostCheckInRequest}
										disabled={hasActiveHostCheckInRequest}
										activeOpacity={0.85}
									>
										<MaterialCommunityIcons
											name={
												hasActiveHostCheckInRequest
													? "clock-check-outline"
													: "account-arrow-right-outline"
											}
											size={20}
											color={
												hasActiveHostCheckInRequest
													? colors.textMedium
													: colors.primary
											}
										/>
										<View style={styles.reservationTextWrap}>
											<Text style={styles.reservationButtonTitle}>
												{hasActiveHostCheckInRequest
													? t("check_in_request_sent", "Check-In Requested")
													: t("request_check_in", "Request Check-In")}
											</Text>
											<Text style={styles.reservationButtonSubtitle}>
												{hasActiveHostCheckInRequest
													? t(
															"host_has_your_request",
															"The host has your request and will seat you soon.",
														)
													: t(
															"host_check_in_request",
															"Let the host assign your table and server.",
														)}
											</Text>
										</View>
										<MaterialCommunityIcons
											name={
												hasActiveHostCheckInRequest
													? "check-circle-outline"
													: "chevron-right"
											}
											size={20}
											color={
												hasActiveHostCheckInRequest
													? colors.statusSuccess
													: colors.textLight
											}
										/>
									</TouchableOpacity>
								) : null}
							</View>
						) : null}
					</>
				}
				onConfirmAddItemToContext={handleAddDineInMenuItem}
				isOrderingAvailable={isOrderingAvailable}
				restaurantName={getRestaurantDisplayName()}
			/>

			{currentUserData?.role === "customer" && basketCount > 0 && (
				<TouchableOpacity
					style={styles.fabContainer}
					onPress={handlePrimaryFabPress}
					activeOpacity={0.9}
				>
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

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	actionPanel: {
		marginHorizontal: 15,
		marginTop: 14,
		marginBottom: 10,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		overflow: "hidden",
	},
	actionPanelHeader: {
		paddingHorizontal: 14,
		paddingTop: 13,
		paddingBottom: 10,
		backgroundColor: colors.backgroundLight,
	},
	actionPanelTitle: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textDark,
		textTransform: "uppercase",
	},
	actionPanelHint: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 3,
	},
	reservationButton: {
		paddingHorizontal: 14,
		paddingVertical: 15,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		flexDirection: "row",
		alignItems: "center",
	},
	reservationButtonWarning: {
		backgroundColor: colors.statusWarning + "12",
		borderTopColor: colors.statusWarning + "55",
	},
	reservationButtonSuccess: {
		backgroundColor: colors.statusSuccess + "12",
		borderTopColor: colors.statusSuccess + "55",
	},
	firstVisitOption: {
		borderTopWidth: 1,
	},
	reservationButtonDisabled: {
		backgroundColor: colors.backgroundLight,
		opacity: 0.75,
	},
	reservationTextWrap: {
		flex: 1,
		marginHorizontal: 10,
	},
	reservationButtonTitle: {
		fontSize: 15,
		fontWeight: "900",
		color: colors.textDark,
	},
	reservationButtonSubtitle: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
		lineHeight: 17,
	},
	actionsRow: {
		paddingVertical: 15,
		paddingHorizontal: 15,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: colors.borderLight,
		marginBottom: 10,
	},
	discoveryOnlyPanel: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		marginHorizontal: 15,
		marginTop: 12,
		marginBottom: 10,
		padding: 14,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#D4EAEA",
		backgroundColor: "#EAF5F5",
	},
	discoveryOnlyTextWrap: {
		flex: 1,
	},
	discoveryOnlyTitle: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
	},
	discoveryOnlySubtitle: {
		fontSize: 12,
		lineHeight: 17,
		color: colors.textMedium,
		marginTop: 3,
	},
	claimRestaurantButton: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 10,
		paddingHorizontal: 11,
		paddingVertical: 8,
		borderRadius: 8,
		backgroundColor: colors.primary + "12",
	},
	claimRestaurantButtonText: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.primary,
	},
	splitActionsRow: {
		flexDirection: "row",
		alignItems: "stretch",
		columnGap: 10,
	},
	splitActionButton: {
		flex: 1,
	},
	splitActionButtonText: {
		fontSize: 14,
		marginLeft: 6,
	},
	primaryScanButton: {
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
	secondaryPickupButton: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.primary,
		shadowColor: "transparent",
		elevation: 0,
	},
	secondaryPickupText: {
		color: colors.primary,
	},
	prebuiltBasketPanel: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 10,
		padding: 10,
	},
	prebuiltBasketInfo: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		marginRight: 10,
	},
	prebuiltBasketIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: colors.primary + "14",
		justifyContent: "center",
		alignItems: "center",
		marginRight: 10,
	},
	prebuiltBasketTextWrap: {
		flex: 1,
	},
	prebuiltBasketTitle: {
		fontSize: 15,
		fontWeight: "700",
		color: colors.textDark,
	},
	prebuiltBasketSubtitle: {
		marginTop: 2,
		fontSize: 12,
		color: colors.textMedium,
	},
	compactScanButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.primary,
		borderRadius: 8,
		paddingVertical: 10,
		paddingHorizontal: 12,
		minWidth: 118,
	},
	compactScanText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "700",
		marginLeft: 6,
	},
	compactActionRow: {
		flexDirection: "row",
		columnGap: 10,
		marginTop: 10,
	},
	compactSecondaryButton: {
		flex: 1,
		minHeight: 40,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 10,
	},
	compactSecondaryText: {
		color: colors.primary,
		fontSize: 13,
		fontWeight: "700",
		marginLeft: 6,
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
		textAlign: "center",
	},
	tableText: {
		fontSize: 12,
		color: colors.statusSuccess,
		fontWeight: "600",
		marginTop: 2,
	},
	secondaryActionButton: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		paddingHorizontal: 14,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.primary,
		marginRight: 10,
	},
	secondaryActionButtonText: {
		marginTop: 4,
		fontSize: 12,
		color: colors.primary,
		fontWeight: "bold",
		textAlign: "center",
	},
	cancelButton: {
		flex: 0.4,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		backgroundColor: colors.danger || "#dc3545",
		borderRadius: 8,
		minWidth: 90,
	},
	cancelButtonText: {
		marginTop: 4,
		fontSize: 12,
		color: "#ffffff",
		fontWeight: "bold",
		textAlign: "center",
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
	fabContent: {
		justifyContent: "center",
		alignItems: "center",
	},
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
	badgeText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "bold",
	},
});

export default RestaurantDetailScreen;
