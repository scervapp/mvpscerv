import React, { useEffect, useState, useContext } from "react";

import { Text, View, Button } from "react-native";
import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
const RestaurantDashboard = ({ navigation }) => {
	const { t } = useTranslation();
	const { isLoading, currentUserData, logout } = useContext(AuthContext);
	const [isSetupButtonVisible, setIsSetupButtonVisible] = useState(true);

	useEffect(() => {
		const checkProfileCompleted = async () => {
			const userDocSnap = await db
				.collection("users")
				.doc(currentUserData.uid)
				.get();
			if (userDocSnap.exists() && userDocSnap.data().completedProfile) {
				// Hide setup button if the profile is already completed
				setIsSetupButtonVisible(false);
			}
		};

		checkProfileCompleted();
	}, []);

	// write logout code from authcontext
	handleLogout = () => {
		logout(navigation);
	};

	const handleSetupProfile = () => {
		// Navigate to the setup profile screen
		navigation.navigate("RestaurantProfile");
	};

	return (
		<View style={styles.container}>
			<Text>
				{t("restaurant_dashboard")} {currentUserData.restaurantName}
			</Text>
			{isSetupButtonVisible && (
				<Button title={t("setup_profile")} onPress={handleSetupProfile} />
			)}
			<Button title={t("logout")} onPress={handleLogout} />
		</View>
	);
};

// Add stylesheet
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default RestaurantDashboard;
