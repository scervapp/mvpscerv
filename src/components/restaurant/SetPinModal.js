// src/components/restaurant/SetPinModal.js
import React from "react";
import {
	View,
	Text,
	Modal,
	StyleSheet,
	TextInput,
	TouchableOpacity,
} from "react-native";
import { useTranslation } from 'react-i18next';
import { Button } from "react-native-paper";
import { Formik } from "formik";
import * as Yup from "yup";
import colors from "../../utils/styles/appStyles"; // Adjust path

const SetPinModal = ({
	isVisible,
	onClose,
	onSubmit,
	employeeName,
	isLoading = false,
}) => {
	const { t } = useTranslation();
	const validationSchema = Yup.object().shape({
		pin: Yup.string()
			.required(t('pin_required_error'))
			.matches(/^\d+$/, t('pin_numeric_error'))
			.min(4, t('pin_min_length_error', { length: 4 }))
			.max(6, t('pin_max_length_error', { length: 6 })),
		confirmPin: Yup.string()
			.oneOf([Yup.ref("pin"), null], t('pins_must_match_error'))
			.required(t('confirm_pin_required_error')),
	});

	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<TouchableOpacity
				style={styles.modalOverlay}
				activeOpacity={1}
				onPressOut={onClose}
			>
				<TouchableOpacity style={styles.modalContent} activeOpacity={1}>
					<Text style={styles.modalTitle}>{t('set_pin_for_employee', { employeeName: employeeName })}</Text>
					<Formik
						initialValues={{ pin: "", confirmPin: "" }}
						validationSchema={validationSchema}
						onSubmit={(values) => onSubmit(values.pin)} // Pass only the confirmed PIN
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
								<TextInput
									style={styles.input}
									placeholder={t('enter_pin_placeholder')}
									value={values.pin}
									onChangeText={handleChange("pin")}
									onBlur={handleBlur("pin")}
									keyboardType="number-pad"
									secureTextEntry
									maxLength={6}
								/>
								{touched.pin && errors.pin && (
									<Text style={styles.errorText}>{errors.pin}</Text>
								)}

								<TextInput
									style={styles.input}
									placeholder={t('confirm_pin_placeholder')}
									value={values.confirmPin}
									onChangeText={handleChange("confirmPin")}
									onBlur={handleBlur("confirmPin")}
									keyboardType="number-pad"
									secureTextEntry
									maxLength={6}
								/>
								{touched.confirmPin && errors.confirmPin && (
									<Text style={styles.errorText}>{errors.confirmPin}</Text>
								)}

								<View style={styles.modalActions}>
									<Button
										onPress={onClose}
										mode="outlined"
										style={styles.modalButton}
										disabled={isLoading}
									>
										{t('cancel_button')}
									</Button>
									<Button
										onPress={handleSubmit}
										mode="contained"
										loading={isLoading}
										disabled={isLoading}
										style={[
											styles.modalButton,
											{ backgroundColor: colors.primary },
										]}
									>
										{t('save_pin_button')}
									</Button>
								</View>
							</>
						)}
					</Formik>
				</TouchableOpacity>
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
		padding: 20,
	},
	modalContent: {
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 25,
		paddingTop: 30,
		paddingBottom: 20,
		borderRadius: 12,
		width: "100%",
		maxWidth: 400,
	},
	modalTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.primary,
		marginBottom: 25,
		textAlign: "center",
	},
	input: {
		height: 55,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		paddingHorizontal: 15,
		marginBottom: 10,
		fontSize: 16,
		backgroundColor: colors.backgroundLight,
	},
	errorText: {
		color: colors.statusDanger,
		marginBottom: 10,
		marginLeft: 5,
		fontSize: 13,
	},
	modalActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 20,
	},
	modalButton: { flex: 1, marginHorizontal: 5 },
});

export default SetPinModal;
