import React, { useEffect, useState, useContext, useCallback } from "react";
import {
	View,
	Text,
	FlatList,
	TouchableOpacity,
	SafeAreaView,
	Alert,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import {
	collection,
	where,
	query,
	getDocs,
	onSnapshot,
	orderBy,
} from "firebase/firestore";

import { db, functions } from "../../config/firebase";
import { StyleSheet } from "react-native";

import { userOrientation } from "../../utils/userOrientation";
import { httpsCallable } from "firebase/functions";
import colors from "../../utils/styles/appStyles";
import CheckInRequestCard from "../../components/restaurant/CheckInRequestCard";
import { Ionicons } from "@expo/vector-icons";
import { RefreshControl, ActivityIndicator } from "react-native";
import TableAndServerSelectionModal from "../../components/restaurant/TableAndServerSelectionModal";

const RestaurantCheckin = () => {
	const { currentUserData } = useContext(AuthContext);
	const [isTableModalVisible, setIsTableModalVisible] = useState(false);
	const [checkInRequests, setCheckInRequests] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [selectedCheckIn, setSelectedCheckIn] = useState(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isSelectionModalVisible, setIsSelectionModalVisible] = useState(false);
	const [selectedTable, setSelectedTable] = useState(null);

	const declineCheckInFunction = httpsCallable(functions, "declineCheckIn");

	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) {
			setError("Your user profile is not linked to a restaurant.");
			setIsLoading(false);
			return;
		}

		const q = query(
			collection(db, "checkIns"),
			where("restaurantId", "==", restaurantId),
			where("status", "==", "REQUESTED"),
			orderBy("timestamp", "asc")
		);

		const unsubscribe = onSnapshot(
			q,
			(querySnapshot) => {
				const requestsData = querySnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setCheckInRequests(requestsData);
				setError(null);
				setIsLoading(false);
				setIsRefreshing(false);
			},
			(err) => {
				console.error("RestaurantCheckin: Snapshot error:", err);
				setError("Failed to listen for check-in requests.");
				setIsLoading(false);
				setIsRefreshing(false);
			}
		);

		return () => unsubscribe();
	}, [currentUserData?.restaurantId]);

	const onRefresh = useCallback(() => {
		setIsRefreshing(true);
		// The listener will auto-refresh, this just shows the spinner.
		setTimeout(() => setIsRefreshing(false), 1000);
	}, []);

	const handleSelectCheckIn = (checkInData) => {
		setSelectedCheckIn(checkInData);
		setIsSelectionModalVisible(true);
	};

	const handleDeclineCheckIn = (checkInItem) => {
		Alert.alert(
			"Decline Check-In",
			`Are you sure you want to decline the check-in for ${checkInItem.customerName}?`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Decline",
					style: "destructive",
					onPress: async () => {
						setIsProcessing(true);
						try {
							await declineCheckInFunction({ checkInId: checkInItem.id });
							// The real-time listener will automatically remove the item from the list.
						} catch (error) {
							console.error("Error declining check-in:", error);
							Alert.alert(
								"Error",
								`Could not decline check-in: ${error.message}`
							);
						} finally {
							setIsProcessing(false);
						}
					},
				},
			]
		);
	};

	const handleConfirmSelection = async ({ table, server }) => {
		if (!selectedCheckIn || !table || !server) {
			Alert.alert("Error", "Missing information to confirm seating.");
			return;
		}

		setIsProcessing(true);
		try {
			// Call your Cloud Function to finalize the check-in
			const handleCheckInResponseFunction = httpsCallable(
				functions,
				"handleCheckInResponse"
			);
			const result = await handleCheckInResponseFunction({
				checkInId: selectedCheckIn.id,
				action: "ACCEPTED",
				table: { id: table.id, name: table.name }, // Pass essential data
				server: {
					id: server.id,
					name: `${server.firstName} ${server.lastName}`.trim(),
				},
				customerId: selectedCheckIn.customerId,
				restaurantId: currentUserData.uid,
				numInParty: selectedCheckIn.numberOfPeople,
			});

			if (!result.data.success) {
				throw new Error(result.data.error || "Failed to confirm check-in.");
			}
		} catch (err) {
			console.error("Error confirming check-in:", err);
			Alert.alert("Error", err.message || "An unexpected error occurred.");
		} finally {
			setIsProcessing(false);
			setIsSelectionModalVisible(false);
			setSelectedCheckIn(null);
		}
	};

	const renderContent = () => {
		if (isLoading) {
			return (
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={{ marginTop: 50 }}
				/>
			);
		}
		if (error) {
			return (
				<View style={styles.infoContainer}>
					<Text style={styles.errorText}>{error}</Text>
				</View>
			);
		}

		if (checkInRequests.length === 0) {
			return (
				<View style={styles.infoContainer}>
					<Ionicons
						name="checkmark-done-circle-outline"
						size={60}
						color={colors.textLight}
					/>
					<Text style={styles.noCheckinsText}>
						No customers are waiting at the moment.
					</Text>
				</View>
			);
		}
		return (
			<FlatList
				data={checkInRequests}
				renderItem={({ item }) => (
					<CheckInRequestCard
						item={item}
						onSelect={() => handleSelectCheckIn(item)}
						onDecline={() => handleDeclineCheckIn(item)}
					/>
				)}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.listContainer}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={isRefreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
			/>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				<View style={styles.titleContainer}>
					<Text style={styles.title}>Customers Waiting</Text>
				</View>

				{renderContent()}

				{selectedCheckIn && (
					<TableAndServerSelectionModal
						isVisible={isSelectionModalVisible}
						onClose={() => setIsSelectionModalVisible(false)}
						onConfirm={handleConfirmSelection}
						numInParty={selectedCheckIn.numberOfPeople}
						currentRestaurantId={currentUserData?.uid}
						isProcessing={isProcessing}
					/>
				)}
			</View>
			{/* Show a global processing overlay if you like */}
			{isProcessing && (
				<View style={styles.processingOverlay}>
					<ActivityIndicator size="large" color={colors.surfaceWhite} />
					<Text style={styles.processingText}>Confirming...</Text>
				</View>
			)}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	titleContainer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
	title: { fontSize: 28, fontWeight: "bold", color: colors.textDark },
	listContainer: { paddingHorizontal: 15, paddingVertical: 10 },
	infoContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	noCheckinsText: {
		fontSize: 18,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 15,
	},
	errorText: { fontSize: 16, color: colors.statusDanger, textAlign: "center" },
	processingOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "center",
		alignItems: "center",
	},
	processingText: {
		marginTop: 15,
		color: colors.surfaceWhite,
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default RestaurantCheckin;
