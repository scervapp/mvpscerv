import React, { useContext } from "react";
import { Text, View, Button } from "react-native";
import { AuthContext } from "../../context/authContext";

const RestaurantDashboard = ({ navigation }) => {
  const { logout, isLoading, currentUserData } = useContext(AuthContext);

  const handleLogout = () => {
    logout(navigation);
  };

  return (
    <View>
      {currentUserData && <Text>Welcome {currentUserData.restaurantName}</Text>}

      <Button disabled={isLoading} title="Logout" onPress={handleLogout} />
    </View>
  );
};

export default RestaurantDashboard;
