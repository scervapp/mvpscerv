const admin = require("firebase-admin");

const PANAMA_TIMEZONE = "America/Panama";

const BAR_CATEGORIES = [
	"Beer",
	"Wine",
	"Cocktails",
	"Spirits",
	"Sodas",
	"Juices",
	"Non-Alcoholic Drinks",
	"Alcoholic Drinks",
	"Beverages",
	"Drinks",
	"Coffee",
	"Tea",
];

const safeNumber = (value, fallback = 0) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
};

const parseDate = (ts) => {
	if (!ts) return null;
	if (typeof ts.toDate === "function") return ts.toDate();
	if (ts._seconds !== undefined) return new Date(ts._seconds * 1000);
	if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
	if (typeof ts === "string" || typeof ts === "number") {
		const d = new Date(ts);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return null;
};

const getStartDateForPeriod = (period, timeZone = PANAMA_TIMEZONE) => {
	const now = new Date();
	const today = new Date(now.toLocaleString("en-US", { timeZone }));
	today.setHours(0, 0, 0, 0);

	let startDate;
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
			throw new Error(`Invalid period: ${period}`);
	}
	return startDate;
};

const isBarCategory = (categoryValue) => {
	const normalized = String(categoryValue || "")
		.trim()
		.toLowerCase();
	return BAR_CATEGORIES.some(
		(cat) => String(cat).trim().toLowerCase() === normalized,
	);
};

const getItemRevenueCents = (item) => {
	if (!item) return 0;

	const quantity = Math.max(1, parseInt(item.quantity || 1, 10));

	const priceDollars =
		item.discountedPrice !== undefined && item.discountedPrice !== null
			? safeNumber(item.discountedPrice, 0)
			: safeNumber(item.price, 0);

	return Math.round(priceDollars * 100) * quantity;
};

const getOrderModeLabel = (order) => {
	if (order.orderMode) return order.orderMode;
	if (order.fulfillmentType === "hotel_pickup") return "pickup";
	return "dineIn";
};

const getPaymentChannel = (order) => {
	const processor = String(order.paymentProcessor || "none").toLowerCase();
	const paymentMethod = String(order.paymentMethod || "").toLowerCase();

	if (
		processor === "external" ||
		paymentMethod === "cash" ||
		paymentMethod === "external_terminal"
	) {
		return "manual";
	}
	return "digital";
};

const normalizeOrderForReporting = (doc) => {
	const raw = typeof doc.data === "function" ? doc.data() : doc || {};
	const id = raw.id || doc.id || null;

	const fulfilledAt =
		parseDate(raw.fulfilledAt) || parseDate(raw.timestamp) || null;
	const openedAt = parseDate(raw.openedAt) || parseDate(raw.createdAt) || null;

	const subtotal = safeNumber(raw.subtotal, 0);
	const originalSubtotal =
		raw.originalSubtotal !== undefined && raw.originalSubtotal !== null
			? safeNumber(raw.originalSubtotal, subtotal)
			: subtotal;
	const discountTotal =
		raw.discountTotal !== undefined && raw.discountTotal !== null
			? safeNumber(raw.discountTotal, 0)
			: Math.max(0, originalSubtotal - subtotal);

	const taxAmount =
		raw.taxAmount !== undefined && raw.taxAmount !== null
			? safeNumber(raw.taxAmount, 0)
			: raw.tax !== undefined && raw.tax !== null
				? safeNumber(raw.tax, 0)
				: 0;

	const gratuityAmount =
		raw.gratuityAmount !== undefined && raw.gratuityAmount !== null
			? safeNumber(raw.gratuityAmount, 0)
			: raw.gratuity !== undefined && raw.gratuity !== null
				? safeNumber(raw.gratuity, 0)
				: 0;

	const platformFee =
		raw.platformFee !== undefined && raw.platformFee !== null
			? safeNumber(raw.platformFee, 0)
			: raw.platformFeeActual !== undefined && raw.platformFeeActual !== null
				? safeNumber(raw.platformFeeActual, 0)
				: 0;

	const processorFee =
		raw.processorFee !== undefined && raw.processorFee !== null
			? safeNumber(raw.processorFee, 0)
			: raw.stripeFeeActual !== undefined && raw.stripeFeeActual !== null
				? safeNumber(raw.stripeFeeActual, 0)
				: 0;

	const totalPrice =
		raw.totalPrice !== undefined && raw.totalPrice !== null
			? safeNumber(raw.totalPrice, 0)
			: subtotal + taxAmount + gratuityAmount + platformFee;
	const restaurantGrossAmount =
		raw.restaurantGrossAmount !== undefined && raw.restaurantGrossAmount !== null
			? safeNumber(raw.restaurantGrossAmount, 0)
			: subtotal + taxAmount + gratuityAmount;
	const storedRestaurantTransferAmount =
		raw.restaurantTransferAmount !== undefined &&
		raw.restaurantTransferAmount !== null
			? safeNumber(raw.restaurantTransferAmount, 0)
			: Math.max(0, totalPrice - platformFee - processorFee);
	const isStripeTerminalRestaurantCloseout =
		raw.paymentMethod === "stripe_terminal" ||
		raw.restaurantTransferStatus === "stripe_terminal_processed" ||
		raw.feePolicy === "stripe_terminal_restaurant_processing_fee";
	const derivedRestaurantTransferAmount = Math.max(
		0,
		totalPrice - platformFee - processorFee,
	);
	const restaurantTransferAmount =
		isStripeTerminalRestaurantCloseout && platformFee + processorFee > 0
			? derivedRestaurantTransferAmount
			: storedRestaurantTransferAmount;

	const items = Array.isArray(raw.items) ? raw.items : [];

	return {
		id,
		readableOrderId: raw.readableOrderId || id,
		restaurantId: raw.restaurantId || null,
		restaurantName: raw.restaurantName || "Scerv Partner",

		paymentProcessor: raw.paymentProcessor || "unknown",
		paymentMethod: raw.paymentMethod || "unknown",
		tenderType: raw.tenderType || raw.paymentMethod || "unknown",
		paymentStatus: raw.paymentStatus || "unknown",
		orderStatus: raw.orderStatus || "unknown",
		closeoutSource: raw.closeoutSource || null,
		isManualRestaurantOrder: raw.isManualRestaurantOrder === true,
		orderEntryMode: raw.orderEntryMode || null,
		feePolicy: raw.feePolicy || null,
		manualFeeEligible: raw.manualFeeEligible === true,
		manualFeeReason: raw.manualFeeReason || null,
		externalReference: raw.externalReference || null,
		taxRate:
			raw.taxRate !== undefined && raw.taxRate !== null
				? safeNumber(raw.taxRate, 0)
				: null,
		taxSource: raw.taxSource || null,
		closedBy: raw.closedBy || null,
		closedByName: raw.closedByName || null,

		orderMode: getOrderModeLabel(raw),
		fulfillmentType: raw.fulfillmentType || "table",
		type: raw.type || "order",

		subtotal,
		originalSubtotal,
		discountTotal,
		taxAmount,
		gratuityAmount,
		platformFee,
		processorFee,
		totalPrice,
		restaurantGrossAmount,
		restaurantTransferAmount,

		items,
		table: raw.table || null,
		server: raw.server || null,
		customerId: raw.customerId || null,
		customerEmail: raw.customerEmail || null,
		customerName: raw.customerName || null,

		openedAt,
		fulfilledAt,
		turnaroundTimeMinutes: safeNumber(raw.turnaroundTimeMinutes, 0),

		paymentChannel: getPaymentChannel(raw),
		raw,
	};
};

