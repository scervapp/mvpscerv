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
      style={[styles.tableItem, tableItemStyle, isSelected && styles.selected]}
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
      return "#d1f2eb"; // Green style
    case "occupied":
      return "#f8d7d"; // Red style
    case "checkedOut":
      return "#fff3cd"; // Yellow style
    default:
      return {}; // Default styles (optional)
  }
};
const styles = StyleSheet.create({
  container: {
    margin: 5,
  },
  tableItem: {
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    marginBottom: 5,
    height: 100,
    width: 100,
    margin: 5,
  },
  availableTable: {
    backgroundColor: "#d1f2eb",
  },
  occupiedTable: {
    backgroundColor: "#f8d7da",
  },
  checkedOutTable: {
    backgroundColor: "#fff3cd",
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
  tableContainer: {
    flex: 1,
    width: "90%",
  },
});

export default TableItem;
