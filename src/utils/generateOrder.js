import { serverTimestamp } from "firebase/firestore";

function generateOrderId(customerId, restaurantId) {
  const timestamp = serverTimestamp();
  const date = new Date(timestamp.seconds * 1000); // Convert to milliseconds for Date object

  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0"); // Month is 0-indexed
  const day = date.getDate().toString().padStart(2, "0");

  // Customer-specific part (use a hash or substring of customerId)
  const customerIdentifier = customerId.slice(-4); // Last 4 characters of ID

  // Combine into a unique order ID
  const orderId = `${year}-${month}-${day}-${customerIdentifier}-${restaurantId}`;

  return orderId;
}

export default generateOrderId;
