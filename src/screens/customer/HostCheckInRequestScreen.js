import React, { useContext, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	InputAccessoryView,
	Keyboard,
	Platform,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { useParty } from "../../context/customer/PartyContext";
import { functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";

const HostCheckInRequestScreen = ({ route, navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const { getRestaurantSessions } = useParty();
	const restaurant = route.params?.restaurant;
	const { dineInPartyId } = getRestaurantSessions(restaurant?.id);
	const keyboardAccessoryId = "host-check-in-keyboard-toolbar";

	const [partySize, setPartySize] = useState("2");
	const [occasion, setOccasion] = useState("");
	const [seatingPreference, setSeatingPreference] = useState("");
	const [allergyNotes, setAllergyNotes] = useState("");
	const [guestNotes, setGuestNotes] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const activeCheckIn = currentUserData?.activeCheckIn || null;
	const hasActiveRequest =
		activeCheckIn?.restaurantId === restaurant?.id &&
		["REQUESTED", "ACCEPTED"].includes(
			String(activeCheckIn?.status || "").toUpperCase(),
		);

	const handleSubmit = async () => {
		if (hasActiveRequest) {
			Alert.alert(
				"Check-in request sent",
				"The host already has your request.",
			);
			return;
		}
		const parsedPartySize = Number(partySize);
		if (!restaurant?.id || !parsedPartySize || parsedPartySize < 1) {
			Alert.alert("Missing info", "Enter a valid party size.");
			return;
		}

		setIsSubmitting(true);

		try {
			const createRequest = httpsCallable(functions, "createHostCheckInRequest");
			await createRequest({
				restaurantId: restaurant.id,
				numberOfPeople: parsedPartySize,
				partyId: dineInPartyId || null,
				customerName:
					`${currentUserData?.firstName || ""} ${
						currentUserData?.lastName || ""
					}`.trim() ||
					currentUserData?.displayName ||
					"Guest",
				occasion,
				seatingPreference,
				allergyNotes,
				guestNotes,
			});

			Alert.alert(
				"Request sent",
				"The host will seat your party soon.",
				[{ text: "OK", onPress: () => navigation.goBack() }],
			);
		} catch (error) {
			console.error("Error creating host check-in request:", error);
			Alert.alert(
				"Could not request check-in",
				error.message || "Please try again.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView
				contentContainerStyle={styles.container}
				keyboardDismissMode="interactive"
				keyboardShouldPersistTaps="handled"
			>
				<Text style={styles.title}>Ask to be seated</Text>
				<Text style={styles.subtitle}>{restaurant?.restaurantName}</Text>
				{hasActiveRequest ? (
					<View style={styles.pendingBanner}>
						<Ionicons
							name="time-outline"
							size={18}
							color={colors.statusSuccess}
						/>
						<Text style={styles.pendingBannerText}>
							The host has your request.
						</Text>
					</View>
				) : null}

				<Text style={styles.label}>Party size</Text>
				<TextInput
					value={partySize}
					onChangeText={setPartySize}
					style={styles.input}
					keyboardType="number-pad"
					placeholder="2"
					placeholderTextColor={colors.textLight}
					inputAccessoryViewID={keyboardAccessoryId}
				/>

				<Text style={styles.label}>Occasion</Text>
				<TextInput
					value={occasion}
					onChangeText={setOccasion}
					style={styles.input}
					placeholder="Date night, celebration, business meal..."
					placeholderTextColor={colors.textLight}
					inputAccessoryViewID={keyboardAccessoryId}
					returnKeyType="done"
					onSubmitEditing={Keyboard.dismiss}
				/>

				<Text style={styles.label}>Seating preference</Text>
				<TextInput
					value={seatingPreference}
					onChangeText={setSeatingPreference}
					style={styles.input}
					placeholder="Patio, booth, quiet table..."
					placeholderTextColor={colors.textLight}
					inputAccessoryViewID={keyboardAccessoryId}
					returnKeyType="done"
					onSubmitEditing={Keyboard.dismiss}
				/>

				<Text style={styles.label}>Allergies or dietary needs</Text>
				<TextInput
					value={allergyNotes}
					onChangeText={setAllergyNotes}
					style={styles.textArea}
					placeholder="Anything the host or server should know."
					placeholderTextColor={colors.textLight}
					multiline
					blurOnSubmit
					inputAccessoryViewID={keyboardAccessoryId}
					returnKeyType="done"
					onSubmitEditing={Keyboard.dismiss}
				/>

				<Text style={styles.label}>Notes</Text>
				<TextInput
					value={guestNotes}
					onChangeText={setGuestNotes}
					style={styles.textArea}
					placeholder="Tell them what would make the visit better."
					placeholderTextColor={colors.textLight}
					multiline
					blurOnSubmit
					inputAccessoryViewID={keyboardAccessoryId}
					returnKeyType="done"
					onSubmitEditing={Keyboard.dismiss}
				/>

				<TouchableOpacity
					style={[
						styles.submitButton,
						(isSubmitting || hasActiveRequest) && styles.buttonDisabled,
					]}
					onPress={handleSubmit}
					disabled={isSubmitting || hasActiveRequest}
				>
					{isSubmitting ? (
						<ActivityIndicator color="#fff" />
					) : (
						<View style={styles.submitContent}>
							<Ionicons name="person-add-outline" size={18} color="#fff" />
							<Text style={styles.submitButtonText}>
								{hasActiveRequest ? "Request sent" : "Ask to be seated"}
							</Text>
						</View>
					)}
				</TouchableOpacity>
			</ScrollView>
			{Platform.OS === "ios" ? (
				<InputAccessoryView nativeID={keyboardAccessoryId}>
					<View style={styles.keyboardAccessory}>
						<TouchableOpacity
							style={styles.keyboardDoneButton}
							onPress={Keyboard.dismiss}
						>
							<Text style={styles.keyboardDoneText}>Done</Text>
						</TouchableOpacity>
					</View>
				</InputAccessoryView>
			) : null}
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { padding: 20, paddingBottom: 36 },
	title: {
		fontSize: 26,
		fontWeight: "900",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 15,
		color: colors.textMedium,
		marginTop: 4,
		marginBottom: 20,
	},
	pendingBanner: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 8,
		backgroundColor: colors.statusSuccess + "12",
		borderWidth: 1,
		borderColor: colors.statusSuccess + "35",
		padding: 12,
		marginBottom: 12,
	},
	pendingBannerText: {
		flex: 1,
		marginLeft: 8,
		color: colors.textDark,
		fontSize: 13,
		fontWeight: "800",
	},
	label: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
		marginTop: 14,
		marginBottom: 8,
	},
	input: {
		minHeight: 50,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 12,
		color: colors.textDark,
		fontSize: 15,
	},
	textArea: {
		minHeight: 92,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		padding: 12,
		color: colors.textDark,
		fontSize: 15,
		textAlignVertical: "top",
	},
	submitButton: {
		minHeight: 54,
		backgroundColor: colors.primary,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 22,
	},
	submitContent: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	submitButtonText: {
		color: "#fff",
		fontWeight: "900",
		fontSize: 16,
		marginLeft: 8,
	},
	buttonDisabled: { opacity: 0.55 },
	keyboardAccessory: {
		minHeight: 44,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		alignItems: "flex-end",
		justifyContent: "center",
		paddingHorizontal: 12,
	},
	keyboardDoneButton: {
		minHeight: 36,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	keyboardDoneText: {
		color: colors.primary,
		fontWeight: "900",
		fontSize: 16,
	},
});

export default HostCheckInRequestScreen;
