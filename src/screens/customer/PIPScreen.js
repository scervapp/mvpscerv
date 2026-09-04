import React, { useContext, useEffect, useState } from "react";

import {
	View,
	Text,
	FlatList,
	TextInput,
	StyleSheet,
	TouchableOpacity,
	Alert,
	Platform,
	ActivityIndicator,
	Modal,
	SafeAreaView,
} from "react-native";
import { AuthContext } from "../../context/authContext";

import { db, functions } from "../../config/firebase";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { httpsCallable } from "@react-native-firebase/functions";
import { useTranslation } from "react-i18next";
// Creating a pips screen that allows customers to create pips using firestore
// and the pips go into the customers collection / uid/ pips
const PIPSListScreen = () => {
	const { t } = useTranslation();
	// Get auth context
	const { currentUserData } = useContext(AuthContext);
	const [newPipName, setNewPipName] = useState("");
	const [pips, setPIPs] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	// --- State for User Search Modal ---
	const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [searchResults, setSearchResults] = useState([]);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState(null);
	// --- End Search Modal State ---

	useEffect(() => {
		if (!currentUserData?.uid) {
			setIsLoading(false);
			return; // Don't do anything if we don't have a user ID
		}

		setIsLoading(true); // Set loading true when we start fetching

		const pipsQuery = db
			.collection("customers")
			.doc(currentUserData.uid)
			.collection("pips")
			.orderBy("name");

		const unsubscribe = pipsQuery.onSnapshot(
			(snapshot) => {
				const pipsList = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setPIPs(pipsList);
				setIsLoading(false); // Set loading to false once we have the data
			},
			(error) => {
				console.error("Error fetching PIPs:", error);
				Alert.alert(t("error"), t("could_not_load_your_pips"));
				setIsLoading(false); // Also stop loading on error
			}
		);

		// This is the cleanup function that runs when the component unmounts
		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const handleDeletePip = async (pipId) => {
		Alert.alert(
			t("confirm_delete"),
			t("are_you_sure_you_want_to_delete_this_pip"),
			[
				{ text: t("cancel"), style: "cancel" },
				{
					text: t("delete"),
					style: "destructive",
					onPress: async () => {
						try {
							// --- REFACTORED FIRESTORE DELETE ---
							await db
								.collection("customers")
								.doc(currentUserData.uid)
								.collection("pips")
								.doc(pipId)
								.delete();
							setPIPs(pips.filter((pip) => pip.id !== pipId));
						} catch (error) {
							console.error("Error deleting PIP:", error);
							Alert.alert(t("error"), t("failed_to_delete_pip"));
						}
					},
				},
			]
		);
	};

	const handleAddPip = async () => {
		if (newPipName.trim() === "" || !currentUserData?.uid) return;
		try {
			// --- REFACTORED FIRESTORE ADD ---
			const pipsRef = db.collection(`customers/${currentUserData.uid}/pips`);
			await pipsRef.add({
				name: newPipName.trim(),
				isUser: false,
				addedAt: new Date(),
			});
			setNewPipName("");
		} catch (error) {
			console.error("Error adding placeholder PIP:", error);
			Alert.alert(t("error"), t("could_not_add_pip"));
		}
	};

	const handleSearchPIPs = async () => {
		const trimmedSearchTerm = searchTerm.trim();

		if (trimmedSearchTerm.length < 3) {
			setSearchError(t("search_term_must_be_at_least_3_characters"));
			setSearchResults([]);
			return;
		}
		setIsSearching(true);
		setSearchError(null);
		setSearchResults([]);
		try {
			// This was already using the correct native functions API
			const searchPIPsFunction = httpsCallable(functions, "searchPIPs");
			const result = await searchPIPsFunction({
				searchTerm: trimmedSearchTerm,
			});

			if (result.data.success && result.data.users) {
				const filteredResults = result.data.users.filter(
					(user) => user.id !== currentUserData?.uid
				);
				setSearchResults(filteredResults);
				if (filteredResults.length === 0) {
					setSearchError(t("no_matching_users_found"));
				}
			} else {
				throw new Error(result.data.error || t("search_failed"));
			}
		} catch (error) {
			console.error("Error searching users:", error);
			setSearchError(error.message || t("an_error_occurred_during_search"));
		} finally {
			setIsSearching(false);
		}
	};

	// --- NEW: Handle Adding a User PIP ---
	const handleAddUserPip = async (userToAdd) => {
		if (!currentUserData?.uid || !userToAdd?.id || !userToAdd?.name) return;

		const alreadyExists = pips.some(
			(pip) => pip.isUser && pip.userId === userToAdd.id
		);
		if (alreadyExists) {
			Alert.alert(t("info"), `${userToAdd.name} ${t("is_already_in_your_pips_list")}`);
			return;
		}

		setIsSearchModalVisible(false);
		setSearchTerm("");
		setSearchResults([]);

		try {
			// --- REFACTORED FIRESTORE ADD ---
			const pipsRef = db.collection(`customers/${currentUserData.uid}/pips`);
			await pipsRef.add({
				name: userToAdd.name,
				userId: userToAdd.id,
				isUser: true,
				addedAt: new Date(),
			});
			Alert.alert(t("success"), `${userToAdd.name} ${t("added_to_your_pips")}`);
		} catch (error) {
			console.error("Error adding user PIP:", error);
			Alert.alert(t("error"), `${t("could_not_add")} ${userToAdd.name} ${t("to_pips")}`);
		}
	};

	const renderPipItem = ({ item }) => (
		<View style={styles.pipItem}>
			<View style={styles.pipIdentity}>
				<View
					style={[
						styles.pipAvatar,
						item.isUser ? styles.userPipAvatar : styles.localPipAvatar,
					]}
				>
					<Ionicons
						name={item.isUser ? "person-circle" : "person-outline"}
						size={24}
						color={item.isUser ? colors.primary : colors.textDark}
					/>
				</View>
				<View style={styles.pipTextBlock}>
					<Text style={styles.pipName} numberOfLines={1}>
						{item.name}
					</Text>
					<Text style={styles.pipType}>
						{item.isUser
			? t("scerv_friend", "Scerv friend")
							: t("guest_placeholder", "Guest placeholder")}
					</Text>
				</View>
			</View>
			<TouchableOpacity
				style={styles.deletePipButton}
				onPress={() => handleDeletePip(item.id)}
			>
				<Ionicons name="trash-outline" size={22} color={colors.statusDanger || "red"} />
			</TouchableOpacity>
		</View>
	);

	const renderPipsHeader = () => (
		<View>
			<View style={styles.heroPanel}>
				<Text style={styles.screenTitle}>
					{t("pips_friends_title", "People")}
				</Text>
				<Text style={styles.screenSubtitle}>
					{t(
						"pips_friends_subtitle",
						"Add people here so you can invite them to restaurant parties fast.",
					)}
				</Text>
			</View>

			<View style={styles.actionPanel}>
				<TouchableOpacity
					style={styles.primaryFriendButton}
					onPress={() => setIsSearchModalVisible(true)}
				>
					<Ionicons
						name="search-outline"
						size={20}
						color="white"
						style={styles.actionIcon}
					/>
					<View style={styles.actionTextBlock}>
						<Text style={styles.primaryFriendButtonText}>
							{t("add_scerv_friend", "Add person")}
						</Text>
						<Text style={styles.primaryFriendButtonSubtext}>
							{t(
								"add_scerv_friend_hint",
								"Search for someone with a Scerv account.",
							)}
						</Text>
					</View>
				</TouchableOpacity>
			</View>

			<View style={styles.actionPanel}>
				<View style={styles.sectionHeaderRow}>
					<Ionicons
						name="person-add-outline"
						size={20}
						color={colors.primary}
					/>
					<Text style={styles.sectionHeaderText}>
						{t("add_guest_placeholder", "Add guest")}
					</Text>
				</View>
				<Text style={styles.sectionHelperText}>
					{t(
						"guest_placeholder_help",
							"Use this when you are ordering for someone else.",
					)}
				</Text>
				<View style={styles.addPipContainer}>
					<TextInput
						style={styles.input}
						placeholder={t("guest_name", "Guest name")}
						value={newPipName}
						onChangeText={setNewPipName}
						placeholderTextColor={colors.textMedium}
					/>
					<TouchableOpacity style={styles.addButton} onPress={handleAddPip}>
						<Ionicons name="add" size={20} color="white" />
						<Text style={styles.addButtonText}>{t("add", "Add")}</Text>
					</TouchableOpacity>
				</View>
			</View>

			<Text style={styles.listTitle}>{t("your_pips", "Your people")}</Text>
		</View>
	);

	return (
		<View style={styles.container}>
			{isLoading ? (
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			) : (
				<FlatList
					data={pips}
					renderItem={renderPipItem}
					keyExtractor={(item) => item.id}
					ListHeaderComponent={renderPipsHeader()}
					contentContainerStyle={styles.listContent}
					ListEmptyComponent={
						<View style={styles.emptyPanel}>
							<Ionicons
								name="people-outline"
								size={34}
								color={colors.textLight}
							/>
							<Text style={styles.emptyTitle}>
								{t("no_pips_added_yet", "No people added yet")}
							</Text>
							<Text style={styles.emptyText}>
								{t(
									"add_pips_empty_state",
									"Add people you dine with so inviting them is faster.",
								)}
							</Text>
						</View>
					}
				/>
			)}

			{/* --- User Search Modal --- */}
			<Modal
				visible={isSearchModalVisible}
				animationType="slide"
				onRequestClose={() => setIsSearchModalVisible(false)}
			>
				<SafeAreaView style={styles.modalContainer}>
					<View style={styles.modalHeader}>
						<Text style={styles.modalTitle}>{t("find_user_pip")}</Text>
						<TouchableOpacity onPress={() => setIsSearchModalVisible(false)}>
							<Ionicons
								name="close-circle"
								size={30}
								color={colors.textLight}
							/>
						</TouchableOpacity>
					</View>
					<View style={styles.searchContainer}>
						<TextInput
							style={styles.searchInput}
							placeholder={t("search_by_email_or_name")}
							value={searchTerm}
							onChangeText={setSearchTerm}
							autoCapitalize="none"
							autoCorrect={false}
							placeholderTextColor={colors.textMedium}
						/>
						<TouchableOpacity
							style={[
								styles.searchButton,
								isSearching && styles.disabledButton,
							]}
							onPress={handleSearchPIPs}
							disabled={isSearching}
						>
							{isSearching ? (
								<ActivityIndicator color="white" size="small" />
							) : (
								<Text style={styles.searchButtonText}>{t("search")}</Text>
							)}
						</TouchableOpacity>
					</View>

					{searchError && (
						<Text style={styles.errorTextModal}>{searchError}</Text>
					)}

					<FlatList
						data={searchResults}
						keyExtractor={(item) => item.id}
						renderItem={({ item }) => (
							<TouchableOpacity
								style={styles.searchResultItem}
								onPress={() => handleAddUserPip(item)}
							>
								<Ionicons
									name="person-circle-outline"
									size={24}
									color={colors.primary}
									style={styles.pipIcon}
								/>
								<View style={styles.searchResultTextBlock}>
									<Text style={styles.searchResultName}>{item.name}</Text>
									{!!item.email && (
										<Text style={styles.searchResultEmail} numberOfLines={1}>
											{item.email}
										</Text>
									)}
								</View>
								<Ionicons
									name="add-circle-outline"
									size={26}
									color={colors.success}
								/>
							</TouchableOpacity>
						)}
						ListEmptyComponent={
							!isSearching && !searchError ? (
								<Text style={styles.emptyText}>
									{t("enter_search_term_above")}
								</Text>
							) : null
						}
					/>
				</SafeAreaView>
			</Modal>
			{/* --- End Search Modal --- */}
		</View>
	);
};

// Stylesheet
const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	listContent: {
		padding: 15,
		paddingBottom: 32,
	},
	loadingContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	heroPanel: {
		backgroundColor: colors.surfaceWhite || "white",
		borderRadius: 8,
		padding: 16,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: colors.borderLight || "#eee",
	},
	screenTitle: {
		fontSize: 22,
		fontWeight: "800",
		color: colors.textDark,
		marginBottom: 5,
	},
	screenSubtitle: {
		fontSize: 14,
		lineHeight: 20,
		color: colors.textMedium,
	},
	actionPanel: {
		backgroundColor: colors.surfaceWhite || "white",
		borderRadius: 8,
		padding: 14,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: colors.borderLight || "#eee",
	},
	primaryFriendButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.primary,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 14,
	},
	actionIcon: {
		marginRight: 10,
	},
	actionTextBlock: {
		flex: 1,
	},
	primaryFriendButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "800",
	},
	primaryFriendButtonSubtext: {
		color: "rgba(255,255,255,0.82)",
		fontSize: 12,
		marginTop: 2,
	},
	sectionHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5,
	},
	sectionHeaderText: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.textDark,
		marginLeft: 7,
	},
	sectionHelperText: {
		fontSize: 13,
		color: colors.textMedium,
		marginBottom: 12,
	},
	addPipContainer: {
		flexDirection: "row",
		alignItems: "center",
	},
	input: {
		flex: 1,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.mediumGray || "#ccc",
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 8,
		marginRight: 10,
		backgroundColor: "white",
		color: colors.textDark,
	},
	addButton: {
		backgroundColor: colors.primary,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 8,
		flexDirection: "row",
		alignItems: "center",
	},
	addButtonText: {
		color: "white",
		fontWeight: "bold",
		marginLeft: 2,
	},
	listTitle: {
		fontSize: 15,
		fontWeight: "800",
		color: colors.textDark,
		marginBottom: 10,
	},
	pipItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 12,
		backgroundColor: colors.surfaceWhite || "white",
		borderRadius: 8,
		marginBottom: 10,
		borderWidth: 1,
		borderColor: colors.borderLight || "#eee",
	},
	pipIdentity: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		minWidth: 0,
	},
	pipAvatar: {
		width: 42,
		height: 42,
		borderRadius: 21,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	userPipAvatar: {
		backgroundColor: colors.primary + "14",
	},
	localPipAvatar: {
		backgroundColor: colors.backgroundLight || "#f5f5f5",
	},
	pipTextBlock: {
		flex: 1,
		minWidth: 0,
	},
	pipName: {
		fontSize: 16,
		fontWeight: "700",
		color: colors.textDark,
	},
	pipType: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	deletePipButton: {
		padding: 8,
		marginLeft: 8,
	},
	pipIcon: {
		marginRight: 10,
	},
	emptyPanel: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 28,
		paddingHorizontal: 18,
		backgroundColor: colors.surfaceWhite || "white",
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight || "#eee",
	},
	emptyTitle: {
		marginTop: 8,
		fontSize: 16,
		fontWeight: "800",
		color: colors.textDark,
	},
	emptyText: {
		textAlign: "center",
		marginTop: 6,
		color: colors.textLight,
		lineHeight: 19,
	},
	// Modal Styles
	modalContainer: {
		flex: 1,
		marginTop: Platform.OS === "ios" ? 40 : 20, // Adjust for status bar
		padding: 15,
	},
	modalHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 20,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		color: colors.textDark,
	},
	searchContainer: {
		flexDirection: "row",
		marginBottom: 15,
	},
	searchInput: {
		flex: 1,
		borderWidth: 1,
		borderColor: colors.mediumGray || "#ccc",
		padding: 10,
		borderRadius: 8,
		marginRight: 10,
		backgroundColor: "white",
		color: colors.textDark,
	},
	searchButton: {
		backgroundColor: colors.primary,
		paddingVertical: 10,
		paddingHorizontal: 15,
		borderRadius: 8,
		justifyContent: "center",
	},
	searchButtonText: {
		color: "white",
		fontWeight: "bold",
	},
	searchResultItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 15,
		backgroundColor: "white",
		borderRadius: 8,
		marginBottom: 10,
		borderWidth: 1,
		borderColor: colors.lightGray || "#eee",
	},
	searchResultName: {
		fontSize: 16,
		fontWeight: "700",
		color: colors.textDark,
	},
	searchResultTextBlock: {
		flex: 1,
		minWidth: 0,
	},
	searchResultEmail: {
		fontSize: 12,
		color: colors.textMedium,
		marginTop: 2,
	},
	errorTextModal: {
		color: colors.danger,
		textAlign: "center",
		marginBottom: 10,
	},
	disabledButton: {
		backgroundColor: colors.mediumGray || "#cccccc",
		opacity: 0.7,
	},
});

export default PIPSListScreen;
