import React from "react";
import { Button, TouchableOpacity } from "react-native";
import { View, Text, StyleSheet } from "react-native";

const SelectedItemModal = ({
  selectedItem,
  handlePipSelection,
  pips,
  handleConfirmSelection,
}) => {
  return (
    <View style={styles.modalContainer}>
      {selectedItem ? (
        <View>
          <Text style={styles.itemName}>{selectedItem.item.name}</Text>
          {/* ... other details (price, description) */}

          <Text style={styles.sectionTitle}>Choose People</Text>
          {pips && Array.isArray(pips) ? (
            pips.map((pip) => (
              <TouchableOpacity
                key={pip.id}
                onPress={() => handlePipSelection(pip.id, selectedItem.item.id)}
                style={[
                  styles.pipWithCheckbox,
                  selectedItem.selectedPeople[pip.id] && styles.selectedPip,
                ]}
              >
                <Text style={styles.pipLabel}>{pip.name}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text>Loading pips...</Text>
          )}
        </View>
      ) : (
        <Text>Loading Item details...</Text>
      )}
      <Button title="Add To Basket" onPress={handleConfirmSelection} />
    </View>
  );
};
const styles = StyleSheet.create({
  // ... your modal styles ...
  itemName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 15,
    marginBottom: 5,
  },
  pipWithCheckbox: {
    // ...
  },
  selectedPip: {
    backgroundColor: "lightblue",
  },
});

export default SelectedItemModal;
