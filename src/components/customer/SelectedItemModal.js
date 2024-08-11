import React, { useState, useContext } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Checkbox, Button } from "react-native-paper";
import colors from "../../utils/styles/appStyles";

const SelectedItemModal = ({
  visible,
  selectedItem,
  onClose,
  pips,
  selectedPIPs,
  confirmAddToBasket,
  handlePIPSelection,
}) => {
  const [customerError, setCustomerError] = useState("");

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          {/* Item Details */}
          <View style={styles.itemDetailsContainer}>
            <Text style={styles.itemName}>{selectedItem?.name}</Text>
            {selectedItem?.description && (
              <Text style={styles.itemDescription}>
                {selectedItem?.description}
              </Text>
            )}
            <Text style={styles.itemPrice}>${selectedItem?.price}</Text>
          </View>

          {/* PIP Selection */}
          <View>
            <Text style={styles.sectionTitle}>Select for:</Text>
            {customerError ? (
              <Text style={styles.errorText}>Error: {customerError}</Text>
            ) : pips.length > 0 ? (
              pips.map((pip) => (
                <TouchableOpacity
                  key={pip.id}
                  style={styles.pipCheckbox}
                  onPress={() => handlePIPSelection(pip.id)}
                >
                  <Checkbox
                    status={
                      selectedPIPs.some(
                        (selectedPip) => selectedPip.id === pip.id
                      )
                        ? "checked"
                        : "unchecked"
                    }
                    onPress={() => handlePIPSelection(pip.id)}
                    color={colors.primary}
                  />
                  <Text>{pip.name}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text>No PIPs found.</Text>
            )}
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={confirmAddToBasket}
              style={styles.addButton}
            >
              Add to Basket
            </Button>
            <Button onPress={onClose}>Cancel</Button>
          </View>
        </ScrollView>
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
    maxHeight: "80%",
    backgroundColor: "white",
  },
  itemDetailsContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  itemName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5,
  },
  itemDescription: {
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: "bold",
    color: "black",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  pipCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 20,
  },
  addButton: {
    backgroundColor: colors.primary,
    marginRight: 10,
  },
  errorText: {
    color: "red",
    marginBottom: 10,
    textAlign: "center",
  },
});

export default SelectedItemModal;
