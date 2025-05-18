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
	Image,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Modal,
	TextInput,
	ScrollView,
	Alert,
	SafeAreaView, // Added SafeAreaView
	// Removed Button from react-native
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { AuthContext } from "../../context/authContext";
import { PartyContext, useParty } from "../../context/customer/PartyContext"; // Ensure useParty is exported if preferred
import { useBasket } from "../../context/customer/BasketContext";
import colors from "../../utils/styles/appStyles";
import {
	checkIn, // Your utility to create a check-in
	fetchMenu,
	handleCancelCheckIn, // Your utility to cancel a check-in
	useCheckInStatus,
} from "../../utils/customerUtils";
import MenuItemsList from "./MenuItemsList"; // Assuming this is your menu component
import { db } from "../../config/firebase";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Yup from "yup";
import { Formik } from "formik";
import { Button as PaperButton } from "react-native-paper"; // Using Paper Button for consistent styling
import { collection, onSnapshot } from "firebase/firestore";

const RestaurantDetailScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { restaurant, initialView } = route.params; // Expects { id, name, taxRate, imageUri, address, city, state, zipcode, cuisineType }

	const { currentUserData } = useContext(AuthContext);
	const { baskets, addItemToBasket: addItemToIndividualBasketFromContext } =
		useBasket(); // For individual basket count

	const {
		createParty,
		isLoadingParty, // Loading state from PartyContext for party creation
		currentPartyId,
		partyDetails, // Details of the current party from context // Function from context
		activatePartyCheckIn, // Function from context
	} = useParty(); // Using the custom hook

	// Local loading states for this screen's specific actions
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);
	const [isProcessingAction, setIsProcessingAction] = useState(false);
	const [isProcessingCheckInAction, setIsProcessingCheckInAction] =
		useState(false);
	const [isStartingPartyProcess, setIsStartingPartyProcess] = useState(false);
	const [userPips, setUserPips] = useState([]);

	// --- Call useCheckInStatus unconditionally at the top ---
	const {
		checkInStatus, // "REQUESTED", "ACCEPTED", "NONE", "ERROR"
		tableNumber, // Table name if ACCEPTED
		isLoading: isLoadingCheckInStatus, // Loading state for check-in status hook
		checkInObj, // Full checkIn document from Firestore
	} = useCheckInStatus(
		currentUserData?.role === "customer" && restaurant?.id
			? restaurant.id
			: null,
		currentUserData?.role === "customer" && currentUserData?.uid
			? currentUserData.uid
			: null
	);

	const restaurantBasket = useMemo(() => {
		return baskets && restaurant?.id ? baskets[restaurant.id] : { items: [] };
	}, [baskets, restaurant?.id]);
	const basketCount = restaurantBasket?.items?.length || 0;

	// Fetch user's PIPs (needed by MenuItemsList for SelectedItemModal)
	useEffect(() => {
		if (currentUserData?.uid && currentUserData.role !== "guest") {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			const unsubscribe = onSnapshot(
				pipsRef,
				(snapshot) => {
					setUserPips(
						snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
					);
				},
				(error) => {
					console.error("RestaurantDetailScreen: Error fetching PIPs:", error);
					setUserPips([]);
				}
			);
			return () => unsubscribe();
		} else {
			setUserPips([]);
		}
	}, [currentUserData?.uid]);

	// Effect to fetch menu items for the restaurant
	useEffect(() => {
		let isMounted = true;
		const loadMenu = async () => {
			if (!restaurant?.id) {
				if (isMounted) setIsLoadingMenu(false);
				return;
			}
			setIsLoadingMenu(true);
			try {
				const fetchedMenu = await fetchMenu(restaurant.id);
				if (isMounted) setMenuItems(fetchedMenu);
			} catch (error) {
				console.log("Error fetching menu:", error);
				// Handle menu fetch error if needed (e.g., set an error state)
			} finally {
				if (isMounted) setIsLoadingMenu(false);
			}
		};
		loadMenu();
		return () => {
			isMounted = false;
		};
	}, [restaurant?.id]);

	// --- Effect to potentially activate party after host's individual check-in ---
	useEffect(() => {
		// Only attempt to activate if all conditions are met
		if (
			checkInStatus === "ACCEPTED" && // 1. Host's INDIVIDUAL check-in is now accepted
			checkInObj?.id && // 2. We have the check-in document ID
			currentPartyId && // 3. User is currently associated with a party in context
			partyDetails?.id === currentPartyId && // 4. The details for that party are loaded
			partyDetails?.status === "pending" && // 5. That party is still pending activation
			partyDetails?.restaurantId === restaurant?.id && // 6. The party is for the current restaurant
			partyDetails?.hostUserId === currentUserData?.uid // 7. The current user IS the host of that party
		) {
			console.log(
				`RestaurantDetail: Host check-in ACCEPTED, attempting to activate party ${currentPartyId} with checkIn ${checkInObj.id}`
			);
			activatePartyCheckIn(checkInObj.id); // Call context function
		}
	}, [
		checkInStatus,
		checkInObj?.id,
		currentPartyId,
		partyDetails, // Listen to the whole partyDetails object for changes
		restaurant?.id,
		currentUserData?.uid,
		activatePartyCheckIn,
	]);

	const openModal = () => setIsModalVisible(true);
	const closeModal = () => setIsModalVisible(false);

	// Function to handle individual check-in request
	const handlePersonalCheckinSubmit = async (values) => {
		if (
			isLoadingCheckInStatus ||
			isProcessingCheckInAction ||
			checkInStatus === "REQUESTED" ||
			checkInStatus === "ACCEPTED"
		) {
			return;
		}
		if (
			currentPartyId &&
			partyDetails?.restaurantId === restaurant.id &&
			(partyDetails?.status === "active" || partyDetails?.status === "pending")
		) {
			Alert.alert(
				"In a Party",
				"You are already in a party at this restaurant. Manage your party from the Party Hub."
			);
			closeModal();
			return;
		}

		setIsProcessingCheckInAction(true);
		const customerName = `${currentUserData.firstName || ""} ${
			currentUserData.lastName || ""
		}`.trim();
		try {
			const { success, checkInId } = await checkIn(
				restaurant.id,
				currentUserData.uid,
				values.partySize,
				customerName
			);
			if (success && checkInId) {
				console.log("Personal check-in requested successfully:", checkInId);
			} else {
				Alert.alert(
					"Check-In Failed",
					"Could not submit check-in request. Please try again."
				);
			}
		} catch (error) {
			console.error("Error during personal check-in:", error);
			Alert.alert("Error", `An error occurred: ${error.message}`);
		} finally {
			setIsProcessingCheckInAction(false);
			closeModal();
		}
	};

	const handleCancelIndividualCheckIn = async () => {
		if (!checkInObj?.id || isProcessingCheckInAction) return;
		setIsProcessingCheckInAction(true);
		try {
			const success = await handleCancelCheckIn(
				restaurant.id,
				currentUserData.uid,
				checkInObj.id
			);
			if (success) {
				Alert.alert("Success", "Your check-in request has been cancelled.");
			} else {
				Alert.alert("Error", "Could not cancel check-in request.");
			}
		} catch (error) {
			console.error("Error canceling check-in:", error);
			Alert.alert(
				"Error",
				"An error occurred while canceling your check-in request."
			);
		} finally {
			setIsProcessingCheckInAction(false);
		}
	};

	// --- Function to handle starting a party ---
	const handleStartParty = async () => {
		if (!currentUserData) {
			Alert.alert("Login Required", "Please log in to start a party.");
			return;
		}
		if (!restaurant?.id) {
			Alert.alert("Error", "Restaurant details missing.");
			return;
		}
		if (
			isLoadingParty ||
			isLoadingCheckInStatus ||
			checkInStatus === "REQUESTED" ||
			checkInStatus === "ACCEPTED" ||
			currentPartyId
		) {
			console.log(
				"Cannot start party: Action in progress, already checked in, or already in a party."
			);
			if (currentPartyId) {
				Alert.alert(
					"Already in a Party",
					"You are already in a party. Go to the Party Hub to manage it."
				);
			} else if (
				checkInStatus === "REQUESTED" ||
				checkInStatus === "ACCEPTED"
			) {
				Alert.alert(
					"Already Checked In",
					"You are already checked in or have a pending check-in at this restaurant."
				);
			}
			return;
		}
		setIsStartingPartyProcess(true);
		try {
			console.log(
				`RestaurantDetail: Calling createParty for restaurant: ${restaurant.id}`
			);
			const newPartyId = await createParty(restaurant.id); // Context calls CF

			if (newPartyId) {
				console.log(
					`RestaurantDetail: Party created ${newPartyId}. Navigating to Party Hub.`
				);
				navigation.navigate("PartyTab", {
					// Navigate to the Tab
					screen: "PartySession", // Navigate to the screen within the Tab's stack
				});
			} else {
				// PartyContext's createParty function should handle its own errors and show Alerts
				console.log(
					"RestaurantDetail: createParty did not return a newPartyId. Error likely handled by context."
				);
			}
		} catch (error) {
			// Catch unexpected errors from createParty itself, though context should also handle
			console.error(
				"RestaurantDetail: Unexpected error in handleStartParty:",
				error
			);
			Alert.alert(
				"Error",
				"An unexpected error occurred while starting the party."
			);
		} finally {
			setIsStartingPartyProcess(false);
		}
	};

	// --- View Existing Party Handler ---
	const handleViewParty = () => {
		if (currentPartyId) {
			// Navigate to the Party Hub
			navigation.navigate("PartyTab", {
				screen: "PartySession",
			});
		}
	};

	// --- Callback for MenuItemsList to add item to INDIVIDUAL BASKET ---
	const handleAddItemToIndividualBasket = useCallback(
		async (itemDataFromModal) => {
			// itemDataFromModal from SelectedItemModal contains:
			// { menuItemDetails (includes original menu item data),
			//   quantity, specialInstructions (general if no PIPs/Myself selected with notes),
			//   individualPips? (array of {id, name, specialInstructions} if individual mode and PIPs selected)
			// }

			if (!currentUserData?.uid) {
				Alert.alert("Login Required", "Please log in to add items.");
				return;
			}
			if (!addItemToIndividualBasketFromContext) {
				Alert.alert("Error", "Basket functionality is not available.");
				return;
			}
			if (!restaurant?.id) {
				Alert.alert("Error", "Restaurant information is missing.");
				return;
			}

			const {
				menuItemDetails,
				quantity,
				individualPips,
				specialInstructions: generalSpecialInstructions,
			} = itemDataFromModal;

			const dishForContext = {
				id: menuItemDetails.id,
				name: menuItemDetails.name,
				price: menuItemDetails.price,
				category: menuItemDetails.category,
				imageUri: menuItemDetails.imageUri,
				restaurantId: menuItemDetails.restaurantId,
			};

			try {
				console.log(
					"RestaurantDetailScreen: Calling BasketContext.addItemToIndividualBasketFromContext with:",
					{
						restaurantId: restaurant.id,
						dish: dishForContext,
						selectedPIPs: individualPips || [],
						generalSpecialInstructions,
						quantity,
					}
				);

				console.log("These are the pips ", individualPips);

				// Ensure your BasketContext.addItemToBasket and its Cloud Function
				// can handle the 'quantity' and the 'selectedPIPs' array (each PIP object having its own specialInstructions).
				await addItemToIndividualBasketFromContext(
					restaurant.id,
					dishForContext,
					individualPips || [], // Array of {id, name, specialInstructions}
					{}, // server placeholder
					generalSpecialInstructions,
					{}, // table placeholder
					quantity // Pass quantity
				);
				// Snackbar is shown by MenuItemsList
				console.log(
					"RestaurantDetailScreen: Item added to individual basket successfully."
				);
			} catch (error) {
				console.error(
					"RestaurantDetailScreen: Error in Individual addItemToBasket call:",
					error
				);
				Alert.alert(
					"Error",
					"Could not add item to your basket. " + error.message
				);
			}
		},
		[currentUserData?.uid, addItemToIndividualBasketFromContext, restaurant?.id]
	);

	const validationSchema = Yup.object().shape({
		partySize: Yup.number()
			.min(1, "Min 1")
			.max(20, "Max 20")
			.required("Required")
			.typeError("Must be a number"),
	});

	// // --- ADD OR VERIFY THIS LOGGING BLOCK ---

	// --- RENDER CHECK-IN / PARTY ICON BUTTONS ---
	const renderActionButtons = () => {
		if (isLoadingCheckInStatus || isLoadingParty) {
			// Combined initial loading for this section
			return (
				<View style={styles.actionsRow}>
					<ActivityIndicator size="small" color={colors.primary} />
				</View>
			);
		}

		// Scenario 1: User is already in a party (any party, for any restaurant)
		if (currentPartyId) {
			const buttonText =
				partyDetails?.restaurantId === restaurant.id
					? "View Your Party"
					: `View Party @ ${partyDetails?.restaurantName || "Other"}`;
			return (
				<View style={styles.actionsRow}>
					<TouchableOpacity
						style={styles.actionButton}
						onPress={handleViewParty}
					>
						<MaterialCommunityIcons
							name="account-group"
							size={28}
							color={colors.primary}
						/>
						<Text style={[styles.actionButtonText, { textAlign: "center" }]}>
							{buttonText}
						</Text>
					</TouchableOpacity>
					{/* Individual check-in and start party are implicitly disabled/hidden */}
				</View>
			);
		}

		// Scenario 2: User is NOT in any party - show individual check-in options
		switch (checkInStatus) {
			case "REQUESTED":
				return (
					<View style={styles.actionsRow}>
						<View style={styles.actionButtonDisabled}>
							<MaterialCommunityIcons
								name="timer-sand"
								size={28}
								color={colors.textLight}
							/>
							<Text style={styles.actionButtonTextDisabled}>
								Waiting to be seated
							</Text>
						</View>
						<TouchableOpacity
							style={styles.actionButton}
							onPress={handleCancelIndividualCheckIn}
							disabled={isProcessingCheckInAction}
						>
							{isProcessingCheckInAction ? (
								<ActivityIndicator size="small" color={colors.danger} />
							) : (
								<MaterialCommunityIcons
									name="cancel"
									size={28}
									color={colors.danger}
								/>
							)}
							<Text style={[styles.actionButtonText, { color: colors.danger }]}>
								Cancel
							</Text>
						</TouchableOpacity>
					</View>
				);
			case "ACCEPTED":
				return (
					<View style={styles.actionsRow}>
						<View style={styles.actionButtonCheckedIn}>
							<MaterialCommunityIcons
								name="check-circle"
								size={28}
								color={colors.statusSuccess}
							/>
							<Text style={styles.actionButtonTextCheckedIn}>Checked In!</Text>
							{tableNumber && (
								<Text style={styles.tableText}>Table: {tableNumber}</Text>
							)}
						</View>
						{/* Start Party button is disabled/hidden as user is already checked in individually */}
						<View style={styles.actionButtonDisabled}>
							<MaterialCommunityIcons
								name="account-multiple-plus-outline"
								size={28}
								color={colors.textLight}
							/>
							<Text style={styles.actionButtonTextDisabled}>Start Party</Text>
						</View>
					</View>
				);
			case "NONE":
			case "ERROR": // Allow retrying individual check-in or starting a party

			default:
				return (
					<View style={styles.actionsRow}>
						<TouchableOpacity
							style={styles.actionButton}
							onPress={openModal} // For individual check-in
							disabled={isProcessingCheckInAction}
						>
							{isProcessingCheckInAction ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<MaterialCommunityIcons
									name="calendar-check-outline"
									size={28}
									color={colors.primary}
								/>
							)}
							<Text style={styles.actionButtonText}>Check In Solo</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.actionButton,
								(isStartingPartyProcess || isLoadingParty) &&
									styles.actionButtonDisabled, // Disable if global or local party start is loading
							]}
							onPress={handleStartParty}
							disabled={isStartingPartyProcess || isLoadingParty}
						>
							{isStartingPartyProcess ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<MaterialCommunityIcons
									name="account-multiple-plus-outline"
									size={28}
									color={colors.primary}
								/>
							)}
							<Text style={styles.actionButtonText}>Start Party</Text>
						</TouchableOpacity>
					</View>
				);
		}
	};

	if (!restaurant) {
		return (
			<SafeAreaView style={styles.centered}>
				<Text style={styles.errorText}>Restaurant data not found.</Text>
				<PaperButton onPress={() => navigation.goBack()}>Go Back</PaperButton>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
				{initialView !== "menuForParty" && (
					<>
						<Image source={{ uri: restaurant.imageUri }} style={styles.image} />
						<View style={styles.infoContainer}>
							<Text style={styles.name}>{restaurant.restaurantName}</Text>
							<Text style={styles.address}>
								{restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
								{restaurant.zipcode}
							</Text>
							<Text style={styles.cuisine}>
								Cuisine: {restaurant.cuisineType}
							</Text>
						</View>

						{/* --- Action Icons Row --- */}
						{currentUserData?.role === "customer" ? (
							renderActionButtons()
						) : (
							<View style={styles.guestMessageContainer}>
								<PaperButton
									icon="login"
									mode="contained"
									onPress={() => navigation.navigate("Login")} // Or your Welcome/Login flow
									style={styles.guestLoginButton}
									labelStyle={styles.guestLoginButtonText}
								>
									Login or Sign Up to Order/Check-In
								</PaperButton>
							</View>
						)}

						{/* Check-In Modal */}
						{isModalVisible && (
							<Modal
								transparent={true}
								onRequestClose={closeModal}
								visible={isModalVisible}
								animationType="fade"
							>
								<View style={styles.modalOverlay}>
									<View style={styles.modalContent}>
										<Formik
											initialValues={{ partySize: "1" }} // Default to 1 for personal check-in
											validationSchema={validationSchema}
											onSubmit={handlePersonalCheckinSubmit}
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
													<Text style={styles.modalTitle}>
														How many in your party?
													</Text>
													<TextInput
														style={styles.input}
														onChangeText={handleChange("partySize")}
														onBlur={handleBlur("partySize")}
														value={values.partySize}
														keyboardType="numeric"
														placeholder="e.g., 2"
														textAlign="center"
													/>
													{errors.partySize && touched.partySize && (
														<Text style={styles.errorTextModal}>
															{errors.partySize}
														</Text>
													)}
													<View style={styles.modalButtonRow}>
														<TouchableOpacity
															onPress={closeModal}
															style={[
																styles.modalButton,
																styles.cancelModalButton,
															]}
														>
															<Text style={styles.modalButtonText}>Cancel</Text>
														</TouchableOpacity>
														<TouchableOpacity
															onPress={handleSubmit}
															style={[
																styles.modalButton,
																isProcessingAction && styles.disabledButton,
															]}
															disabled={isProcessingAction}
														>
															{isProcessingAction ? (
																<ActivityIndicator size="small" color="white" />
															) : (
																<Text style={styles.modalButtonText}>
																	Request Check-In
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
					</>
				)}

				{/* Menu Section */}
				<View style={styles.menuSection}>
					<Text style={styles.menuHeader}>Menu</Text>
					{isLoadingMenu ? (
						<ActivityIndicator
							size="large"
							color={colors.primary}
							style={{ marginTop: 20 }}
						/>
					) : menuItems.length > 0 ? (
						<MenuItemsList
							menuItems={menuItems}
							isLoading={isLoadingMenu}
							restaurantId={restaurant.id} // For individual basket context if modal needs it
							pips={userPips} // Pass current user's local PIPs
							onConfirmAddItemToContext={handleAddItemToIndividualBasket} // The unified callback
							// Will be 'individual' if partyContextData is null
							// partyContextData is not explicitly passed here as this screen handles 'individual'
							// If this screen *could* add to party, then:
							// partyContextData={orderingMode === 'party' ? partyContextData : null}
						/>
					) : (
						<Text style={styles.noMenuText}>
							Menu not available at this time.
						</Text>
					)}
				</View>
			</ScrollView>

			{/* Floating Basket Button */}
			{currentUserData?.role === "customer" && basketCount > 0 && (
				<TouchableOpacity
					style={styles.fabContainer}
					onPress={() =>
						navigation.navigate("BasketScreen", {
							restaurant,
							mode: "individual",
						})
					} // Default to individual mode
				>
					<View style={styles.fabContent}>
						<MaterialCommunityIcons name="basket" size={32} color="white" />
						{basketCount > 0 && (
							<View style={styles.badge}>
								<Text style={styles.badgeText}>{basketCount}</Text>
							</View>
						)}
					</View>
				</TouchableOpacity>
			)}
		</SafeAreaView>
	);
};

// --- Styles ---
const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: colors.backgroundLight, // Use new color
	},
	container: {
		flex: 1,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
		backgroundColor: colors.backgroundLight,
	},
	image: {
		width: "100%",
		height: 250,
		resizeMode: "cover",
	},
	infoContainer: {
		padding: 20,
		backgroundColor: colors.surfaceWhite, // Use new color
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight, // Use new color
	},
	name: {
		fontSize: 26,
		fontWeight: "bold",
		marginBottom: 8,
		color: colors.textDark, // Use new color
	},
	address: {
		fontSize: 16,
		color: colors.textMedium, // Use new color
		marginBottom: 4,
	},
	cuisine: {
		fontSize: 16,
		color: colors.textMedium, // Use new color
		fontStyle: "italic",
		marginBottom: 10,
	},
	actionsRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "flex-start", // Align items to start to allow varying text lengths
		paddingVertical: 15,
		paddingHorizontal: 10,
		backgroundColor: colors.surfaceWhite, // Card-like background for actions
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: colors.borderLight,
		marginBottom: 10, // Space before menu
	},
	actionButton: {
		alignItems: "center",
		padding: 10,
		borderRadius: 8,
		minWidth: 120, // Give buttons some space
		flex: 1, // Allow buttons to share space
		marginHorizontal: 5, // Space between buttons
		// backgroundColor: colors.primary + '1A', // Lighter primary for touch feedback (optional)
	},
	actionButtonText: {
		marginTop: 6,
		fontSize: 13,
		color: colors.primary, // Use new color
		fontWeight: "600",
		textAlign: "center",
	},
	actionButtonDisabled: {
		alignItems: "center",
		padding: 10,
		borderRadius: 8,
		minWidth: 120,
		flex: 1,
		marginHorizontal: 5,
		opacity: 0.6,
	},
	actionButtonTextDisabled: {
		marginTop: 6,
		fontSize: 13,
		color: colors.textLight, // Use new color
		fontWeight: "500",
		textAlign: "center",
	},
	actionButtonCheckedIn: {
		alignItems: "center",
		padding: 10,
		borderRadius: 8,
		minWidth: 120,
		flex: 1,
		marginHorizontal: 5,
		backgroundColor: colors.statusSuccess + "1A", // Light success background
	},
	actionButtonTextCheckedIn: {
		marginTop: 6,
		fontSize: 13,
		color: colors.statusSuccess, // Use new color
		fontWeight: "600",
	},
	tableText: {
		fontSize: 12,
		color: colors.statusSuccess,
		fontWeight: "bold",
		marginTop: 2,
	},
	guestMessageContainer: {
		padding: 20,
		alignItems: "center",
	},
	guestLoginButton: {
		backgroundColor: colors.primary, // Use new color
		paddingHorizontal: 15,
	},
	guestLoginButtonText: {
		color: colors.textOnPrimaryBrand, // Use new color
		fontSize: 16,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite, // Use new color
		padding: 25,
		borderRadius: 12,
		width: "85%",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.textDark, // Use new color
		textAlign: "center",
	},
	input: {
		// For Formik TextInput
		borderWidth: 1,
		borderColor: colors.borderLight, // Use new color
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 15,
		paddingVertical: 12,
		borderRadius: 8,
		fontSize: 18,
		color: colors.textDark,
		marginBottom: 10,
		width: "80%", // Or specific width
		textAlign: "center",
	},
	errorText: {
		// General error text on screen
		color: colors.statusDanger, // Use new color
		textAlign: "center",
		marginBottom: 10,
	},
	errorTextModal: {
		// Error text inside modal
		color: colors.statusDanger,
		fontSize: 13,
		marginBottom: 10,
		textAlign: "center",
	},
	modalButtonRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		width: "100%",
		marginTop: 20,
	},
	modalButton: {
		backgroundColor: colors.primary, // Use new color
		paddingVertical: 12,
		paddingHorizontal: 10,
		borderRadius: 8,
		alignItems: "center",
		flex: 1, // Distribute space
		marginHorizontal: 5,
	},
	cancelModalButton: {
		backgroundColor: colors.textMedium, // Use new color for cancel
	},
	modalButtonText: {
		color: colors.textOnPrimaryBrand, // Use new color
		fontSize: 16,
		fontWeight: "bold",
	},
	disabledButton: {
		opacity: 0.5,
	},
	menuSection: {
		paddingVertical: 20,
		paddingHorizontal: 15, // Consistent padding
	},
	menuHeader: {
		fontSize: 22,
		fontWeight: "bold",
		marginBottom: 15,
		color: colors.textDark,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		paddingBottom: 8,
	},
	noMenuText: {
		textAlign: "center",
		color: colors.textMedium,
		marginTop: 20,
		fontStyle: "italic",
	},
	fabContainer: {
		position: "absolute",
		right: 20,
		bottom: 20,
		backgroundColor: colors.brandOrange, // Use new accent color
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
		backgroundColor: colors.statusDanger, // Use new color
		borderRadius: 12,
		width: 24,
		height: 24,
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 1,
		borderColor: colors.surfaceWhite,
	},
	badgeText: {
		color: colors.surfaceWhite,
		fontSize: 12,
		fontWeight: "bold",
	},
});

export default RestaurantDetailScreen;
