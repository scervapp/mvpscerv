import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
} from "react-native";

import { Button, SearchBar } from "react-native-elements";
import RestaurantList from "../../components/customer/RestaurantList";

const CustomerDashboard = ({ route, navigation }) => {
  const [searchText, setSearchText] = useState("");

  const handleSignOut = async () => {
    try {
      await signOut({ global: true });
      navigation.navigate("Welcome");
    } catch (error) {
      console.log("error signing out: ", error);
    }
  };

  const handleSearch = (text) => {
    setSearchText(text);
  };

  return (
    <View style={styles.container}>
      <SearchBar
        placeholder="Search for restaurants..."
        onChangeText={handleSearch}
        containerStyle={styles.searchBar}
        inputContainerStyle={{ backgroundColor: "#FFFFFF" }}
        inputStyle={{ color: "#000000" }}
        value={searchText}
      />
      <RestaurantList />
      <Button title="Logout" onPress={handleSignOut} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
  },
  text: {
    fontSize: 24,
    fontWeight: "bold",
  },
  searchBar: {
    backgroundColor: "transparent",
    borderBottomColor: "transparent",
    borderTopColor: "transparent",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
});

export default CustomerDashboard;
