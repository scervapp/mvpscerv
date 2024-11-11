import React, { useState, useEffect, useContext } from "react";
import {
	View,
	Text,
	TextInput,
	Button,
	StyleSheet,
	Alert,
	TouchableOpacity,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";

const BackOfficeAccess = ({ navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const [pin, setPin] = useState("");
	const [savedPin, setSavedPin] = useState("");
	const [incorrectPin, setIncorrectPin] = useState(false);
	const [isSettingPin, setIsSettingPin] = useState(false);
	const [newPin, setNewPin] = useState("");
	const [confirmPin, setConfirmPin] = useState("");

	useEffect(() => {
		const fetchPin = async () => {
			try {
				const restaurantDocRef = doc(db, "restaurants", currentUserData.uid);
				const restaurantDocSnapshot = await getDoc(restaurantDocRef);

				if (restaurantDocSnapshot.exists()) {
					const storedPin = restaurantDocSnapshot.data().backOfficePin;
					setSavedPin(storedPin);

					if (!storedPin) {
						setIsSettingPin(true);
					}
				}
			} catch (error) {
				console.error("Error fetching  Pin:", error);
			}
		};
		fetchPin();
	}, []);

	const handlePinSubmit = () => {
		if (pin === savedPin) {
			// Replace '1234' with the actual PIN or fetched PIN
			navigation.navigate("BackOffice");
		} else {
			setIncorrectPin(true);
		}
	};

	const handleSetPin = async () => {
		if (newPin === confirmPin) {
			try {
				const restaurantDocRef = doc(db, "restaurants", currentUserData.uid);
				await updateDoc(restaurantDocRef, {
					backOfficePin: newPin,
				});
				setIsSettingPin(false);
				setNewPin(""); // Clear the newPin field
				setConfirmPin(""); // Clear the confirmPin field
			} catch (error) {
				console.error("Error setting PIN:", error);
				Alert.alert("Error", "Failed to set PIN. Please try again.");
			}
		}
	};
	const handleForgotPin = () => {
		// For now, just reset the PIN in Firestore (replace with your desired logic)
		Alert.alert(
			"Reset PIN",
			"Are you sure you want to reset the PIN? You will need to set a new PIN.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Reset",
					style: "destructive",
					onPress: async () => {
						try {
							const restaurantDocRef = doc(
								db,
								"restaurants",
								currentUserData.uid
							);
							await updateDoc(restaurantDocRef, { backofficePin: null }); // Clear the PIN in Firestore
							setIsSettingPin(true); // Show the PIN setting UI
						} catch (error) {
							console.error("Error resetting PIN:", error);
							Alert.alert("Error", "Failed to reset PIN. Please try again.");
						}
					},
				},
			]
		);
	};

	if (isSettingPin) {
		return (
			<View style={styles.container}>
				<Text style={styles.title}>Set Backoffice PIN</Text>
				<TextInput
					style={styles.input}
					placeholder="Enter new PIN"
					value={newPin}
					onChangeText={setNewPin}
					keyboardType="number-pad"
					secureTextEntry
				/>
				<TextInput
					style={styles.input}
					placeholder="Confirm new PIN"
					value={confirmPin}
					onChangeText={setConfirmPin}
					keyboardType="number-pad"
					secureTextEntry
				/>
				<TouchableOpacity style={styles.setPinButton} onPress={handleSetPin}>
					{/* Styled button */}
					<Text style={styles.setPinButtonText}>Set PIN</Text>
				</TouchableOpacity>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Enter Backoffice PIN</Text>
			<TextInput
				style={styles.input}
				placeholder="Enter PIN"
				value={pin}
				onChangeText={setPin}
				keyboardType="number-pad"
				secureTextEntry
			/>
			{incorrectPin && <Text style={styles.errorText}>Incorrect PIN</Text>}

			<TouchableOpacity style={styles.enterButton} onPress={handlePinSubmit}>
				<Text style={styles.enterButtonText}>Enter</Text>
			</TouchableOpacity>

			<TouchableOpacity
				style={styles.forgotPinButton}
				onPress={handleForgotPin}
			>
				<Text style={styles.forgotPinButtonText}>Forgot PIN?</Text>
			</TouchableOpacity>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background, // Use your background color
		padding: 30,
		justifyContent: "center",
		alignItems: "center",
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.primary, // Use your primary color
		marginBottom: 30,
	},
	input: {
		borderWidth: 1,
		borderColor: colors.lightGray, // Use a light gray for the border
		borderRadius: 8,
		padding: 12,
		width: "80%",
		marginBottom: 20,
		fontSize: 16,
		textAlign: "center", // Center the PIN input text
	},
	errorText: {
		color: colors.error, // Use your error color
		fontSize: 16,
		marginBottom: 20,
	},
	enterButton: {
		backgroundColor: colors.primary, // Use your primary color
		padding: 15,
		borderRadius: 8,
		marginTop: 20,
		width: "80%",
		alignItems: "center",
	},
	enterButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},

	// Style for the "Forgot PIN?" button
	forgotPinButton: {
		marginTop: 15,
	},
	forgotPinButtonText: {
		color: colors.primary,
		fontSize: 16,
		textDecorationLine: "underline",
	},
	setPinButton: {
		// Style for the "Set PIN" button
		backgroundColor: colors.primary,
		padding: 15,
		borderRadius: 8,
		marginTop: 20,
		width: "80%",
		alignItems: "center",
	},
	setPinButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
});
export default BackOfficeAccess;
