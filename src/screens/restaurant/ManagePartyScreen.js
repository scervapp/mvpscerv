import React, { useEffect, useState, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	TouchableOpacity,
	SectionList,
	ActivityIndicator,
	Alert,
	TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { db, functions } from "../../config/firebase";
import { doc, onSnapshot } from "@react-native-firebase/firestore";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";

const ManagePartyScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { t, i18n } = useTranslation();
	const currentLang = i18n.language?.substring(0, 2) || "en";
	const { partyId } = route.params;

	const [partyData, setPartyData] = useState(null);
	const [basketItems, setBasketItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isClosing, setIsClosing] = useState(false);
	const [receiptEmail, setReceiptEmail] = useState("");

	const hasServer = !!partyData?.server && !!partyData?.server?.name;

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

	// 2. Filter & Group Items
	const officiallyOrderedItems = useMemo(() => {
		return (basketItems || []).filter(
			(item) => item?.status && item.status !== "new",
		);
	}, [basketItems]);

	const groupedOrders = useMemo(() => {
		const groups = {};
		officiallyOrderedItems.forEach((item) => {
			const isServerOrder = item.orderedByPipName?.startsWith("Server:");
			const ownerName = isServerOrder
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

	const tableTotal = useMemo(() => {
		return groupedOrders.reduce((sum, group) => sum + group.subtotal, 0);
	}, [groupedOrders]);

	// 3. Handlers
	const handleCloseTable = () => {
		Alert.alert(
			t("settle_and_close", "Settle & Close Table"),
			t("how_was_this_paid", "How was this table's bill settled?"),
			[
				{ text: t("cancel", "Cancel"), style: "cancel" },
				{
					text: t("cash", "Paid with Cash"),
					onPress: () => executeCloseTable("cash"),
				},
				{
					text: t("card_terminal", "External Card Terminal"),
					onPress: () => executeCloseTable("external_terminal"),
				},
			],
		);
	};

	const executeCloseTable = async (paymentMethod) => {
		setIsClosing(true);
		try {
			const closeTableCloudFunction = httpsCallable(
				functions,
				"closePartyTable",
			);
			const result = await closeTableCloudFunction({
				partyId,
				paymentMethod,
				receiptEmail: receiptEmail.trim(),
			});

			if (result.data.success) {
				navigation.goBack(); // 🚨 REVERTED: Go straight back to the floor map
			} else {
				throw new Error("Failed to close table.");
			}
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
			<Text style={styles.sectionSubtotal}>${section.subtotal.toFixed(2)}</Text>
		</View>
	);

	const renderOrderItem = ({ item }) => {
		const isSent =
			item.status === "sent" ||
			item.status === "preparing" ||
			item.status === "ready";

		// Logic to detect a discount
		const hasDiscount =
			item.discountedPrice !== null &&
			item.discountedPrice !== undefined &&
			item.discountedPrice < item.price;

		const quantity = parseInt(item.quantity || 1, 10);
		const originalTotal = parseFloat(item.price || 0) * quantity;
		const finalTotal = hasDiscount
			? parseFloat(item.discountedPrice) * quantity
			: originalTotal;

		return (
			<View style={styles.itemRow}>
				<View style={styles.itemQtyBox}>
					<Text style={styles.itemQtyText}>{item.quantity}</Text>
				</View>
				<View style={styles.itemDetails}>
					<Text style={styles.itemName}>{item.dishName || item.name}</Text>
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
								${originalTotal.toFixed(2)}
							</Text>
						)}
						<Text
							style={[styles.itemPrice, hasDiscount && styles.discountText]}
						>
							${finalTotal.toFixed(2)}
						</Text>
					</View>
					<View
						style={[
							styles.statusBadge,
							isSent ? styles.badgeSent : styles.badgeNew,
						]}
					>
						<Text
							style={[
								styles.badgeText,
								isSent ? styles.badgeTextSent : styles.badgeTextNew,
							]}
						>
							{isSent ? t("sent", "Sent") : t("new", "New")}
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
					onPress={() => navigation.goBack()}
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
				<TouchableOpacity onPress={handleAddItemManually} style={styles.addBtn}>
					<Ionicons name="add" size={24} color={colors.primary} />
				</TouchableOpacity>
			</View>

			{/* ORDER LIST */}
			<SectionList
				sections={groupedOrders}
				keyExtractor={(item, index) => item.id || index.toString()}
				renderItem={renderOrderItem}
				renderSectionHeader={renderSectionHeader}
				contentContainerStyle={styles.listContent}
				stickySectionHeadersEnabled={false}
				ListEmptyComponent={
					<Text style={styles.emptyText}>
						{t("no_items_ordered_yet", "No items ordered yet.")}
					</Text>
				}
			/>

			{/* FOOTER ACTION BAR */}
			<View style={styles.footer}>
				<View style={styles.totalsRow}>
					<Text style={styles.totalLabel}>
						{t("table_total", "Table Total")}:
					</Text>
					<Text style={styles.totalAmount}>${tableTotal.toFixed(2)}</Text>
				</View>

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
							!hasServer && { backgroundColor: colors.textMedium }, // Grays out the button
						]}
						onPress={handleCloseTable}
						disabled={isClosing || !hasServer} // Disables the press action
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
});

export default ManagePartyScreen;
