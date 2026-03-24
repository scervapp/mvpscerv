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

	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) return;

		// 1. Fetch ALL tables for this restaurant
		const fetchTables = async () => {
			try {
				const tablesRef = collection(db, `restaurants/${restaurantId}/tables`);
				const snapshot = await getDocs(tablesRef);
				const tableData = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setTables(tableData);
			} catch (error) {
				console.error("Error fetching tables:", error);
				Alert.alert(
					t("error", "Error"),
					t("error_load_tables", "Could not load restaurant tables."),
				);
			}
		};

		// 2. Listen for ACTIVE parties to see which tables are occupied
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

	const handleSeatTable = async (table) => {
		if (activeTableIds.has(table.id)) {
			Alert.alert(
				t("table_occupied", "Table Occupied"),
				t("table_already_seated", "This table is already seated."),
			);
			return;
		}

		const tableName =
			table.name || `${t("table", "Table")} ${table.tableNumber}`;

		Alert.alert(
			t("seat_table", "Seat Table"),
			`${t("open_new_tab", "Open a new tab for")} ${tableName}?`,
			[
				{ text: t("cancel", "Cancel"), style: "cancel" },
				{
					text: t("seat_table", "Seat Table"),
					onPress: async () => {
						setIsSeating(true);
						try {
							const createPartySession = httpsCallable(
								functions,
								"createPartySession",
							);
							const result = await createPartySession({
								restaurantId: currentUserData.uid,
								tableId: table.id,
								existingPartyId: null,
								isManualSeat: true,
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
					},
				},
			],
		);
	};

	const renderTable = ({ item }) => {
		const isOccupied = activeTableIds.has(item.id);

		return (
			<TouchableOpacity
				style={[
					styles.tableCard,
					isOccupied ? styles.occupiedCard : styles.availableCard,
				]}
				disabled={isOccupied || isSeating}
				onPress={() => handleSeatTable(item)}
			>
				<View style={styles.cardHeader}>
					<Text style={styles.tableName}>
						{item.name || `${t("table", "Table")} ${item.tableNumber}`}
					</Text>
					{isOccupied && (
						<Ionicons name="people" size={20} color={colors.surfaceWhite} />
					)}
				</View>
				<Text
					style={[
						styles.statusText,
						isOccupied && { color: colors.surfaceWhite },
					]}
				>
					{isOccupied ? t("occupied", "Occupied") : t("available", "Available")}
				</Text>
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
				data={tables}
				keyExtractor={(item) => item.id}
				renderItem={renderTable}
				numColumns={2}
				contentContainerStyle={styles.listContainer}
			/>
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
	tableCard: {
		flex: 1,
		margin: 8,
		padding: 20,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 120,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	availableCard: {
		backgroundColor: colors.surfaceWhite,
		borderWidth: 2,
		borderColor: colors.primary,
	},
	occupiedCard: {
		backgroundColor: colors.textMedium,
		opacity: 0.7,
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
		color: colors.textDark,
	},
	statusText: {
		fontSize: 14,
		color: colors.primary,
		fontWeight: "600",
	},
});

export default ManualSeatScreen;
