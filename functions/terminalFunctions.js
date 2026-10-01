const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { getStripeKeys } = require("./stripeUtils");
const { assertRestaurantPermission } = require("./restaurantAccess");

const db = admin.firestore();

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");

const DEFAULT_TERMINAL_PROCESSING_FEE_PERCENTAGE = 0.04;
const DEFAULT_TERMINAL_PROCESSING_FEE_FIXED_CENTS = 0;
const DEFAULT_CUSTOMER_SERVICE_FEE_PERCENTAGE = 0.03;

const normalizePercentage = (value, fallback = 0) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	const decimal = parsed > 1 ? parsed / 100 : parsed;
	return Math.min(Math.max(decimal, 0), 1);
};

const normalizeNonNegativeCents = (value, fallback = 0) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.round(parsed);
};

const normalizePolicyString = (value, allowedValues = [], fallback = "") => {
	const normalized = String(value || "").trim();
	return allowedValues.includes(normalized) ? normalized : fallback;
};

const calculatePercentageFee = (amountCents, percentage, fixedCents = 0) =>
	Math.max(
		0,
		Math.round(Number(amountCents || 0) * normalizePercentage(percentage)) +
			normalizeNonNegativeCents(fixedCents),
	);

const sanitizeTerminalNote = (value, maxLength = 160) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, maxLength);

const sanitizeMetadataString = (value, maxLength = 120) =>
	String(value || "")
		.trim()
		.slice(0, maxLength);

const toTimestampMillis = (value) => {
	if (!value) return 0;
	if (typeof value.toMillis === "function") return value.toMillis();
	if (typeof value.toDate === "function") return value.toDate().getTime();
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoTimestamp = (value) => {
	const millis = toTimestampMillis(value);
	return millis > 0 ? new Date(millis).toISOString() : null;
};

const formatReceiptCurrency = (cents = 0, currency = "USD") => {
	const dollars = normalizeNonNegativeCents(cents, 0) / 100;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
		}).format(dollars);
	} catch (error) {
		return `$${dollars.toFixed(2)}`;
	}
};

const formatReceiptDate = (value, timeZone = "America/New_York") => {
	const millis = toTimestampMillis(value) || Date.now();
	try {
		return new Intl.DateTimeFormat("en-US", {
			timeZone,
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(new Date(millis));
	} catch (error) {
		return new Date(millis).toLocaleString("en-US");
	}
};

const getReceiptPaymentLabel = (paymentIntentId = "") => {
	const id = sanitizeMetadataString(paymentIntentId, 140);
	return id ? id.slice(-8).toUpperCase() : "RECORDED";
};

const getReceiptAddressLines = (restaurantData = {}, receiptSettings = {}) => {
	const configuredLines = Array.isArray(receiptSettings.addressLines)
		? receiptSettings.addressLines
		: [];
	const lines = configuredLines
		.map((line) => sanitizeMetadataString(line, 120))
		.filter(Boolean);
	if (lines.length) return lines.slice(0, 3);

	const address = sanitizeMetadataString(restaurantData.address, 160);
	const city = sanitizeMetadataString(restaurantData.city, 80);
	const state = sanitizeMetadataString(restaurantData.state, 40);
	const postalCode = sanitizeMetadataString(
		restaurantData.postalCode || restaurantData.zipCode,
		30,
	);
	const cityLine = [city, state, postalCode].filter(Boolean).join(", ");
	return [address, cityLine].filter(Boolean).slice(0, 3);
};

const buildReceiptText = ({
	receipt = {},
	lineItems = [],
	footerLines = [],
	includeDivider = true,
}) => {
	const lines = [
		receipt.restaurantName,
		...(receipt.legalName && receipt.legalName !== receipt.restaurantName
			? [receipt.legalName]
			: []),
		...(receipt.addressLines || []),
		"",
		receipt.title || "Receipt",
		receipt.displayDate,
		`Receipt: ${receipt.receiptNumber}`,
	];

	if (receipt.staffName) lines.push(`Staff: ${receipt.staffName}`);
	if (receipt.readerLabel) lines.push(`Reader: ${receipt.readerLabel}`);
	if (receipt.note) lines.push(`Reference: ${receipt.note}`);

	if (includeDivider) lines.push("------------------------------");
	lineItems.forEach((item) => {
		lines.push(`${item.label}: ${item.formattedAmount}`);
	});
	if (includeDivider) lines.push("------------------------------");
	lines.push(`Payment: ${receipt.paymentReference}`);
	lines.push("");
	lines.push(...footerLines);

	return lines
		.map((line) => String(line || "").trimEnd())
		.filter((line, index, all) => line || all[index - 1])
		.join("\n")
		.trim();
};

const buildScervPayLiteCustomerReceipt = ({
	paymentIntentId,
	payment = {},
	restaurantData = {},
	issuedAt = new Date(),
}) => {
	const receiptSettings =
		restaurantData.payLiteReceiptSettings &&
		typeof restaurantData.payLiteReceiptSettings === "object"
			? restaurantData.payLiteReceiptSettings
			: {};
	const currency = sanitizeMetadataString(
		payment.currency || receiptSettings.currency || restaurantData.currency || "USD",
		8,
	).toUpperCase();
	const timeZone = sanitizeMetadataString(
		receiptSettings.timeZone ||
			restaurantData.timeZone ||
			restaurantData.timezone ||
			"America/New_York",
		80,
	);
	const enteredBy = payment.enteredBy || payment.createdBy || {};
	const capturedBy = payment.capturedBy || {};
	const reader = payment.terminalReader || payment.reader || {};
	const paidAt =
		payment.paidAt || payment.capturedAt || payment.updatedAt || issuedAt;
	const paymentId = sanitizeMetadataString(
		paymentIntentId || payment.paymentIntentId || payment.id,
		140,
	);
	const receiptNumber = getReceiptPaymentLabel(paymentId);
	const restaurantName = sanitizeMetadataString(
		receiptSettings.restaurantName ||
			restaurantData.restaurantName ||
			restaurantData.name ||
			"Restaurant",
		120,
	);
	const legalName = sanitizeMetadataString(
		receiptSettings.legalName || restaurantData.legalName || "",
		120,
	);
	const saleAmount = normalizeNonNegativeCents(
		payment.merchantNetSalesAmount,
		payment.subtotal,
	);
	const taxAmount = normalizeNonNegativeCents(payment.taxAmount, 0);
	const customerServiceFeeAmount = normalizeNonNegativeCents(
		payment.customerServiceFeeAmount || payment.customerServiceFee,
		0,
	);
	const gratuityAmount = normalizeNonNegativeCents(
		payment.gratuityAmount || payment.tipAmountCents,
		0,
	);
	const totalAmount = normalizeNonNegativeCents(
		payment.amount || payment.amountReceived,
		saleAmount + taxAmount + customerServiceFeeAmount + gratuityAmount,
	);

	const lineItems = [
		{
			key: "sale",
			label: receiptSettings.saleLabel || "Sale amount",
			amount: saleAmount,
		},
		taxAmount > 0
			? {
					key: "tax",
					label: receiptSettings.taxLabel || "Tax",
					amount: taxAmount,
				}
			: null,
		customerServiceFeeAmount > 0
			? {
					key: "card_fee",
					label: receiptSettings.cardFeeLabel || "Card fee",
					amount: customerServiceFeeAmount,
				}
			: null,
		{
			key: "tip",
			label: receiptSettings.tipLabel || "Tip",
			amount: gratuityAmount,
		},
		{
			key: "total",
			label: receiptSettings.totalLabel || "Total paid",
			amount: totalAmount,
			emphasis: true,
		},
	]
		.filter(Boolean)
		.map((item) => ({
			...item,
			formattedAmount: formatReceiptCurrency(item.amount, currency),
		}));

	const footerLines = Array.isArray(receiptSettings.footerLines)
		? receiptSettings.footerLines
				.map((line) => sanitizeMetadataString(line, 120))
				.filter(Boolean)
				.slice(0, 4)
		: [sanitizeMetadataString(receiptSettings.footer || "Thank you.", 120)];

	const receipt = {
		version: "pay_lite_receipt_v1",
		type: "scerv_pay_lite_customer",
		paymentIntentId: paymentId,
		receiptNumber,
		title: sanitizeMetadataString(
			receiptSettings.title || "Scerv Pay Lite Receipt",
			120,
		),
		restaurantId: sanitizeMetadataString(payment.restaurantId, 120),
		restaurantName,
		legalName,
		addressLines: getReceiptAddressLines(restaurantData, receiptSettings),
		currency,
		timeZone,
		issuedAt: issuedAt instanceof Date ? issuedAt.toISOString() : toIsoTimestamp(issuedAt),
		paidAt: toIsoTimestamp(paidAt) || new Date().toISOString(),
		displayDate: formatReceiptDate(paidAt, timeZone),
		paymentReference: receiptNumber,
		staffName: sanitizeMetadataString(
			enteredBy.name ||
				capturedBy.enteredByName ||
				capturedBy.name ||
				"Staff",
			120,
		),
		staffId: sanitizeMetadataString(
			enteredBy.staffId || capturedBy.enteredByStaffId || capturedBy.staffId,
			120,
		),
		readerLabel: sanitizeMetadataString(reader.label || reader.name || "", 120),
		readerSerialNumber: sanitizeMetadataString(reader.serialNumber || "", 120),
		note: sanitizeTerminalNote(payment.note || "", 160),
		merchantNetSalesAmount: saleAmount,
		taxAmount,
		customerServiceFeeAmount,
		gratuityAmount,
		amount: totalAmount,
		lineItems,
		footerLines,
	};

	return {
		...receipt,
		printableText: buildReceiptText({ receipt, lineItems, footerLines }),
		shareText: buildReceiptText({ receipt, lineItems, footerLines }),
	};
};

const buildScervPayLiteDailyReport = ({
	payments = [],
	restaurantData = {},
	restaurantId = "",
	startMs = 0,
	endMs = 0,
	workDayId = null,
	reportWorkDayId = null,
	workDayData = null,
}) => {
	const rows = payments
		.map((payment) => ({ ...(payment || {}) }))
		.filter((payment) => {
			const isPayLite =
				payment.type === "scerv_pay_lite" ||
				payment.source === "scerv_pay_lite";
			const isPaid =
				payment.paymentStatus === "paid" ||
				payment.status === "succeeded" ||
				payment.status === "paid";
			const paidMillis = toTimestampMillis(
				payment.paidAt || payment.capturedAt || payment.updatedAt || payment.createdAt,
			);
			if (workDayId) {
				return isPayLite && isPaid && payment.workDayId === workDayId;
			}
			return isPayLite && isPaid && paidMillis >= startMs && paidMillis < endMs;
		})
		.sort((a, b) => {
			const aMs = toTimestampMillis(a.paidAt || a.capturedAt || a.createdAt);
			const bMs = toTimestampMillis(b.paidAt || b.capturedAt || b.createdAt);
			return bMs - aMs;
		})
		.map((payment) => {
			const enteredBy = payment.enteredBy || payment.createdBy || {};
			const capturedBy = payment.capturedBy || {};
			const reader = payment.terminalReader || payment.reader || {};
			const amount = normalizeNonNegativeCents(payment.amount, 0);
			const merchantNetSalesAmount = normalizeNonNegativeCents(
				payment.merchantNetSalesAmount,
				payment.subtotal,
			);
			const customerServiceFeeAmount = normalizeNonNegativeCents(
				payment.customerServiceFeeAmount || payment.customerServiceFee,
				0,
			);
			const taxAmount = normalizeNonNegativeCents(payment.taxAmount, 0);
			const gratuityAmount = normalizeNonNegativeCents(
				payment.gratuityAmount || payment.tipAmountCents,
				0,
			);
			const applicationFeeAmount = normalizeNonNegativeCents(
				payment.applicationFeeAmount || payment.scervPayLiteFeeAmount,
				0,
			);
			const restaurantTransferAmount = normalizeNonNegativeCents(
				payment.restaurantTransferAmount,
				Math.max(0, amount - applicationFeeAmount),
			);

			return {
				id: payment.id,
				paymentIntentId: payment.paymentIntentId || payment.id,
				status: payment.status || payment.paymentStatus || "paid",
				paidAt: toIsoTimestamp(
					payment.paidAt ||
						payment.capturedAt ||
						payment.updatedAt ||
						payment.createdAt,
				),
				createdAt: toIsoTimestamp(payment.createdAt),
				staffId:
					enteredBy.staffId ||
					enteredBy.id ||
					capturedBy.enteredByStaffId ||
					capturedBy.staffId ||
					null,
				staffName:
					enteredBy.name ||
					capturedBy.enteredByName ||
					capturedBy.name ||
					"Staff",
				note: payment.note || "",
				readerLabel: reader.label || reader.name || null,
				readerSerialNumber: reader.serialNumber || null,
				merchantNetSalesAmount,
				netSalesAmount: merchantNetSalesAmount,
				taxAmount,
				customerServiceFeeAmount,
				gratuityAmount,
				amount,
				applicationFeeAmount,
				transactionFeeAmount: applicationFeeAmount,
				restaurantTransferAmount,
				workDayId: payment.workDayId || null,
				customerFeeMode: payment.customerFeeMode || null,
				scervFeeMode: payment.scervFeeMode || null,
			};
		});

	const summary = rows.reduce(
		(acc, row) => {
			acc.transactionCount += 1;
			acc.merchantNetSalesAmount += row.merchantNetSalesAmount;
			acc.netSalesAmount += row.netSalesAmount;
			acc.taxAmount += row.taxAmount;
			acc.customerServiceFeeAmount += row.customerServiceFeeAmount;
			acc.gratuityAmount += row.gratuityAmount;
			acc.amount += row.amount;
			acc.applicationFeeAmount += row.applicationFeeAmount;
			acc.transactionFeeAmount += row.transactionFeeAmount;
			acc.restaurantTransferAmount += row.restaurantTransferAmount;
			return acc;
		},
		{
			transactionCount: 0,
			merchantNetSalesAmount: 0,
			netSalesAmount: 0,
			taxAmount: 0,
			customerServiceFeeAmount: 0,
			gratuityAmount: 0,
			amount: 0,
			applicationFeeAmount: 0,
			transactionFeeAmount: 0,
			restaurantTransferAmount: 0,
		},
	);
	const tipsByEmployeeMap = new Map();
	rows.forEach((row) => {
		const key = row.staffId || row.staffName || "unknown";
		const current =
			tipsByEmployeeMap.get(key) || {
				staffId: row.staffId || null,
				staffName: row.staffName || "Staff",
				transactionCount: 0,
				tipCount: 0,
				gratuityAmount: 0,
				netSalesAmount: 0,
				amount: 0,
			};
		current.transactionCount += 1;
		current.netSalesAmount += row.netSalesAmount;
		current.amount += row.amount;
		if (row.gratuityAmount > 0) {
			current.tipCount += 1;
			current.gratuityAmount += row.gratuityAmount;
		}
		tipsByEmployeeMap.set(key, current);
	});
	const tipsByEmployee = Array.from(tipsByEmployeeMap.values()).sort(
		(a, b) => b.gratuityAmount - a.gratuityAmount,
	);
	const effectiveWorkDayId =
		workDayId ||
		(rows.find((row) => row.workDayId) || {}).workDayId ||
		reportWorkDayId ||
		null;

	return {
		restaurantId,
		restaurantName:
			restaurantData.restaurantName || restaurantData.name || "Restaurant",
		workDayId: effectiveWorkDayId,
		workDayStatus: workDayData ? workDayData.status || null : null,
		startAt: new Date(startMs).toISOString(),
		endAt: new Date(endMs).toISOString(),
		summary,
		tipsByEmployee,
		transactions: rows,
	};
};

const assertTerminalPaymentStatusAccess = async ({
	context,
	restaurantId,
	staffId,
}) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authenticated.",
		);
	}

	const tokenRestaurantId =
		context.auth.token && context.auth.token.restaurantId;
	if (context.auth.uid === restaurantId || tokenRestaurantId === restaurantId) {
		if (!staffId || context.auth.uid === restaurantId) return;
	}

	await assertRestaurantPermission({
		db,
		context,
		restaurantId,
		employeeId: staffId,
		allowedRoles: ["owner", "manager", "admin"],
		allowedJobTitles: ["server", "bartender", "bar"],
		action: "view Terminal payment status",
	});
};

