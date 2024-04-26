import React, { useEffect, useState, useContext } from "react";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { Text, View, Button } from "react-native";
import { AuthContext } from "../../context/authContext";
import app from "../../config/firebase";

const RestaurantDashboard = ({ navigation }) => {
  const { isLoading, currentUserData } = useContext(AuthContext);
  const [isSetupButtonVisible, setIsSetupButtonVisible] = useState(true);
  const db = getFirestore(app);

  useEffect(() => {
    const checkProfileCompleted = async () => {
      const userDoc = doc(db, "users", currentUserData.uid);
      const userDocSnap = await getDoc(userDoc);
      if (userDocSnap.exists() && userDocSnap.data().completedProfile) {
        // Hide setup button if the profile is already completed
        setIsSetupButtonVisible(false);
      }
    };
    checkProfileCompleted();
  }, []);

  const handleSetupProfile = () => {
    // Navigate to the setup profile screen
    navigation.navigate("RestaurantProfile");
  };

  return (
    <View>
      <Text>RestaurantDashboard {currentUserData.restaurantName}</Text>
      {isSetupButtonVisible && (
        <Button title="Setup Profile" onPress={handleSetupProfile} />
      )}
    </View>
  );
};

export default RestaurantDashboard;
