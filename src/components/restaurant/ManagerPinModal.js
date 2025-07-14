// src/components/restaurant/ManagerPinModal.js
import React, { useState, useEffect, useContext } from "react";
import {
	View,
	Text,
	Modal,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
} from "react-native";

import { functions } from "../../config/firebase"; // Adjust path

import colors from "../../utils/styles/appStyles"; // Adjust path
import { AuthContext } from "../../context/authContext";

const PinPadButton = ({ value, onPress }) => (
	<TouchableOpacity style={styles.pinButton} onPress={() => onPress(value)}>
		<Text style={styles.pinButtonText}>{value}</Text>
	</TouchableOpacity>
);

const ManagerPinModal = ({
	isVisible, // Boolean to control visibility
	onClose, // Function to close the modal
	onSuccess, // IMPORTANT: The function to execute upon successful PIN verification
	employeeToVerify, // The employee object {id, name} whose PIN we are checking
	restaurantId,
}) => {
	const [pin, setPin] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const verifyPinFunction = functions.httpsCallable("verifyEmployeePin");
	const [hasVerified, setHasVerified] = useState(false);

	// Reset PIN when modal becomes visible or employee changes
	useEffect(() => {
		if (hasVerified) return;
		if (isVisible) {
			setPin("");
			setError("");
		}
	}, [isVisible]);

	const handleKeyPress = (value) => {
		if (pin.length < 6) {
			setPin(pin + value);
		}
	};

	const handleDelete = () => {
		setPin(pin.slice(0, -1));
	};

	const handleSubmit = async () => {
		if (pin.length < 4) {
			setError("PIN must be at least 4 digits.");
			return;
		}

		const employeeIdToVerify = employeeToVerify?.id;
		// Add a guard clause to ensure restaurantId was passed as a prop.
		if (!restaurantId) {
			setError("Restaurant information is missing. Cannot verify PIN.");
			console.error("ManagerPinModal: restaurantId prop is missing!");
			return;
		}
		setIsLoading(true);
		setError("");
		try {
			const result = await verifyPinFunction({
				restaurantId: restaurantId,
				employeeId: employeeIdToVerify,
				pin: pin,
			});

			if (result.data.success) {
				// If PIN is correct, call the onSuccess callback passed in props
				// and pass the verified employee's data to it.
				onSuccess(result.data.employee);
			} else {
				setError(result.data.message || "Invalid PIN.");
			}
		} catch (err) {
			console.error("PIN verification error:", err);
			setError("An error occurred. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>Manager PIN Required</Text>
					<Text style={styles.modalSubtitle}>
						Please enter PIN for {employeeToVerify?.name}
					</Text>

					<View style={styles.pinDisplay}>
						{Array(6)
							.fill(0)
							.map((_, i) => (
								<View
									key={i}
									style={[styles.pinDot, i < pin.length && styles.pinDotFilled]}
								/>
							))}
					</View>

					{error ? (
						<Text style={styles.errorText}>{error}</Text>
					) : (
						<View style={styles.errorPlaceholder} />
					)}

					{isLoading ? (
						<ActivityIndicator size="large" color={colors.primary} />
					) : (
						<View style={styles.pinPad}>
							<View style={styles.pinRow}>
								<PinPadButton value="1" onPress={handleKeyPress} />
								<PinPadButton value="2" onPress={handleKeyPress} />
								<PinPadButton value="3" onPress={handleKeyPress} />
							</View>
							<View style={styles.pinRow}>
								<PinPadButton value="4" onPress={handleKeyPress} />
								<PinPadButton value="5" onPress={handleKeyPress} />
								<PinPadButton value="6" onPress={handleKeyPress} />
							</View>
							<View style={styles.pinRow}>
								<PinPadButton value="7" onPress={handleKeyPress} />
								<PinPadButton value="8" onPress={handleKeyPress} />
								<PinPadButton value="9" onPress={handleKeyPress} />
							</View>
							<View style={styles.pinRow}>
								<TouchableOpacity style={styles.cancelButton} onPress={onClose}>
									<Text style={styles.cancelButtonText}>Cancel</Text>
								</TouchableOpacity>
								<PinPadButton value="0" onPress={handleKeyPress} />
								<TouchableOpacity
									style={styles.pinButton}
									onPress={handleDelete}
								>
									<Text style={styles.pinButtonText}>{"<"}</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}

					<TouchableOpacity
						style={[
							styles.submitButton,
							pin.length < 4 && styles.submitButtonDisabled,
						]}
						onPress={handleSubmit}
						disabled={pin.length < 4}
					>
						<Text style={styles.submitButtonText}>Enter</Text>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.7)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 16,
		padding: 25,
		width: "100%",
		maxWidth: 350,
		alignItems: "center",
	},
	modalTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 8,
	},
	modalSubtitle: { fontSize: 16, color: colors.textMedium, marginBottom: 20 },
	pinDisplay: {
		flexDirection: "row",
		justifyContent: "center",
		marginBottom: 10,
	},
	pinDot: {
		width: 15,
		height: 15,
		borderRadius: 7.5,
		backgroundColor: colors.borderLight,
		marginHorizontal: 10,
	},
	pinDotFilled: { backgroundColor: colors.primary },
	errorText: {
		color: colors.statusDanger,
		height: 20,
		marginBottom: 10,
		fontWeight: "500",
	},
	errorPlaceholder: { height: 20, marginBottom: 10 },
	pinPad: { width: "100%" },
	pinRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginVertical: 10,
	},
	pinButton: {
		width: 70,
		height: 70,
		borderRadius: 35,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	pinButtonText: { fontSize: 24, color: colors.textDark },
	submitButton: {
		backgroundColor: colors.primary,
		paddingVertical: 15,
		borderRadius: 8,
		marginTop: 15,
		width: "100%",
		alignItems: "center",
	},
	submitButtonDisabled: { backgroundColor: colors.textLight },
	submitButtonText: {
		color: colors.textOnPrimaryBrand,
		fontSize: 16,
		fontWeight: "bold",
	},
	cancelButton: {
		width: 70,
		height: 70,
		justifyContent: "center",
		alignItems: "center",
	},
	cancelButtonText: {
		fontSize: 16,
		color: colors.textMedium,
		fontWeight: "600",
	},
});

export default ManagerPinModal;
