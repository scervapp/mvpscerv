import React, { useEffect, useState, useMemo, useContext } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	TouchableOpacity,
	SectionList,
	ScrollView,
	ActivityIndicator,
	Alert,
	TextInput,
	Modal,
	KeyboardAvoidingView,
	Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useRoute, useNavigation } from "@react-navigation/native";
import { db, functions } from "../../config/firebase";
import { doc, onSnapshot } from "@react-native-firebase/firestore";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";
import printOrderReceipt from "../../utils/printOrderReceipt";
import { mockPrinterConfig } from "../../utils/printerConfigExamples";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import { getRestaurantPermissions } from "../../utils/restaurantPermissions";
import { formatCurrencyFromDollars } from "../../utils/currencyFormatter";

const getItemEffectivePriceCents = (item = {}) => {
	const activePrice =
		item.discountedPrice !== null && item.discountedPrice !== undefined
			? item.discountedPrice
			: item.price || 0;
	return Math.round(Number(activePrice || 0) * 100);
};

const getItemQuantity = (item = {}) =>
	Math.max(1, parseInt(item.quantity || 1, 10));

const calculateCloseoutTotalsCents = (items = [], taxRate = 0) => {
	let subtotalCents = 0;
	let taxAmountCents = 0;

	items.forEach((item) => {
		const lineSubtotalCents =
			getItemEffectivePriceCents(item) * getItemQuantity(item);
		subtotalCents += lineSubtotalCents;
		taxAmountCents += Math.round(lineSubtotalCents * taxRate);
	});

	return { subtotalCents, taxAmountCents };
};

const ManagePartyScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { t, i18n } = useTranslation();
	const currentLang = i18n.language?.substring(0, 2) || "en";
	const { partyId } = route.params;
	const { currentUserData } = useContext(AuthContext);
	const { activeSession } = useEmployeeSession();
	const permissions = getRestaurantPermissions(activeSession);

	const [partyData, setPartyData] = useState(null);
	const [basketItems, setBasketItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isClosing, setIsClosing] = useState(false);
	const [receiptEmail, setReceiptEmail] = useState("");
	const [isCloseoutModalVisible, setIsCloseoutModalVisible] = useState(false);
	const [selectedPaymentMethod, setSelectedPaymentMethod] =
		useState("stripe_terminal");
	const [tipInput, setTipInput] = useState("");
	const [cashReceivedInput, setCashReceivedInput] = useState("");
	const [closeoutNotes, setCloseoutNotes] = useState("");
	const [restaurantDetails, setRestaurantDetails] = useState(null);
	const [selectedCloseoutSeatIds, setSelectedCloseoutSeatIds] = useState([]);
	const [isTicketSummaryCollapsed, setIsTicketSummaryCollapsed] =
		useState(true);

	const hasServer = !!partyData?.server && !!partyData?.server?.name;
	const goToActiveTables = () => {
		navigation.dispatch(
			CommonActions.reset({
				index: 0,
				routes: [{ name: "RestaurantActiveTables" }],
			}),
		);
	};

	const getLocalizedModifierName = (modifier) => {
		if (!modifier) return "";

		if (typeof modifier.name === "string") return modifier.name;

		return (
			modifier.name?.[currentLang] ||
			modifier.name?.en ||
			modifier.name?.es ||
			modifier.name?.original ||
			""
		);
	};

	// 1. Listen to the Party and the Shared Basket simultaneously
	useEffect(() => {
		if (!partyId) return;

		const partyRef = doc(db, "parties", partyId);
		const basketRef = doc(db, "shared_baskets", partyId);

		const unsubscribeParty = onSnapshot(partyRef, (docSnap) => {
			if (docSnap.exists) setPartyData({ id: docSnap.id, ...docSnap.data() });
		});

		const unsubscribeBasket = onSnapshot(basketRef, (snapshot) => {
			if (snapshot.exists) {
				setBasketItems(snapshot.data().items || []);
			} else {
				setBasketItems([]);
			}
			setIsLoading(false);
		});

		return () => {
			unsubscribeParty();
			unsubscribeBasket();
		};
	}, [partyId]);

	useEffect(() => {
		const restaurantId = partyData?.restaurantId || currentUserData?.uid;
		if (!restaurantId) {
			setRestaurantDetails(null);
			return;
		}

		const restaurantRef = doc(db, "restaurants", restaurantId);
		const unsubscribe = onSnapshot(restaurantRef, (snapshot) => {
			setRestaurantDetails(snapshot.exists ? snapshot.data() || {} : null);
		});

		return () => unsubscribe();
	}, [partyData?.restaurantId, currentUserData?.uid]);

	// 2. Filter & Group Items
	const officiallyOrderedItems = useMemo(() => {
		return (basketItems || []).filter(
			(item) => item?.status && item.status !== "new",
		);
	}, [basketItems]);

	const getItemSeatId = (item = {}) => {
		if (item.seatId) return String(item.seatId);
		if (item.orderedForSeatId) return String(item.orderedForSeatId);
		if (item.orderedByUserId) return `guest_${item.orderedByUserId}`;
		return "table_share";
	};

	const getItemSeatName = (item = {}) =>
		item.seatName ||
		item.orderedForSeatName ||
		item.orderedForName ||
		item.orderedByPipName ||
		item.customerName ||
		t("table", "Table");

	const isItemPaid = (item = {}) =>
		item.paymentStatus === "paid" || item.closeoutStatus === "paid";

	const getKitchenItemStatus = (item = {}) => {
		const status = item.stationStatuses?.kitchen || item.status || "new";
		if (status === "served" || item.foodRunStatus === "served") return "served";
		if (status === "ready") return "ready";
		if (status === "preparing") return "preparing";
		if (status === "sent") return "sent";
		return item.status || "new";
	};

	const unpaidOrderedItems = useMemo(
		() => officiallyOrderedItems.filter((item) => !isItemPaid(item)),
		[officiallyOrderedItems],
	);

	const paidSubtotal = useMemo(() => {
		return officiallyOrderedItems
			.filter(isItemPaid)
			.reduce((sum, item) => {
				const effectivePrice =
					item.discountedPrice !== null && item.discountedPrice !== undefined
						? parseFloat(item.discountedPrice)
						: parseFloat(item.price || 0);
				return sum + effectivePrice * parseInt(item.quantity || 1, 10);
			}, 0);
	}, [officiallyOrderedItems]);

	const seatSummaries = useMemo(() => {
		const seats = {};

		unpaidOrderedItems.forEach((item) => {
			const seatId = getItemSeatId(item);
			const seatName = getItemSeatName(item);
			const effectivePrice =
				item.discountedPrice !== null && item.discountedPrice !== undefined
					? parseFloat(item.discountedPrice)
					: parseFloat(item.price || 0);
			const lineTotal = effectivePrice * parseInt(item.quantity || 1, 10);

			if (!seats[seatId]) {
				seats[seatId] = {
					id: seatId,
					name: seatName,
					subtotal: 0,
					itemIds: [],
					items: [],
					itemCount: 0,
				};
			}

			seats[seatId].subtotal += lineTotal;
			seats[seatId].itemIds.push(item.id);
			seats[seatId].items.push({
				id: item.id,
				name: item.dishName || item.name || t("item", "Item"),
				quantity: parseInt(item.quantity || 1, 10),
				lineTotal,
			});
			seats[seatId].itemCount += 1;
		});

		return Object.values(seats).sort((a, b) =>
			String(a.name).localeCompare(String(b.name)),
		);
	}, [unpaidOrderedItems, t]);

	const groupedOrders = useMemo(() => {
		const groups = {};
		officiallyOrderedItems.forEach((item) => {
			const isStaffEnteredOrder =
				item.source === "restaurant_pos" ||
				item.orderEntryMode === "staff" ||
				item.paymentResponsibility === "restaurant_pos" ||
				item.orderedByPipName?.startsWith("Server:");
			const ownerName = isStaffEnteredOrder
				? partyData?.hostName || t("table", "Table")
				: item.orderedByPipName || item.customerName || t("guest", "Guest");

			if (!groups[ownerName]) {
				groups[ownerName] = { title: ownerName, data: [], subtotal: 0 };
			}
			groups[ownerName].data.push(item);

			// Check for discount when calculating subtotal
			const effectivePrice =
				item.discountedPrice !== null && item.discountedPrice !== undefined
					? parseFloat(item.discountedPrice)
					: parseFloat(item.price || 0);

			groups[ownerName].subtotal +=
				effectivePrice * parseInt(item.quantity || 1, 10);
		});
		return Object.values(groups);
	}, [officiallyOrderedItems, partyData, t]);

	const parseCurrencyToCents = (value) => {
		const normalized = String(value || "").replace(/[^0-9.]/g, "");
		const parsed = Number(normalized);
		if (Number.isNaN(parsed)) return 0;
		return Math.max(0, Math.round(parsed * 100));
	};

	const restaurantTaxRate = useMemo(() => {
		const rawRate = Number(
			restaurantDetails?.taxRate ?? currentUserData?.taxRate ?? 0,
		);
		if (Number.isNaN(rawRate) || rawRate <= 0) return 0;
		return rawRate > 1 ? rawRate / 100 : rawRate;
	}, [currentUserData?.taxRate, restaurantDetails?.taxRate]);

	const tableTotalsCents = useMemo(
		() => calculateCloseoutTotalsCents(unpaidOrderedItems, restaurantTaxRate),
		[restaurantTaxRate, unpaidOrderedItems],
	);
	const tableTotal = tableTotalsCents.subtotalCents / 100;
	const taxTotal = tableTotalsCents.taxAmountCents / 100;

	// 3. Handlers
	const handleCloseTable = () => {
		if (unpaidOrderedItems.length === 0) {
			Alert.alert(
				t("nothing_to_close", "Nothing to close"),
				t("all_items_already_paid", "All ordered items have already been paid."),
			);
			return;
		}
		setSelectedPaymentMethod("stripe_terminal");
		setTipInput("");
		setCashReceivedInput("");
		setCloseoutNotes("");
		setSelectedCloseoutSeatIds(seatSummaries.map((seat) => seat.id));
		setIsCloseoutModalVisible(true);
	};

	const taxRateLabel = `${(restaurantTaxRate * 100).toFixed(2)}%`;

	const gratuityTotalCents = useMemo(() => parseCurrencyToCents(tipInput), [
		tipInput,
	]);
	const gratuityTotal = gratuityTotalCents / 100;

	const selectedCloseoutItems = useMemo(() => {
		const selectedSet = new Set(selectedCloseoutSeatIds);
		return unpaidOrderedItems.filter((item) =>
			selectedSet.has(getItemSeatId(item)),
		);
	}, [selectedCloseoutSeatIds, unpaidOrderedItems]);

	const closeoutTotalsCents = useMemo(
		() => calculateCloseoutTotalsCents(selectedCloseoutItems, restaurantTaxRate),
		[restaurantTaxRate, selectedCloseoutItems],
	);
	const closeoutSubtotal = closeoutTotalsCents.subtotalCents / 100;
	const closeoutTaxTotal = closeoutTotalsCents.taxAmountCents / 100;

	const selectedSeatBreakdown = useMemo(() => {
		const selectedSet = new Set(selectedCloseoutSeatIds);
		return seatSummaries.filter((seat) => selectedSet.has(seat.id));
	}, [seatSummaries, selectedCloseoutSeatIds]);

	const serviceFeeTotal = useMemo(() => {
		// placeholder for now unless you want to calculate based on pricing tier here too
		return 0;
	}, []);
	const serviceFeeTotalCents = Math.round(serviceFeeTotal * 100);

	const grandTotal = useMemo(() => {
		return tableTotal + taxTotal + gratuityTotal + serviceFeeTotal;
	}, [tableTotal, taxTotal, gratuityTotal, serviceFeeTotal]);
	const closeoutGrandTotalCents = useMemo(
		() =>
			closeoutTotalsCents.subtotalCents +
			closeoutTotalsCents.taxAmountCents +
			gratuityTotalCents +
			serviceFeeTotalCents,
		[
			closeoutTotalsCents.subtotalCents,
			closeoutTotalsCents.taxAmountCents,
			gratuityTotalCents,
			serviceFeeTotalCents,
		],
	);
	const closeoutGrandTotal = closeoutGrandTotalCents / 100;
	const expectedTotalCents = closeoutGrandTotalCents;
	const expectedTerminalBaseTotalCents = useMemo(
		() =>
			closeoutTotalsCents.subtotalCents +
			closeoutTotalsCents.taxAmountCents +
			serviceFeeTotalCents,
		[
			closeoutTotalsCents.subtotalCents,
			closeoutTotalsCents.taxAmountCents,
			serviceFeeTotalCents,
		],
	);
	const cashReceivedPreviewCents = useMemo(
		() => parseCurrencyToCents(cashReceivedInput),
		[cashReceivedInput],
	);
	const changeDuePreviewCents = useMemo(
		() => Math.max(0, cashReceivedPreviewCents - expectedTotalCents),
		[cashReceivedPreviewCents, expectedTotalCents],
	);

	const executeCloseTable = async () => {
		setIsClosing(true);

		try {
			const tipAmount = parseCurrencyToCents(tipInput);
			const cashReceived = parseCurrencyToCents(cashReceivedInput);
			const selectedSeatIds = selectedCloseoutSeatIds.filter(Boolean);
			const selectedItemIds = selectedCloseoutItems
				.map((item) => item.id)
				.filter(Boolean);

			if (selectedItemIds.length === 0) {
				Alert.alert(
					t("select_items_to_close", "Select items to close"),
					t(
						"choose_one_or_more_seats",
						"Choose one or more seats before recording payment.",
					),
				);
				setIsClosing(false);
				return;
			}

			if (selectedPaymentMethod === "stripe_terminal") {
				setIsCloseoutModalVisible(false);
				setIsClosing(false);
				navigation.navigate("RestaurantTerminalPaymentScreen", {
					partyId,
					restaurantId: partyData?.restaurantId || currentUserData?.uid,
					stripeTerminalLocationId:
						restaurantDetails?.stripeTerminalLocationId ||
						restaurantDetails?.terminalLocationId ||
						currentUserData?.stripeTerminalLocationId ||
						currentUserData?.terminalLocationId ||
						"",
					tableName: partyData?.table?.name || t("table", "Table"),
					closeoutSeatIds: selectedSeatIds,
					closeoutItemIds: selectedItemIds,
					selectedSeatBreakdown,
					tipAmount: 0,
					expectedTotalCents: expectedTerminalBaseTotalCents,
					receiptEmail: receiptEmail.trim(),
					closeoutNotes: closeoutNotes.trim(),
				});
				return;
			}

			if (
				selectedPaymentMethod === "cash" &&
				cashReceived < expectedTotalCents
			) {
				Alert.alert(
					t("cash_short", "Cash Short"),
					t(
						"cash_received_less_than_total",
						"Cash received is less than the table total.",
					),
				);
				setIsClosing(false);
				return;
			}
			const closeTableCloudFunction = httpsCallable(
				functions,
				"closePartyTable",
			);

			const result = await closeTableCloudFunction({
				partyId,
				paymentMethod: selectedPaymentMethod,
				tenderType: selectedPaymentMethod,
				receiptEmail: receiptEmail.trim(),
				tipAmount,
				cashReceived:
					selectedPaymentMethod === "cash" ? cashReceived : 0,
				externalReference: "",
				closeoutNotes: closeoutNotes.trim(),
				closeoutSeatIds: selectedSeatIds,
				closeoutItemIds: selectedItemIds,
				closedByStaffId: activeSession?.id || null,
				closedByName:
					activeSession?.name ||
					`${currentUserData?.firstName || ""} ${
						currentUserData?.lastName || ""
					}`.trim(),
			});

			if (!result?.data?.success) {
				throw new Error("Failed to close table.");
			}

			// Build a local printable order object using screen data + CF totals
			const printableOrder = {
				id: partyId,
				orderId: partyId,
				readableOrderId: result?.data?.readableOrderId || partyId,
				restaurantName:
					partyData?.restaurantName || partyData?.name || "Scerv Partner",
				table: partyData?.table || null,
				server: partyData?.server || null,
				customerName: "",

				subtotal:
					result?.data?.subtotal !== undefined
						? result.data.subtotal
						: Math.round(tableTotal * 100),
				taxAmount:
					result?.data?.taxAmount !== undefined ? result.data.taxAmount : 0,
				gratuityAmount:
					result?.data?.gratuityAmount !== undefined
						? result.data.gratuityAmount
						: tipAmount,
				platformFee: 0,
				isManualRestaurantOrder: true,
				paymentMethod: selectedPaymentMethod,
				tenderType: selectedPaymentMethod,
				externalReference: "",
				cashReceived:
					result?.data?.cashReceived !== undefined
						? result.data.cashReceived
						: selectedPaymentMethod === "cash"
							? cashReceived
							: 0,
				changeDue:
					result?.data?.changeDue !== undefined
						? result.data.changeDue
						: selectedPaymentMethod === "cash"
							? Math.max(0, cashReceived - expectedTotalCents)
							: 0,
				taxRate: result?.data?.taxRate ?? restaurantTaxRate,
				taxSource: result?.data?.taxSource || "restaurant.taxRate",
				feePolicy:
					result?.data?.feePolicy || "manual_tender_scerv_fee_waived",
				totalPrice:
					result?.data?.totalPrice !== undefined
						? result.data.totalPrice
						: Math.round(tableTotal * 100),

				orderMode: "dineIn",
				fulfillmentType: "table",

				items: selectedCloseoutItems,
			};

			// Best-effort print only
			try {
				const printResult = await printOrderReceipt(
					printableOrder,
					mockPrinterConfig,
					{
						type: "closeout",
						showBarcode: false,
					},
				);

				if (!printResult.success && !printResult.skipped) {
					console.warn("Close table receipt print failed:", printResult.error);
				}
			} catch (printError) {
				console.warn("Receipt print error:", printError);
			}

			setIsCloseoutModalVisible(false);
			setTipInput("");
			setCashReceivedInput("");
			setExternalReference("");
			setCloseoutNotes("");
			setSelectedCloseoutSeatIds([]);
			const isFinalCloseout = result?.data?.isFinalCloseout !== false;
			Alert.alert(
				isFinalCloseout
					? t("table_closed", "Table Closed")
					: t("payment_recorded", "Payment Recorded"),
				`${t("order", "Order")}: ${result?.data?.readableOrderId || partyId}${
					selectedPaymentMethod === "cash"
						? `\n${t("change_due", "Change Due")}: ${formatCurrencyFromDollars(
								(result?.data?.changeDue || 0) / 100,
							)}`
						: ""
				}${
					!isFinalCloseout
						? `\n${t("remaining_balance", "Remaining Balance")}: ${formatCurrencyFromDollars(
								(result?.data?.balanceDue || 0) / 100,
							)}`
						: ""
				}`,
				[
					{
						text: t("ok", "OK"),
						onPress: isFinalCloseout ? goToActiveTables : undefined,
					},
				],
			);
		} catch (error) {
			console.error("Error closing table:", error);
			Alert.alert(
				t("error", "Error"),
				t("could_not_close_table", "Could not close the table."),
			);
		} finally {
			setIsClosing(false);
		}
	};
	const handleAddItemManually = () => {
		if (!partyData) return;
		navigation.navigate("ServerMenuScreen", {
			partyId: partyId,
			restaurantId: partyData.restaurantId,
			tableName: partyData.table?.name || "Table",
			tableId: partyData.table?.id,
			guestName: partyData.hostName,
			serverObj: partyData.server,
			partySeats:
				seatSummaries.length > 0
					? seatSummaries.map((seat) => ({ id: seat.id, name: seat.name }))
					: partyData.staffOrderSeats || [],
		});
	};

	// 4. Render Layouts
	const renderSectionHeader = ({ section }) => (
		<View style={styles.sectionHeader}>
			<View style={styles.sectionHeaderRow}>
				<Ionicons
					name="person-circle-outline"
					size={20}
					color={colors.primary}
				/>
				<Text style={styles.sectionTitle}>{section.title}</Text>
			</View>
			<Text style={styles.sectionSubtotal}>
				{formatCurrencyFromDollars(section.subtotal)}
			</Text>
		</View>
	);

	const renderOrderItem = ({ item }) => {
		const kitchenStatus = getKitchenItemStatus(item);
		const isSent =
			item.status === "sent" ||
			item.status === "preparing" ||
			item.status === "ready" ||
			kitchenStatus === "preparing" ||
			kitchenStatus === "ready" ||
			kitchenStatus === "served";
		const isReady = kitchenStatus === "ready";
		const isServed = kitchenStatus === "served";

		const hasDiscount =
			item.discountedPrice !== null &&
			item.discountedPrice !== undefined &&
			item.discountedPrice < item.price;

		const quantity = parseInt(item.quantity || 1, 10);
		const originalTotal = parseFloat(item.price || 0) * quantity;
		const finalTotal = hasDiscount
			? parseFloat(item.discountedPrice) * quantity
			: originalTotal;

		const selectedModifiers = Array.isArray(item.selectedModifiers)
			? item.selectedModifiers
			: [];
		const paid = isItemPaid(item);

		return (
			<View style={styles.itemRow}>
				<View style={styles.itemQtyBox}>
					<Text style={styles.itemQtyText}>{item.quantity}</Text>
				</View>

				<View style={styles.itemDetails}>
					<Text style={styles.itemName}>{item.dishName || item.name}</Text>
					<Text style={styles.itemSeatLabel}>{getItemSeatName(item)}</Text>

					{selectedModifiers.length > 0 && (
						<View style={styles.modifiersContainer}>
							{selectedModifiers.map((modifier, index) => (
								<Text
									key={`${modifier.optionId || modifier.name || "modifier"}-${index}`}
									style={styles.modifierText}
								>
									• {getLocalizedModifierName(modifier)}
									{Number(modifier.price || 0) > 0
										? ` (+${formatCurrencyFromDollars(modifier.price)})`
										: ""}
								</Text>
							))}
						</View>
					)}

					{item.specialInstructions ? (
						<Text style={styles.itemInstructions}>
							"
							{typeof item.specialInstructions === "object"
								? item.specialInstructions[currentLang] ||
									item.specialInstructions.original ||
									item.specialInstructions.en ||
									""
								: item.specialInstructions}
							"
						</Text>
					) : null}
				</View>

				<View style={styles.itemTrailing}>
					<View style={styles.priceContainer}>
						{hasDiscount && (
							<Text style={styles.originalPriceText}>
								{formatCurrencyFromDollars(originalTotal)}
							</Text>
						)}
						<Text
							style={[styles.itemPrice, hasDiscount && styles.discountText]}
						>
							{formatCurrencyFromDollars(finalTotal)}
						</Text>
					</View>

					<View
						style={[
							styles.statusBadge,
							paid
								? styles.badgePaid
								: isServed
									? styles.badgeServed
									: isReady
										? styles.badgeReady
								: isSent
									? styles.badgeSent
									: styles.badgeNew,
						]}
					>
						<Text
							style={[
								styles.badgeText,
								paid
									? styles.badgeTextPaid
									: isServed
										? styles.badgeTextServed
										: isReady
											? styles.badgeTextReady
									: isSent
										? styles.badgeTextSent
										: styles.badgeTextNew,
							]}
						>
							{paid
								? t("paid", "Paid")
								: isServed
									? t("served", "Served")
									: isReady
										? t("ready", "Ready")
								: isSent
									? t("sent", "Sent")
									: t("new", "New")}
						</Text>
					</View>
				</View>
			</View>
		);
	};

	if (isLoading || !partyData) {
		return (
			<SafeAreaView style={styles.centered}>
				<ActivityIndicator size="large" color={colors.primary} />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			{/* HEADER */}
			<View style={styles.header}>
				<TouchableOpacity
					onPress={goToActiveTables}
					style={styles.backBtn}
				>
					<Ionicons name="arrow-back" size={24} color={colors.textDark} />
				</TouchableOpacity>
				<View style={styles.headerTitles}>
					<Text style={styles.tableName}>{partyData.table?.name}</Text>
					<Text style={styles.serverName}>
						{t("server", "Server")}: {partyData.server?.name}
					</Text>
				</View>
				{permissions.canEnterStaffOrders ? (
					<TouchableOpacity onPress={handleAddItemManually} style={styles.addBtn}>
						<Ionicons name="add" size={24} color={colors.primary} />
					</TouchableOpacity>
				) : (
					<View style={{ width: 34 }} />
				)}
			</View>

			{/* ORDER LIST */}
			<SectionList
				sections={groupedOrders}
				keyExtractor={(item, index) => item.id || index.toString()}
				renderItem={renderOrderItem}
				renderSectionHeader={renderSectionHeader}
				contentContainerStyle={[
					styles.listContent,
					isTicketSummaryCollapsed && styles.listContentCollapsed,
				]}
				stickySectionHeadersEnabled={false}
				ListEmptyComponent={
					<Text style={styles.emptyText}>
						{t("no_items_ordered_yet", "No items ordered yet.")}
					</Text>
				}
			/>

			{/* FOOTER ACTION BAR */}
			<View style={styles.footer}>
				<TouchableOpacity
					style={styles.footerCompactHeader}
					onPress={() =>
						setIsTicketSummaryCollapsed((currentValue) => !currentValue)
					}
					activeOpacity={0.8}
				>
					<View>
						<Text style={styles.footerCompactLabel}>
							{t("balance_due", "Balance Due")}
						</Text>
						<Text style={styles.footerCompactAmount}>
							{formatCurrencyFromDollars(grandTotal)}
						</Text>
					</View>
					<Ionicons
						name={
							isTicketSummaryCollapsed
								? "chevron-up-outline"
								: "chevron-down-outline"
						}
						size={22}
						color={colors.textMedium}
					/>
				</TouchableOpacity>

				{!isTicketSummaryCollapsed && (
				<View style={styles.summaryBlock}>
					<View style={styles.summaryRow}>
						<Text style={styles.summaryLabel}>
							{t("subtotal", "Subtotal")}:
						</Text>
						<Text style={styles.summaryValue}>
							{formatCurrencyFromDollars(tableTotal)}
						</Text>
					</View>

					<View style={styles.summaryRow}>
						<Text style={styles.summaryLabel}>{t("tax", "Tax")}:</Text>
						<Text style={styles.summaryValue}>
							{formatCurrencyFromDollars(taxTotal)}
						</Text>
					</View>

					{gratuityTotal > 0 && (
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>
								{t("gratuity", "Gratuity")}:
							</Text>
							<Text style={styles.summaryValue}>
								{formatCurrencyFromDollars(gratuityTotal)}
							</Text>
						</View>
					)}

					{serviceFeeTotal > 0 && (
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>
								{t("service_fee", "Service Fee")}:
							</Text>
							<Text style={styles.summaryValue}>
								{formatCurrencyFromDollars(serviceFeeTotal)}
							</Text>
						</View>
					)}

					<View style={styles.summaryDivider} />

					<View style={styles.totalsRow}>
						<Text style={styles.totalLabel}>
							{t("balance_due", "Balance Due")}:
						</Text>
						<Text style={styles.totalAmount}>
							{formatCurrencyFromDollars(grandTotal)}
						</Text>
					</View>
				</View>
				)}

				{!isTicketSummaryCollapsed && seatSummaries.length > 0 && (
					<View style={styles.seatSummaryPanel}>
						<View style={styles.seatSummaryHeader}>
							<Text style={styles.seatSummaryTitle}>
								{t("unpaid_by_seat", "Unpaid by Seat")}
							</Text>
							{paidSubtotal > 0 && (
								<Text style={styles.paidSummaryText}>
									{t("paid", "Paid")}:{" "}
									{formatCurrencyFromDollars(paidSubtotal)}
								</Text>
							)}
						</View>
						<ScrollView horizontal showsHorizontalScrollIndicator={false}>
							{seatSummaries.map((seat) => (
								<View key={seat.id} style={styles.seatSummaryChip}>
									<Text style={styles.seatSummaryName}>{seat.name}</Text>
									<Text style={styles.seatSummaryAmount}>
										{formatCurrencyFromDollars(seat.subtotal)}
									</Text>
								</View>
							))}
						</ScrollView>
					</View>
				)}

				{!isTicketSummaryCollapsed && (
					<TextInput
						style={styles.emailInput}
						placeholder={t(
							"customer_email_optional",
							"Customer Email (Optional for Receipt)",
						)}
						placeholderTextColor={colors.textMedium}
						value={receiptEmail}
						onChangeText={setReceiptEmail}
						keyboardType="email-address"
						autoCapitalize="none"
						autoCorrect={false}
					/>
				)}

				{/* NEW: Server Warning Message */}
				{!hasServer && (
					<Text style={styles.noServerWarning}>
						{t(
							"assign_server_to_close",
							"A server needs to be assigned to close out the table.",
						)}
					</Text>
				)}

				<View style={styles.actionRow}>
					<TouchableOpacity
						style={[
							styles.closeBtn,
							isClosing && { opacity: 0.7 },
							(!hasServer || !permissions.canCloseTable) && {
								backgroundColor: colors.textMedium,
							},
						]}
						onPress={handleCloseTable}
						disabled={isClosing || !hasServer || !permissions.canCloseTable}
					>
						{isClosing ? (
							<ActivityIndicator size="small" color={colors.surfaceWhite} />
						) : (
							<Text style={styles.closeBtnText}>
								{t("close_table", "Close Table")}
							</Text>
						)}
					</TouchableOpacity>
				</View>
			</View>

			<Modal
				visible={isCloseoutModalVisible}
				transparent
				animationType="slide"
				onRequestClose={() => setIsCloseoutModalVisible(false)}
			>
				<KeyboardAvoidingView
					style={styles.modalOverlay}
					behavior={Platform.OS === "ios" ? "padding" : "height"}
				>
					<View style={styles.closeoutSheet}>
						<View style={styles.modalHeader}>
							<Text style={styles.modalTitle}>
								{t("settle_and_close", "Settle & Close Table")}
							</Text>
							<TouchableOpacity
								onPress={() => setIsCloseoutModalVisible(false)}
								disabled={isClosing}
							>
								<Ionicons
									name="close"
									size={24}
									color={colors.textMedium}
								/>
							</TouchableOpacity>
						</View>

						<ScrollView
							style={styles.closeoutScroll}
							contentContainerStyle={styles.closeoutScrollContent}
							keyboardShouldPersistTaps="handled"
							showsVerticalScrollIndicator={false}
						>
						<View style={styles.paymentMethodRow}>
							<TouchableOpacity
								style={[
									styles.paymentMethodButton,
									selectedPaymentMethod === "stripe_terminal" &&
										styles.paymentMethodButtonActive,
								]}
								onPress={() => setSelectedPaymentMethod("stripe_terminal")}
							>
								<Text
									style={[
										styles.paymentMethodText,
										selectedPaymentMethod === "stripe_terminal" &&
											styles.paymentMethodTextActive,
									]}
								>
									{t("card_reader", "Card Reader")}
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[
									styles.paymentMethodButton,
									selectedPaymentMethod === "cash" &&
										styles.paymentMethodButtonActive,
								]}
								onPress={() => setSelectedPaymentMethod("cash")}
							>
								<Text
									style={[
										styles.paymentMethodText,
										selectedPaymentMethod === "cash" &&
											styles.paymentMethodTextActive,
									]}
								>
									{t("cash_payment_option", "Cash")}
								</Text>
							</TouchableOpacity>
						</View>

						<View style={styles.modalTotalsBox}>
							<View style={styles.closeoutSeatSelector}>
								<Text style={styles.closeoutSeatTitle}>
									{t("settle_seats", "Settle Seats")}
								</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false}>
									{seatSummaries.map((seat) => {
										const selected = selectedCloseoutSeatIds.includes(seat.id);

										return (
											<TouchableOpacity
												key={seat.id}
												style={[
													styles.closeoutSeatChip,
													selected && styles.closeoutSeatChipActive,
												]}
												onPress={() => {
													setSelectedCloseoutSeatIds((prev) =>
														prev.includes(seat.id)
															? prev.filter((id) => id !== seat.id)
															: [...prev, seat.id],
													);
												}}
											>
												<Text
													style={[
														styles.closeoutSeatChipText,
														selected && styles.closeoutSeatChipTextActive,
													]}
												>
													{seat.name}
												</Text>
												<Text
													style={[
														styles.closeoutSeatAmount,
														selected && styles.closeoutSeatChipTextActive,
													]}
												>
													{formatCurrencyFromDollars(seat.subtotal)}
												</Text>
											</TouchableOpacity>
										);
									})}
								</ScrollView>
							</View>
							{selectedSeatBreakdown.length > 0 && (
								<View style={styles.closeoutSeatItemsBox}>
									{selectedSeatBreakdown.map((seat) => (
										<View key={seat.id} style={styles.closeoutSeatItemsGroup}>
											<View style={styles.closeoutSeatItemsHeader}>
												<Text style={styles.closeoutSeatItemsTitle}>
													{seat.name}
												</Text>
												<Text style={styles.closeoutSeatItemsTotal}>
													{formatCurrencyFromDollars(seat.subtotal)}
												</Text>
											</View>
											{seat.items.map((seatItem) => (
												<View
													key={seatItem.id}
													style={styles.closeoutSeatItemRow}
												>
													<Text
														style={styles.closeoutSeatItemName}
														numberOfLines={1}
													>
														{seatItem.quantity}x {seatItem.name}
													</Text>
													<Text style={styles.closeoutSeatItemAmount}>
														{formatCurrencyFromDollars(seatItem.lineTotal)}
													</Text>
												</View>
											))}
										</View>
									))}
								</View>
							)}
							<View style={styles.summaryRow}>
								<Text style={styles.summaryLabel}>
									{t("subtotal", "Subtotal")}
								</Text>
								<Text style={styles.summaryValue}>
									{formatCurrencyFromDollars(closeoutSubtotal)}
								</Text>
							</View>
							<View style={styles.summaryRow}>
								<View>
									<Text style={styles.summaryLabel}>{t("tax", "Tax")}</Text>
									<Text style={styles.summarySubLabel}>
										{t(
											"restaurant_tax_rate",
											"Restaurant tax rate",
										)}{" "}
										{taxRateLabel}
									</Text>
								</View>
								<Text style={styles.summaryValue}>
									{formatCurrencyFromDollars(closeoutTaxTotal)}
								</Text>
							</View>
							<View style={styles.summaryRow}>
								<Text style={styles.summaryLabel}>{t("tip", "Tip")}</Text>
								<Text style={styles.summaryValue}>
									{formatCurrencyFromDollars(gratuityTotal)}
								</Text>
							</View>
							<View style={styles.summaryDivider} />
							<View style={styles.totalsRow}>
								<Text style={styles.totalLabel}>
									{t("selected_total", "Selected Total")}
								</Text>
								<Text style={styles.totalAmount}>
									{formatCurrencyFromDollars(closeoutGrandTotal)}
								</Text>
							</View>
						</View>

						{selectedPaymentMethod !== "stripe_terminal" ? (
							<TextInput
								style={styles.modalInput}
								placeholder={t("tip_optional", "Tip amount")}
								placeholderTextColor={colors.textMedium}
								value={tipInput}
								onChangeText={setTipInput}
								keyboardType="decimal-pad"
							/>
						) : null}

						{selectedPaymentMethod === "cash" ? (
							<TextInput
								style={styles.modalInput}
								placeholder={t("cash_received", "Cash received")}
								placeholderTextColor={colors.textMedium}
								value={cashReceivedInput}
								onChangeText={setCashReceivedInput}
								keyboardType="decimal-pad"
							/>
						) : (
							<View style={styles.terminalInfoBox}>
								<Ionicons
									name="card-outline"
									size={20}
									color={colors.primary}
								/>
								<Text style={styles.terminalInfoText}>
									{t(
										"scerv_terminal_info",
										"The card reader will collect payment, prompt the guest for gratuity, and close the selected seats automatically.",
									)}
								</Text>
							</View>
						)}

						{selectedPaymentMethod === "cash" ? (
							<View style={styles.cashSummaryBox}>
								<View style={styles.summaryRow}>
									<Text style={styles.summaryLabel}>
										{t("cash_expected", "Cash Expected")}
									</Text>
									<Text style={styles.summaryValue}>
										{formatCurrencyFromDollars(expectedTotalCents / 100)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.summaryLabel}>
										{t("cash_received", "Cash Received")}
									</Text>
									<Text style={styles.summaryValue}>
										{formatCurrencyFromDollars(
											cashReceivedPreviewCents / 100,
										)}
									</Text>
								</View>
								<View style={styles.summaryRow}>
									<Text style={styles.summaryLabel}>
										{t("change_due", "Change Due")}
									</Text>
									<Text style={styles.summaryValue}>
										{formatCurrencyFromDollars(
											changeDuePreviewCents / 100,
										)}
									</Text>
								</View>
							</View>
						) : (
							<Text style={styles.helperText}>
								{t(
									"scerv_terminal_helper",
									"The reader starts with the selected bill total. Any gratuity selected by the guest is recorded with the closeout.",
								)}
							</Text>
						)}

						<TextInput
							style={[styles.modalInput, styles.notesInput]}
							placeholder={t("closeout_notes_optional", "Closeout notes")}
							placeholderTextColor={colors.textMedium}
							value={closeoutNotes}
							onChangeText={setCloseoutNotes}
							multiline
							textAlignVertical="top"
						/>
						</ScrollView>

						<TouchableOpacity
							style={[styles.confirmCloseButton, isClosing && { opacity: 0.7 }]}
							onPress={executeCloseTable}
							disabled={isClosing}
						>
							{isClosing ? (
								<ActivityIndicator size="small" color={colors.surfaceWhite} />
							) : (
								<Text style={styles.confirmCloseButtonText}>
									{selectedPaymentMethod === "stripe_terminal"
										? t("continue_to_reader", "Continue to Reader")
										: t("confirm_closeout", "Confirm Closeout")}
								</Text>
							)}
						</TouchableOpacity>
					</View>
				</KeyboardAvoidingView>
			</Modal>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.backgroundLight },
	centered: { flex: 1, justifyContent: "center", alignItems: "center" },

	// Header
	header: {
		flexDirection: "row",
		alignItems: "center",
		padding: 15,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	backBtn: { padding: 5 },
	headerTitles: { flex: 1, alignItems: "center" },
	tableName: { fontSize: 20, fontWeight: "bold", color: colors.textDark },
	serverName: { fontSize: 14, color: colors.textMedium },
	addBtn: {
		padding: 5,
		backgroundColor: colors.primary + "15",
		borderRadius: 8,
	},

	// List & Sections
	listContent: { padding: 15, paddingBottom: 250 },
	listContentCollapsed: { paddingBottom: 132 },
	emptyText: {
		textAlign: "center",
		color: colors.textMedium,
		marginTop: 40,
		fontSize: 16,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 5,
		marginTop: 15,
		marginBottom: 5,
		borderBottomWidth: 2,
		borderBottomColor: colors.borderLight,
	},
	sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	sectionTitle: { fontSize: 18, fontWeight: "bold", color: colors.textDark },
	sectionSubtotal: { fontSize: 18, fontWeight: "900", color: colors.primary },

	// Item Row
	itemRow: {
		flexDirection: "row",
		backgroundColor: colors.surfaceWhite,
		padding: 12,
		borderRadius: 10,
		marginBottom: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		elevation: 1,
	},
	itemQtyBox: {
		backgroundColor: colors.backgroundMedium,
		borderRadius: 6,
		width: 35,
		height: 35,
		justifyContent: "center",
		alignItems: "center",
		marginRight: 12,
	},
	itemQtyText: { fontWeight: "bold", fontSize: 16, color: colors.textDark },
	itemDetails: { flex: 1, justifyContent: "center" },
	itemName: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.textDark,
		marginBottom: 2,
	},
	itemSeatLabel: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.primary,
		marginBottom: 2,
	},
	itemInstructions: { fontSize: 13, color: colors.statusDanger, marginTop: 4 },
	itemTrailing: { alignItems: "flex-end", justifyContent: "space-between" },
	itemPrice: {
		fontSize: 16,
		fontWeight: "bold",
		color: colors.textDark,
		marginTop: 4,
	},

	// Badges
	statusBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 4,
		marginTop: 6,
	},
	badgeNew: { backgroundColor: colors.statusWarning + "20" },
	badgeTextNew: {
		color: colors.statusWarning,
		fontSize: 12,
		fontWeight: "bold",
	},
	badgeSent: { backgroundColor: colors.statusSuccess + "20" },
	badgeTextSent: {
		color: colors.statusSuccess,
		fontSize: 12,
		fontWeight: "bold",
	},
	badgeReady: { backgroundColor: colors.statusSuccess + "24" },
	badgeTextReady: {
		color: colors.statusSuccess,
		fontSize: 12,
		fontWeight: "bold",
	},
	badgeServed: { backgroundColor: colors.primary + "18" },
	badgeTextServed: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: "bold",
	},
	badgePaid: { backgroundColor: colors.primary + "18" },
	badgeTextPaid: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: "bold",
	},

	// Footer
	footer: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: colors.surfaceWhite,
		padding: 20,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.1,
		elevation: 10,
	},
	footerCompactHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	footerCompactLabel: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		textTransform: "uppercase",
	},
	footerCompactAmount: {
		fontSize: 22,
		fontWeight: "900",
		color: colors.primary,
		marginTop: 2,
	},
	totalsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 15,
	},
	totalLabel: { fontSize: 20, fontWeight: "bold", color: colors.textDark },
	totalAmount: { fontSize: 24, fontWeight: "900", color: colors.primary },
	actionRow: { flexDirection: "row", gap: 15 },
	emailInput: {
		backgroundColor: colors.backgroundMedium,
		padding: 12,
		borderRadius: 8,
		marginBottom: 15,
		fontSize: 16,
		color: colors.textDark,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},

	// Buttons
	closeBtn: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.statusDanger,
		padding: 15,
		borderRadius: 10,
	},
	closeBtnText: {
		color: colors.surfaceWhite,
		fontSize: 16,
		fontWeight: "bold",
	},
	priceContainer: {
		alignItems: "flex-end",
		justifyContent: "center",
	},
	originalPriceText: {
		fontSize: 14,
		color: colors.textLight,
		textDecorationLine: "line-through",
		marginBottom: 2,
	},
	discountText: {
		color: colors.statusSuccess,
	},
	noServerWarning: {
		color: colors.statusDanger,
		textAlign: "center",
		fontSize: 14,
		fontWeight: "600",
		marginBottom: 12,
	},
	modifiersContainer: {
		marginTop: 4,
	},
	modifierText: {
		fontSize: 12,
		color: colors.textMedium,
		lineHeight: 17,
		marginTop: 2,
	},
	seatSummaryPanel: {
		marginBottom: 14,
	},
	seatSummaryHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	seatSummaryTitle: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
	},
	paidSummaryText: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.statusSuccess,
	},
	seatSummaryChip: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
		marginRight: 8,
		minWidth: 104,
	},
	seatSummaryName: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
	},
	seatSummaryAmount: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 2,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.45)",
		justifyContent: "flex-end",
	},
	closeoutSheet: {
		backgroundColor: colors.surfaceWhite,
		borderTopLeftRadius: 18,
		borderTopRightRadius: 18,
		padding: 20,
		paddingBottom: Platform.OS === "ios" ? 34 : 20,
		maxHeight: "88%",
	},
	closeoutScroll: {
		maxHeight: 520,
	},
	closeoutScrollContent: {
		paddingBottom: 8,
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 16,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "800",
		color: colors.textDark,
	},
	paymentMethodRow: {
		flexDirection: "row",
		gap: 10,
		marginBottom: 14,
	},
	paymentMethodButton: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
	},
	paymentMethodButtonActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	paymentMethodText: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.textMedium,
		textAlign: "center",
	},
	paymentMethodTextActive: {
		color: colors.surfaceWhite,
	},
	modalTotalsBox: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 12,
		padding: 12,
		marginBottom: 14,
	},
	closeoutSeatSelector: {
		marginBottom: 12,
	},
	closeoutSeatTitle: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
		marginBottom: 8,
	},
	closeoutSeatChip: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
		marginRight: 8,
		minWidth: 110,
	},
	closeoutSeatChipActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	closeoutSeatChipText: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
	},
	closeoutSeatChipTextActive: {
		color: colors.surfaceWhite,
	},
	closeoutSeatAmount: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMedium,
		marginTop: 2,
	},
	closeoutSeatItemsBox: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 10,
		padding: 10,
		marginBottom: 12,
	},
	closeoutSeatItemsGroup: {
		marginBottom: 10,
	},
	closeoutSeatItemsHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 5,
	},
	closeoutSeatItemsTitle: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.textDark,
	},
	closeoutSeatItemsTotal: {
		fontSize: 13,
		fontWeight: "900",
		color: colors.primary,
	},
	closeoutSeatItemRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 3,
	},
	closeoutSeatItemName: {
		flex: 1,
		fontSize: 12,
		color: colors.textMedium,
		marginRight: 8,
	},
	closeoutSeatItemAmount: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textDark,
	},
	modalInput: {
		backgroundColor: colors.backgroundMedium,
		padding: 12,
		borderRadius: 8,
		marginBottom: 10,
		fontSize: 16,
		color: colors.textDark,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	notesInput: {
		minHeight: 72,
	},
	confirmCloseButton: {
		backgroundColor: colors.statusDanger,
		padding: 15,
		borderRadius: 10,
		alignItems: "center",
		marginTop: 4,
	},
	confirmCloseButtonText: {
		color: colors.surfaceWhite,
		fontSize: 16,
		fontWeight: "800",
	},
	summaryBlock: {
		marginBottom: 15,
	},
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	summaryLabel: {
		fontSize: 15,
		color: colors.textMedium,
	},
	summarySubLabel: {
		fontSize: 11,
		color: colors.textMedium,
		marginTop: 2,
	},
	summaryValue: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textDark,
	},
	summaryDivider: {
		height: 1,
		backgroundColor: colors.borderLight,
		marginVertical: 10,
	},
	cashSummaryBox: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.borderLight,
		padding: 12,
		marginBottom: 10,
	},
	terminalInfoBox: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary + "10",
		borderWidth: 1,
		borderColor: colors.primary + "30",
		borderRadius: 10,
		padding: 12,
		marginBottom: 10,
	},
	terminalInfoText: {
		flex: 1,
		color: colors.textDark,
		fontSize: 12,
		fontWeight: "700",
		lineHeight: 17,
		marginLeft: 10,
	},
	helperText: {
		color: colors.textMedium,
		fontSize: 12,
		lineHeight: 17,
		marginTop: -2,
		marginBottom: 10,
	},
});

export default ManagePartyScreen;
