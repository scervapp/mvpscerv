// screens/restaurant/ManualSeatScreen.js
import React, { useState, useEffect, useContext } from "react";
import {
	View,
	Text,
	FlatList,
	TouchableOpacity,
	StyleSheet,
	SafeAreaView,
	ActivityIndicator,
	Alert,
	Modal,
	TextInput,
	KeyboardAvoidingView,
	Platform,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";
import {
	collection,
	query,
	where,
	getDocs,
	onSnapshot,
} from "@react-native-firebase/firestore";
import { httpsCallable } from "@react-native-firebase/functions";
import { functions } from "../../config/firebase.native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import colors from "../../utils/styles/appStyles";

const ManualSeatScreen = () => {
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);
	const { t } = useTranslation();

	const [tables, setTables] = useState([]);
	const [activeTableIds, setActiveTableIds] = useState(new Set());
	const [isLoading, setIsLoading] = useState(true);
	const [isSeating, setIsSeating] = useState(false);

	// 🚨 NEW: State for the Guest Name Modal
	const [isModalVisible, setIsModalVisible] = useState(false);
	const [selectedTable, setSelectedTable] = useState(null);
	const [guestName, setGuestName] = useState("");

	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) return;

		const fetchTables = async () => {
			try {
				const tablesRef = collection(db, `restaurants/${restaurantId}/tables`);
				const snapshot = await getDocs(tablesRef);
				const tableData = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));

				tableData.sort((a, b) => {
					const numA =
						a.tableNumber ||
						parseInt((a.name || "").match(/\d+/)?.[0] || 0, 10);
					const numB =
						b.tableNumber ||
						parseInt((b.name || "").match(/\d+/)?.[0] || 0, 10);
					return numA - numB;
				});

				setTables(tableData);
			} catch (error) {
				console.error("Error fetching tables:", error);
				Alert.alert(
					t("error", "Error"),
					t("error_load_tables", "Could not load restaurant tables."),
				);
			}
		};

		const q = query(
			collection(db, "parties"),
			where("restaurantId", "==", restaurantId),
			where("status", "==", "active"),
		);

		const unsubscribe = onSnapshot(q, (snapshot) => {
			const occupiedIds = new Set(
				snapshot.docs.map((doc) => doc.data().tableId),
			);
			setActiveTableIds(occupiedIds);
			setIsLoading(false);
		});

		fetchTables();
		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const availableTables = tables.filter((table) => {
		const isOccupiedByParty = activeTableIds.has(table.id);
		const isStatusAvailable = !table.status || table.status === "available";
		return !isOccupiedByParty && isStatusAvailable;
	});

	// 🚨 UPDATED: Open the modal instead of the Alert
	const handleSeatTableClick = (table) => {
		setSelectedTable(table);
		setGuestName(""); // Reset the input field
		setIsModalVisible(true);
	};

	// 🚨 NEW: The actual function that fires when they confirm the name
	const confirmSeatTable = async () => {
		if (!selectedTable) return;

		setIsModalVisible(false); // Hide modal immediately for better UX
		setIsSeating(true);

		try {
			const createPartySession = httpsCallable(functions, "createPartySession");
			const result = await createPartySession({
				restaurantId: currentUserData.uid,
				tableId: selectedTable.id,
				existingPartyId: null,
				isManualSeat: true,
				guestName: guestName.trim() || t("guest", "Guest"),
			});

			if (result.data.success) {
				navigation.replace("ManagePartyScreen", {
					partyId: result.data.partyId,
				});
			}
		} catch (error) {
			console.error("Manual Seat Error:", error);
			Alert.alert(
				t("error", "Error"),
				t("error_create_session", "Could not create party session."),
			);
		} finally {
			setIsSeating(false);
		}
	};

	const renderTable = ({ item }) => {
		return (
			<TouchableOpacity
				style={[styles.tableCard, styles.availableCard]}
				disabled={isSeating}
				onPress={() => handleSeatTableClick(item)} // Trigger modal
			>
				<View style={styles.cardHeader}>
					<Text style={styles.tableName}>
						{item.name || `${t("table", "Table")} ${item.tableNumber}`}
					</Text>
					<Ionicons name="checkmark-circle-outline" size={20} color="#065F46" />
				</View>
				<Text style={styles.statusText}>{t("available", "Available")}</Text>
			</TouchableOpacity>
		);
	};

	if (isLoading) {
		return (
			<View style={styles.centerContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.header}>
				<TouchableOpacity
					onPress={() => navigation.goBack()}
					style={styles.backButton}
				>
					<Ionicons name="arrow-back" size={24} color={colors.textDark} />
				</TouchableOpacity>
				<Text style={styles.headerTitle}>
					{t("select_table_to_seat", "Select Table to Seat")}
				</Text>
				<View style={{ width: 24 }} />
			</View>

			<FlatList
				data={availableTables}
				keyExtractor={(item) => item.id}
				renderItem={renderTable}
				numColumns={2}
				contentContainerStyle={styles.listContainer}
				ListEmptyComponent={
					<View style={styles.emptyContainer}>
						<Ionicons
							name="restaurant-outline"
							size={48}
							color={colors.textLight}
						/>
						<Text style={styles.emptyText}>
							{t("no_tables_available", "No tables are currently available.")}
						</Text>
					</View>
				}
			/>

			{/* 🚨 NEW: The Name Entry Modal */}
			{/* 🚨 THE FULLY TRANSLATED NAME ENTRY MODAL */}
			<Modal
				visible={isModalVisible}
				transparent={true}
				animationType="fade"
				onRequestClose={() => setIsModalVisible(false)}
			>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.modalOverlay}
				>
					<View style={styles.modalContent}>
						<View style={styles.modalHeader}>
							<Text style={styles.modalTitle}>
								{t("seat_table_title", "Seat")} {selectedTable?.name}
							</Text>
							<TouchableOpacity onPress={() => setIsModalVisible(false)}>
								<Ionicons name="close" size={24} color={colors.textMedium} />
							</TouchableOpacity>
						</View>

						<Text style={styles.modalSubtitle}>
							{t(
								"enter_guest_name_for_tab",
								"Enter the guest's name for this tab.",
							)}
						</Text>

						<TextInput
							style={styles.textInput}
							placeholder={t(
								"guest_name_placeholder",
								"e.g. Juan Perez, Familia Smith",
							)}
							placeholderTextColor={colors.textLight}
							value={guestName}
							onChangeText={setGuestName}
							autoFocus={true}
							returnKeyType="done"
							onSubmitEditing={confirmSeatTable}
						/>

						<TouchableOpacity
							style={styles.confirmButton}
							onPress={confirmSeatTable}
							disabled={isSeating}
						>
							{isSeating ? (
								<ActivityIndicator size="small" color="#fff" />
							) : (
								<Text style={styles.confirmButtonText}>
									{t("seat_table", "Seat Table")}
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
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 20,
		backgroundColor: colors.surfaceWhite,
		borderBottomWidth: 1,
		borderColor: colors.borderLight,
	},
	headerTitle: { fontSize: 20, fontWeight: "bold", color: colors.textDark },
	backButton: { padding: 5 },
	listContainer: { padding: 15 },
	emptyContainer: {
		marginTop: 50,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyText: {
		marginTop: 15,
		fontSize: 16,
		color: colors.textMedium,
		textAlign: "center",
	},
	tableCard: {
		flex: 1,
		margin: 8,
		padding: 20,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 110,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
		borderWidth: 2,
	},
	availableCard: {
		backgroundColor: "#D1FAE5",
		borderColor: "#6EE7B7",
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 8,
	},
	tableName: {
		fontSize: 18,
		fontWeight: "bold",
		color: "#065F46",
	},
	statusText: {
		fontSize: 14,
		color: "#065F46",
		fontWeight: "700",
	},
	// 🚨 MODAL STYLES
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	modalContent: {
		width: "100%",
		backgroundColor: colors.surfaceWhite,
		borderRadius: 16,
		padding: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 10,
		elevation: 10,
	},
	modalHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
	},
	modalSubtitle: {
		fontSize: 14,
		color: colors.textMedium,
		marginBottom: 20,
	},
	textInput: {
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		padding: 15,
		fontSize: 16,
		color: colors.textDark,
		backgroundColor: colors.backgroundLight,
		marginBottom: 20,
	},
	confirmButton: {
		backgroundColor: colors.primary,
		padding: 15,
		borderRadius: 8,
		alignItems: "center",
	},
	confirmButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default ManualSeatScreen;