const shapeTerminalPaymentStatus = (doc) => {
	const data = doc.data() || {};
	const status = sanitizeMetadataString(
		data.paymentStatus || data.status || "unknown",
		80,
	);

	return {
		exists: true,
		id: doc.id,
		paymentIntentId: sanitizeMetadataString(data.paymentIntentId || doc.id, 120),
		restaurantId: sanitizeMetadataString(data.restaurantId, 120),
		partyId: sanitizeMetadataString(data.partyId, 120) || null,
		status,
		paid: status === "paid" || status === "succeeded",
		closeoutFinalized: data.closeoutFinalized === true,
		amount: normalizeNonNegativeCents(data.amount, 0),
		subtotal: normalizeNonNegativeCents(data.subtotal, 0),
		taxAmount: normalizeNonNegativeCents(data.taxAmount, 0),
		gratuityAmount: normalizeNonNegativeCents(
			data.gratuityAmount || data.tipAmountCents,
			0,
		),
		customerServiceFeeAmount: normalizeNonNegativeCents(
			data.customerServiceFeeAmount || data.customerServiceFee,
			0,
		),
		applicationFeeAmount: normalizeNonNegativeCents(
			data.applicationFeeAmount || data.scervPayLiteFeeAmount,
			0,
		),
		restaurantTransferAmount: normalizeNonNegativeCents(
			data.restaurantTransferAmount,
			0,
		),
		source: sanitizeMetadataString(data.source || data.type, 80) || null,
		createdAt: toIsoTimestamp(data.createdAt),
		updatedAt: toIsoTimestamp(data.updatedAt),
		paidAt: toIsoTimestamp(data.paidAt || data.capturedAt),
	};
};

const sanitizeTerminalCollector = (collector = {}) => {
	const readerId = sanitizeMetadataString(
		collector.readerId || collector.id || "",
		120,
	);
	const serialNumber = sanitizeMetadataString(collector.serialNumber || "", 120);
	const label = sanitizeMetadataString(
		collector.label || collector.name || serialNumber || readerId || "Collector",
		120,
	);
	const discoveryMethod = ["bluetoothScan", "internet"].includes(
		collector.discoveryMethod,
	)
		? collector.discoveryMethod
		: "internet";

	if (!readerId && !serialNumber) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Collector must include a reader ID or serial number.",
		);
	}

	return {
		id: readerId,
		readerId,
		label,
		name: label,
		serialNumber,
		deviceType: sanitizeMetadataString(collector.deviceType || "", 80),
		discoveryMethod,
		locationId: sanitizeMetadataString(collector.locationId || "", 120),
		simulated: collector.simulated === true,
	};
};

const getOpenWorkDaySnapshot = async (restaurantId) => {
	const snapshot = await db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("work_days")
		.where("status", "==", "OPEN")
		.limit(1)
		.get();

	if (snapshot.empty) return null;
	const doc = snapshot.docs[0];
	return { id: doc.id, data: doc.data() || {} };
};

