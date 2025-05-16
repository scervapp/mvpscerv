import React, { useContext, useState, useEffect } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	ScrollView,
	TouchableOpacity,
	TextInput,
	Alert, // For placeholder actions
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import {
	Ionicons,
	MaterialCommunityIcons,
	FontAwesome5,
} from "@expo/vector-icons"; // Popular icon sets

import colors from "../../utils/styles/appStyles";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";

// Placeholder for components to be reused/refactored from PartyLobbyScreen for active party state
// e.g., import PartyDetailsDisplay from '../components/customer/Party/PartyDetailsDisplay';
// e.g., import PartyMembersList from '../components/customer/Party/PartyMembersList';
// e.g., import SharedBasketView from '../components/customer/Party/SharedBasketView';
// e.g., import ActivePartyActions from '../components/customer/Party/ActivePartyActions';

/**
 * A reusable button component featuring an icon and text underneath.
 */

const IconTextButton = ({
	iconName,
	iconSet = "Ionicons", // Default to Ionicons
	text,
	onPress,
	color, // Optional: color for icon and text
	iconSize = 32,
	fontSize = 13,
	style, // Optional: additional style for the touchable container
	disabled = false,
}) => {
	let IconComponent;
	switch (iconSet) {
		case "MaterialCommunityIcons":
			IconComponent = MaterialCommunityIcons;
			break;
		case "FontAwesome5":
			IconComponent = FontAwesome5;
			break;
		case "Ionicons":
		default:
			IconComponent = Ionicons;
			break;
	}

	const activeColor = disabled ? colors.textLight : color || colors.primary;

	return (
		<TouchableOpacity
			onPress={onPress}
			style={[styles.iconTextButtonContainer, style]}
			disabled={disabled}
		>
			<IconComponent name={iconName} size={iconSize} color={activeColor} />
			<Text
				style={[
					styles.iconTextButtonText,
					{ color: activeColor, fontSize: fontSize },
				]}
			>
				{text}
			</Text>
		</TouchableOpacity>
	);
};

