const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

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

const assertCanViewRestaurantReports = (context, restaurantId) => {
	const token = context.auth && context.auth.token ? context.auth.token : {};
	const role = String(token.role || "").toLowerCase();
	const tokenRestaurantId = token.restaurantId || null;
	const isRestaurantAccount = context.auth && context.auth.uid === restaurantId;
	const isRestaurantEmployee =
		tokenRestaurantId === restaurantId &&
		["owner", "manager", "restaurant"].includes(role);

	if (!isRestaurantAccount && !isRestaurantEmployee) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You do not have permission to view reports for this restaurant.",
		);
	}
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

const getWorkDayBounds = async (restaurantId) => {
	const workDaysRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("work_days");

	const openSnapshot = await workDaysRef
		.where("status", "==", "OPEN")
		.limit(1)
		.get();

	if (!openSnapshot.empty) {
		const doc = openSnapshot.docs[0];
		const data = doc.data() || {};
		return {
			workDayId: doc.id,
			status: data.status || "OPEN",
			startDate: parseDate(data.startTime),
			endDate: new Date(),
		};
	}

	const latestSnapshot = await workDaysRef
		.orderBy("startTime", "desc")
		.limit(1)
		.get();

	if (latestSnapshot.empty) return null;

	const doc = latestSnapshot.docs[0];
	const data = doc.data() || {};
	const startDate = parseDate(data.startTime);
	const endDate = parseDate(data.endTime) || new Date();

	if (!startDate) return null;

	return {
		workDayId: doc.id,
		status: data.status || "CLOSED",
		startDate,
		endDate,
	};
};

const getReportingBounds = async (restaurantId, period) => {
	if (period === "today") {
		const workDayBounds = await getWorkDayBounds(restaurantId);
		if (workDayBounds) return workDayBounds;
	}

	return {
		workDayId: null,
		status: null,
		startDate: getStartDateForPeriod(period, PANAMA_TIMEZONE),
		endDate: new Date(),
	};
};

const isBarCategory = (categoryValue) => {
	const normalized = String(categoryValue || "")
		.trim()
		.toLowerCase();
	return BAR_CATEGORIES.some(
		(cat) => String(cat).trim().toLowerCase() === normalized,
	);
};

const normalizeItemPriceDollars = (value) => {
	const amount = safeNumber(value, 0);
	// Current basket/order item prices are dollars. Older seeded menu prices used cents.
	return Math.abs(amount) >= 250 ? amount / 100 : amount;
};

