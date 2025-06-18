// screens/restaurant/RestaurantDashboardScreen.js
import React, { useContext, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	ScrollView,
	TouchableOpacity,
} from "react-native";
import { Button } from "react-native-paper";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import moment from "moment";
import { useWorkDay } from "../../context/restaurant/WorkDayContext";
import colors from "../../utils/styles/appStyles";
import { AuthContext } from "../../context/authContext";

const DashboardCard = ({ label, iconName, onPress }) => (
	<TouchableOpacity style={styles.card} onPress={onPress}>
		<View style={styles.iconContainer}>
			<MaterialCommunityIcons
				name={iconName}
				size={40}
				color={colors.primary}
			/>
		</View>
		<Text style={styles.cardLabel}>{label}</Text>
	</TouchableOpacity>
);

const RestaurantDashboardScreen = ({ navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const { currentWorkDay, workDayStatus, isLoading, startWorkDay, endWorkDay } =
		useWorkDay();
	const [isActionLoading, setIsActionLoading] = useState(false);

	const handleStartDay = async () => {
		setIsActionLoading(true);
		const success = await startWorkDay();
		if (success) {
			Alert.alert("Work Day Started", "The restaurant is now open.");
		}
		setIsActionLoading(false);
	};

	const handleEndDay = () => {
		Alert.alert(
			"End Work Day",
			"Are you sure you want to end the current work day?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "End Day",
					style: "destructive",
					onPress: async () => {
						setIsActionLoading(true);
						await endWorkDay();
						setIsActionLoading(false);
					},
				},
			]
		);
	};

	const renderStatusContent = () => {
		if (isLoading) {
			return <ActivityIndicator size="large" color={colors.primary} />;
		}

		if (workDayStatus === "OPEN" && currentWorkDay) {
			const startTime = moment(currentWorkDay.startTime?.toDate()).format("LT");
			return (
				<View style={styles.statusContent}>
					<Ionicons name="sunny" size={60} color={colors.statusSuccess} />
					<Text style={styles.statusTitle}>Restaurant is OPEN</Text>
					<Text style={styles.statusSubtitle}>Day started at {startTime}</Text>
					<Button
						mode="contained"
						onPress={handleEndDay}
						loading={isActionLoading}
						disabled={isActionLoading}
						style={[
							styles.actionButton,
							{ backgroundColor: colors.statusDanger },
						]}
						labelStyle={styles.actionButtonLabel}
						icon="weather-night"
					>
						End Work Day
					</Button>
				</View>
			);
		} else {
			// CLOSED
			return (
				<View style={styles.statusContent}>
					<Ionicons name="moon" size={60} color={colors.textMedium} />
					<Text style={styles.statusTitle}>Restaurant is CLOSED</Text>
					<Text style={styles.statusSubtitle}>
						Tap below to begin a new work day.
					</Text>
					<Button
						mode="contained"
						onPress={handleStartDay}
						loading={isActionLoading}
						disabled={isActionLoading}
						style={[
							styles.actionButton,
							{ backgroundColor: colors.statusSuccess },
						]}
						labelStyle={styles.actionButtonLabel}
						icon="weather-sunny"
					>
						Start Work Day
					</Button>
				</View>
			);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView style={styles.container}>
				<View style={styles.header}>
					<Text style={styles.welcomeText}>
						Welcome, {currentUserData?.firstName || "Manager"}
					</Text>
					<Text style={styles.title}>
						{currentUserData?.restaurantName || "Dashboard"}
					</Text>
				</View>

				<View style={styles.statusContainer}>{renderStatusContent()}</View>

				<View style={styles.navigationGrid}>
					<DashboardCard
						label="Customers Waiting"
						iconName="account-clock-outline"
						onPress={() => navigation.navigate("RestaurantCheckin")}
					/>
					<DashboardCard
						label="Chef's Q"
						iconName="silverware-fork-knife"
						onPress={() => navigation.navigate("ChefsQ")}
					/>
					<DashboardCard
						label="Table Management"
						iconName="view-grid-outline"
						onPress={() => navigation.navigate("TableManagement")}
					/>
					<DashboardCard
						label="Back Office"
						iconName="briefcase-outline"
						onPress={() => navigation.navigate("BackOffice")} // Navigates to your existing screen
					/>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
	welcomeText: { fontSize: 18, color: colors.textMedium },
	title: { fontSize: 28, fontWeight: "bold", color: colors.textDark },
	statusContainer: {
		padding: 20,
		margin: 15,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 16,
		elevation: 5,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 5,
	},
	statusContent: {
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 20,
	},
	statusTitle: {
		fontSize: 24,
		fontWeight: "bold",
		marginTop: 15,
		marginBottom: 8,
		color: colors.textDark,
	},
	statusSubtitle: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 30,
		maxWidth: "85%",
	},
	actionButton: { borderRadius: 8, paddingVertical: 10, width: "90%" },
	actionButtonLabel: { fontSize: 16, fontWeight: "bold" },
	navigationGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-around",
		paddingHorizontal: 10,
		marginTop: 10,
	},
	card: {
		width: "45%",
		aspectRatio: 1,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		marginBottom: 15,
		alignItems: "center",
		justifyContent: "center",
		elevation: 3,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 3,
	},
	iconContainer: { marginBottom: 12 },
	cardLabel: {
		fontSize: 16,
		fontWeight: "600",
		textAlign: "center",
		color: colors.textDark,
	},
});

export default RestaurantDashboardScreen;
