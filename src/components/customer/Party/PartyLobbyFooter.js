// components/customer/PartyLobbyFooter.js
import React from "react";
import {
	View,
	Text,
	TouchableOpacity,
	ActivityIndicator,
	StyleSheet,
} from "react-native";
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import colors from "../../../utils/styles/appStyles";
import { IconButton } from "react-native-paper";
import formatCurrency from "../../../utils/currencyFormatter";

// This component receives all necessary data and handlers as props
const PartyLobbyFooter = ({
	isHost,
	partyStatus,
	partyDetails,
	currentUserData, // Needed to check item ownership for editing
	isLoadingPartyAction,
	isLoadingPips,
	isLoadingHostCheckIn,
	hostCheckInStatus,
	sharedBasketItems,
	isLoadingBasket,
	groupedBasketItems, // Pass the memoized grouped items

	updatePartyBasketItemQuantity,
	handleNavigateToAddItems,
	handleInvitePip,
	handleGenerateCode,
	setIsCheckInModalVisible, // To open the check-in modal
	handleSendPartyOrderToChefsQ, // Or your specific function for sending items
	handleSendAllNewPartyItemsToChefsQ, // If you have this separate action
	handleLeaveParty,
	handleCancelParty,
	navigation, // For the "Pay Bill" navigation
}) => {
	const { t } = useTranslation();
	const renderSharedBasketItem = ({ item: basketItem, isCurrentUserGroup }) => {
		const itemTotal =
			(basketItem.priceAtOrder || (basketItem.dish?.price || 0) * 100) *
			basketItem.quantity;
		const canEdit =
			isCurrentUserGroup &&
			!basketItem.sentToChefQ &&
			(partyStatus === "pending" || partyStatus === "active");

		return (
			<View
				style={[
					styles.basketItemRow,
					basketItem.sentToChefQ && styles.sentItemVisual,
				]}
			>
				<View style={styles.itemIconContainer}>
					{basketItem.sentToChefQ ? (
						<Ionicons
							name="checkmark-circle"
							size={22}
							color={colors.success}
						/>
					) : (
						<Ionicons name="time-outline" size={22} color={colors.warning} />
					)}
				</View>
				<View style={styles.itemDetails}>
					<Text
						style={[
							styles.dishName,
							basketItem.sentToChefQ && styles.sentItemText,
						]}
					>
						{basketItem.dish?.name || "Item"}
					</Text>
					{basketItem.specialInstructions && (
						<Text style={styles.specialInstructions}>
							{basketItem.specialInstructions}
						</Text>
					)}
				</View>
				<View style={styles.itemControlsAndPrice}>
					{canEdit ? (
						<View style={styles.quantityControls}>
							<IconButton
								icon="minus-circle-outline"
								size={24}
								onPress={() =>
									updatePartyBasketItemQuantity(
										basketItem.itemId,
										basketItem.quantity - 1
									)
								}
								style={styles.quantityButton}
								iconColor={colors.textDark}
							/>
							<Text style={styles.quantity}>{basketItem.quantity}</Text>
							<IconButton
								icon="plus-circle-outline"
								size={24}
								onPress={() =>
									updatePartyBasketItemQuantity(
										basketItem.itemId,
										basketItem.quantity + 1
									)
								}
								style={styles.quantityButton}
								iconColor={colors.textDark}
							/>
						</View>
					) : (
						<Text style={styles.itemQuantitySent}>x {basketItem.quantity}</Text>
					)}
					<Text
						style={[
							styles.itemPrice,
							basketItem.sentToChefQ && styles.sentItemText,
						]}
					>
						{formatCurrency(itemTotal)}
					</Text>
				</View>
			</View>
		);
	};

	const renderSharedBasketItemGroup = ({ item: group }) => (
		<View style={styles.pipBasketSection}>
			<Text style={styles.pipBasketName}>{group.groupName}</Text>
			{group.items.map((basketItem) =>
				renderSharedBasketItem({
					item: basketItem,
					isCurrentUserGroup: group.isCurrentUserGroup,
				})
			)}
		</View>
	);
	if (!partyDetails) {
		// Should ideally not happen if ListFooter is only rendered when details exist
		return null;
	}

	return (
		<>
			{/* --- Shared Basket Section --- */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>{t('shared_table_order_title')}</Text>
				{isLoadingBasket &&
					(!sharedBasketItems || sharedBasketItems.length === 0) && (
						<ActivityIndicator
							style={{ marginTop: 10 }}
							color={colors.primary}
						/>
					)}
				{!isLoadingBasket &&
					(!sharedBasketItems || sharedBasketItems.length === 0) &&
					(partyStatus === "pending" || partyStatus === "active") && (
						<Text style={styles.emptyText}>
							{t('no_items_added_to_party_order_message')}
						</Text>
					)}
				{/* Render grouped items. If groupedBasketItems is large, consider a FlatList here too */}
				{groupedBasketItems.map((group) =>
					renderSharedBasketItemGroup({ item: group })
				)}
			</View>

			{/* --- Action Icons/Buttons Rows --- */}
			{/* Row 1: Add Items, Invite, Get Code */}
			<View style={styles.actionsRow}>
				{(partyStatus === "pending" || partyStatus === "active") && (
					<TouchableOpacity
						style={styles.actionIcon}
						onPress={handleNavigateToAddItems}
						disabled={isLoadingPartyAction}
					>
						<MaterialCommunityIcons
							name="silverware-fork-knife"
							size={28}
							color={colors.primary}
						/>
						<Text style={styles.actionIconText}>{t('my_items_button')}</Text>
					</TouchableOpacity>
				)}
				{isHost && (partyStatus === "pending" || partyStatus === "active") && (
					<TouchableOpacity
						style={styles.actionIcon}
						onPress={handleInvitePip}
						disabled={isLoadingPartyAction || isLoadingPips}
					>
						<MaterialCommunityIcons
							name="account-plus-outline"
							size={28}
							color={colors.primary}
						/>
						<Text style={styles.actionIconText}>{t('invite_pip_button')}</Text>
					</TouchableOpacity>
				)}
				{isHost && (partyStatus === "pending" || partyStatus === "active") && (
					<TouchableOpacity
						style={styles.actionIcon}
						onPress={handleGenerateCode}
						disabled={isLoadingPartyAction}
					>
						<MaterialCommunityIcons
							name="qrcode-scan"
							size={28}
							color={colors.primary}
						/>
						<Text style={styles.actionIconText}>{t('get_code_button')}</Text>
					</TouchableOpacity>
				)}
			</View>

			{/* Row 2: Check-In, Send Order */}
			<View style={styles.actionsRow}>
				{isHost &&
					partyStatus === "pending" &&
					(hostCheckInStatus === "REQUESTED" ? (
						<View style={styles.actionIconDisabled}>
							<ActivityIndicator color={colors.primary} size="small" />
							<Text style={styles.actionIconTextDisabled}>{t('waiting_status')}</Text>
						</View>
					) : hostCheckInStatus === "ACCEPTED" ? (
						<View style={styles.actionIconDisabled}>
							<Ionicons
								name="checkmark-circle"
								size={28}
								color={colors.success}
							/>
							<Text style={[styles.actionIconText, { color: colors.success }]}>
								{t('checked_in_status')}
							</Text>
						</View>
					) : (
						<TouchableOpacity
							style={styles.actionIcon}
							onPress={() => setIsCheckInModalVisible(true)}
							disabled={isLoadingPartyAction || isLoadingHostCheckIn}
						>
							<MaterialCommunityIcons
								name="map-marker-check-outline"
								size={36}
								color="#4CAF50"
							/>
							<Text style={[styles.actionIconText, { color: "#4CAF50" }]}>
								{t('check_in_party_button')}
							</Text>
						</TouchableOpacity>
					))}

				{/* Send Order to Kitchen - Option 1: Each user sends their own */}
				{partyStatus === "active" &&
					partyDetails?.checkInId &&
					sharedBasketItems.some(
						(item) =>
							!item.sentToChefQ && item.orderedByUserId === currentUserData?.uid
					) && (
						<TouchableOpacity
							style={styles.actionIcon}
							onPress={handleSendPartyOrderToChefsQ} // This should be specific to current user's items
							disabled={isLoadingPartyAction}
						>
							<MaterialCommunityIcons
								name="silverware-variant"
								size={28}
								color={colors.primary}
							/>
							<Text style={styles.actionIconText}>{t('send_my_items_button')}</Text>
						</TouchableOpacity>
					)}

				{/* Send Order to Kitchen - Option 2: Host sends ALL new items */}
				{isHost &&
					partyStatus === "active" &&
					partyDetails?.checkInId &&
					sharedBasketItems.some((item) => !item.sentToChefQ) && (
						<TouchableOpacity
							style={styles.actionIcon}
							onPress={handleSendAllNewPartyItemsToChefsQ} // New handler for host
							disabled={isLoadingPartyAction}
						>
							<MaterialCommunityIcons
								name="rocket-launch-outline"
								size={28}
								color={colors.accent || colors.primary}
							/>
							<Text
								style={[
									styles.actionIconText,
									{ color: colors.accent || colors.primary },
								]}
							>
								{t('send_all_to_kitchen_button')}
							</Text>
						</TouchableOpacity>
					)}
			</View>

			{/* Row 3: Leave, Cancel, Pay Bill */}
			<View style={styles.actionsRow}>
				{!isHost && (partyStatus === "pending" || partyStatus === "active") && (
					<TouchableOpacity
						style={styles.actionIcon}
						onPress={handleLeaveParty}
						disabled={isLoadingPartyAction}
					>
						<MaterialCommunityIcons
							name="logout"
							size={28}
							color={colors.danger}
						/>
						<Text style={[styles.actionIconText, { color: colors.danger }]}>
							{t('leave_party_button')}
						</Text>
					</TouchableOpacity>
				)}
				{isHost && partyStatus === "pending" && (
					<TouchableOpacity
						style={styles.actionIcon}
						onPress={handleCancelParty}
						disabled={isLoadingPartyAction}
					>
						<MaterialCommunityIcons
							name="cancel"
							size={36}
							color="#F44336"
						/>
						<Text style={[styles.actionIconText, { color: "#F44336" }]}>
							{t('cancel_party_button')}
						</Text>
					</TouchableOpacity>
				)}
				{partyStatus === "active" &&
					partyDetails?.checkInId &&
					!sharedBasketItems.some((item) => !item.sentToChefQ) &&
					sharedBasketItems.length > 0 && (
						<TouchableOpacity
							style={styles.actionIcon}
							onPress={() => {
								navigation.navigate("PartyPaymentScreen", {
									// Ensure this screen exists
									partyId: partyDetails.id,
									restaurantId: partyDetails.restaurantId,
								});
							}}
							disabled={isLoadingPartyAction}
						>
							<MaterialCommunityIcons
								name="credit-card-multiple-outline"
								size={28}
								color={colors.success}
							/>
							<Text style={[styles.actionIconText, { color: colors.success }]}>
								{t('pay_bill_button')}
							</Text>
						</TouchableOpacity>
					)}
			</View>

			{/* Status Messages */}
			{partyStatus === "active" &&
				!sharedBasketItems.some((item) => !item.sentToChefQ) &&
				sharedBasketItems.length > 0 && (
					<Text style={[styles.infoText, { color: colors.success }]}>
						{t('all_items_sent_ready_to_pay_message')}
					</Text>
				)}
			{partyStatus === "completed" && (
				<Text style={styles.infoText}>{t('party_session_ended_message')}</Text>
			)}
			{partyStatus === "cancelled" && (
				<Text style={styles.infoText}>{t('party_session_cancelled_message')}</Text>
			)}
		</>
	);
};

// Styles for PartyLobbyFooter (can be the same as PartyLobbyScreen's relevant styles)
const styles = StyleSheet.create({
	section: {
		marginBottom: 20,
		padding: 15,
		backgroundColor: colors.white || "#ffffff",
		borderRadius: 8,
		marginHorizontal: 5,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 12,
		color: colors.primary,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
		paddingBottom: 6,
	},
	emptyText: {
		textAlign: "center",
		color: colors.textLight,
		marginTop: 15,
		fontStyle: "italic",
		paddingBottom: 10,
	},
	actionsRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "flex-start",
		paddingVertical: 10,
		marginTop: 10,
		marginBottom: 10,
	},
	actionIcon: {
		alignItems: "center",
		padding: 8,
		minWidth: 80,
		flex: 1,
	},
	actionIconText: {
		fontSize: 11,
		color: colors.primary,
		marginTop: 4,
		textAlign: "center",
		fontWeight: "500",
	},
	actionIconDisabled: {
		alignItems: "center",
		padding: 8,
		minWidth: 80,
		// opacity: 0.5, // Removed for better visibility
		flex: 1,
	},
	actionIconTextDisabled: {
		fontSize: 11,
		color: colors.primary || "#2196F3", // Changed to primary color for better visibility
		marginTop: 4,
		textAlign: "center",
	},
	infoText: {
		textAlign: "center",
		marginTop: 20,
		fontSize: 15,
		color: colors.text,
		fontStyle: "italic",
		paddingBottom: 20,
	},
	// Styles for the shared basket items (copied/adapted from previous PartyLobbyScreen)
	pipBasketSection: {
		marginBottom: 15,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray,
		paddingBottom: 10,
	},
	pipBasketName: {
		fontSize: 16,
		fontWeight: "bold",
		marginBottom: 8,
		color: colors.textDark,
	},
	basketItemRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.extraLightGray || "#f0f0f0",
	},
	itemIconContainer: { width: 30, alignItems: "center", marginRight: 8 },
	itemDetails: { flex: 1, marginRight: 5 },
	dishName: { fontSize: 15, fontWeight: "500", color: colors.textDark },
	specialInstructions: {
		fontSize: 12,
		color: colors.textLight,
		fontStyle: "italic",
		marginTop: 2,
	},
	itemControlsAndPrice: { flexDirection: "row", alignItems: "center" },
	quantityControls: {
		flexDirection: "row",
		alignItems: "center",
		marginRight: 10,
	},
	quantityButton: { margin: -8, padding: 0 },
	quantity: {
		minWidth: 20,
		textAlign: "center",
		fontSize: 16,
		fontWeight: "500",
		marginHorizontal: -2,
		paddingHorizontal: 3,
		color: colors.textDark,
	},
	itemQuantitySent: { fontSize: 15, color: colors.textLight, marginRight: 15 },
	itemPrice: {
		fontWeight: "bold",
		fontSize: 15,
		minWidth: 55,
		textAlign: "right",
		color: colors.textDark,
	},
	sentItemVisual: { opacity: 0.6 },
	sentItemText: { color: colors.textLight },
});

export default PartyLobbyFooter;
