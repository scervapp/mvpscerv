import React from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Image,
} from "react-native";

const MenuItemsList = ({ menuItems, isLoading }) => {
  console.log("Menu Items from list", menuItems);

  const renderItem = ({ item }) => (
    <View style={styles.menuItem}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: item.imageUri }} style={styles.image} />
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.price}>${item.price}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="small" color="#FF6C44" />
      ) : menuItems.length === 0 ? (
        <Text>No menu items found.</Text>
      ) : (
        <FlatList
          data={menuItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
        />
      )}
      <FlatList />
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1, // Allow the list to grow vertically
    marginBottom: 20, // Add some space below the list
  },
  menuItem: {
    flexDirection: "row", // Arrange items horizontally (image + content)
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#f2f2f2", // Light background for the item
    marginBottom: 10, // Space between menu items
  },
  imageContainer: {
    width: 100,
    height: 100,
    marginRight: 15, // Space between image and content
    borderRadius: 10, // Rounded corners for image
    overflow: "hidden", // Prevent image overflow
  },
  image: {
    width: "100%", // Fill the image container
    height: "100%",
  },
  contentContainer: {
    flex: 1, // Allow content to fill remaining space
  },
  name: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  price: {
    color: "#FF6C44", // Match your theme color for price
  },
  description: {
    fontSize: 14,
    color: "#666666", // Light text color for description
  },
});

export default MenuItemsList;
