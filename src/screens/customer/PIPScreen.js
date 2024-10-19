import React, { useContext, useEffect, useState } from "react";

import {
	View,
	Text,
	FlatList,
	TextInput,
	StyleSheet,
	TouchableOpacity,
} from "react-native";
import { AuthContext } from "../../context/authContext";
import {
	addDoc,
	collection,
	onSnapshot,
	orderBy,
	query,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { Ionicons } from "@expo/vector-icons";

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
	const renderPip = (
		{ item } // Improved rendering with FlatList
	) => (
		<TouchableOpacity style={styles.pipItem}>
			<Ionicons name="person-circle-outline" size={24} color="gray" />
			<Text style={styles.pipName}>{item.name}</Text>
		</TouchableOpacity>
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
