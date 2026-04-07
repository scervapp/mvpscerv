import {
	useNavigation,
	useRoute,
	useFocusEffect,
} from "@react-navigation/native";
import React, { useState, useContext, useCallback } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	Alert,
	ActivityIndicator,
} from "react-native";
import { functions, db } from "../../config/firebase.native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthContext } from "../../context/authContext";
import { useParty } from "../../context/customer/PartyContext";
import { CameraView, useCameraPermissions } from "expo-camera";
import { httpsCallable } from "@react-native-firebase/functions";

const QRScannerScreen = () => {
	const navigation = useNavigation();
	const route = useRoute();
	const { currentUserData } = useContext(AuthContext);

	const { joinParty } = useParty();
	const {
		restaurantId,
		restaurantName,
		partyId: existingPartyId,
	} = route.params;

	const [permission, requestPermission] = useCameraPermissions();
	const [scanned, setScanned] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [statusText, setStatusText] = useState("Analyzing Table...");

	useFocusEffect(
		useCallback(() => {
			setScanned(false);
			setIsProcessing(false);
			setStatusText("Analyzing Table...");
		}, []),
	);

	if (!permission) {
		return <View style={styles.container} />;
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

	const extractTableData = (qrString) => {
		try {
			const url = new URL(qrString);
			const tableId = url.searchParams.get("t");
			const tableName = url.searchParams.get("n")?.replace("+", " ");
			if (!tableId) throw new Error("Invalid Scerv QR Code");
			return { tableId, tableName: tableName || `Table ${tableId}` };
		} catch (error) {
			return null;
		}
	};

	const handleBarCodeScanned = async ({ type, data }) => {
		if (scanned || isProcessing) return;
		setScanned(true);
		setIsProcessing(true);
		setStatusText("Analyzing Table...");

		const tableData = extractTableData(data);

		if (!tableData) {
			Alert.alert(
				"Invalid QR Code",
				"This doesn't look like a valid Scerv table QR code.",
				[{ text: "Try Again", onPress: () => resetScanner() }],
			);
			return;
		}

		try {
			// 1. Ask the backend what state this table is in
			const handleQRScan = httpsCallable(functions, "handleQRScan");
			const scanResult = await handleQRScan({
				restaurantId: restaurantId,
				tableId: tableData.tableId,
			});

			const { action, hostName, inviteCode, partyId } = scanResult.data;

			// =================================================================
			// SCENARIO 1: Table is Empty -> Start a Universal Party
			// =================================================================
			if (action === "create_party") {
				setStatusText(
					existingPartyId
						? "Linking Table to Cart..."
						: "Starting Table Session...",
				);

				try {
					const createPartySession = httpsCallable(
						functions,
						"createPartySession",
					);

					const result = await createPartySession({
						restaurantId: restaurantId,
						tableId: tableData.tableId,
						existingPartyId: existingPartyId || null, // 🚨 THE FIX: Send the pending party to the backend!
					});

					if (result.data.success) {
						navigation.navigate("PartyTab", {
							screen: "PartySession",
							params: {
								// Use the existing party ID if we had one, otherwise use the brand new one
								partyId: existingPartyId || result.data.partyId,
								restaurantId: restaurantId,
							},
						});
					}
				} catch (error) {
					console.error("Create/Link Session Error:", error);
					Alert.alert(
						"Error",
						"Could not connect to the table. Please try again.",
					);
					resetScanner();
				}
			}

			// =================================================================
			// SCENARIO 2: Table is Occupied -> Join the Party
			// =================================================================
			else if (action === "join_party") {
				Alert.alert(
					"Table Occupied",
					`${hostName || "A guest"} is currently sitting here. Would you like to join the table?`,
					[
						{ text: "Cancel", style: "cancel", onPress: () => resetScanner() },
						{
							text: "Join Table",
							onPress: async () => {
								setStatusText("Joining Table...");
								try {
									// We use the guaranteed inviteCode from the backend
									const joined = await joinParty({ inviteCode: inviteCode });

									if (joined) {
										navigation.navigate("PartyTab", {
											screen: "PartySession",
											params: {
												partyId: partyId,
												restaurantId: restaurantId,
											},
										});
									} else {
										Alert.alert("Error", "Could not join the table.");
										resetScanner();
									}
								} catch (err) {
									console.error("Join Party Error:", err);
									Alert.alert("Error", "Something went wrong.");
									resetScanner();
								}
							},
						},
					],
				);
			}

			// =================================================================
			// SCENARIO 3: User is already checked in here
			// =================================================================
			else if (action === "already_joined") {
				setStatusText("Loading Your Table...");
				navigation.navigate("PartyTab", {
					screen: "PartySession",
					params: {
						partyId: partyId,
						restaurantId: restaurantId,
					},
				});
			}
		} catch (error) {
			console.error("QR Scan Flow Error:", error);
			Alert.alert(
				"Error",
				error.message || "Could not process this table right now.",
				[{ text: "OK", onPress: () => resetScanner() }],
			);
		}
	};

	const resetScanner = () => {
		setScanned(false);
		setIsProcessing(false);
	};

	return (
		<View style={styles.container}>
			{/* 🚨 THE FIX: Unmount the camera immediately on scan to free the iOS thread */}
			{!isProcessing && (
				<CameraView
					style={StyleSheet.absoluteFillObject}
					facing="back"
					onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
					barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
				/>
			)}

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
							<Text style={styles.processingText}>{statusText}</Text>
						</View>
					) : (
						<View style={styles.scannerFrame} />
					)}
				</View>

				<Text style={styles.instructionText}>
					Point your camera at the table's QR code to sit down or join
				</Text>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: "black" },
	centeredContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#fff",
		padding: 20,
	},
	permissionText: { fontSize: 16, textAlign: "center", marginBottom: 20 },
	button: { backgroundColor: "#FF6347", padding: 15, borderRadius: 8 },
	buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
	overlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 50,
		backgroundColor: "rgba(0,0,0,0.3)",
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
		borderColor: "#FF6347",
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
