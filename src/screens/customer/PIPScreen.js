import React, { useContext, useEffect, useState } from "react";
import { Button, StyleSheet, TouchableOpacity } from "react-native";
import { View, Text } from "react-native";
import { AuthContext } from "../../context/authContext";
import {
	addDoc,
	collection,
	onSnapshot,
	orderBy,
	query,
} from "firebase/firestore";
import { TextInput } from "react-native";
import { db } from "../../config/firebase";

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
	const renderPip = (pip) => {
		return (
			<View key={pip.id}>
				<Text>{pip.name}</Text>
			</View>
		);
	};

	return (
		<View style={styles.container}>
			<Text style={styles.text}>Manage your PIPS</Text>
			<TextInput
				style={styles.input}
				placeholder="Enter Name"
				value={newPipName}
				onChangeText={setNewPipName}
			/>
			<TouchableOpacity style={styles.button} onPress={createNewPip}>
				<Text>Add PIP</Text>
			</TouchableOpacity>
			<View style={styles.pipsList}>{pips.map(renderPip)}</View>
		</View>
	);
};

// Stylesheet
const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	text: {
		fontSize: 20,
		fontWeight: "bold",
	},
	input: {
		width: "80%",
		height: 40,
		borderColor: "gray",
		borderWidth: 1,
	},
	pipsList: {
		marginTop: 20,
	},
	button: {
		marginTop: 20,
	},
});

export default PIPSListScreen;
