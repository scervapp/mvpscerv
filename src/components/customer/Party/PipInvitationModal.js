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
}) => {
	const renderPipSelectionItem = ({ item: pip }) => {
		const isAlreadyGuest = partyDetails?.guestPips?.some(
			(guestPip) =>
				(pip.isUser && guestPip.userId === pip.userId) || // Check by userId if it's a user PIP
				(!pip.isUser && guestPip.pipId === pip.id) // Check by pipId if it's a local/placeholder PIP
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
					<Text style={styles.alreadyInvitedText}>(Already in party)</Text>
				)}
				{!pip.isUser && !isAlreadyGuest && (
					<Text style={styles.alreadyInvitedText}>(Local)</Text>
				)}
				{pip.isUser && !pip.userId && !isAlreadyGuest && (
					<Text style={styles.alreadyInvitedText}>(Invalid User Data)</Text>
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
					<Text style={styles.modalTitle}>Select PIP to Invite/Add</Text>
					{isLoadingPips ? (
						<ActivityIndicator size="small" color={colors.primary} />
					) : pips.length === 0 ? (
						<Text style={styles.noPipsText}>
							You haven't added any PIPs yet. Go to Account PIPs to add some.
						</Text>
					) : (
						<FlatList
							data={pips}
							renderItem={renderPipSelectionItem}
							keyExtractor={(item) => item.id}
							style={styles.pipModalList}
						/>
					)}
					<TouchableOpacity style={styles.closeButton} onPress={onClose}>
						<Text style={styles.closeButtonText}>Close</Text>
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
