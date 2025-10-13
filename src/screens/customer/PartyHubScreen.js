import React, { useState, useCallback, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	TextInput,
	TouchableOpacity,
	RefreshControl,
	useColorScheme,
	SafeAreaView, // Added for dynamic theming
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { useParty } from "../../context/customer/PartyContext";
import { AuthContext } from "../../context/authContext";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SwipeListView } from "react-native-swipe-list-view";
import PartyLobbyScreen from "./PartyLobbyScreen"; // Ensure correct path

import { scale, moderateScale } from "react-native-size-matters";

// Reusable button component with explicit colors
const IconTextButton = ({
	iconName,
	iconSet = "Ionicons",
	text,
	onPress,
	color,
	disabled = false,
}) => {
	const scheme = useColorScheme(); // For light/dark mode
	const IconComponent = iconSet === "Ionicons" ? Ionicons : FontAwesome5;
	const textColor = disabled ? colors.textLight : color || colors.textDark;
	const iconColor = disabled ? colors.textLight : color || colors.primary;
	const backgroundColor = disabled ? colors.mediumGray : colors.accent;

	return (
		<TouchableOpacity
			style={[
				styles.iconTextButtonContainer,
				{ backgroundColor }, // Explicit background
				disabled && styles.disabledButtonVisual,
			]}
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={text}
		>
			<IconComponent name={iconName} size={scale(28)} color={iconColor} />
			<Text style={[styles.iconTextButtonText, { color: textColor }]}>
				{text}
			</Text>
		</TouchableOpacity>
	);
};

// Helper functions for status badges
const getStatusColor = (status, scheme) => {
	const baseColors = {
		active: colors.statusSuccess || "#4CAF50",
		AWAITING_TABLE: colors.statusWarning || "#FFC107",
		default: colors.primary || "#2196F3",
	};
	// Adjust for dark mode
	return scheme === "dark" && status === "default"
		? colors.primaryDark || baseColors.default
		: baseColors[status] || baseColors.default;
};

const getStatusLabel = (status) => {
	return status === "AWAITING_TABLE"
		? "Waiting for Table"
		: status.charAt(0).toUpperCase() + status.slice(1);
};

// Stat component for guests/items
const Stat = ({ icon, label, value }) => (
	<View style={styles.stat}>
		<Ionicons name={icon} size={scale(20)} color={colors.primary} />
		<Text style={[styles.statLabel, { color: colors.textMedium }]}>
			{label}: {value}
		</Text>
	</View>
);

// Hidden delete row for swipe
const renderHiddenItem = ({ item }) => (
	<View style={[styles.hiddenItem, { backgroundColor: colors.danger }]}>
		<TouchableOpacity
			style={[styles.deleteButton, { backgroundColor: colors.danger }]}
			onPress={() => handleDeleteParty(item.partyId)}
			accessibilityRole="button"
			accessibilityLabel="Delete party"
		>
			<Ionicons name="trash-outline" size={scale(24)} color={colors.white} />
		</TouchableOpacity>
	</View>
);

