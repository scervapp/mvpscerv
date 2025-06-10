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
import { Button } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../../../utils/styles/appStyles";

const AddMembersModal = ({
	isVisible, // Boolean to control visibility
	onClose, // Function to close the modal
	onConfirmAdd, // Function to call with selected PIPs: (pipsToAdd: Array<{id, name}>) => void
	hostPips, // The host's full list of local PIPs to choose from
	partyMembers, // The list of members currently in the party (to disable them)
	isLoading = false, // To show a loading state on the confirm button
}) => {
	const [selectedPipsToAdd, setSelectedPipsToAdd] = useState([]);

	// Reset selection when modal becomes visible
	useEffect(() => {
		if (isVisible) {
			setSelectedPipsToAdd([]);
		}
	}, [isVisible]);

	// Create a Set of existing member IDs for efficient lookup
	const partyMemberIds = useMemo(() => {
		return new Set((partyMembers || []).map((p) => p.userId || p.localPipId));
	}, [partyMembers]);

	const togglePipSelection = (pip) => {
		setSelectedPipsToAdd(
			(prev) =>
				prev.find((p) => p.id === pip.id)
					? prev.filter((p) => p.id !== pip.id)
					: [...prev, { id: pip.id, name: pip.name }] // Select id and name
		);
	};

	const handleConfirm = () => {
		if (selectedPipsToAdd.length === 0) {
			Alert.alert("No Selection", "Please select at least one member to add.");
			return;
		}
		onConfirmAdd(selectedPipsToAdd);
	};

	if (!isVisible) return null;

	const renderPipItem = ({ item: pip }) => {
		const isAlreadyInParty = partyMemberIds.has(pip.id);
		const isSelectedInThisModal = !!selectedPipsToAdd.find(
			(p) => p.id === pip.id
		);

		return (
			<TouchableOpacity
				style={styles.pipCheckboxItem}
				onPress={() => !isAlreadyInParty && togglePipSelection(pip)}
				disabled={isAlreadyInParty}
			>
				<MaterialCommunityIcons
					name={
						isAlreadyInParty || isSelectedInThisModal
							? "checkbox-marked"
							: "checkbox-blank-outline"
					}
					size={24}
					color={isAlreadyInParty ? colors.textLight : colors.primary}
				/>
				<Text
					style={[styles.pipNameText, isAlreadyInParty && styles.disabledText]}
				>
					{pip.name}
				</Text>
				{isAlreadyInParty && <Text style={styles.inPartyText}>(In Party)</Text>}
			</TouchableOpacity>
		);
	};

	return (
		<Modal
			visible={isVisible}
			transparent={true}
			onRequestClose={onClose}
			animationType="slide"
		>
			<TouchableOpacity
				style={styles.modalOverlay}
				activeOpacity={1}
				onPressOut={onClose}
			>
				<TouchableOpacity style={styles.modalContent} activeOpacity={1}>
					<Text style={styles.modalTitle}>Add Members to Party</Text>
					{hostPips && hostPips.length > 0 ? (
						<FlatList
							data={hostPips}
							keyExtractor={(p) => p.id}
							renderItem={renderPipItem}
							contentContainerStyle={{ paddingHorizontal: 10 }}
						/>
					) : (
						<Text style={styles.noPipsText}>
							You haven't added any PIPs to your account yet. You can manage
							your PIPs list in your account settings.
						</Text>
					)}
					<View style={styles.modalButtonRow}>
						<Button
							onPress={onClose}
							mode="outlined"
							style={styles.modalButton}
							labelStyle={{ color: colors.textDark }}
						>
							Cancel
						</Button>
						<Button
							onPress={handleConfirm}
							mode="contained"
							disabled={selectedPipsToAdd.length === 0 || isLoading}
							loading={isLoading}
							style={[styles.modalButton, { backgroundColor: colors.primary }]}
							labelStyle={{ color: colors.textOnPrimaryBrand }}
						>
							Add{" "}
							{selectedPipsToAdd.length > 0
								? `${selectedPipsToAdd.length} `
								: ""}
							Member(s)
						</Button>
					</View>
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 20,
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		paddingVertical: 20,
		paddingHorizontal: 15,
		borderRadius: 12,
		width: "95%",
		maxHeight: "70%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 21,
		fontWeight: "bold",
		marginBottom: 15,
		textAlign: "center",
		color: colors.textDark,
	},
	pipCheckboxItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	pipNameText: { fontSize: 16, color: colors.textDark, marginLeft: 15 },
	disabledText: { color: colors.textLight },
	inPartyText: {
		marginLeft: "auto",
		color: colors.statusSuccess,
		fontStyle: "italic",
		fontSize: 13,
	},
	noPipsText: {
		textAlign: "center",
		fontStyle: "italic",
		color: colors.textMedium,
		padding: 20,
	},
	modalButtonRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		width: "100%",
		marginTop: 20,
		paddingTop: 15,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	modalButton: { flex: 1, marginHorizontal: 5 },
});

export default AddMembersModal;
