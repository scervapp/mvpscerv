// src/components/global/AuthPromptModal.js
import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles"; // Adjust path

const AuthPromptModal = ({
	isVisible,
	onClose,
	onLoginPress,
	onSignupPress,
	message = "Create a free account to unlock this feature and save your activity.",
}) => {
	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<TouchableOpacity
				style={styles.modalOverlay}
				activeOpacity={1}
				onPressOut={onClose}
			>
				<TouchableOpacity style={styles.modalContent} activeOpacity={1}>
					<Ionicons
						name="lock-closed-outline"
						size={48}
						color={colors.primary}
						style={{ marginBottom: 15 }}
					/>
					<Text style={styles.modalTitle}>Account Required</Text>
					<Text style={styles.modalMessage}>{message}</Text>

					<View style={styles.buttonContainer}>
						<Button
							mode="contained"
							onPress={onSignupPress}
							style={styles.button}
							labelStyle={styles.buttonText}
						>
							Sign Up
						</Button>
						<Button
							mode="outlined"
							onPress={onLoginPress}
							style={[styles.button, styles.loginButton]}
							labelStyle={[styles.buttonText, { color: colors.primary }]}
						>
							Log In
						</Button>
					</View>
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.6)",
	},
	modalContent: {
		width: "90%",
		maxWidth: 400,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 16,
		padding: 25,
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 10,
	},
	modalMessage: {
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 25,
		lineHeight: 24,
	},
	buttonContainer: {
		width: "100%",
	},
	button: {
		paddingVertical: 8,
		borderRadius: 8,
		marginBottom: 12,
	},
	loginButton: {
		borderColor: colors.primary,
		borderWidth: 1.5,
	},
	buttonText: {
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default AuthPromptModal;
