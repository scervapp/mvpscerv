import React, { useState, useMemo, useEffect } from "react";
import {
	View,
	Text,
	Modal,
	StyleSheet,
	TouchableOpacity,
	FlatList,
	Alert,
} from "react-native";
import { useTranslation } from 'react-i18next';
import { Button } from "react-native-paper";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../../utils/styles/appStyles";

const AddMembersModal = ({
	isVisible,
	onClose,
	onConfirmAdd,
	hostPips = [],
	partyMembers = [],
	isLoading = false,
	navigation,
}) => {
	const { t } = useTranslation();
	const [selectedPipsToAdd, setSelectedPipsToAdd] = useState([]);

	// Reset selection when modal opens
	useEffect(() => {
		if (isVisible) setSelectedPipsToAdd([]);
	}, [isVisible]);

	// Prevent selecting people already in party
	const partyMemberIds = useMemo(() => {
		return new Set(
			(partyMembers || []).map((p) => p.userId || p.localPipId || p.id)
		);
	}, [partyMembers]);

	const togglePipSelection = (pip) => {
		if (partyMemberIds.has(pip.id)) return;

		setSelectedPipsToAdd((prev) =>
			prev.some((p) => p.id === pip.id)
				? prev.filter((p) => p.id !== pip.id)
				: [...prev, pip]
		);
	};

	const handleConfirm = () => {
		if (selectedPipsToAdd.length === 0) return;
		onConfirmAdd(selectedPipsToAdd);
		onClose();
	};

	const renderPipItem = ({ item: pip }) => {
		const isInParty = partyMemberIds.has(pip.id);
		const isSelected = selectedPipsToAdd.some((p) => p.id === pip.id);

		return (
			<TouchableOpacity
				style={[
					styles.pipItem,
					isSelected && styles.pipItemSelected,
					isInParty && styles.pipItemDisabled,
				]}
				onPress={() => !isInParty && togglePipSelection(pip)}
				disabled={isInParty}
			>
				<View style={styles.pipInfo}>
					<Text style={[styles.pipName, isInParty && styles.disabledText]}>
						{pip.name}
					</Text>
					<Text style={[styles.pipPhone, isInParty && styles.disabledText]}>
						{pip.phone}
					</Text>
				</View>

				{isInParty ? (
					<Text style={styles.inPartyText}>{t('in_party_status')}</Text>
				) : isSelected ? (
					<Ionicons name="checkmark-circle" size={28} color={colors.primary} />
				) : (
					<Ionicons
						name="radio-button-off"
						size={28}
						color={colors.textLight}
					/>
				)}
			</TouchableOpacity>
		);
	};

	return (
		<Modal
			visible={isVisible}
			transparent
			animationType="slide"
			onRequestClose={onClose}
		>
			<TouchableOpacity
				style={styles.modalOverlay}
				activeOpacity={1}
				onPressOut={onClose}
			>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>{t('add_members_to_party_title')}</Text>

					{/* PIPS List */}
					{hostPips.length > 0 ? (
						<FlatList
							data={hostPips}
							keyExtractor={(p) => p.id}
							renderItem={renderPipItem}
							showsVerticalScrollIndicator={false}
						/>
					) : (
						<Text style={styles.noPipsText}>
							{t('no_pips_added_yet_message')}
						</Text>
					)}

					{/* Add New PIP Button */}
					<TouchableOpacity
						style={styles.addNewPipButton}
						onPress={() => {
							onClose();
							navigation.navigate("AccountScreen", {
								screen: "PipScreenInner",
							});
						}}
					>
						<Ionicons
							name="add-circle-outline"
							size={26}
							color={colors.primary}
						/>
						<Text style={styles.addNewPipText}>{t('add_new_pip_button')}</Text>
					</TouchableOpacity>

					{/* Bottom Buttons */}
					<View style={styles.modalButtonRow}>
						<Button
							mode="outlined"
							onPress={onClose}
							style={styles.modalButton}
						>
							{t('cancel_button')}
						</Button>

						<Button
							mode="contained"
							onPress={handleConfirm}
							disabled={selectedPipsToAdd.length === 0 || isLoading}
							loading={isLoading}
							style={[
								styles.modalButton,
								selectedPipsToAdd.length === 0 && styles.disabledAddButton,
							]}
						>
							{t('add_member_button', { count: selectedPipsToAdd.length })}
						</Button>
					</View>
				</View>
			</TouchableOpacity>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		width: "92%",
		maxHeight: "85%",
		borderRadius: 16,
		padding: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.25,
		shadowRadius: 20,
		elevation: 10,
	},
	modalTitle: {
		fontSize: 22,
		fontWeight: "bold",
		textAlign: "center",
		marginBottom: 16,
		color: colors.textDark,
	},
	pipItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 16,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		marginBottom: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	pipItemSelected: {
		borderColor: colors.primary,
		borderWidth: 2,
		backgroundColor: colors.primary + "10",
	},
	pipItemDisabled: {
		opacity: 0.5,
		backgroundColor: colors.backgroundLight,
	},
	pipInfo: { flex: 1 },
	pipName: { fontSize: 17, fontWeight: "600", color: colors.textDark },
	pipPhone: { fontSize: 14, color: colors.textMedium, marginTop: 2 },
	disabledText: { color: colors.textLight },
	inPartyText: {
		fontSize: 13,
		color: colors.statusSuccess,
		fontWeight: "600",
	},
	noPipsText: {
		textAlign: "center",
		color: colors.textMedium,
		fontStyle: "italic",
		paddingVertical: 30,
	},
	addNewPipButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		padding: 18,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 14,
		borderWidth: 2,
		borderColor: colors.primary,
		borderStyle: "dashed",
		marginVertical: 20,
	},
	addNewPipText: {
		marginLeft: 10,
		fontSize: 17,
		fontWeight: "600",
		color: colors.primary,
	},
	modalButtonRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 10,
	},
	modalButton: {
		flex: 1,
		marginHorizontal: 6,
	},
	disabledAddButton: {
		backgroundColor: colors.textLight,
	},
});

export default AddMembersModal;
