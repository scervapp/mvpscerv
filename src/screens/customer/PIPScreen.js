import React, { useContext, useEffect, useState } from "react";

import {
	View,
	Text,
	FlatList,
	TextInput,
	StyleSheet,
	TouchableOpacity,
	Alert,
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
import { db } from "../../config/firebase";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";

// Creating a pips screen that allows customers to create pips using firestore
// and the pips go into the customers collection / uid/ pips
const PIPSListScreen = () => {
	// Get auth context
	const { currentUserData } = useContext(AuthContext);
	const [newPipName, setNewPipName] = useState("");
	const [pips, setPIPS] = useState([]);

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
						setPIPS(pips.filter((pip) => pip.id !== pipId));
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
			setPIPS(pipsArray);
		});
		return () => unsubscribe();
	};

	// fetch pips from db
	useEffect(() => {
		fetchPIPS();
	}, []);

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

	return (
		<View style={styles.container}>
			<Text style={styles.header}>Manage your PIPS</Text>

			<View style={styles.inputContainer}>
				<TextInput
					style={styles.input}
					placeholder="Enter Name"
					value={newPipName}
					onChangeText={setNewPipName}
				/>
				<TouchableOpacity style={styles.addButton} onPress={createNewPip}>
					<Text style={styles.addButtonText}>Add PIP</Text>
				</TouchableOpacity>
			</View>

			<FlatList
				data={pips}
				renderItem={renderPip}
				keyExtractor={(item) => item.id}
				ListEmptyComponent={
					<Text style={styles.emptyText}>No PIPS yet. Add some!</Text>
				}
				contentContainerStyle={styles.pipsList}
			/>
		</View>
	);
};

// Stylesheet
const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
		backgroundColor: "#f8f8f8", // Example background color
	},
	header: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		color: "#333", // Example text color
	},
	inputContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 20,
	},
	input: {
		flex: 1,
		height: 40,
		borderColor: "#ddd",
		borderWidth: 1,
		borderRadius: 8,
		paddingHorizontal: 10,
		marginRight: 10,
		backgroundColor: "#fff",
	},
	addButton: {
		backgroundColor: "#007bff", // Example button color
		borderRadius: 8,
		padding: 10,
	},
	addButtonText: {
		color: "#fff",
		fontWeight: "bold",
	},
	pipsList: {
		flexGrow: 1, // Allow the list to take up available space
		paddingTop: 10,
	},
	pipItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 15,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
		backgroundColor: "#fff",
		borderRadius: 8,
		marginBottom: 10,
		justifyContent: "space-between", // Add this to space between elements
	},
	deleteButton: {
		// Style for the delete button
		backgroundColor: "red", // Use your error color (e.g., red)
		padding: 8,
		borderRadius: 5,
	},
	deleteButtonText: {
		color: "white",
		fontSize: 14,
	},
	pipName: {
		marginLeft: 10,
		fontSize: 18,
	},
	emptyText: {
		textAlign: "center",
		color: "#999",
		fontSize: 16,
	},
});

export default PIPSListScreen;
