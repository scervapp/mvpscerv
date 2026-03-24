import React, { useEffect, useState, useContext, useCallback } from "react";
import {
	View,
	Text,
	FlatList,
	TouchableOpacity,
	SafeAreaView,
	ActivityIndicator,
	StyleSheet,
	RefreshControl,
	Alert,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import { db } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
	onSnapshot,
	doc,
	updateDoc,
	collection,
	query,
	where,
	getDocs,
} from "@react-native-firebase/firestore";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";

// 🚨 IMPORT YOUR MODAL
import ServerAssignmentModal from "../../components/restaurant/ServerAssignmentModal";

const RestaurantActiveTables = () => {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const { currentUserData } = useContext(AuthContext);

	const [activeParties, setActiveParties] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	// --- Modal State ---
	const [isServerModalVisible, setIsServerModalVisible] = useState(false);
	const [selectedPartyForAssignment, setSelectedPartyForAssignment] =
		useState(null);
	const [restaurantServers, setRestaurantServers] = useState([]);

	// 1. Listen for Active Parties
	useEffect(() => {
		const restaurantId = currentUserData?.uid;
		if (!restaurantId) {
			setError(
				t(
					"your_user_profile_is_not_linked_to_a_restaurant",
					"Profile not linked to a restaurant.",
				),
			);
			setIsLoading(false);
			return;
		}

		const q = db
			.collection("parties")
			.where("restaurantId", "==", restaurantId)
			.where("status", "==", "active")
			.orderBy("createdAt", "desc");

		const unsubscribe = onSnapshot(
			q,
			(querySnapshot) => {
				const partiesData = querySnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setActiveParties(partiesData);
				setError(null);
				setIsLoading(false);
				setIsRefreshing(false);
			},
			(err) => {
				console.error("RestaurantActiveTables: Snapshot error:", err);
				if (err.message.includes("index")) {
					console.warn("Index is building, please wait...");
				} else {
					setError(
						t(
							"failed_to_listen_for_active_tables",
							"Failed to load active tables.",
						),
					);
				}
				setIsLoading(false);
				setIsRefreshing(false);
			},
		);

		return () => unsubscribe();
	}, [currentUserData?.uid, t]);

	// 2. Fetch the Staff/Servers List once when the screen loads
	useEffect(() => {
		const fetchServers = async () => {
			const restaurantId = currentUserData?.uid;
			if (!restaurantId) return;

			try {
				// 🚨 THE FIX: Point to the 'employees' subcollection and check 'jobTitle'
				const staffQuery = query(
					collection(db, `restaurants/${restaurantId}/employees`),
					where("jobTitle", "==", "server"), // Note: Make sure "server" matches the exact casing in your DB (e.g., "Server" vs "server")
				);

				const staffSnapshot = await getDocs(staffQuery);
				const staffList = staffSnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));

				setRestaurantServers(staffList);
			} catch (err) {
				console.error("Error fetching staff:", err);
			}
		};
		fetchServers();
	}, [currentUserData?.uid]);

	const onRefresh = useCallback(() => {
		setIsRefreshing(true);
		setTimeout(() => setIsRefreshing(false), 1000);
	}, []);

	// 3. Handle Card Taps (Manage vs Assign)
	const handleTableTap = (party) => {
		const needsServer = !party.server || party.server.id === "unassigned";

		if (needsServer) {
			// Pop open the assignment modal
			setSelectedPartyForAssignment(party);
			setIsServerModalVisible(true);
		} else {
			// 🚨 THE FIX: Uncommented this line to actually navigate!
			navigation.navigate("ManagePartyScreen", { partyId: party.id });
		}
	};

	// 4. Update the Firestore Document when a server is assigned
	const executeServerAssignment = async (selectedServer) => {
		if (!selectedPartyForAssignment || !selectedServer) return;

		try {
			const partyRef = doc(db, "parties", selectedPartyForAssignment.id);

			await updateDoc(partyRef, {
				server: {
					id: selectedServer.id,
					name: `${selectedServer.firstName} ${selectedServer.lastName}`.trim(),
				},
				updatedAt: new Date(),
			});

			// The onSnapshot listener will automatically flip the card back to white!
			setIsServerModalVisible(false);
			setSelectedPartyForAssignment(null);
		} catch (err) {
			console.error("Error assigning server:", err);
			Alert.alert("Error", "Could not assign server to this table.");
		}
	};

	// --- Inline Component for the Active Table Card ---
	const renderPartyCard = ({ item }) => {
		const partySize = item.guestPips ? item.guestPips.length : 1;
		const tableName = item.table?.name || t("unknown_table", "Unknown Table");
		const hostName = item.hostName || t("guest", "Guest");

		// Is it self-seated without a server?
		const needsServer = !item.server || item.server.id === "unassigned";

		const seatedTime = item.createdAt?.toDate
			? item.createdAt
					.toDate()
					.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
			: t("just_now", "Just now");

		return (
			<TouchableOpacity
				style={[styles.cardContainer, needsServer && styles.cardNeedsAttention]}
				activeOpacity={0.8}
				onPress={() => handleTableTap(item)}
			>
				<View
					style={[styles.cardHeader, needsServer && styles.borderLightInverted]}
				>
					<View
						style={[
							styles.tableBadge,
							needsServer && styles.tableBadgeInverted,
						]}
					>
						<Text
							style={[styles.tableBadgeText, needsServer && styles.textDark]}
						>
							{tableName}
						</Text>
					</View>
					<Text style={needsServer ? styles.textWhite : styles.timeText}>
						{t("seated_at", "Seated:")} {seatedTime}
					</Text>
				</View>

				<View style={styles.cardBody}>
					<View style={styles.hostInfo}>
						<Ionicons
							name="person-circle"
							size={24}
							color={needsServer ? colors.surfaceWhite : colors.primary}
						/>
						<Text
							style={[styles.hostNameText, needsServer && styles.textWhite]}
						>
							{hostName}
						</Text>
						<Text style={[styles.hostLabel, needsServer && styles.textWhite70]}>
							({t("host", "Host")})
						</Text>
					</View>

					<View
						style={[
							styles.partySizeBadge,
							needsServer && styles.partySizeBadgeInverted,
						]}
					>
						<Ionicons
							name="people"
							size={16}
							color={needsServer ? colors.surfaceWhite : colors.textDark}
						/>
						<Text
							style={[styles.partySizeText, needsServer && styles.textWhite]}
						>
							{partySize}
						</Text>
					</View>
				</View>

				<View style={styles.cardFooter}>
					{/* 🚨 THE FIX: Wrapped the server text in its own TouchableOpacity */}
					<TouchableOpacity
						style={styles.serverEditContainer}
						onPress={() => {
							// Instantly pop the modal to reassign, even if already assigned!
							setSelectedPartyForAssignment(item);
							setIsServerModalVisible(true);
						}}
					>
						<MaterialCommunityIcons
							name={
								needsServer ? "alert-circle-outline" : "room-service-outline"
							}
							size={18}
							color={needsServer ? colors.surfaceWhite : colors.textMedium}
						/>
						<Text
							style={[styles.serverText, needsServer && styles.textWhiteBold]}
						>
							{" "}
							{needsServer
								? t("needs_server", "ACTION: ASSIGN SERVER")
								: item.server?.name}
						</Text>

						{/* Show a little edit pencil if it's already assigned */}
						{!needsServer && (
							<MaterialCommunityIcons
								name="pencil-outline"
								size={16}
								color={colors.textMedium}
								style={{ marginLeft: 6 }}
							/>
						)}
					</TouchableOpacity>

					<Ionicons
						name="chevron-forward"
						size={20}
						color={needsServer ? colors.surfaceWhite : colors.textMedium}
					/>
				</View>
			</TouchableOpacity>
		);
	};

	const renderContent = () => {
		if (isLoading) {
			return (
				<ActivityIndicator
					size="large"
					color={colors.primary}
					style={{ marginTop: 50 }}
				/>
			);
		}
		if (error) {
			return (
				<View style={styles.infoContainer}>
					<Text style={styles.errorText}>{error}</Text>
				</View>
			);
		}
		if (activeParties.length === 0) {
			return (
				<View style={styles.infoContainer}>
					<Ionicons
						name="restaurant-outline"
						size={60}
						color={colors.borderLight}
					/>
					<Text style={styles.noCheckinsText}>
						{t("no_active_tables", "No tables are currently seated.")}
					</Text>
				</View>
			);
		}
		return (
			<FlatList
				data={activeParties}
				renderItem={renderPartyCard}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.listContainer}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={isRefreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
			/>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				<View style={styles.titleContainer}>
					<View style={{ flexDirection: "row", alignItems: "center" }}>
						<Text style={styles.title}>
							{t("active_tables", "Active Tables")}
						</Text>
						<View style={styles.countBadge}>
							<Text style={styles.countBadgeText}>{activeParties.length}</Text>
						</View>
					</View>

					<TouchableOpacity
						style={styles.manualSeatBtn}
						onPress={() => navigation.navigate("ManualSeatScreen")}
					>
						<Ionicons name="add-circle" size={20} color={colors.surfaceWhite} />
						<Text style={styles.manualSeatBtnText}>
							{t("seat_table", "Seat Table")}
						</Text>
					</TouchableOpacity>
				</View>

				{renderContent()}

				{/* 🚨 THE MODAL RENDERS HERE */}
				<ServerAssignmentModal
					visible={isServerModalVisible}
					onClose={() => {
						setIsServerModalVisible(false);
						setSelectedPartyForAssignment(null);
					}}
					onAssignServer={executeServerAssignment}
					servers={restaurantServers}
				/>
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { flex: 1 },
	titleContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 15,
	},
	title: { fontSize: 28, fontWeight: "bold", color: colors.textDark },
	countBadge: {
		backgroundColor: colors.primary + "20",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
		marginLeft: 10,
	},
	countBadgeText: { color: colors.primary, fontWeight: "bold", fontSize: 16 },
	manualSeatBtn: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 8,
	},
	manualSeatBtnText: {
		color: colors.surfaceWhite,
		fontWeight: "bold",
		marginLeft: 4,
	},
	listContainer: { paddingHorizontal: 15, paddingBottom: 30 },
	infoContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	noCheckinsText: {
		fontSize: 18,
		color: colors.textMedium,
		textAlign: "center",
		marginTop: 15,
	},
	errorText: { fontSize: 16, color: colors.statusDanger, textAlign: "center" },

	// Card Styles
	cardContainer: {
		backgroundColor: colors.surfaceWhite,
		borderRadius: 12,
		padding: 15,
		marginBottom: 15,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
		borderWidth: 1,
		borderColor: colors.borderLight,
	},
	cardNeedsAttention: {
		backgroundColor: colors.brandOrange || "#E67E22",
		borderColor: colors.brandOrange || "#E67E22",
	},
	cardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
		paddingBottom: 10,
	},
	borderLightInverted: { borderBottomColor: "rgba(255,255,255,0.3)" },
	tableBadge: {
		backgroundColor: colors.primary,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
	},
	tableBadgeInverted: { backgroundColor: colors.surfaceWhite },
	tableBadgeText: {
		color: colors.surfaceWhite,
		fontWeight: "bold",
		fontSize: 14,
	},
	timeText: { color: colors.textMedium, fontSize: 13 },

	cardBody: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	hostInfo: { flexDirection: "row", alignItems: "center" },
	hostNameText: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.textDark,
		marginLeft: 8,
	},
	hostLabel: {
		fontSize: 14,
		color: colors.textMedium,
		marginLeft: 4,
		fontStyle: "italic",
	},

	partySizeBadge: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 8,
	},
	partySizeBadgeInverted: { backgroundColor: "rgba(255,255,255,0.2)" },
	partySizeText: {
		marginLeft: 5,
		fontWeight: "bold",
		color: colors.textDark,
		fontSize: 14,
	},

	cardFooter: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingTop: 10,
	},
	serverText: { color: colors.textMedium, fontSize: 14, fontWeight: "500" },

	// Inverted Text Utilities
	textWhite: { color: colors.surfaceWhite },
	textWhite70: { color: "rgba(255,255,255,0.7)" },
	textWhiteBold: { color: colors.surfaceWhite, fontWeight: "bold" },
	textDark: { color: colors.textDark },
	serverEditContainer: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 4,
	},
});

export default RestaurantActiveTables;
