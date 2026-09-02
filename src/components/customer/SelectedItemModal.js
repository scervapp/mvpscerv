import React, { useState, useContext, useEffect, useMemo } from "react";
import { useNavigation } from "@react-navigation/native";
import {
	View,
	Text,
	Modal,
	StyleSheet,
	TouchableOpacity,
	ScrollView,
	Alert,
	InputAccessoryView,
	Keyboard,
	Platform,
	Image,
	useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Divider, IconButton, TextInput } from "react-native-paper";
import { httpsCallable } from "@react-native-firebase/functions";
import colors from "../../utils/styles/appStyles";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthContext } from "../../context/authContext";
import { db, functions } from "../../config/firebase";
import {
	formatCurrencyFromDollars,
	normalizeMenuPriceToDollars,
} from "../../utils/currencyFormatter";
import { getStoredScervScore } from "../../utils/discoveryScoring";

const StarRatingDisplay = ({ rating = 0, size = 15 }) => {
	const fullStars = Math.floor(rating);
	const hasHalf = rating % 1 >= 0.5;
	return (
		<View style={styles.starRow}>
			{[1, 2, 3, 4, 5].map((index) => (
				<Ionicons
					key={index}
					name={
						index <= fullStars
							? "star"
							: index === fullStars + 1 && hasHalf
								? "star-half"
								: "star-outline"
					}
					size={size}
					color="#F5B301"
					style={styles.starIcon}
				/>
			))}
		</View>
	);
};

const InteractiveStarRating = ({ rating = 0, onRate, size = 30 }) => (
	<View style={styles.interactiveStarRow}>
		{[1, 2, 3, 4, 5].map((star) => (
			<TouchableOpacity
				key={star}
				activeOpacity={0.75}
				onPress={() => onRate(star)}
				style={styles.interactiveStarButton}
			>
				<Ionicons
					name={star <= rating ? "star" : "star-outline"}
					size={size}
					color={star <= rating ? "#F5B301" : colors.borderMedium || "#C9D1D9"}
				/>
			</TouchableOpacity>
		))}
	</View>
);

const COMMUNITY_REVIEW_TAGS = [
	"crispy",
	"fresh",
	"great sauce",
	"well seasoned",
	"spicy",
	"shareable",
	"would order again",
	"hidden gem",
];

// Keep media flexible so old menu images, customer photos, and future video reviews can share one gallery.
const normalizeMediaType = (value, url = "") => {
	const type = String(value || "").toLowerCase();
	if (type === "video") return "video";
	if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(String(url || ""))) return "video";
	return "photo";
};

const normalizeMediaItem = (media, fallback = {}) => {
	if (!media) return null;
	const url =
		typeof media === "string"
			? media
			: media.url || media.imageUrl || media.imageUri || media.thumbnailUrl;
	const cleanUrl = String(url || "").trim();
	if (!cleanUrl) return null;

	const thumbnailUrl =
		typeof media === "string"
			? cleanUrl
			: media.thumbnailUrl || media.thumbnailUri || media.posterUrl || cleanUrl;

	return {
		id:
			(typeof media === "object" && (media.id || media.mediaId)) ||
			`${fallback.source || "media"}_${cleanUrl}`,
		type: normalizeMediaType(
			typeof media === "object" ? media.type : fallback.type,
			cleanUrl,
		),
		url: cleanUrl,
		thumbnailUrl,
		source:
			(typeof media === "object" && media.source) || fallback.source || "menu",
		caption:
			(typeof media === "object" && (media.caption || media.altText)) ||
			fallback.caption ||
			"",
		reviewId:
			(typeof media === "object" && media.reviewId) || fallback.reviewId || null,
	};
};

const getMenuItemMedia = (item = {}) => {
	const media = Array.isArray(item.media) ? item.media : [];
	const fallbackUrls = [
		item.imageUri,
		item.imageUrl,
		item.thumbnailUri,
		item.thumbnailUrl,
	].filter(Boolean);

	return [...media, ...fallbackUrls]
		.map((entry, index) =>
			normalizeMediaItem(entry, {
				source: index === 0 ? "menu" : "restaurant",
				caption: item.name || "",
			}),
		)
		.filter(Boolean)
		.filter(
			(mediaItem, index, allItems) =>
				allItems.findIndex((candidate) => candidate.url === mediaItem.url) === index,
		)
		.slice(0, 12);
};

const getReviewMedia = (review = {}) => {
	const media = Array.isArray(review.media) ? review.media : [];
	const fallbackUrls = [
		review.photoUrl,
		review.imageUrl,
		review.imageUri,
		review.videoUrl,
	].filter(Boolean);

	return [...media, ...fallbackUrls]
		.map((entry) =>
			normalizeMediaItem(entry, {
				source: "customer",
				reviewId: review.id,
				caption: review.reviewText || review.comment || "",
			}),
		)
		.filter(Boolean);
};

const PipInstructionModal = ({
	visible,
	onClose,
	pipName,
	initialInstructions = "",
	onSaveInstructions,
}) => {
	const { t } = useTranslation();
	const [instructions, setInstructions] = useState(initialInstructions);
	const keyboardAccessoryId = "pip-instruction-keyboard-toolbar";

	useEffect(() => {
		if (visible) {
			setInstructions(initialInstructions);
		}
	}, [visible, initialInstructions]);

	const handleSave = () => {
		onSaveInstructions(instructions);
		onClose();
	};

	return (
		<Modal
			visible={visible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.pipInstructionModalContent}>
					<Text style={styles.modalTitle}>
						{t("special_instructions_for_pip", {
							pipName: pipName,
							defaultValue: `Special instructions for ${pipName}`,
						})}
					</Text>
					<TextInput
						style={styles.specialInstructionsInput}
						placeholder={t("notes_for_pip_item_placeholder", {
							pipName: pipName,
							defaultValue: `Add notes for ${pipName}`,
						})}
						value={instructions}
						onChangeText={setInstructions}
						multiline
						numberOfLines={4}
						blurOnSubmit
						inputAccessoryViewID={keyboardAccessoryId}
						returnKeyType="done"
						onSubmitEditing={Keyboard.dismiss}
						placeholderTextColor={colors.textLight}
					/>
					<View style={styles.modalButtonRow}>
						<Button
							onPress={onClose}
							mode="outlined"
							style={styles.modalButton}
						>
							{t("cancel_button", "Cancel")}
						</Button>
						<Button
							onPress={handleSave}
							mode="contained"
							style={[styles.modalButton, { backgroundColor: colors.primary }]}
						>
							{t("save_instructions_button", "Save")}
						</Button>
					</View>
				</View>
			</View>
			{Platform.OS === "ios" ? (
				<InputAccessoryView nativeID={keyboardAccessoryId}>
					<View style={styles.keyboardAccessory}>
						<TouchableOpacity
							style={styles.keyboardDoneButton}
							onPress={Keyboard.dismiss}
						>
							<Text style={styles.keyboardDoneText}>Done</Text>
						</TouchableOpacity>
					</View>
				</InputAccessoryView>
			) : null}
		</Modal>
	);
};

