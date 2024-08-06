function generateOrderId(customerId, restaurantId, timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear().toString().slice(-2); // Last two digits of the year
  const month = (date.getMonth() + 1).toString().padStart(2, "0"); // Month (01-12)
  const day = date.getDate().toString().padStart(2, "0"); // Day (01-31)
  const hours = date.getHours().toString().padStart(2, "0"); // Hours (00-23)
  const minutes = date.getMinutes().toString().padStart(2, "0"); // Minutes (00-59)
  const seconds = date.getSeconds().toString().padStart(2, "0"); // Seconds (00-59)

  // Combine parts to form the order ID
  const orderId = `${restaurantId.slice(0, 3)}-${customerId.slice(
    -4
  )}-${year}${month}${day}${hours}${minutes}${seconds}`;

  return orderId;
}
