import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import colors from "../../utils/styles/appStyles";

const RestaurantLockButton = ({
	color = colors.textDark,
	size = 24,
	style,
	iconStyle,
}) => {
	const { endSession } = useEmployeeSession();

	return (
		<TouchableOpacity
			onPress={endSession}
			style={[styles.button, style]}
			accessibilityRole="button"
			accessibilityLabel="Lock POS"
		>
			<Ionicons
				name="lock-closed"
				size={size}
				color={color}
				style={iconStyle}
			/>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	button: {
		minWidth: 44,
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
	},
});

export default RestaurantLockButton;
