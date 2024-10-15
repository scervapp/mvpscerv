import React, { useContext, useEffect } from "react";
import { useState } from "react";
import { Button, FlatList, StyleSheet, Text, Dimensions } from "react-native";
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

const TableManagementScreen = () => {
	const { currentUserData } = useContext(AuthContext);
	const [tables, setTables] = useState([]);
	const [numColumns, setNumColumns] = useState(2);
	const [isLoading, setIsLoading] = useState(false);
	const { showActionSheetWithOptions } = useActionSheet();

	const [screenWidth, setScreenWidth] = useState(
		Dimensions.get("window").width
	);
	const horizontalMargin = 40;

	// Fech tables in db
	useEffect(() => {
		const fetchData = async () => {
			const allTables = await fetchTables(currentUserData.uid);
			const sortedTables = allTables.sort((a, b) => {
				const numA = parseInt(a.name.match(/\d+/)[0], 10); // Extract numeric value from name
				const numB = parseInt(b.name.match(/\d+/)[0], 10); // Extract numeric value from name
				return numA - numB; // Compare numeric values
			});
			setTables(sortedTables);
		};
		fetchData();
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
			const itemWidth = 120;

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
							const allTables = await fetchTables(currentUserData.uid);
							setTables(allTables);
						} catch (error) {
							console.log("Error clearing table", error);
						}
					}
				}
			);
		} catch (error) {
			console.error("Error Clearing Table", error);
		}
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Table Management</Text>
			{tables.length === 0 && (
				<View style={styles.emptyContainer}>
					<Text style={styles.emptyText}>No tables found</Text>
					<Button onPress={handleTableGeneration} title="Generate Tables" />
				</View>
			)}
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
		backgroundColor: "#f9f9f9",
		padding: 10,
		alignItems: "center",
		flex: 1,
	},
	title: {
		fontSize: 24,
		fontWeight: "700",
		marginBottom: 20,
		color: "#333",
	},
	emptyContainer: {
		alignItems: "center",
		marginTop: 20,
	},
	emptyText: {
		fontSize: 18,
		color: "#888",
		marginBottom: 10,
	},
	tableList: {
		justifyContent: "space-between",
	},
});

export default TableManagementScreen;