const getItemRevenueCents = (item) => {
	if (!item) return 0;

	const quantity = Math.max(1, parseInt(item.quantity || 1, 10));

	const priceDollars =
		item.discountedPrice !== undefined && item.discountedPrice !== null
			? normalizeItemPriceDollars(item.discountedPrice)
			: normalizeItemPriceDollars(item.price);

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
	const customerServiceFee =
		raw.customerServiceFeeAmount !== undefined &&
		raw.customerServiceFeeAmount !== null
			? safeNumber(raw.customerServiceFeeAmount, 0)
			: raw.customerServiceFee !== undefined && raw.customerServiceFee !== null
				? safeNumber(raw.customerServiceFee, 0)
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
	const restaurantProcessingFeeAmount =
		raw.restaurantProcessingFeeAmount !== undefined &&
		raw.restaurantProcessingFeeAmount !== null
			? safeNumber(raw.restaurantProcessingFeeAmount, 0)
			: raw.processorFeeAppliedToRestaurantSales !== undefined &&
				  raw.processorFeeAppliedToRestaurantSales !== null
				? safeNumber(raw.processorFeeAppliedToRestaurantSales, 0)
				: raw.terminalProcessingFeeAmount !== undefined &&
					  raw.terminalProcessingFeeAmount !== null
					? safeNumber(raw.terminalProcessingFeeAmount, 0)
					: isStripeTerminalRestaurantCloseout
						? Math.max(0, platformFee - customerServiceFee)
						: 0;
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
		workDayId: raw.workDayId || null,

		paymentProcessor: raw.paymentProcessor || "unknown",
		paymentProcessorId: raw.paymentProcessorId || null,
		paymentIntentId: raw.paymentIntentId || null,
		stripePaymentIntentId: raw.stripePaymentIntentId || null,
		stripeChargeId: raw.stripeChargeId || null,
		stripeTransferId: raw.stripeTransferId || null,
		restaurantTransferStatus: raw.restaurantTransferStatus || null,
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
		customerServiceFee,
		restaurantProcessingFeeAmount,
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

const getSnapshotSize = async (query) => {
	const snapshot = await query.get();
	return snapshot.size;
};

const buildOwnerPulse = async (restaurantId) => {
	const partiesRef = db.collection("parties").where("restaurantId", "==", restaurantId);
	const kitchenOrdersRef = db
		.collection("kitchen_orders")
		.where("restaurantId", "==", restaurantId)
		.where("overallStatus", "==", "active");

	const [
		activeTables,
		serviceRequests,
		checksRequested,
		openTickets,
		pickupOrders,
	] = await Promise.all([
		getSnapshotSize(partiesRef.where("status", "in", ["active", "checkedOut"])),
		getSnapshotSize(partiesRef.where("serviceRequested", "==", true)),
		getSnapshotSize(partiesRef.where("customerStatus", "==", "ready_to_pay")),
		getSnapshotSize(kitchenOrdersRef),
		getSnapshotSize(kitchenOrdersRef.where("fulfillmentType", "==", "hotel_pickup")),
	]);

	return {
		activeTables,
		serviceRequests,
		checksRequested,
		openTickets,
		pickupOrders,
	};
};

const aggregateOrders = (orders) => {
	let grossSales = 0;
	let netSales = 0;
	let customerPayments = 0;
	let restaurantGrossReceipts = 0;
	let totalTax = 0;
	let totalGratuity = 0;
	let totalProcessorFees = 0;
	let totalPlatformFees = 0;
	let totalCustomerServiceFees = 0;
	let totalRestaurantProcessingFees = 0;
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
		grossSales += order.originalSubtotal;
		netSales += order.subtotal;
		customerPayments += order.totalPrice;
		restaurantGrossReceipts += order.restaurantGrossAmount;
		totalTax += order.taxAmount;
		totalGratuity += order.gratuityAmount;
		totalProcessorFees += order.processorFee;
		totalPlatformFees += order.platformFee;
		totalCustomerServiceFees += order.customerServiceFee;
		totalRestaurantProcessingFees += order.restaurantProcessingFeeAmount;
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

	const totalCustomerFees = totalPlatformFees + totalCustomerServiceFees;
	const totalRestaurantCosts =
		totalProcessorFees + totalRestaurantProcessingFees;
	const totalFees = totalCustomerFees + totalRestaurantCosts;
	const averageOrderValue =
		totalOrders > 0 ? Math.round(netSales / totalOrders) : 0;
	const avgTurnoverRate =
		ordersWithTurnover > 0
			? Math.round(sumTurnoverMinutes / ordersWithTurnover)
			: 0;

	return {
		grossSales,
		netSales,
		customerPayments,
		restaurantGrossReceipts,
		totalTax,
		taxLiability: totalTax,
		totalGratuity,
		tipsCollected: totalGratuity,
		totalProcessorFees,
		totalPlatformFees,
		totalCustomerServiceFees,
		totalRestaurantProcessingFees,
		totalCustomerFees,
		totalRestaurantCosts,
		totalDiscounts,
		totalFees,
		netPayout,
		estimatedDeposit: netPayout,
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

exports.getReportingDashboard = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { restaurantId, period } = data;
		if (!restaurantId || !period) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID and period are required.",
			);
		}

		try {
			assertCanViewRestaurantReports(context, restaurantId);
			const reportingBounds = await getReportingBounds(restaurantId, period);

			const snapshot = await db
				.collection("orders")
				.where("restaurantId", "==", restaurantId)
				.where("paymentStatus", "==", "paid")
				.where(
					"fulfilledAt",
					">=",
					admin.firestore.Timestamp.fromDate(reportingBounds.startDate),
				)
				.where(
					"fulfilledAt",
					"<=",
					admin.firestore.Timestamp.fromDate(reportingBounds.endDate),
				)
				.get();

			const orders = snapshot.docs.map((doc) =>
				normalizeOrderForReporting(doc),
			);
			const summary = aggregateOrders(orders);
			const ownerPulse = await buildOwnerPulse(restaurantId);

			return {
				...summary,
				ownerPulse,
				period,
				workDayId: reportingBounds.workDayId,
				businessDayStatus: reportingBounds.status,
				businessDayStart: reportingBounds.startDate.toISOString(),
				businessDayEnd: reportingBounds.endDate.toISOString(),
				lastUpdatedAt: new Date().toISOString(),
			};
		} catch (error) {
			console.error("getReportingDashboard error:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to generate dashboard report.",
			);
		}
	});