const ensureOpenPayLiteWorkDaySnapshot = async ({
	restaurantId,
	context,
	staffMember = {},
	staffId = null,
	staffName = "",
}) => {
	const restaurantRef = db.collection("restaurants").doc(restaurantId);
	const workDaysRef = restaurantRef.collection("work_days");

	return db.runTransaction(async (transaction) => {
		const openSnapshot = await transaction.get(
			workDaysRef.where("status", "==", "OPEN").limit(1),
		);
		if (!openSnapshot.empty) {
			const doc = openSnapshot.docs[0];
			return { id: doc.id, data: doc.data() || {}, created: false };
		}

		const workDayRef = workDaysRef.doc();
		const openedBy = {
			uid: context.auth.uid,
			staffId: staffMember.id || staffId || null,
			name:
				staffName ||
				staffMember.name ||
				context.auth.token.name ||
				"Staff",
			role: staffMember.role || null,
			jobTitle: staffMember.jobTitle || null,
		};
		const workDayData = {
			status: "OPEN",
			source: "scerv_pay_lite",
			autoOpened: true,
			startTime: admin.firestore.FieldValue.serverTimestamp(),
			endTime: null,
			managerWhoOpened: openedBy,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		};

		transaction.set(workDayRef, workDayData);
		transaction.set(
			restaurantRef,
			{
				isOpen: true,
				currentWorkDayId: workDayRef.id,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		return { id: workDayRef.id, data: workDayData, created: true };
	});
};

const isCustomerAppInitiatedItem = (item = {}) =>
	item.source === "customer_app" ||
	item.orderEntryMode === "customer" ||
	item.paymentResponsibility === "customer_app" ||
	!(
		item.source === "restaurant_pos" ||
		item.orderEntryMode === "staff" ||
		item.paymentResponsibility === "restaurant_pos" ||
		item.enteredByStaffId ||
		String(item.orderedByPipName || "").startsWith("Server:")
	);

const resolveCustomerServiceFeePolicy = ({ restaurantData = {}, tierConfig = {} }) => {
	const restaurantPolicy = restaurantData.paymentPolicy || {};
	const tierPolicy = tierConfig.paymentPolicy || {};
	const firstDefined = (...values) => {
		const match = values.find((value) => value !== undefined && value !== null);
		return match === undefined ? null : match;
	};

	return {
		customerServiceFeePercentage: normalizePercentage(
			firstDefined(
				restaurantPolicy.customerServiceFeePercentage,
				restaurantData.customerServiceFeePercentage,
				restaurantPolicy.scervFeePercentage,
				restaurantData.scervFeePercentage,
				restaurantPolicy.platformFeePercentage,
				restaurantData.platformFeePercentage,
				tierPolicy.customerServiceFeePercentage,
				tierConfig.customerServiceFeePercentage,
				tierPolicy.guestServiceFeePercentage,
				tierConfig.guestServiceFeePercentage,
				tierPolicy.scervFeePercentage,
				tierConfig.scervFeePercentage,
				tierPolicy.platformFeePercentage,
				tierConfig.platformFeePercentage,
				DEFAULT_CUSTOMER_SERVICE_FEE_PERCENTAGE,
			),
			DEFAULT_CUSTOMER_SERVICE_FEE_PERCENTAGE,
		),
		customerServiceFeeBasis: "customer_app_sales_and_tax",
	};
};

const calculateCustomerServiceFee = ({
	items = [],
	restaurantTaxRate = 0,
	customerServiceFeePercentage = DEFAULT_CUSTOMER_SERVICE_FEE_PERCENTAGE,
}) => {
	const customerAppTotals = calculateCloseoutTotals(
		items.filter(isCustomerAppInitiatedItem),
		restaurantTaxRate,
	);
	const basisAmount =
		customerAppTotals.subtotalCents + customerAppTotals.taxAmountCents;

	return {
		customerServiceFeeBasisAmount: basisAmount,
		customerServiceFeeAmount: calculatePercentageFee(
			basisAmount,
			customerServiceFeePercentage,
		),
		customerAppSubtotal: customerAppTotals.subtotalCents,
		customerAppTaxAmount: customerAppTotals.taxAmountCents,
	};
};

const getRestaurantSeatIdForItem = (item = {}) => {
	if (item.seatId) return String(item.seatId);
	if (item.orderedForSeatId) return String(item.orderedForSeatId);
	if (item.orderedByUserId) return `guest_${item.orderedByUserId}`;
	return "table_share";
};

const calculateCloseoutTotals = (items, restaurantTaxRate) => {
	let subtotalCents = 0;
	let originalSubtotalCents = 0;
	let taxAmountCents = 0;

	(items || []).forEach((item) => {
		const activePrice =
			item.discountedPrice !== undefined && item.discountedPrice !== null
				? item.discountedPrice
				: item.price || 0;
		const itemPriceCents = Math.round(Number(activePrice || 0) * 100);
		const originalPriceCents = Math.round(Number(item.price || 0) * 100);
		const quantity = Math.max(1, parseInt(item.quantity || 1, 10));

		subtotalCents += itemPriceCents * quantity;
		originalSubtotalCents += originalPriceCents * quantity;
		taxAmountCents += Math.round(itemPriceCents * quantity * restaurantTaxRate);
	});

	return {
		subtotalCents,
		originalSubtotalCents,
		discountTotalCents: Math.max(0, originalSubtotalCents - subtotalCents),
		taxAmountCents,
	};
};

const getActivePromotionDiscount = (basketData = {}) => {
	const discount = basketData.activePromotionDiscount || null;
	if (!discount || discount.status !== "active") return null;
	return discount;
};

const getPromotionDiscountCents = (activePromotionDiscount, subtotalCents) => {
	if (!activePromotionDiscount) return 0;
	const requestedDiscount = normalizeNonNegativeCents(
		activePromotionDiscount.appliedDiscountCents,
	);
	const maxDiscount = normalizeNonNegativeCents(
		activePromotionDiscount.maxDiscountCents,
	);
	const cappedDiscount =
		maxDiscount > 0 ? Math.min(requestedDiscount, maxDiscount) : requestedDiscount;
	return Math.min(Math.max(0, subtotalCents), cappedDiscount);
};

const applyPromotionDiscountToTotals = ({
	totals,
	activePromotionDiscount,
	restaurantTaxRate,
}) => {
	const promotionDiscountCents = getPromotionDiscountCents(
		activePromotionDiscount,
		totals.subtotalCents,
	);
	if (promotionDiscountCents <= 0) {
		return { ...totals, promotionDiscountCents: 0, activePromotionDiscount: null };
	}

	const taxReductionCents = Math.round(
		promotionDiscountCents * Math.max(0, Number(restaurantTaxRate || 0)),
	);
	return {
		...totals,
		subtotalCents: Math.max(0, totals.subtotalCents - promotionDiscountCents),
		taxAmountCents: Math.max(0, totals.taxAmountCents - taxReductionCents),
		discountTotalCents: totals.discountTotalCents + promotionDiscountCents,
		promotionDiscountCents,
		activePromotionDiscount,
	};
};

const getRestaurantTier = async (restaurantData = {}) => {
	const pricingTier = restaurantData.pricingTier || "basic";
	const configSnap = await db.collection("appConfig").doc("pricingTiers").get();
	const configData = configSnap.exists ? configSnap.data() || {} : {};
	const pricingTiers = configData.pricingTiers || configData || {};
	return {
		pricingTier,
		tierConfig: pricingTiers[pricingTier] || pricingTiers.basic || {},
	};
};

const resolveTerminalPolicy = ({ restaurantData = {}, tierConfig = {} }) => {
	const restaurantPolicy = restaurantData.paymentPolicy || {};
	const tierPolicy = tierConfig.paymentPolicy || {};
	const firstDefined = (...values) => {
		const match = values.find((value) => value !== undefined && value !== null);
		return match === undefined ? null : match;
	};

	const rawPercentage = firstDefined(
		restaurantPolicy.terminalProcessingFeePercentage,
		restaurantData.terminalProcessingFeePercentage,
		restaurantPolicy.restaurantProcessingFeePercentage,
		restaurantData.restaurantProcessingFeePercentage,
		tierPolicy.terminalProcessingFeePercentage,
		tierConfig.terminalProcessingFeePercentage,
		tierPolicy.restaurantProcessingFeePercentage,
		tierConfig.restaurantProcessingFeePercentage,
		DEFAULT_TERMINAL_PROCESSING_FEE_PERCENTAGE,
	);

	const rawFixed = firstDefined(
		restaurantPolicy.terminalProcessingFeeFixedCents,
		restaurantData.terminalProcessingFeeFixedCents,
		restaurantPolicy.restaurantProcessingFeeFixedCents,
		restaurantData.restaurantProcessingFeeFixedCents,
		tierPolicy.terminalProcessingFeeFixedCents,
		tierConfig.terminalProcessingFeeFixedCents,
		tierPolicy.restaurantProcessingFeeFixedCents,
		tierConfig.restaurantProcessingFeeFixedCents,
		DEFAULT_TERMINAL_PROCESSING_FEE_FIXED_CENTS,
	);

	const basis =
		restaurantPolicy.terminalProcessingFeeBasis ||
		restaurantData.terminalProcessingFeeBasis ||
		tierPolicy.terminalProcessingFeeBasis ||
		tierConfig.terminalProcessingFeeBasis ||
		"total";

	return {
		terminalProcessingFeePercentage: normalizePercentage(
			rawPercentage,
			DEFAULT_TERMINAL_PROCESSING_FEE_PERCENTAGE,
		),
		terminalProcessingFeeFixedCents: normalizeNonNegativeCents(rawFixed, 0),
		terminalProcessingFeeBasis: ["subtotal", "salesAndTax", "total"].includes(
			basis,
		)
			? basis
			: "total",
	};
};

const resolvePayLitePolicy = ({ restaurantData = {}, tierConfig = {} }) => {
	const restaurantPolicy = restaurantData.paymentPolicy || {};
	const payLitePolicy = restaurantData.payLitePolicy || {};
	const tierPolicy = tierConfig.paymentPolicy || {};
	const tierPayLitePolicy = tierConfig.payLitePolicy || {};
	const firstDefined = (...values) => {
		const match = values.find((value) => value !== undefined && value !== null);
		return match === undefined ? null : match;
	};

	const customerFeePercentage = normalizePercentage(
		firstDefined(
			payLitePolicy.customerFeePercentage,
			payLitePolicy.customerServiceFeePercentage,
			payLitePolicy.customerChargePercentage,
			restaurantPolicy.payLiteCustomerServiceFeePercentage,
			restaurantPolicy.payLiteCustomerFeePercentage,
			restaurantData.payLiteCustomerServiceFeePercentage,
			restaurantData.payLiteCustomerFeePercentage,
			tierPayLitePolicy.customerServiceFeePercentage,
			tierPolicy.payLiteCustomerServiceFeePercentage,
			tierConfig.payLiteCustomerServiceFeePercentage,
			DEFAULT_TERMINAL_PROCESSING_FEE_PERCENTAGE,
		),
		DEFAULT_TERMINAL_PROCESSING_FEE_PERCENTAGE,
	);
	const customerFeeFixedCents = normalizeNonNegativeCents(
		firstDefined(
			payLitePolicy.customerFeeFixedCents,
			payLitePolicy.customerServiceFeeFixedCents,
			restaurantPolicy.payLiteCustomerFeeFixedCents,
			tierPayLitePolicy.customerFeeFixedCents,
			tierPayLitePolicy.customerServiceFeeFixedCents,
			0,
		),
		0,
	);
	const customerFeeMode = normalizePolicyString(
		firstDefined(
			payLitePolicy.customerFeeMode,
			payLitePolicy.customerServiceFeeMode,
			restaurantPolicy.payLiteCustomerFeeMode,
			tierPayLitePolicy.customerFeeMode,
			"pass_to_customer",
		),
		["pass_to_customer", "none", "waived"],
		"pass_to_customer",
	);
	const customerFeeBasis = normalizePolicyString(
		firstDefined(
			payLitePolicy.customerFeeBasis,
			payLitePolicy.customerServiceFeeBasis,
			restaurantPolicy.payLiteCustomerFeeBasis,
			tierPayLitePolicy.customerFeeBasis,
			"sales_and_tax",
		),
		["sale", "sales_and_tax"],
		"sales_and_tax",
	);
	const taxMode = normalizePolicyString(
		firstDefined(
			payLitePolicy.taxMode,
			restaurantPolicy.payLiteTaxMode,
			restaurantData.payLiteTaxMode,
			tierPayLitePolicy.taxMode,
			"pos_included",
		),
		["pos_included", "scerv_calculated", "none", "waived"],
		"pos_included",
	);
	const taxRate = normalizePercentage(
		firstDefined(
			payLitePolicy.taxRate,
			restaurantPolicy.payLiteTaxRate,
			restaurantData.payLiteTaxRate,
			restaurantData.taxRate,
			tierPayLitePolicy.taxRate,
			0,
		),
		0,
	);

	const scervFeePercentage = normalizePercentage(
		firstDefined(
			payLitePolicy.scervFeePercentage,
			payLitePolicy.platformFeePercentage,
			restaurantPolicy.payLiteScervFeePercentage,
			restaurantPolicy.payLitePlatformFeePercentage,
			restaurantData.payLiteScervFeePercentage,
			restaurantData.payLitePlatformFeePercentage,
			tierPayLitePolicy.scervFeePercentage,
			tierPayLitePolicy.platformFeePercentage,
			tierPolicy.payLiteScervFeePercentage,
			tierConfig.payLiteScervFeePercentage,
			DEFAULT_TERMINAL_PROCESSING_FEE_PERCENTAGE,
		),
		DEFAULT_TERMINAL_PROCESSING_FEE_PERCENTAGE,
	);
	const scervFeeFixedCents = normalizeNonNegativeCents(
		firstDefined(
			payLitePolicy.scervFeeFixedCents,
			payLitePolicy.platformFeeFixedCents,
			restaurantPolicy.payLiteScervFeeFixedCents,
			restaurantPolicy.payLitePlatformFeeFixedCents,
			tierPayLitePolicy.scervFeeFixedCents,
			tierPayLitePolicy.platformFeeFixedCents,
			0,
		),
		0,
	);
	const scervFeeMode = normalizePolicyString(
		firstDefined(
			payLitePolicy.scervFeeMode,
			payLitePolicy.platformFeeMode,
			restaurantPolicy.payLiteScervFeeMode,
			restaurantPolicy.payLitePlatformFeeMode,
			tierPayLitePolicy.scervFeeMode,
			"customer_fee",
		),
		["sale_percentage", "customer_fee", "card_total_percentage", "fixed", "none", "waived"],
		"customer_fee",
	);
	const scervFeeCapCents = normalizeNonNegativeCents(
		firstDefined(
			payLitePolicy.scervFeeCapCents,
			payLitePolicy.platformFeeCapCents,
			restaurantPolicy.payLiteScervFeeCapCents,
			tierPayLitePolicy.scervFeeCapCents,
			0,
		),
		0,
	);
	const scervFeeMinimumCents = normalizeNonNegativeCents(
		firstDefined(
			payLitePolicy.scervFeeMinimumCents,
			payLitePolicy.platformFeeMinimumCents,
			restaurantPolicy.payLiteScervFeeMinimumCents,
			tierPayLitePolicy.scervFeeMinimumCents,
			0,
		),
		0,
	);

	return {
		version: "pay_lite_policy_v1",
		customerFeeMode,
		customerFeePercentage,
		customerFeeFixedCents,
		customerFeeBasis,
		taxMode,
		taxRate,
		scervFeeMode,
		scervFeePercentage,
		scervFeeFixedCents,
		scervFeeCapCents,
		scervFeeMinimumCents,
		source: "restaurant_config",
	};
};

const getPayLitePolicy = (restaurantData = {}, tierConfig = {}) =>
	resolvePayLitePolicy({ restaurantData, tierConfig });

const calculatePayLiteFinancials = ({ merchantNetSalesAmount, policy = {} }) => {
	const normalizedMerchantNetSalesAmount = normalizeNonNegativeCents(
		merchantNetSalesAmount,
		0,
	);
	const taxAmount =
		policy.taxMode === "scerv_calculated"
			? calculatePercentageFee(
					normalizedMerchantNetSalesAmount,
					policy.taxRate,
					0,
				)
			: 0;
	const salesAndTaxAmount = normalizedMerchantNetSalesAmount + taxAmount;
	const customerFeeBasisAmount =
		policy.customerFeeBasis === "sale"
			? normalizedMerchantNetSalesAmount
			: salesAndTaxAmount;
	const customerServiceFeeAmount =
		["none", "waived"].includes(policy.customerFeeMode)
			? 0
			: calculatePercentageFee(
					customerFeeBasisAmount,
					policy.customerFeePercentage,
					policy.customerFeeFixedCents,
				);
	const totalChargeAmount =
		salesAndTaxAmount + customerServiceFeeAmount;

	let rawScervFeeAmount = 0;
	if (["none", "waived"].includes(policy.scervFeeMode)) {
		rawScervFeeAmount = 0;
	} else if (policy.scervFeeMode === "customer_fee") {
		rawScervFeeAmount = customerServiceFeeAmount;
	} else if (policy.scervFeeMode === "card_total_percentage") {
		rawScervFeeAmount = calculatePercentageFee(
			totalChargeAmount,
			policy.scervFeePercentage,
			policy.scervFeeFixedCents,
		);
	} else if (policy.scervFeeMode === "fixed") {
		rawScervFeeAmount = policy.scervFeeFixedCents;
	} else {
		rawScervFeeAmount = calculatePercentageFee(
			normalizedMerchantNetSalesAmount,
			policy.scervFeePercentage,
			policy.scervFeeFixedCents,
		);
	}

	const cappedScervFeeAmount =
		policy.scervFeeCapCents > 0
			? Math.min(rawScervFeeAmount, policy.scervFeeCapCents)
			: rawScervFeeAmount;
	const minimumScervFeeAmount =
		cappedScervFeeAmount > 0
			? Math.max(cappedScervFeeAmount, policy.scervFeeMinimumCents)
			: cappedScervFeeAmount;
	const scervPayLiteFeeAmount = Math.min(
		totalChargeAmount,
		minimumScervFeeAmount,
	);
	const restaurantTransferAmount = Math.max(
		0,
		totalChargeAmount - scervPayLiteFeeAmount,
	);

	return {
		merchantNetSalesAmount: normalizedMerchantNetSalesAmount,
		taxAmount,
		salesAndTaxAmount,
		customerServiceFeeAmount,
		customerFeeBasisAmount,
		totalChargeAmount,
		scervPayLiteFeeAmount,
		restaurantTransferAmount,
		customerFeeMode: policy.customerFeeMode,
		customerFeeBasis: policy.customerFeeBasis,
		taxMode: policy.taxMode,
		taxRate: policy.taxRate,
		scervFeeMode: policy.scervFeeMode,
	};
};

const resolveStripeModeValue = ({
	restaurantData = {},
	isTestMode = true,
	testField,
	liveField,
	legacyField,
	modeField,
}) => {
	const mode = isTestMode ? "test" : "live";
	const modeSpecificValue = isTestMode
		? restaurantData[testField]
		: restaurantData[liveField];

	if (modeSpecificValue) {
		return {
			value: String(modeSpecificValue).trim(),
			mode,
			source: isTestMode ? testField : liveField,
		};
	}

	const legacyMode = restaurantData[modeField] || null;
	if (
		restaurantData[legacyField] &&
		(!legacyMode || legacyMode === mode)
	) {
		return {
			value: String(restaurantData[legacyField]).trim(),
			mode: legacyMode || mode,
			source: legacyField,
		};
	}

	return {
		value: "",
		mode,
		source: null,
	};
};

const resolveRestaurantStripeAccount = ({ restaurantData = {}, keys }) =>
	resolveStripeModeValue({
		restaurantData,
		isTestMode: keys.isTestMode,
		testField: "stripeAccountId_test",
		liveField: "stripeAccountId_live",
		legacyField: "stripeAccountId",
		modeField: "stripeAccountMode",
	});

const getStripeConnectedAccountOptions = (connectedAccountId, extraOptions = {}) =>
	connectedAccountId
		? {
				...extraOptions,
				stripeAccount: connectedAccountId,
			}
		: extraOptions;

const createStripeTerminalConnectionToken = (
	stripeInstance,
	params = {},
	requestOptions = {},
) => {
	const hasParams = Object.keys(params || {}).length > 0;
	const hasRequestOptions = Object.keys(requestOptions || {}).length > 0;

	if (hasParams && hasRequestOptions) {
		return stripeInstance.terminal.connectionTokens.create(
			params,
			requestOptions,
		);
	}
	if (hasParams) {
		return stripeInstance.terminal.connectionTokens.create(params);
	}
	if (hasRequestOptions) {
		return stripeInstance.terminal.connectionTokens.create(requestOptions);
	}
	return stripeInstance.terminal.connectionTokens.create();
};

const hasStripeRequestOptions = (requestOptions = {}) =>
	Object.keys(requestOptions || {}).length > 0;

const retrieveStripePaymentIntent = (
	stripeInstance,
	paymentIntentId,
	requestOptions = {},
) =>
	hasStripeRequestOptions(requestOptions)
		? stripeInstance.paymentIntents.retrieve(paymentIntentId, requestOptions)
		: stripeInstance.paymentIntents.retrieve(paymentIntentId);

const updateStripePaymentIntent = (
	stripeInstance,
	paymentIntentId,
	params = {},
	requestOptions = {},
) =>
	hasStripeRequestOptions(requestOptions)
		? stripeInstance.paymentIntents.update(
				paymentIntentId,
				params,
				requestOptions,
			)
		: stripeInstance.paymentIntents.update(paymentIntentId, params);

const captureStripePaymentIntent = (
	stripeInstance,
	paymentIntentId,
	params = {},
	requestOptions = {},
) =>
	hasStripeRequestOptions(requestOptions)
		? stripeInstance.paymentIntents.capture(
				paymentIntentId,
				params,
				requestOptions,
			)
		: stripeInstance.paymentIntents.capture(paymentIntentId, params);

const resolveTerminalAccountScope = ({
	restaurantData = {},
	defaultScope = "connected_account",
} = {}) => {
	const paymentPolicy =
		restaurantData.paymentPolicy && typeof restaurantData.paymentPolicy === "object"
			? restaurantData.paymentPolicy
			: {};
	const payLitePolicy =
		restaurantData.payLitePolicy && typeof restaurantData.payLitePolicy === "object"
			? restaurantData.payLitePolicy
			: {};
	const rawScope =
		payLitePolicy.terminalAccountScope ||
		payLitePolicy.readerAccountScope ||
		paymentPolicy.payLiteTerminalAccountScope ||
		paymentPolicy.terminalAccountScope ||
		restaurantData.payLiteTerminalAccountScope ||
		restaurantData.terminalAccountScope ||
		"";

	if (
		payLitePolicy.usePlatformTerminalAccount === true ||
		paymentPolicy.usePlatformTerminalAccount === true ||
		restaurantData.usePlatformTerminalAccount === true
	) {
		return "platform";
	}

	return normalizePolicyString(
		rawScope,
		["platform", "connected_account"],
		defaultScope,
	);
};

const resolveRestaurantTerminalLocation = ({ restaurantData = {}, keys }) => {
	const mode = keys.isTestMode ? "test" : "live";
	const resolved = resolveStripeModeValue({
		restaurantData,
		isTestMode: keys.isTestMode,
		testField: "stripeTerminalLocationId_test",
		liveField: "stripeTerminalLocationId_live",
		legacyField: "stripeTerminalLocationId",
		modeField: "stripeTerminalLocationMode",
	});

	if (resolved.value) return resolved;

	const fallback = resolveStripeModeValue({
		restaurantData,
		isTestMode: keys.isTestMode,
		testField: "terminalLocationId_test",
		liveField: "terminalLocationId_live",
		legacyField: "terminalLocationId",
		modeField: "terminalLocationMode",
	});

	if (fallback.value) return fallback;

	const payLiteDefaultCollector = restaurantData.payLiteDefaultCollector || {};
	const defaultTerminalCollector = restaurantData.defaultTerminalCollector || {};
	const terminalDefaultCollector = restaurantData.terminalDefaultCollector || {};
	const defaultCollectorLocation =
		payLiteDefaultCollector.locationId ||
		defaultTerminalCollector.locationId ||
		terminalDefaultCollector.locationId ||
		"";

	if (defaultCollectorLocation) {
		return {
			value: String(defaultCollectorLocation).trim(),
			source: "defaultCollector.locationId",
			mode,
		};
	}

	return fallback;
};

const normalizeStripeTerminalReader = (reader = {}) => {
	const locationId =
		typeof reader.location === "string"
			? reader.location
			: reader.location && reader.location.id
				? reader.location.id
				: "";
	return {
		id: reader.id || "",
		readerId: reader.id || "",
		label: reader.label || reader.id || "Stripe reader",
		name: reader.label || reader.id || "Stripe reader",
		serialNumber: reader.serial_number || reader.serialNumber || "",
		deviceType: reader.device_type || reader.deviceType || "",
		status: reader.status || "unknown",
		locationId,
		ipAddress: reader.ip_address || reader.ipAddress || "",
		discoveryMethod: "internet",
		simulated: false,
	};
};

const getConfiguredDefaultTerminalCollector = (restaurantData = {}) =>
	restaurantData.payLiteDefaultCollector ||
	restaurantData.defaultTerminalCollector ||
	restaurantData.terminalDefaultCollector ||
	null;

const terminalReaderMatchesCollector = (reader = {}, collector = {}) => {
	if (!reader || !collector) return false;
	const readerId = String(reader.readerId || reader.id || "").trim();
	const collectorId = String(collector.readerId || collector.id || "").trim();
	if (readerId && collectorId && readerId === collectorId) return true;

	const readerSerial = String(reader.serialNumber || "").trim();
	const collectorSerial = String(collector.serialNumber || "").trim();
	return !!readerSerial && !!collectorSerial && readerSerial === collectorSerial;
};

const selectRecommendedTerminalReader = (readers = [], defaultCollector = null) => {
	const onlineReaders = readers.filter((reader) => reader.status === "online");
	const matchingOnlineReader = onlineReaders.find((reader) =>
		terminalReaderMatchesCollector(reader, defaultCollector),
	);
	if (matchingOnlineReader) {
		return { reader: matchingOnlineReader, source: "default_online" };
	}

	if (onlineReaders.length) {
		return { reader: onlineReaders[0], source: "first_online" };
	}

	const matchingReader = readers.find((reader) =>
		terminalReaderMatchesCollector(reader, defaultCollector),
	);
	if (matchingReader) {
		return { reader: matchingReader, source: "default_offline" };
	}

	return {
		reader: readers[0] || null,
		source: readers.length ? "first_available" : "none",
	};
};

exports.createTerminalConnectionToken = functions
	.runWith({
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { restaurantId, staffId, locationId = "" } = data || {};
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		try {
			await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: [
					"server",
					"bartender",
					"bar",
					"chef",
					"kitchen",
					"host",
					"support",
					"busser",
					"runner",
				],
				action: "connect terminal reader",
			});

			const keys = await getStripeKeys(restaurantId);
			const restaurantSnap = await db
				.collection("restaurants")
				.doc(restaurantId)
				.get();
			const restaurantData = restaurantSnap.exists
				? restaurantSnap.data() || {}
				: {};
			const resolvedStripeAccount = resolveRestaurantStripeAccount({
				restaurantData,
				keys,
			});
			const restaurantStripeAccountId = resolvedStripeAccount.value || "";
			const terminalAccountScope = resolveTerminalAccountScope({
				restaurantData,
				defaultScope: restaurantStripeAccountId
					? "connected_account"
					: "platform",
			});
			const terminalStripeAccountId =
				terminalAccountScope === "platform" ? "" : restaurantStripeAccountId;
			const resolvedTerminalLocation = resolveRestaurantTerminalLocation({
				restaurantData,
				keys,
			});
			const requestedLocationId = String(locationId || "").trim();
			const configuredLocationId = String(
				resolvedTerminalLocation.value || "",
			).trim();
			const shouldScopeTokenToConfiguredLocation =
				terminalAccountScope !== "platform" || Boolean(requestedLocationId);
			const resolvedLocationId = shouldScopeTokenToConfiguredLocation
				? requestedLocationId || configuredLocationId
				: "";

			const stripeInstance = require("stripe")(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});
			const token = await createStripeTerminalConnectionToken(
				stripeInstance,
				resolvedLocationId ? { location: resolvedLocationId } : {},
				getStripeConnectedAccountOptions(terminalStripeAccountId),
			);

			return {
				secret: token.secret,
				liveMode: !keys.isTestMode,
				locationId: resolvedLocationId || null,
				locationSource: requestedLocationId
					? "request"
					: resolvedLocationId
						? resolvedTerminalLocation.source
						: "platform_account_all_locations",
				terminalAccountScope,
				connectedAccountId:
					terminalAccountScope === "connected_account"
						? restaurantStripeAccountId || null
						: null,
				payoutConnectedAccountId: restaurantStripeAccountId || null,
			};
		} catch (error) {
			console.error("Error creating Terminal connection token:", error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"Could not create Terminal connection token.",
			);
		}
	});

