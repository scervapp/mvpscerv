import React, { useState, useContext } from "react";
import {
	View,
	StyleSheet,
	Text,
	TextInput,
	Button,
	Label,
	ScrollView,
	TouchableOpacity,
} from "react-native";
import colors from "../../utils/styles/appStyles";
import { AuthContext } from "../../context/authContext";
import { ActivityIndicator } from "react-native-paper";

const RestaurantSignup = ({ navigation }) => {
	// State variables for all attributes
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [phoneNumber, setPhoneNumber] = useState("");
	const [restaurantName, setRestaurantName] = useState("");
	const [birthdate, setBirthdate] = useState("");
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [signupError, setSignupError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	// ... State variables for your custom attributes
	const { signup } = useContext(AuthContext);

	const handleSignupSubmit = async () => {
		setIsLoading(true);
		try {
			setSignupError("");
			await signup(
				email,
				password,
				{
					restaurantName: restaurantName,
					firstName: firstName,
					lastName: lastName,
					phoneNumber: phoneNumber,
				},
				"restaurant",
				navigation
			);
		} catch (error) {
			setSignupError(error.message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<ScrollView style={styles.container}>
			<Text style={styles.title}>Restaurant Signup</Text>

			<View style={styles.form}>
				<View style={styles.inputGroup}>
					<Text style={styles.label}>Email</Text>
					<TextInput
						style={styles.input}
						value={email}
						onChangeText={setEmail}
						placeholder="youremail@example.com"
						keyboardType="email-address"
						autoCapitalize="none"
					/>
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>Restaurant Name</Text>
					<TextInput
						style={styles.input}
						value={restaurantName}
						onChangeText={setRestaurantName}
						placeholder="Joe's Crabshack"
					/>
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>First Name</Text>
					<TextInput
						style={styles.input}
						value={firstName}
						onChangeText={setFirstName}
						placeholder="John"
					/>
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>Last Name</Text>
					<TextInput
						style={styles.input}
						value={lastName}
						onChangeText={setLastName}
						placeholder="Johnson"
					/>
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>Phone Number</Text>
					<TextInput
						style={styles.input}
						value={phoneNumber}
						onChangeText={setPhoneNumber}
						placeholder="Enter your phone number"
						keyboardType="phone-pad"
						maxLength={10}
					/>
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>Password</Text>
					<TextInput
						style={styles.input}
						value={password}
						onChangeText={setPassword}
						placeholder="Enter your password"
						secureTextEntry
					/>
				</View>

				{isLoading && <ActivityIndicator size="large" color={colors.primary} />}
				{signupError && (
					<View style={styles.errorArea}>
						<Text style={styles.errorText}>{signupError}</Text>
					</View>
				)}

				<TouchableOpacity
					style={styles.signupButton}
					onPress={handleSignupSubmit}
					disabled={isLoading}
				>
					<Text style={styles.signupButtonText}>Sign Up</Text>
				</TouchableOpacity>
			</View>
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
		padding: 30,
	},
	title: {
		fontSize: 28,
		fontWeight: "bold",
		color: colors.primary,
		textAlign: "center",
		marginBottom: 30,
	},
	form: {
		backgroundColor: colors.white,
		padding: 20,
		borderRadius: 10,
	},
	inputGroup: {
		marginBottom: 15,
	},
	label: {
		fontSize: 16,
		color: colors.text,
		marginBottom: 5,
	},
	input: {
		borderWidth: 1,
		borderColor: colors.gray,
		borderRadius: 8,
		padding: 10,
		backgroundColor: colors.inputBackground,
		fontSize: 16,
	},
	signupButton: {
		backgroundColor: colors.primary,
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 20,
	},
	signupButtonText: {
		color: "white",
		fontSize: 18,
		fontWeight: "bold",
	},
	errorArea: {
		marginTop: 10,
	},
	errorText: {
		color: "red",
		fontWeight: "bold",
		textAlign: "center",
	},
});

export default RestaurantSignup;
