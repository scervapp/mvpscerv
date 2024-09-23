import React, { useState, useEffect, useContext, useRef } from "react";
import { View, Text, Modal, Button, StyleSheet } from "react-native";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { Picker } from "@react-native-picker/picker";

const ServerAssignmentModal = ({
	visible,
	onClose,
	onAssignServer,
	servers,
}) => {
	const [selectedServer, setSelectedServer] = useState(null);

	const handleAssign = () => {
		if (selectedServer !== null && selectedServer !== "null") {
			onAssignServer(selectedServer);
			onClose();
		} else {
			alert("Please select a server");
		}
	};

	console.log("Servers", selectedServer);

	return (
		<Modal>
			<View style={styles.modalContainer}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>Assign Server</Text>
					<View style={styles.employeeContainer}>
						<Picker
							selectedValue={selectedServer}
							onValueChange={(itemValue) => setSelectedServer(itemValue)}
							style={styles.picker}
						>
							<Picker.Item label="Select Server" value={"null"} />
							{servers &&
								servers.map((server) => (
									<Picker.Item
										key={server.id}
										label={`${server.firstName} ${server.lastName}`}
										value={server}
									/>
								))}
						</Picker>
					</View>

					<Button title="Assign" onPress={handleAssign} />
					<Button title="Cancel" onPress={onClose} />
				</View>
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	modalContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContent: {
		backgroundColor: "white",
		padding: 20,
		borderRadius: 10,
		width: "80%",
		alignItems: "center",
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
	},
	picker: {
		width: "70%",
		marginBottom: 20,
	},
	employeeContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 10,
	},
});
export default ServerAssignmentModal;