exports.getOrdersLedger = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const {
			restaurantId,
			period,
			paymentMethod,
			orderMode,
			fulfillmentType,
			serverId,
			searchText,
			limit = 100,
		} = data;

		if (!restaurantId || !period) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID and period are required.",
			);
		}

		try {
			assertCanViewRestaurantReports(context, restaurantId);
			const reportingBounds = await getReportingBounds(restaurantId, period);

			const snapshot = await db
				.collection("orders")
				.where("restaurantId", "==", restaurantId)
				.where("paymentStatus", "==", "paid")
				.where(
					"fulfilledAt",
					">=",
					admin.firestore.Timestamp.fromDate(reportingBounds.startDate),
				)
				.where(
					"fulfilledAt",
					"<=",
					admin.firestore.Timestamp.fromDate(reportingBounds.endDate),
				)
				.orderBy("fulfilledAt", "desc")
				.limit(Math.min(Number(limit) || 100, 300))
				.get();

			let orders = snapshot.docs.map((doc) => normalizeOrderForReporting(doc));

			if (paymentMethod) {
				orders = orders.filter((o) => o.paymentMethod === paymentMethod);
			}

			if (orderMode) {
				orders = orders.filter((o) => o.orderMode === orderMode);
			}

			if (fulfillmentType) {
				orders = orders.filter((o) => o.fulfillmentType === fulfillmentType);
			}

			if (serverId) {
				orders = orders.filter((o) => o.server && o.server.id === serverId);
			}

			if (searchText) {
				const q = String(searchText).trim().toLowerCase();
				orders = orders.filter((o) => {
					const haystack = [
						o.id,
						o.readableOrderId,
						o.customerName,
						o.customerEmail,
						o.table && o.table.name,
						o.server && o.server.name,
						o.paymentMethod,
						o.orderMode,
					]
						.filter(Boolean)
						.join(" ")
						.toLowerCase();

					return haystack.includes(q);
				});
			}

			return {
				orders: orders.map((o) => ({
					id: o.id,
					readableOrderId: o.readableOrderId,
					restaurantName: o.restaurantName,
					paymentMethod: o.paymentMethod,
					tenderType: o.tenderType,
					paymentProcessor: o.paymentProcessor,
					paymentProcessorId: o.paymentProcessorId,
					paymentIntentId: o.paymentIntentId,
					stripePaymentIntentId: o.stripePaymentIntentId,
					stripeChargeId: o.stripeChargeId,
					stripeTransferId: o.stripeTransferId,
					restaurantTransferStatus: o.restaurantTransferStatus,
					paymentStatus: o.paymentStatus,
					orderStatus: o.orderStatus,
					closeoutSource: o.closeoutSource,
					isManualRestaurantOrder: o.isManualRestaurantOrder,
					orderEntryMode: o.orderEntryMode,
					feePolicy: o.feePolicy,
					manualFeeEligible: o.manualFeeEligible,
					manualFeeReason: o.manualFeeReason,
					externalReference: o.externalReference,
					taxRate: o.taxRate,
					taxSource: o.taxSource,
					closedBy: o.closedBy,
					closedByName: o.closedByName,
					orderMode: o.orderMode,
					fulfillmentType: o.fulfillmentType,
					subtotal: o.subtotal,
					taxAmount: o.taxAmount,
					gratuityAmount: o.gratuityAmount,
					customerServiceFee: o.customerServiceFee,
					customerServiceFeeAmount: o.customerServiceFee,
					restaurantProcessingFeeAmount: o.restaurantProcessingFeeAmount,
					platformFee: o.platformFee,
					processorFee: o.processorFee,
					restaurantGrossAmount: o.restaurantGrossAmount,
					restaurantTransferAmount: o.restaurantTransferAmount,
					totalPrice: o.totalPrice,
					customerName: o.customerName,
					customerEmail: o.customerEmail,
					table: o.table,
					server: o.server,
					fulfilledAt: o.fulfilledAt ? o.fulfilledAt.toISOString() : null,
					turnaroundTimeMinutes: o.turnaroundTimeMinutes,
					itemCount: Array.isArray(o.items) ? o.items.length : 0,
				})),
				count: orders.length,
				workDayId: reportingBounds.workDayId,
				businessDayStatus: reportingBounds.status,
				businessDayStart: reportingBounds.startDate.toISOString(),
				businessDayEnd: reportingBounds.endDate.toISOString(),
			};
		} catch (error) {
			console.error("getOrdersLedger error:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to load orders ledger.",
			);
		}
	});

