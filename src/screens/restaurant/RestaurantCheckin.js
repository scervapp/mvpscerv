import React, { useEffect, useState, useContext } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { AuthContext } from "../../context/authContext";
import {
	collection,
	where,
	query,
	getDocs,
	onSnapshot,
} from "firebase/firestore";

import { db, functions } from "../../config/firebase";
import { StyleSheet } from "react-native";
import moment from "moment";
import TableSelectionModal from "../../components/restaurant/TableSelectionModal";
import { userOrientation } from "../../utils/userOrientation";
import { httpsCallable } from "firebase/functions";
import colors from "../../utils/styles/appStyles";

const RestaurantCheckin = () => {
	const { currentUserData } = useContext(AuthContext);
	const [isTableModalVisible, setIsTableModalVisible] = useState(false);
	const [selectedTabelId, setSelectedTableId] = useState(null);
	const [selectedCheckInId, setSelectedCheckInId] = useState(null);
	const [customerId, setCustomerId] = useState(null);
	const [selectedCustomerId, setSelectedCustomerId] = useState(null);
	const [checkInRequests, setCheckInRequests] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [numInParty, setNumInParty] = useState(null);

	const { isLandscape } = userOrientation();

	useEffect(() => {
		// 1. Fetch pending check-in requests for the restaurant (replace 'yourRestaurantId' with the actual ID)
		const q = query(
			collection(db, "checkIns"),
			where("restaurantId", "==", currentUserData.uid),
			where("status", "==", "REQUESTED")
		);

		const unsubscribe = onSnapshot(q, (querySnapshot) => {
			const requestsData = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setCheckInRequests(requestsData);
			setIsLoading(false);
		});

		return () => unsubscribe();
	}, []);

	const formatTime = (timestamp) => {
		const now = moment();
		const then = moment(timestamp.toDate());
		const diffMinutes = now.diff(then, "minutes");

		if (diffMinutes < 60) {
			return `${diffMinutes} Mins Ago`;
		} else {
			return then.format("h:mm A"); // Display actual time if over an hour
		}
	};

	const openTableModal = (item) => {
		setSelectedCheckInId(item.id);
		setSelectedCustomerId(item.customerId);
		setNumInParty(item.numberOfPeople);
		setIsTableModalVisible(true);
	};

	const closeTableModal = () => {
		setIsTableModalVisible(false);
	};

	const renderStatusIcon = (status) => {
		switch (status) {
			case "REQUESTED":
				return "Pending";
			case "COMPLETED":
				return "Completed";
			default:
				return "Unknown";
		}
	};

	const renderItem = ({ item }) => (
		<TouchableOpacity
			onPress={() => {
				if (item.status === "REQUESTED") {
					openTableModal(item);
				}
			}}
		>
			<View style={styles.checkInItem}>
				<View style={styles.checkInDetailsLeft}>
					<Text style={styles.checkInTime}>{formatTime(item.timestamp)}</Text>
					{item.customerName && (
						<Text style={styles.customerName}>
							{item.customerName} - P{item.numberOfPeople}
						</Text>
					)}
				</View>
				<View style={styles.checkInDetailsRight}>
					<Text style={styles.checkInStatus}>
						{renderStatusIcon(item.status)}
					</Text>
				</View>
			</View>
		</TouchableOpacity>
	);

	return (
		<View style={styles.container}>
			{/* Table Selection Modal */}
			{isTableModalVisible && (
				<TableSelectionModal
					isVisible={isTableModalVisible}
					onClose={closeTableModal}
					selectedCheckinId={selectedCheckInId}
					currentRestaurantId={currentUserData.uid}
					selectedCustomerId={selectedCustomerId}
					numInParty={numInParty}
				/>
			)}

			<View style={styles.titleContainer}>
				<Text style={styles.title}>Customers Waiting</Text>
			</View>
			<View style={styles.listContainer}>
				{/* Conditionally render loading indicator, empty message, or check-in requests list */}
				{isLoading ? (
					<ActivityIndicator size="large" color={colors.primary} />
				) : !checkInRequests || checkInRequests.length === 0 ? (
					<View style={styles.noCheckinsContainer}>
						<Text style={styles.noCheckinsText}>
							No customers waiting at the moment
						</Text>
					</View>
				) : (
					<FlatList
						data={checkInRequests}
						renderItem={renderItem}
						keyExtractor={(item) => item.id}
						numColumns={isLandscape ? 2 : 1}
						columnWrapperStyle={
							isLandscape && { justifyContent: "space-around" }
						}
						contentContainerStyle={styles.requestListContainer}
						showVerticalScrolIndicator={false}
					/>
				)}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background, // Use your background color
		paddingHorizontal: 20, // Adjust padding as needed
		paddingTop: 30, // Add top padding for better spacing
	},
	titleContainer: {
		alignItems: "center", // Center the title horizontally
	},
	title: {
		fontSize: 24, // Increased font size
		fontWeight: "bold",
		color: colors.primary, // Use your primary color
	},
	listContainer: {
		backgroundColor: "#fff",
		padding: 15,
		borderRadius: 10, // Slightly larger border radius
		marginTop: 20, // Increased margin
		flex: 1,
	},
	checkInItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,

		marginBottom: 10,
		backgroundColor: "white", // Add a white background
		borderRadius: 8, // Add rounded corners
		shadowColor: "#000", // Add a subtle shadow (iOS)
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2, // Add a subtle shadow (Android)
	},
	checkInDetailsLeft: {
		flex: 1,
		marginRight: 10,
	},
	checkInTime: {
		fontSize: 14,
		color: colors.textLight,
		marginBottom: 5, // Add space between time and name
	},
	customerName: {
		fontSize: 18, // Slightly larger font size
		fontWeight: "bold",
	},
	checkInStatus: {
		fontSize: 16, // Slightly larger font size
		fontWeight: "bold",
		color: colors.secondary,
	},
	noCheckinsContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	noCheckinsText: {
		fontSize: 16,
		color: colors.textLight, // Use a color from your colors object
		textAlign: "center", // Center the text
	},
	// Modal styles (you'll likely need to adjust these based on your modal implementation)
	modalContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContent: {
		backgroundColor: "white",
		padding: 20,
		borderRadius: 10,
		width: "80%",
		alignItems: "center",
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
	},
});

export default RestaurantCheckin;
