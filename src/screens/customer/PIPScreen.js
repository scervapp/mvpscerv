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
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	onSnapshot,
	orderBy,
	query,
} from "firebase/firestore";
import { db, functions } from "../../config/firebase";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { httpsCallable } from "firebase/functions";

// Creating a pips screen that allows customers to create pips using firestore
// and the pips go into the customers collection / uid/ pips
const PIPSListScreen = () => {
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

	// --- Cloud Function Reference ---
	const searchPIPsFunction = httpsCallable(functions, "searchPIPs"); // Assumes CF name
	// --- End CF Reference ---

	// Create a new pip
	const createNewPip = async () => {
		if (!newPipName) {
			return;
		}
		try {
			const pipsRef = collection(db, "customers", currentUserData.uid, "pips");
			await addDoc(pipsRef, {
				name: newPipName,
			});
			setNewPipName("");
		} catch (error) {
			console.log("Error adding pips", error);
		}
	};

	const handleDeletePip = async (pipId) => {
		Alert.alert("Confirm Delete", "Are you sure you want to delete this PIP?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: async () => {
					try {
						await deleteDoc(
							doc(db, "customers", currentUserData.uid, "pips", pipId)
						);
						// Update the pips state (you can refetch or filter the array)
						setPIPs(pips.filter((pip) => pip.id !== pipId));
					} catch (error) {
						console.error("Error deleting PIP:", error);
						Alert.alert("Error", "Failed to delete PIP.");
					}
				},
			},
		]);
	};

	const fetchPIPS = async () => {
		const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
		const q = query(pipsRef, orderBy("name"));
		const unsubscribe = onSnapshot(q, (querySnapshot) => {
			const pipsArray = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setPIPs(pipsArray);
		});
		return () => unsubscribe();
	};

	// fetch pips from db
	useEffect(() => {
		fetchPIPS();

		if (!currentUserData?.uid) {
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
		const q = query(pipsRef, orderBy("name")); // Order alphabetically

		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				const pipsList = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setPIPs(pipsList);
				setIsLoading(false);
			},
			(error) => {
				console.error("Error fetching PIPs:", error);
				Alert.alert("Error", "Could not load your PIPs.");
				setIsLoading(false);
			}
		);

		return () => unsubscribe();
	}, [currentUserData?.uid]);

	const handleAddPip = async () => {
		// ... (keep existing logic to add a placeholder PIP) ...
		if (newPipName.trim() === "" || !currentUserData?.uid) return;
		try {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			await addDoc(pipsRef, {
				name: newPipName.trim(),
				isUser: false, // Mark as placeholder
				addedAt: new Date(),
			});
			setNewPipName(""); // Clear input
		} catch (error) {
			console.error("Error adding placeholder PIP:", error);
			Alert.alert("Error", "Could not add PIP.");
		}
	};

	const handleSearchPIPs = async () => {
		if (searchTerm.trim().length < 3) {
			setSearchError("Search term must be at least 3 characters.");
			setSearchResults([]);
			return;
		}
		setIsSearching(true);
		setSearchError(null);
		setSearchResults([]);
		try {
			console.log(`Searching for PIPs with term: ${searchTerm}`);

			// Call the cloud function
			const result = await searchPIPsFunction({
				searchTerm: searchTerm.trim(),
			});
			console.log("Search results:", result.data);

			if (result.data.success && result.data.users) {
				const filteredResults = result.data.users.filter(
					(user) => user.id !== currentUserData?.uid
				);
				setSearchResults(filteredResults);
				if (filteredResults.length === 0) {
					setSearchError("No matching users found.");
				}
			} else {
				throw new Error(result.data.error || "Search failed.");
			}
		} catch (error) {
			console.error("Error searching users:", error);
			setSearchError(error.message || "An error occurred during search.");
		} finally {
			setIsSearching(false);
		}
	};

	// --- NEW: Handle Adding a User PIP ---
	const handleAddUserPip = async (userToAdd) => {
		if (!currentUserData?.uid || !userToAdd?.id || !userToAdd?.name) return;

		// Optional: Check if user is already in the PIP list
		const alreadyExists = pips.some(
			(pip) => pip.isUser && pip.userId === userToAdd.id
		);
		if (alreadyExists) {
			Alert.alert("Info", `${userToAdd.name} is already in your PIPs list.`);
			return;
		}

		// Add loading indicator specifically for adding? Or just close modal.
		setIsSearchModalVisible(false); // Close modal after selection

		try {
			const pipsRef = collection(db, `customers/${currentUserData.uid}/pips`);
			// Add a document representing the real user
			await addDoc(pipsRef, {
				name: userToAdd.name, // Denormalized name
				userId: userToAdd.id, // Store the actual user ID
				isUser: true, // Mark as a real user
				addedAt: new Date(),
			});
			Alert.alert("Success", `${userToAdd.name} added to your PIPs.`);
			// Reset search state
			setSearchTerm("");
			setSearchResults([]);
			setSearchError(null);
		} catch (error) {
			console.error("Error adding user PIP:", error);
			Alert.alert("Error", `Could not add ${userToAdd.name} to PIPs.`);
		}
	};

	// Fucntion to render an individual PIP
	const renderPip = ({ item }) => (
		<View style={styles.pipItem}>
			<Ionicons name="person-circle-outline" size={24} color="gray" />
			<Text style={styles.pipName}>{item.name}</Text>
			<TouchableOpacity onPress={() => handleDeletePip(item.id)}>
				<Ionicons name="trash-outline" size={24} color={"red"} />
				{/* Use a trash icon */}
			</TouchableOpacity>
		</View>
	);

	// --- Render Item (Modified) ---
	const renderPipItem = ({ item }) => (
		<View style={styles.pipItem}>
			<Ionicons
				name={item.isUser ? "person-circle" : "person-add-outline"} // Different icons
				size={24}
				color={item.isUser ? colors.primary : colors.textDark} // Different colors
				style={styles.pipIcon}
			/>
			<Text style={styles.pipName}>{item.name}</Text>
			<TouchableOpacity onPress={() => handleDeletePip(item.id)}>
				<Ionicons name="trash-outline" size={24} color={colors.danger} />
			</TouchableOpacity>
		</View>
	);

	return (
		<View style={styles.container}>
			{/* Input for adding placeholder PIPs (Existing) */}
			<View style={styles.addPipContainer}>
				<TextInput
					style={styles.input}
					placeholder="Enter Placeholder PIP Name"
					value={newPipName}
					onChangeText={setNewPipName}
				/>
				<TouchableOpacity style={styles.addButton} onPress={handleAddPip}>
					<Text style={styles.addButtonText}>Add Placeholder</Text>
				</TouchableOpacity>
			</View>

			{/* --- Button to Add User PIP --- */}
			<TouchableOpacity
				style={[styles.addButton, styles.addUserButton]} // Different style
				onPress={() => setIsSearchModalVisible(true)}
			>
				<Ionicons
					name="search-outline"
					size={18}
					color="white"
					style={{ marginRight: 5 }}
				/>
				<Text style={styles.addButtonText}>Find & Add User PIP</Text>
			</TouchableOpacity>
			{/* --- End Button --- */}

			{/* List of PIPs */}
			{isLoading ? (
				<ActivityIndicator size="large" color={colors.primary} />
			) : (
				<FlatList
					data={pips}
					renderItem={renderPipItem}
					keyExtractor={(item) => item.id}
					ListEmptyComponent={
						<Text style={styles.emptyText}>No PIPs added yet.</Text>
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
						<Text style={styles.modalTitle}>Find User PIP</Text>
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
							placeholder="Search by email or name..."
							value={searchTerm}
							onChangeText={setSearchTerm}
							autoCapitalize="none"
							autoCorrect={false}
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
								<Text style={styles.searchButtonText}>Search</Text>
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
								<Text style={styles.searchResultName}>{item.name}</Text>
								{/* Optionally show email: <Text style={styles.searchResultEmail}>{item.email}</Text> */}
								<Ionicons
									name="add-circle-outline"
									size={26}
									color={colors.success}
								/>
							</TouchableOpacity>
						)}
						ListEmptyComponent={
							!isSearching && !searchError ? (
								<Text style={styles.emptyText}>Enter search term above.</Text>
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
		padding: 15,
		backgroundColor: colors.background,
	},
	addPipContainer: {
		flexDirection: "row",
		marginBottom: 15,
		alignItems: "center",
	},
	input: {
		flex: 1,
		borderWidth: 1,
		borderColor: colors.mediumGray || "#ccc",
		padding: 10,
		borderRadius: 8,
		marginRight: 10,
		backgroundColor: "white",
	},
	addButton: {
		backgroundColor: colors.primary,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 8,
		flexDirection: "row",
		alignItems: "center",
	},
	addUserButton: {
		// Style for the second button
		backgroundColor: colors.secondary || "#5a6268",
		marginBottom: 20, // Space below this button
		justifyContent: "center",
	},
	addButtonText: {
		color: "white",
		fontWeight: "bold",
	},
	pipItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 15,
		backgroundColor: "white",
		borderRadius: 8,
		marginBottom: 10,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	pipIcon: {
		marginRight: 10,
	},
	pipName: {
		flex: 1,
		fontSize: 16,
	},
	emptyText: {
		textAlign: "center",
		marginTop: 30,
		color: colors.textLight,
		fontStyle: "italic",
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
		flex: 1,
		fontSize: 16,
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
