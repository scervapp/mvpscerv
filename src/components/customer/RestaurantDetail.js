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
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useBasket } from "../../context/customer/BasketContext";
import * as Yup from "yup";
import { Formik } from "formik";
import colors from "../../utils/styles/appStyles";

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
	const {
		checkInStatus,
		tableNumber,
		isLoading: isLoadingCheckIn,
	} = useCheckInStatus(restaurant.id, currentUserData.uid);

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
		const customerName = `${currentUserData.firstName} ${currentUserData.lastName}`;

		console.log("customername", customerName);

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

	// Floating basket button
	const FloatingBasketButton = () => {
		return (
			<TouchableOpacity
				style={styles.fabContainer}
				onPress={() => navigateToBasketScreen()}
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
				</View>
				{/* Check-in Button (Conditional Rendering) */}
				{isLoading ? (
					<ActivityIndicator size="small" color="white" />
				) : checkInStatus === "notCheckedIn" || checkInStatus === "declined" ? (
					<TouchableOpacity
						style={styles.checkInButton}
						onPress={() => openModal()}
					>
						<Text style={styles.checkInButtonText}>Check In</Text>
					</TouchableOpacity>
				) : checkInStatus === "REQUESTED" ? (
					<View style={styles.checkInRequestContainer}>
						{/* New container for better layout */}
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
				) : checkInStatus === "ACCEPTED" ? (
					<View style={[styles.checkInButton, styles.checkInButtonCheckedIn]}>
						<Text style={styles.checkInButtonText}>
							Checked In! {tableNumber && `(Table ${tableNumber})`}
						</Text>
					</View>
				) : null}

				{/* Check-In Modal */}
				{isModalVisible && (
					<Modal
						transparent={true}
						style={styles.modalContainer}
						onRequestClose={closeModal}
						visible={isModalVisible}
						animationType="fade"
					>
						<Formik
							initialValues={{ partySize: "" }} // Initialize with empty string
							validationSchema={validationSchema}
							onSubmit={handleCheckin} // Pass handleCheckin directly to onSubmit
						>
							{({
								handleChange,
								handleBlur,
								handleSubmit,
								values,
								errors,
								touched,
							}) => (
								<View style={styles.modalContent}>
									<Text style={styles.questionText}>
										How many in your party?
									</Text>
									<TextInput
										style={styles.input}
										onChangeText={handleChange("partySize")}
										onBlur={handleBlur("partySize")}
										value={values.partySize}
										keyboardType="numeric"
										placeholder="2" // Update placeholder to reflect minimum
									/>
									{/* Display error message if there's a validation error */}
									{errors.partySize && touched.partySize && (
										<Text style={styles.errorText}>{errors.partySize}</Text>
									)}
									<View style={styles.buttonRow}>
										<Button title="Cancel" onPress={closeModal} />
										<Button title="Confirm" onPress={handleSubmit} />
									</View>
								</View>
							)}
						</Formik>
					</Modal>
				)}
				{/* Menu Section */}
				<Text style={styles.name}>Menu</Text>
				<MenuItemsList menuItems={menuItems} isLoading={isLoading} />
				{/* Place Order Button (Conditional Rendering) */}
				{checkInStatus === "accepted" && restaurantBasket.items.length > 0 && (
					<Button title="Place Order" onPress={handlePlaceOrder} />
				)}
			</ScrollView>

			{/* Floating Basket Button */}
			<FloatingBasketButton />
		</View>
	);
};

const styles = StyleSheet.create({
	// Restaurant Details container
	container: {
		flex: 1,
		paddingHorizontal: 5,
		paddingTop: 20,
	},
	image: {
		width: "100%",
		height: 200,
		borderRadius: 10,
		marginBottom: 20,
	},
	infoContainer: { marginBottom: 20 },
	name: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 5,
	},
	address: { marginBottom: 5 },
	cuisine: { color: "#666666" },

	// Check-in button styles
	checkInButton: {
		backgroundColor: "#FF6C44",
		padding: 15,
		borderRadius: 10,
		alignItems: "center",
		marginTop: 20,
		marginBottom: 20,
	},
	checkInButtonCheckedIn: {
		backgroundColor: "green",
	},
	checkInButtonText: {
		color: "white",
		fontWeight: "bold",
		fontSize: 16,
	},
	cancelCheckInButtonText: {
		color: "white",
		fontWeight: "bold",
		fontSize: 14,
		marginBottom: 5,
	},
	checkInButtonRequest: {
		backgroundColor: colors.warning, // Use a warning color (e.g., yellow)
		padding: 15,
		borderRadius: 10,
		alignItems: "center",
		marginTop: 20,
		marginBottom: 20,
	},
	checkInRequestContainer: {
		alignItems: "center", // Center content horizontally
		marginTop: 20,
		marginBottom: 20,
	},
	loadingIndicator: {
		marginBottom: 10, // Add some spacing below the indicator
	},
	awaitingApprovalText: {
		fontSize: 16,
		marginBottom: 10,
		color: colors.text, // Or any suitable color
	},
	cancelButton: {
		backgroundColor: colors.warning, // Use a warning color (e.g., yellow or orange)
		padding: 10,
		borderRadius: 5,
		alignItems: "center",
	},
	cancelCheckInButtonText: {
		color: "white",
		fontWeight: "bold",
	},

	// Modal styles
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
		maxHeight: "80%", // Prevent modal content from overflowing
	},
	buttonRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		width: "100%",
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

	// Floating Action Button (FAB) styles
	fabContainer: {
		backgroundColor: "red",
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

	// Error message style
	errorText: {
		color: "red",
		fontWeight: "bold",
		fontSize: 14,
		marginBottom: 10,
	},
});

export default RestaurantDetail;
