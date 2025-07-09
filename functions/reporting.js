const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.getDailySalesReport = functions.https.onCall(async (data, context) => {
	const { restaurantId } = data;
	if (!restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID is required."
		);
	}

	try {
		const ordersRef = db.collection("orders");
		const q = ordersRef
			.where("restaurantId", "==", restaurantId)
			.where("paymentStatus", "==", "paid");
		const ordersSnapshot = await q.get();

		if (ordersSnapshot.empty) {
			return [];
		}

		let reportsByDay = {};
		const timeZone = "America/New_York"; // IMPORTANT: Set to your primary operational timezone

		ordersSnapshot.forEach((orderDoc) => {
			const orderData = orderDoc.data();
			if (
				!orderData.timestamp ||
				typeof orderData.timestamp.toDate !== "function"
			) {
				console.warn(`Skipping Order ID: ${orderDoc.id} - Invalid timestamp.`);
				return;
			}

			// Convert the UTC timestamp to a date string in the specified timezone.
			const orderDate = new Date(
				orderData.timestamp.toDate().toLocaleString("en-US", { timeZone })
			);
			const dateKey = orderDate.toISOString().split("T")[0]; // YYYY-MM-DD format

			if (!reportsByDay[dateKey]) {
				reportsByDay[dateKey] = {
					date: dateKey,
					orderCount: 0,
					grossSales: 0,
					totalDiscountApplied: 0,
					netSales: 0,
					totalTaxCollected: 0,
					totalGratuityReceived: 0,
					estimatedProcessingFeesDeducted: 0,
					allItemsSold: [],
					serverTips: [],
					// ... other fields you need to initialize
				};
			}

			const dailyReport = reportsByDay[dateKey];

			// --- Aggregate data (your existing logic is already very good) ---
			const orderSubtotal = Number(orderData.subtotal) || 0;
			const orderGratuity = Number(orderData.gratuity) || 0;
			const originalSubtotal =
				Number(orderData.originalSubtotal) || orderSubtotal;

			dailyReport.orderCount += 1;
			dailyReport.grossSales += originalSubtotal + orderGratuity;
			dailyReport.totalDiscountApplied += originalSubtotal - orderSubtotal;
			dailyReport.netSales += orderSubtotal;
			dailyReport.totalTaxCollected += Number(orderData.taxActual) || 0;
			dailyReport.totalGratuityReceived += orderGratuity;
			dailyReport.estimatedProcessingFeesDeducted +=
				Number(orderData.stripeFeeActual) || 0;

			// Aggregate items sold for the detailed list
			if (Array.isArray(orderData.items)) {
				orderData.items.forEach((item) => {
					const itemName =
						(item.dish && item.dish.name) || item.dishName || "Unknown Item";
					const existingItem = dailyReport.allItemsSold.find(
						(i) => i.name === itemName
					);
					const revenue =
						(Number(item.discountedPrice) ||
							(item.dish && item.dish.price) ||
							0) * (item.quantity || 1);

					if (existingItem) {
						existingItem.count += item.quantity || 1;
						existingItem.totalRevenue += Math.round(revenue * 100);
					} else {
						dailyReport.allItemsSold.push({
							name: itemName,
							count: item.quantity || 1,
							totalRevenue: Math.round(revenue * 100),
						});
					}
				});
			}

			// Aggregate server tips
			if (orderData.server.name && orderGratuity > 0) {
				const serverName = orderData.server.name;
				const existingServer = dailyReport.serverTips.find(
					(s) => s.serverName === serverName
				);
				if (existingServer) {
					existingServer.gratuityTotal += orderGratuity;
				} else {
					dailyReport.serverTips.push({
						serverName,
						gratuityTotal: orderGratuity,
					});
				}
			}
		});

		// --- Format Final Output ---
		const sortedReports = Object.values(reportsByDay)
			.map((report) => {
				const estimatedNetPayout =
					report.netSales +
					report.totalGratuityReceived -
					report.estimatedProcessingFeesDeducted;
				return { ...report, estimatedNetPayout };
			})
			.sort((a, b) => new Date(b.date) - new Date(a.date));

		return sortedReports;
	} catch (error) {
		console.error("Error getting daily sales report:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Failed to generate sales report."
		);
	}
});

// --- IMPORTANT ---
// Define all of your menu item categories that should be grouped under "Bar" sales.
// Make sure these names exactly match the 'category' field on your dish items.
const BAR_CATEGORIES = [
	"Beer",
	"Wine",
	"Cocktails",
	"Spirits",
	"Sodas",
	"Juices",
	"Non-Alcoholic Drinks",
	"Beverages",
];

