import React, {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	View,
	Text,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	Modal,
	TouchableOpacity,
	ScrollView,
	TextInput,
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
import { AuthContext } from "../../context/authContext";

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

const REVIEW_TAGS = [
	"crispy",
	"fresh",
	"great sauce",
	"large portion",
	"well seasoned",
	"too salty",
	"overcooked",
	"would order again",
];

const SERVER_REVIEW_TAGS = [
	"attentive",
	"welcoming",
	"fast",
	"helpful",
	"knowledgeable",
	"needs follow-up",
];

const buildCustomerReviewName = (customer = {}) => {
	const fullName = String(customer.fullName || customer.name || "").trim();
	const firstName = String(customer.firstName || "").trim();
	const lastName = String(customer.lastName || "").trim();

	if (firstName && lastName) return `${firstName} ${lastName.charAt(0)}.`;
	if (firstName) return firstName;
	if (fullName) {
		const parts = fullName.split(/\s+/).filter(Boolean);
		if (parts.length > 1) return `${parts[0]} ${parts[1].charAt(0)}.`;
		return parts[0];
	}
	return "";
};

const OrderConfirmationScreen = () => {
	const { t } = useTranslation();
	const { currentUserData } = useContext(AuthContext);
	const { clearPartySession } = useParty();
	const route = useRoute();
	const navigation = useNavigation();
	const {
		initialStatus = "processing",
		itemsToRate = [],
		basketId,
		isIndividual,
		origin,
		appOrderId,
		completedPartyId = null,
		completedRestaurantId = null,
		serverRatingContext = null,
	} = route.params || {};

	const [status, setStatus] = useState(initialStatus);
	const [showRatingModal, setShowRatingModal] = useState(false);
	const [ratings, setRatings] = useState({});
	const [reviewTexts, setReviewTexts] = useState({});
	const [reviewTags, setReviewTags] = useState({});
	const [serverRating, setServerRating] = useState(0);
	const [serverReviewText, setServerReviewText] = useState("");
	const [serverReviewTags, setServerReviewTags] = useState([]);
	const [submitting, setSubmitting] = useState(false);
	const customerReviewName = useMemo(
		() => buildCustomerReviewName(currentUserData),
		[currentUserData],
	);
	const resolvedServerRatingContext = useMemo(() => {
		const server = serverRatingContext?.server || {};
		const serverId = String(server.id || server.serverId || "").trim();
		const serverName = String(server.name || server.serverName || "").trim();
		const lowerServerId = serverId.toLowerCase();

		// Only invite server feedback when the party was assigned to a real staff member.
		if (
			!serverRatingContext?.restaurantId ||
			!serverId ||
			lowerServerId === "unassigned" ||
			lowerServerId === "self-seated"
		) {
			return null;
		}

		return {
			...serverRatingContext,
			server: {
				id: serverId,
				name: serverName || t("your_server", "your server"),
			},
		};
	}, [serverRatingContext, t]);
	const clearCompletedPartySession = useCallback(() => {
		const partyIdToClear =
			completedPartyId ||
			serverRatingContext?.partyId ||
			(origin === "party" ? basketId : null);

		if (origin !== "party" || !partyIdToClear) return;

		clearPartySession(
			partyIdToClear,
			completedRestaurantId || serverRatingContext?.restaurantId || null,
		);
	}, [
		basketId,
		clearPartySession,
		completedPartyId,
		completedRestaurantId,
		origin,
		serverRatingContext?.partyId,
		serverRatingContext?.restaurantId,
	]);

	useEffect(() => {
		if (status === "processing") {
			const timer = setTimeout(() => {
				setStatus("confirmed");
				setShowRatingModal(true);
			}, 1500);
			return () => clearTimeout(timer);
		}

		if (status === "confirmed" || status === "completed") {
			setShowRatingModal(true);
			clearCompletedPartySession();
		}
	}, [clearCompletedPartySession, status]);

	const handleRate = (itemId, value) => {
		setRatings((prev) => ({ ...prev, [itemId]: value }));
	};

	const handleReviewTextChange = (itemId, value) => {
		setReviewTexts((prev) => ({ ...prev, [itemId]: value }));
	};

	const handleToggleReviewTag = (itemId, tag) => {
		setReviewTags((prev) => {
			const currentTags = prev[itemId] || [];
			const nextTags = currentTags.includes(tag)
				? currentTags.filter((value) => value !== tag)
				: [...currentTags, tag];

			return { ...prev, [itemId]: nextTags };
		});
	};

	const handleToggleServerReviewTag = (tag) => {
		setServerReviewTags((prev) =>
			prev.includes(tag)
				? prev.filter((value) => value !== tag)
				: [...prev, tag],
		);
	};

	const handleSubmitRatings = async () => {
		if (submitting) return;
		setSubmitting(true);

		try {
			const submitRating = httpsCallable(functions, "submitMenuItemRating");
			const submitServerRating = resolvedServerRatingContext
				? httpsCallable(functions, "submitServerRating")
				: null;

			for (const item of itemsToRate) {
				const rating = ratings[item.id];
				if (rating) {
					await submitRating({
						menuItemId: item.menuItemId,
						restaurantId: item.restaurantId,
						ratingValue: ratings[item.id],
						origin,
						comment: reviewTexts[item.id] || "",
						reviewText: reviewTexts[item.id] || "",
						reviewTags: reviewTags[item.id] || [],
						orderId: appOrderId || basketId || null,
						customerName: customerReviewName || null,
						customerDisplayName: customerReviewName || null,
						isIndividual: isIndividual, // ← from route.params
					});
				}
			}

			if (submitServerRating && serverRating) {
				await submitServerRating({
					restaurantId: resolvedServerRatingContext.restaurantId,
					serverId: resolvedServerRatingContext.server.id,
					serverName: resolvedServerRatingContext.server.name,
					ratingValue: serverRating,
					feedbackText: serverReviewText,
					feedbackTags: serverReviewTags,
					orderId: appOrderId || basketId || null,
					partyId: resolvedServerRatingContext.partyId || null,
					checkInId: resolvedServerRatingContext.checkInId || null,
					origin,
					customerName: customerReviewName || null,
				});
			}

			Alert.alert(t("thank_you"), t("your_ratings_have_been_submitted"));
			clearCompletedPartySession();
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
		clearCompletedPartySession();
		setShowRatingModal(false);
		navigation.dispatch(
			CommonActions.reset({
				index: 0,
				routes: [{ name: "CustomerDashboard" }],
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
											<View style={styles.tagWrap}>
												{REVIEW_TAGS.map((tag) => {
													const isSelected = (
														reviewTags[item.id] || []
													).includes(tag);
													return (
														<TouchableOpacity
															key={tag}
															style={[
																styles.reviewTag,
																isSelected && styles.reviewTagSelected,
															]}
															onPress={() => handleToggleReviewTag(item.id, tag)}
														>
															<Text
																style={[
																	styles.reviewTagText,
																	isSelected && styles.reviewTagTextSelected,
																]}
															>
																{tag}
															</Text>
														</TouchableOpacity>
													);
												})}
											</View>
											<TextInput
												value={reviewTexts[item.id] || ""}
												onChangeText={(value) =>
													handleReviewTextChange(item.id, value)
												}
												placeholder={t(
													"optional_review_placeholder",
													"What stood out? Optional.",
												)}
												placeholderTextColor={colors.textLight || "#999"}
												style={styles.reviewInput}
												multiline
												maxLength={800}
											/>
										</View>
									);
								})
							)}
							{resolvedServerRatingContext && (
								<View style={styles.serverRatingCard}>
									<Text style={styles.serverRatingEyebrow}>
										{t("service_feedback", "Service feedback")}
									</Text>
									<Text style={styles.serverRatingTitle}>
										{t("rate_server_prompt", "Rate {{serverName}}", {
											serverName: resolvedServerRatingContext.server.name,
										})}
									</Text>
									<StarRating rating={serverRating} onRate={setServerRating} />
									<View style={styles.tagWrap}>
										{SERVER_REVIEW_TAGS.map((tag) => {
											const isSelected = serverReviewTags.includes(tag);
											return (
												<TouchableOpacity
													key={tag}
													style={[
														styles.reviewTag,
														isSelected && styles.reviewTagSelected,
													]}
													onPress={() => handleToggleServerReviewTag(tag)}
												>
													<Text
														style={[
															styles.reviewTagText,
															isSelected && styles.reviewTagTextSelected,
														]}
													>
														{tag}
													</Text>
												</TouchableOpacity>
											);
										})}
									</View>
									<TextInput
										value={serverReviewText}
										onChangeText={setServerReviewText}
										placeholder={t(
											"optional_server_review_placeholder",
											"Anything the owner should know? Optional.",
										)}
										placeholderTextColor={colors.textLight || "#999"}
										style={styles.reviewInput}
										multiline
										maxLength={600}
									/>
								</View>
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
	serverRatingCard: {
		marginBottom: 16,
		padding: 14,
		borderWidth: 1,
		borderColor: colors.primary || "#2196F3",
		backgroundColor: "#F3FBFC",
		borderRadius: 10,
	},
	serverRatingEyebrow: {
		color: colors.primary || "#2196F3",
		fontSize: 12,
		fontWeight: "800",
		textTransform: "uppercase",
		marginBottom: 4,
	},
	serverRatingTitle: {
		fontSize: 16,
		fontWeight: "700",
		color: colors.textDark || "#333",
	},
	itemName: {
		fontSize: 16,
		fontWeight: "600",
		marginBottom: 8,
		color: colors.textDark || "#333",
	},
	tagWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: 8,
	},
	reviewTag: {
		borderWidth: 1,
		borderColor: colors.borderLight || "#ddd",
		borderRadius: 16,
		paddingHorizontal: 10,
		paddingVertical: 6,
		marginRight: 6,
		marginBottom: 6,
		backgroundColor: "#fff",
	},
	reviewTagSelected: {
		borderColor: colors.primary || "#2196F3",
		backgroundColor: colors.primary || "#2196F3",
	},
	reviewTagText: {
		color: colors.textDark || "#333",
		fontSize: 12,
		fontWeight: "600",
	},
	reviewTagTextSelected: {
		color: "#fff",
	},
	reviewInput: {
		minHeight: 72,
		borderWidth: 1,
		borderColor: colors.borderLight || "#ddd",
		borderRadius: 8,
		padding: 10,
		color: colors.textDark || "#333",
		backgroundColor: "#fff",
		textAlignVertical: "top",
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
