// screens/restaurant/ServerMenuScreen.js
import React, {
	useState,
	useEffect,
	useContext,
	useCallback,
	useMemo,
} from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	SafeAreaView,
	Alert,
	TouchableOpacity,
	ScrollView,
	Modal,
	TextInput,
	KeyboardAvoidingView,
	Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { AuthContext } from "../../context/authContext";
import { fetchMenu } from "../../utils/customerUtils";
import MenuItemsList from "../../components/customer/MenuItemsList";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";
import { functions } from "../../config/firebase.native";
import { httpsCallable } from "@react-native-firebase/functions";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { formatCurrencyFromDollars } from "../../utils/currencyFormatter";

const ServerMenuScreen = () => {
	const { t } = useTranslation();
	const route = useRoute();
	const navigation = useNavigation();

	const {
		partyId,
		restaurantId,
		tableName,
		tableId,
		serverObj,
		partySeats = [],
	} = route.params;
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();

	const [menuItems, setMenuItems] = useState([]);
	const [isLoadingMenu, setIsLoadingMenu] = useState(true);
	const [quickDraftItems, setQuickDraftItems] = useState([]);
	const [customizedItems, setCustomizedItems] = useState([]);
	const [isAddingBulk, setIsAddingBulk] = useState(false);
	const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
	const [isPendingTrayCollapsed, setIsPendingTrayCollapsed] = useState(true);
	const [seatOptions, setSeatOptions] = useState(() => {
		const normalizedSeats = Array.isArray(partySeats)
			? partySeats.filter((seat) => seat?.id && seat?.name)
			: [];
		return normalizedSeats.length > 0
			? normalizedSeats
			: [{ id: "seat_1", name: "Seat 1" }];
	});
	const [selectedSeatId, setSelectedSeatId] = useState(
		seatOptions[0]?.id || "seat_1",
	);
	const [isSeatModalVisible, setIsSeatModalVisible] = useState(false);
	const [newSeatName, setNewSeatName] = useState("");

	const [selectedCategory, setSelectedCategory] = useState("All");
	const selectedSeat =
		seatOptions.find((seat) => seat.id === selectedSeatId) || seatOptions[0];

	useEffect(() => {
		const loadMenu = async () => {
			if (!restaurantId) {
				Alert.alert(
					t("error", "Error"),
					t("missing_restaurant_id", "Missing Restaurant ID"),
				);
				navigation.goBack();
				return;
			}

			try {
				const fetchedMenu = await fetchMenu(restaurantId);
				setMenuItems(Array.isArray(fetchedMenu) ? fetchedMenu : []);
			} catch (error) {
				console.error("ServerMenuScreen: Error fetching menu:", error);
				Alert.alert(
					t("error", "Error"),
					t("could_not_load_menu_items", "Could not load menu."),
				);
			} finally {
				setIsLoadingMenu(false);
			}
		};

		loadMenu();
	}, [restaurantId, navigation, t]);

	const categories = useMemo(() => {
		const uniqueCategories = Array.from(
			new Set(
				(menuItems || [])
					.map((item) => item?.category || "Other")
					.filter(Boolean),
			),
		).sort((a, b) => String(a).localeCompare(String(b)));

		return ["All", ...uniqueCategories];
	}, [menuItems]);

	const filteredMenuItems = useMemo(() => {
		if (selectedCategory === "All") return menuItems || [];

		return (menuItems || []).filter(
			(item) => (item?.category || "Other") === selectedCategory,
		);
	}, [menuItems, selectedCategory]);

	const getCategoryCount = useCallback(
		(category) => {
			if (category === "All") return menuItems.length;
			return menuItems.filter(
				(item) => (item?.category || "Other") === category,
			).length;
		},
		[menuItems],
	);

	const getCategoryVisual = useCallback((category) => {
		const normalized = String(category || "")
			.trim()
			.toLowerCase();

		if (normalized === "all") {
			return {
				icon: "apps-outline",
				bg: "#E8F1FF",
				iconColor: "#2563EB",
			};
		}

		if (
			[
				"beer",
				"wine",
				"cocktails",
				"spirits",
				"alcoholic drinks",
				"beverages",
				"drinks",
				"juices",
				"non-alcoholic drinks",
				"sodas",
				"coffee",
				"tea",
			].includes(normalized)
		) {
			return {
				icon: "wine-outline",
				bg: "#FFF1F2",
				iconColor: "#E11D48",
			};
		}

		if (
			["appetizers", "entrees", "mains", "main dishes"].includes(normalized)
		) {
			return {
				icon: "restaurant-outline",
				bg: "#ECFDF5",
				iconColor: "#059669",
			};
		}

		if (["desserts"].includes(normalized)) {
			return {
				icon: "ice-cream-outline",
				bg: "#FFF7ED",
				iconColor: "#EA580C",
			};
		}

		if (["sides"].includes(normalized)) {
			return {
				icon: "fast-food-outline",
				bg: "#FEFCE8",
				iconColor: "#CA8A04",
			};
		}

		if (["extras", "sauces", "add-ons", "addons"].includes(normalized)) {
			return {
				icon: "add-circle-outline",
				bg: "#F5F3FF",
				iconColor: "#7C3AED",
			};
		}

		if (["specials", "combos"].includes(normalized)) {
			return {
				icon: "star-outline",
				bg: "#EFF6FF",
				iconColor: "#1D4ED8",
			};
		}

		return {
			icon: "grid-outline",
			bg: "#F3F4F6",
			iconColor: "#4B5563",
		};
	}, []);

	const removeCustomizedItem = useCallback((indexToRemove) => {
		setCustomizedItems((prev) =>
			prev.filter((_, index) => index !== indexToRemove),
		);
	}, []);

	const selectedItems = useMemo(() => {
		return quickDraftItems.reduce((selectedMap, draftItem) => {
			if (draftItem?.seat?.id === selectedSeat?.id) {
				selectedMap[draftItem.menuItemId] = true;
			}
			return selectedMap;
		}, {});
	}, [quickDraftItems, selectedSeat?.id]);

	const removeQuickSelectedItem = useCallback((draftKey) => {
		setQuickDraftItems((prev) =>
			prev.filter((draftItem) => draftItem.key !== draftKey),
		);
	}, []);

	const pendingPreviewItems = useMemo(() => {
		const quickPreview = quickDraftItems.map((draftItem) => ({
				type: "quick",
				key: draftItem.key,
				id: draftItem.menuItemId,
				name: draftItem.name,
				quantity: 1,
				seat: draftItem.seat,
				modifiers: [],
				price: draftItem.price || 0,
			}));

		const customPreview = customizedItems.map((customItem, index) => ({
			type: "custom",
			key: `custom-${index}`,
			index,
			id: customItem?.menuItemDetails?.id || `custom-${index}`,
			name: customItem?.menuItemDetails?.name || t("item", "Item"),
			quantity: customItem?.quantity || 1,
			seat: customItem?.orderedForSeat || selectedSeat,
			modifiers: Array.isArray(customItem?.menuItemDetails?.selectedModifiers)
				? customItem.menuItemDetails.selectedModifiers
				: [],
			price:
				customItem?.menuItemDetails?.finalUnitPrice !== undefined &&
				customItem?.menuItemDetails?.finalUnitPrice !== null
					? customItem.menuItemDetails.finalUnitPrice
					: customItem?.menuItemDetails?.price || 0,
		}));

		return [...quickPreview, ...customPreview];
	}, [quickDraftItems, selectedSeat, customizedItems, t]);

	const toggleItemSelection = useCallback((itemId) => {
		const menuItem = menuItems.find((item) => item.id === itemId);
		if (!menuItem) return;

		const seat = selectedSeat || { id: "seat_1", name: "Seat 1" };
		const draftKey = `quick-${seat.id}-${itemId}`;

		setQuickDraftItems((prev) => {
			const isSelectedForSeat = prev.some(
				(draftItem) => draftItem.key === draftKey,
			);

			if (isSelectedForSeat) {
				return prev.filter((draftItem) => draftItem.key !== draftKey);
			}

			return [
				...prev,
				{
					key: draftKey,
					menuItemId: itemId,
					name: menuItem.name,
					price: menuItem.price || 0,
					seat,
				},
			];
		});
	}, [menuItems, selectedSeat]);

	const handleServerAddItem = async (itemDataFromModal) => {
		setCustomizedItems((prev) => [
			...prev,
			{
				...itemDataFromModal,
				orderedForSeat: selectedSeat || { id: "seat_1", name: "Seat 1" },
			},
		]);
	};

	const handleAddSeat = () => {
		const trimmedSeatName = newSeatName.trim();
		const seatNumber = seatOptions.length + 1;
		const seatName = trimmedSeatName || `Seat ${seatNumber}`;
		const generatedSeatId = seatName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");
		const seatId = generatedSeatId || `seat_${seatNumber}`;

		if (seatOptions.some((seat) => seat.id === seatId)) {
			setSelectedSeatId(seatId);
			setIsSeatModalVisible(false);
			setNewSeatName("");
			return;
		}

		const nextSeat = { id: seatId, name: seatName };
		setSeatOptions((prev) => [...prev, nextSeat]);
		setSelectedSeatId(nextSeat.id);
		setIsSeatModalVisible(false);
		setNewSeatName("");
	};

	const handleBulkServerAddItem = async () => {
		if (quickDraftItems.length === 0 && customizedItems.length === 0) return;

		setIsAddingBulk(true);

		const { guestName } = route.params;
		const staffName =
			activeSession?.name ||
			`${activeSession?.firstName || ""} ${
				activeSession?.lastName || ""
			}`.trim() ||
			`${currentUserData?.firstName || ""} ${
				currentUserData?.lastName || ""
			}`.trim() ||
			"Server";
		const selectedOrderSeatIds = [
			...quickDraftItems.map((item) => item.seat?.id),
			...customizedItems.map((item) => (item.orderedForSeat || selectedSeat)?.id),
		].filter(Boolean);
		const hasMultipleSeats = new Set(selectedOrderSeatIds).size > 1;
		const displayName = hasMultipleSeats
			? "Multiple Seats"
			: selectedSeat?.name || guestName || tableName || "Table";
		try {
			const quickItemsPayload = quickDraftItems.map((item) => ({
				menuItemId: item.menuItemId,
				selectedModifiers: [],
				quantity: 1,
				specialInstructions: "",
				orderedForSeat:
					item.seat ||
					{ id: "seat_1", name: displayName },
			}));

			const customItemsPayload = customizedItems.map((customItem) => ({
				menuItemId: customItem?.menuItemDetails?.id,
				selectedModifiers: Array.isArray(
					customItem?.menuItemDetails?.selectedModifiers,
				)
					? customItem.menuItemDetails.selectedModifiers
					: [],
				quantity: customItem?.quantity || 1,
				specialInstructions: customItem?.specialInstructions || "",
				orderedForSeat:
					customItem?.orderedForSeat ||
					selectedSeat ||
					{ id: "seat_1", name: displayName },
			}));

			const allItemsToFire = [...quickItemsPayload, ...customItemsPayload];

			console.log(
				"[SERVER MENU STAFF ORDER PAYLOAD]",
				JSON.stringify(allItemsToFire, null, 2),
			);

			const addStaffItemsToPartyAndSendToKitchen = httpsCallable(
				functions,
				"addStaffItemsToPartyAndSendToKitchen",
			);

			await addStaffItemsToPartyAndSendToKitchen({
				partyId,
				restaurantId,
				table: { id: tableId, name: tableName },
				server: serverObj || {
					id: activeSession?.id || currentUserData.uid,
					name: staffName,
				},
				staff: {
					id: activeSession?.id || currentUserData.uid,
					name: staffName,
				},
				orderedForName: displayName,
				orderedForSeat: selectedSeat || { id: "seat_1", name: displayName },
				items: allItemsToFire,
			});

			setQuickDraftItems([]);
			setCustomizedItems([]);

			setSnackbar({
				visible: true,
				message: t("items_sent_to_kitchen_success", {
					count: allItemsToFire.length,
					defaultValue: `${allItemsToFire.length} items sent to kitchen!`,
				}),
			});

			setTimeout(() => {
				navigation.goBack();
			}, 700);
		} catch (error) {
			console.error("Error batch adding items: ", error);
			Alert.alert(
				t("error", "Error"),
				t("failed_to_add", "Failed to send items to the kitchen."),
			);
		} finally {
			setIsAddingBulk(false);
		}
	};

	if (isLoadingMenu) {
		return (
			<SafeAreaView style={styles.centeredScreen}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>
					{t("loading_menu", "Loading Menu...")}
				</Text>
			</SafeAreaView>
		);
	}

	const selectedCount = quickDraftItems.length;
	const totalPendingCount = selectedCount + customizedItems.length;

	return (
		<SafeAreaView style={styles.screen}>
			<View style={styles.topNav}>
				<View style={styles.orderContext}>
					<Text style={styles.orderEyebrow}>
						{t("server_ordering_title", "Add to Table")}
					</Text>
					<Text style={styles.orderTableName} numberOfLines={1}>
						{tableName}
					</Text>
				</View>
				<TouchableOpacity
					onPress={() => navigation.goBack()}
					style={styles.closeBtn}
				>
					<Ionicons name="chevron-down" size={20} color={colors.textDark} />
					<Text style={styles.closeText}>{t("done", "Done")}</Text>
				</TouchableOpacity>
			</View>

			<View style={styles.categorySection}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.categoryScrollContent}
				>
					{categories.map((category) => {
						const visual = getCategoryVisual(category);
						const isActive = selectedCategory === category;
						const count = getCategoryCount(category);

						return (
							<TouchableOpacity
								key={category}
								style={[
									styles.categoryChip,
									isActive && styles.categoryCardActive,
								]}
								onPress={() => setSelectedCategory(category)}
								activeOpacity={0.85}
							>
								<View
									style={[
										styles.categoryIconWrap,
										{ backgroundColor: visual.bg },
									]}
								>
									<Ionicons
										name={visual.icon}
										size={16}
										color={visual.iconColor}
									/>
								</View>
								<Text
									style={[
										styles.categoryCardText,
										isActive && styles.categoryCardTextActive,
									]}
									numberOfLines={1}
								>
									{category}
								</Text>
								<Text style={styles.categoryCount}>{count}</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>
			</View>

			<View style={styles.seatSection}>
				<View style={styles.seatHeaderRow}>
					<Text style={styles.seatHeaderText}>
						{t("ordering_for", "Seat / Guest")}
					</Text>
					<TouchableOpacity
						style={styles.addSeatButton}
						onPress={() => setIsSeatModalVisible(true)}
					>
						<Ionicons name="add" size={16} color={colors.primary} />
						<Text style={styles.addSeatText}>{t("add_guest", "Add Guest")}</Text>
					</TouchableOpacity>
				</View>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.seatScrollContent}
				>
					{seatOptions.map((seat) => {
						const selected = selectedSeatId === seat.id;

						return (
							<TouchableOpacity
								key={seat.id}
								style={[
									styles.seatChip,
									selected && styles.seatChipActive,
								]}
								onPress={() => setSelectedSeatId(seat.id)}
							>
								<Text
									style={[
										styles.seatChipText,
										selected && styles.seatChipTextActive,
									]}
									numberOfLines={1}
								>
									{seat.name}
								</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>
			</View>

			<MenuItemsList
				menuItems={filteredMenuItems}
				isLoading={isLoadingMenu}
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						<View>
							<Text style={styles.categoryLabel}>
								{t("category", "Category")}
							</Text>
							<Text style={styles.headerTitle}>{selectedCategory}</Text>
						</View>
						<View style={styles.headerCountPill}>
							<Text style={styles.headerCountText}>{filteredMenuItems.length}</Text>
						</View>
					</View>
				}
				pips={[{ userId: currentUserData.uid, name: t("table", "Table") }]}
				onConfirmAddItemToContext={handleServerAddItem}
				orderingMode="party"
				partyData={{
					partyId: partyId,
					currentUserId: currentUserData.uid,
				}}
				selectedItems={selectedItems}
				onToggleItemSelection={toggleItemSelection}
			/>

			{pendingPreviewItems.length > 0 && (
				<View
					style={[
						styles.pendingTray,
						isPendingTrayCollapsed && styles.pendingTrayCollapsed,
					]}
				>
					<TouchableOpacity
						style={styles.pendingTrayHeader}
						onPress={() =>
							setIsPendingTrayCollapsed((currentValue) => !currentValue)
						}
						activeOpacity={0.8}
					>
						<View>
							<Text style={styles.pendingTrayTitle}>
								{t("pending_items_title", "Review Before Sending")}
							</Text>
							<Text style={styles.pendingTraySubtitle}>
								{totalPendingCount} {t("items", "items")}
							</Text>
						</View>
						<Ionicons
							name={
								isPendingTrayCollapsed
									? "chevron-up-outline"
									: "chevron-down-outline"
							}
							size={22}
							color={colors.textMedium}
						/>
					</TouchableOpacity>

					{!isPendingTrayCollapsed && (
					<ScrollView
						style={styles.pendingTrayScroll}
						showsVerticalScrollIndicator={true}
						nestedScrollEnabled={true}
					>
						{pendingPreviewItems.map((pendingItem, itemIndex) => {
							const isLastItem = itemIndex === pendingPreviewItems.length - 1;

							return (
								<View
									key={pendingItem.key}
									style={[
										styles.pendingItemRow,
										isLastItem && styles.pendingItemRowLast,
									]}
								>
									<View style={styles.pendingItemDetails}>
										<Text style={styles.pendingSeatLabel}>
											{pendingItem.seat?.name || t("seat", "Seat")}
										</Text>
										<Text style={styles.pendingItemName}>
											{pendingItem.quantity}x {pendingItem.name}
										</Text>

										{Array.isArray(pendingItem.modifiers) &&
											pendingItem.modifiers.length > 0 && (
												<View style={styles.pendingModifiersWrap}>
													{pendingItem.modifiers.map((modifier, modIndex) => (
														<Text
															key={`${modifier.optionId || modifier.name || "mod"}-${modIndex}`}
															style={styles.pendingModifierText}
														>
															•{" "}
															{typeof modifier.name === "string"
																? modifier.name
																: modifier.name?.en ||
																	modifier.name?.es ||
																	modifier.name?.original ||
																	""}
															{Number(modifier.price || 0) > 0
																? ` (+${formatCurrencyFromDollars(modifier.price)})`
																: ""}
														</Text>
													))}
												</View>
											)}
									</View>

									<TouchableOpacity
										onPress={() => {
											if (pendingItem.type === "quick") {
												removeQuickSelectedItem(pendingItem.key);
											} else {
												removeCustomizedItem(pendingItem.index);
											}
										}}
										style={styles.removePendingButton}
									>
										<Ionicons
											name="trash-outline"
											size={18}
											color={colors.statusDanger}
										/>
									</TouchableOpacity>
								</View>
							);
						})}
					</ScrollView>
					)}
				</View>
			)}

			{totalPendingCount > 0 && (
				<View style={styles.bulkAddContainer}>
					<TouchableOpacity
						style={styles.bulkAddButton}
						onPress={handleBulkServerAddItem}
						disabled={isAddingBulk}
					>
						{isAddingBulk ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<>
								<MaterialCommunityIcons name="fire" size={24} color="#fff" />
								<Text style={styles.bulkAddButtonText}>
									{t("fire_to_kitchen", "Send to Kitchen")} ({totalPendingCount}
									)
								</Text>
							</>
						)}
					</TouchableOpacity>
				</View>
			)}

			{snackbar.visible && (
				<View pointerEvents="none" style={styles.toast}>
					<Text style={styles.toastText} numberOfLines={2}>
						{snackbar.message}
					</Text>
				</View>
			)}

			<Modal
				visible={isSeatModalVisible}
				transparent
				animationType="fade"
				onRequestClose={() => setIsSeatModalVisible(false)}
			>
				<KeyboardAvoidingView
					style={styles.modalOverlay}
					behavior={Platform.OS === "ios" ? "padding" : "height"}
				>
					<View style={styles.seatModalCard}>
						<Text style={styles.seatModalTitle}>
							{t("add_seat", "Add Guest")}
						</Text>
						<TextInput
							style={styles.seatModalInput}
							value={newSeatName}
							onChangeText={setNewSeatName}
							placeholder={t("seat_name_optional", "Seat name or guest name")}
							placeholderTextColor={colors.textMedium}
							autoFocus
							returnKeyType="done"
							onSubmitEditing={handleAddSeat}
						/>
						<View style={styles.seatModalActions}>
							<TouchableOpacity
								style={styles.seatModalSecondary}
								onPress={() => {
									setIsSeatModalVisible(false);
									setNewSeatName("");
								}}
							>
								<Text style={styles.seatModalSecondaryText}>
									{t("cancel", "Cancel")}
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.seatModalPrimary}
								onPress={handleAddSeat}
							>
								<Text style={styles.seatModalPrimaryText}>
									{t("add", "Add")}
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</KeyboardAvoidingView>
			</Modal>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.backgroundLight },
	centeredScreen: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	loadingText: { marginTop: 10, fontSize: 16, color: colors.textMedium },

	topNav: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 18,
		paddingVertical: 12,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		zIndex: 10,
	},
	orderContext: {
		flex: 1,
		paddingRight: 12,
	},
	orderEyebrow: {
		fontSize: 11,
		fontWeight: "900",
		color: colors.primary,
		textTransform: "uppercase",
		marginBottom: 3,
	},
	orderTableName: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.textDark,
	},
	closeBtn: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 8,
	},
	closeText: {
		fontSize: 14,
		color: colors.textDark,
		marginLeft: 4,
		fontWeight: "900",
	},

	categorySection: {
		backgroundColor: colors.surfaceWhite,
		paddingTop: 10,
		paddingBottom: 9,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	categoryScrollContent: {
		paddingHorizontal: 14,
	},
	categoryChip: {
		height: 42,
		maxWidth: 180,
		borderRadius: 8,
		marginRight: 8,
		paddingHorizontal: 9,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	categoryIconWrap: {
		width: 28,
		height: 28,
		borderRadius: 8,
		justifyContent: "center",
		alignItems: "center",
		marginRight: 7,
	},
	categoryCard: {
		width: 124,
		height: 86,
		borderRadius: 14,
		marginRight: 10,
		padding: 12,
		justifyContent: "space-between",
		borderWidth: 1,
		borderColor: "transparent",
	},
	categoryCardActive: {
		backgroundColor: colors.primary + "10",
		borderColor: colors.primary,
	},
	categoryCardTop: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	categoryCount: {
		fontSize: 12,
		fontWeight: "900",
		color: colors.textMedium,
		marginLeft: 7,
	},
	categoryCardText: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textDark,
		maxWidth: 96,
	},
	categoryCardTextActive: {
		color: colors.primary,
	},
	seatSection: {
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 16,
		paddingTop: 10,
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	seatHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	seatHeaderText: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
	},
	addSeatButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 8,
		backgroundColor: colors.primary + "12",
	},
	addSeatText: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.primary,
	},
	seatScrollContent: {
		paddingRight: 16,
	},
	seatChip: {
		minWidth: 92,
		maxWidth: 160,
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 8,
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.borderLight,
		marginRight: 8,
		alignItems: "center",
	},
	seatChipActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	seatChipText: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
	},
	seatChipTextActive: {
		color: colors.surfaceWhite,
	},

	headerContainer: {
		marginHorizontal: 16,
		marginTop: 12,
		marginBottom: 4,
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	headerTitle: {
		fontSize: 20,
		fontWeight: "900",
		color: colors.textDark,
		marginTop: 4,
	},
	categoryLabel: {
		fontSize: 11,
		color: colors.textMedium,
		fontWeight: "900",
		textTransform: "uppercase",
	},
	headerCountPill: {
		minWidth: 34,
		height: 34,
		borderRadius: 8,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	headerCountText: {
		color: colors.surfaceWhite,
		fontWeight: "900",
		fontSize: 14,
	},

	bulkAddContainer: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: 20,
		paddingBottom: 35,
		backgroundColor: colors.surfaceWhite,
		borderTopWidth: 1,
		borderColor: colors.borderLight,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.1,
		shadowRadius: 5,
		elevation: 10,
	},
	bulkAddButton: {
		flexDirection: "row",
		backgroundColor: colors.statusDanger || "#dc3545",
		padding: 16,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
	},
	bulkAddButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
		marginLeft: 10,
	},

	pendingTray: {
		marginHorizontal: 16,
		marginTop: 10,
		marginBottom: 110,
		padding: 14,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	pendingTrayCollapsed: {
		paddingVertical: 10,
		marginBottom: 92,
	},
	pendingTrayHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	pendingTrayTitle: {
		fontSize: 16,
		fontWeight: "700",
		color: colors.textDark,
	},
	pendingTraySubtitle: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 2,
	},
	pendingTrayScroll: {
		maxHeight: 220,
	},
	pendingItemRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	pendingItemRowLast: {
		borderBottomWidth: 0,
	},
	pendingItemDetails: {
		flex: 1,
		paddingRight: 10,
	},
	pendingItemName: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textDark,
	},
	pendingSeatLabel: {
		fontSize: 12,
		fontWeight: "800",
		color: colors.primary,
		marginBottom: 2,
	},
	pendingModifiersWrap: {
		marginTop: 4,
	},
	pendingModifierText: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	removePendingButton: {
		padding: 6,
	},
	toast: {
		position: "absolute",
		left: 18,
		right: 18,
		bottom: 108,
		backgroundColor: colors.statusSuccess || "#16A34A",
		borderRadius: 10,
		paddingHorizontal: 16,
		paddingVertical: 13,
		elevation: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.18,
		shadowRadius: 8,
	},
	toastText: {
		color: "#FFFFFF",
		fontWeight: "700",
		fontSize: 15,
		textAlign: "center",
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.45)",
		justifyContent: "center",
		padding: 24,
	},
	seatModalCard: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 18,
	},
	seatModalTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.textDark,
		marginBottom: 12,
	},
	seatModalInput: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 16,
		color: colors.textDark,
		marginBottom: 14,
	},
	seatModalActions: {
		flexDirection: "row",
		gap: 10,
		justifyContent: "flex-end",
	},
	seatModalSecondary: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: colors.backgroundMedium,
	},
	seatModalSecondaryText: {
		fontWeight: "800",
		color: colors.textDark,
	},
	seatModalPrimary: {
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: colors.primary,
	},
	seatModalPrimaryText: {
		fontWeight: "800",
		color: colors.surfaceWhite,
	},
});

export default ServerMenuScreen;