exports.getOrderDetail = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { orderId } = data;
		if (!orderId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Order ID is required.",
			);
		}

		try {
			const doc = await db.collection("orders").doc(orderId).get();

			if (!doc.exists) {
				throw new functions.https.HttpsError("not-found", "Order not found.");
			}

			const o = normalizeOrderForReporting(doc);
			assertCanViewRestaurantReports(context, o.restaurantId);

			return {
				id: o.id,
				readableOrderId: o.readableOrderId,
				restaurantId: o.restaurantId,
				restaurantName: o.restaurantName,

				paymentProcessor: o.paymentProcessor,
				paymentProcessorId: o.paymentProcessorId,
				paymentIntentId: o.paymentIntentId,
				stripePaymentIntentId: o.stripePaymentIntentId,
				stripeChargeId: o.stripeChargeId,
				stripeTransferId: o.stripeTransferId,
				restaurantTransferStatus: o.restaurantTransferStatus,
				paymentMethod: o.paymentMethod,
				tenderType: o.tenderType,
				paymentStatus: o.paymentStatus,
				orderStatus: o.orderStatus,
				closeoutSource: o.closeoutSource,
				isManualRestaurantOrder: o.isManualRestaurantOrder,
				orderEntryMode: o.orderEntryMode,
				feePolicy: o.feePolicy,
				manualFeeEligible: o.manualFeeEligible,
				manualFeeReason: o.manualFeeReason,
				externalReference: o.externalReference,
				taxRate: o.taxRate,
				taxSource: o.taxSource,
				closedBy: o.closedBy,
				closedByName: o.closedByName,

				orderMode: o.orderMode,
				fulfillmentType: o.fulfillmentType,
				type: o.type,

				subtotal: o.subtotal,
				originalSubtotal: o.originalSubtotal,
				discountTotal: o.discountTotal,
				taxAmount: o.taxAmount,
				gratuityAmount: o.gratuityAmount,
				customerServiceFee: o.customerServiceFee,
				customerServiceFeeAmount: o.customerServiceFee,
				restaurantProcessingFeeAmount: o.restaurantProcessingFeeAmount,
				platformFee: o.platformFee,
				processorFee: o.processorFee,
				restaurantGrossAmount: o.restaurantGrossAmount,
				restaurantTransferAmount: o.restaurantTransferAmount,
				totalPrice: o.totalPrice,

				table: o.table,
				server: o.server,
				customerId: o.customerId,
				customerEmail: o.customerEmail,
				customerName: o.customerName,

				openedAt: o.openedAt ? o.openedAt.toISOString() : null,
				fulfilledAt: o.fulfilledAt ? o.fulfilledAt.toISOString() : null,
				turnaroundTimeMinutes: o.turnaroundTimeMinutes,

				items: o.items,
			};
		} catch (error) {
			if (error instanceof functions.https.HttpsError) throw error;
			console.error("getOrderDetail error:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to load order detail.",
			);
		}
	});

