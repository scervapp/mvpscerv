import React, { useContext, useEffect } from "react";
import { useState } from "react";
import {
	Button,
	FlatList,
	StyleSheet,
	Text,
	Dimensions,
	TouchableOpacity,
} from "react-native";
import { View } from "react-native";
import TableItem from "../../components/restaurant/TableItem";
import { AuthContext } from "../../context/authContext";
import {
	generateTables,
	fetchTables,
	clearTable,
} from "../../utils/firebaseUtils";
import { collection, query, getDocs, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useActionSheet } from "@expo/react-native-action-sheet";
import colors from "../../utils/styles/appStyles";

const TableManagementScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [tables, setTables] = useState([]);
	const [numColumns, setNumColumns] = useState(2);
	const [isLoading, setIsLoading] = useState(false);
	const { showActionSheetWithOptions } = useActionSheet();

	const [screenWidth, setScreenWidth] = useState(
		Dimensions.get("window").width
	);
	const horizontalMargin = 0;

	// Fech tables in db
	useEffect(() => {
		const unsubscribe = fetchTables(currentUserData.uid, (sortedTables) => {
			setTables(sortedTables);
		});
		return () => {
			if (typeof unsubscribe === "function") {
				unsubscribe();
			}
		};
	}, []);

	const handleTableGeneration = () => {
		try {
			generateTables(currentUserData.uid);
		} catch (error) {
			console.log("Error creating tables", error);
		}
	};

	//Dynamicall calculate number of columns based on screen size
	useEffect(() => {
		const calculateColumns = () => {
			// Adjust based on item width, padding etc
			const itemWidth = 100;

			const columns = Math.floor(screenWidth / (itemWidth + horizontalMargin));
			setNumColumns(columns > 0 ? columns : 1);
		};
		calculateColumns();

		const subscription = Dimensions.addEventListener("change", ({ window }) => {
			setScreenWidth(window.width);
			calculateColumns();
		});

		return () => subscription?.remove();
	}, [screenWidth]);

	const totalHorizontalSpacing = horizontalMargin * (numColumns + 1);
	const tableItemWidth = (screenWidth - totalHorizontalSpacing) / numColumns;

	const handleTableSelection = (selectedTable) => {
		setIsLoading(true);
		try {
			// fetch tables with a status of checkedOut
			const options = ["Clear Table", "Cancel"];
			const destructiveButtonIndex = 0;
			const cancelButtonIndex = 1;

			const statusMessage = `Status: ${selectedTable.status}`;

			showActionSheetWithOptions(
				{
					options,
					cancelButtonIndex,
					destructiveButtonIndex,
					title: `Manage ${selectedTable.name}`,
					message: `${statusMessage}`,
				},
				async (buttonIndex) => {
					if (
						buttonIndex === destructiveButtonIndex &&
						selectedTable.status === "checkedOut"
					) {
						try {
							// Clear table and update status, in the database
							await clearTable(selectedTable.id, currentUserData.uid);
							setIsLoading(false);
						} catch (error) {
							console.log("Error clearing table", error);
							setIsLoading(false);
						}
					}
				}
			);
		} catch (error) {
			console.error("Error Clearing Table", error);
			setIsLoading(false);
		}
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Table Management</Text>

			{/* Generate Tables Button (only show if no tables exist) */}
			{tables && tables.length === 0 && (
				<TouchableOpacity
					style={styles.generateButton}
					onPress={handleTableGeneration}
				>
					<Text style={styles.generateButtonText}>Generate Tables</Text>
				</TouchableOpacity>
			)}

			{/* Table List */}
			<FlatList
				showsVerticalScrollIndicator={false}
				data={tables}
				renderItem={({ item }) => (
					<TableItem
						width={tableItemWidth}
						height={tableItemWidth}
						item={item}
						onPress={() => handleTableSelection(item)}
					/>
				)}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.tableList}
				numColumns={numColumns}
				key={numColumns}
			/>
		</View>
	);
};

// create stylesheet

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
		padding: 20,
		alignContent: "center",
	},
	title: {
		fontSize: 28,
		fontWeight: "bold",
		marginBottom: 20,
		color: colors.primary,
		textAlign: "center",
	},
	generateButton: {
		backgroundColor: colors.primary,
		padding: 15,
		borderRadius: 8,
		marginTop: 20,
		alignItems: "center", // Center the text
	},
	generateButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
	},
	tableList: {
		flex: 1, // Allow the list to take up available space
		marginTop: 20,
	},
});

export default TableManagementScreen;
