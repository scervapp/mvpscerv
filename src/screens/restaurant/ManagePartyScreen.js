import React, { useEffect, useState, useMemo } from "react";
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	TouchableOpacity,
	FlatList,
	ActivityIndicator,
	Alert,
	TextInput,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { db, functions } from "../../config/firebase";
import {
	doc,
	onSnapshot,
	updateDoc,
	arrayRemove,
} from "@react-native-firebase/firestore";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";

const ManagePartyScreen = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { t } = useTranslation();
	const { partyId } = route.params;

	const [partyData, setPartyData] = useState(null);
	const [basketItems, setBasketItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isClosing, setIsClosing] = useState(false);
	const [receiptEmail, setReceiptEmail] = useState("");

	// 1. Listen to the Party and the Shared Basket simultaneously
	useEffect(() => {
		if (!partyId) return;

		const partyRef = doc(db, "parties", partyId);
		const basketRef = doc(db, "shared_baskets", partyId);

		const unsubscribeParty = onSnapshot(partyRef, (doc) => {
			if (doc.exists) setPartyData({ id: doc.id, ...doc.data() });
		});

		const unsubscribeBasket = onSnapshot(basketRef, (doc) => {
			if (doc.exists) setBasketItems(doc.data().items || []);
			setIsLoading(false);
		});

		return () => {
			unsubscribeParty();
			unsubscribeBasket();
		};
	}, [partyId]);

	// 2. Calculate Totals
	const officiallyOrderedItems = useMemo(() => {
		return basketItems.filter((item) => item.status && item.status !== "new");
	}, [basketItems]);

	// 🚨 THE FIX: Calculate the total ONLY using the officially ordered items
	const tableTotal = useMemo(() => {
		return officiallyOrderedItems.reduce((sum, item) => {
			const itemPrice = parseFloat(item.price || 0);
			const quantity = parseInt(item.quantity || 1, 10);
			return sum + itemPrice * quantity;
		}, 0);
	}, [officiallyOrderedItems]);

	// 3. Handlers
	const handleCloseTable = () => {
		Alert.alert(
			t("settle_and_close", "Settle & Close Table"),
			t("how_was_this_paid", "How was this table's bill settled?"),
			[
				{ text: t("cancel", "Cancel"), style: "cancel" },
				{
					// Option 1: They paid with physical Cash
					text: t("cash", "Paid with Cash"),
					onPress: () => executeCloseTable("cash"),
				},
				{
					// Option 2: They paid with the restaurant's physical credit card swiper
					text: t("card_terminal", "External Card Terminal"),
					onPress: () => executeCloseTable("external_terminal"),
				},
			],
		);
	};

	// Helper function that actually triggers the backend
	const executeCloseTable = async (paymentMethod) => {
		setIsClosing(true);
		try {
			const closeTableCloudFunction = httpsCallable(
				functions,
				"closePartyTable",
			);

			// 🚨 UPDATE THIS PAYLOAD to include the receiptEmail
			const result = await closeTableCloudFunction({
				partyId,
				paymentMethod,
				receiptEmail: receiptEmail.trim(), // Pass the email to the backend!
			});

			if (result.data.success) {
				navigation.goBack();
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
		navigation.navigate("ServerMenuScreen", {
			partyId: partyId,
			restaurantId: partyData.restaurantId,
			tableName: partyData.table?.name,
			tableId: partyData.table?.id, // <-- ADDED THIS
			serverObj: partyData.server, // <-- ADDED THIS
		});
	};
	const handleRemoveItem = (itemToRemove) => {
		Alert.alert(
			t("void_item", "Void Item"),
			t(
				"confirm_void",
				`Are you sure you want to remove ${itemToRemove.dishName || itemToRemove.name} from the bill?`,
			),
			[
				{ text: t("cancel", "Cancel"), style: "cancel" },
				{
					text: t("remove", "Remove"),
					style: "destructive", // Makes the button red on iOS
					onPress: async () => {
						try {
							const basketRef = doc(db, "shared_baskets", partyId);
							// arrayRemove looks for the EXACT object match and deletes it
							await updateDoc(basketRef, {
								items: arrayRemove(itemToRemove),
								lastUpdated: new Date(),
							});
						} catch (error) {
							console.error("Error removing item:", error);
							Alert.alert(
								t("error", "Error"),
								t("could_not_remove", "Could not remove the item."),
							);
						}
					},
				},
			],
		);
	};

	// 4. Render Individual Items
	const renderOrderItem = ({ item }) => {
		const isSent =
			item.status === "sent" ||
			item.status === "preparing" ||
			item.status === "ready";

		// Check if a server ordered it. If so, display the table's guest name instead.
		const isServerOrder = item.orderedByPipName?.startsWith("Server:");
		const displayOwner = isServerOrder
			? partyData.hostName || t("table", "Table")
			: item.orderedByPipName || item.customerName || t("guest", "Guest");

		return (
			<View style={styles.itemRow}>
				<View style={styles.itemQtyBox}>
					<Text style={styles.itemQtyText}>{item.quantity}</Text>
				</View>
				<View style={styles.itemDetails}>
					<Text style={styles.itemName}>{item.dishName || item.name}</Text>

					{/* 🚨 UPDATED OWNER DISPLAY */}
					<Text style={styles.itemOwner}>
						{t("for", "For")}: {displayOwner}
					</Text>

					{item.specialInstructions ? (
						<Text style={styles.itemInstructions}>
							"{item.specialInstructions}"
						</Text>
					) : null}
				</View>

				<View style={styles.itemTrailing}>
					<View style={styles.priceAndActionRow}>
						<Text style={styles.itemPrice}>
							${(item.price * item.quantity).toFixed(2)}
						</Text>
						<TouchableOpacity
							onPress={() => handleRemoveItem(item)}
							style={styles.trashBtn}
						>
							<Ionicons
								name="trash-outline"
								size={22}
								color={colors.statusDanger}
							/>
						</TouchableOpacity>
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
			<FlatList
				// 🚨 THE FIX: Feed the filtered list into the UI, not the raw basket!
				data={officiallyOrderedItems}
				keyExtractor={(item, index) => item.id || index.toString()}
				renderItem={renderOrderItem}
				contentContainerStyle={styles.listContent}
				ListEmptyComponent={
					<Text style={styles.emptyText}>
						{t("no_items_ordered_yet", "No items ordered yet.")}
					</Text>
				}
			/>

			{/* FOOTER ACTION BAR */}
			<View style={styles.footer}>
				<View style={styles.totalsRow}>
					<Text style={styles.totalLabel}>{t("total", "Total")}:</Text>
					<Text style={styles.totalAmount}>${tableTotal.toFixed(2)}</Text>
				</View>

				{/* 🚨 ADD THE EMAIL INPUT HERE */}
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

				<View style={styles.actionRow}>
					<TouchableOpacity
						style={[styles.closeBtn, isClosing && { opacity: 0.7 }]}
						onPress={handleCloseTable}
						disabled={isClosing}
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

	// List
	listContent: { padding: 15, paddingBottom: 100 },
	emptyText: {
		textAlign: "center",
		color: colors.textMedium,
		marginTop: 40,
		fontSize: 16,
	},

	// Item Row
	itemRow: {
		flexDirection: "row",
		backgroundColor: colors.surfaceWhite,
		padding: 12,
		borderRadius: 10,
		marginBottom: 10,
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
	itemOwner: { fontSize: 13, color: colors.textMedium, fontStyle: "italic" },
	itemInstructions: { fontSize: 13, color: colors.statusDanger, marginTop: 4 },
	itemTrailing: { alignItems: "flex-end", justifyContent: "space-between" },
	itemPrice: { fontSize: 16, fontWeight: "bold", color: colors.textDark },

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
	printBtn: {
		flex: 1,
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.backgroundMedium,
		padding: 15,
		borderRadius: 10,
	},
	printBtnText: {
		marginLeft: 8,
		fontSize: 16,
		fontWeight: "600",
		color: colors.textDark,
	},
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
	emailInput: {
		backgroundColor: colors.backgroundMedium,
		padding: 12,
		borderRadius: 8,
		marginBottom: 15, // Pushes the close button down slightly
		fontSize: 16,
		color: colors.textDark,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	closeBtn: {
		flex: 1, // Changed from 2 to 1 so it fills the whole row evenly
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
		priceAndActionRow: {
			flexDirection: "row",
			alignItems: "center",
			gap: 12,
		},
		trashBtn: {
			padding: 4,
		},
	},
});

export default ManagePartyScreen;
