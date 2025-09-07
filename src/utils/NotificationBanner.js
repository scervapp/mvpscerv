import React from "react";
import { View, Text, StyleSheet } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";
import { useNotification } from "../context/NotificationProvider";
import colors from "./styles/appStyles";

const bannerStyles = {
	info: {
		backgroundColor: "#e7f0ff", // A light, complementary blue
		icon: "information-circle",
		iconColor: colors.statusInfo, // From your theme
	},
	warning: {
		backgroundColor: "#fff9e6", // A light, complementary yellow
		icon: "warning",
		iconColor: colors.statusWarning, // From your theme
	},
	critical: {
		backgroundColor: "#fbe9eb", // A light, complementary red
		icon: "alert-circle",
		iconColor: colors.statusDanger, // From your theme
	},
};

export const NotificationBanner = () => {
	// Get the notification data from our provider
	const notification = useNotification();

	// If there is no notification, render nothing
	if (!notification) {
		return null;
	}

	const style = bannerStyles[notification.type] || bannerStyles.info;

	return (
		<View
			style={[styles.container, { backgroundColor: style.backgroundColor }]}
		>
			<Ionicons
				name={style.icon}
				size={24}
				color={style.iconColor}
				style={styles.icon}
			/>
			<View style={styles.textContainer}>
				{notification.title && (
					<Text style={styles.title}>{notification.title}</Text>
				)}
				<Text style={styles.message}>{notification.message}</Text>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		padding: 16,
		flexDirection: "row",
		alignItems: "center",
	},
	icon: {
		marginRight: 12,
	},
	textContainer: {
		flex: 1,
	},
	title: {
		fontWeight: "bold",
		fontSize: 16,
		marginBottom: 4,
		color: colors.textDark, // --- CHANGE: Use your dark text color ---
	},
	message: {
		fontSize: 14,
		color: colors.textDark, // --- CHANGE: Use your dark text color ---
	},
});
