const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.getDailySalesReport = functions.https.onCall(async (data, context) => {
	const { restaurantId } = data;
	if (!restaurantId) {
		/* ... validation ... */
	}
	// Add auth check if needed
	console.log(
		`getDailySalesReport: Fetching report for restaurantId: ${restaurantId}`
	);

	try {
		// --- Firestore Query ---
		const ordersRef = db.collection("orders");
		const query = ordersRef
			.where("restaurantId", "==", restaurantId)
			// Optional: Add date range filtering here for performance on large datasets
			// const oneWeekAgo = new Date();
			// oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
			// .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(oneWeekAgo))
			.orderBy("timestamp", "desc");

		const ordersSnapshot = await query.get();

		console.log(
			`getDailySalesReport: Found ${ordersSnapshot.size} orders for restaurant ${restaurantId}`
		);

		if (ordersSnapshot.empty) {
			console.log(
				"getDailySalesReport: No orders found for the specified criteria."
			);
			return []; // Return empty array if no orders match
		}

		// --- Data Aggregation ---
		let reportsByDay = {};

		ordersSnapshot.forEach((orderDoc) => {
			const orderId = orderDoc.id;
			const orderData = orderDoc.data();

			// Validate timestamp
			if (
				!orderData.timestamp ||
				typeof orderData.timestamp.toDate !== "function"
			) {
				console.warn(
					`Skipping Order ID: ${orderId} - Invalid or missing timestamp.`
				);
				return; // Skip this document
			}

			const orderDate = orderData.timestamp
				.toDate()
				.toISOString()
				.split("T")[0]; // YYYY-MM-DD

			// Initialize daily report structure if it's the first order for that day
			if (!reportsByDay[orderDate]) {
				console.log(`Initializing report for date: ${orderDate}`);
				reportsByDay[orderDate] = {
					restaurantSubtotal: 0, // Net Sales (after discounts)
					totalOriginalSubtotal: 0, // Gross Sales (before discounts)
					totalTaxCollected: 0,
					totalGratuityReceived: 0,
					itemCounts: {}, // Stores { itemName: { count, revenue, discount, originalPricePerUnit } }
					serverTips: {}, // Stores { serverName: totalTipAmount }
					totalPlatformFeePotential: 0, // Sum of potential platform fees (orderData.fee)
					ordersWithFeeWaived: 0, // Count of orders where fee was waived
					estimatedStripeFees: 0, // Sum of estimated Stripe fees for orders on this day
					orderCount: 0,
					totalDiscountApplied: 0,
					paymentMethodCounts: {}, // Stores { paymentMethodType: count }
				};
			}

			const dailyReport = reportsByDay[orderDate];

			// Safely extract and sum numerical data (defaulting to 0 if missing/invalid)
			const orderSubtotal = Number(orderData.subtotal) || 0;
			const orderTax = Number(orderData.tax) || 0;
			const orderGratuity = Number(orderData.gratuity) || 0;
			const orderPlatformFee = Number(orderData.fee) || 0;
			const platformFeeWaived = orderData.platformFeeWaived === true;
			const orderTotalPrice = Number(orderData.totalPrice) || 0; // Needed for Stripe fee estimate
			// Default originalSubtotal to subtotal if missing
			const orderOriginalSubtotal =
				Number(
					orderData.originalSubtotal !== undefined
						? orderData.originalSubtotal
						: orderSubtotal
				) || 0;
			const orderDiscount = orderOriginalSubtotal - orderSubtotal; // Calculate discount for this order
			// Ensure paymentMethodType exists and is stored on order doc
			const paymentMethodType = orderData.paymentMethodType || "unknown";

			// Estimate Stripe Fee for THIS order (use a constant or config for rates)
			const stripeRate = 0.029;
			const stripeFixedFee = 30; // cents
			const estimatedOrderStripeFee =
				Math.round(orderTotalPrice * stripeRate) + stripeFixedFee;

			// Aggregate daily totals
			dailyReport.restaurantSubtotal += orderSubtotal;
			dailyReport.totalOriginalSubtotal += orderOriginalSubtotal;
			dailyReport.totalTaxCollected += orderTax;
			dailyReport.totalGratuityReceived += orderGratuity;
			dailyReport.totalPlatformFeePotential += orderPlatformFee;
			dailyReport.estimatedStripeFees += estimatedOrderStripeFee;
			dailyReport.orderCount += 1;
			dailyReport.totalDiscountApplied += orderDiscount;
			dailyReport.paymentMethodCounts[paymentMethodType] =
				(dailyReport.paymentMethodCounts[paymentMethodType] || 0) + 1;

			if (platformFeeWaived) {
				dailyReport.ordersWithFeeWaived += 1;
			}

			// Aggregate Item Counts & Details
			if (Array.isArray(orderData.items)) {
				orderData.items.forEach((item) => {
					const itemName = item.dish.name || "Unknown Item"; // Safer access
					const itemQuantity = Number(item.quantity) || 1;
					const itemOriginalPrice = Math.round(
						(Number(item.dish.price) || 0) * 100
					);
					const itemPricePaid = Math.round(
						(Number(
							item.discount ? parseFloat(item.discountedPrice) : item.dish.price
						) || 0) * 100
					);
					const itemRevenue = itemPricePaid * itemQuantity;
					const itemDiscount = itemOriginalPrice * itemQuantity - itemRevenue; // Calculate total discount for this line item

					if (!dailyReport.itemCounts[itemName]) {
						dailyReport.itemCounts[itemName] = {
							count: 0,
							revenue: 0,
							discount: 0,
							originalPricePerUnit: itemOriginalPrice,
						};
					}
					dailyReport.itemCounts[itemName].count += itemQuantity;
					dailyReport.itemCounts[itemName].revenue += itemRevenue;
					dailyReport.itemCounts[itemName].discount += itemDiscount;
				});
			}

			// Aggregate Server Tips
			if (orderData.server && orderGratuity > 0) {
				const serverName =
					`${orderData.server.firstName || ""} ${
						orderData.server.lastName || ""
					}`.trim() || "Unknown Server";
				if (!dailyReport.serverTips[serverName]) {
					dailyReport.serverTips[serverName] = 0;
				}
				dailyReport.serverTips[serverName] += orderGratuity;
			}
		});

		// --- Format Final Output ---
		const sortedReports = Object.entries(reportsByDay)
			.map(([date, report]) => {
				const wasAnyFeeWaived = report.ordersWithFeeWaived > 0;
				// If fees were waived, the restaurant deduction for processing is 0
				const restaurantFeeDeduction = wasAnyFeeWaived
					? 0
					: report.estimatedStripeFees;
				// Base total collected (excluding platform fees, including tips)
				const restaurantBaseTotal =
					report.restaurantSubtotal +
					report.totalTaxCollected +
					report.totalGratuityReceived;
				// Estimated payout after potential processing fee deduction
				const estimatedNetPayout = restaurantBaseTotal - restaurantFeeDeduction;
				// Average Order Value (based on base total, per order)
				const averageOrderValue =
					report.orderCount > 0 ? restaurantBaseTotal / report.orderCount : 0;

				return {
					date,
					orderCount: report.orderCount,
					// Financials (RETURN RAW CENTS)
					grossSales: report.totalOriginalSubtotal,
					totalDiscountApplied: report.totalDiscountApplied,
					netSales: report.restaurantSubtotal,
					totalTaxCollected: report.totalTaxCollected,
					totalGratuityReceived: report.totalGratuityReceived,
					restaurantBaseTotal: restaurantBaseTotal, // Subtotal+Tax+Tip
					estimatedProcessingFeesDeducted: restaurantFeeDeduction, // Est. Stripe fee deduction (0 if waived)
					potentialPlatformFee: report.totalPlatformFeePotential, // Your potential fee
					estimatedNetPayout: estimatedNetPayout,
					averageOrderValue: Math.round(averageOrderValue), // AOV in cents

					// Waiver Status
					wasAnyFeeWaived: wasAnyFeeWaived,
					ordersWithFeeWaived: report.ordersWithFeeWaived,

					// Payment Methods Summary
					paymentMethodSummary: Object.entries(report.paymentMethodCounts).map(
						([type, count]) => ({ type, count })
					),

					// Server Tips Breakdown (RAW CENTS)
					serverTips: Object.entries(report.serverTips)
						.map(([name, gratuity]) => ({
							serverName: name,
							gratuityTotal: gratuity,
						}))
						.sort((a, b) => b.gratuityTotal - a.gratuityTotal), // Sort tips desc

					// All Items Sold Breakdown (RAW CENTS)
					allItemsSold: Object.entries(report.itemCounts)
						.map(([name, info]) => ({
							name,
							count: info.count,
							totalRevenue: info.revenue, // Net revenue for this item type
							totalDiscount: info.discount, // Total discount for this item type
							originalPricePerUnit: info.originalPricePerUnit,
						}))
						.sort((a, b) => b.count - a.count), // Sort by count desc
				};
			})
			.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort reports by date descending

		return sortedReports;
	} catch (error) {
		console.error("Error getting daily sales report:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Failed to generate sales report.",
			error.message
		);
	}
});
