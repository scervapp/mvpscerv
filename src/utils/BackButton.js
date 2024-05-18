import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const BackButton = ({ onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.backButton}>
    <Ionicons name="arrow-back" size={24} color="black" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  backButton: {
    // Add any additional styling for your back button here
    padding: 10,
  },
});

export default BackButton;
