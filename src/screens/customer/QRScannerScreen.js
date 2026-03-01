const { useNavigation, useRoute } = require("@react-navigation/native");
const { useState, useContext } = require("react");
const {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	Alert,
	ActivityIndicator,
} = require("react-native");
const { functions } = require("../../config/firebase.native");
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthContext, useAuth } from "../../context/authContext";
import { CameraView, useCameraPermissions } from "expo-camera";

const QRScannerScreen = () => {
	const navigation = useNavigation();
	const route = useRoute();
	const { currentUserData } = useContext(AuthContext);

	// The restaurantId passed from the RestaurantDetail screen
	const { restaurantId } = route.params;

	const [permission, requestPermission] = useCameraPermissions();
	const [scanned, setScanned] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);

	// 1. Handle Camera Permissions
	if (!permission) {
		return <View style={styles.container} />; // Loading state
	}

	if (!permission.granted) {
		return (
			<View style={styles.centeredContainer}>
				<Text style={styles.permissionText}>
					We need your permission to show the camera
				</Text>
				<TouchableOpacity style={styles.button} onPress={requestPermission}>
					<Text style={styles.buttonText}>Grant Permission</Text>
				</TouchableOpacity>
			</View>
		);
	}

	// 2. Extract Data from the QR Code
	// Assuming your physical QR codes are formatted as simple URLs like:
	// https://scerv.com/qr?t=table_45&n=Table+45
	const extractTableData = (qrString) => {
		try {
			// Very simple URL param parser
			const url = new URL(qrString);
			const tableId = url.searchParams.get("t");
			const tableName = url.searchParams.get("n")?.replace("+", " ");

			if (!tableId) throw new Error("Invalid Scerv QR Code");

			return { tableId, tableName: tableName || `Table ${tableId}` };
		} catch (error) {
			return null; // Invalid format
		}
	};

	// 3. Handle the actual scan
	const handleBarCodeScanned = async ({ type, data }) => {
		if (scanned || isProcessing) return;
		setScanned(true);
		setIsProcessing(true);

		const tableData = extractTableData(data);

		if (!tableData) {
			Alert.alert(
				"Invalid QR Code",
				"This doesn't look like a valid Scerv table QR code.",
				[
					{
						text: "Try Again",
						onPress: () => {
							setScanned(false);
							setIsProcessing(false);
						},
					},
				],
			);
			return;
		}

		try {
			// Call our new Fast-Track Cloud Function
			const selfSeatingCheckIn = functions.httpsCallable("selfSeatingCheckIn");

			const response = await selfSeatingCheckIn({
				restaurantId: restaurantId,
				tableId: tableData.tableId,
				tableName: tableData.tableName,
				customerName: currentUserData?.displayName || "Guest",
				numberOfPeople: 1, // Defaulting to 1 for self-seating
			});

			if (response.data.success) {
				// Success! The database is locked. Navigate back to see the green status!
				Alert.alert("Success!", "You are checked in to " + tableData.tableName);
				navigation.goBack();
			}
		} catch (error) {
			console.error("QR Scan Error:", error);
			Alert.alert(
				"Check-in Failed",
				error.message ||
					"Could not check in to this table. It may be occupied.",
				[
					{
						text: "OK",
						onPress: () => {
							setScanned(false);
							setIsProcessing(false);
						},
					},
				],
			);
		}
	};

	return (
		<View style={styles.container}>
			<CameraView
				style={StyleSheet.absoluteFillObject}
				facing="back"
				onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
				barcodeScannerSettings={{
					barcodeTypes: ["qr"],
				}}
			/>

			{/* UI Overlay */}
			<View style={styles.overlay}>
				<TouchableOpacity
					style={styles.backButton}
					onPress={() => navigation.goBack()}
					disabled={isProcessing}
				>
					<MaterialCommunityIcons name="arrow-left" size={28} color="white" />
				</TouchableOpacity>

				<View style={styles.scanTarget}>
					{isProcessing ? (
						<View style={styles.processingContainer}>
							<ActivityIndicator size="large" color="#ffffff" />
							<Text style={styles.processingText}>Claiming Table...</Text>
						</View>
					) : (
						<View style={styles.scannerFrame} />
					)}
				</View>

				<Text style={styles.instructionText}>
					Point your camera at the table's QR code to sit down
				</Text>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "black",
	},
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#fff",
		padding: 20,
	},
	permissionText: {
		fontSize: 16,
		textAlign: "center",
		marginBottom: 20,
	},
	button: {
		backgroundColor: "#FF6347", // Your primary color
		padding: 15,
		borderRadius: 8,
	},
	buttonText: {
		color: "white",
		fontWeight: "bold",
		fontSize: 16,
	},
	overlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 50,
		backgroundColor: "rgba(0,0,0,0.3)", // Slight dimming around the scanner
	},
	backButton: {
		alignSelf: "flex-start",
		marginLeft: 20,
		marginTop: 10,
		padding: 10,
		backgroundColor: "rgba(0,0,0,0.5)",
		borderRadius: 20,
	},
	scanTarget: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		width: "100%",
	},
	scannerFrame: {
		width: 250,
		height: 250,
		borderWidth: 4,
		borderColor: "#FF6347", // Highlight color for the box
		borderRadius: 20,
		backgroundColor: "transparent",
	},
	instructionText: {
		color: "white",
		fontSize: 18,
		fontWeight: "bold",
		textAlign: "center",
		paddingHorizontal: 30,
		marginBottom: 30,
		backgroundColor: "rgba(0,0,0,0.6)",
		paddingVertical: 10,
		borderRadius: 10,
		overflow: "hidden",
	},
	processingContainer: {
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.7)",
		padding: 20,
		borderRadius: 15,
	},
	processingText: {
		color: "white",
		marginTop: 10,
		fontSize: 16,
		fontWeight: "bold",
	},
});

export default QRScannerScreen;