exports.listRestaurantTerminalReaders = functions
	.runWith({
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { restaurantId, staffId, locationId = "" } = data || {};
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		try {
			await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: [
					"server",
					"bartender",
					"bar",
					"chef",
					"kitchen",
					"host",
					"support",
					"busser",
					"runner",
				],
				action: "list terminal readers",
			});

			const keys = await getStripeKeys(restaurantId);
			const restaurantSnap = await db
				.collection("restaurants")
				.doc(restaurantId)
				.get();
			const restaurantData = restaurantSnap.exists
				? restaurantSnap.data() || {}
				: {};
			const resolvedStripeAccount = resolveRestaurantStripeAccount({
				restaurantData,
				keys,
			});
			const restaurantStripeAccountId = resolvedStripeAccount.value || "";
			const terminalAccountScope = resolveTerminalAccountScope({
				restaurantData,
				defaultScope: restaurantStripeAccountId
					? "connected_account"
					: "platform",
			});
			const terminalStripeAccountId =
				terminalAccountScope === "platform" ? "" : restaurantStripeAccountId;
			const resolvedTerminalLocation = resolveRestaurantTerminalLocation({
				restaurantData,
				keys,
			});
			const resolvedLocationId = String(
				locationId || resolvedTerminalLocation.value || "",
			).trim();

			const stripeInstance = require("stripe")(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});
			const listParams = {
				limit: 100,
				...(resolvedLocationId ? { location: resolvedLocationId } : {}),
			};
			const stripeReaders = await stripeInstance.terminal.readers.list(
				listParams,
				getStripeConnectedAccountOptions(terminalStripeAccountId),
			);
			const readers = (stripeReaders.data || []).map(
				normalizeStripeTerminalReader,
			);
			const defaultCollector =
				getConfiguredDefaultTerminalCollector(restaurantData);
			const recommended = selectRecommendedTerminalReader(
				readers,
				defaultCollector,
			);

			return {
				success: true,
				liveMode: !keys.isTestMode,
				locationId: resolvedLocationId || null,
				locationSource: locationId
					? "request"
					: resolvedTerminalLocation.source,
				terminalAccountScope,
				connectedAccountId:
					terminalAccountScope === "connected_account"
						? restaurantStripeAccountId || null
						: null,
				payoutConnectedAccountId: restaurantStripeAccountId || null,
				defaultCollector: defaultCollector || null,
				readers,
				recommendedReader: recommended.reader,
				recommendedSource: recommended.source,
			};
		} catch (error) {
			console.error("Error listing Terminal readers:", error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"Could not list Terminal readers.",
			);
		}
	});