const aggregateOrders = (orders) => {
	let grossSales = 0;
	let totalTax = 0;
	let totalGratuity = 0;
	let totalProcessorFees = 0;
	let totalPlatformFees = 0;
	let totalDiscounts = 0;
	let totalOrders = 0;
	let sumTurnoverMinutes = 0;
	let ordersWithTurnover = 0;
	let digitalSales = 0;
	let manualSales = 0;
	let netPayout = 0;

	const serverTips = {};
	const topSellingItems = {};
	const salesByCategory = { Food: 0, Bar: 0 };

	for (const order of orders) {
		grossSales += order.subtotal;
		totalTax += order.taxAmount;
		totalGratuity += order.gratuityAmount;
		totalProcessorFees += order.processorFee;
		totalPlatformFees += order.platformFee;
		totalDiscounts += order.discountTotal;
		netPayout += order.restaurantTransferAmount;
		totalOrders += 1;

		if (order.paymentChannel === "manual") {
			manualSales += order.subtotal;
		} else {
			digitalSales += order.subtotal;
		}

		if (order.turnaroundTimeMinutes > 0) {
			sumTurnoverMinutes += order.turnaroundTimeMinutes;
			ordersWithTurnover += 1;
		}

		const serverId = order.server && order.server.id ? order.server.id : null;
		const serverName =
			order.server && order.server.name ? order.server.name : "Unassigned";

		if (serverId && order.gratuityAmount > 0) {
			if (!serverTips[serverId]) {
				serverTips[serverId] = {
					serverId,
					serverName,
					gratuityTotal: 0,
				};
			}
			serverTips[serverId].gratuityTotal += order.gratuityAmount;
		}

		for (const item of order.items) {
			const revenueInCents = getItemRevenueCents(item);
			const category = item.category || "Other";
			const itemName =
				item.dishName ||
				item.name ||
				(item.dish && item.dish.name) ||
				"Unknown Item";

			if (isBarCategory(category)) {
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
			topSellingItems[itemName].quantity += Math.max(
				1,
				parseInt(item.quantity || 1, 10),
			);
			topSellingItems[itemName].totalRevenue += revenueInCents;
		}
	}

	const totalFees = totalProcessorFees + totalPlatformFees;
	const averageOrderValue =
		totalOrders > 0 ? Math.round(grossSales / totalOrders) : 0;
	const avgTurnoverRate =
		ordersWithTurnover > 0
			? Math.round(sumTurnoverMinutes / ordersWithTurnover)
			: 0;

	return {
		grossSales,
		totalTax,
		totalGratuity,
		totalProcessorFees,
		totalPlatformFees,
		totalDiscounts,
		totalFees,
		netPayout,
		totalOrders,
		averageOrderValue,
		avgTurnoverRate,
		digitalSales,
		manualSales,
		serverTips: Object.values(serverTips).sort(
			(a, b) => b.gratuityTotal - a.gratuityTotal,
		),
		topSellingItems: Object.values(topSellingItems).sort(
			(a, b) => b.totalRevenue - a.totalRevenue,
		),
		salesByCategory,
	};
};

module.exports = {
	PANAMA_TIMEZONE,
	getStartDateForPeriod,
	parseDate,
	normalizeOrderForReporting,
	aggregateOrders,
};
