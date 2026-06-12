import React, { useState } from "react";
import { View, Text, Modal, StyleSheet, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";
import PlatformSelect from "../global/PlatformSelect";

const ServerAssignmentModal = ({
	visible,
	onClose,
	onAssignServer,
	servers,
}) => {
	const { t } = useTranslation();
	const [selectedServerId, setSelectedServerId] = useState(null);
	const selectedServer =
		servers?.find((server) => server.id === selectedServerId) || null;

	const handleAssign = () => {
		if (selectedServer) {
			onAssignServer(selectedServer);
			onClose();
		} else {
			alert(t("please_select_server_alert"));
		}
	};

	return (
		<Modal visible={visible} animationType="slide" transparent={true}>
			<View style={styles.modalContainer}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>{t("assign_server_title")}</Text>

					<View style={styles.pickerContainer}>
						<PlatformSelect
							value={selectedServerId}
							onValueChange={setSelectedServerId}
							title={t("assign_server_title")}
							placeholder={t("select_server_label", "Select Server")}
							options={(servers || []).map((server) => ({
								label: `${server.firstName} ${server.lastName}`,
								value: server.id,
							}))}
							style={styles.selectButton}
							pickerStyle={styles.picker}
							itemStyle={styles.pickerItem}
						/>
					</View>

					{/* Buttons */}
					<View style={styles.buttonContainer}>
						<TouchableOpacity onPress={onClose} style={styles.cancelButton}>
							<Text style={styles.cancelButtonText}>{t("cancel_button")}</Text>
						</TouchableOpacity>
						<TouchableOpacity
							onPress={handleAssign}
							disabled={!selectedServer}
							style={[
								styles.assignButton,
								!selectedServer && styles.disabledButton,
							]}
						>
							<Text style={styles.assignButtonText}>{t("assign_button")}</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContent: {
		backgroundColor: "white",
		padding: 20,
		borderRadius: 10,
		width: "80%",
	},
	modalTitle: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		textAlign: "center",
		color: colors.textDark,
	},
	pickerContainer: {
		borderWidth: 1,
		borderColor: colors.borderLight, // Updated
		borderRadius: 8,
		paddingHorizontal: 10,
		marginBottom: 20,
		backgroundColor: colors.surfaceWhite, // Updated
	},
	picker: {
		width: "100%",
		height: 70,
		color: colors.textDark, // Updated
	},
	pickerItem: {
		color: colors.textDark, // Updated
		fontSize: 16,
	},
	selectButton: { borderWidth: 0, backgroundColor: colors.surfaceWhite },
	buttonContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginTop: 10,
	},
	cancelButton: {
		backgroundColor: colors.borderLight, // Updated from #ccc
		padding: 10,
		borderRadius: 8,
		flex: 1,
		marginHorizontal: 5,
		alignItems: "center",
	},
	cancelButtonText: {
		color: colors.textDark, // Updated from #333
		fontSize: 16,
	},
	disabledButton: {
		opacity: 0.6,
		backgroundColor: colors.textMedium, // Updated fallback
	},
	assignButton: {
		backgroundColor: colors.primary,
		padding: 10,
		borderRadius: 8,
		flex: 1,
		marginHorizontal: 5,
		alignItems: "center",
	},
	assignButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default ServerAssignmentModal;