exports.getAggregatedSalesReport = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		// 1. Authentication and Validation
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated."
			);
		}
		const { restaurantId, period } = data;
		if (!restaurantId || !period) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID and a period are required."
			);
		}

		// 2. Date Range Logic
		const now = new Date();
		let startDate;
		const timeZone = "America/New_York"; // Set to your primary operational timezone
		const today = new Date(now.toLocaleString("en-US", { timeZone }));
		today.setHours(0, 0, 0, 0);

		switch (period) {
			case "today":
				startDate = today;
				break;
			case "week":
				startDate = new Date(today);
				startDate.setDate(startDate.getDate() - today.getDay()); // Assumes week starts on Sunday
				break;
			case "month":
				startDate = new Date(today.getFullYear(), today.getMonth(), 1);
				break;
			default:
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Invalid period specified."
				);
		}

		try {
			// 3. Firestore Query
			const ordersQuery = db
				.collection("orders")
				.where("restaurantId", "==", restaurantId)
				.where("paymentStatus", "==", "paid") // Only include fully paid orders
				.where(
					"timestamp",
					">=",
					admin.firestore.Timestamp.fromDate(startDate)
				);

			const ordersSnapshot = await ordersQuery.get();
			if (ordersSnapshot.empty) return null;

			// 4. Enhanced Data Aggregation
			let totalGrossRevenue = 0;
			let totalStripeFees = 0;
			let totalOrders = 0;
			let totalDiscounts = 0; // Accumulator for discounts
			let totalTurnoverDuration = 0;
			let ordersWithTurnover = 0;

			const salesByCategory = { Food: 0, Bar: 0 };
			const topSellingItems = {};
			const salesByHour = Array(24).fill(0);
			const salesByDay = Array(7).fill(0);

			ordersSnapshot.forEach((doc) => {
				const order = doc.data();
				const orderTimestamp = order.timestamp.toDate();

				// Financial calculations based on your business rules
				const orderSubtotal = Number(order.subtotal) || 0;
				const orderGratuity = Number(order.gratuity) || 0;
				const orderStripeFee = Number(order.stripeFeeActual) || 0;
				const originalSubtotal =
					Number(order.originalSubtotal) || orderSubtotal;

				totalGrossRevenue += orderSubtotal + orderGratuity;
				totalStripeFees += orderStripeFee;
				totalDiscounts += originalSubtotal - orderSubtotal;
				totalOrders += 1;

				// Busiest Times/Days Aggregation
				const hour = orderTimestamp.getHours();
				const dayOfWeek = orderTimestamp.getDay();
				salesByHour[hour] += orderSubtotal;
				salesByDay[dayOfWeek] += orderSubtotal;

				// Table Turnover Calculation
				if (order.checkInTimestamp && order.timestamp) {
					const checkInTime = order.checkInTimestamp.toDate();
					const durationMinutes =
						(orderTimestamp.getTime() - checkInTime.getTime()) / 60000;
					if (durationMinutes > 0) {
						totalTurnoverDuration += durationMinutes;
						ordersWithTurnover += 1;
					}
				}

				// Detailed Item & Category Aggregation
				if (Array.isArray(order.items)) {
					order.items.forEach((item) => {
						const priceInCents = Math.round(
							((item.dish && item.dish.price) || 0) * 100
						);
						const discountedPriceInCents = Math.round(
							(Number(item.discountedPrice) || 0) * 100
						);
						const revenueInCents =
							(discountedPriceInCents || priceInCents) * (item.quantity || 1);
						const category = (item.dish && item.dish.category) || "Other";
						const itemName =
							(item.dish && item.dish.name) || item.dishName || "Unknown Item";

						if (BAR_CATEGORIES.includes(category)) {
							salesByCategory.Bar += revenueInCents;
						} else {
							salesByCategory.Food += revenueInCents;
						}

						if (!topSellingItems[itemName]) {
							topSellingItems[itemName] = {
								name: itemName,
								quantity: 0,
								totalRevenue: 0,
							};
						}
						topSellingItems[itemName].quantity += item.quantity || 1;
						topSellingItems[itemName].totalRevenue += revenueInCents;
					});
				}
			});

			// 5. Format and Return the Final, Rich Report Object
			const netPayout = totalGrossRevenue - totalStripeFees;
			const avgCheckSize =
				totalOrders > 0 ? totalGrossRevenue / totalOrders : 0;
			const avgTurnoverRate =
				ordersWithTurnover > 0 ? totalTurnoverDuration / ordersWithTurnover : 0;

			const formattedTopItems = Object.values(topSellingItems)
				.sort((a, b) => b.totalRevenue - a.totalRevenue)
				.slice(0, 10);

			return {
				totalRevenue: totalGrossRevenue,
				netPayout: netPayout,
				totalDiscounts: totalDiscounts,
				totalOrders,
				avgCheckSize,
				avgTurnoverRate: Math.round(avgTurnoverRate),
				salesByCategory: {
					Food: Math.round(salesByCategory.Food),
					Bar: Math.round(salesByCategory.Bar),
				},
				topSellingItems: formattedTopItems,
				salesByHour: salesByHour.map((s) => Math.round(s)),
				salesByDay: salesByDay.map((s) => Math.round(s)),
			};
		} catch (error) {
			console.error("Error generating aggregated sales report:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to generate sales report."
			);
		}
	});