const PartySessionScreen = () => {
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const {
		currentPartyId,
		partyDetails,
		isLoadingParty, // True when context is loading party details for currentPartyId
		partyError,
		sharedBasketItems, // Needed for the active party view
		// --- Context Actions ---
		// Assuming these functions exist in PartyContext and handle backend + context state updates:
		// createParty, // (restaurantId) => Promise<string | null> (returns partyId or null)
		joinParty, // ({ inviteCode }) => Promise<boolean> (returns true on success)
		leaveParty, // () => Promise<void>
		cancelParty, // () => Promise<void>
		// activatePartyCheckIn, // (checkInDocId) => Promise<void>
		// sendMyItemsToKitchen, // (itemsToSend) => Promise<void>
	} = useParty();

	const [inviteCode, setInviteCode] = useState("");
	const [uiLoading, setUiLoading] = useState(false); // For local actions like join attempt
	const [uiError, setUiError] = useState(null);

	// Derived state
	const isHost =
		partyDetails && currentUserData?.uid === partyDetails.hostUserId;

	// --- Action Handlers ---
	const handleStartNewPartyGuidance = () => {
		Alert.alert(
			"Start a New Party",
			"To begin a new party, please find a restaurant from the Home screen. You can then start a party directly from the restaurant's detail page.",
			[
				{
					text: "Go to Home",
					// Navigate to your main restaurant discovery tab/screen.
					// Replace 'CustomerDashboard' with the actual route name of your home/discovery tab/stack.
					onPress: () => navigation.navigate("CustomerDashboard"),
				},
				{
					text: "OK",
					style: "cancel",
				},
			]
		);
	};

	const handleJoinPartyAttempt = async () => {
		if (!inviteCode.trim()) {
			setUiError("Please enter an invite code.");
			return;
		}
		setUiLoading(true);
		setUiError(null);
		try {
			const joined = await joinParty({ inviteCode }); // Assuming joinParty is from context
			if (!joined) {
				// If joinParty returns false or PartyContext sets an error, reflect it
				setUiError(
					partyError ||
						"Failed to join party. The code might be invalid, expired, or the party is full."
				);
			}
			// If joinParty is successful, PartyContext will update currentPartyId,
			// and this component will re-render into the "Active Party State".
			// No explicit navigation needed from here if context drives the state.
		} catch (error) {
			console.error("PartySessionScreen: Error joining party", error);
			setUiError(
				error.message || "An unexpected error occurred while trying to join."
			);
		} finally {
			setUiLoading(false);
			setInviteCode(""); // Clear input after attempt
		}
	};

	const handleLeaveParty = async () => {
		Alert.alert("Leave Party", "Are you sure you want to leave this party?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Leave",
				style: "destructive",
				onPress: async () => {
					setUiLoading(true);
					try {
						await leaveParty(); // Context handles navigation or state clearing
					} catch (e) {
						Alert.alert("Error", "Could not leave party.");
					} finally {
						setUiLoading(false);
					}
				},
			},
		]);
	};

	const handleCancelParty = async () => {
		// Host only
		Alert.alert(
			"Cancel Party",
			"Are you sure you want to cancel this entire party? This cannot be undone.",
			[
				{ text: "Keep Party", style: "cancel" },
				{
					text: "Cancel Party",
					style: "destructive",
					onPress: async () => {
						setUiLoading(true);
						try {
							await cancelParty(); // Context handles navigation or state clearing
						} catch (e) {
							Alert.alert("Error", "Could not cancel party.");
						} finally {
							setUiLoading(false);
						}
					},
				},
			]
		);
	};

	// --- Render Logic ---

	// State 1: Context is loading details for an *existing* party reference
	if (isLoadingParty && currentPartyId && !partyDetails) {
		return (
			<View style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.statusText}>Loading your party details...</Text>
			</View>
		);
	}

	// State 2: User is IN an active party
	if (currentPartyId && partyDetails) {
		// This is where the main UI for an active party will go.
		// You'll integrate components and logic from your previous PartyLobbyScreen.
		return (
			<ScrollView
				style={styles.screen}
				contentContainerStyle={styles.scrollContentContainer}
			>
				<View style={styles.activePartyHeader}>
					<Text style={styles.activePartyTitle}>
						{partyDetails.restaurantName || "Party Hub"}
					</Text>
					<Text style={styles.activePartyStatus}>
						Status: {partyDetails.status}
					</Text>
				</View>

				{/* Placeholder for detailed party content */}
				<View style={styles.contentSection}>
					<Text style={styles.sectionTitle}>Members (Placeholder)</Text>
					{/* <PartyMembersList members={partyDetails.guestPips} /> */}
				</View>

				<View style={styles.contentSection}>
					<Text style={styles.sectionTitle}>Shared Basket (Placeholder)</Text>
					{/* <SharedBasketView items={sharedBasketItems} partyStatus={partyDetails.status} /> */}
				</View>

				<View style={[styles.contentSection, styles.actionsRowContainer]}>
					<Text style={styles.sectionTitle}>Actions</Text>
					{/* <ActivePartyActions isHost={isHost} partyDetails={partyDetails} /> */}
					{/* Example actions - to be componentized */}
					<IconTextButton
						iconName="person-add-outline"
						text="Invite"
						onPress={() => Alert.alert("Invite Tapped")}
					/>
					{partyDetails.status === "active" && (
						<IconTextButton
							iconName="send-outline"
							text="Send Items"
							onPress={() => Alert.alert("Send Items Tapped")}
						/>
					)}
					{isHost && partyDetails.status === "pending" && (
						<IconTextButton
							iconSet="MaterialCommunityIcons"
							iconName="location-check"
							text="Activate"
							onPress={() => Alert.alert("Activate Check-in Tapped")}
						/>
					)}
					{isHost && partyDetails.status === "pending" ? (
						<IconTextButton
							iconSet="MaterialCommunityIcons"
							iconName="close-circle-outline"
							text="Cancel Party"
							onPress={handleCancelParty}
							color={colors.danger}
							disabled={uiLoading}
						/>
					) : (
						<IconTextButton
							iconSet="Ionicons"
							iconName="exit-outline"
							text="Leave Party"
							onPress={handleLeaveParty}
							color={colors.danger}
							disabled={uiLoading}
						/>
					)}
				</View>
				{uiLoading && (
					<ActivityIndicator
						style={{ marginVertical: 10 }}
						color={colors.primary}
					/>
				)}
			</ScrollView>
		);
	}

	// State 3: User is NOT in a party (or an error occurred trying to load a previous party)
	return (
		<View style={styles.centeredScreen}>
			<FontAwesome5
				name="glass-cheers"
				size={60}
				color={colors.primary}
				style={{ marginBottom: 20 }}
			/>
			<Text style={styles.hubTitle}>Party Hub</Text>
			<Text style={styles.hubSubtitle}>
				Join an existing party or start a new one from a restaurant's page.
			</Text>

			{partyError && <Text style={styles.errorText}>{partyError}</Text>}
			{uiError && <Text style={styles.errorText}>{uiError}</Text>}

			<View style={styles.noPartyActionsContainer}>
				{/* Modified "Start a Party" guidance */}
				<IconTextButton
					iconSet="MaterialCommunityIcons"
					iconName="creation" // Changed icon to reflect guidance
					text="How to Start a Party"
					onPress={handleStartNewPartyGuidance} // Calls the guidance alert
					style={styles.mainAction}
					iconSize={40}
					fontSize={16}
					color={colors.primary} // Use your primary color
				/>

				<Text style={styles.orText}>or</Text>

				<View style={styles.joinPartyContainer}>
					<TextInput
						placeholder="Enter Party Code"
						value={inviteCode}
						onChangeText={setInviteCode}
						style={styles.joinInput}
						autoCapitalize="characters"
						placeholderTextColor={colors.textLight}
						maxLength={6}
					/>
					<IconTextButton
						iconSet="Ionicons"
						iconName="log-in-outline"
						text="Join Party"
						onPress={handleJoinPartyAttempt}
						disabled={uiLoading || !inviteCode}
						color={
							!inviteCode || uiLoading ? colors.textLight : colors.statusSuccess
						} // Use success color
						style={styles.joinButton}
						iconSize={28}
						fontSize={15}
					/>
				</View>
				{uiLoading && (
					<ActivityIndicator style={{ marginTop: 15 }} color={colors.primary} />
				)}
			</View>
		</View>
	);
};

