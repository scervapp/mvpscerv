import React, { useState, useEffect, useContext, useRef } from "react";
import {
	View,
	Text,
	Modal,
	Button,
	StyleSheet,
	TouchableOpacity,
} from "react-native";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";
import { Picker } from "@react-native-picker/picker";
import colors from "../../utils/styles/appStyles";

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

	return (
		<Modal visible={visible} animationType="slide" transparent={true}>
			<View style={styles.modalContainer}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>Assign Server</Text>

					{/* Server Picker */}
					<View style={styles.pickerContainer}>
						<Picker
							selectedValue={selectedServer}
							onValueChange={(itemValue) => setSelectedServer(itemValue)}
							style={styles.picker}
						>
							<Picker.Item label="Select Server" value={null} />
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

					{/* Buttons */}
					<View style={styles.buttonContainer}>
						<TouchableOpacity onPress={onClose} style={styles.cancelButton}>
							<Text style={styles.cancelButtonText}>Cancel</Text>
						</TouchableOpacity>
						<TouchableOpacity
							onPress={handleAssign}
							disabled={!selectedServer}
							style={[
								styles.assignButton,
								!selectedServer && styles.disabledButton,
							]}
						>
							<Text style={styles.assignButtonText}>Assign</Text>
						</TouchableOpacity>
					</View>
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
	},
	modalTitle: {
		fontSize: 24, // Increased font size
		fontWeight: "bold",
		marginBottom: 20, // Increased margin
		textAlign: "center",
	},
	pickerContainer: {
		borderWidth: 1,
		borderColor: "#ced4da", // Add a border to the picker container
		borderRadius: 8,
		paddingHorizontal: 10,
		marginBottom: 20,
	},
	picker: {
		width: "100%",
		height: 45, // Adjust height as needed
	},
	buttonContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginTop: 10,
	},
	cancelButton: {
		backgroundColor: "#ccc",
		padding: 10,
		borderRadius: 8,
		flex: 1,
		marginHorizontal: 5,
		alignItems: "center",
	},
	cancelButtonText: {
		color: "#333",
		fontSize: 16,
	},
	assignButton: {
		backgroundColor: colors.primary,
		padding: 10,
		borderRadius: 8,
		flex: 1,
		marginHorizontal: 5,
		alignItems: "center",
	},
	assignButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	disabledButton: {
		// Style for the disabled state
		opacity: 0.6,
		backgroundColor: colors.disabledButtonBackground, // Example color
	},
});
export default ServerAssignmentModal;
