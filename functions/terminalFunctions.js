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

const buildScervPayLiteDailyReport = ({
	payments = [],
	restaurantData = {},
	restaurantId = "",
	startMs = 0,
	endMs = 0,
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
				customerServiceFeeAmount,
				gratuityAmount,
				amount,
				applicationFeeAmount,
				restaurantTransferAmount,
				customerFeeMode: payment.customerFeeMode || null,
				scervFeeMode: payment.scervFeeMode || null,
			};
		});

	const summary = rows.reduce(
		(acc, row) => {
			acc.transactionCount += 1;
			acc.merchantNetSalesAmount += row.merchantNetSalesAmount;
			acc.customerServiceFeeAmount += row.customerServiceFeeAmount;
			acc.gratuityAmount += row.gratuityAmount;
			acc.amount += row.amount;
			acc.applicationFeeAmount += row.applicationFeeAmount;
			acc.restaurantTransferAmount += row.restaurantTransferAmount;
			return acc;
		},
		{
			transactionCount: 0,
			merchantNetSalesAmount: 0,
			customerServiceFeeAmount: 0,
			gratuityAmount: 0,
			amount: 0,
			applicationFeeAmount: 0,
			restaurantTransferAmount: 0,
		},
	);

	return {
		restaurantId,
		restaurantName:
			restaurantData.restaurantName || restaurantData.name || "Restaurant",
		startAt: new Date(startMs).toISOString(),
		endAt: new Date(endMs).toISOString(),
		summary,
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
			"sale_percentage",
		),
		["sale_percentage", "customer_fee", "card_total_percentage", "fixed", "none", "waived"],
		"sale_percentage",
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
	const customerServiceFeeAmount =
		["none", "waived"].includes(policy.customerFeeMode)
			? 0
			: calculatePercentageFee(
					normalizedMerchantNetSalesAmount,
					policy.customerFeePercentage,
					policy.customerFeeFixedCents,
				);
	const totalChargeAmount =
		normalizedMerchantNetSalesAmount + customerServiceFeeAmount;

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
		customerServiceFeeAmount,
		totalChargeAmount,
		scervPayLiteFeeAmount,
		restaurantTransferAmount,
		customerFeeMode: policy.customerFeeMode,
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
			const token = await stripeInstance.terminal.connectionTokens.create(
				resolvedLocationId ? { location: resolvedLocationId } : {},
				getStripeConnectedAccountOptions(restaurantStripeAccountId),
			);

			return {
				secret: token.secret,
				liveMode: !keys.isTestMode,
				locationId: resolvedLocationId || null,
				locationSource: locationId
					? "request"
					: resolvedTerminalLocation.source,
				terminalAccountScope: restaurantStripeAccountId
					? "connected_account"
					: "platform",
				connectedAccountId: restaurantStripeAccountId || null,
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
				getStripeConnectedAccountOptions(restaurantStripeAccountId),
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
				terminalAccountScope: restaurantStripeAccountId
					? "connected_account"
					: "platform",
				connectedAccountId: restaurantStripeAccountId || null,
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
			const totalChargeAmount = payLiteFinancials.totalChargeAmount;
			const scervPayLiteFeeAmount = payLiteFinancials.scervPayLiteFeeAmount;
			const restaurantTransferAmount =
				payLiteFinancials.restaurantTransferAmount;
			const tipEligibleAmount = merchantNetSalesAmount;
			const readableNote = sanitizeTerminalNote(note);
			const openWorkDay = await getOpenWorkDaySnapshot(restaurantId);
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
				context.auth.uid,
				staffMember.id || staffId || "",
				merchantNetSalesAmount,
				customerServiceFeeAmount,
				scervPayLiteFeeAmount,
				readableNote,
				Date.now(),
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
					amount: totalChargeAmount,
					currency: "usd",
					payment_method_types: ["card_present"],
					capture_method: "manual",
					description: `Scerv Pay Lite ${restaurantId}`,
					metadata: {
						type: "scerv_pay_lite",
						restaurantId,
						userId: context.auth.uid,
						staffId: staffMember.id || staffId || "",
						merchantNetSalesAmount: String(merchantNetSalesAmount),
						saleAmount: String(merchantNetSalesAmount),
						customerServiceFee: String(customerServiceFeeAmount),
						scervPayLiteFeeAmount: String(scervPayLiteFeeAmount),
						customerFeeMode: payLitePolicy.customerFeeMode,
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
						tipBasis: "manual_pos_amount",
						stripeAccountMode: resolvedStripeAccount.mode,
						stripeAccountSource: resolvedStripeAccount.source || "",
						stripeChargeMode: restaurantStripeAccountId
							? "connected_account_direct_charge"
							: "platform_charge",
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
				stripeChargeMode: restaurantStripeAccountId
					? "connected_account_direct_charge"
					: "platform_charge",
				status: "requires_payment_method",
				paymentStatus: "pending",
				paymentMethod: "stripe_terminal",
				source: "scerv_pay_lite",
				type: "scerv_pay_lite",
				liveMode: !keys.isTestMode,
				amount: totalChargeAmount,
				preTipAmount: totalChargeAmount,
				subtotal: merchantNetSalesAmount,
				taxAmount: 0,
				gratuityAmount: 0,
				customerServiceFeeAmount,
				customerServiceFee: customerServiceFeeAmount,
				customerServiceFeePercentage: customerFeePercentage,
				customerFeeFixedCents: payLitePolicy.customerFeeFixedCents,
				customerFeeMode: payLitePolicy.customerFeeMode,
				customerServiceFeeBasis: "manual_pos_total",
				customerServiceFeeBasisAmount: merchantNetSalesAmount,
				merchantNetSalesAmount,
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
				tipBasis: "manual_pos_amount",
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
					cardTotalCents: totalChargeAmount,
					customerFeeCents: customerServiceFeeAmount,
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
				customerServiceFeeAmount,
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
			const stripeRequestOptions =
				getStripeConnectedAccountOptions(captureConnectedAccountId);

			let paymentIntent = await stripeInstance.paymentIntents.retrieve(
				paymentIntentId,
				{},
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
				await stripeInstance.paymentIntents.update(
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
				paymentIntent = await stripeInstance.paymentIntents.capture(
					paymentIntentId,
					{
						amount_to_capture: finalAmount,
						...(applicationFeeAmount > 0 && {
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

			await terminalPaymentRef.set(
				{
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
						? "manual_pos_amount"
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
				},
				{ merge: true },
			);

			return {
				success: true,
				paymentIntentId,
				amount: finalAmount,
				gratuityAmount,
				applicationFeeAmount,
				restaurantTransferAmount,
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
			limit = 1000,
		} = data || {};
		if (!restaurantId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Restaurant ID is required.",
			);
		}

		const startMs = Date.parse(startAt);
		const endMs = Date.parse(endAt);
		if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Valid report start and end timestamps are required.",
			);
		}

		await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			action: "view Scerv Pay Lite reports",
		});

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

		const report = buildScervPayLiteDailyReport({
			payments: paymentsSnap.docs.map((doc) => ({
				id: doc.id,
				...(doc.data() || {}),
			})),
			restaurantId,
			restaurantData,
			startMs,
			endMs,
		});

		return {
			...report,
			truncated: paymentsSnap.size >= cappedLimit,
		};
	},
);

exports._test = {
	buildScervPayLiteDailyReport,
	calculatePayLiteFinancials,
	getPayLitePolicy,
	normalizeNonNegativeCents,
	toTimestampMillis,
};
