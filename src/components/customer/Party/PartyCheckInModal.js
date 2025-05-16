import React from "react";
import {
	View,
	Text,
	Modal,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";
import colors from "../../../utils/styles/appStyles";

const PartyCheckInModal = ({
	isVisible,
	onClose,
	initialPartySize,
	validationSchema,
	onSubmit,
	isLoadingAction,
}) => {
	return (
		<Modal
			transparent={true}
			onRequestClose={onClose}
			visible={isVisible}
			animationType="fade"
		>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContent}>
					<Formik
						initialValues={{ partySize: initialPartySize.toString() }}
						validationSchema={validationSchema}
						onSubmit={onSubmit}
					>
						{({
							handleChange,
							handleBlur,
							handleSubmit,
							values,
							errors,
							touched,
						}) => (
							<>
								<Text style={styles.modalTitle}>Confirm Party Size</Text>
								<TextInput
									style={styles.input}
									onChangeText={handleChange("partySize")}
									onBlur={handleBlur("partySize")}
									value={values.partySize}
									keyboardType="numeric"
									placeholder="Party Size"
									textAlign="center"
								/>
								{errors.partySize && touched.partySize && (
									<Text style={styles.errorTextModal}>{errors.partySize}</Text>
								)}
								<View style={styles.modalButtonRow}>
									<TouchableOpacity
										onPress={onClose}
										style={[styles.modalButton, styles.cancelModalButton]}
									>
										<Text style={styles.modalButtonText}>Cancel</Text>
									</TouchableOpacity>
									<TouchableOpacity
										onPress={handleSubmit}
										style={[
											styles.modalButton,
											isLoadingAction && styles.disabledButton,
										]}
										disabled={isLoadingAction}
									>
										{isLoadingAction ? (
											<ActivityIndicator size="small" color="white" />
										) : (
											<Text style={styles.modalButtonText}>
												Request Check-In
											</Text>
										)}
									</TouchableOpacity>
								</View>
							</>
						)}
					</Formik>
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
		padding: 25,
		width: "85%",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 15,
		textAlign: "center",
		color: colors.textDark,
	},
	input: {
		borderWidth: 1,
		borderColor: colors.mediumGray || "#ccc",
		padding: 12,
		borderRadius: 8,
		marginBottom: 10,
		marginTop: 5,
		textAlign: "center",
		fontSize: 18,
		width: "70%",
	},
	errorTextModal: {
		color: colors.danger || "red",
		textAlign: "center",
		marginBottom: 10,
		fontSize: 13,
	},
	modalButtonRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		width: "100%",
		marginTop: 20,
	},
	modalButton: {
		paddingVertical: 12,
		paddingHorizontal: 10,
		borderRadius: 8,
		alignItems: "center",
		flex: 1,
		marginHorizontal: 5,
		backgroundColor: colors.primary,
	},
	cancelModalButton: { backgroundColor: colors.mediumGray || "#ccc" },
	modalButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
	disabledButton: { opacity: 0.7, backgroundColor: colors.mediumGray },
});

export default PartyCheckInModal;
