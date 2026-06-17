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

const calculatePercentageFee = (amountCents, percentage, fixedCents = 0) =>
	Math.max(
		0,
		Math.round(Number(amountCents || 0) * normalizePercentage(percentage)) +
			normalizeNonNegativeCents(fixedCents),
	);

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

const resolveRestaurantTerminalLocation = ({ restaurantData = {}, keys }) => {
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

	return fallback;
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
			);

			return {
				secret: token.secret,
				liveMode: !keys.isTestMode,
				locationId: resolvedLocationId || null,
				locationSource: locationId
					? "request"
					: resolvedTerminalLocation.source,
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
			const paymentIntent = await stripeInstance.paymentIntents.create(
				{
					amount: preTipAmount,
					currency: "usd",
					payment_method_types: ["card_present"],
					capture_method: "manual",
					description: `Scerv staff terminal closeout ${partyId}`,
					transfer_data: {
						destination: restaurantStripeAccountId,
					},
					on_behalf_of: restaurantStripeAccountId,
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
						selectedItemIds: selectedItemIds.join(","),
						selectedSeatIds: selectedSeatIds.join(","),
					},
				},
				{ idempotencyKey: prepareIdempotencyKey },
			);

			await db.collection("terminal_payments").doc(paymentIntent.id).set({
				id: paymentIntent.id,
				partyId,
				restaurantId,
				connectedAccountId: restaurantStripeAccountId,
				connectedAccountMode: resolvedStripeAccount.mode,
				connectedAccountSource: resolvedStripeAccount.source,
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
				allowedJobTitles: ["server", "bartender"],
				action: "capture terminal payment",
			});

			const keys = await getStripeKeys(restaurantId);
			const stripeInstance = require("stripe")(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});

			let paymentIntent = await stripeInstance.paymentIntents.retrieve(
				paymentIntentId,
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
			const applicationFeeAmount = Math.min(
				finalAmount,
				customerServiceFeeAmount + terminalProcessingFeeAmount,
			);
			const restaurantTransferAmount = Math.max(
				0,
				finalAmount - applicationFeeAmount,
			);

			if (applicationFeeAmount < customerServiceFeeAmount) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Terminal payment amount is less than required service fees.",
				);
			}

			const restaurantProcessingFeeAmount = Math.max(
				0,
				applicationFeeAmount - customerServiceFeeAmount,
			);

			if (paymentIntent.status === "requires_capture") {
				await stripeInstance.paymentIntents.update(paymentIntentId, {
					metadata: {
						...(paymentIntent.metadata || {}),
						gratuity: String(gratuityAmount),
						total: String(finalAmount),
						platformFee: String(applicationFeeAmount),
						terminalApplicationFeeAmount: String(applicationFeeAmount),
						customerServiceFee: String(customerServiceFeeAmount),
						terminalProcessingFeeAmount: String(restaurantProcessingFeeAmount),
						terminalProcessingFeePercentage: String(
							terminalPolicy.terminalProcessingFeePercentage,
						),
						terminalProcessingFeeFixedCents: String(
							terminalPolicy.terminalProcessingFeeFixedCents,
						),
						terminalProcessingFeeBasis:
							terminalPolicy.terminalProcessingFeeBasis,
						terminalProcessingFeeBasisAmount: String(feeBasisAmount),
					},
				});
				paymentIntent = await stripeInstance.paymentIntents.capture(
					paymentIntentId,
					{
						amount_to_capture: finalAmount,
						...(applicationFeeAmount > 0 && {
							application_fee_amount: applicationFeeAmount,
						}),
					},
					{ idempotencyKey: `terminal_capture:${paymentIntentId}:${finalAmount}` },
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
					applicationFeeAmount,
					stripeApplicationFeeAmount: applicationFeeAmount,
					platformFee: applicationFeeAmount,
					scervFee: applicationFeeAmount,
					terminalProcessingFeeAmount: restaurantProcessingFeeAmount,
					restaurantProcessingFeeAmount,
					terminalProcessingFeePercentage:
						terminalPolicy.terminalProcessingFeePercentage,
					terminalProcessingFeeFixedCents:
						terminalPolicy.terminalProcessingFeeFixedCents,
					terminalProcessingFeeBasis:
						terminalPolicy.terminalProcessingFeeBasis,
					terminalProcessingFeeBasisAmount: feeBasisAmount,
					restaurantTransferAmount,
					capturedBy: {
						userId: context.auth.uid,
						staffId: staffId || null,
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
