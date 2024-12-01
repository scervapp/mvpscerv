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
		backgroundColor: colors.background,
		paddingHorizontal: 20,
		paddingTop: 30,
	},
	titleContainer: {
		alignItems: "center",
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.primary,
	},
	listContainer: {
		backgroundColor: "#fff",
		padding: 15,
		borderRadius: 10,
		marginTop: 20,
		flex: 1,
	},
	checkInItem: {
		flexDirection: "row",
		alignItems: "center", // Align items vertically
		padding: 15,
		marginBottom: 10,
		backgroundColor: colors.background,
		borderRadius: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	checkInDetailsLeft: {
		flex: 1,
		marginRight: 10,
	},
	checkInTime: {
		fontSize: 14,
		color: colors.textLight,
		marginBottom: 5,
	},
	customerName: {
		fontSize: 28,
		fontWeight: "bold",
	},
	checkInStatus: {
		fontSize: 16,
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
		color: colors.textLight,
		textAlign: "center",
	},
});

export default RestaurantCheckin;
