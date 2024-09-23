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
		setIsTableModalVisible(true);
	};

	const closeTableModal = () => {
		setIsTableModalVisible(false);
	};

	const renderStatusIcon = (status) => {
		switch (status) {
			case "REQUESTED":
				return <Text>Pending</Text>;
			case "COMPLETED":
				return <Text>Completed</Text>;
			default:
				return <Text>Unknown</Text>;
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
		padding: 15,
		backgroundColor: colors.background,
	},
	titleContainer: {
		alignSelf: "center",
	},
	listContainer: {
		backgroundColor: "#fff",
		padding: 15,
		borderRadius: 8,
		marginTop: 15,
		marginBottom: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 4,
		elevation: 3,
		flex: 1,
	},
	title: {
		paddingTop: 20,
		fontSize: 20, // Increased font size
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center", // Center the title
	},
	checkInItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 10,
		borderWidth: 1,
		borderColor: "#ddd",
		borderRadius: 8,
		marginBottom: 10,
	},
	checkInDetailsLeft: {
		flex: 1,
		marginRight: 10,
	},
	checkInDetailsRight: {
		alignItems: "center",
	},
	checkInTime: {
		fontSize: 14,
		color: colors.textLight,
	},
	customerName: {
		fontSize: 16,
		fontWeight: "bold",
	},
	checkInStatus: {
		fontSize: 14,
		fontWeight: "500",
		color: colors.secondary, // Or a suitable color to highlight the status
	},
	noCheckinsContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	noCheckinsText: {
		fontSize: 16,
		color: "#999",
		fontWeight: "500",
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