const SelectedItemModal = ({
	visible,
	selectedItem,
	onClose,
	pips,
	onConfirm,
	orderingMode = "individual",
	isLoading = false,
	partyData,
	isOrderingAvailable = true,
	restaurantName = "",
	onViewRestaurant,
}) => {
	const { t, i18n } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const { height: windowHeight } = useWindowDimensions();
	const keyboardAccessoryId = "selected-item-keyboard-toolbar";
	const modalMaxHeight = Math.round(windowHeight * 0.9);
	const modalScrollMaxHeight = Math.max(260, modalMaxHeight - 76);

	const [quantity, setQuantity] = useState(1);
	const [partyModeTarget, setPartyModeTarget] = useState(null);
	const [orderTargets, setOrderTargets] = useState([]);
	const [reviewHighlights, setReviewHighlights] = useState([]);
	const [isLoadingReviews, setIsLoadingReviews] = useState(false);
	const [isAllReviewsVisible, setIsAllReviewsVisible] = useState(false);
	const [selectedMediaPreview, setSelectedMediaPreview] = useState(null);
	const [isReviewModalVisible, setIsReviewModalVisible] = useState(false);
	const [communityRating, setCommunityRating] = useState(0);
	const [communityReviewText, setCommunityReviewText] = useState("");
	const [communityReviewTags, setCommunityReviewTags] = useState([]);
	const [isSubmittingCommunityReview, setIsSubmittingCommunityReview] =
		useState(false);

	const [isPipInstructionModalVisible, setIsPipInstructionModalVisible] =
		useState(false);
	const [editingTargetForInstructions, setEditingTargetForInstructions] =
		useState(null);

	const [selectedModifiers, setSelectedModifiers] = useState([]);

	const getLocalizedText = (value) => {
		if (!value) return "";
		if (typeof value === "string") return value;

		const language = (i18n.language || "en").toLowerCase();
		if (language.startsWith("es")) {
			return value.es || value.en || value.original || "";
		}
		return value.en || value.es || value.original || "";
	};

	const modifierGroups = useMemo(() => {
		if (!selectedItem || !Array.isArray(selectedItem.modifierGroups)) return [];
		return selectedItem.modifierGroups;
	}, [selectedItem]);

	const currentUserTarget = useMemo(() => {
		if (!currentUserData?.uid) return null;

		return {
			id: currentUserData.uid,
			userId: currentUserData.uid,
			name:
				currentUserData.fullName ||
				currentUserData.firstName ||
				t("myself", "Myself"),
			specialInstructions: "",
		};
	}, [
		currentUserData?.uid,
		currentUserData?.fullName,
		currentUserData?.firstName,
		t,
	]);

	const displayOptions = useMemo(() => {
		const normalizedPips = Array.isArray(pips)
			? pips
					.map((pip) => {
						const id = pip?.id || pip?.userId || pip?.localPipId;
						if (!id) return null;

						return {
							...pip,
							id,
							name: pip?.name || pip?.fullName || t("guest", "Guest"),
							specialInstructions: pip?.specialInstructions || "",
							isCurrentUser: pip?.userId === currentUserData?.uid,
							isPlatformUser: !!pip?.userId,
							isLocalGuest: !!pip?.localPipId || pip?.isLocal === true,
						};
					})
					.filter(Boolean)
			: [];

		if (normalizedPips.length > 0) return normalizedPips;
		return currentUserTarget ? [currentUserTarget] : [];
	}, [pips, currentUserTarget, currentUserData?.uid, t]);

	useEffect(() => {
		if (visible && selectedItem) {
			setQuantity(1);
			setSelectedModifiers([]);

			const initialTarget = displayOptions[0] || null;

			setPartyModeTarget(orderingMode === "party" ? initialTarget : null);
			setOrderTargets(initialTarget ? [initialTarget] : []);
		}
	}, [visible, selectedItem, orderingMode, displayOptions]);

	useEffect(() => {
		if (!visible || !selectedItem?.id) {
			setReviewHighlights([]);
			setIsLoadingReviews(false);
			setIsAllReviewsVisible(false);
			setSelectedMediaPreview(null);
			setIsReviewModalVisible(false);
			setCommunityRating(0);
			setCommunityReviewText("");
			setCommunityReviewTags([]);
			return undefined;
		}

		setIsLoadingReviews(true);
		const unsubscribe = db
			.collection("menuItems")
			.doc(selectedItem.id)
			.collection("ratings")
			.orderBy("ratingValue", "desc")
			.onSnapshot(
				(snapshot) => {
					const reviews = snapshot.docs
						.map((doc) => ({ id: doc.id, ...doc.data() }))
						.filter((review) => review.status !== "hidden")
						.sort((a, b) => Number(b.ratingValue || 0) - Number(a.ratingValue || 0));
					setReviewHighlights(reviews);
					setIsLoadingReviews(false);
				},
				(error) => {
					console.error("Error loading menu item reviews:", error);
					setReviewHighlights([]);
					setIsLoadingReviews(false);
				},
			);

		return () => unsubscribe();
	}, [visible, selectedItem?.id]);

	const topReviewTags = useMemo(() => {
		const counts = new Map();
		const itemTags = Array.isArray(selectedItem?.topReviewTags)
			? selectedItem.topReviewTags
			: [];
		itemTags.forEach((tag) => {
			const normalized = String(tag || "").trim();
			if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 2);
		});
		reviewHighlights.forEach((review) => {
			(review.reviewTags || []).forEach((tag) => {
				const normalized = String(tag || "").trim();
				if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
			});
		});
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([tag]) => tag)
			.slice(0, 6);
	}, [reviewHighlights, selectedItem?.topReviewTags]);

	const ratingSummary = useMemo(() => {
		const averageRating = Number(selectedItem?.averageRating || 0);
		const ratingCount = Number(selectedItem?.ratingCount || 0);
		const reviewCount = Number(selectedItem?.reviewCount || 0);
		const scervScore = Math.round(getStoredScervScore(selectedItem || {}));
		return { averageRating, ratingCount, reviewCount, scervScore };
	}, [selectedItem]);

	const dishGalleryMedia = useMemo(() => {
		const mediaByUrl = new Map();
		getMenuItemMedia(selectedItem).forEach((mediaItem) => {
			mediaByUrl.set(mediaItem.url, mediaItem);
		});
		reviewHighlights.forEach((review) => {
			getReviewMedia(review).forEach((mediaItem) => {
				if (!mediaByUrl.has(mediaItem.url)) {
					mediaByUrl.set(mediaItem.url, mediaItem);
				}
			});
		});
		return [...mediaByUrl.values()].slice(0, 12);
	}, [reviewHighlights, selectedItem]);

	const hasGuestSignals =
		ratingSummary.averageRating > 0 ||
		ratingSummary.ratingCount > 0 ||
		ratingSummary.reviewCount > 0 ||
		topReviewTags.length > 0 ||
		reviewHighlights.length > 0;

	const currentUserReview = useMemo(() => {
		if (!currentUserData?.uid) return null;
		return (
			reviewHighlights.find(
				(review) => review.customerId === currentUserData.uid,
			) || null
		);
	}, [currentUserData?.uid, reviewHighlights]);

	const canOpenDishReview = Boolean(
		!isOrderingAvailable && selectedItem?.id && selectedItem?.restaurantId,
	);

	const getCustomerReviewName = () => {
		const fullName = String(
			currentUserData?.fullName || currentUserData?.name || "",
		).trim();
		const firstName = String(currentUserData?.firstName || "").trim();
		const lastName = String(currentUserData?.lastName || "").trim();

		if (firstName && lastName) return `${firstName} ${lastName.charAt(0)}.`;
		if (firstName) return firstName;
		if (fullName) {
			const parts = fullName.split(/\s+/).filter(Boolean);
			return parts.length > 1 ? `${parts[0]} ${parts[1].charAt(0)}.` : parts[0];
		}
		return "";
	};

	const openDishReviewModal = () => {
		if (!canOpenDishReview) return;
		if (!currentUserData?.uid || currentUserData?.role === "guest") {
			Alert.alert(
				t("sign_in_required_title", "Sign in required"),
				t(
					"sign_in_to_rate_dish_message",
					"Create or sign in to a customer account to rate dishes.",
				),
			);
			return;
		}
		if (currentUserReview) {
			Alert.alert(
				t("already_rated_title", "Already rated"),
				t(
					"already_rated_dish_message",
					"You already rated this dish. Your review is helping other guests.",
				),
			);
			return;
		}

		setCommunityRating(0);
		setCommunityReviewText("");
		setCommunityReviewTags([]);
		setIsReviewModalVisible(true);
	};

	const toggleCommunityReviewTag = (tag) => {
		setCommunityReviewTags((currentTags) =>
			currentTags.includes(tag)
				? currentTags.filter((value) => value !== tag)
				: [...currentTags, tag],
		);
	};

	const submitCommunityReview = async () => {
		if (!selectedItem?.id || !selectedItem?.restaurantId) return;
		if (communityRating < 1) {
			Alert.alert(
				t("rating_required_title", "Rating required"),
				t("choose_star_rating_message", "Choose a star rating first."),
			);
			return;
		}

		setIsSubmittingCommunityReview(true);
		try {
			const submitRating = httpsCallable(functions, "submitMenuItemRating");
			await submitRating({
				menuItemId: selectedItem.id,
				restaurantId: selectedItem.restaurantId,
				ratingValue: communityRating,
				comment: communityReviewText,
				reviewText: communityReviewText,
				reviewTags: communityReviewTags,
				orderId: null,
				origin: "community_discovery_review",
				isIndividual: true,
				customerName: getCustomerReviewName() || null,
				customerDisplayName: getCustomerReviewName() || null,
				verificationLevel: "community_guest",
				media: [],
			});
			setIsReviewModalVisible(false);
			setCommunityRating(0);
			setCommunityReviewText("");
			setCommunityReviewTags([]);
			Alert.alert(
				t("thank_you", "Thank you"),
				t(
					"community_review_submitted_message",
					"Your dish rating was added to Scerv discovery.",
				),
			);
		} catch (error) {
			console.error("Community dish review failed:", error);
			const alreadyExists =
				String(error?.code || "").includes("already-exists") ||
				String(error?.message || "").toLowerCase().includes("already");
			Alert.alert(
				alreadyExists
					? t("already_rated_title", "Already rated")
					: t("error", "Error"),
				alreadyExists
					? t(
							"already_rated_dish_message",
							"You already rated this dish. Your review is helping other guests.",
						)
					: t(
							"community_review_failed_message",
							"We could not submit your dish rating. Please try again.",
						),
			);
		} finally {
			setIsSubmittingCommunityReview(false);
		}
	};

	const openInstructionModalForTarget = (target) => {
		const existingTarget = orderTargets.find((t) => t.id === target.id);
		setEditingTargetForInstructions({
			id: target.id,
			name: target.name,
			currentInstructions: existingTarget
				? existingTarget.specialInstructions
				: "",
		});
		setIsPipInstructionModalVisible(true);
	};

	const handleSaveTargetInstructions = (instructions) => {
		if (!editingTargetForInstructions) return;

		setOrderTargets((prevTargets) =>
			prevTargets.map((t) =>
				t.id === editingTargetForInstructions.id
					? { ...t, specialInstructions: instructions }
					: t,
			),
		);

		if (
			partyModeTarget &&
			partyModeTarget.id === editingTargetForInstructions.id
		) {
			setPartyModeTarget((prev) =>
				prev ? { ...prev, specialInstructions: instructions } : prev,
			);
		}

		setEditingTargetForInstructions(null);
	};

	const toggleIndividualTargetSelection = (targetToToggle) => {
		const isCurrentlySelected = orderTargets.some(
			(t) => t.id === targetToToggle.id,
		);

		if (isCurrentlySelected) {
			setOrderTargets((prev) => prev.filter((t) => t.id !== targetToToggle.id));
		} else {
			const newTarget = { ...targetToToggle, specialInstructions: "" };
			setOrderTargets((prev) => [...prev, newTarget]);
			openInstructionModalForTarget(newTarget);
		}
	};

	const handlePartyModeTargetSelection = (targetOption) => {
		const newTarget = { ...targetOption, specialInstructions: "" };
		setPartyModeTarget(newTarget);
		setOrderTargets([newTarget]);
	};

	const getPartyTargetCaption = (target) => {
		if (target?.isCurrentUser || target?.id === currentUserData?.uid) {
			return t("you_pay_for_this_item", "You pay for this item");
		}

		if (target?.isPlatformUser) {
			return t(
				"platform_pip_pays_separately",
				"They can join Scerv and pay their own bill",
			);
		}

		return t(
			"local_guest_on_host_bill",
			"Local guest - this stays on your bill",
		);
	};

	const getSelectionsForGroup = (groupId) =>
		selectedModifiers.filter((modifier) => modifier.groupId === groupId);

	const isOptionSelected = (groupId, optionId) =>
		selectedModifiers.some(
			(modifier) =>
				modifier.groupId === groupId && modifier.optionId === optionId,
		);

	const toggleModifierOption = (group, option) => {
		const currentSelections = getSelectionsForGroup(group.id);
		const maxSelect =
			group.maxSelect !== undefined && group.maxSelect !== null
				? Number(group.maxSelect)
				: 1;

		const isSelected = isOptionSelected(group.id, option.id);

		if (isSelected) {
			setSelectedModifiers((prev) =>
				prev.filter(
					(modifier) =>
						!(modifier.groupId === group.id && modifier.optionId === option.id),
				),
			);
			return;
		}

		const newModifier = {
			groupId: group.id,
			groupName: getLocalizedText(group.name) || group.name || "",
			optionId: option.id,
			name: getLocalizedText(option.name) || option.name || "",
			price:
				option.price !== undefined && option.price !== null
					? Number(option.price)
					: 0,
			category: option.category || "Extras",
		};

		if (maxSelect <= 1) {
			setSelectedModifiers((prev) => [
				...prev.filter((modifier) => modifier.groupId !== group.id),
				newModifier,
			]);
			return;
		}

		if (currentSelections.length >= maxSelect) {
			Alert.alert(
				t("modifier_limit_reached_title", "Selection limit reached"),
				t("modifier_limit_reached_message", {
					groupName: getLocalizedText(group.name) || group.name || "",
					maxSelect: maxSelect,
					defaultValue: `You can only choose ${maxSelect} option(s) for ${getLocalizedText(group.name) || group.name || "this group"}.`,
				}),
			);
			return;
		}

		setSelectedModifiers((prev) => [...prev, newModifier]);
	};

	const validateModifierGroups = () => {
		for (let i = 0; i < modifierGroups.length; i += 1) {
			const group = modifierGroups[i];
			const required = !!group.required;
			const minSelect =
				group.minSelect !== undefined && group.minSelect !== null
					? Number(group.minSelect)
					: required
						? 1
						: 0;

			const selections = getSelectionsForGroup(group.id);

			if (required && selections.length < minSelect) {
				Alert.alert(
					t("required_selection_title", "Required selection"),
					t("required_selection_message", {
						groupName: getLocalizedText(group.name) || group.name || "",
						minSelect: minSelect,
						defaultValue: `Please choose at least ${minSelect} option(s) for ${getLocalizedText(group.name) || group.name || "this group"}.`,
					}),
				);
				return false;
			}
		}

		return true;
	};

	const modifiersTotal = useMemo(() => {
		return selectedModifiers.reduce(
			(sum, modifier) => sum + Number(modifier.price || 0),
			0,
		);
	}, [selectedModifiers]);

	const basePrice = normalizeMenuPriceToDollars(
		selectedItem && selectedItem.price ? selectedItem.price : 0,
	);
	const unitPriceWithModifiers = basePrice + modifiersTotal;
	const finalPrice = unitPriceWithModifiers * quantity;

	const handleConfirmPress = () => {
		if (!isOrderingAvailable) {
			if (onViewRestaurant) onViewRestaurant();
			else onClose();
			return;
		}

		if (!selectedItem) {
			console.error("handleConfirmPress: Aborted, selectedItem is missing.");
			return;
		}

		if (orderTargets.length === 0) {
			Alert.alert(
				t("order_for_whom_title", "Who is this for?"),
				t(
					"select_at_least_one_person_message",
					"Please select at least one person.",
				),
			);
			return;
		}

		if (!validateModifierGroups()) {
			return;
		}

		const dataToConfirm = {
			menuItemDetails: {
				...selectedItem,
				selectedModifiers,
				modifiersTotal,
				basePrice,
				finalUnitPrice: unitPriceWithModifiers,
			},
			quantity,
		};

		if (orderingMode === "individual") {
			dataToConfirm.individualPips = orderTargets;
		} else if (orderingMode === "party") {
			if (!partyData || !partyData.partyId) {
				Alert.alert(
					t("error_title", "Error"),
					t(
						"party_info_missing_cannot_add_item_message",
						"Party info is missing. Cannot add this item.",
					),
				);
				return;
			}

			const partyTarget = orderTargets[0] || {};
			dataToConfirm.partyContextData = {
				partyId: partyData.partyId,
				currentUserId: partyData.currentUserId,
				orderingForPipName: partyTarget.name,
			};
			dataToConfirm.specialInstructions = partyTarget.specialInstructions;
		}

		onConfirm(dataToConfirm);
	};

	const renderModifierGroup = (group) => {
		const groupTitle = getLocalizedText(group.name) || group.name || "";
		const groupDescription =
			getLocalizedText(group.description) || group.description || "";

		const maxSelect =
			group.maxSelect !== undefined && group.maxSelect !== null
				? Number(group.maxSelect)
				: 1;

		const currentSelections = getSelectionsForGroup(group.id);

		return (
			<View key={group.id} style={styles.sectionContainer}>
				<Text style={styles.sectionTitle}>{groupTitle}</Text>

				{!!groupDescription && (
					<Text style={styles.groupDescription}>{groupDescription}</Text>
				)}

				<Text style={styles.groupMetaText}>
					{group.required
						? t("required_modifier_group", {
								defaultValue: "Required",
							})
						: t("optional_modifier_group", {
								defaultValue: "Optional",
							})}
					{" • "}
					{maxSelect <= 1
						? t("choose_one_modifier", {
								defaultValue: "Choose 1",
							})
						: t("choose_up_to_modifier", {
								max: maxSelect,
								defaultValue: `Choose up to ${maxSelect}`,
							})}
				</Text>

				{Array.isArray(group.options) &&
					group.options
						.filter((option) => option.isAvailable !== false)
						.map((option) => {
							const selected = isOptionSelected(group.id, option.id);
							const optionName =
								getLocalizedText(option.name) || option.name || "";
							const optionPrice =
								option.price !== undefined && option.price !== null
									? Number(option.price)
									: 0;

							return (
								<TouchableOpacity
									key={option.id}
									style={[
										styles.modifierOptionRow,
										selected && styles.modifierOptionRowSelected,
									]}
									onPress={() => toggleModifierOption(group, option)}
									activeOpacity={0.85}
								>
									<View style={styles.modifierOptionLeft}>
										<MaterialCommunityIcons
											name={
												maxSelect <= 1
													? selected
														? "radiobox-marked"
														: "radiobox-blank"
													: selected
														? "checkbox-marked-circle"
														: "checkbox-blank-circle-outline"
											}
											size={22}
											color={colors.primary}
										/>
										<View style={styles.modifierOptionTextWrap}>
											<Text style={styles.modifierOptionName}>
												{optionName}
											</Text>
											{!!option.category && (
												<Text style={styles.modifierOptionCategory}>
													{option.category}
												</Text>
											)}
										</View>
									</View>

									<Text style={styles.modifierOptionPrice}>
										{optionPrice > 0
										? `+${formatCurrencyFromDollars(optionPrice)}`
											: t("included_label", "Included")}
									</Text>
								</TouchableOpacity>
							);
						})}

				{currentSelections.length > 0 && (
					<View style={styles.groupSelectionSummary}>
						<Text style={styles.groupSelectionSummaryText}>
							{t("selected_count_label", {
								count: currentSelections.length,
								defaultValue:
									currentSelections.length === 1
										? "1 selected"
										: `${currentSelections.length} selected`,
							})}
						</Text>
					</View>
				)}

				<Divider style={styles.divider} />
			</View>
		);
	};

	const renderGuestSignals = () => {
		if (!hasGuestSignals && !canOpenDishReview) return null;

		return (
			<>
				<Divider style={styles.divider} />
				<View style={styles.sectionContainer}>
					<View style={styles.reviewSummaryHeader}>
						<Text style={styles.sectionTitle}>
							{t("guest_reviews_title", "Guest reviews")}
						</Text>
						<View style={styles.reviewHeaderActions}>
							{ratingSummary.averageRating > 0 && (
								<View style={styles.ratingSummaryPill}>
									<StarRatingDisplay rating={ratingSummary.averageRating} size={13} />
									<Text style={styles.ratingSummaryText}>
										{ratingSummary.averageRating.toFixed(1)}
									</Text>
								</View>
							)}
							{ratingSummary.scervScore > 0 && (
								<View style={styles.scervScorePill}>
									<Ionicons
										name="analytics-outline"
										size={13}
										color={colors.primary}
									/>
									<Text style={styles.scervScorePillText}>
										Scerv {ratingSummary.scervScore}
									</Text>
								</View>
							)}
							{canOpenDishReview && (
								<TouchableOpacity
									style={[
										styles.rateDishButton,
										currentUserReview ? styles.rateDishButtonDisabled : null,
									]}
									activeOpacity={0.75}
									onPress={openDishReviewModal}
								>
									<Ionicons
										name={currentUserReview ? "checkmark-circle" : "star-outline"}
										size={14}
										color={currentUserReview ? colors.success || "#16703F" : colors.primary}
									/>
									<Text
										style={[
											styles.rateDishButtonText,
											currentUserReview
												? styles.rateDishButtonTextDisabled
												: null,
										]}
									>
										{currentUserReview
											? t("rated_label", "Rated")
											: t("rate_this_dish", "Rate")}
									</Text>
								</TouchableOpacity>
							)}
						</View>
					</View>

					{ratingSummary.ratingCount > 0 && (
						<Text style={styles.reviewMetaText}>
							{ratingSummary.ratingCount}{" "}
							{ratingSummary.ratingCount === 1
								? t("rating", "rating")
								: t("ratings", "ratings")}
							{ratingSummary.reviewCount > 0
								? ` - ${ratingSummary.reviewCount} ${t(
										"reviews_label",
										"reviews",
									)}`
								: ""}
						</Text>
					)}

					{topReviewTags.length > 0 && (
						<View style={styles.reviewTagRow}>
							{topReviewTags.map((tag) => (
								<Text key={tag} style={styles.reviewTag}>
									{tag}
								</Text>
							))}
						</View>
					)}

					{isLoadingReviews ? (
						<Text style={styles.reviewMetaText}>
							{t("loading_reviews", "Loading reviews...")}
						</Text>
					) : reviewHighlights.length > 0 ? (
						reviewHighlights
							.slice(0, 3)
							.map((review) => renderReviewCard(review, { numberOfLines: 3 }))
					) : (
						<View style={styles.noReviewsBox}>
							<Text style={styles.noReviewsTitle}>
								{t("no_reviews_yet", "No reviews yet.")}
							</Text>
							<Text style={styles.noReviewsText}>
								{t(
									"be_first_to_rate_dish",
									"Be the first guest to help others know what to order.",
								)}
							</Text>
						</View>
					)}

					{reviewHighlights.length > 3 && (
						<TouchableOpacity
							style={styles.viewAllReviewsButton}
							activeOpacity={0.75}
							onPress={() => setIsAllReviewsVisible(true)}
						>
							<Text style={styles.viewAllReviewsText}>
								{t("view_all_reviews", "View all reviews")} (
								{reviewHighlights.length})
							</Text>
							<Ionicons
								name="chevron-forward"
								size={16}
								color={colors.primary}
							/>
						</TouchableOpacity>
					)}
				</View>
			</>
		);
	};

	const getReviewAuthor = (review = {}) =>
		review.customerId === currentUserData?.uid
			? t("you_label", "You")
			: review.customerDisplayName ||
				review.customerName ||
				t("scerv_guest", "Scerv guest");

	const getReviewTrustLabel = (review = {}) => {
		const level = String(review.verificationLevel || "").toLowerCase();
		if (level === "scerv_order_verified") {
			return t("scerv_order_verified_label", "Scerv order verified");
		}
		if (level === "receipt_verified") {
			return t("receipt_verified_label", "Receipt verified");
		}
		if (level === "location_verified") {
			return t("location_verified_label", "Visit verified");
		}
		if (level === "community_guest") {
			return t("community_guest_label", "Community guest");
		}
		return t("guest_rated_label", "Guest rated");
	};

	const renderMediaTile = (mediaItem, options = {}) => {
		const isVideo = mediaItem.type === "video";
		const imageSource = mediaItem.thumbnailUrl || mediaItem.url;

		return (
			<TouchableOpacity
				key={`${options.prefix || "media"}_${mediaItem.id}_${mediaItem.url}`}
				style={[
					styles.mediaTile,
					options.small ? styles.reviewMediaTile : null,
				]}
				activeOpacity={0.88}
				onPress={() => setSelectedMediaPreview(mediaItem)}
			>
				<Image source={{ uri: imageSource }} style={styles.mediaTileImage} />
				{isVideo && (
					<View style={styles.videoBadge}>
						<Ionicons name="play" size={12} color={colors.surfaceWhite} />
						<Text style={styles.videoBadgeText}>
							{t("video_label", "Video")}
						</Text>
					</View>
				)}
				{mediaItem.source === "customer" && !options.small && (
					<View style={styles.mediaSourceBadge}>
						<Text style={styles.mediaSourceText}>
							{t("guest_photo_label", "Guest")}
						</Text>
					</View>
				)}
			</TouchableOpacity>
		);
	};

	const renderDishMediaGallery = () => {
		if (dishGalleryMedia.length === 0) return null;

		return (
			<View style={styles.mediaGalleryContainer}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.mediaGalleryContent}
				>
					{dishGalleryMedia.map((mediaItem) =>
						renderMediaTile(mediaItem, { prefix: "dish_gallery" }),
					)}
				</ScrollView>
				<Text style={styles.mediaGalleryHint}>
					{t(
						"dish_media_gallery_hint",
						"Photos from the restaurant and guest reviews",
					)}
				</Text>
			</View>
		);
	};

	const renderReviewCard = (review, options = {}) => {
		const reviewText = review.reviewText || review.comment || "";
		const reviewMedia = getReviewMedia(review).slice(0, 4);
		if (!reviewText && reviewMedia.length === 0 && !options.showRatingOnly) {
			return null;
		}

		return (
			<View key={review.id} style={styles.reviewCard}>
				<View style={styles.reviewCardHeader}>
					<StarRatingDisplay rating={Number(review.ratingValue || 0)} size={12} />
					<View style={styles.reviewAuthorBlock}>
						<Text style={styles.reviewAuthorText}>{getReviewAuthor(review)}</Text>
						<Text style={styles.reviewTrustText}>
							{getReviewTrustLabel(review)}
						</Text>
					</View>
				</View>
				{reviewText ? (
					<Text
						style={styles.reviewQuoteText}
						numberOfLines={options.numberOfLines}
					>
						"{reviewText}"
					</Text>
				) : (
					<Text style={styles.reviewQuoteText}>
						{t("rating_only_review", "Rating only")}
					</Text>
				)}
				{reviewMedia.length > 0 && (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.reviewMediaRow}
					>
						{reviewMedia.map((mediaItem) =>
							renderMediaTile(mediaItem, {
								prefix: `review_${review.id}`,
								small: true,
							}),
						)}
					</ScrollView>
				)}
			</View>
		);
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			onRequestClose={onClose}
			transparent={true}
		>
			<View style={styles.modalOverlay}>
				<View style={[styles.modalContent, { maxHeight: modalMaxHeight }]}>
					<ScrollView
						style={[
							styles.modalScrollView,
							{ maxHeight: modalScrollMaxHeight },
						]}
						showsVerticalScrollIndicator={false}
						keyboardDismissMode="interactive"
						keyboardShouldPersistTaps="handled"
						contentContainerStyle={styles.scrollContainer}
					>
						<IconButton
							icon="close-circle"
							size={28}
							onPress={onClose}
							style={styles.closeButton}
							color={colors.textMedium}
						/>

						{renderDishMediaGallery()}

						<View style={styles.itemDetailsContainer}>
							<Text style={styles.itemName}>
								{getLocalizedText(selectedItem && selectedItem.name)}
							</Text>
							{restaurantName || selectedItem?.restaurantName ? (
								<Text style={styles.restaurantNameText}>
									{restaurantName || selectedItem.restaurantName}
								</Text>
							) : null}

							{!!(
								selectedItem &&
								(getLocalizedText(selectedItem.description) ||
									selectedItem.description)
							) && (
								<Text style={styles.itemDescription}>
									{getLocalizedText(selectedItem.description) ||
										selectedItem.description}
								</Text>
							)}

							<Text style={styles.itemPrice}>
								{formatCurrencyFromDollars(unitPriceWithModifiers)}
							</Text>

							{modifiersTotal > 0 && (
								<Text style={styles.modifiersTotalText}>
									{t("includes_modifiers_total", {
										total: formatCurrencyFromDollars(modifiersTotal),
										defaultValue: `Includes ${formatCurrencyFromDollars(modifiersTotal)} in selected add-ons`,
									})}
								</Text>
							)}
						</View>

						{canOpenDishReview && (
							<TouchableOpacity
								style={[
									styles.discoveryRatePrompt,
									currentUserReview ? styles.discoveryRatePromptDone : null,
								]}
								activeOpacity={0.78}
								onPress={openDishReviewModal}
							>
								<View style={styles.discoveryRateIconWrap}>
									<Ionicons
										name={
											currentUserReview
												? "checkmark-circle"
												: "star-outline"
										}
										size={22}
										color={
											currentUserReview
												? colors.success || "#16703F"
												: colors.primary
										}
									/>
								</View>
								<View style={styles.discoveryRateTextWrap}>
									<Text style={styles.discoveryRateTitle}>
										{currentUserReview
											? t("you_rated_this_dish", "You rated this dish")
											: t("rate_this_dish_title", "Rate this dish")}
									</Text>
									<Text style={styles.discoveryRateSubtitle}>
										{currentUserReview
											? t(
													"dish_rating_thanks_short",
													"Your rating is helping other guests decide.",
												)
											: t(
													"rate_dish_prompt_short",
													"Help other guests know if this is worth ordering.",
												)}
									</Text>
								</View>
								<Ionicons
									name="chevron-forward"
									size={18}
									color={colors.textMedium}
								/>
							</TouchableOpacity>
						)}

						{isOrderingAvailable ? (
							<>
								<Divider style={styles.divider} />

								<View style={styles.sectionContainer}>
							<Text style={styles.sectionTitle}>
								{t("quantity_title", "Quantity")}
							</Text>
							<View style={styles.quantitySelector}>
								<IconButton
									icon="minus-circle"
									size={32}
									onPress={() => setQuantity((q) => Math.max(1, q - 1))}
									color={quantity > 1 ? colors.primary : colors.textLight}
									disabled={quantity <= 1}
								/>
								<Text style={styles.quantityTextModal}>{quantity}</Text>
								<IconButton
									icon="plus-circle"
									size={32}
									onPress={() => setQuantity((q) => Math.min(10, q + 1))}
									color={quantity < 10 ? colors.primary : colors.textLight}
									disabled={quantity >= 10}
								/>
							</View>

							<View style={styles.totalPreviewBox}>
								<Text style={styles.totalPreviewLabel}>
									{t("item_total_label", "Item Total")}
								</Text>
								<Text style={styles.totalPreviewValue}>
									{formatCurrencyFromDollars(finalPrice)}
								</Text>
							</View>
								</View>

								<Divider style={styles.divider} />
							</>
						) : (
							<View style={styles.discoveryOnlyNotice}>
								<MaterialCommunityIcons
									name="silverware-clean"
									size={18}
									color={colors.primary}
								/>
								<Text style={styles.discoveryOnlyNoticeText}>
									{t(
										"discovery_only_dish_notice",
										"Ordering is not available here yet. You can still explore the dish and guest reviews.",
									)}
								</Text>
							</View>
						)}

						{isOrderingAvailable && modifierGroups.length > 0 && (
							<View style={styles.sectionContainer}>
								<Text style={styles.sectionTitle}>
									{t("customize_item_title", "Customize Item")}
								</Text>
								<Text style={styles.helpText}>
									{t(
										"customize_item_help_text",
										"Choose your options below. Required groups must be completed before adding to basket.",
									)}
								</Text>
							</View>
						)}

						{isOrderingAvailable ? modifierGroups.map(renderModifierGroup) : null}

						{isOrderingAvailable && orderingMode === "party" && (
							<View style={styles.sectionContainer}>
								<Text style={styles.sectionTitle}>
									{t("order_item_for_party_title", "Order this item for")}
								</Text>

								{displayOptions.map((option) => {
									const uniqueKey = option.id;
									const isSelected = orderTargets[0]?.id === uniqueKey;
									const targetObject = {
										...option,
										id: uniqueKey,
									};

									return (
										<View key={uniqueKey} style={styles.pipEntryContainer}>
											<TouchableOpacity
												style={styles.pipCheckboxItem}
												onPress={() =>
													handlePartyModeTargetSelection(targetObject)
												}
											>
												<MaterialCommunityIcons
													name={
														isSelected ? "radiobox-marked" : "radiobox-blank"
													}
													size={24}
													color={colors.primary}
												/>
												<View style={styles.pipTargetTextWrap}>
													<Text style={styles.pipNameText}>{option.name}</Text>
													<Text style={styles.pipCaptionText}>
														{getPartyTargetCaption(option)}
													</Text>
												</View>
											</TouchableOpacity>

											{isSelected && (
												<TouchableOpacity
													onPress={() =>
														openInstructionModalForTarget(orderTargets[0])
													}
													style={styles.editInstructionsButton}
												>
													<Ionicons
														name="pencil-outline"
														size={20}
														color={colors.primary}
													/>
													<Text style={styles.editInstructionsText}>
														{orderTargets[0].specialInstructions
															? t("edit_notes_button", "Edit notes")
															: t("add_notes_button", "Add notes")}
													</Text>
												</TouchableOpacity>
											)}
										</View>
									);
								})}

								{orderTargets.length > 0 && orderTargets[0] && (
									<TextInput
										style={styles.specialInstructionsInput}
										placeholder={t("special_instructions_for_pip_placeholder", {
											pipName: orderTargets[0].name,
											defaultValue: `Special instructions for ${orderTargets[0].name}`,
										})}
										value={orderTargets[0].specialInstructions}
										onChangeText={(text) =>
											setOrderTargets((prev) => [
												{ ...prev[0], specialInstructions: text },
											])
										}
										multiline
										numberOfLines={3}
										blurOnSubmit
										inputAccessoryViewID={keyboardAccessoryId}
										returnKeyType="done"
										onSubmitEditing={Keyboard.dismiss}
										placeholderTextColor={colors.textLight}
									/>
								)}
							</View>
						)}

						{isOrderingAvailable && orderingMode === "individual" && (
							<View style={styles.sectionContainer}>
								<View style={styles.sectionHeaderWithHelp}>
									<Text style={styles.sectionTitle}>
										{t(
											"order_for_select_all_that_apply_title",
											"Who is this for?",
										)}
									</Text>
								</View>

								<Text style={styles.managePipsHintText}>
									{t(
										"not_eating_alone_hint",
										"Select one or more people for this item.",
									)}
								</Text>

								<Button
									icon="account-multiple-plus-outline"
									mode="text"
									onPress={() => {
										onClose();
										navigation.navigate("AccountScreen", {
											screen: "PipsScreenInner",
										});
									}}
									style={styles.managePipsButton}
									labelStyle={{ color: colors.primary, fontSize: 14 }}
								>
									{t("manage_pips_button", "Manage PIPs")}
								</Button>

								{displayOptions.map((target) => {
									const currentSelection = orderTargets.find(
										(t) => t.id === target.id,
									);
									const isSelected = !!currentSelection;

									return (
										<View key={target.id} style={styles.pipEntryContainer}>
											<TouchableOpacity
												style={styles.pipCheckboxItem}
												onPress={() => toggleIndividualTargetSelection(target)}
											>
												<MaterialCommunityIcons
													name={
														isSelected
															? "checkbox-marked-circle"
															: "checkbox-blank-circle-outline"
													}
													size={24}
													color={colors.primary}
												/>
												<Text style={styles.pipNameText}>{target.name}</Text>
											</TouchableOpacity>

											{isSelected && (
												<TouchableOpacity
													onPress={() => openInstructionModalForTarget(target)}
													style={styles.editInstructionsButton}
												>
													<Ionicons
														name="pencil-outline"
														size={20}
														color={colors.primary}
													/>
													<Text style={styles.editInstructionsText}>
														{currentSelection.specialInstructions
															? t("edit_notes_button", "Edit notes")
															: t("add_notes_button", "Add notes")}
													</Text>
												</TouchableOpacity>
											)}
										</View>
									);
								})}

								{displayOptions.length === 0 && (
									<Text style={styles.noPipsText}>
										{t(
											"no_pips_message",
											"No PIPs available yet. Add one from your account screen.",
										)}
									</Text>
								)}
							</View>
						)}

						{renderGuestSignals()}
					</ScrollView>

					<View style={styles.modalActionButtonsContainer}>
						<Button
							onPress={onClose}
							mode="outlined"
							style={styles.modalActionButton}
							labelStyle={{ color: colors.textDark, fontSize: 16 }}
						>
							{t("cancel_button", "Cancel")}
						</Button>

						<Button
							onPress={handleConfirmPress}
							mode="contained"
							style={[
								styles.modalActionButton,
								{ backgroundColor: colors.primary },
							]}
							labelStyle={{ color: colors.textOnPrimaryBrand, fontSize: 16 }}
							disabled={isLoading}
							loading={isLoading}
						>
							{!isOrderingAvailable && onViewRestaurant
								? t("view_restaurant", "View Restaurant")
								: !isOrderingAvailable
									? t("close_button", "Close")
								: t("add_button", "Add")}
						</Button>
					</View>
				</View>
			</View>
			{Platform.OS === "ios" ? (
				<InputAccessoryView nativeID={keyboardAccessoryId}>
					<View style={styles.keyboardAccessory}>
						<TouchableOpacity
							style={styles.keyboardDoneButton}
							onPress={Keyboard.dismiss}
						>
							<Text style={styles.keyboardDoneText}>Done</Text>
						</TouchableOpacity>
					</View>
				</InputAccessoryView>
			) : null}

			{editingTargetForInstructions && (
				<PipInstructionModal
					visible={isPipInstructionModalVisible}
					onClose={() => setIsPipInstructionModalVisible(false)}
					pipName={editingTargetForInstructions.name}
					initialInstructions={editingTargetForInstructions.currentInstructions}
					onSaveInstructions={handleSaveTargetInstructions}
				/>
			)}

			<Modal
				visible={isAllReviewsVisible}
				animationType="slide"
				transparent={true}
				onRequestClose={() => setIsAllReviewsVisible(false)}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.allReviewsModalContent}>
						<View style={styles.allReviewsHeader}>
							<View style={styles.allReviewsTitleBlock}>
								<Text style={styles.allReviewsTitle}>
									{t("all_reviews_title", "All reviews")}
								</Text>
								<Text style={styles.allReviewsSubtitle} numberOfLines={1}>
									{getLocalizedText(selectedItem && selectedItem.name)}
								</Text>
							</View>
							<IconButton
								icon="close-circle"
								size={28}
								onPress={() => setIsAllReviewsVisible(false)}
								color={colors.textMedium}
							/>
						</View>

						{ratingSummary.averageRating > 0 && (
							<View style={styles.allReviewsSummary}>
								<StarRatingDisplay rating={ratingSummary.averageRating} size={14} />
								<Text style={styles.ratingSummaryText}>
									{ratingSummary.averageRating.toFixed(1)}
								</Text>
								<Text style={styles.reviewMetaText}>
									{ratingSummary.ratingCount}{" "}
									{ratingSummary.ratingCount === 1
										? t("rating", "rating")
										: t("ratings", "ratings")}
								</Text>
							</View>
						)}

						<ScrollView
							showsVerticalScrollIndicator={false}
							keyboardDismissMode="interactive"
							keyboardShouldPersistTaps="handled"
							contentContainerStyle={styles.allReviewsScrollContent}
						>
							{reviewHighlights.length > 0 ? (
								reviewHighlights.map((review) =>
									renderReviewCard(review, { showRatingOnly: true }),
								)
							) : (
								<Text style={styles.reviewMetaText}>
									{t("no_reviews_yet", "No reviews yet.")}
								</Text>
							)}
						</ScrollView>
					</View>
				</View>
			</Modal>

			<Modal
				visible={isReviewModalVisible}
				animationType="slide"
				transparent={true}
				onRequestClose={() => setIsReviewModalVisible(false)}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.communityReviewModalContent}>
						<View style={styles.communityReviewHeader}>
							<View style={styles.allReviewsTitleBlock}>
								<Text style={styles.allReviewsTitle}>
									{t("rate_this_dish_title", "Rate this dish")}
								</Text>
								<Text style={styles.allReviewsSubtitle} numberOfLines={1}>
									{getLocalizedText(selectedItem && selectedItem.name)}
								</Text>
							</View>
							<IconButton
								icon="close-circle"
								size={28}
								onPress={() => setIsReviewModalVisible(false)}
								color={colors.textMedium}
							/>
						</View>

						<InteractiveStarRating
							rating={communityRating}
							onRate={setCommunityRating}
							size={32}
						/>

						<TextInput
							style={styles.communityReviewInput}
							placeholder={t(
								"community_review_placeholder",
								"What should other guests know about this dish?",
							)}
							value={communityReviewText}
							onChangeText={setCommunityReviewText}
							multiline
							numberOfLines={4}
							blurOnSubmit
							inputAccessoryViewID={keyboardAccessoryId}
							returnKeyType="done"
							onSubmitEditing={Keyboard.dismiss}
							placeholderTextColor={colors.textLight}
						/>

						<View style={styles.communityReviewTagRow}>
							{COMMUNITY_REVIEW_TAGS.map((tag) => {
								const isSelected = communityReviewTags.includes(tag);
								return (
									<TouchableOpacity
										key={tag}
										style={[
											styles.communityReviewTag,
											isSelected && styles.communityReviewTagSelected,
										]}
										activeOpacity={0.75}
										onPress={() => toggleCommunityReviewTag(tag)}
									>
										<Text
											style={[
												styles.communityReviewTagText,
												isSelected && styles.communityReviewTagTextSelected,
											]}
										>
											{tag}
										</Text>
									</TouchableOpacity>
								);
							})}
						</View>

						<Text style={styles.communityReviewTrustText}>
							{t(
								"community_review_trust_note",
								"Community ratings help Scerv discovery. Verified visit and order signals can be added later.",
							)}
						</Text>

						<Button
							mode="contained"
							onPress={submitCommunityReview}
							loading={isSubmittingCommunityReview}
							disabled={isSubmittingCommunityReview}
							style={styles.communityReviewSubmitButton}
							labelStyle={{ color: colors.textOnPrimaryBrand, fontSize: 15 }}
						>
							{t("submit_review_button", "Submit review")}
						</Button>
					</View>
				</View>
			</Modal>

			<Modal
				visible={!!selectedMediaPreview}
				animationType="fade"
				transparent={true}
				onRequestClose={() => setSelectedMediaPreview(null)}
			>
				<View style={styles.mediaPreviewOverlay}>
					<TouchableOpacity
						style={styles.mediaPreviewBackdrop}
						activeOpacity={1}
						onPress={() => setSelectedMediaPreview(null)}
					/>
					<View style={styles.mediaPreviewContent}>
						<TouchableOpacity
							style={styles.mediaPreviewCloseButton}
							onPress={() => setSelectedMediaPreview(null)}
							activeOpacity={0.8}
						>
							<Ionicons name="close" size={26} color={colors.surfaceWhite} />
						</TouchableOpacity>
						{selectedMediaPreview?.type === "video" && (
							<View style={styles.mediaPreviewVideoBadge}>
								<Ionicons name="play" size={14} color={colors.surfaceWhite} />
								<Text style={styles.mediaPreviewVideoText}>
									{t("video_review_preview_label", "Video preview")}
								</Text>
							</View>
						)}
						<Image
							source={{
								uri:
									selectedMediaPreview?.thumbnailUrl ||
									selectedMediaPreview?.url,
							}}
							style={styles.mediaPreviewImage}
						/>
						{!!selectedMediaPreview?.caption && (
							<Text style={styles.mediaPreviewCaption} numberOfLines={2}>
								{selectedMediaPreview.caption}
							</Text>
						)}
					</View>
				</View>
			</Modal>
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
		backgroundColor: colors.surfaceWhite,
		padding: 0,
		borderRadius: 12,
		width: "92%",
		maxHeight: "92%",
		flexShrink: 1,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalScrollView: {
		flexShrink: 1,
	},
	keyboardAccessory: {
		minHeight: 44,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		alignItems: "flex-end",
		justifyContent: "center",
		paddingHorizontal: 12,
	},
	keyboardDoneButton: {
		minHeight: 36,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	keyboardDoneText: {
		color: colors.primary,
		fontWeight: "900",
		fontSize: 16,
	},
	scrollContainer: {
		paddingHorizontal: 20,
		paddingTop: 38,
		paddingBottom: 18,
	},
	closeButton: {
		position: "absolute",
		top: 10,
		right: 10,
		zIndex: 1,
	},
	itemDetailsContainer: {
		alignItems: "center",
		marginBottom: 15,
	},
	discoveryRatePrompt: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#F3FBFB",
		borderWidth: 1,
		borderColor: "#D4EAEA",
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 11,
		marginBottom: 14,
	},
	discoveryRatePromptDone: {
		backgroundColor: "#EAF7EF",
		borderColor: "#BBF7D0",
	},
	discoveryRateIconWrap: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: colors.surfaceWhite,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	discoveryRateTextWrap: {
		flex: 1,
		paddingRight: 8,
	},
	discoveryRateTitle: {
		color: colors.textDark,
		fontSize: 14,
		fontWeight: "900",
		marginBottom: 2,
	},
	discoveryRateSubtitle: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "700",
		lineHeight: 16,
	},
	mediaGalleryContainer: {
		marginHorizontal: -20,
		marginTop: -8,
		marginBottom: 18,
	},
	mediaGalleryContent: {
		paddingHorizontal: 20,
		paddingRight: 28,
	},
	mediaTile: {
		width: 210,
		height: 145,
		borderRadius: 12,
		overflow: "hidden",
		backgroundColor: colors.backgroundLight,
		marginRight: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	mediaTileImage: {
		width: "100%",
		height: "100%",
		resizeMode: "cover",
	},
	videoBadge: {
		position: "absolute",
		left: 8,
		top: 8,
		borderRadius: 999,
		backgroundColor: "rgba(0, 0, 0, 0.68)",
		paddingHorizontal: 8,
		paddingVertical: 5,
		flexDirection: "row",
		alignItems: "center",
	},
	videoBadgeText: {
		color: colors.surfaceWhite,
		fontSize: 11,
		fontWeight: "900",
		marginLeft: 4,
	},
	mediaSourceBadge: {
		position: "absolute",
		right: 8,
		bottom: 8,
		borderRadius: 999,
		backgroundColor: "rgba(255, 255, 255, 0.92)",
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	mediaSourceText: {
		color: colors.textDark,
		fontSize: 11,
		fontWeight: "900",
	},
	mediaGalleryHint: {
		paddingHorizontal: 20,
		marginTop: 8,
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
	},
	mediaPreviewOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.92)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 14,
		paddingVertical: 24,
	},
	mediaPreviewBackdrop: {
		...StyleSheet.absoluteFillObject,
	},
	mediaPreviewContent: {
		width: "100%",
		maxHeight: "88%",
		alignItems: "center",
		justifyContent: "center",
	},
	mediaPreviewCloseButton: {
		position: "absolute",
		top: 0,
		right: 4,
		zIndex: 2,
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "rgba(255, 255, 255, 0.16)",
		alignItems: "center",
		justifyContent: "center",
	},
	mediaPreviewImage: {
		width: "100%",
		height: "82%",
		resizeMode: "contain",
		borderRadius: 10,
	},
	mediaPreviewCaption: {
		marginTop: 12,
		paddingHorizontal: 18,
		color: colors.surfaceWhite,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: "700",
		textAlign: "center",
	},
	mediaPreviewVideoBadge: {
		position: "absolute",
		top: 8,
		left: 4,
		zIndex: 2,
		borderRadius: 999,
		backgroundColor: "rgba(255, 255, 255, 0.18)",
		paddingHorizontal: 10,
		paddingVertical: 7,
		flexDirection: "row",
		alignItems: "center",
	},
	mediaPreviewVideoText: {
		marginLeft: 5,
		color: colors.surfaceWhite,
		fontSize: 12,
		fontWeight: "900",
	},
	itemName: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		textAlign: "center",
		marginBottom: 6,
	},
	restaurantNameText: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.primary,
		marginBottom: 8,
		textAlign: "center",
	},
	itemDescription: {
		fontSize: 14,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 8,
	},
	itemPrice: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary,
	},
	modifiersTotalText: {
		marginTop: 6,
		fontSize: 13,
		color: colors.textMedium,
		textAlign: "center",
	},
	discoveryOnlyNotice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		backgroundColor: "#EAF5F5",
		borderColor: "#D4EAEA",
		borderWidth: 1,
		borderRadius: 8,
		padding: 12,
		marginTop: 4,
		marginBottom: 15,
	},
	discoveryOnlyNoticeText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "700",
		color: colors.textMedium,
	},
	starRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	interactiveStarRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 14,
	},
	interactiveStarButton: {
		paddingHorizontal: 3,
		paddingVertical: 5,
	},
	starIcon: {
		marginRight: 1,
	},
	divider: {
		marginVertical: 15,
		backgroundColor: colors.borderLight,
	},
	sectionContainer: {
		marginBottom: 15,
	},
	sectionHeaderWithHelp: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	sectionTitle: {
		fontSize: 17,
		fontWeight: "600",
		color: colors.textDark,
		marginBottom: 10,
	},
	reviewSummaryHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 10,
	},
	reviewHeaderActions: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		flexShrink: 1,
		flexWrap: "wrap",
		gap: 8,
	},
	rateDishButton: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 999,
		backgroundColor: colors.primary + "12",
		borderWidth: 1,
		borderColor: colors.primary + "30",
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	rateDishButtonDisabled: {
		backgroundColor: "#EAF7EF",
		borderColor: "#BBF7D0",
	},
	rateDishButtonText: {
		marginLeft: 4,
		fontSize: 12,
		fontWeight: "900",
		color: colors.primary,
	},
	rateDishButtonTextDisabled: {
		color: colors.success || "#16703F",
	},
	ratingSummaryPill: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 999,
		backgroundColor: "#FFF7E6",
		paddingHorizontal: 8,
		paddingVertical: 5,
	},
	ratingSummaryText: {
		marginLeft: 4,
		fontSize: 12,
		fontWeight: "800",
		color: colors.textDark,
	},
	scervScorePill: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 999,
		backgroundColor: colors.primary + "12",
		paddingHorizontal: 8,
		paddingVertical: 5,
	},
	scervScorePillText: {
		marginLeft: 4,
		fontSize: 12,
		fontWeight: "900",
		color: colors.primary,
	},
	reviewMetaText: {
		fontSize: 13,
		color: colors.textMedium,
		fontWeight: "700",
		marginBottom: 10,
	},
	reviewTagRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: 8,
	},
	reviewTag: {
		borderRadius: 999,
		backgroundColor: colors.primary + "12",
		color: colors.primary,
		fontSize: 12,
		fontWeight: "800",
		paddingHorizontal: 9,
		paddingVertical: 5,
		marginRight: 6,
		marginBottom: 6,
		textTransform: "capitalize",
	},
	reviewCard: {
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		padding: 10,
		marginTop: 8,
	},
	reviewCardHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 6,
	},
	reviewAuthorText: {
		fontSize: 12,
		color: colors.textMedium,
		fontWeight: "700",
		textAlign: "right",
	},
	reviewAuthorBlock: {
		flex: 1,
		marginLeft: 8,
		alignItems: "flex-end",
	},
	reviewTrustText: {
		marginTop: 2,
		fontSize: 10,
		color: colors.primary,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	reviewQuoteText: {
		fontSize: 13,
		lineHeight: 18,
		color: colors.textDark,
		fontWeight: "600",
	},
	noReviewsBox: {
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		padding: 12,
	},
	noReviewsTitle: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textDark,
		marginBottom: 4,
	},
	noReviewsText: {
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "600",
		color: colors.textMedium,
	},
	reviewMediaRow: {
		paddingTop: 10,
		paddingRight: 8,
	},
	reviewMediaTile: {
		width: 88,
		height: 74,
		borderRadius: 8,
		marginRight: 8,
	},
	viewAllReviewsButton: {
		marginTop: 10,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 10,
		backgroundColor: colors.lightBlue || "#EEF6FF",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	viewAllReviewsText: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.primary,
	},
	allReviewsModalContent: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		width: "90%",
		maxHeight: "82%",
		paddingHorizontal: 18,
		paddingTop: 10,
		paddingBottom: 16,
	},
	allReviewsHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	allReviewsTitleBlock: {
		flex: 1,
		paddingRight: 12,
	},
	allReviewsTitle: {
		fontSize: 19,
		fontWeight: "800",
		color: colors.textDark,
	},
	allReviewsSubtitle: {
		marginTop: 2,
		fontSize: 13,
		color: colors.textMedium,
	},
	allReviewsSummary: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginBottom: 10,
	},
	allReviewsScrollContent: {
		paddingBottom: 6,
	},
	communityReviewModalContent: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		width: "90%",
		maxHeight: "86%",
		paddingHorizontal: 18,
		paddingTop: 12,
		paddingBottom: 16,
	},
	communityReviewHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 6,
	},
	communityReviewInput: {
		width: "100%",
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 14,
		color: colors.textDark,
		minHeight: 105,
		textAlignVertical: "top",
	},
	communityReviewTagRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: 12,
		marginBottom: 6,
	},
	communityReviewTag: {
		borderRadius: 999,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		paddingHorizontal: 10,
		paddingVertical: 7,
		marginRight: 7,
		marginBottom: 7,
	},
	communityReviewTagSelected: {
		backgroundColor: colors.primary + "12",
		borderColor: colors.primary,
	},
	communityReviewTagText: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "800",
		textTransform: "capitalize",
	},
	communityReviewTagTextSelected: {
		color: colors.primary,
	},
	communityReviewTrustText: {
		color: colors.textMedium,
		fontSize: 12,
		fontWeight: "600",
		lineHeight: 17,
		marginBottom: 12,
	},
	communityReviewSubmitButton: {
		backgroundColor: colors.primary,
		borderRadius: 8,
	},
	groupDescription: {
		fontSize: 13,
		color: colors.textMedium,
		marginBottom: 6,
	},
	groupMetaText: {
		fontSize: 12,
		color: colors.textMedium,
		marginBottom: 10,
	},
	quantitySelector: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginVertical: 10,
	},
	quantityTextModal: {
		fontSize: 22,
		fontWeight: "bold",
		color: colors.textDark,
		minWidth: 40,
		textAlign: "center",
		marginHorizontal: 15,
	},
	totalPreviewBox: {
		marginTop: 10,
		padding: 12,
		borderRadius: 10,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	totalPreviewLabel: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textDark,
	},
	totalPreviewValue: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.primary,
	},
	helpText: {
		fontSize: 13,
		color: colors.textMedium,
		fontStyle: "italic",
		textAlign: "left",
		marginBottom: 10,
	},
	managePipsButton: {
		alignSelf: "center",
		marginVertical: 8,
	},
	managePipsHintText: {
		fontSize: 12,
		color: colors.textMedium,
		textAlign: "center",
		marginBottom: 10,
	},
	pipEntryContainer: {
		marginBottom: 5,
	},
	pipCheckboxItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
	},
	pipNameText: {
		fontSize: 16,
		color: colors.textDark,
		marginLeft: 10,
	},
	pipTargetTextWrap: {
		flex: 1,
		marginLeft: 10,
	},
	pipCaptionText: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	editInstructionsButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 4,
		paddingLeft: 34,
		marginTop: -5,
	},
	editInstructionsText: {
		fontSize: 13,
		color: colors.primary,
		marginLeft: 5,
		textDecorationLine: "underline",
	},
	noPipsText: {
		fontSize: 14,
		textAlign: "center",
		color: colors.textMedium,
		fontStyle: "italic",
		marginTop: 5,
	},
	modalActionButtonsContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		paddingTop: 12,
		paddingBottom: 14,
		paddingHorizontal: 15,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		flexShrink: 0,
	},
	modalActionButton: {
		flex: 1,
		marginHorizontal: 8,
		borderRadius: 8,
	},
	modalButton: {
		flex: 1,
		marginHorizontal: 8,
		borderRadius: 8,
	},
	modalButtonRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		width: "100%",
		marginTop: 20,
	},
	pipInstructionModalContent: {
		backgroundColor: colors.surfaceWhite,
		padding: 20,
		borderRadius: 10,
		width: "90%",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center",
		color: colors.textDark,
	},
	specialInstructionsInput: {
		width: "100%",
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
		color: colors.textDark,
		marginTop: 5,
		height: 100,
		textAlignVertical: "top",
	},
	modifierOptionRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderRadius: 10,
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginBottom: 8,
	},
	modifierOptionRowSelected: {
		borderColor: colors.primary,
		backgroundColor: colors.primary + "10",
	},
	modifierOptionLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		marginRight: 10,
	},
	modifierOptionTextWrap: {
		marginLeft: 10,
		flex: 1,
	},
	modifierOptionName: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textDark,
	},
	modifierOptionCategory: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	modifierOptionPrice: {
		fontSize: 14,
		fontWeight: "700",
		color: colors.primary,
	},
	groupSelectionSummary: {
		marginTop: 2,
		marginBottom: 4,
	},
	groupSelectionSummaryText: {
		fontSize: 12,
		color: colors.textMedium,
	},
});

export default SelectedItemModal;