exports.setDefaultTerminalCollector = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { restaurantId, staffId = null, collector = null } = data || {};
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		try {
			const staffMember = await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				action: "set the default Terminal collector",
			});

			const sanitizedCollector = sanitizeTerminalCollector(collector || {});
			const staffMemberId = staffMember && staffMember.id ? staffMember.id : null;
			const staffMemberName =
				staffMember && staffMember.name ? staffMember.name : null;
			const staffMemberRole =
				staffMember && staffMember.role ? staffMember.role : null;
			const collectorPayload = {
				...sanitizedCollector,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedBy: context.auth.uid,
				updatedByStaffId: staffMemberId || staffId || null,
				updatedByName: staffMemberName,
				updatedByRole: staffMemberRole,
			};

			await db
				.collection("restaurants")
				.doc(restaurantId)
				.set(
					{
						payLiteDefaultCollector: collectorPayload,
						defaultTerminalCollector: collectorPayload,
						updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);

			return {
				success: true,
				collector: {
					...sanitizedCollector,
					updatedBy: context.auth.uid,
					updatedByStaffId: staffMemberId || staffId || null,
					updatedByName: staffMemberName,
					updatedByRole: staffMemberRole,
				},
			};
		} catch (error) {
			console.error("Error setting default Terminal collector:", error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				error && error.message
					? error.message
					: "Could not save the default Terminal collector.",
			);
		}
	},
);

exports.prepareStaffTerminalPayment = functions
	.runWith({
		memory: "512MB",
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const {
			partyId,
			closeoutItemIds = [],
			closeoutSeatIds = [],
			staffId = null,
			staffName = "",
		} = data || {};

		if (!partyId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID is required.",
			);
		}

		try {
			const partySnap = await db.collection("parties").doc(partyId).get();
			if (!partySnap.exists) {
				throw new functions.https.HttpsError("not-found", "Party not found.");
			}

			const partyData = partySnap.data() || {};
			const restaurantId = partyData.restaurantId;
			if (!restaurantId) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Party is missing restaurant ID.",
				);
			}

			const staffMember = await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: ["server", "bartender", "bar"],
				action: "prepare terminal payment",
			});

			const restaurantSnap = await db
				.collection("restaurants")
				.doc(restaurantId)
				.get();
			if (!restaurantSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Restaurant not found.",
				);
			}

			const restaurantData = restaurantSnap.data() || {};
			const keys = await getStripeKeys(restaurantId);
			const resolvedStripeAccount = resolveRestaurantStripeAccount({
				restaurantData,
				keys,
			});
			const restaurantStripeAccountId = resolvedStripeAccount.value || null;
			const restaurantStripeReady =
				restaurantStripeAccountId &&
				(!restaurantData.stripeAccountMode ||
					restaurantData.stripeAccountMode === resolvedStripeAccount.mode ||
					resolvedStripeAccount.source !== "stripeAccountId") &&
				(restaurantData.stripeAccountStatus === "verified" ||
					restaurantData.stripeChargesEnabled === true);

			if (!restaurantStripeReady) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					keys.isTestMode
						? "Restaurant test Stripe account is not ready for Terminal payments."
						: "Restaurant live Stripe account is not ready for Terminal payments.",
				);
			}

			const basketSnap = await db.collection("shared_baskets").doc(partyId).get();
			const basketData = basketSnap.exists ? basketSnap.data() || {} : {};
			const allItems = Array.isArray(basketData.items) ? basketData.items : [];
			const officiallyOrderedItems = allItems.filter(
				(item) => item && item.status && item.status !== "new",
			);
			const unpaidItems = officiallyOrderedItems.filter(
				(item) =>
					item.paymentStatus !== "paid" && item.closeoutStatus !== "paid",
			);
			const requestedItemIdSet = new Set(
				(Array.isArray(closeoutItemIds) ? closeoutItemIds : [])
					.map((id) => String(id || "").trim())
					.filter(Boolean),
			);
			const requestedSeatIdSet = new Set(
				(Array.isArray(closeoutSeatIds) ? closeoutSeatIds : [])
					.map((id) => String(id || "").trim())
					.filter(Boolean),
			);
			let selectedItems = unpaidItems;

			if (requestedItemIdSet.size > 0) {
				selectedItems = unpaidItems.filter((item) =>
					requestedItemIdSet.has(item.id),
				);
			} else if (requestedSeatIdSet.size > 0) {
				selectedItems = unpaidItems.filter((item) =>
					requestedSeatIdSet.has(getRestaurantSeatIdForItem(item)),
				);
			}

			if (selectedItems.length === 0) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"No unpaid items were selected for Terminal payment.",
				);
			}

			let restaurantTaxRate = Number(restaurantData.taxRate || 0);
			if (!Number.isFinite(restaurantTaxRate) || restaurantTaxRate < 0) {
				restaurantTaxRate = 0;
			}
			if (restaurantTaxRate > 1) restaurantTaxRate = restaurantTaxRate / 100;

			const totals = applyPromotionDiscountToTotals({
				totals: calculateCloseoutTotals(selectedItems, restaurantTaxRate),
				activePromotionDiscount: getActivePromotionDiscount(basketData),
				restaurantTaxRate,
			});
			const salesAndTaxAmount = totals.subtotalCents + totals.taxAmountCents;
			if (salesAndTaxAmount <= 0) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Terminal payment amount must be greater than zero.",
				);
			}

			const { pricingTier, tierConfig } =
				await getRestaurantTier(restaurantData);
			const terminalPolicy = resolveTerminalPolicy({
				restaurantData,
				tierConfig,
			});
			const customerServiceFeePolicy = resolveCustomerServiceFeePolicy({
				restaurantData,
				tierConfig,
			});
			const customerServiceFee = calculateCustomerServiceFee({
				items: selectedItems,
				restaurantTaxRate,
				customerServiceFeePercentage:
					customerServiceFeePolicy.customerServiceFeePercentage,
			});
			const preTipAmount =
				salesAndTaxAmount + customerServiceFee.customerServiceFeeAmount;
			const selectedItemIds = selectedItems.map((item) => item.id).filter(Boolean);
			const selectedSeatIds = [
				...new Set(selectedItems.map(getRestaurantSeatIdForItem)),
			];
			const prepareIdempotencyKey = [
				"terminal:v3",
				resolvedStripeAccount.mode,
				restaurantStripeAccountId,
				partyId,
				selectedItemIds.join("_"),
				preTipAmount,
				"reader_tip",
			].join(":");
			const stripeInstance = require("stripe")(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});
			const stripeRequestOptions = getStripeConnectedAccountOptions(
				restaurantStripeAccountId,
				{ idempotencyKey: prepareIdempotencyKey },
			);
			const paymentIntent = await stripeInstance.paymentIntents.create(
				{
					amount: preTipAmount,
					currency: "usd",
					payment_method_types: ["card_present"],
					capture_method: "manual",
					description: `Scerv staff terminal closeout ${partyId}`,
					metadata: {
						type: "restaurant_terminal",
						partyId,
						restaurantId,
						userId: context.auth.uid,
						staffId: staffMember.id || staffId || "",
						subtotal: String(totals.subtotalCents),
						promotionDiscount: String(totals.promotionDiscountCents || 0),
						taxAmount: String(totals.taxAmountCents),
						gratuity: "0",
						total: String(preTipAmount),
						customerServiceFee: String(
							customerServiceFee.customerServiceFeeAmount,
						),
						customerServiceFeeBasis: customerServiceFeePolicy.customerServiceFeeBasis,
						customerServiceFeeBasisAmount: String(
							customerServiceFee.customerServiceFeeBasisAmount,
						),
						customerServiceFeePercentage: String(
							customerServiceFeePolicy.customerServiceFeePercentage,
						),
						platformFee: "0",
						terminalApplicationFeeAmount: "0",
						onReaderTipping: "true",
						pricingTier,
						terminalProcessingFeePercentage: String(
							terminalPolicy.terminalProcessingFeePercentage,
						),
						terminalProcessingFeeFixedCents: String(
							terminalPolicy.terminalProcessingFeeFixedCents,
						),
						terminalProcessingFeeBasis:
							terminalPolicy.terminalProcessingFeeBasis,
						stripeAccountMode: resolvedStripeAccount.mode,
						stripeAccountSource: resolvedStripeAccount.source || "",
						stripeChargeMode: restaurantStripeAccountId
							? "connected_account_direct_charge"
							: "platform_charge",
						selectedItemIds: selectedItemIds.join(","),
						selectedSeatIds: selectedSeatIds.join(","),
					},
				},
				stripeRequestOptions,
			);

			await db.collection("terminal_payments").doc(paymentIntent.id).set({
				id: paymentIntent.id,
				partyId,
				restaurantId,
				connectedAccountId: restaurantStripeAccountId,
				connectedAccountMode: resolvedStripeAccount.mode,
				connectedAccountSource: resolvedStripeAccount.source,
				stripeChargeMode: restaurantStripeAccountId
					? "connected_account_direct_charge"
					: "platform_charge",
				status: "requires_payment_method",
				paymentStatus: "pending",
				paymentMethod: "stripe_terminal",
				source: "restaurant_pos_terminal",
				liveMode: !keys.isTestMode,
				amount: preTipAmount,
				preTipAmount,
				subtotal: totals.subtotalCents,
				originalSubtotal: totals.originalSubtotalCents,
				discountTotal: totals.discountTotalCents,
				promotionDiscount: totals.promotionDiscountCents || 0,
				activePromotionDiscount: totals.activePromotionDiscount || null,
				taxAmount: totals.taxAmountCents,
				taxRate: restaurantTaxRate,
				gratuityAmount: 0,
				customerServiceFeeAmount: customerServiceFee.customerServiceFeeAmount,
				customerServiceFee: customerServiceFee.customerServiceFeeAmount,
				customerServiceFeePercentage:
					customerServiceFeePolicy.customerServiceFeePercentage,
				customerServiceFeeBasis:
					customerServiceFeePolicy.customerServiceFeeBasis,
				customerServiceFeeBasisAmount:
					customerServiceFee.customerServiceFeeBasisAmount,
				customerAppSubtotal: customerServiceFee.customerAppSubtotal,
				customerAppTaxAmount: customerServiceFee.customerAppTaxAmount,
				applicationFeeAmount: 0,
				terminalProcessingFeePercentage:
					terminalPolicy.terminalProcessingFeePercentage,
				terminalProcessingFeeFixedCents:
					terminalPolicy.terminalProcessingFeeFixedCents,
				terminalProcessingFeeBasis:
					terminalPolicy.terminalProcessingFeeBasis,
				terminalProcessingFeeBasisAmount: 0,
				restaurantTransferAmount: salesAndTaxAmount,
				itemIds: selectedItemIds,
				seatIds: selectedSeatIds,
				pricingTier,
				terminalPolicy,
				onReaderTipping: true,
				closeoutFinalized: false,
				createdBy: {
					userId: context.auth.uid,
					staffId: staffMember.id || staffId || null,
					name: staffName || staffMember.name || null,
					role: staffMember.role || null,
					jobTitle: staffMember.jobTitle || null,
				},
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			return {
				paymentIntentId: paymentIntent.id,
				clientSecret: paymentIntent.client_secret,
				amount: preTipAmount,
				subtotal: totals.subtotalCents,
				taxAmount: totals.taxAmountCents,
				customerServiceFeeAmount: customerServiceFee.customerServiceFeeAmount,
				gratuityAmount: 0,
				applicationFeeAmount: 0,
				onReaderTipping: true,
				itemIds: selectedItemIds,
				seatIds: selectedSeatIds,
				liveMode: !keys.isTestMode,
			};
		} catch (error) {
			console.error("Error preparing staff Terminal payment:", error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				error && error.message
					? error.message
					: "Could not prepare staff Terminal payment.",
				{
					code: error && error.code ? error.code : null,
					type: error && error.type ? error.type : null,
				},
			);
		}
	});

