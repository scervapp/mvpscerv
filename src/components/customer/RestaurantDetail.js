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

const RestaurantDetail = ({ route, navigation }) => {
	// 1: Extract the restaurant data from the route parameters and retrieve context values
	const { restaurant } = route.params;

	const { currentUserData } = useContext(AuthContext);
	const { baskets, sendToChefsQ, clearBasket } = useBasket();

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
		// Do something with the updated check-in data,
		// such as updating a local state variable or triggering other actions
		// ...
	}, [checkInStatus, tableNumber, checkInObj]);

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

			if (success) {
				// update check-in status to requested in firestore
				await updateDoc(doc(db, "checkIns", checkInId), {
					status: "REQUESTED",
				});
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
					return (
						<TouchableOpacity
							style={styles.checkInButton}
							onPress={() => openModal()}
							disabled={isLoading}
						>
							<Text style={styles.checkInButtonText}>Check In</Text>
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

					{currentUserData.role === "customer" ? (
						renderCheckInButton()
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
});

export default RestaurantDetail;
