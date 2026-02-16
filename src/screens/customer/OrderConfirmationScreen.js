import React, { useState, useEffect } from "react";
import {
	View,
	Text,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	Modal,
	TouchableOpacity,
	ScrollView,
} from "react-native";
import {
	useRoute,
	useNavigation,
	CommonActions,
} from "@react-navigation/native";
import { useParty } from "../../context/customer/PartyContext";
import { httpsCallable } from "@react-native-firebase/functions";
import { functions } from "../../config/firebase";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { moderateScale } from "react-native-size-matters";
import { useTranslation } from "react-i18next";

const StarRating = ({ rating, onRate }) => {
	return (
		<View style={{ flexDirection: "row", marginVertical: 8 }}>
			{[1, 2, 3, 4, 5].map((star) => (
				<TouchableOpacity key={star} onPress={() => onRate(star)}>
					<Ionicons
						name={star <= rating ? "star" : "star-outline"}
						size={moderateScale(28)}
						color={star <= rating ? "#FFD700" : "#CCC"}
						style={{ marginHorizontal: 2 }}
					/>
				</TouchableOpacity>
			))}
		</View>
	);
};

const OrderConfirmationScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();
	const {
		initialStatus = "processing",
		itemsToRate = [],
		basketId,
		isIndividual,
		origin,
	} = route.params || {};

	const [status, setStatus] = useState(initialStatus);
	const [showRatingModal, setShowRatingModal] = useState(false);
	const [ratings, setRatings] = useState({});
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (status === "processing") {
			const timer = setTimeout(() => {
				setStatus("confirmed");
				setShowRatingModal(true);
			}, 1500);
			return () => clearTimeout(timer);
		}
	}, [status]);

	const handleRate = (itemId, value) => {
		setRatings((prev) => ({ ...prev, [itemId]: value }));
	};

	const handleSubmitRatings = async () => {
		if (submitting) return;
		setSubmitting(true);

		try {
			const submitRating = httpsCallable(functions, "submitMenuItemRating");

			for (const item of itemsToRate) {
				const rating = ratings[item.id];
				if (rating) {
					await submitRating({
						menuItemId: item.menuItemId,
						restaurantId: item.restaurantId,
						ratingValue: ratings[item.id],
						origin,
						comment: "",
						isIndividual: isIndividual, // ← from route.params
					});
				}
			}

			Alert.alert(t("thank_you"), t("your_ratings_have_been_submitted"));
			setShowRatingModal(false);
			navigation.dispatch(
				CommonActions.reset({
					index: 0,
					routes: [{ name: "CustomerDashboard" }], // ← ALWAYS go to Dashboard after submit
				})
			);
		} catch (error) {
			console.error("Rating submission failed:", error);
			Alert.alert(t("error"), t("failed_to_submit_ratings"));
		} finally {
			setSubmitting(false);
		}
	};

	const handleSkip = () => {
		setShowRatingModal(false);
		navigation.dispatch(
			CommonActions.reset({
				index: 0,
				routes: [
					{ name: origin === "individual" ? "CustomerDashboard" : "PartyHub" },
				],
			})
		);
	};

	if (status === "processing") {
		return (
			<SafeAreaView style={styles.container}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.statusText}>
					{t("processing_your_payment")}...
				</Text>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.content}>
				<Ionicons
					name="checkmark-circle"
					size={80}
					color={colors.success || "#4CAF50"}
				/>
				<Text style={styles.title}>{t("payment_successful")}!</Text>
				<Text style={styles.subtitle}>{t("your_portion_has_been_paid")}</Text>
			</View>

			<Modal visible={showRatingModal} animationType="slide" transparent>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>{t("rate_your_items")}</Text>

						<ScrollView style={{ maxHeight: "60%" }}>
							{itemsToRate.length === 0 ? (
								<Text style={styles.noItemsText}>
									{t("no_items_to_rate")}
								</Text>
							) : (
								itemsToRate.map((item) => {
									return (
										<View key={item.id} style={styles.ratingItem}>
											<Text style={styles.itemName}>{item.name}</Text>
											<StarRating
												rating={ratings[item.id] || 0}
												onRate={(v) => handleRate(item.id, v)}
											/>
										</View>
									);
								})
							)}
						</ScrollView>
						<View style={styles.modalButtons}>
							<TouchableOpacity
								style={[styles.modalButton, styles.submitButton]}
								onPress={handleSubmitRatings}
								disabled={submitting}
							>
								<Text style={styles.buttonText}>
									{submitting
										? t("submitting")
										: t("submit_ratings")}
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.modalButton, styles.skipButton]}
								onPress={handleSkip}
							>
								<Text style={styles.buttonText}>{t("skip")}</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
};

const styles = {
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#fff",
	},
	content: { alignItems: "center", padding: 20 },
	title: {
		fontSize: 24,
		fontWeight: "bold",
		marginTop: 16,
		color: colors.textDark || "#333",
	},
	subtitle: { fontSize: 16, color: colors.textMedium || "#666", marginTop: 8 },
	statusText: { marginTop: 16, fontSize: 16, color: colors.textDark || "#333" },

	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalContent: {
		backgroundColor: "#fff",
		borderRadius: 16,
		padding: 20,
		width: "90%",
		maxHeight: "80%",
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 16,
		textAlign: "center",
		color: colors.textDark || "#333",
	},
	ratingItem: {
		marginBottom: 16,
		padding: 12,
		backgroundColor: "#f9f9f9",
		borderRadius: 8,
		color: colors.textDark,
	},
	itemName: {
		fontSize: 16,
		fontWeight: "600",
		marginBottom: 8,
		color: colors.textDark || "#333",
	},
	noItemsText: {
		textAlign: "center",
		color: colors.textMedium || "#666",
		fontStyle: "italic",
		marginVertical: 20,
	},
	modalButtons: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 16,
	},
	modalButton: {
		flex: 1,
		padding: 12,
		borderRadius: 8,
		marginHorizontal: 8,
	},
	submitButton: {
		backgroundColor: colors.primary || "#2196F3",
	},
	skipButton: {
		backgroundColor: colors.mediumGray || "#999",
	},
	buttonText: {
		color: "#fff",
		textAlign: "center",
		fontWeight: "600",
	},
};

export default OrderConfirmationScreen;
