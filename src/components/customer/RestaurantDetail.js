import React, { useEffect, useState, useContext } from "react";
import {
	View,
	Text,
	Image,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Modal,
	TextInput,
	Button,
	ScrollView,
	Alert,
} from "react-native";
import {
	checkIn,
	fetchMenu,
	handleCancelCheckIn,
	useCheckInStatus,
} from "../../utils/customerUtils";
import MenuItemsList from "./MenuItemsList";
import { AuthContext } from "../../context/authContext";
import {
	collection,
	onSnapshot,
	query,
	where,
	updateDoc,
	doc,
	getDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useBasket } from "../../context/customer/BasketContext";
import * as Yup from "yup";
import { Formik } from "formik";
import colors from "../../utils/styles/appStyles";
import { Ionicons } from "@expo/vector-icons";

import { PartyContext, useParty } from "../../context/customer/PartyContext";
import { useNavigation } from "@react-navigation/native";

const RestaurantDetail = ({ route }) => {
	// 1: Extract the restaurant data from the route parameters and retrieve context values
	const { restaurant } = route.params;

	const { currentUserData } = useContext(AuthContext);
	const navigation = useNavigation();
	const { baskets } = useBasket();
	const {
		createParty,
		isLoadingParty,
		currentPartyId,
		partyStatus,
		partyDetails,
		activatePartyCheckIn,
	} = useParty();

	const restaurantBasket =
		baskets && restaurant?.id ? baskets[restaurant.id] : { items: [] };

	// Calculate basketCount based on the current restaurant's basket
	const basketCount = restaurantBasket?.items?.length || 0;

	// 2. State variables for UI and data
	const [isLoading, setIsLoading] = useState(false); // fetch initial status
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [partySize, setPartySize] = useState("");
	const [menuItems, setMenuItems] = useState([]);

	// 3. Effect to fetch initial check-in status
	let checkInStatus, tableNumber, isLoadingCheckIn, checkInObj;

	if (currentUserData.role === "customer") {
		const checkInData = useCheckInStatus(restaurant.id, currentUserData.uid);
		checkInStatus = checkInData.checkInStatus;
		tableNumber = checkInData.tableNumber;
		isLoadingCheckIn = checkInData.isLoading;
		checkInObj = checkInData.checkInObj;
	}

	useEffect(() => {
		// Access the latest check-in data
		// If check-in just got ACCEPTED and user is host of a PENDING party for THIS restaurant
		if (
			checkInStatus === "ACCEPTED" && // <<< Trigger on ACCEPTED
			checkInObj?.id &&
			partyStatus === "pending" &&
			currentPartyId &&
			partyDetails?.restaurantId === restaurant.id && // Ensure it's for THIS restaurant
			partyDetails?.hostUserId === currentUserData?.uid // Ensure it's the host
		) {
			console.log(
				"RestaurantDetail: Check-in ACCEPTED, attempting to activate party..."
			);
			// Call the context function to activate
			activatePartyCheckIn(checkInObj.id); // Pass the checkIn ID
		}
	}, [
		checkInStatus, // Depend on checkInStatus changing
		checkInObj?.id,
		partyStatus,
		currentPartyId,
		partyDetails?.restaurantId, // Add dependency
		partyDetails?.hostUserId,
		currentUserData?.uid,
		restaurant.id, // Add dependency
		activatePartyCheckIn,
	]);

	// ---Effect to potentially activate party after check-in ---
	useEffect(() => {
		// If check-in just got ACCEPTED and user is host of a PENDING party for THIS restaurant
		if (
			checkInStatus === "ACCEPTED" &&
			checkInObj?.id && // Make sure we have the checkIn document ID
			partyStatus === "pending" && // Check party status from context
			currentPartyId && // Check if user is in a party
			partyDetails?.hostUserId === currentUserData?.uid // Ensure its the host activating
		) {
			console.log(
				"RestaurantDetail: Check-in accepted, attempting to activate party..."
			);
			// Call the context function to activate
			activatePartyCheckIn(checkInObj.id);
		}
	}, [
		checkInStatus,
		checkInObj?.id,
		partyStatus,
		currentPartyId,
		activatePartyCheckIn,
		currentUserData?.uid,
		partyDetails?.hostUserId,
	]); // Dependencies

	// 4. Effect to fetch menu items for the restaurant
	useEffect(() => {
		const loadMenu = async () => {
			try {
				const fetchedMenu = await fetchMenu(restaurant.id);
				setMenuItems(fetchedMenu);
			} catch (error) {
				console.log("Error fetching menu:", error);
			}
		};
		loadMenu();
	}, [restaurant.id]);

	const openModal = () => setIsModalVisible(true);
	const closeModal = () => setIsModalVisible(false);

	// 5. Function to handle check-in request
	const handleCheckin = async (values) => {
		setIsLoading(true);
		const userRef = doc(db, "customers", currentUserData.uid);
		const userSnap = await getDoc(userRef);

		if (userSnap.exists()) {
			const activeCheckIn = userSnap.data().activeCheckIn;

			// If there's an active check-in and it's for a different restaurant
			if (activeCheckIn && activeCheckIn.restaurantId !== restaurant.id) {
				alert(
					"You are already checked into another restaurant. Please check out before checking into a new one."
				);
				return;
			}
		}
		const customerName = `${currentUserData.firstName} ${currentUserData.lastName}`;

		try {
			setIsLoading(true);

			const { success, checkInId } = await checkIn(
				restaurant.id,
				currentUserData.uid,
				values.partySize,
				customerName
			);

			if (success && checkInId) {
				// update check-in status to requested in firestore
				await updateDoc(doc(db, "checkIns", checkInId), {
					status: "REQUESTED",
				});

				// --- Potentially call activatePartyCheckIn HERE if conditions met ---
				// This might be more reliable than the useEffect approach
				if (partyStatus === "pending" && currentPartyId) {
					// Maybe add host check here if partyDetails available in context
					console.log(
						"handleCheckin: Check-in requested, attempting to activate party..."
					);
					await activatePartyCheckIn(checkInId); // Call context function
				}
			} else {
				Alert.alert("Check-In Failed", "Please try again later.");
			}
		} catch (error) {
			console.log("Error checking in:", error);
			Alert.alert("Error", "An error occured while checking in.");
		} finally {
			setIsLoading(false);
		}
		closeModal();
	};
	const handlingCancelCheckIn = async () => {
		try {
			setIsLoading(true);
			// Call the cancelCheckIn function from customerUtils
			const success = await handleCancelCheckIn(
				restaurant.id,
				currentUserData.uid
			);

			if (success) {
				Alert.alert("Success", "Your check-in request has been cancelled.");
			} else {
				return;
			}
		} catch (error) {
			console.error("Error canceling check-in:", error);
			Alert.alert(
				"Error",
				"An error occurred while canceling your check-in request."
			);
		} finally {
			setIsLoading(false);
		}
	};

	// --- MODIFIED: Function to handle hosting a party using Context ---
	const handleHostParty = async () => {
		if (!currentUserData || !restaurant || isLoadingParty) return;
		// Call the function from the context
		createParty(restaurant.id, restaurant.restaurantName);

		// --- ADD NAVIGATION LOGIC HERE ---
		if (newPartyId) {
			// Navigate only if party creation was successful and returned an ID
			navigation.navigate("PartyLobby", {
				partyId: newPartyId,
				restaurant: restaurant, // Pass restaurant if needed by lobby
			});
		}
	};
	// --- END MODIFIED FUNCTION ---

	// --- NEW: View Existing Party Handler ---
	const handleViewParty = () => {
		if (currentPartyId) {
			navigation.navigate("PartyLobby", {
				partyId: currentPartyId,
				// restaurant: restaurant, // Optional: Pass restaurant if needed by lobby
			});
		} else {
			// Should not happen if button is only shown when currentPartyId exists
			console.warn("Attempted to view party, but no currentPartyId found.");
		}
	};
	// --- END NEW HANDLER ---

	const handlePersonalCheckinSubmit = async (values) => {
		// 1. Check if user is in any party
		if (currentPartyId) {
			Alert.alert(
				"Action Blocked",
				"You are currently in a party session. Please leave or cancel the party before checking in personally."
			);
			return; // Stop the process
		}

		// 2. Check for existing check-in at other restaurants (copied from utility)
		if (!currentUserData?.uid) {
			Alert.alert("Error", "User data not available.");
			return;
		}
		setIsLoading(true); // Use local loading state for this action
		const userRef = doc(db, "customers", currentUserData.uid);
		try {
			const userSnap = await getDoc(userRef);
			if (userSnap.exists() && userSnap.data().activeCheckIn) {
				const activeCheckInData = userSnap.data().activeCheckIn;
				if (activeCheckInData.restaurantId !== restaurant.id) {
					// Fetch name for better message (optional)
					let otherRestaurantName = "another restaurant";
					try {
						const otherRestRef = doc(
							db,
							"restaurants",
							activeCheckInData.restaurantId
						);
						const otherRestSnap = await getDoc(otherRestRef);
						if (otherRestSnap.exists()) {
							otherRestaurantName =
								otherRestSnap.data().restaurantName || otherRestaurantName;
						}
					} catch (e) {
						/* ignore name fetch error */
					}
					Alert.alert(
						"Check-in Blocked",
						`You already have an active check-in request at ${otherRestaurantName}. Please cancel it first.`
					);
					setIsLoading(false);
					return; // Stop
				}
			}
		} catch (error) {
			console.error("Error checking user's active check-in:", error);
			Alert.alert("Error", "Could not verify current check-in status.");
			setIsLoading(false);
			return;
		}

		// 3. Proceed with personal check-in using core utility
		const customerName = `${currentUserData.firstName || ""} ${
			currentUserData.lastName || ""
		}`.trim();
		try {
			// Call the core checkIn utility directly (NO partyId, NO activatePartyCheckIn)
			const { success, checkInId } = await checkIn(
				restaurant.id,
				currentUserData.uid,
				values.partySize,
				customerName
				// No partyId passed here
			);

			if (success && checkInId) {
				// Status is already set to REQUESTED by checkIn utility
				console.log("Personal check-in requested successfully:", checkInId);
				// No party activation needed
			} else {
				Alert.alert("Check-In Failed", "Could not create check-in request.");
			}
		} catch (error) {
			console.error("Error during personal check-in:", error);
			Alert.alert(
				"Error",
				`An error occurred while checking in: ${error.message}`
			);
		} finally {
			setIsLoading(false);
			closeModal(); // Close modal regardless of success/failure after attempt
		}
	};

	const validationSchema = Yup.object().shape({
		partySize: Yup.number()
			.min(1, "Party size must be atleast 1")
			.required("Party size is required"),
	});

	const navigateToBasketScreen = () => {
		navigation.navigate("BasketScreen", {
			restaurant,
		});
	};

	// --- ADD LOGGING HERE ---
	console.log("--- RestaurantDetail State Check ---");
	console.log("isLoading (local):", isLoading);
	console.log("isLoadingCheckIn (hook):", isLoadingCheckIn);
	console.log("isLoadingParty (context):", isLoadingParty);
	console.log("currentPartyId (context):", currentPartyId);
	console.log("partyStatus (context):", partyStatus);
	console.log(
		"partyDetails?.restaurantId (context):",
		partyDetails?.restaurantId
	);
	console.log("restaurant.id (prop):", restaurant.id);
	console.log("checkInObj (hook):", JSON.stringify(checkInObj)); // Log the whole object
	console.log("checkInStatus (hook):", checkInStatus);

	// Re-calculate the disable flags here for logging
	const isPersonallyCheckedIn_debug =
		checkInObj?.status === "REQUESTED" || checkInObj?.status === "ACCEPTED";
	const isInActivePartyAtThisRestaurant_debug =
		partyStatus === "active" && partyDetails?.restaurantId === restaurant.id;
	const disableCheckIn_debug =
		isPersonallyCheckedIn_debug || isInActivePartyAtThisRestaurant_debug;

	console.log("isPersonallyCheckedIn_debug:", isPersonallyCheckedIn_debug);
	console.log(
		"isInActivePartyAtThisRestaurant_debug:",
		isInActivePartyAtThisRestaurant_debug
	);
	console.log("disableCheckIn_debug:", disableCheckIn_debug);
	console.log(
		"Button disabled prop evaluates to:",
		isLoading || isLoadingCheckIn || disableCheckIn_debug
	); // Check all conditions used in renderCheckInButton
	console.log("------------------------------------");
	// --- END LOGGING ---

	const renderCheckInButton = () => {
		if (isLoading) {
			return <ActivityIndicator size="small" color="white" />;
		}

		// Continue with rendering the check-in button based on the check-in status
		if (checkInStatus) {
			switch (checkInObj && checkInStatus) {
				case "REQUESTED":
					return (
						<View style={styles.checkInRequestContainer}>
							<ActivityIndicator
								size="small"
								color={colors.primary}
								style={styles.loadingIndicator}
							/>
							<Text style={styles.awaitingApprovalText}>
								Waiting to be seated
							</Text>
							<TouchableOpacity
								onPress={handlingCancelCheckIn}
								style={styles.cancelButton}
							>
								<Text style={styles.cancelCheckInButtonText}>
									Cancel Check-In
								</Text>
							</TouchableOpacity>
						</View>
					);
				case "ACCEPTED":
					return (
						<View style={styles.checkInButtonCheckedIn}>
							<Ionicons name="checkmark-circle" size={50} color="#28a745" />
							<Text style={styles.checkInButtonTextCheckedIn}>
								Checked In at {checkInObj.table?.name}
							</Text>
							<Text style={styles.checkInButtonTextCheckedIn}>
								Your Server is {checkInObj.server?.firstName}
							</Text>
						</View>
					);
				default:
					console.log("  Rendering: DEFAULT state (Check In button)");

					// --- Use the REFINED disableCheckIn logic here ---
					const isPersonallyCheckedIn =
						checkInObj?.status === "REQUESTED" ||
						checkInObj?.status === "ACCEPTED";
					const isInActivePartyAtThisRestaurant =
						partyStatus === "active" &&
						partyDetails?.restaurantId === restaurant.id;
					const disableCheckIn =
						isPersonallyCheckedIn || isInActivePartyAtThisRestaurant;
					// --- End refined logic ---

					console.log(
						"  Final disabled value for default case:",
						isLoading || disableCheckIn
					);

					const handlePersonalCheckInPress = () => {
						if (currentPartyId) {
							Alert.alert(
								"Action Blocked",
								"You are currently in a party session. Please leave or cancel the party before checking in personally."
							);
						} else {
							openModal(); // Only open modal if not in a party
						}
					};

					return (
						<TouchableOpacity
							style={[
								styles.checkInButton,
								(isLoading || disableCheckIn) && styles.disabledButton,
							]}
							onPress={handlePersonalCheckInPress} // <<< Use the new handler with check
							disabled={isLoading || disableCheckIn}
						>
							<Text style={styles.checkInButtonText}>
								{isInActivePartyAtThisRestaurant
									? "Checked In Via Party"
									: "Check In"}
							</Text>
						</TouchableOpacity>
					);
			}
		}
	};
	// Floating basket button
	const FloatingBasketButton = () => {
		const isGuest = currentUserData.role === "guest"; // Check if the user is a guest

		return (
			<TouchableOpacity
				style={[styles.fabContainer, isGuest && styles.disabledButton]} // Apply disabled style if guest
				onPress={() => navigateToBasketScreen()}
				disabled={isGuest} // Disable the button for guest users
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
		);
	};

	const isCustomer = currentUserData.role === "customer";
	// Determine if Host Party button should be shown/enabled
	const canHostParty =
		isCustomer && // Must be a customer
		!checkInObj && // Not currently checked in
		!currentPartyId; // Not already in another party

	return (
		<View style={styles.container}>
			<ScrollView showsVerticalScrollIndicator={false}>
				{/* Restaurant Image */}
				<Image source={{ uri: restaurant.imageUri }} style={styles.image} />

				{/* Restaurant Information */}
				<View style={styles.infoContainer}>
					<Text style={styles.name}>{restaurant.restaurantName}</Text>
					<Text style={styles.address}>
						{restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
						{restaurant.zipcode}
					</Text>
					<Text style={styles.cuisine}>Cuisine: {restaurant.cuisineType}</Text>

					{isCustomer ? (
						<>
							{renderCheckInButton()}
							{/* 2. Conditionally Render Host Party Button (NEW LOGIC) */}
							{canHostParty && (
								<TouchableOpacity
									style={[
										styles.hostPartyButton,
										// Use isLoadingParty from context for disabling
										isLoadingParty && styles.disabledButton,
									]}
									onPress={handleHostParty}
									disabled={isLoadingParty} // Disable if context is loading
								>
									{isLoadingParty ? ( // Use isLoadingParty from context
										<ActivityIndicator size="small" color="white" />
									) : (
										<Text style={styles.hostPartyButtonText}>
											Host a Party Here
										</Text>
									)}
								</TouchableOpacity>
							)}

							{/* 3. Conditionally Render "In a Party" Message (NEW LOGIC) */}
							{/* --- View Existing Party Link (Show if in a party) --- */}
							{currentPartyId && (
								<TouchableOpacity
									style={styles.viewPartyLink} // Add style for this link
									onPress={handleViewParty}
									disabled={isLoadingParty} // Disable if context is loading
								>
									<Text style={styles.viewPartyLinkText}>
										View Your Current Party
									</Text>
								</TouchableOpacity>
							)}
						</>
					) : (
						<View style={styles.guestContainer}>
							<TouchableOpacity
								onPress={() => navigation.navigate("Welcome")}
								style={styles.guestButton}
							>
								<Text style={styles.guestButtonText}>
									Log in or sign up to check in
								</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={styles.disabledCheckInButton}
								disabled={true}
							>
								<Text style={styles.checkInButtonText}>Check In</Text>
							</TouchableOpacity>
						</View>
					)}
				</View>

				{/* Check-In Modal */}
				{isModalVisible && (
					<Modal
						transparent={true}
						onRequestClose={closeModal}
						visible={isModalVisible}
						animationType="fade"
					>
						<View style={styles.modalContainer}>
							<View style={[styles.modalContent, { marginTop: 100 }]}>
								{/* Adjust marginTop to move the modal down */}
								<Formik
									initialValues={{ partySize: "" }}
									validationSchema={validationSchema}
									onSubmit={handleCheckin}
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
											<Text style={styles.questionText}>
												How many in your party?
											</Text>
											<TextInput
												style={styles.input}
												onChangeText={handleChange("partySize")}
												onBlur={handleBlur("partySize")}
												value={values.partySize}
												keyboardType="numeric"
												placeholder="2"
											/>
											{errors.partySize && touched.partySize && (
												<Text style={styles.errorText}>{errors.partySize}</Text>
											)}
											<View style={styles.buttonRow}>
												<TouchableOpacity
													onPress={closeModal}
													style={styles.modalButton}
												>
													<Text style={styles.modalButtonText}>Cancel</Text>
												</TouchableOpacity>

												<TouchableOpacity
													onPress={handleSubmit}
													style={styles.modalButton}
													disabled={isLoading}
												>
													{isLoading ? (
														<ActivityIndicator size="small" color="white" />
													) : (
														<Text style={styles.modalButtonText}>Confirm</Text>
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
					<MenuItemsList menuItems={menuItems} isLoading={isLoading} />
				</View>
			</ScrollView>

			{/* Floating Basket Button */}
			<FloatingBasketButton />
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f8f8f8",
	},
	image: {
		width: "100%",
		height: 200,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
	},
	infoContainer: {
		padding: 20,
	},
	name: {
		fontSize: 28,
		fontWeight: "bold",
		marginBottom: 5,
	},
	address: {
		fontSize: 16,
		color: "#666",
	},
	cuisine: {
		fontSize: 16,
		color: "#666",
	},
	checkInButton: {
		backgroundColor: "#007bff",
		padding: 15,
		borderRadius: 10,
		alignItems: "center",
		marginTop: 20,
	},
	checkInButtonText: {
		// Style for "Check In" button text
		color: "white",
		fontWeight: "bold",
		fontSize: 16,
	},

	checkInButtonCheckedIn: {
		padding: 20,
		borderRadius: 10,
		alignItems: "center",
	},
	checkInButtonTextCheckedIn: {
		// Style for checked-in text
		color: "#28a745",
		fontWeight: "bold",
		fontSize: 18,
		marginTop: 10,
	},

	cancelCheckInButtonText: {
		color: "white",
		fontWeight: "bold",
		fontSize: 14,
		marginBottom: 5,
	},
	checkInRequestContainer: {
		alignItems: "center",
		marginTop: 20,
	},
	loadingIndicator: {
		marginBottom: 10,
	},
	awaitingApprovalText: {
		fontSize: 16,
		marginBottom: 10,
		color: "#333",
	},
	cancelButton: {
		backgroundColor: "#ffc107", // Yellow cancel button
		padding: 10,
		borderRadius: 5,
		alignItems: "center",
	},
	modalContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		margin: 0,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContent: {
		alignSelf: "center",
		backgroundColor: "white",
		padding: 20,
		borderRadius: 10,
		width: "80%",
		alignItems: "center",
		maxHeight: "80%",
	},
	buttonRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		width: "100%",
		marginTop: 20,
	},
	input: {
		borderWidth: 1,
		borderColor: "#ddd",
		padding: 10,
		borderRadius: 5,
		marginBottom: 20,
		marginTop: 20,
		textAlign: "center",
		fontSize: 18,
	},
	questionText: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
	},
	fabContainer: {
		backgroundColor: "#dc3545", // Red basket button
		borderRadius: 50,
		padding: 16,
		position: "absolute",
		bottom: 16,
		right: 16,
	},
	fabContent: {
		alignItems: "center",
		justifyContent: "center",
	},
	badge: {
		position: "absolute",
		top: -8,
		right: -8,
		backgroundColor: "black",
		borderRadius: 10,
		padding: 4,
	},
	badgeText: {
		color: "white",
		fontSize: 12,
	},
	errorText: {
		color: "red",
		fontWeight: "bold",
		fontSize: 14,
		marginBottom: 10,
	},
	menuSection: {
		padding: 20,
	},
	menuHeader: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 10,
	},
	modalButton: {
		backgroundColor: colors.primary, // Or any color you prefer
		padding: 10,
		borderRadius: 8,
		alignItems: "center",
		flex: 1, // Allow buttons to take equal width
		marginHorizontal: 5, // Add some space between the buttons
	},
	modalButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	guestContainer: {
		alignItems: "center",
		marginTop: 20,
		marginBottom: 20,
	},
	guestButton: {
		backgroundColor: colors.primary, // Or any suitable color
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
		width: "80%",
		marginBottom: 10, // Add margin below the button
		// Add a shadow for the button (adjust values as needed)
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 3,
		elevation: 3, // For Android shadow
	},
	guestButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	disabledButton: {
		backgroundColor: "#D3D3D3", // Use a disabled button color from your colors object
	},

	infoText: {
		textAlign: "center",
		marginTop: 10,
		color: colors.textLight,
		fontStyle: "italic",
	},
	// Ensure disabledButton style exists
	disabledButton: {
		backgroundColor: colors.mediumGray || "#cccccc",
		opacity: 0.7,
	},
	// Ensure hostPartyButton styles exist
	hostPartyButton: {
		backgroundColor: colors.secondary || "#6c757d",
		padding: 15,
		borderRadius: 10,
		alignItems: "center",
		marginTop: 10,
	},
	hostPartyButtonText: {
		color: "white",
		fontWeight: "bold",
		fontSize: 16,
	},
	// Ensure disabledCheckInButton style exists
	disabledCheckInButton: {
		backgroundColor: colors.mediumGray || "#cccccc",
		padding: 15,
		borderRadius: 10,
		alignItems: "center",
		marginTop: 10,
		width: "80%", // Example width
		opacity: 0.7,
	},
	// --- Add Styles for the View Party Link ---
	viewPartyLink: {
		marginTop: 15, // Space below the host button or check-in status
		alignItems: "center",
	},
	viewPartyLinkText: {
		color: colors.primary, // Use theme color
		fontSize: 15,
		textDecorationLine: "underline",
	},
});

export default RestaurantDetail;
