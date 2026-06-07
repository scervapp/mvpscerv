import React from "react";
import {
	View,
	Text,
	Modal,
	FlatList,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
} from "react-native";
import { useTranslation } from 'react-i18next';
import { Ionicons } from "@expo/vector-icons";
import colors from "../../../utils/styles/appStyles";

const PipInvitationModal = ({
	isVisible,
	onClose,
	pips,
	isLoadingPips,
	partyDetails,
	isActionLoading,
	onSelectUserPip,
	onSelectLocalPip,
	onAddLocalMembers = () => {},
	onManagePips = () => {},
}) => {
	const { t } = useTranslation();
	const renderPipSelectionItem = ({ item: pip }) => {
		const isAlreadyGuest = partyDetails?.guestPips?.some(
			(guestPip) =>
				(pip.isUser && guestPip.userId === pip.userId) || // Check by userId if it's a user PIP
				(!pip.isUser && guestPip.localPipId === pip.id) // Check by localPipId if it's a local/placeholder PIP
		);

		const isDisabled =
			isAlreadyGuest ||
			(pip.isUser && !pip.userId) || // Cannot invite a 'user' PIP without a userId
			isActionLoading;

		return (
			<TouchableOpacity
				style={[styles.pipSelectionItem, isDisabled && styles.disabledPipItem]}
				onPress={() => {
					if (!isDisabled) {
						if (pip.isUser && pip.userId) {
							onSelectUserPip(pip.userId, pip.name);
						} else if (!pip.isUser) {
							onSelectLocalPip(pip.id, pip.name);
						}
					}
				}}
				disabled={isDisabled}
			>
				<Ionicons
					name={pip.isUser ? "person-circle" : "person-outline"}
					size={24}
					color={isDisabled ? colors.textLight : colors.textDark}
					style={styles.pipIcon}
				/>
				<Text
					style={[
						styles.pipSelectionName,
						isDisabled && styles.disabledPipText,
					]}
				>
					{pip.name}
				</Text>
				{isAlreadyGuest && (
					<Text style={styles.alreadyInvitedText}>{t('already_in_party_status')}</Text>
				)}
				{!pip.isUser && !isAlreadyGuest && (
					<Text style={styles.alreadyInvitedText}>
						{t("local_on_host_bill_status", "Local - host pays")}
					</Text>
				)}
				{pip.isUser && !pip.userId && !isAlreadyGuest && (
					<Text style={styles.alreadyInvitedText}>{t('invalid_user_data_status')}</Text>
				)}
			</TouchableOpacity>
		);
	};

	return (
		<Modal
			visible={isVisible}
			animationType="slide"
			transparent={true}
			onRequestClose={onClose}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>{t('select_pip_to_invite_add_title')}</Text>
					<Text style={styles.modalHelpText}>
						{t(
							"party_pip_invite_help",
							"Invite platform PIPs so they can join and pay separately. Add local guests only when they are ordering on your bill.",
						)}
					</Text>
					{isLoadingPips ? (
						<ActivityIndicator size="small" color={colors.primary} />
					) : pips.length === 0 ? (
						<Text style={styles.noPipsText}>
							{t('no_pips_added_instructions')}
						</Text>
					) : (
						<FlatList
							data={pips}
							renderItem={renderPipSelectionItem}
							keyExtractor={(item) => item.id}
							style={styles.pipModalList}
						/>
					)}
					<View style={styles.secondaryActions}>
						<TouchableOpacity
							style={styles.secondaryActionButton}
							onPress={onManagePips}
							disabled={isActionLoading}
						>
							<Ionicons name="search-outline" size={20} color={colors.primary} />
							<Text style={styles.secondaryActionText}>
								{t("find_platform_pips", "Find platform PIPs")}
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.secondaryActionButton}
							onPress={onAddLocalMembers}
							disabled={isActionLoading}
						>
							<Ionicons
								name="person-add-outline"
								size={20}
								color={colors.primary}
							/>
							<Text style={styles.secondaryActionText}>
								{t("add_local_guest", "Add local guest")}
							</Text>
						</TouchableOpacity>
					</View>
					<TouchableOpacity style={styles.closeButton} onPress={onClose}>
						<Text style={styles.closeButtonText}>{t('close_button')}</Text>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.6)",
	},
	modalContent: {
		backgroundColor: "white",
		borderRadius: 10,
		padding: 20,
		width: "85%",
		maxHeight: "70%",
		alignItems: "center",
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 15,
		textAlign: "center",
		color: colors.textDark,
	},
	modalHelpText: {
		fontSize: 13,
		color: colors.textMedium,
		textAlign: "center",
		lineHeight: 18,
		marginTop: -6,
		marginBottom: 14,
	},
	pipModalList: { marginBottom: 15, width: "100%" },
	pipSelectionItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.lightGray || "#eee",
		width: "100%",
	},
	pipIcon: { marginRight: 10 },
	pipSelectionName: {
		marginLeft: 10,
		fontSize: 16,
		flex: 1,
		color: colors.textDark,
	},
	disabledPipItem: { opacity: 0.5 },
	disabledPipText: { color: colors.textLight },
	alreadyInvitedText: {
		fontSize: 12,
		fontStyle: "italic",
		color: colors.textLight,
	},
	noPipsText: {
		textAlign: "center",
		color: colors.textLight,
		marginVertical: 20,
		fontStyle: "italic",
	},
	secondaryActions: {
		width: "100%",
		gap: 10,
		marginTop: 4,
		marginBottom: 8,
	},
	secondaryActionButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: colors.primary,
		borderRadius: 10,
		paddingVertical: 11,
		paddingHorizontal: 12,
		backgroundColor: colors.primary + "10",
	},
	secondaryActionText: {
		marginLeft: 8,
		fontSize: 14,
		fontWeight: "700",
		color: colors.primary,
	},
	closeButton: {
		backgroundColor: colors.mediumGray || "#ccc",
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 10,
	},
	closeButtonText: { color: colors.textDark, fontSize: 16, fontWeight: "bold" },
});

export default PipInvitationModal;
