import React, { useEffect, useState, useContext } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SectionList,
  TouchableOpacity,
} from "react-native";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { AuthContext } from "../../context/authContext";

const ChefsQScreen = () => {
  const [orders, setOrders] = useState([]);
  const { currentUserData } = useContext(AuthContext);

  useEffect(() => {
    const ordersRef = collection(db, "orders");
    const q = query(
      ordersRef,
      where("restaurantId", "==", currentUserData.uid),
      where("orderStatus", "==", "pending"), // Filter for pending orders
      orderBy("timestamp", "desc") // Sort by timestamp (newest first)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedOrders = querySnapshot.docs.map((doc) => doc.data());
      setOrders(fetchedOrders);
    });

    return () => unsubscribe();
  }, []);

  const handleItemComplete = async (orderObject, itemId) => {
    const orderId = orderObject.data[0].orderId;
    console.log("Order ID:", orderId);

    // Ensure orderObject is defined and has an orderId property
    if (!orderId) {
      console.error("Invalid order object or missing orderId:", orderid);
      return;
    }

    try {
      const orderRef = doc(db, "orders", orderId);
      const orderSnap = await getDoc(orderRef);

      // Check if order exists
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();

        // Log the entire order data for better visibility
        console.log("Order Data:", orderData);

        // Ensure the order data has the expected structure
        if (orderData && orderData.data && Array.isArray(orderData.data)) {
          const items = orderData.data;

          // Log the current items for debugging
          console.log("Current items:", items);

          const updatedItems = items.map((item) => {
            console.log("Processing item:", item);

            // Check if item has itemId property
            if (!item.itemId) {
              console.error("Item missing itemId property:", item);
              return item;
            }

            return item.itemId === itemId
              ? { ...item, itemStatus: "ready" }
              : item;
          });

          console.log("Updated items:", updatedItems);

          await updateDoc(orderRef, { data: updatedItems });

          if (updatedItems.every((item) => item.itemStatus === "ready")) {
            await updateDoc(orderRef, { orderStatus: "ready" });
          }
        } else {
          console.warn("Order does not have a valid items array or structure");
        }
      } else {
        console.warn("Order not found");
      }
    } catch (error) {
      console.log("Error marking item as complete:", error);
    }
  };

  const renderItem = ({ item, section }) => (
    <View style={styles.itemContainer}>
      <Text style={styles.itemName}>
        {item.itemName} x {item.quantity} (For: {item.pipName})
      </Text>
      <TouchableOpacity
        onPress={() => handleItemComplete(section, item.itemId)}
      >
        <Text style={styles.markCompleteButton}>Mark as Complete</Text>
      </TouchableOpacity>
      {/* Add other item details or actions here (e.g., "Mark as complete") */}
    </View>
  );

  const renderSectionHeader = ({ section: { tableNumber } }) => (
    <Text style={styles.sectionHeader}>Table {tableNumber}</Text>
  );

  // Group orders by table
  const ordersByTable = orders.reduce((acc, order) => {
    if (!acc[order.tableNumber]) {
      acc[order.tableNumber] = [];
    }
    acc[order.tableNumber].push(order);
    return acc;
  }, {});

  // Modify orderSections to include the entire order object in each item
  const orderSections = Object.entries(ordersByTable).map(
    ([tableNumber, orders]) => ({
      tableNumber,
      data: orders.flatMap((order) =>
        order.items.map((item) => ({ ...item, orderId: order.orderId }))
      ),
    })
  );

  return (
    <View style={styles.container}>
      <SectionList
        sections={orderSections}
        keyExtractor={(item, index) => item + index}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // ... your styles ...
  container: {
    flex: 1,
    padding: 20,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  itemContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  itemName: {
    fontSize: 16,
  },
});

export default ChefsQScreen;