exports.getDailySalesReport = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { restaurantId, days = 30 } = data || {};
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		try {
			assertCanViewRestaurantReports(context, restaurantId);

			const safeDays = Math.min(Math.max(Number(days) || 30, 1), 90);
			const workDaysSnapshot = await db
				.collection("restaurants")
				.doc(restaurantId)
				.collection("work_days")
				.orderBy("startTime", "desc")
				.limit(safeDays)
				.get();

			const workDayWindows = workDaysSnapshot.docs
				.map((doc) => {
					const data = doc.data() || {};
					const startDate = parseDate(data.startTime);
					if (!startDate) return null;
					return {
						id: doc.id,
						status: data.status || null,
						startDate,
						endDate: parseDate(data.endTime) || new Date(),
					};
				})
				.filter(Boolean)
				.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

			const startDate =
				workDayWindows.length > 0
					? workDayWindows[0].startDate
					: getStartDateForPeriod("today", PANAMA_TIMEZONE);

			if (workDayWindows.length === 0) {
				startDate.setDate(startDate.getDate() - (safeDays - 1));
			}

			const snapshot = await db
				.collection("orders")
				.where("restaurantId", "==", restaurantId)
				.where("paymentStatus", "==", "paid")
				.where(
					"fulfilledAt",
					">=",
					admin.firestore.Timestamp.fromDate(startDate),
				)
				.orderBy("fulfilledAt", "desc")
				.limit(1000)
				.get();

			const orders = snapshot.docs.map((doc) => normalizeOrderForReporting(doc));
			const grouped = {};
			const workDayById = new Map(
				workDayWindows.map((workDay) => [workDay.id, workDay]),
			);

			for (const order of orders) {
				const dateObj = order.fulfilledAt || order.openedAt || new Date();
				const matchingWorkDay =
					(order.workDayId && workDayById.get(order.workDayId)) ||
					workDayWindows.find(
						(workDay) =>
							dateObj >= workDay.startDate && dateObj <= workDay.endDate,
					);
				const date = matchingWorkDay
					? matchingWorkDay.startDate.toLocaleDateString("en-CA", {
							timeZone: PANAMA_TIMEZONE,
						})
					: dateObj.toLocaleDateString("en-CA", {
							timeZone: PANAMA_TIMEZONE,
						});

				if (!grouped[date]) {
					grouped[date] = {
						workDay: matchingWorkDay || null,
						orders: [],
					};
				}
				if (!grouped[date].workDay && matchingWorkDay) {
					grouped[date].workDay = matchingWorkDay;
				}
				grouped[date].orders.push(order);
			}

			return Object.entries(grouped)
				.sort(([a], [b]) => (a < b ? 1 : -1))
				.map(([date, group]) => {
					const dayOrders = group.orders;
					const summary = aggregateOrders(dayOrders);
					return {
						date,
						workDayId: group.workDay ? group.workDay.id : null,
						businessDayStatus: group.workDay ? group.workDay.status : null,
						businessDayStart: group.workDay
							? group.workDay.startDate.toISOString()
							: null,
						businessDayEnd: group.workDay
							? group.workDay.endDate.toISOString()
							: null,
						orderCount: summary.totalOrders,
						grossSales: summary.grossSales,
						totalDiscountApplied: summary.totalDiscounts,
						netSales: Math.max(0, summary.grossSales - summary.totalDiscounts),
						totalTaxCollected: summary.totalTax,
						totalGratuityReceived: summary.totalGratuity,
						totalCustomerServiceFees: summary.totalCustomerServiceFees,
						totalRestaurantProcessingFees:
							summary.totalRestaurantProcessingFees,
						totalPlatformFees: summary.totalPlatformFees,
						totalProcessorFees: summary.totalProcessorFees,
						totalFees: summary.totalFees,
						estimatedProcessingFeesDeducted: summary.totalFees,
						estimatedNetPayout: summary.netPayout,
						serverTips: summary.serverTips,
						allItemsSold: summary.topSellingItems.map((item) => ({
							...item,
							count: item.quantity,
						})),
					};
				});
		} catch (error) {
			if (error instanceof functions.https.HttpsError) throw error;
			console.error("getDailySalesReport error:", error);
			throw new functions.https.HttpsError(
				"internal",
				"Failed to load daily sales reports.",
			);
		}
	});

exports.getDashboardReport = exports.getReportingDashboard;
exports.getSalesReport = exports.getReportingDashboard;
exports.getAggregatedSalesReport = exports.getDailySalesReport;
