import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Card, ListItem } from "react-native-elements";

const TableItem = ({ item, onPress, isSelected, isCheckinFlow }) => {
  // Determin background color based on status
  const tableItemStyle = {
    ...styles.tableItem,
    backgroundColor: getTableItemStyle(item.status),
  };
  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      style={[styles.tableItem, isSelected && styles.selected]}
    >
      <Text style={styles.tableNumber}>{item.name}</Text>
      {isCheckinFlow && item.status === "available" && (
        <Text style={styles.status}>item.status</Text>
      )}
    </TouchableOpacity>
  );
};

const getTableItemStyle = (status) => {
  switch (status) {
    case "available":
      return "green"; // Green style
    case "occupied":
      return "red"; // Red style
    case "checkedOut":
      return "yellow"; // Yellow style
    default:
      return {}; // Default styles (optional)
  }
};
const styles = StyleSheet.create({
  container: {
    margin: 5,
  },
  tableItem: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    marginBottom: 5,
  },
  availableTable: {
    backgroundColor: "green",
  },
  occupiedTable: {
    backgroundColor: "red",
  },
  checkedOutTable: {
    backgroundColor: "yellow",
  },
  tableNumber: {
    fontSize: 14, // Adjust as needed
    fontWeight: "bold",
    textAlign: "center",
  },
  selected: {
    backgroundColor: "lightblue",
  },
  status: {
    color: "#999",
    fontSize: 12,
  },
});

export default TableItem;
