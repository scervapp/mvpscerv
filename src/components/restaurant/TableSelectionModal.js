import React, { useEffect, useState, useContext } from "react";
import { View, Text, Modal, FlatList, StyleSheet } from "react-native";
import {
  fetchTables,
  updateCheckIn,
  updateTableStatus,
  sendNotification,
} from "../../utils/firebaseUtils";
import { AuthContext } from "../../context/authContext";
import TableItem from "./TableItem";
import { Button } from "react-native";

const TableSelectionModal = ({
  isVisible,
  onClose,
  selectedCheckinId,
  currentRestaurantId,
  selectedCustomerId,
}) => {
  const { currentUserData } = useContext(AuthContext);
  const [tables, setTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState(null);

  useEffect(() => {
    // Function to fetch tables from firestore
    const fetchMyTables = async () => {
      const allTables = await fetchTables(currentRestaurantId);
      const availableTables = allTables.filter(
        (table) => table.status === "available"
      );
      setTables(availableTables);
    };

    // Only fetch tables if the modal is visible
    if (isVisible) {
      fetchMyTables();
    }
  }, [isVisible, currentRestaurantId]);

  const handleTableSelect = (table) => {
    console.log("Table selected", table);
    setSelectedTableId(table.id);
    setSelectedTableNumber(table.name);
  };

  const handleConfirm = async () => {
    if (selectedTableId) {
      try {
        //1. Update checkins document in firestore
        await updateCheckIn(selectedCheckinId, selectedTableId);

        // Update tables document in firestore
        await updateTableStatus(selectedTableId);

        // 3. Send notification to the customer
        await sendNotification(selectedCustomerId, selectedTableNumber);
      } catch (error) {
        console.log("Error in confirmation flow", error);
      } finally {
        onClose();
      }
    }
  };

  return (
    <Modal>
      <View style={styles.container}>
        <Text style={styles.title}>Tables Available</Text>

        <FlatList
          data={tables}
          renderItem={({ item }) => (
            <TableItem item={item} onPress={() => handleTableSelect(item)} />
          )}
          keyExtractor={(item) => item.id}
        />
        <View style={styles.buttonContainer}>
          <Button title="Cancel" onPress={onClose} />
          <Button
            title="Confirm"
            onPress={handleConfirm}
            disabled={!selectedTableId}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  tableList: {
    marginBottom: 20, // Space before buttons
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
});

export default TableSelectionModal;
