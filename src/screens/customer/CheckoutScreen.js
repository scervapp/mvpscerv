import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useBasket } from "../../context/customer/BasketContext";

const CheckoutScreen = ({ route }) => {
  const { fetchCurrentOrder } = useBasket();
  const [order, setOrder] = useState(null);

  //   useEffect(() => {
  //     const fetchOrderData = async () => {
  //       const orderData = await fetchCurrentOrder(orderId);
  //       setOrder(orderData);
  //     };

  //     fetchOrderData();
  //   }, [orderId]); // Fetch only when orderId changes

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Confirmation</Text>

      <Text></Text>
    </View>
  );
};

export default CheckoutScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
  },
});