exports.prepareScervPayLiteTerminalPayment = functions
	.runWith({
		memory: "512MB",
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const {
			restaurantId,
			saleAmountCents,
			staffId = null,
			staffName = "",
			note = "",
			terminalReader = null,
			terminalLocationId = "",
			clientContext = null,
		} = data || {};

		const merchantNetSalesAmount = normalizeNonNegativeCents(saleAmountCents, 0);
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}
		if (merchantNetSalesAmount <= 0) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Sale amount must be greater than zero.",
			);
		}

		try {
			const staffMember = await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: ["server", "bartender", "bar"],
				action: "prepare Scerv Pay Lite payment",
			});

			const restaurantSnap = await db
				.collection("restaurants")
				.doc(restaurantId)
				.get();
			if (!restaurantSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Restaurant not found.",
				);
			}

			const restaurantData = restaurantSnap.data() || {};
			const keys = await getStripeKeys(restaurantId);
			const resolvedStripeAccount = resolveRestaurantStripeAccount({
				restaurantData,
				keys,
			});
			const restaurantStripeAccountId = resolvedStripeAccount.value || null;
			const terminalAccountScope = resolveTerminalAccountScope({
				restaurantData,
				defaultScope: restaurantStripeAccountId
					? "connected_account"
					: "platform",
			});
			const stripeChargeMode =
				terminalAccountScope === "platform" && restaurantStripeAccountId
					? "platform_destination_charge"
					: restaurantStripeAccountId
						? "connected_account_direct_charge"
						: "platform_charge";
			const restaurantStripeReady =
				restaurantStripeAccountId &&
				(!restaurantData.stripeAccountMode ||
					restaurantData.stripeAccountMode === resolvedStripeAccount.mode ||
					resolvedStripeAccount.source !== "stripeAccountId") &&
				(restaurantData.stripeAccountStatus === "verified" ||
					restaurantData.stripeChargesEnabled === true);

			if (!restaurantStripeReady) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					keys.isTestMode
						? "Restaurant test Stripe account is not ready for Pay Lite."
						: "Restaurant live Stripe account is not ready for Pay Lite.",
				);
			}

			const { tierConfig } = await getRestaurantTier(restaurantData);
			const payLitePolicy = getPayLitePolicy(restaurantData, tierConfig);
			const payLiteFinancials = calculatePayLiteFinancials({
				merchantNetSalesAmount,
				policy: payLitePolicy,
			});
			const customerFeePercentage = payLitePolicy.customerFeePercentage;
			const scervFeePercentage = payLitePolicy.scervFeePercentage;
			const customerServiceFeeAmount =
				payLiteFinancials.customerServiceFeeAmount;
			const taxAmount = payLiteFinancials.taxAmount;
			const salesAndTaxAmount = payLiteFinancials.salesAndTaxAmount;
			const customerFeeBasisAmount = payLiteFinancials.customerFeeBasisAmount;
			const totalChargeAmount = payLiteFinancials.totalChargeAmount;
			const scervPayLiteFeeAmount = payLiteFinancials.scervPayLiteFeeAmount;
			const restaurantTransferAmount =
				payLiteFinancials.restaurantTransferAmount;
			const tipEligibleAmount = merchantNetSalesAmount;
			const readableNote = sanitizeTerminalNote(note);
			const openWorkDay = await ensureOpenPayLiteWorkDaySnapshot({
				restaurantId,
				context,
				staffMember,
				staffId,
				staffName,
			});
			const readerMetadata = terminalReader && typeof terminalReader === "object"
				? {
						id: sanitizeMetadataString(terminalReader.id),
						label: sanitizeMetadataString(terminalReader.label),
						serialNumber: sanitizeMetadataString(terminalReader.serialNumber),
						deviceType: sanitizeMetadataString(terminalReader.deviceType),
						status: sanitizeMetadataString(terminalReader.status),
						locationId: sanitizeMetadataString(
							terminalReader.locationId || terminalLocationId,
						),
					}
				: {
						locationId: sanitizeMetadataString(terminalLocationId),
					};
			const clientMetadata = clientContext && typeof clientContext === "object"
				? {
						surface: sanitizeMetadataString(clientContext.surface),
						platform: sanitizeMetadataString(clientContext.platform),
						appEnvironment: sanitizeMetadataString(clientContext.appEnvironment),
						entryPoint: sanitizeMetadataString(clientContext.entryPoint),
					}
				: null;
			const prepareIdempotencyKey = [
				"pay_lite:v2",
				resolvedStripeAccount.mode,
				restaurantStripeAccountId,
				stripeChargeMode,
				context.auth.uid,
				staffMember.id || staffId || "",
				merchantNetSalesAmount,
				taxAmount,
				customerServiceFeeAmount,
				scervPayLiteFeeAmount,
				readableNote,
				Date.now(),
			].join(":");

			const stripeInstance = require("stripe")(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});
			const stripeRequestOptions = getStripeConnectedAccountOptions(
				stripeChargeMode === "connected_account_direct_charge"
					? restaurantStripeAccountId
					: null,
				{ idempotencyKey: prepareIdempotencyKey },
			);
			const paymentIntent = await stripeInstance.paymentIntents.create(
				{
					amount: totalChargeAmount,
					currency: "usd",
					payment_method_types: ["card_present"],
					capture_method: "manual",
					description: `Scerv Pay Lite ${restaurantId}`,
					...(stripeChargeMode === "platform_destination_charge" && {
						on_behalf_of: restaurantStripeAccountId,
						transfer_data: {
							destination: restaurantStripeAccountId,
						},
						application_fee_amount: scervPayLiteFeeAmount,
					}),
					metadata: {
						type: "scerv_pay_lite",
						restaurantId,
						userId: context.auth.uid,
						staffId: staffMember.id || staffId || "",
						merchantNetSalesAmount: String(merchantNetSalesAmount),
						saleAmount: String(merchantNetSalesAmount),
						taxAmount: String(taxAmount),
						salesAndTaxAmount: String(salesAndTaxAmount),
						customerServiceFee: String(customerServiceFeeAmount),
						scervPayLiteFeeAmount: String(scervPayLiteFeeAmount),
						customerFeeMode: payLitePolicy.customerFeeMode,
						customerFeeBasis: payLitePolicy.customerFeeBasis,
						customerFeeBasisAmount: String(customerFeeBasisAmount),
						payLiteTaxMode: payLitePolicy.taxMode,
						payLiteTaxRate: String(payLitePolicy.taxRate),
						scervFeeMode: payLitePolicy.scervFeeMode,
						serviceFeePercentage: String(customerFeePercentage),
						customerServiceFeePercentage: String(customerFeePercentage),
						customerFeeFixedCents: String(payLitePolicy.customerFeeFixedCents),
						scervPayLiteFeePercentage: String(scervFeePercentage),
						platformFeePercentage: String(scervFeePercentage),
						scervFeeFixedCents: String(payLitePolicy.scervFeeFixedCents),
						restaurantTransferAmount: String(restaurantTransferAmount),
						total: String(totalChargeAmount),
						onReaderTipping: "true",
						tipEligibleAmount: String(tipEligibleAmount),
						tipBasis: "manual_sale_amount",
						stripeAccountMode: resolvedStripeAccount.mode,
						stripeAccountSource: resolvedStripeAccount.source || "",
						stripeChargeMode,
						terminalAccountScope,
						workDayId: openWorkDay ? openWorkDay.id : "",
						terminalReaderId: readerMetadata.id || "",
						terminalReaderSerialNumber: readerMetadata.serialNumber || "",
						terminalLocationId: readerMetadata.locationId || "",
						note: readableNote,
					},
				},
				stripeRequestOptions,
			);

			await db.collection("terminal_payments").doc(paymentIntent.id).set({
				id: paymentIntent.id,
				restaurantId,
				connectedAccountId: restaurantStripeAccountId,
				connectedAccountMode: resolvedStripeAccount.mode,
				connectedAccountSource: resolvedStripeAccount.source,
				stripeChargeMode,
				terminalAccountScope,
				status: "requires_payment_method",
				paymentStatus: "pending",
				paymentMethod: "stripe_terminal",
				source: "scerv_pay_lite",
				type: "scerv_pay_lite",
				liveMode: !keys.isTestMode,
				amount: totalChargeAmount,
				preTipAmount: totalChargeAmount,
				subtotal: merchantNetSalesAmount,
				taxAmount,
				taxRate: payLitePolicy.taxRate,
				taxMode: payLitePolicy.taxMode,
				taxSource:
					payLitePolicy.taxMode === "scerv_calculated"
						? "payLitePolicy.taxRate"
						: "pos_or_external",
				gratuityAmount: 0,
				customerServiceFeeAmount,
				customerServiceFee: customerServiceFeeAmount,
				customerServiceFeePercentage: customerFeePercentage,
				customerFeeFixedCents: payLitePolicy.customerFeeFixedCents,
				customerFeeMode: payLitePolicy.customerFeeMode,
				customerFeeBasis: payLitePolicy.customerFeeBasis,
				customerServiceFeeBasis: payLitePolicy.customerFeeBasis,
				customerServiceFeeBasisAmount: customerFeeBasisAmount,
				merchantNetSalesAmount,
				salesAndTaxAmount,
				scervPayLiteFeeAmount,
				scervPayLiteFeePercentage: scervFeePercentage,
				scervFeeFixedCents: payLitePolicy.scervFeeFixedCents,
				scervFeeMode: payLitePolicy.scervFeeMode,
				scervFeeCapCents: payLitePolicy.scervFeeCapCents,
				scervFeeMinimumCents: payLitePolicy.scervFeeMinimumCents,
				serviceFeePercentage: customerFeePercentage,
				platformFeePercentage: scervFeePercentage,
				applicationFeeAmount: scervPayLiteFeeAmount,
				enteredAmountCents: merchantNetSalesAmount,
				enteredAt: admin.firestore.FieldValue.serverTimestamp(),
				enteredBy: {
					userId: context.auth.uid,
					staffId: staffMember.id || staffId || null,
					name: staffName || staffMember.name || null,
					role: staffMember.role || null,
					jobTitle: staffMember.jobTitle || null,
				},
				terminalProcessingFeeAmount: 0,
				terminalProcessingFeePercentage: 0,
				terminalProcessingFeeFixedCents: 0,
				terminalProcessingFeeBasis: "total",
				terminalProcessingFeeBasisAmount: merchantNetSalesAmount,
				restaurantTransferAmount,
				onReaderTipping: true,
				tipEligibleAmount,
				tipBasis: "manual_sale_amount",
				tipAmountCents: 0,
				tipSource: "stripe_terminal_reader",
				payLitePolicy,
				workDayId: openWorkDay ? openWorkDay.id : null,
				workDayStatus: openWorkDay ? openWorkDay.data.status || "OPEN" : null,
				terminalReader: readerMetadata,
				terminalLocationId: readerMetadata.locationId || null,
				clientContext: clientMetadata,
				reconciliation: {
					source: "scerv_pay_lite",
					requiresManualPosMatch: true,
					posAmountCents: merchantNetSalesAmount,
					saleAmountCents: merchantNetSalesAmount,
					taxAmountCents: taxAmount,
					salesAndTaxAmountCents: salesAndTaxAmount,
					cardTotalCents: totalChargeAmount,
					customerFeeCents: customerServiceFeeAmount,
					customerFeeBasis: payLitePolicy.customerFeeBasis,
					customerFeeBasisAmount,
					taxMode: payLitePolicy.taxMode,
					taxRate: payLitePolicy.taxRate,
					scervFeeCents: scervPayLiteFeeAmount,
					customerFeeMode: payLitePolicy.customerFeeMode,
					scervFeeMode: payLitePolicy.scervFeeMode,
					restaurantTransferAmount,
					tipEligibleAmount,
					tipBasis: "manual_pos_amount",
				},
				note: readableNote,
				closeoutFinalized: true,
				createdBy: {
					userId: context.auth.uid,
					staffId: staffMember.id || staffId || null,
					name: staffName || staffMember.name || null,
					role: staffMember.role || null,
					jobTitle: staffMember.jobTitle || null,
				},
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			return {
				paymentIntentId: paymentIntent.id,
				clientSecret: paymentIntent.client_secret,
				amount: totalChargeAmount,
				merchantNetSalesAmount,
				taxAmount,
				taxRate: payLitePolicy.taxRate,
				taxMode: payLitePolicy.taxMode,
				salesAndTaxAmount,
				customerServiceFeeAmount,
				customerFeeBasis: payLitePolicy.customerFeeBasis,
				customerFeeBasisAmount,
				scervPayLiteFeeAmount,
				serviceFeePercentage: customerFeePercentage,
				customerServiceFeePercentage: customerFeePercentage,
				customerFeeFixedCents: payLitePolicy.customerFeeFixedCents,
				customerFeeMode: payLitePolicy.customerFeeMode,
				scervPayLiteFeePercentage: scervFeePercentage,
				scervFeeFixedCents: payLitePolicy.scervFeeFixedCents,
				scervFeeMode: payLitePolicy.scervFeeMode,
				applicationFeeAmount: scervPayLiteFeeAmount,
				restaurantTransferAmount,
				onReaderTipping: true,
				tipEligibleAmount,
				liveMode: !keys.isTestMode,
			};
		} catch (error) {
			console.error("Error preparing Scerv Pay Lite Terminal payment:", error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				error && error.message
					? error.message
					: "Could not prepare Scerv Pay Lite payment.",
			);
		}
	});

