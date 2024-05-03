import React, { useContext, useEffect } from "react";
import { useState } from "react";
import { Button, FlatList, StyleSheet, Text } from "react-native";
import { View } from "react-native";
import TableItem from "../../components/restaurant/TableItem";
import { AuthContext } from "../../context/authContext";
import { generateTables, fetchTables } from "../../utils/firebaseUtils";
import { collection, query, getDocs, where } from "firebase/firestore";
import { db } from "../../config/firebase";

const TableManagementScreen = () => {
  const { currentUserData } = useContext(AuthContext);
  const [tables, setTables] = useState([]);
  const [numColumns, setNumColumns] = useState(3);

  // Fech tables in db
  useEffect(() => {
    const fetchData = async () => {
      const allTables = await fetchTables(currentUserData.uid);
      setTables(allTables);
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

  const handleTableSelection = (id) => {
    console.log(id);
  };
  return (
    <View style={styles.container}>
      <Text>Table Management</Text>
      {tables.length === 0 && (
        <View>
          <Text>No tables found</Text>
          <Button onPress={handleTableGeneration} title="Generate Tables" />
        </View>
      )}
      <FlatList
        data={tables}
        renderItem={({ item }) => (
          <TableItem
            item={item}
            onPress={() => handleTableSelection(item.id)}
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.tableList}
        key={numColumns}
        numColumns={numColumns}
      />
    </View>
  );
};

// create stylesheet

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    padding: 20,
  },
  tableList: {
    justifyContent: "space-between",
  },
});

export default TableManagementScreen;
