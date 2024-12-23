const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.getDailySalesReport = functions.https.onCall(async (data, context) => {
	const { restaurantId } = data;

	try {
		// Query for all orders from the restaurant
		const ordersSnapshot = await db
			.collection("orders")
			.where("restaurantId", "==", restaurantId)
			.orderBy("timestamp", "desc")
			.get();

		let reportsByDay = {};

		// Loop through each order and group by day
		ordersSnapshot.forEach((orderDoc) => {
			const orderData = orderDoc.data();

			// Ensure the timestamp exists and is valid
			if (!orderData.timestamp || !orderData.timestamp.toDate) {
				console.warn(`Invalid or missing timestamp in order ${orderDoc.id}`);
				return; // Skip this document if the timestamp is invalid
			}

			const orderDate = orderData.timestamp
				.toDate()
				.toISOString()
				.split("T")[0]; // Get the date portion (YYYY-MM-DD)

			// Initialize the report for that day if it doesn't exist
			if (!reportsByDay[orderDate]) {
				reportsByDay[orderDate] = {
					totalSales: 0,
					itemCounts: {},
					serverTips: {},
					totalTax: 0,
				};
			}

			// Safely check totalPrice and avoid NaN
			const orderTotalPrice = orderData.totalPrice || 0;

			// Add the totalPrice to the day's totalSales
			reportsByDay[orderDate].totalSales += orderTotalPrice;

			// Add the order's tax to the day's totalTax
			const orderTax = orderData.tax || 0; // Get the tax from the order, default to 0 if not present
			reportsByDay[orderDate].totalTax += orderTax;

			// Count the items sold for that day
			orderData.items.forEach((item) => {
				const itemName = item.dish.name; // Access the name from the dish map
				const itemQuantity = item.quantity || 1; // Default to 1 if quantity is not specified
				const itemPrice = parseFloat(item.dish.price) || 0; // Ensure itemPrice is a number

				if (reportsByDay[orderDate].itemCounts[itemName]) {
					// If the item already exists, increment the count and revenue
					reportsByDay[orderDate].itemCounts[itemName].count += itemQuantity;
					reportsByDay[orderDate].itemCounts[itemName].revenue +=
						itemPrice * itemQuantity; // Correct multiplication
				} else {
					// Otherwise, initialize it
					reportsByDay[orderDate].itemCounts[itemName] = {
						count: itemQuantity,
						revenue: itemPrice * itemQuantity, // Correctly set initial revenue
					};
				}
			});

			// Track gratuity per server
			if (orderData.server && orderData.gratuity) {
				const serverName = `${orderData.server.firstName} ${orderData.server.lastName}`;
				if (!reportsByDay[orderDate].serverTips[serverName]) {
					reportsByDay[orderDate].serverTips[serverName] = 0;
				}
				reportsByDay[orderDate].serverTips[serverName] += orderData.gratuity;
			}
		});

		// Convert reportsByDay into an array sorted by date (newest to oldest)
		const sortedReports = Object.entries(reportsByDay)
			.map(([date, report]) => ({
				date,
				totalSales: report.totalSales.toFixed(2),
				totalTax: report.totalTax.toFixed(2),
				serverTips: Object.entries(report.serverTips).map(
					([name, gratuity]) => ({
						serverName: name,
						gratuityTotal: gratuity.toFixed(2),
					})
				),
				topSellingItems: Object.entries(report.itemCounts)
					.sort((a, b) => b[1].count - a[1].count) // Sort by quantity sold
					.map(([name, info]) => ({
						name,
						count: info.count,
						totalRevenue: info.revenue.toFixed(2), // Format totalRevenue correctly
					})),
			}))
			.sort((a, b) => new Date(b.date) - new Date(a.date));

		return sortedReports;
	} catch (error) {
		console.error("Error getting daily sales report:", error);
		throw new functions.https.HttpsError("internal", error.message);
	}
});