exports.captureStaffTerminalPayment = functions
	.runWith({
		memory: "512MB",
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { paymentIntentId, staffId = null } = data || {};
		if (!paymentIntentId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"PaymentIntent ID is required.",
			);
		}

		try {
			const terminalPaymentRef = db
				.collection("terminal_payments")
				.doc(paymentIntentId);
			const terminalPaymentSnap = await terminalPaymentRef.get();
			if (!terminalPaymentSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Terminal payment was not found.",
				);
			}

			const terminalPaymentData = terminalPaymentSnap.data() || {};
			const restaurantId = terminalPaymentData.restaurantId;
			if (!restaurantId) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Terminal payment is missing restaurant ID.",
				);
			}

			await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: ["server", "bartender", "bar"],
				action: "capture terminal payment",
			});

			const restaurantSnap = await db
				.collection("restaurants")
				.doc(restaurantId)
				.get();
			const restaurantData = restaurantSnap.exists
				? restaurantSnap.data() || {}
				: {};

			const keys = await getStripeKeys(restaurantId);
			const stripeInstance = require("stripe")(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});
			const captureConnectedAccountId =
				terminalPaymentData.stripeChargeMode ===
					"connected_account_direct_charge" &&
				terminalPaymentData.connectedAccountId
					? terminalPaymentData.connectedAccountId
					: null;
			const captureUsesPlatformDestinationCharge =
				terminalPaymentData.stripeChargeMode ===
				"platform_destination_charge";
			const stripeRequestOptions =
				getStripeConnectedAccountOptions(captureConnectedAccountId);

			let paymentIntent = await retrieveStripePaymentIntent(
				stripeInstance,
				paymentIntentId,
				stripeRequestOptions,
			);
			const preTipAmount = Math.max(
				0,
				Math.round(
					Number(
						terminalPaymentData.preTipAmount ||
							terminalPaymentData.subtotal + terminalPaymentData.taxAmount ||
							terminalPaymentData.amount ||
							0,
					),
				),
			);
			const stripeTipAmount =
				paymentIntent.amount_details &&
				paymentIntent.amount_details.tip &&
				Number.isFinite(Number(paymentIntent.amount_details.tip.amount))
					? Math.max(
							0,
							Math.round(Number(paymentIntent.amount_details.tip.amount)),
						)
					: null;
			const finalAmount = Math.max(
				preTipAmount,
				Math.round(
					Number(
						paymentIntent.amount_capturable ||
							paymentIntent.amount_received ||
							paymentIntent.amount ||
							preTipAmount,
					),
				),
			);
			const gratuityAmount =
				stripeTipAmount !== null
					? stripeTipAmount
					: Math.max(0, finalAmount - preTipAmount);
			const terminalPolicy =
				terminalPaymentData.terminalPolicy ||
				resolveTerminalPolicy({ restaurantData: {}, tierConfig: {} });
			const isScervPayLite =
				terminalPaymentData.type === "scerv_pay_lite" ||
				terminalPaymentData.source === "scerv_pay_lite";
			const subtotal = normalizeNonNegativeCents(
				terminalPaymentData.subtotal,
				0,
			);
			const taxAmount = normalizeNonNegativeCents(
				terminalPaymentData.taxAmount,
				0,
			);
			const salesAndTaxAmount = subtotal + taxAmount;
			const customerServiceFeeAmount = normalizeNonNegativeCents(
				terminalPaymentData.customerServiceFeeAmount ||
					terminalPaymentData.customerServiceFee,
				0,
			);
			const restaurantGrossAmount = Math.max(
				0,
				finalAmount - customerServiceFeeAmount,
			);
			const feeBasisAmount =
				terminalPolicy.terminalProcessingFeeBasis === "subtotal"
					? subtotal
					: terminalPolicy.terminalProcessingFeeBasis === "salesAndTax"
						? salesAndTaxAmount
						: restaurantGrossAmount;
			const terminalProcessingFeeAmount = calculatePercentageFee(
				feeBasisAmount,
				terminalPolicy.terminalProcessingFeePercentage,
				terminalPolicy.terminalProcessingFeeFixedCents,
			);
			const payLiteMerchantNetSalesAmount = normalizeNonNegativeCents(
				terminalPaymentData.merchantNetSalesAmount,
				subtotal,
			);
			const configuredPayLiteFeeAmount =
				terminalPaymentData.scervPayLiteFeeAmount !== undefined &&
				terminalPaymentData.scervPayLiteFeeAmount !== null
					? terminalPaymentData.scervPayLiteFeeAmount
					: terminalPaymentData.applicationFeeAmount;
			const payLiteFeeAmount = normalizeNonNegativeCents(
				configuredPayLiteFeeAmount,
				Math.max(0, finalAmount - payLiteMerchantNetSalesAmount),
			);
			const applicationFeeAmount = isScervPayLite
				? Math.min(finalAmount, payLiteFeeAmount)
				: Math.min(
						finalAmount,
						customerServiceFeeAmount + terminalProcessingFeeAmount,
					);
			const restaurantTransferAmount = Math.max(
				0,
				finalAmount - applicationFeeAmount,
			);

			if (!isScervPayLite && applicationFeeAmount < customerServiceFeeAmount) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Terminal payment amount is less than required service fees.",
				);
			}

			const restaurantProcessingFeeAmount = isScervPayLite
				? 0
				: Math.max(0, applicationFeeAmount - customerServiceFeeAmount);
			const tipEligibleAmount = normalizeNonNegativeCents(
				terminalPaymentData.tipEligibleAmount,
				isScervPayLite ? payLiteMerchantNetSalesAmount : subtotal,
			);
			const existingReconciliation =
				terminalPaymentData.reconciliation &&
				typeof terminalPaymentData.reconciliation === "object"
					? terminalPaymentData.reconciliation
					: {};
			const storedPayLitePolicy =
				terminalPaymentData.payLitePolicy &&
				typeof terminalPaymentData.payLitePolicy === "object"
					? terminalPaymentData.payLitePolicy
					: {};
			const enteredBy = terminalPaymentData.enteredBy || {};
			const createdBy = terminalPaymentData.createdBy || {};

			if (paymentIntent.status === "requires_capture") {
				await updateStripePaymentIntent(
					stripeInstance,
					paymentIntentId,
					{
						metadata: {
							...(paymentIntent.metadata || {}),
							gratuity: String(gratuityAmount),
							total: String(finalAmount),
							platformFee: String(applicationFeeAmount),
							terminalApplicationFeeAmount: String(applicationFeeAmount),
							customerServiceFee: String(customerServiceFeeAmount),
							terminalProcessingFeeAmount: String(restaurantProcessingFeeAmount),
							merchantNetSalesAmount: String(
								isScervPayLite
									? payLiteMerchantNetSalesAmount
									: salesAndTaxAmount,
							),
							tipEligibleAmount: String(tipEligibleAmount),
							tipSource: isScervPayLite
								? "stripe_terminal_reader"
								: "restaurant_terminal_reader",
							scervPayLiteFeeAmount: String(
								isScervPayLite ? applicationFeeAmount : 0,
							),
							terminalProcessingFeePercentage: String(
								isScervPayLite
									? 0
									: terminalPolicy.terminalProcessingFeePercentage,
							),
							terminalProcessingFeeFixedCents: String(
								isScervPayLite
									? 0
									: terminalPolicy.terminalProcessingFeeFixedCents,
							),
							terminalProcessingFeeBasis:
								terminalPolicy.terminalProcessingFeeBasis,
							terminalProcessingFeeBasisAmount: String(feeBasisAmount),
						},
					},
					stripeRequestOptions,
				);
				paymentIntent = await captureStripePaymentIntent(
					stripeInstance,
					paymentIntentId,
					{
						amount_to_capture: finalAmount,
						...(captureConnectedAccountId &&
							applicationFeeAmount > 0 && {
							application_fee_amount: applicationFeeAmount,
						}),
					},
					getStripeConnectedAccountOptions(captureConnectedAccountId, {
						idempotencyKey: `terminal_capture:${paymentIntentId}:${finalAmount}`,
					}),
				);
			}

			if (paymentIntent.status !== "succeeded") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Terminal payment is not ready to capture.",
				);
			}

			const capturedAtDate = new Date();
			const paymentUpdate = {
					status: "succeeded",
					paymentStatus: "paid",
					paymentIntentId,
					stripePaymentIntentId: paymentIntentId,
					stripeLatestChargeId: paymentIntent.latest_charge || null,
					amount: finalAmount,
					amountReceived:
						paymentIntent.amount_received || paymentIntent.amount || finalAmount,
					gratuityAmount,
					customerServiceFeeAmount,
					customerServiceFee: customerServiceFeeAmount,
					customerFeeMode:
						terminalPaymentData.customerFeeMode ||
						storedPayLitePolicy.customerFeeMode ||
						null,
					applicationFeeAmount,
					stripeApplicationFeeAmount: applicationFeeAmount,
					platformFee: applicationFeeAmount,
					scervFee: applicationFeeAmount,
					stripeChargeMode:
						terminalPaymentData.stripeChargeMode ||
						(captureUsesPlatformDestinationCharge
							? "platform_destination_charge"
							: captureConnectedAccountId
								? "connected_account_direct_charge"
								: "platform_charge"),
					scervFeeMode:
						terminalPaymentData.scervFeeMode ||
						storedPayLitePolicy.scervFeeMode ||
						null,
					terminalProcessingFeeAmount: restaurantProcessingFeeAmount,
					restaurantProcessingFeeAmount,
					merchantNetSalesAmount: isScervPayLite
						? payLiteMerchantNetSalesAmount
						: salesAndTaxAmount,
					scervPayLiteFeeAmount: isScervPayLite ? applicationFeeAmount : 0,
					tipAmountCents: gratuityAmount,
					tipEligibleAmount,
					tipBasis: isScervPayLite
						? "manual_sale_amount"
						: "terminal_closeout_subtotal",
					tipSource: isScervPayLite
						? "stripe_terminal_reader"
						: "restaurant_terminal_reader",
					terminalProcessingFeePercentage:
						isScervPayLite ? 0 : terminalPolicy.terminalProcessingFeePercentage,
					terminalProcessingFeeFixedCents:
						isScervPayLite ? 0 : terminalPolicy.terminalProcessingFeeFixedCents,
					terminalProcessingFeeBasis:
						terminalPolicy.terminalProcessingFeeBasis,
					terminalProcessingFeeBasisAmount: feeBasisAmount,
					restaurantTransferAmount,
					capturedBy: {
						userId: context.auth.uid,
						staffId: staffId || null,
						enteredByStaffId: enteredBy.staffId || createdBy.staffId || null,
						enteredByName: enteredBy.name || createdBy.name || null,
					},
					reconciliation: {
						...existingReconciliation,
						finalAmountCents: finalAmount,
						taxAmountCents: taxAmount,
						salesAndTaxAmountCents: salesAndTaxAmount,
						tipAmountCents: gratuityAmount,
						tipEligibleAmount,
						applicationFeeAmount,
						customerFeeMode:
							terminalPaymentData.customerFeeMode ||
							storedPayLitePolicy.customerFeeMode ||
							null,
						scervFeeMode:
							terminalPaymentData.scervFeeMode ||
							storedPayLitePolicy.scervFeeMode ||
							null,
						restaurantTransferAmount,
						capturedByStaffId: staffId || null,
					},
					capturedAt: admin.firestore.FieldValue.serverTimestamp(),
					paidAt: admin.firestore.FieldValue.serverTimestamp(),
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				};

			await terminalPaymentRef.set(
				paymentUpdate,
				{ merge: true },
			);

			let customerReceipt = null;
			if (isScervPayLite) {
				customerReceipt = buildScervPayLiteCustomerReceipt({
					paymentIntentId,
					restaurantData,
					issuedAt: capturedAtDate,
					payment: {
						id: paymentIntentId,
						...terminalPaymentData,
						...paymentUpdate,
						capturedAt: capturedAtDate.toISOString(),
						paidAt: capturedAtDate.toISOString(),
					},
				});

				await Promise.all([
					terminalPaymentRef.set(
						{
							customerReceipt,
							receiptVersion: customerReceipt.version,
							receiptGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
						},
						{ merge: true },
					),
					db
						.collection("pay_lite_receipts")
						.doc(paymentIntentId)
						.set(
							{
								...customerReceipt,
								restaurantId,
								paymentIntentId,
								updatedAt: admin.firestore.FieldValue.serverTimestamp(),
								createdAt: admin.firestore.FieldValue.serverTimestamp(),
							},
							{ merge: true },
						),
				]);
			}

			return {
				success: true,
				paymentIntentId,
				amount: finalAmount,
				subtotal,
				taxAmount,
				taxRate: terminalPaymentData.taxRate || storedPayLitePolicy.taxRate || 0,
				taxMode: terminalPaymentData.taxMode || storedPayLitePolicy.taxMode || null,
				salesAndTaxAmount,
				customerServiceFeeAmount,
				gratuityAmount,
				applicationFeeAmount,
				restaurantTransferAmount,
				customerReceipt,
			};
		} catch (error) {
			console.error("Error capturing staff Terminal payment:", error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"Could not capture staff Terminal payment.",
			);
		}
	});

