// screens/customer/RestaurantDetailScreen.js
import React, { useContext, useEffect, useState, useMemo } from "react";
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

// Assuming formatCurrency is available or defined
const formatCurrency = (cents) => {
	if (typeof cents !== "number" || isNaN(cents)) {
		return "$0.00";
	}
	const value = cents / 100;
	return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
};

const RestaurantDetailScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { restaurant } = route.params; // Expects { id, name, taxRate, imageUri, address, city, state, zipcode, cuisineType }

	const { currentUserData } = useContext(AuthContext);
	const { baskets } = useBasket(); // For individual basket count
	const {
		createParty,
		isLoadingParty, // Loading state from PartyContext for party creation
		currentPartyId,
		partyDetails, // Details of the current party from context
		partyStatus, // Status of the current party from context
		activatePartyCheckIn, // Function from context
	} = useParty(); // Using the custom hook

	// Local loading states for this screen's specific actions
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);
	const [isProcessingAction, setIsProcessingAction] = useState(false); // For individual check-in/cancel actions

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
			isProcessingAction ||
			checkInStatus === "REQUESTED" ||
			checkInStatus === "ACCEPTED"
		) {
			console.log("Check-in already in progress or completed.");
			return;
		}
		// Prevent individual check-in if user is in an active party at THIS restaurant
		if (
			currentPartyId &&
			partyDetails?.restaurantId === restaurant.id &&
			(partyDetails?.status === "active" || partyDetails?.status === "pending")
		) {
			Alert.alert(
				"In a Party",
				"You are already in a party at this restaurant. Manage your party from the Party Lobby."
			);
			closeModal();
			return;
		}

		setIsProcessingAction(true);
		const customerName = `${currentUserData.firstName || ""} ${
			currentUserData.lastName || ""
		}`.trim();
		try {
			const { success, checkInId } = await checkIn(
				// Assuming checkIn utility handles Firestore write
				restaurant.id,
				currentUserData.uid,
				values.partySize,
				customerName
			);
			if (success && checkInId) {
				console.log("Personal check-in requested successfully:", checkInId);
				// useCheckInStatus hook will update checkInStatus via its listener
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
			setIsProcessingAction(false);
			closeModal();
		}
	};

	const handleCancelIndividualCheckIn = async () => {
		if (!checkInObj?.id || isProcessingAction) return;
		setIsProcessingAction(true);
		try {
			// Pass checkInObj.id to ensure cancelling the correct one
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
			setIsProcessingAction(false);
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
			// Prevent starting party if already checked in, in a party, or action is loading
			console.log(
				"Cannot start party due to existing check-in or party status."
			);
			return;
		}

		const newPartyId = await createParty(restaurant.id); // Context calls CF
		if (newPartyId) {
			navigation.navigate("PartyLobbyScreen", { partyId: newPartyId });
		}
		// Errors handled by PartyContext
	};

	// --- View Existing Party Handler ---
	const handleViewParty = () => {
		if (currentPartyId) {
			navigation.navigate("PartyLobbyScreen", { partyId: currentPartyId });
		}
	};

	const validationSchema = Yup.object().shape({
		partySize: Yup.number()
			.min(1, "Min 1")
			.max(20, "Max 20")
			.required("Required")
			.typeError("Must be a number"),
	});

	// --- ADD OR VERIFY THIS LOGGING BLOCK ---
	console.log("--- RestaurantDetail State Check (Before Action Buttons) ---");
	console.log("isLoadingParty (from PartyContext):", isLoadingParty);
	console.log(
		"isLoadingCheckInStatus (from useCheckInStatus hook):",
		isLoadingCheckInStatus
	);
	console.log("checkInStatus (from useCheckInStatus hook):", checkInStatus);
	console.log("currentPartyId (from PartyContext):", currentPartyId);
	console.log(
		"partyDetails?.restaurantId (context):",
		partyDetails?.restaurantId
	);
	console.log("restaurant.id (prop):", restaurant?.id);
	console.log(
		"isProcessingAction (local state for check-in):",
		isProcessingAction
	); // If you still have this local state
	console.log("----------------------------------------------------------");
	// --- END LOGGING BLOCK ---

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
			// If the current party is for THIS restaurant, show "View Party"
			if (partyDetails?.restaurantId === restaurant.id) {
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
							<Text style={styles.actionButtonText}>View Party</Text>
						</TouchableOpacity>
						{/* Individual check-in button is hidden/disabled */}
					</View>
				);
			} else {
				// User is in a party at a DIFFERENT restaurant
				return (
					<View style={styles.actionsRow}>
						<View style={styles.actionButtonDisabled}>
							<MaterialCommunityIcons
								name="information-outline"
								size={28}
								color={colors.textLight}
							/>
							<Text
								style={[
									styles.actionButtonTextDisabled,
									{ textAlign: "center" },
								]}
							>
								In party at{" "}
								{partyDetails?.restaurantName || "another restaurant"}
							</Text>
						</View>
					</View>
				);
			}
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
							<Text style={styles.actionButtonTextDisabled}>Waiting...</Text>
						</View>
						<TouchableOpacity
							style={styles.actionButton}
							onPress={handleCancelIndividualCheckIn}
							disabled={isProcessingAction}
						>
							{isProcessingAction ? (
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
								color={colors.success}
							/>
							<Text style={styles.actionButtonTextCheckedIn}>Checked In!</Text>
							{tableNumber && (
								<Text style={styles.tableText}>Table: {tableNumber}</Text>
							)}
						</View>
						{/* Should not be able to start a party if already checked in individually */}
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
			case "ERROR": // Treat error as ability to try again for individual check-in
			default:
				return (
					<View style={styles.actionsRow}>
						<TouchableOpacity
							style={styles.actionButton}
							onPress={openModal}
							disabled={isProcessingAction}
						>
							{isProcessingAction && !isLoadingParty ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<MaterialCommunityIcons
									name="calendar-check-outline"
									size={28}
									color={colors.primary}
								/>
							)}
							<Text style={styles.actionButtonText}>Check In</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.actionButton,
								isLoadingParty && styles.actionButtonDisabled,
							]}
							onPress={handleStartParty}
							disabled={isLoadingParty}
						>
							{isLoadingParty ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<>
									<MaterialCommunityIcons
										name="account-multiple-plus-outline"
										size={28}
										color={colors.primary}
									/>
									<Text style={styles.actionButtonText}>Start Party</Text>
								</>
							)}
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
				<Image source={{ uri: restaurant.imageUri }} style={styles.image} />
				<View style={styles.infoContainer}>
					<Text style={styles.name}>{restaurant.restaurantName}</Text>
					<Text style={styles.address}>
						{restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
						{restaurant.zipcode}
					</Text>
					<Text style={styles.cuisine}>Cuisine: {restaurant.cuisineType}</Text>
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
													style={[styles.modalButton, styles.cancelModalButton]}
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
							restaurantId={restaurant.id}
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
	safeArea: { flex: 1, backgroundColor: colors.backgroundDefault || "#f0f2f5" },
	container: { flex: 1 },
	image: { width: "100%", height: 220 },
	infoContainer: {
		paddingHorizontal: 15,
		paddingVertical: 20,
		backgroundColor: colors.white,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
	},
	name: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 5,
		color: colors.textDark,
	},
	address: { fontSize: 15, color: colors.text, marginBottom: 3 },
	cuisine: { fontSize: 15, color: colors.text, fontStyle: "italic" },
	actionsRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "flex-start", // Align items to top to accommodate varying text length
		paddingVertical: 15,
		paddingHorizontal: 10,
		backgroundColor: colors.white,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
		marginBottom: 15,
	},
	actionButton: {
		alignItems: "center",
		paddingHorizontal: 5, // Reduced padding to fit more
		flex: 1, // Allow buttons to share space
	},
	actionButtonDisabled: {
		alignItems: "center",
		paddingHorizontal: 5,
		opacity: 0.5,
		flex: 1,
	},
	actionButtonCheckedIn: {
		alignItems: "center",
		paddingHorizontal: 5,
		flex: 1,
	},
	actionButtonText: {
		marginTop: 4,
		fontSize: 12,
		color: colors.primary,
		fontWeight: "500",
		textAlign: "center", // Center text for multi-line
	},
	actionButtonTextDisabled: {
		marginTop: 4,
		fontSize: 12,
		color: colors.textLight,
		textAlign: "center",
	},
	actionButtonTextCheckedIn: {
		marginTop: 4,
		fontSize: 12,
		color: colors.success,
		fontWeight: "500",
		textAlign: "center",
	},
	tableText: {
		fontSize: 11,
		color: colors.textLight,
		marginTop: 2,
		textAlign: "center",
	},
	guestMessageContainer: {
		padding: 20,
		alignItems: "center",
		backgroundColor: colors.white,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
		marginBottom: 15,
	},
	guestLoginButton: {
		backgroundColor: colors.primary,
		width: "90%",
		paddingVertical: 8,
		borderRadius: 8,
	},
	guestLoginButtonText: {
		color: colors.white,
		fontSize: 16,
		fontWeight: "bold",
	},
	menuSection: {
		paddingVertical: 10,
		paddingHorizontal: 15,
		backgroundColor: colors.white,
		minHeight: 200,
		marginBottom: 80 /* Space for FAB */,
	},
	menuHeader: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 10,
		color: colors.textDark,
	},
	noMenuText: { textAlign: "center", color: colors.textLight, marginTop: 20 },
	fabContainer: {
		backgroundColor: colors.accent || "#dc3545",
		borderRadius: 28,
		width: 56,
		height: 56,
		justifyContent: "center",
		alignItems: "center",
		position: "absolute",
		bottom: 25,
		right: 25,
		elevation: 6,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.3,
		shadowRadius: 3,
	},
	fabContent: { alignItems: "center", justifyContent: "center" },
	badge: {
		position: "absolute",
		top: -5,
		right: -5,
		backgroundColor: colors.primary,
		borderRadius: 10,
		width: 20,
		height: 20,
		justifyContent: "center",
		alignItems: "center",
	},
	badgeText: { color: "white", fontSize: 10, fontWeight: "bold" },
	// Modal Styles
	modalOverlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.6)",
	},
	modalContent: {
		backgroundColor: "white",
		borderRadius: 10,
		padding: 25,
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
		marginBottom: 15,
		textAlign: "center",
		color: colors.textDark,
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
		width: "70%",
	},
	errorTextModal: {
		color: colors.danger || "red",
		textAlign: "center",
		marginBottom: 10,
		fontSize: 13,
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
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	}, // For error/loading states
});

export default RestaurantDetailScreen;