const PartyHubScreen = () => {
	const navigation = useNavigation();
	const scheme = useColorScheme(); // For light/dark mode
	const { currentUserData } = React.useContext(AuthContext);
	const {
		currentPartyIds, // {restaurantId: partyId}
		partyDetails, // {partyId: details}
		isLoadingParty,
		partyError,
		sharedBaskets, // {partyId: items[]}
		joinParty,
		cancelParty,
	} = useParty();

	console.log("Party Details", partyDetails);

	const [inviteCode, setInviteCode] = useState("");
	const [uiJoinLoading, setUiJoinLoading] = useState(false);
	const [uiError, setUiError] = useState(null);
	const [refreshing, setRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// Memoized parties with sorting
	const parties = useMemo(() => {
		return Object.entries(currentPartyIds)
			.map(([restaurantId, partyId]) => ({
				partyId,
				restaurantId,
				...partyDetails[partyId],
			}))
			.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
	}, [currentPartyIds, partyDetails]);

	// Filtered parties based on search
	const filteredParties = useMemo(() => {
		return parties.filter((party) =>
			party.restaurantName.toLowerCase().includes(searchQuery.toLowerCase())
		);
	}, [parties, searchQuery]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	// Handle joining a party
	const handleJoinPartyAttempt = async () => {
		if (!inviteCode.trim()) {
			Alert.alert("Invalid Code", "Please enter an invite code.");
			return;
		}
		setUiJoinLoading(true);
		setUiError(null);
		try {
			const result = await joinParty({ inviteCode: inviteCode.trim() });
			if (result?.success) {
				navigation.navigate("PartyTab", {
					screen: "PartyLobby", // Fixed screen name
					params: {
						partyId: result.partyId,
						restaurantId: result.restaurantId,
					},
				});
			}
		} catch (error) {
			setUiError(error.message || "Could not join party.");
			Alert.alert("Error", error.message || "Could not join party.");
		} finally {
			setUiJoinLoading(false);
			setInviteCode("");
		}
	};
	// Handle starting a new party guidance
	const handleStartNewPartyGuidance = () => {
		Alert.alert(
			"Start a New Party",
			"To begin a new party, please find a restaurant from the Home screen. You can then start a party directly from the restaurant's detail page.",
			[
				{
					text: "Go to Home",
					onPress: () => navigation.navigate("CustomerHome"),
				},
				{ text: "OK", style: "cancel" },
			]
		);
	};

	// Handle party deletion
	const handleDeleteParty = async (partyId) => {
		Alert.alert("Delete Party", "Are you sure?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: async () => {
					try {
						await cancelParty(partyId);
					} catch (error) {
						Alert.alert("Error", "Failed to delete party.");
					}
				},
			},
		]);
	};

	// Render party item
	const renderParty = ({ item }) => {
		const basketItems = sharedBaskets[item.partyId] || [];
		return (
			<Animated.View entering={FadeInDown.duration(300).delay(100)}>
				<TouchableOpacity
					style={[styles.partyItem, { backgroundColor: colors.white }]}
					onPress={() => {
						console.log("Navigating to party:", {
							partyId: item.partyId,
							status: item.status,
						}); // Debug
						if (!item.partyId || !item.restaurantId) {
							Alert.alert("Error", "Invalid party data. Please try again.");
							return;
						}
						navigation.navigate("PartyTab", {
							// Note: Assuming PartyTab is the stack navigator name
							screen: item.status === "active" ? "PartySession" : "PartyLobby", // Fixed screen names
							params: {
								partyId: item.partyId,
								restaurantId: item.restaurantId,
							},
						});
					}}
					accessibilityRole="button"
					accessibilityLabel={`View party at ${item.restaurantName}`}
				>
					<View style={styles.partyHeader}>
						<Text style={[styles.partyTitle, { color: colors.textDark }]}>
							{item.restaurantName}
						</Text>
						<View
							style={[
								styles.statusBadge,
								{ backgroundColor: getStatusColor(item.status, scheme) },
							]}
						>
							<Text style={[styles.badgeText, { color: colors.white }]}>
								{getStatusLabel(item.status)}
							</Text>
						</View>
					</View>
					<View style={styles.partyStats}>
						<Stat
							icon="people"
							label="Guests"
							value={(item.guestPips || []).length}
						/>
						<Stat icon="cart" label="Items" value={basketItems.length} />
					</View>
				</TouchableOpacity>
			</Animated.View>
		);
	};

	// Main Render Logic
	if (isLoadingParty) {
		return (
			<SafeAreaView
				style={[
					styles.centeredScreen,
					{ backgroundColor: colors.backgroundLight },
				]}
			>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={[styles.statusText, { color: colors.textDark }]}>
					Loading your parties...
				</Text>
			</SafeAreaView>
		);
	}
	if (partyError) {
		return (
			<SafeAreaView
				style={[
					styles.centeredScreen,
					{ backgroundColor: colors.backgroundLight },
				]}
			>
				<FontAwesome5
					name="exclamation-circle"
					size={scale(40)}
					color={colors.danger}
				/>
				<Text style={[styles.errorText, { color: colors.danger }]}>
					{partyError}
				</Text>
				<IconTextButton
					iconName="arrow-back"
					text="Go Back"
					onPress={() =>
						navigation.canGoBack()
							? navigation.goBack()
							: navigation.navigate("CustomerHome")
					}
					color={colors.primary}
				/>
			</SafeAreaView>
		);
	}
	return (
		<SafeAreaView
			style={[styles.screen, { backgroundColor: colors.backgroundLight }]}
		>
			<View
				style={[
					styles.header,
					{
						backgroundColor: colors.white,
						borderBottomColor: colors.borderLight,
					},
				]}
			>
				<Text style={[styles.hubTitle, { color: colors.primary }]}>
					Party Hub
				</Text>
				<Text style={[styles.hubSubtitle, { color: colors.textMedium }]}>
					Join an existing party or start a new one from a restaurant's page.
				</Text>
				<TouchableOpacity
					style={[styles.startPartyButton, { backgroundColor: colors.primary }]}
					onPress={handleStartNewPartyGuidance}
					accessibilityRole="button"
					accessibilityLabel="Start new party guidance"
				>
					<Ionicons name="add-circle" size={scale(24)} color={colors.white} />
					<Text style={[styles.startPartyButtonText, { color: colors.white }]}>
						Start a New Party
					</Text>
				</TouchableOpacity>
			</View>
			<SwipeListView
				style={styles.container}
				data={filteredParties}
				renderItem={renderParty}
				renderHiddenItem={renderHiddenItem}
				rightOpenValue={-moderateScale(75)}
				keyExtractor={(item) => item.partyId}
				ListHeaderComponent={
					<TextInput
						placeholder="Search by restaurant..."
						value={searchQuery}
						onChangeText={setSearchQuery}
						style={[
							styles.searchInput,
							{
								backgroundColor: colors.white,
								borderColor: colors.borderLight,
								color: colors.textDark,
							},
						]}
						placeholderTextColor={colors.textLight}
						accessibilityRole="search"
						accessibilityLabel="Search parties"
					/>
				}
				ListEmptyComponent={
					<Text style={[styles.emptyText, { color: colors.textLight }]}>
						No active parties. Start one from a restaurant page or join with a
						code!
					</Text>
				}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
			/>
			<View
				style={[
					styles.joinPartyContainer,
					{
						backgroundColor: colors.white,
						borderTopColor: colors.borderLight,
					},
				]}
			>
				<Text style={[styles.joinPartyTitle, { color: colors.textDark }]}>
					Join a Party
				</Text>
				<TextInput
					placeholder="Enter Party Code"
					value={inviteCode}
					onChangeText={setInviteCode}
					style={[
						styles.joinInput,
						{
							backgroundColor: colors.white,
							borderColor: colors.mediumGray,
							color: colors.textDark,
						},
					]}
					autoCapitalize="characters"
					placeholderTextColor={colors.textLight}
					maxLength={6}
					accessibilityRole="text"
					accessibilityLabel="Enter party code"
				/>
				<IconTextButton
					iconName="log-in-outline"
					text="Join Party"
					onPress={handleJoinPartyAttempt}
					disabled={uiJoinLoading || !inviteCode}
					color={
						uiJoinLoading || !inviteCode
							? colors.textLight
							: colors.statusSuccess
					}
				/>
				{uiJoinLoading && (
					<ActivityIndicator
						style={{ marginTop: moderateScale(15) }}
						color={colors.primary}
					/>
				)}
				{uiError && (
					<Text style={[styles.errorText, { color: colors.danger }]}>
						{uiError}
					</Text>
				)}
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.backgroundLight || "#f8f9fa", // Explicit
	},
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: moderateScale(20),
		backgroundColor: colors.backgroundLight || "#f8f9fa", // Explicit
	},
	header: {
		padding: moderateScale(20),
		backgroundColor: colors.white, // Explicit
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight || "#e0e0e0", // Explicit
		alignItems: "center",
	},
	hubTitle: {
		fontSize: moderateScale(28),
		fontWeight: "700",
		color: colors.primary, // Explicit
		marginBottom: moderateScale(8),
		textAlign: "center",
	},
	hubSubtitle: {
		fontSize: moderateScale(16),
		color: colors.textMedium, // Explicit
		textAlign: "center",
		marginBottom: moderateScale(12),
		paddingHorizontal: moderateScale(10),
	},
	startPartyButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary, // Explicit
		paddingVertical: moderateScale(12),
		paddingHorizontal: moderateScale(20),
		borderRadius: moderateScale(10),
		marginTop: moderateScale(10),
	},
	startPartyButtonText: {
		color: colors.white, // Explicit
		fontSize: moderateScale(16),
		fontWeight: "600",
		marginLeft: moderateScale(8),
	},
	container: {
		flex: 1,
		paddingHorizontal: moderateScale(10),
	},

	partyItem: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 15,
		marginVertical: 8,
		marginHorizontal: 10,

		// Replaced shadow with a clean border
		borderWidth: 1,
		borderColor: colors.borderLight || "#e0e0e0",
	},
	partyHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: moderateScale(8),
	},
	partyTitle: {
		fontSize: moderateScale(18),
		fontWeight: "600",
		color: colors.textDark, // Explicit
		marginBottom: moderateScale(6),
	},
	statusBadge: {
		paddingHorizontal: moderateScale(8),
		paddingVertical: moderateScale(4),
		borderRadius: moderateScale(12),
	},
	badgeText: {
		color: colors.white, // Explicit
		fontSize: moderateScale(12),
		fontWeight: "bold",
	},
	partyStats: {
		flexDirection: "row",
		justifyContent: "space-around",
	},
	stat: {
		flexDirection: "row",
		alignItems: "center",
		marginRight: moderateScale(16),
	},
	statLabel: {
		marginLeft: moderateScale(4),
		fontSize: moderateScale(14),
		color: colors.textMedium, // Explicit
	},
	searchInput: {
		backgroundColor: colors.white, // Explicit
		padding: moderateScale(10),
		borderRadius: moderateScale(8),
		margin: moderateScale(10),
		borderWidth: 1,
		borderColor: colors.borderLight, // Explicit
		color: colors.textDark, // Explicit
	},
	hiddenItem: {
		alignItems: "flex-end",
		justifyContent: "center",
		height: "100%",
		paddingRight: moderateScale(20),
		backgroundColor: colors.danger, // Explicit
	},
	deleteButton: {
		backgroundColor: colors.danger, // Explicit
		justifyContent: "center",
		alignItems: "center",
		width: moderateScale(75),
		height: "100%",
	},
	statusText: {
		marginTop: moderateScale(15),
		fontSize: moderateScale(16),
		color: colors.textDark, // Explicit
	},
	emptyText: {
		textAlign: "center",
		color: colors.textLight, // Explicit
		marginTop: moderateScale(20),
		fontStyle: "italic",
		fontSize: moderateScale(16),
	},
	errorText: {
		color: colors.danger, // Explicit
		fontSize: moderateScale(14),
		textAlign: "center",
		marginBottom: moderateScale(15),
		paddingHorizontal: moderateScale(10),
	},
	joinPartyContainer: {
		width: "100%",
		alignItems: "center",
		padding: moderateScale(20),
		backgroundColor: colors.white, // Explicit
		borderTopWidth: 1,
		borderTopColor: colors.borderLight || "#e0e0e0", // Explicit
	},
	joinPartyTitle: {
		fontSize: moderateScale(18),
		fontWeight: "600",
		color: colors.textDark, // Explicit
		marginBottom: moderateScale(10),
	},
	joinInput: {
		width: "90%",
		borderWidth: 1,
		borderColor: colors.mediumGray || "#ccc", // Explicit
		backgroundColor: colors.white, // Explicit
		paddingHorizontal: moderateScale(15),
		paddingVertical: moderateScale(12),
		borderRadius: moderateScale(8),
		fontSize: moderateScale(16),
		color: colors.textDark, // Explicit
		marginBottom: moderateScale(15),
		textAlign: "center",
	},
	iconTextButtonContainer: {
		alignItems: "center",
		paddingVertical: moderateScale(12),
		paddingHorizontal: moderateScale(20),
		backgroundColor: colors.accent, // Explicit
		borderRadius: moderateScale(10),
		width: "90%",
	},
	iconTextButtonText: {
		marginTop: moderateScale(8),
		textAlign: "center",
		fontWeight: "600",
		fontSize: moderateScale(16),
		color: colors.textDark, // Explicit
	},
	disabledButtonVisual: {
		opacity: 0.7,
		backgroundColor: colors.mediumGray || "#ccc", // Explicit
	},
});

export default PartyHubScreen;