// --- Styles --- (Modern, clean, professional)
const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.background || "#FDFEFE", // Light background
	},
	scrollContentContainer: {
		paddingBottom: 30, // Space for final elements
	},
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: 20, // Give some bottom padding
		backgroundColor: colors.background || "#FDFEFE",
	},
	statusText: {
		marginTop: 15,
		fontSize: 16,
		color: colors.textDark,
	},
	// Active Party State Styles
	activePartyHeader: {
		paddingVertical: 20,
		paddingHorizontal: 15,
		backgroundColor: colors.primary, // Use primary color for header
		alignItems: "center",
		borderBottomLeftRadius: 20,
		borderBottomRightRadius: 20,
		marginBottom: 20,
	},
	activePartyTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: colors.white, // White text on primary background
	},
	activePartyStatus: {
		fontSize: 16,
		color: colors.whiteAlpha70, // Slightly transparent white
		marginTop: 4,
	},
	contentSection: {
		marginBottom: 25,
		paddingHorizontal: 15,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "600", // Semi-bold
		color: colors.textDark,
		marginBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
		paddingBottom: 6,
	},
	actionsRowContainer: {
		// For icon buttons in active party
		// If you want them in a row:
		// flexDirection: 'row',
		// justifyContent: 'space-around',
		// alignItems: 'flex-start', // Icons at top, text below
		// flexWrap: 'wrap', // Allow wrapping if many actions
	},

	// No Active Party State Styles
	hubTitle: {
		fontSize: 32,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 8,
		textAlign: "center",
	},
	hubSubtitle: {
		fontSize: 16,
		color: colors.textMedium, // Medium emphasis text
		textAlign: "center",
		marginBottom: 30,
		paddingHorizontal: 10,
	},
	noPartyActionsContainer: {
		width: "100%",
		alignItems: "center",
		marginTop: 20,
	},
	mainAction: {
		paddingVertical: 15,
		paddingHorizontal: 20,
		backgroundColor: colors.accent,
		borderRadius: 12,
		// Shadow for a modern "card" feel
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 5,
		marginBottom: 25,
	},
	orText: {
		fontSize: 16,
		color: colors.textLight,
		marginVertical: 20,
		fontWeight: "500",
	},
	joinPartyContainer: {
		width: "100%",
		alignItems: "center",
		padding: 15,
		backgroundColor: colors.accent,
		borderRadius: 12,
		shadowColor: "#000", // Consistent shadow
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 2.0,
		elevation: 3,
	},
	joinInput: {
		width: "90%",
		borderWidth: 1,
		borderColor: colors.mediumGray,
		backgroundColor: colors.white, // Input often looks good on white
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 8,
		fontSize: 18, // Larger for easy tapping
		color: colors.textDark,
		marginBottom: 15,
		textAlign: "center",
	},
	joinButton: {
		paddingVertical: 8, // Slightly smaller padding for a secondary action feel
	},
	iconTextButtonContainer: {
		// Container for individual icon+text buttons
		alignItems: "center",
		paddingVertical: 10, // Vertical spacing for touch target
		paddingHorizontal: 5, // Horizontal spacing if they are in a row
		minWidth: 80, // Ensure touch target width
	},
	iconTextButtonText: {
		marginTop: 6, // Space between icon and text
		textAlign: "center",
		fontWeight: "500", // Medium weight for clarity
	},
	errorText: {
		color: colors.danger,
		fontSize: 14,
		textAlign: "center",
		marginBottom: 15, // Space below error
		paddingHorizontal: 10,
	},
});

export default PartySessionScreen;
