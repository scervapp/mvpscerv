import React, { useContext, useMemo, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
} from "react-native";
import { MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "@react-native-firebase/functions";

import { functions } from "../../config/firebase.native";
import { AuthContext } from "../../context/authContext";
import { useParty } from "../../context/customer/PartyContext";
import colors from "../../utils/styles/appStyles";

const TableSetupPrompt = ({ route, navigation }) => {
	const { t } = useTranslation();
	const { restaurantId, tableId, tableName, restaurantName } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const { createParty, getRestaurantSessions, partyDetails } = useParty();

	const [isProcessing, setIsProcessing] = useState(false);

	const existingDineInPartyId = useMemo(
		() => getRestaurantSessions?.(restaurantId)?.dineInPartyId || null,
		[getRestaurantSessions, restaurantId],
	);

	const existingDineInParty = existingDineInPartyId
		? partyDetails?.[existingDineInPartyId]
		: null;

	const canBringExistingParty =
		existingDineInPartyId &&
		existingDineInParty?.hostUserId === currentUserData?.uid &&
		["pending", "AWAITING_TABLE", "active"].includes(
			existingDineInParty?.status,
		);

	const getCustomerName = () =>
		currentUserData?.displayName ||
		currentUserData?.fullName ||
		currentUserData?.firstName ||
		"Guest";

	const confirmUseExistingParty = () =>
		new Promise((resolve) => {
			if (!canBringExistingParty) {
				resolve(false);
				return;
			}

			Alert.alert(
				t("bring_party_title", "Bring your party?"),
				t(
					"bring_party_message",
					"Do you want to check in your entire current party at this table?",
				),
				[
					{
						text: t("start_new_party", "Start New Party"),
						onPress: () => resolve(false),
					},
					{
						text: t("bring_party_button", "Bring Party"),
						onPress: () => resolve(true),
					},
					{
						text: t("cancel_button", "Cancel"),
						style: "cancel",
						onPress: () => resolve(null),
					},
				],
			);
		});

	const handleSoloDining = async () => {
		setIsProcessing(true);
		try {
			const selfSeatingCheckIn = httpsCallable(functions, "selfSeatingCheckIn");
			const checkInResponse = await selfSeatingCheckIn({
				restaurantId,
				tableId,
				tableName,
				customerName: getCustomerName(),
				numberOfPeople: 1,
			});

			if (checkInResponse.data.success) {
				navigation.navigate("RestaurantDetail", {
					restaurant: {
						id: restaurantId,
						restaurantName: restaurantName || "Restaurant",
					},
				});
				return;
			}

			throw new Error("Check-in failed on the server.");
		} catch (error) {
			console.error("Solo check-in error:", error);
			Alert.alert(
				t("error", "Error"),
				t("could_not_start_tab", "Could not start your tab. Please try again."),
			);
			setIsProcessing(false);
		}
	};

	const handleGroupDining = async () => {
		setIsProcessing(true);
		try {
			const useExistingParty = await confirmUseExistingParty();

			if (useExistingParty === null) {
				setIsProcessing(false);
				return;
			}

			const partyIdToSeat =
				(useExistingParty && existingDineInPartyId) ||
				(await createParty(restaurantId, restaurantName || "Restaurant"));

			if (!partyIdToSeat) {
				throw new Error("Failed to generate Party ID.");
			}

			const partySize = useExistingParty
				? existingDineInParty?.guestPips?.length ||
					existingDineInParty?.guestUserIds?.length ||
					1
				: 1;

			const selfSeatingCheckIn = httpsCallable(functions, "selfSeatingCheckIn");
			const checkInResponse = await selfSeatingCheckIn({
				restaurantId,
				tableId,
				tableName,
				customerName: getCustomerName(),
				numberOfPeople: partySize,
				partyId: partyIdToSeat,
			});

			if (checkInResponse.data.success) {
				navigation.navigate("PartyTab", {
					screen: "PartySession",
					params: { partyId: partyIdToSeat },
				});
				return;
			}

			throw new Error("Could not claim table for party.");
		} catch (error) {
			console.error("Party check-in error:", error);
			Alert.alert(
				t("error", "Error"),
				t("could_not_create_group", "Could not create your group. Please try again."),
			);
			setIsProcessing(false);
		}
	};

	return (
		<View style={styles.overlay}>
			<TouchableOpacity
				style={styles.backdrop}
				activeOpacity={1}
				onPress={() => navigation.goBack()}
				disabled={isProcessing}
			/>

			<View style={styles.sheetContainer}>
				<View style={styles.dragHandle} />

				<Text style={styles.title}>
					{t("welcome_to", "Welcome to")} {tableName || `Table ${tableId}`}
				</Text>
				<Text style={styles.subtitle}>
					{t("how_are_we_dining_today", "How are we dining today?")}
				</Text>

				{isProcessing ? (
					<View style={styles.loadingState}>
						<ActivityIndicator size="large" color={colors.primary} />
						<Text style={styles.loadingText}>
							{t("setting_up_your_table", "Setting up your table...")}
						</Text>
					</View>
				) : (
					<View style={styles.optionsContainer}>
						<TouchableOpacity
							style={styles.optionCard}
							onPress={handleSoloDining}
							activeOpacity={0.8}
						>
							<View style={[styles.iconBox, { backgroundColor: "#E3F2FD" }]}>
								<MaterialCommunityIcons
									name="account"
									size={32}
									color="#1976D2"
								/>
							</View>
							<View style={styles.optionTextContainer}>
								<Text style={styles.optionTitle}>
									{t("just_me", "Just Me")}
								</Text>
								<Text style={styles.optionDescription}>
									{t("start_a_solo_tab", "Start a solo tab")}
								</Text>
							</View>
							<MaterialCommunityIcons
								name="chevron-right"
								size={24}
								color={colors.mediumGray}
							/>
						</TouchableOpacity>

						<TouchableOpacity
							style={styles.optionCard}
							onPress={handleGroupDining}
							activeOpacity={0.8}
						>
							<View style={[styles.iconBox, { backgroundColor: "#F3E5F5" }]}>
								<FontAwesome5 name="users" size={24} color="#7B1FA2" />
							</View>
							<View style={styles.optionTextContainer}>
								<Text style={styles.optionTitle}>
									{canBringExistingParty
										? t("group_or_current_party", "Group / Current Party")
										: t("group_split_bill", "Group / Split Bill")}
								</Text>
								<Text style={styles.optionDescription}>
									{canBringExistingParty
										? t(
												"bring_existing_party_description",
												"Seat your current party or start a new group",
											)
										: t(
												"order_together_pay_separately",
												"Order together, pay separately",
											)}
								</Text>
							</View>
							<MaterialCommunityIcons
								name="chevron-right"
								size={24}
								color={colors.mediumGray}
							/>
						</TouchableOpacity>
					</View>
				)}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		justifyContent: "flex-end",
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0,0,0,0.5)",
	},
	sheetContainer: {
		backgroundColor: "#ffffff",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		paddingHorizontal: 20,
		paddingBottom: 40,
		paddingTop: 12,
		minHeight: 320,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.15,
		shadowRadius: 10,
		elevation: 10,
	},
	dragHandle: {
		width: 40,
		height: 5,
		backgroundColor: "#E0E0E0",
		borderRadius: 3,
		alignSelf: "center",
		marginBottom: 20,
	},
	title: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginBottom: 6,
	},
	subtitle: {
		fontSize: 15,
		color: colors.textLight,
		textAlign: "center",
		marginBottom: 24,
	},
	optionsContainer: {
		gap: 12,
	},
	optionCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#F8F9FA",
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#EEEEEE",
	},
	iconBox: {
		width: 56,
		height: 56,
		borderRadius: 14,
		justifyContent: "center",
		alignItems: "center",
		marginRight: 16,
	},
	optionTextContainer: {
		flex: 1,
	},
	optionTitle: {
		fontSize: 17,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 4,
	},
	optionDescription: {
		fontSize: 13,
		color: colors.textLight,
	},
	loadingState: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 40,
	},
	loadingText: {
		marginTop: 12,
		fontSize: 15,
		color: colors.textLight,
		fontWeight: "500",
	},
});

export default TableSetupPrompt;
