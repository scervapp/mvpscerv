import React, { useEffect, useState, useContext } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { AuthContext } from "../../context/authContext";
import {
  collection,
  where,
  query,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { StyleSheet } from "react-native";
import moment from "moment";
import TableSelectionModal from "../../components/restaurant/TableSelectionModal";

const RestaurantCheckin = () => {
  const { currentUserData } = useContext(AuthContext);
  const [checkIns, setCheckIns] = useState([]);
  const [isTableModalVisible, setIsTableModalVisible] = useState(false);
  const [selectedTabelId, setSelectedTableId] = useState(null);
  const [selectedCheckInId, setSelectedCheckInId] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  useEffect(() => {
    const checkinItemRef = collection(db, "notifications");
    const querySnap = query(
      checkinItemRef,
      where("restaurantId", "==", currentUserData.uid),
      where("type", "==", "checkIn"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(querySnap, (snapshot) => {
      let checkInsData = [];
      snapshot.docChanges().forEach((change) => {
        checkInsData.push({
          id: doc.id,
          ...doc.data(),
          customerId: doc.data().customerId,
        });
      });
      setCheckIns(checkInsData);
    });
    return () => unsubscribe;
  }, [currentUserData.uid]);

  const formatTime = (timestamp) => {
    const now = moment();
    const then = moment(timestamp.toDate());
    const diffMinutes = now.diff(then, "minutes");

    if (diffMinutes < 60) {
      return `${diffMinutes} Mins Ago`;
    } else {
      return then.format("h:mm A"); // Display actual time if over an hour
    }
  };

  const openTableModal = (item) => {
    setSelectedCheckInId(item.checkInId);
    setSelectedCustomerId(item.customerId);
    setIsTableModalVisible(true);
  };

  const closeTableModal = () => {
    setIsTableModalVisible(false);
  };

  const renderStatusIcon = (status) => {
    switch (status) {
      case "pending":
        return <Text>Pending</Text>;
      case "completed":
        return <Text>Completed</Text>;
      default:
        return <Text>Unknown</Text>;
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => {
        if (item.status === "pending") {
          console.log("From the modal", item);
          openTableModal(item);
        }
      }}
    >
      <View style={styles.checkInItem}>
        <View style={styles.checkInDetailsLeft}>
          <Text style={styles.checkInTime}>{formatTime(item.timestamp)}</Text>
          {item.customerName && (
            <Text style={styles.customerName}>
              {item.customerName} - P{item.numberOfPeople}
            </Text>
          )}
        </View>
        <View style={styles.checkInDetailsRight}>
          <Text style={styles.checkInStatus}>
            {renderStatusIcon(item.status)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {isTableModalVisible && (
        <TableSelectionModal
          isVisible={isTableModalVisible}
          onClose={closeTableModal}
          selectedCheckinId={selectedCheckInId}
          currentRestaurantId={currentUserData.uid}
          selectedCustomerId={selectedCustomerId}
        />
      )}

      <View style={styles.titleContainer}>
        <Text style={styles.title}>Customers Waiting</Text>
      </View>
      <View style={styles.listContainer}>
        {checkIns.length === 0 ? (
          <View style={styles.noCheckinsContainer}>
            <Text style={styles.noCheckinsText}>
              No customers waiting at the moment
            </Text>
          </View>
        ) : (
          <FlatList
            data={checkIns}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Add a container style
    padding: 15, // Overall padding for the list
    backgroundColor: "#fbfbfb", // Subtle background color
  },

  titleContainer: {
    alignSelf: "center",
  },

  listContainer: {
    backgroundColor: "#fff", // Subtle white background
    padding: 15, // Padding around the list items
    borderRadius: 8, // Slightly rounded corners
    marginTop: 15, // Space between title and list
    marginBottom: 20, // Space between list and screen bottom
    // Optional for shadow effect (iOS):
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    // (Android)
    elevation: 3,
  },

  title: {
    paddingTop: 20,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },

  checkInItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15, // More spacing within each item
    borderBottomWidth: 1,
    borderBottomColor: "#eee", // Lighter border
    borderRadius: 10, // Rounded corners
    marginVertical: 5, // Spacing between list items
  },
  checkInDetailsLeft: {
    flex: 1,
    marginRight: 10, // Space between left and right sections
    flexDirection: "row",
  },
  checkInDetailsRight: {
    alignItems: "center",
  },
  checkInTime: {
    fontSize: 12, // Slightly larger timestamp
    fontWeight: "500", // Medium font weight
    color: "#999",
  },
  customerName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#666", // Slightly darker for better contrast
    alignSelf: "center",
    marginLeft: 10,
  },
  partySize: {
    fontSize: 16,
  },
  noCheckinsContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  noCheckinsText: {
    fontSize: 16,
    color: "#999",
    fontWeight: "500",
  },
});

export default RestaurantCheckin;