exports.getScervPayLiteReceipt = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const paymentIntentId = sanitizeMetadataString(
			data && (data.paymentIntentId || data.terminalPaymentId),
			140,
		);
		const staffId = sanitizeMetadataString(
			data && (data.staffId || data.employeeId),
			140,
		);
		if (!paymentIntentId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"PaymentIntent ID is required.",
			);
		}

		const terminalPaymentRef = db
			.collection("terminal_payments")
			.doc(paymentIntentId);
		const terminalPaymentSnap = await terminalPaymentRef.get();
		if (!terminalPaymentSnap.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Terminal payment was not found.",
			);
		}

		const payment = terminalPaymentSnap.data() || {};
		const restaurantId = sanitizeMetadataString(payment.restaurantId, 120);
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Terminal payment is missing restaurant ID.",
			);
		}

		await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			allowedJobTitles: ["server", "bartender", "bar"],
			action: "view Pay Lite receipt",
		});

		const isScervPayLite =
			payment.type === "scerv_pay_lite" ||
			payment.source === "scerv_pay_lite";
		if (!isScervPayLite) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"This receipt is only available for Scerv Pay Lite payments.",
			);
		}

		const restaurantSnap = await db
			.collection("restaurants")
			.doc(restaurantId)
			.get();
		const restaurantData = restaurantSnap.exists
			? restaurantSnap.data() || {}
			: {};
		const customerReceipt = buildScervPayLiteCustomerReceipt({
			paymentIntentId,
			restaurantData,
			payment: {
				id: paymentIntentId,
				...payment,
			},
		});

		await Promise.all([
			terminalPaymentRef.set(
				{
					customerReceipt,
					receiptVersion: customerReceipt.version,
					receiptGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			),
			db
				.collection("pay_lite_receipts")
				.doc(paymentIntentId)
				.set(
					{
						...customerReceipt,
						restaurantId,
						paymentIntentId,
						updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				),
		]);

		return {
			success: true,
			receipt: customerReceipt,
		};
	},
);

exports.getRecentScervPayLiteReceipts = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const restaurantId = sanitizeMetadataString(data && data.restaurantId, 120);
		const staffId = sanitizeMetadataString(
			data && (data.staffId || data.employeeId),
			140,
		);
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}
		if (!staffId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Staff ID is required.",
			);
		}

		await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager", "admin"],
			allowedJobTitles: ["server", "bartender", "bar"],
			action: "view recent Pay Lite receipts",
		});

		const cappedLimit = Math.min(
			Math.max(Math.round(Number(data && data.limit) || 5), 1),
			5,
		);

		const [restaurantSnap, paymentsSnap] = await Promise.all([
			db.collection("restaurants").doc(restaurantId).get(),
			db
				.collection("terminal_payments")
				.where("restaurantId", "==", restaurantId)
				.limit(100)
				.get(),
		]);
		const restaurantData = restaurantSnap.exists
			? restaurantSnap.data() || {}
			: {};

		const receipts = paymentsSnap.docs
			.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
			.filter((payment) => {
				const isPayLite =
					payment.type === "scerv_pay_lite" ||
					payment.source === "scerv_pay_lite";
				const isPaid =
					payment.paymentStatus === "paid" ||
					payment.status === "succeeded" ||
					payment.status === "paid";
				const enteredBy = payment.enteredBy || {};
				const capturedBy = payment.capturedBy || {};
				const paymentStaffId =
					enteredBy.staffId ||
					enteredBy.id ||
					capturedBy.enteredByStaffId ||
					capturedBy.staffId ||
					"";
				return isPayLite && isPaid && paymentStaffId === staffId;
			})
			.sort((a, b) => {
				const aMs = toTimestampMillis(
					a.paidAt || a.capturedAt || a.updatedAt || a.createdAt,
				);
				const bMs = toTimestampMillis(
					b.paidAt || b.capturedAt || b.updatedAt || b.createdAt,
				);
				return bMs - aMs;
			})
			.slice(0, cappedLimit)
			.map((payment) =>
				payment.customerReceipt ||
				buildScervPayLiteCustomerReceipt({
					paymentIntentId: payment.paymentIntentId || payment.id,
					restaurantData,
					payment,
				}),
			);

		return {
			success: true,
			receipts,
		};
	},
);

exports.getStaffTerminalPaymentStatus = functions.https.onCall(
	async (data, context) => {
		const paymentIntentId = sanitizeMetadataString(
			data && (data.paymentIntentId || data.terminalPaymentId),
			140,
		);
		const staffId = sanitizeMetadataString(
			data && (data.staffId || data.employeeId),
			140,
		);
		const requestedRestaurantId = sanitizeMetadataString(
			data && data.restaurantId,
			140,
		);

		if (!paymentIntentId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"PaymentIntent ID is required.",
			);
		}

		const paymentSnap = await db
			.collection("terminal_payments")
			.doc(paymentIntentId)
			.get();
		if (!paymentSnap.exists) {
			if (!requestedRestaurantId) {
				throw new functions.https.HttpsError(
					"invalid-argument",
					"Restaurant ID is required for missing payment lookup.",
				);
			}

			await assertTerminalPaymentStatusAccess({
				context,
				restaurantId: requestedRestaurantId,
				staffId,
			});

			return {
				success: true,
				exists: false,
				paid: false,
				status: "not_found",
			};
		}

		const payment = paymentSnap.data() || {};
		const restaurantId = sanitizeMetadataString(
			payment.restaurantId || requestedRestaurantId,
			140,
		);
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Terminal payment is missing restaurant ID.",
			);
		}

		await assertTerminalPaymentStatusAccess({
			context,
			restaurantId,
			staffId,
		});

		return {
			success: true,
			...shapeTerminalPaymentStatus(paymentSnap),
		};
	},
);

exports.getScervPayLiteDailyReport = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const {
			restaurantId,
			staffId = null,
			startAt = null,
			endAt = null,
			workDayId = null,
			limit = 1000,
		} = data || {};
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const requestedWorkDayId = sanitizeMetadataString(workDayId, 140);
		let startMs = Date.parse(startAt);
		let endMs = Date.parse(endAt);
		let workDayData = null;
		let reportWorkDayId = null;
		await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			action: "view Scerv Pay Lite reports",
		});

		if (requestedWorkDayId) {
			const workDaySnap = await db
				.collection("restaurants")
				.doc(restaurantId)
				.collection("work_days")
				.doc(requestedWorkDayId)
				.get();
			if (!workDaySnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Work day was not found.",
				);
			}
			workDayData = workDaySnap.data() || {};
			startMs = toTimestampMillis(
				workDayData.startTime || workDayData.openedAt || startAt,
			);
			endMs =
				toTimestampMillis(workDayData.endTime || workDayData.closedAt) ||
				Date.now();
		}
		if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Valid report start and end timestamps are required.",
			);
		}

		const cappedLimit = Math.min(
			Math.max(Math.round(Number(limit) || 1000), 50),
			2000,
		);

		const [restaurantSnap, paymentsSnap] = await Promise.all([
			db.collection("restaurants").doc(restaurantId).get(),
			db
				.collection("terminal_payments")
				.where("restaurantId", "==", restaurantId)
				.limit(cappedLimit)
				.get(),
		]);
		const restaurantData = restaurantSnap.data() || {};
		if (!requestedWorkDayId) {
			const currentWorkDayId = sanitizeMetadataString(
				restaurantData.currentWorkDayId,
				140,
			);
			let openWorkDaySnap = null;
			if (currentWorkDayId) {
				const currentSnap = await db
					.collection("restaurants")
					.doc(restaurantId)
					.collection("work_days")
					.doc(currentWorkDayId)
					.get();
				if (currentSnap.exists) {
					const currentData = currentSnap.data() || {};
					if (currentData.status === "OPEN") {
						openWorkDaySnap = currentSnap;
					}
				}
			}
			if (!openWorkDaySnap) {
				const openSnap = await db
					.collection("restaurants")
					.doc(restaurantId)
					.collection("work_days")
					.where("status", "==", "OPEN")
					.limit(1)
					.get();
				openWorkDaySnap = openSnap.empty ? null : openSnap.docs[0];
			}
			if (openWorkDaySnap) {
				reportWorkDayId = openWorkDaySnap.id;
				workDayData = openWorkDaySnap.data() || {};
			}
		}

		const report = buildScervPayLiteDailyReport({
			payments: paymentsSnap.docs.map((doc) => ({
				id: doc.id,
				...(doc.data() || {}),
			})),
			restaurantId,
			restaurantData,
			startMs,
			endMs,
			workDayId: requestedWorkDayId || null,
			reportWorkDayId,
			workDayData,
		});

		return {
			...report,
			truncated: paymentsSnap.size >= cappedLimit,
		};
	},
);

exports._test = {
	buildScervPayLiteCustomerReceipt,
	buildScervPayLiteDailyReport,
	calculatePayLiteFinancials,
	getPayLitePolicy,
	normalizeNonNegativeCents,
	toTimestampMillis,
};