exports.getDashboardReport = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated."
			);
		}
		const { restaurantId, period } = data;
		if (!restaurantId || !period) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID and a period are required."
			);
		}

		const timeZone = "America/New_York";
		let startDate;
		const now = new Date();
		const today = new Date(now.toLocaleString("en-US", { timeZone }));
		today.setHours(0, 0, 0, 0);

		switch (period) {
			case "today":
				startDate = today;
				break;
			case "week":
				startDate = new Date(today);
				startDate.setDate(startDate.getDate() - today.getDay());
				break;
			case "month":
				startDate = new Date(today.getFullYear(), today.getMonth(), 1);
				break;
			default:
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Invalid period specified."
				);
		}

		try {
			const ordersQuery = db
				.collection("orders")
				.where("restaurantId", "==", restaurantId)
				.where("paymentStatus", "==", "paid")
				.where(
					"timestamp",
					">=",
					admin.firestore.Timestamp.fromDate(startDate)
				);

			const ordersSnapshot = await ordersQuery.get();
			if (ordersSnapshot.empty) return null;

			let totalGrossRevenue = 0;
			let totalStripeFees = 0;
			let totalOrders = 0;
			let totalDiscounts = 0;
			let totalGratuity = 0; // New accumulator for tips
			let totalTurnoverDuration = 0;
			let ordersWithTurnover = 0;
			const salesByCategory = { Food: 0, Bar: 0 };
			const topSellingItems = {};
			const salesByHour = Array(24).fill(0);
			const salesByDay = Array(7).fill(0);
			const serverTips = {};

			ordersSnapshot.forEach((doc) => {
				const order = doc.data();
				const orderTimestamp = order.timestamp.toDate();

				const orderSubtotal = Number(order.subtotal) || 0;
				const orderGratuity = Number(order.gratuity) || 0;
				const orderStripeFee = Number(order.stripeFeeActual) || 0;
				const originalSubtotal =
					Number(order.originalSubtotal) || orderSubtotal;

				totalGrossRevenue += orderSubtotal + orderGratuity;

				// 2. Accumulate gratuity and Stripe fees separately.
				totalGratuity += orderGratuity;
				totalStripeFees += orderStripeFee;

				// 3. Accumulate discounts and order count.
				totalDiscounts += originalSubtotal - orderSubtotal;
				totalOrders += 1;

				salesByHour[orderTimestamp.getHours()] += orderSubtotal;
				salesByDay[orderTimestamp.getDay()] += orderSubtotal;

				if (order.checkInTimestamp && order.timestamp) {
					const durationMinutes =
						(orderTimestamp.getTime() -
							order.checkInTimestamp.toDate().getTime()) /
						60000;
					if (durationMinutes > 0) {
						totalTurnoverDuration += durationMinutes;
						ordersWithTurnover += 1;
					}
				}

				if (Array.isArray(order.items)) {
					order.items.forEach((item) => {
						const category = (item.dish && item.dish.category) || "Other";
						const priceInCents = Math.round(
							((item.dish && item.dish.price) || 0) * 100
						);
						const revenueInCents =
							(Math.round((Number(item.discountedPrice) || 0) * 100) ||
								priceInCents) * (item.quantity || 1);
						const itemName =
							(item.dish && item.dish.name) || item.dishName || "Unknown Item";

						if (BAR_CATEGORIES.includes(category))
							salesByCategory.Bar += revenueInCents;
						else salesByCategory.Food += revenueInCents;

						if (!topSellingItems[itemName])
							topSellingItems[itemName] = {
								name: itemName,
								quantity: 0,
								totalRevenue: 0,
							};
						topSellingItems[itemName].quantity += item.quantity || 1;
						topSellingItems[itemName].totalRevenue += revenueInCents;
					});
				}

				if (order.server.name && orderGratuity > 0) {
					const serverName = order.server.name;
					serverTips[serverName] =
						(serverTips[serverName] || 0) + orderGratuity;
				}
			});

			const netPayout = totalGrossRevenue - totalStripeFees;
			const avgCheckSize =
				totalOrders > 0 ? totalGrossRevenue / totalOrders : 0;
			const avgTurnoverRate =
				ordersWithTurnover > 0 ? totalTurnoverDuration / ordersWithTurnover : 0;

			// For "Today", return the full detailed breakdown.

			return {
				totalRevenue: totalGrossRevenue,
				netPayout,
				totalDiscounts,
				totalGratuity,
				totalStripeFees,
				totalOrders,
				avgCheckSize,
				avgTurnoverRate: Math.round(avgTurnoverRate),
				allItemsSold: Object.values(topSellingItems).sort(
					(a, b) => b.totalRevenue - a.totalRevenue
				),
				serverTips: Object.entries(serverTips)
					.map(([name, total]) => ({ serverName: name, gratuityTotal: total }))
					.sort((a, b) => b.gratuityTotal - a.gratuityTotal),
				// These are still calculated but might only be used by the client for Week/Month charts
				salesByCategory: {
					Food: Math.round(salesByCategory.Food),
					Bar: Math.round(salesByCategory.Bar),
				},
				salesByHour: salesByHour.map((s) => Math.round(s)),
				salesByDay: salesByDay.map((s) => Math.round(s)),
			};
		} catch (error) {
			console.error("Error generating dashboard report:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to generate report."
			);
		}
	});
