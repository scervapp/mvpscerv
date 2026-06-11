// functions/paymentFunctions.js
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const stripe = require("stripe");
const { onCall } = require("firebase-functions/v1/https");
const db = admin.firestore();
const { updateDoc } = require("firebase-admin/firestore");
const { FieldValue } = require("firebase-admin/firestore");
const { generateOrderId } = require("./orderFunctions");
const { getStripeKeys, createStripeCustomerHelper } = require("./stripeUtils");

const STRIPE_PUBLISHABLE_KEY_TEST = defineSecret("STRIPE_PUBLISHABLE_KEY_TEST");
const STRIPE_SECRET_KEY_TEST = defineSecret("STRIPE_SECRET_KEY_TEST");
const STRIPE_PUBLISHABLE_KEY_LIVE = defineSecret("STRIPE_PUBLISHABLE_KEY_LIVE");
const STRIPE_SECRET_KEY_LIVE = defineSecret("STRIPE_SECRET_KEY_LIVE");
const STRIPE_WEBHOOK_SECRET_TEST = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");
const STRIPE_WEBHOOK_SECRET_LIVE = defineSecret("STRIPE_WEBHOOK_SECRET_LIVE");

const DRINK_CATEGORIES = [
	"Beer",
	"Wine",
	"Cocktails",
	"Spirits",
	"Sodas",
	"Drinks",
	"Juices",
	"Non-Alcoholic Drinks",
	"Alcoholic Drinks",
	"Beverages",
];

const DEFAULT_SCERV_FEE_PERCENTAGE = 0.03;
const DEFAULT_RESTAURANT_PROCESSING_FEE_PERCENTAGE = 0.04;
const DEFAULT_PAYOUT_PERCENTAGE = 0.97;

const isBarCategory = (category) => {
	const normalized = String(category || "")
		.trim()
		.toLowerCase();

	return DRINK_CATEGORIES.some(
		(cat) =>
			String(cat || "")
				.trim()
				.toLowerCase() === normalized,
	);
};

const normalizeCountryCode = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

const isUsRestaurantCountry = (value) =>
	["us", "usa", "united states", "united states of america"].includes(
		normalizeCountryCode(value),
	);

const normalizePercentage = (value, fallback = 0) => {
	if (value === undefined || value === null || value === "") return fallback;
	const parsed = Number(value);
	if (Number.isNaN(parsed)) return fallback;
	const decimal = parsed > 1 ? parsed / 100 : parsed;
	return Math.min(Math.max(decimal, 0), 1);
};

const toMillis = (value) => {
	if (!value) return null;
	if (typeof value.toMillis === "function") return value.toMillis();
	if (typeof value.toDate === "function") return value.toDate().getTime();
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const isDateInFuture = (value) => {
	const millis = toMillis(value);
	return millis !== null && millis > Date.now();
};

const firstDefined = (...values) => {
	const match = values.find((value) => value !== undefined && value !== null);
	return match === undefined ? null : match;
};

const normalizeStripeFeeResponsibility = (value) =>
	value === "scerv" ? "scerv" : "restaurant";

const normalizeRestaurantProcessingFeeBasis = (value) =>
	["subtotal", "salesAndTax", "total"].includes(value) ? value : "total";

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

const resolvePaymentPolicy = ({
	restaurantData = {},
	customerData = {},
	restaurantTierInfo = {},
}) => {
	const restaurantPolicy = restaurantData.paymentPolicy || {};
	const customerPolicy = customerData.paymentPolicy || {};
	const tierPolicy = restaurantTierInfo.paymentPolicy || {};

	const baseScervFeePercentage = normalizePercentage(
		firstDefined(
			customerPolicy.scervFeePercentage,
			customerData.scervFeePercentage,
			customerPolicy.platformFeePercentage,
			customerData.platformFeePercentage,
			customerPolicy.guestServiceFeePercentage,
			customerData.guestServiceFeePercentage,
			restaurantPolicy.scervFeePercentage,
			restaurantData.scervFeePercentage,
			restaurantPolicy.platformFeePercentage,
			restaurantData.platformFeePercentage,
			restaurantPolicy.guestServiceFeePercentage,
			restaurantData.guestServiceFeePercentage,
			tierPolicy.scervFeePercentage,
			restaurantTierInfo.scervFeePercentage,
			tierPolicy.platformFeePercentage,
			restaurantTierInfo.platformFeePercentage,
			tierPolicy.guestServiceFeePercentage,
			restaurantTierInfo.guestServiceFeePercentage,
			tierPolicy.customerServiceFeePercentage,
			restaurantTierInfo.customerServiceFeePercentage,
		),
		DEFAULT_SCERV_FEE_PERCENTAGE,
	);

	const scervFeeWaived =
		customerPolicy.waiveScervFee === true ||
		customerData.waiveScervFee === true ||
		customerPolicy.waivePlatformFee === true ||
		customerData.waivePlatformFee === true ||
		restaurantPolicy.waiveScervFee === true ||
		restaurantData.waiveScervFee === true ||
		restaurantPolicy.waivePlatformFee === true ||
		restaurantData.waivePlatformFee === true ||
		isDateInFuture(customerPolicy.scervFeeWaivedUntil) ||
		isDateInFuture(customerData.scervFeeWaivedUntil) ||
		isDateInFuture(restaurantPolicy.scervFeeWaivedUntil) ||
		isDateInFuture(restaurantData.scervFeeWaivedUntil);

	const stripeFeeResponsibility = normalizeStripeFeeResponsibility(
		firstDefined(
			customerPolicy.stripeFeeResponsibility,
			customerData.stripeFeeResponsibility,
			restaurantPolicy.stripeFeeResponsibility,
			restaurantData.stripeFeeResponsibility,
			tierPolicy.stripeFeeResponsibility,
			restaurantTierInfo.stripeFeeResponsibility,
		),
	);
	const restaurantProcessingFeePercentage = normalizePercentage(
		firstDefined(
			restaurantPolicy.processingFeePercentage,
			restaurantData.processingFeePercentage,
			restaurantPolicy.restaurantProcessingFeePercentage,
			restaurantData.restaurantProcessingFeePercentage,
			restaurantPolicy.stripeProcessingFeePercentage,
			restaurantData.stripeProcessingFeePercentage,
			restaurantPolicy.restaurantOrderingFeePercentage,
			restaurantData.restaurantOrderingFeePercentage,
			restaurantPolicy.paymentFacilitationFeePercentage,
			restaurantData.paymentFacilitationFeePercentage,
			tierPolicy.processingFeePercentage,
			restaurantTierInfo.processingFeePercentage,
			tierPolicy.restaurantProcessingFeePercentage,
			restaurantTierInfo.restaurantProcessingFeePercentage,
			tierPolicy.stripeProcessingFeePercentage,
			restaurantTierInfo.stripeProcessingFeePercentage,
			tierPolicy.restaurantOrderingFeePercentage,
			restaurantTierInfo.restaurantOrderingFeePercentage,
			tierPolicy.paymentFacilitationFeePercentage,
			restaurantTierInfo.paymentFacilitationFeePercentage,
		),
		DEFAULT_RESTAURANT_PROCESSING_FEE_PERCENTAGE,
	);
	const restaurantProcessingFeeFixedCents = normalizeNonNegativeCents(
		firstDefined(
			restaurantPolicy.processingFeeFixedCents,
			restaurantData.processingFeeFixedCents,
			restaurantPolicy.restaurantProcessingFeeFixedCents,
			restaurantData.restaurantProcessingFeeFixedCents,
			tierPolicy.processingFeeFixedCents,
			restaurantTierInfo.processingFeeFixedCents,
			tierPolicy.restaurantProcessingFeeFixedCents,
			restaurantTierInfo.restaurantProcessingFeeFixedCents,
		),
		0,
	);
	const restaurantProcessingFeeBasis = normalizeRestaurantProcessingFeeBasis(
		firstDefined(
			restaurantPolicy.restaurantProcessingFeeBasis,
			restaurantData.restaurantProcessingFeeBasis,
			restaurantPolicy.processingFeeBasis,
			restaurantData.processingFeeBasis,
			tierPolicy.restaurantProcessingFeeBasis,
			restaurantTierInfo.restaurantProcessingFeeBasis,
			tierPolicy.processingFeeBasis,
			restaurantTierInfo.processingFeeBasis,
		),
	);

	return {
		version: 1,
		source: "server_policy",
		pricingTier: restaurantTierInfo.tierName || restaurantData.pricingTier || "basic",
		scervFeeBasis: "sales_and_tax",
		baseScervFeePercentage,
		scervFeePercentage: scervFeeWaived ? 0 : baseScervFeePercentage,
		scervFeeWaived,
		feeWaiverReason: scervFeeWaived
			? firstDefined(
					customerPolicy.feeWaiverReason,
					customerData.feeWaiverReason,
					restaurantPolicy.feeWaiverReason,
					restaurantData.feeWaiverReason,
					"admin_waiver",
				)
			: null,
		stripeFeeResponsibility,
		restaurantProcessingFeePercentage,
		restaurantProcessingFeeFixedCents,
		restaurantProcessingFeeBasis,
		customerPolicySnapshot: {
			scervFeePercentage: firstDefined(
				customerPolicy.scervFeePercentage,
				customerData.scervFeePercentage,
				null,
			),
			waiveScervFee: customerPolicy.waiveScervFee === true ||
				customerData.waiveScervFee === true,
			stripeFeeResponsibility: firstDefined(
				customerPolicy.stripeFeeResponsibility,
				customerData.stripeFeeResponsibility,
				null,
			),
		},
		restaurantPolicySnapshot: {
			scervFeePercentage: firstDefined(
				restaurantPolicy.scervFeePercentage,
				restaurantData.scervFeePercentage,
				null,
			),
			waiveScervFee: restaurantPolicy.waiveScervFee === true ||
				restaurantData.waiveScervFee === true ||
				restaurantData.waivePlatformFee === true,
			stripeFeeResponsibility: firstDefined(
				restaurantPolicy.stripeFeeResponsibility,
				restaurantData.stripeFeeResponsibility,
				null,
			),
			restaurantProcessingFeePercentage: firstDefined(
				restaurantPolicy.processingFeePercentage,
				restaurantData.processingFeePercentage,
				restaurantPolicy.restaurantProcessingFeePercentage,
				restaurantData.restaurantProcessingFeePercentage,
				restaurantPolicy.restaurantOrderingFeePercentage,
				restaurantData.restaurantOrderingFeePercentage,
				restaurantPolicy.paymentFacilitationFeePercentage,
				restaurantData.paymentFacilitationFeePercentage,
				tierPolicy.processingFeePercentage,
				restaurantTierInfo.processingFeePercentage,
				tierPolicy.restaurantProcessingFeePercentage,
				restaurantTierInfo.restaurantProcessingFeePercentage,
				tierPolicy.restaurantOrderingFeePercentage,
				restaurantTierInfo.restaurantOrderingFeePercentage,
				tierPolicy.paymentFacilitationFeePercentage,
				restaurantTierInfo.paymentFacilitationFeePercentage,
				null,
			),
			restaurantProcessingFeeBasis,
		},
	};
};

const getModifierDisplayName = (modifier) => {
	if (!modifier) return "Modifier";

	if (typeof modifier.name === "string") return modifier.name;

	if (modifier.name && typeof modifier.name === "object") {
		return (
			modifier.name.en ||
			modifier.name.es ||
			modifier.name.original ||
			"Modifier"
		);
	}

	return "Modifier";
};

/**
 * @async
 * @function getRestaurantTier
 * @description Fetches the pricing tier configuration for a given restaurant.
 * It reads the restaurant's assigned tier and looks up the corresponding
 * details (like payoutPercentage) from a central configuration document.
 *
 * @param {string} restaurantId The ID of the restaurant to look up.
 * @returns {Promise<object>} A promise that resolves to the configuration
 * object for the restaurant's pricing tier (e.g., { payoutPercentage: 0.97, ... }).
 * @throws Will throw an error if the restaurant or pricing configuration is not found,
 * ensuring the calling function does not proceed with incorrect data.
 */
async function getRestaurantTier(restaurantId) {
	if (!restaurantId) {
		throw new Error(
			"getRestaurantTier Error: restaurantId cannot be null or empty.",
		);
	}

	// 1. Fetch the restaurant document to find its pricingTier string.
	const restaurantRef = db.collection("restaurants").doc(restaurantId);
	const restaurantDoc = await restaurantRef.get();

	if (!restaurantDoc.exists) {
		// This is a critical failure, as we cannot determine the pricing.
		throw new Error(
			`getRestaurantTier Error: Restaurant ${restaurantId} not found.`,
		);
	}

	// 2. Safely get the tier name, defaulting to "basic" if not specified.
	const tierName = restaurantDoc.data().pricingTier || "basic";
	console.log(`Restaurant ${restaurantId} is on pricing tier: "${tierName}".`);

	// 3. Fetch the central document containing all pricing tier maps.
	// Note: Adjust the path if your structure is different, e.g., collection('appConfig').doc('general')
	const [tiersDoc, generalDoc] = await Promise.all([
		db.collection("appConfig").doc("pricingTiers").get(),
		db.collection("appConfig").doc("general").get(),
	]);
	const generalConfig = generalDoc.exists ? generalDoc.data() || {} : {};
	const globalCustomerFeePercentage = normalizePercentage(
		firstDefined(
			generalConfig.customerServiceFeePercentage,
			generalConfig.scervFeePercentage,
			generalConfig.platformFeePercentage,
			generalConfig.fees,
		),
		DEFAULT_SCERV_FEE_PERCENTAGE,
	);

	if (!tiersDoc.exists) {
		console.warn(
			"getRestaurantTier Warning: The 'pricingTiers' document was not found in 'appConfig'. Falling back to default basic pricing.",
		);
		return {
			tierName,
			payoutPercentage: DEFAULT_PAYOUT_PERCENTAGE,
			scervFeePercentage: globalCustomerFeePercentage,
			restaurantProcessingFeePercentage:
				DEFAULT_RESTAURANT_PROCESSING_FEE_PERCENTAGE,
			restaurantProcessingFeeFixedCents: 0,
			restaurantProcessingFeeBasis: "total",
			source: "default_fallback",
		};
	}

	const allTiers = tiersDoc.data();
	const tierConfig = allTiers.pricingTiers
		? allTiers.pricingTiers[tierName]
		: allTiers[tierName];

	// 4. Check for data integrity.
	if (!tierConfig) {
		console.warn(
			`getRestaurantTier Warning: Configuration for tier "${tierName}" is missing or invalid. Falling back to default basic pricing.`,
		);
		return {
			tierName,
			payoutPercentage: DEFAULT_PAYOUT_PERCENTAGE,
			scervFeePercentage: DEFAULT_SCERV_FEE_PERCENTAGE,
			restaurantProcessingFeePercentage:
				DEFAULT_RESTAURANT_PROCESSING_FEE_PERCENTAGE,
			restaurantProcessingFeeFixedCents: 0,
			restaurantProcessingFeeBasis: "total",
			source: "default_fallback",
		};
	}

	// 5. Return the specific configuration object for the determined tier.
	const payoutPercentage = normalizePercentage(
		tierConfig.payoutPercentage,
		DEFAULT_PAYOUT_PERCENTAGE,
	);
	const scervFeePercentage = normalizePercentage(
		firstDefined(
			tierConfig.scervFeePercentage,
			tierConfig.platformFeePercentage,
			tierConfig.guestServiceFeePercentage,
			tierConfig.customerServiceFeePercentage,
			globalCustomerFeePercentage,
		),
		globalCustomerFeePercentage,
	);
	const restaurantProcessingFeePercentage = normalizePercentage(
		firstDefined(
			tierConfig.restaurantProcessingFeePercentage,
			tierConfig.processingFeePercentage,
			tierConfig.stripeProcessingFeePercentage,
			tierConfig.restaurantOrderingFeePercentage,
			tierConfig.paymentFacilitationFeePercentage,
		),
		DEFAULT_RESTAURANT_PROCESSING_FEE_PERCENTAGE,
	);
	const restaurantProcessingFeeFixedCents = normalizeNonNegativeCents(
		firstDefined(
			tierConfig.restaurantProcessingFeeFixedCents,
			tierConfig.processingFeeFixedCents,
			tierConfig.stripeProcessingFeeFixedCents,
		),
		0,
	);
	const restaurantProcessingFeeBasis = normalizeRestaurantProcessingFeeBasis(
		firstDefined(
			tierConfig.restaurantProcessingFeeBasis,
			tierConfig.processingFeeBasis,
		),
	);

	return {
		...tierConfig,
		tierName,
		payoutPercentage,
		scervFeePercentage,
		globalCustomerFeePercentage,
		restaurantProcessingFeePercentage,
		restaurantProcessingFeeFixedCents,
		restaurantProcessingFeeBasis,
	};
}

const getStripeObjectId = (value) => {
	if (!value) return null;
	if (typeof value === "string") return value;
	return value.id || null;
};

const sanitizeFirestoreValue = (value) => {
	if (value === undefined) return null;
	if (value === null) return null;
	if (Array.isArray(value)) return value.map(sanitizeFirestoreValue);
	if (
		typeof value === "object" &&
		!(value instanceof Date) &&
		!(value && typeof value.toDate === "function")
	) {
		return Object.entries(value).reduce((cleaned, [key, entryValue]) => {
			if (entryValue !== undefined) {
				cleaned[key] = sanitizeFirestoreValue(entryValue);
			}
			return cleaned;
		}, {});
	}
	return value;
};

const saveStripePaymentMethodSummary = async ({
	stripeInstance,
	paymentIntent,
	userId,
}) => {
	const paymentMethodId = getStripeObjectId(paymentIntent.payment_method);
	const stripeCustomerId = getStripeObjectId(paymentIntent.customer);

	if (!stripeInstance || !paymentMethodId || !userId || userId === "anonymous") {
		return null;
	}

	try {
		const paymentMethod =
			typeof paymentIntent.payment_method === "object"
				? paymentIntent.payment_method
				: await stripeInstance.paymentMethods.retrieve(paymentMethodId);

		const card = paymentMethod.card || {};
		const wallet = card.wallet || {};
		const createdAt = paymentMethod.created
			? admin.firestore.Timestamp.fromMillis(paymentMethod.created * 1000)
			: admin.firestore.FieldValue.serverTimestamp();
		const summary = {
			processor: "stripe",
			type: paymentMethod.type || null,
			paymentMethodId,
			stripePaymentMethodId: paymentMethodId,
			stripeCustomerId,
			brand: card.brand || null,
			last4: card.last4 || null,
			expMonth: card.exp_month || null,
			expYear: card.exp_year || null,
			funding: card.funding || null,
			country: card.country || null,
			wallet: wallet.type || null,
			reusable: true,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		};

		const customerRef = db.collection("customers").doc(userId);
		await customerRef
			.collection("savedPaymentMethods")
			.doc(paymentMethodId)
			.set(
				{
					...summary,
					createdAt,
				},
				{ merge: true },
			);

		await customerRef.set(
			{
				hasSavedStripePaymentMethod: true,
				lastStripePaymentMethodId: paymentMethodId,
				lastStripePaymentMethodUpdatedAt:
					admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		return summary;
	} catch (error) {
		console.warn(
			`[Webhook] Could not save Stripe payment method summary for ${paymentMethodId}.`,
			error,
		);
		return null;
	}
};

const toPreparePaymentHttpsError = (error) => {
	if (error instanceof functions.https.HttpsError) {
		return error;
	}

	const message = String(error && error.message ? error.message : error || "");
	const stripeType = error && error.type;
	const stripeCode = error && error.code;

	if (stripeType || stripeCode) {
		return new functions.https.HttpsError(
			"failed-precondition",
			`Stripe could not prepare this payment: ${message}`,
			{
				stripeType: stripeType || null,
				stripeCode: stripeCode || null,
				requestId: error && error.requestId ? error.requestId : null,
			},
		);
	}

	if (
		message.includes("Cannot use \"undefined\" as a Firestore value") ||
		message.includes("Cannot use undefined as a Firestore value")
	) {
		return new functions.https.HttpsError(
			"failed-precondition",
			"Payment data contains an unsupported empty field. Please refresh your basket and try again.",
		);
	}

	if (
		message.includes("secret") ||
		message.includes("Secret") ||
		message.includes("STRIPE_")
	) {
		return new functions.https.HttpsError(
			"failed-precondition",
			"Stripe is not fully configured for this restaurant or environment.",
		);
	}

	return new functions.https.HttpsError(
		"internal",
		`Payment preparation failed: ${message || "unknown server error"}`,
	);
};

/**
 * A shared helper function to process verified Stripe webhook events.
 * It intelligently handles successful payments and failures for both
 * individual orders and party payments by checking the event metadata.
 * It includes logic to retrieve exact Stripe fees for accurate accounting.
 *
 * @param {object} event The verified Stripe event object.
 * @param {object} stripeInstance The initialized Stripe instance (test or live).
 */
const handleStripeEvent = async (event, stripeInstance) => {
	console.log(`🔔 Handling event: ${event.id}, Type: ${event.type}`);

	const paymentIntent = event.data.object;
	const metadata = paymentIntent.metadata || {};

	console.log(
		"Webhook received. Metadata content:",
		JSON.stringify(metadata, null, 2),
	);

	switch (event.type) {
		case "payment_intent.succeeded":
			const paymentIntent = event.data.object;

			// --- Get Exact Stripe Fee ---
			let stripeFeeActual = 0;
			let stripeApplicationFeeAmount = Number(
				metadata.stripeApplicationFeeAmount ||
					metadata.applicationFeeAmount ||
					0,
			);
			let stripeDestinationTransferId = null;
			try {
				if (paymentIntent.latest_charge) {
					const charge = await stripeInstance.charges.retrieve(
						paymentIntent.latest_charge,
						{
							expand: ["balance_transaction"],
						},
					);
					if (charge.balance_transaction) {
						stripeFeeActual = charge.balance_transaction.fee;
					}
					if (charge.application_fee_amount) {
						stripeApplicationFeeAmount = charge.application_fee_amount;
					}
					stripeDestinationTransferId = getStripeObjectId(charge.transfer);
				}
			} catch (feeError) {
				console.warn(
					`[Webhook] Could not retrieve exact fee for PI ${paymentIntent.id}.`,
					feeError,
				);
			}
			if (stripeFeeActual === 0) {
				// Fallback calculation
				stripeFeeActual = Math.round(paymentIntent.amount * 0.029) + 30;
			}

			const stripePaymentMethodId = getStripeObjectId(
				paymentIntent.payment_method,
			);
			const stripePaymentMethodSummary =
				metadata.type === "restaurant_terminal"
					? null
					: await saveStripePaymentMethodSummary({
							stripeInstance,
							paymentIntent,
							userId: metadata.userId,
						});

			// --- Delegate to the Fulfillment Helper ---
			// The handler's job is simple: pass the verified data to our powerful helper.
			await db
				.collection("payment_events")
				.doc(event.id)
				.set(
					{
						eventId: event.id,
						eventType: event.type,
						processor: "stripe",
						processorObjectId: paymentIntent.id,
						orderId: metadata.orderId || null,
						restaurantId: metadata.restaurantId || null,
						customerId: metadata.userId || null,
						amount: paymentIntent.amount_received || paymentIntent.amount || 0,
						currency: paymentIntent.currency || "usd",
						liveMode: event.livemode === true,
						stripePaymentMethodId,
						paymentMethodSummary: stripePaymentMethodSummary,
						stripeApplicationFeeAmount,
						stripeDestinationTransferId,
						receivedAt: admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);

			if (metadata.type === "restaurant_terminal") {
				const amountReceived =
					paymentIntent.amount_received || paymentIntent.amount || 0;
				const gratuityAmount =
					paymentIntent.amount_details &&
					paymentIntent.amount_details.tip &&
					Number.isFinite(Number(paymentIntent.amount_details.tip.amount))
						? Math.max(
								0,
								Math.round(Number(paymentIntent.amount_details.tip.amount)),
							)
						: Math.max(
								0,
								amountReceived -
									Number(metadata.subtotal || 0) -
									Number(metadata.taxAmount || 0),
							);
				await db
					.collection("terminal_payments")
					.doc(paymentIntent.id)
					.set(
						{
							status: "succeeded",
							paymentStatus: "paid",
							paymentIntentId: paymentIntent.id,
							stripePaymentIntentId: paymentIntent.id,
							stripeLatestChargeId: paymentIntent.latest_charge || null,
							stripePaymentMethodId,
							stripeApplicationFeeAmount,
							stripeFeeActual,
							stripeDestinationTransferId,
							amount: amountReceived,
							amountReceived,
							gratuityAmount,
							stripeEventId: event.id,
							paidAt: admin.firestore.FieldValue.serverTimestamp(),
							updatedAt: admin.firestore.FieldValue.serverTimestamp(),
						},
						{ merge: true },
					);
				break;
			}

			if (metadata.orderId) {
				await db
					.collection("pending_orders")
					.doc(metadata.orderId)
					.set(
						{
							status: "processing",
							paymentStatus: "paid",
							paymentIntentId: paymentIntent.id,
							stripePaymentIntentId: paymentIntent.id,
							stripeLatestChargeId: paymentIntent.latest_charge || null,
							stripePaymentMethodId,
							paymentMethodSummary: stripePaymentMethodSummary,
							stripeApplicationFeeAmount,
							stripeDestinationTransferId,
							stripeEventId: event.id,
							amountReceived:
								paymentIntent.amount_received || paymentIntent.amount || 0,
							updatedAt: admin.firestore.FieldValue.serverTimestamp(),
						},
						{ merge: true },
					);
			}

			await fulfillOrder({
				orderId: metadata.orderId,
				paymentType: metadata.type || "party",
				userId: metadata.userId || paymentIntent.customer || null,
				restaurantId: metadata.restaurantId,
				processor: "stripe",
				processorTransactionId: paymentIntent.id,
				totalPrice: paymentIntent.amount_received || paymentIntent.amount,
				processorFeeActual: stripeFeeActual,
				platformFeeActual: Number(metadata.platformFee || 0),
				applicationFeeActual: stripeApplicationFeeAmount,
				stripeInstance,
				latestChargeId: paymentIntent.latest_charge || null,
				stripeDestinationTransferId,
				stripePaymentMethodId,
				paymentMethodSummary: stripePaymentMethodSummary,
			});
			break;

		case "account.updated":
			const account = event.data.object;
			const accountId = account.id;

			// --- THIS IS THE FIX ---
			// We add detailed logs to trace the entire process.
			console.log(
				`[Webhook Log] 1. Received 'account.updated' for Stripe Account: ${accountId}`,
			);

			const isOnboarded = account.charges_enabled && account.details_submitted;
			const newStatus = isOnboarded ? "verified" : "pending";

			console.log(
				`[Webhook Log] 2. Determined onboarding status. charges_enabled: ${account.charges_enabled}, details_submitted: ${account.details_submitted}. New status will be: ${newStatus}`,
			);

			try {
				const restaurantsRef = db.collection("restaurants");
				const q = restaurantsRef
					.where("stripeAccountId", "==", accountId)
					.limit(1);

				console.log(
					`[Webhook Log] 3. Querying Firestore for restaurant with stripeAccountId: ${accountId}`,
				);
				const snapshot = await q.get();

				if (snapshot.empty) {
					console.error(
						`[Webhook Log] 4. CRITICAL: No matching restaurant found for Stripe account ${accountId}. Aborting update.`,
					);
					return; // Stop processing
				}

				const restaurantDoc = snapshot.docs[0];
				const restaurantRef = restaurantDoc.ref;
				console.log(
					`[Webhook Log] 4. Found matching restaurant document: ${restaurantRef.id}`,
				);

				await restaurantRef.update({
					stripeAccountStatus: newStatus,
					onboardingStatus: isOnboarded ? "pending_menu" : "pending_stripe",
				});

				console.log(
					`[Webhook Log] 5. ✅ Successfully updated restaurant ${restaurantRef.id} with Stripe status: ${newStatus}`,
				);
			} catch (error) {
				console.error(
					`[Webhook Log] 5. CRITICAL ERROR while updating restaurant for Stripe account ${accountId}:`,
					error,
				);
			}
			break;

		case "payment_intent.payment_failed":
			// ... (Your existing logic for handling payment failures for both types) ...
			break;

		default:
			console.log(`⚠️ Unhandled event type: ${event.type}`);
	}
};

/**
 * @function preparePayment
 * @description A consolidated and secure HTTPS Callable function to prepare a Stripe Payment Intent.
 * It uses the /baskets collection as the source of truth for item pricing to correctly handle discounts.
 *
 * @param {object} data The data object from the client.
 * @param {string} data.paymentType - The type of payment, either 'individual' or 'party'.
 * @param {string} data.restaurantId - The ID of the restaurant being paid.
 * @param {string} data.stripeCustomerId - The customer's Stripe ID.
 * @param {Array<object>} data.items - An array of objects, each containing the 'id' of a document in the /baskets collection.
 * @param {number} data.gratuity - The gratuity amount in cents.
 * @param {string} data.checkInId - The ID of the user's check-in document.
 * @param {string} [data.partyId] - The ID of the party, if applicable.
 * @param {object} context The Firebase Functions context object containing auth information.
 * @returns {Promise<object>} An object containing the necessary secrets for the Stripe Payment Sheet.
 */
/**
 * @function preparePayment
 * @description A consolidated and secure HTTPS Callable function to prepare a Stripe Payment Intent.
 * It uses the /baskets collection as the source of truth for item pricing to correctly handle discounts.
 * Now configured for Merchant of Record (Global Scerv Account) and Card Vaulting.
 */
exports.preparePayment = functions
	.runWith({
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		// 1. ============== AUTHENTICATION & VALIDATION ==============
		if (!context.auth) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"The function must be called while authenticated.",
			);
		}
		const userId = context.auth.uid;

		const {
			paymentType,
			restaurantId,
			items,
			gratuity,
			taxAmount,
			platformFee,
			expectedTotal,
			checkInId,
			partyId,
			table,
			server,
			checkInTimestamp,
			orderMode,
			fulfillmentType,
			payingForUserId,
			payingForUserIds,
		} = data;

		if (
			!paymentType ||
			!restaurantId ||
			!Array.isArray(items) ||
			items.length === 0 ||
			typeof gratuity !== "number"
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"The function was called with missing or invalid data.",
			);
		}

		try {
			const restaurantDoc = await db
				.collection("restaurants")
				.doc(restaurantId)
				.get();

			if (!restaurantDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Restaurant not found.",
				);
			}

			const restaurantData = restaurantDoc.data() || {};
			const restaurantCountry =
				restaurantData.countryCode || restaurantData.country || null;

			if (!isUsRestaurantCountry(restaurantCountry)) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Stripe checkout is only enabled for US restaurants in this flow.",
				);
			}

			const restaurantStripeAccountId = restaurantData.stripeAccountId || null;
			const restaurantStripeReady =
				restaurantStripeAccountId &&
				(restaurantData.stripeAccountStatus === "verified" ||
					restaurantData.stripeChargesEnabled === true);

			if (!restaurantStripeReady) {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"This restaurant has not completed Stripe payout onboarding yet.",
				);
			}

			// 2. ============== STRIPE INITIALIZATION & CUSTOMER FETCH ==============
			const keys = await getStripeKeys(restaurantId);
			const stripeInstance = require("stripe")(keys.stripeSecretKey, {
				apiVersion: "2024-04-10",
			});

			const userDoc = await db.collection("customers").doc(userId).get();
			if (!userDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Customer profile not found.",
				);
			}

			const isTestMode = keys.stripeSecretKey.includes("_test_");
			const customerIdField = isTestMode
				? "stripeCustomerId_test"
				: "stripeCustomerId_live";
			const userData = userDoc.data();
			let stripeCustomerId = userData && userData[customerIdField];

			// If no customer exists on Scerv's global account, create one now.
			if (!stripeCustomerId) {
				stripeCustomerId = await createStripeCustomerHelper(
					userId,
					restaurantId,
					stripeInstance,
				);
			}

			// 3. ============== FETCH BASKET ITEMS DYNAMICALLY ==============
			let itemsToProcess = [];
			let isUserVerifiedForParty = false;
			let paidForOwnerIds = [userId];

			const isSharedBasketPayment =
				paymentType === "party" || paymentType === "pickup";

			if (isSharedBasketPayment) {
				if (!partyId) {
					throw new functions.https.HttpsError(
						"invalid-argument",
						"Party ID is required.",
					);
				}

				const partyDoc = await db.collection("parties").doc(partyId).get();
				if (!partyDoc.exists) {
					throw new functions.https.HttpsError(
						"not-found",
						`Party ${partyId} not found.`,
					);
				}

				const partyData = partyDoc.data();
				const memberIds = (partyData.guestPips || [])
					.map((p) => p.userId)
					.filter(Boolean);
				const billableMemberIds = (partyData.guestPips || [])
					.map((p) => p.userId || p.localPipId || p.id)
					.filter(Boolean);
				const requestedOwnerIds = Array.isArray(payingForUserIds)
					? payingForUserIds
					: [payingForUserId || userId];
				const targetOwnerIds = [
					...new Set(
						requestedOwnerIds
							.map((id) => (id === undefined || id === null ? "" : String(id)))
							.filter(Boolean),
					),
				];

				if (memberIds.includes(userId)) {
					isUserVerifiedForParty = true;
				} else {
					throw new functions.https.HttpsError(
						"permission-denied",
						"User is not a member of this party.",
					);
				}

				if (targetOwnerIds.length === 0) {
					throw new functions.https.HttpsError(
						"invalid-argument",
						"At least one party member must be selected for payment.",
					);
				}

				const invalidTargetOwnerId = targetOwnerIds.find(
					(ownerId) => !billableMemberIds.includes(ownerId),
				);
				if (invalidTargetOwnerId) {
					throw new functions.https.HttpsError(
						"permission-denied",
						"Selected party member is not part of this party.",
					);
				}
				paidForOwnerIds = targetOwnerIds;

				const sharedBasketId = partyDoc.data().sharedBasketId;
				if (!sharedBasketId) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						`Party ${partyId} is missing a sharedBasketId.`,
					);
				}

				const sharedBasketDoc = await db
					.collection("shared_baskets")
					.doc(sharedBasketId)
					.get();
				if (!sharedBasketDoc.exists) {
					throw new functions.https.HttpsError(
						"not-found",
						"Shared basket not found.",
					);
				}

				const allItemsInBasket = sharedBasketDoc.data().items || [];
				const clientItemIds = new Set(items.map((item) => item.id));
				const targetOwnerIdSet = new Set(targetOwnerIds);
				itemsToProcess = allItemsInBasket.filter(
					(itemInDb) => {
						const itemOwnerId =
							itemInDb.orderedByUserId ||
							itemInDb.userId ||
							itemInDb.addedByUserId ||
							null;
						return (
							clientItemIds.has(itemInDb.id) &&
							targetOwnerIdSet.has(itemOwnerId)
						);
					},
				);
			} else {
				// 'individual' checkout
				const basketPromises = items.map((item) =>
					db.collection("baskets").doc(item.id).get(),
				);
				const fetchedBasketDocs = await Promise.all(basketPromises);
				itemsToProcess = fetchedBasketDocs
					.map((doc) => {
						if (!doc.exists) return null;
						return { id: doc.id, ...doc.data() };
					})
					.filter(Boolean);
			}

			if (itemsToProcess.length === 0) {
				console.warn("[preparePayment] No shared basket items matched payment.", {
					paymentType,
					partyId: partyId || null,
					restaurantId,
					userId,
					paidForOwnerIds,
					requestedItemIds: items.map((item) => item.id),
				});
				throw new functions.https.HttpsError(
					"not-found",
					"No valid basket items were found for this payment.",
				);
			}

			const basketId = itemsToProcess[0].id;

			if (!basketId) {
				throw new functions.https.HttpsError(
					"not-found",
					"No valid basket found.",
				);
			}

			// 4. ============== CALCULATE SERVER-AUTHORITATIVE TOTALS ==============
			const restaurantTierInfo = await getRestaurantTier(restaurantId);
			const paymentPolicy = resolvePaymentPolicy({
				restaurantData,
				customerData: userData,
				restaurantTierInfo,
			});
			const scervFeePercentage = paymentPolicy.scervFeePercentage;
			const restaurantTaxRate = normalizePercentage(restaurantData.taxRate, 0);
			let calculatedSubtotal = 0;
			let calculatedTax = 0;
			const fullItemDetails = [];

			itemsToProcess.forEach((basketData) => {
				let isSecure = false;

				if (isSharedBasketPayment && isUserVerifiedForParty) {
					isSecure = basketData.restaurantId === restaurantId;
				} else {
					isSecure =
						basketData.restaurantId === restaurantId &&
						basketData.userId === userId;
				}

				if (!isSecure) {
					console.warn(`Security check failed for an item. Skipping.`);
					return;
				}
				const price =
					basketData.discountedPrice !== undefined &&
					basketData.discountedPrice !== null
						? basketData.discountedPrice
						: basketData.price !== undefined && basketData.price !== null
							? basketData.price
							: (basketData.dish && basketData.dish.price) || 0;
				const priceInCents = Math.round(price * 100);
				const quantity = basketData.quantity || 1;
				const lineSubtotal = priceInCents * quantity;
				const lineTax = Math.round(lineSubtotal * restaurantTaxRate);
				const itemDetails = {
					...basketData,
					price: priceInCents,
					quantity,
					lineSubtotal,
					taxRate: restaurantTaxRate,
					taxAmount: lineTax,
				};
				delete itemDetails.itbmsRate;
				delete itemDetails.itbmsCode;
				calculatedSubtotal += lineSubtotal;
				calculatedTax += lineTax;
				fullItemDetails.push(itemDetails);
			});

			if (calculatedSubtotal <= 0) {
				console.warn("[preparePayment] Payment subtotal was not positive.", {
					paymentType,
					partyId: partyId || null,
					restaurantId,
					userId,
					itemsToProcess: itemsToProcess.length,
					fullItemDetails: fullItemDetails.length,
				});
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Cannot process a payment with a zero or negative subtotal.",
				);
			}

			const gratuityPassthroughAmount = gratuity;
			const restaurantSalesAndTaxAmount = calculatedSubtotal + calculatedTax;
			const restaurantGrossAmount =
				restaurantSalesAndTaxAmount + gratuityPassthroughAmount;
			const scervFeeBasisAmount = restaurantSalesAndTaxAmount;
			const calculatedPlatformFee = calculatePercentageFee(
				scervFeeBasisAmount,
				scervFeePercentage,
			);
			const finalAmount = restaurantGrossAmount + calculatedPlatformFee;
			const restaurantPaysStripeFee =
				paymentPolicy.stripeFeeResponsibility === "restaurant";
			const restaurantProcessingFeeBasisAmount =
				paymentPolicy.restaurantProcessingFeeBasis === "subtotal"
					? calculatedSubtotal
					: paymentPolicy.restaurantProcessingFeeBasis === "salesAndTax"
						? restaurantSalesAndTaxAmount
						: restaurantGrossAmount;
			const processorFeeRecoveryAmount = restaurantPaysStripeFee
				? calculatePercentageFee(
						restaurantProcessingFeeBasisAmount,
						paymentPolicy.restaurantProcessingFeePercentage,
						paymentPolicy.restaurantProcessingFeeFixedCents,
					)
				: 0;
			const applicationFeeAmount = Math.min(
				finalAmount,
				calculatedPlatformFee + processorFeeRecoveryAmount,
			);
			const restaurantTransferAmount = Math.max(
				0,
				finalAmount - applicationFeeAmount,
			);
			const clientExpectedTotal = Number(expectedTotal || 0);

			if (
				clientExpectedTotal > 0 &&
				Math.abs(clientExpectedTotal - finalAmount) > 1
			) {
				console.error("[preparePayment] Client/server total mismatch", {
					orderTotalFromClient: clientExpectedTotal,
					serverTotal: finalAmount,
					clientTaxAmount: taxAmount,
					serverTaxAmount: calculatedTax,
					clientPlatformFee: platformFee,
					serverPlatformFee: calculatedPlatformFee,
					serverSubtotal: calculatedSubtotal,
					serverScervFeePercentage: scervFeePercentage,
					scervFeeWaived: paymentPolicy.scervFeeWaived,
					feeWaiverReason: paymentPolicy.feeWaiverReason,
					customerPolicySnapshot: paymentPolicy.customerPolicySnapshot,
					restaurantPolicySnapshot: paymentPolicy.restaurantPolicySnapshot,
					restaurantId,
					userId,
					paidForOwnerIds,
					requestedItemIds: items.map((item) => item.id),
					serverItems: fullItemDetails.map((item) => ({
						id: item.id,
						name: item.dishName || item.name || null,
						price: item.price,
						discountedPrice: item.discountedPrice,
						quantity: item.quantity,
						lineSubtotal: item.lineSubtotal,
						taxAmount: item.taxAmount,
					})),
				});
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Payment total changed before checkout. Please review the total and try again.",
				);
			}

			// 5. ============== CREATE PENDING ORDER ==============
			const pendingOrderRef = db.collection("pending_orders").doc();
			const newOrderId = pendingOrderRef.id;

			await pendingOrderRef.set({
				restaurantId,
				customerId: userId,
				customerEmail: userData.email || context.auth.token.email || null,
				customerName:
					userData.fullName ||
					`${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
					null,
				stripeCustomerId: stripeCustomerId, // Store this for reference
				checkInId,
				paymentType,
				paymentProcessor: "stripe",
				paymentProvider: "stripe",
				currency: "usd",
				restaurantCountry,
				connectedAccountId: restaurantStripeAccountId,
				payoutRouting: restaurantData.payoutMethod || "stripe_connect",
				restaurantStripeAccountStatus:
					restaurantData.stripeAccountStatus || null,
				pricingTier: paymentPolicy.pricingTier,
				payoutPercentage: restaurantTierInfo.payoutPercentage,
				scervFeePercentage,
				baseScervFeePercentage: paymentPolicy.baseScervFeePercentage,
				scervFeeBasis: paymentPolicy.scervFeeBasis,
				scervFeeBasisAmount,
				scervFeeWaived: paymentPolicy.scervFeeWaived,
				feeWaiverReason: paymentPolicy.feeWaiverReason,
				stripeFeeResponsibility: paymentPolicy.stripeFeeResponsibility,
				savePaymentMethod: true,
				savedPaymentMethodBehavior: "payment_intent_setup_future_usage",
				payerUserId: userId,
				paidForUserIds: isSharedBasketPayment ? paidForOwnerIds : [userId],
				paymentPolicy: sanitizeFirestoreValue(paymentPolicy),
				restaurantTaxRate,
				items: sanitizeFirestoreValue(fullItemDetails),
				subtotal: calculatedSubtotal,
				taxAmount: calculatedTax,
				gratuity,
				gratuityPassthroughAmount,
				restaurantSalesAndTaxAmount,
				restaurantGrossAmount,
				platformFee: calculatedPlatformFee,
				scervFee: calculatedPlatformFee,
				processorFeeRecoveryAmount,
				restaurantProcessingFeeAmount: processorFeeRecoveryAmount,
				restaurantProcessingFeePercentage:
					paymentPolicy.restaurantProcessingFeePercentage,
				restaurantProcessingFeeFixedCents:
					paymentPolicy.restaurantProcessingFeeFixedCents,
				restaurantProcessingFeeBasis:
					paymentPolicy.restaurantProcessingFeeBasis,
				restaurantProcessingFeeBasisAmount,
				applicationFeeAmount,
				stripeApplicationFeeAmount: applicationFeeAmount,
				stripeConnectChargeType: "destination_charge",
				restaurantTransferAmount,
				clientExpectedTotal: clientExpectedTotal || null,
				total: finalAmount,
				totalPrice: finalAmount,
				status: "pending_payment",
				paymentStatus: "pending",
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				table: sanitizeFirestoreValue(table || null),
				server: sanitizeFirestoreValue(server || null),
				checkInTimestamp: checkInTimestamp || null,
				orderMode:
					orderMode || (paymentType === "pickup" ? "pickup" : "dineIn"),
				fulfillmentType:
					fulfillmentType ||
					(paymentType === "pickup" ? "hotel_pickup" : "table"),
				type: paymentType,
				paymentTrace: sanitizeFirestoreValue({
					initiatedBy: userId,
					initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
					source: "mobile_party_checkout",
					processor: "stripe",
					mode: keys.isTestMode ? "test" : "live",
					pricingTier: paymentPolicy.pricingTier,
					scervFeeBasis: paymentPolicy.scervFeeBasis,
					scervFeeBasisAmount,
					scervFeePercentage,
					baseScervFeePercentage: paymentPolicy.baseScervFeePercentage,
					gratuityPassthroughAmount,
					restaurantSalesAndTaxAmount,
					restaurantGrossAmount,
					processorFeeRecoveryAmount,
					restaurantProcessingFeeAmount: processorFeeRecoveryAmount,
					restaurantProcessingFeePercentage:
						paymentPolicy.restaurantProcessingFeePercentage,
					restaurantProcessingFeeFixedCents:
						paymentPolicy.restaurantProcessingFeeFixedCents,
					restaurantProcessingFeeBasis:
						paymentPolicy.restaurantProcessingFeeBasis,
					restaurantProcessingFeeBasisAmount,
					stripeApplicationFeeAmount: applicationFeeAmount,
					stripeConnectChargeType: "destination_charge",
					scervFeeWaived: paymentPolicy.scervFeeWaived,
					feeWaiverReason: paymentPolicy.feeWaiverReason,
					stripeFeeResponsibility: paymentPolicy.stripeFeeResponsibility,
					savePaymentMethod: true,
					savedPaymentMethodBehavior: "payment_intent_setup_future_usage",
					payerUserId: userId,
					paidForUserIds: isSharedBasketPayment ? paidForOwnerIds : [userId],
					restaurantTaxRate,
					itemIds: fullItemDetails.map((item) => item.id),
				}),
				...(isSharedBasketPayment && { partyId }),
			});

			// 6. ============== STRIPE INTENTS & KEYS ==============
			let ephemeralKey;
			try {
				ephemeralKey = await stripeInstance.ephemeralKeys.create(
					{ customer: stripeCustomerId },
					{ apiVersion: "2024-04-10" },
				);
			} catch (err) {
				// If the customer was deleted in Stripe but still exists in Firestore, recreate them.
				if (err.code === "resource_missing") {
					stripeCustomerId = await createStripeCustomerHelper(
						userId,
						restaurantId,
						stripeInstance,
					);
					ephemeralKey = await stripeInstance.ephemeralKeys.create(
						{ customer: stripeCustomerId },
						{ apiVersion: "2024-04-10" },
					);
					// Update pending order with the newly generated ID
					await pendingOrderRef.update({ stripeCustomerId });
				} else {
					throw err;
				}
			}

			const paymentIntent = await stripeInstance.paymentIntents.create(
				{
					amount: finalAmount,
					currency: "usd",
					customer: stripeCustomerId,
					receipt_email:
						userData.email || context.auth.token.email || undefined,
					description: `Scerv ${paymentType} order ${newOrderId}`,
					// --- THIS IS THE CRITICAL LINE FOR CARD VAULTING ---
					setup_future_usage: "off_session",
					automatic_payment_methods: { enabled: true },
					...(applicationFeeAmount > 0 && {
						application_fee_amount: applicationFeeAmount,
					}),
					transfer_data: {
						destination: restaurantStripeAccountId,
					},
					on_behalf_of: restaurantStripeAccountId,
					metadata: {
						orderId: newOrderId,
						userId,
						payerUserId: userId,
						paidForUserIds: isSharedBasketPayment
							? paidForOwnerIds.join(",")
							: String(userId),
						restaurantId,
						type: paymentType,
						partyId: partyId || "",
						checkInId: checkInId || "",
						orderMode:
							orderMode || (paymentType === "pickup" ? "pickup" : "dineIn"),
						fulfillmentType:
							fulfillmentType ||
							(paymentType === "pickup" ? "hotel_pickup" : "table"),
						subtotal: String(calculatedSubtotal),
						taxAmount: String(calculatedTax),
						gratuity: String(gratuity),
						gratuityPassthroughAmount: String(gratuityPassthroughAmount),
						restaurantSalesAndTaxAmount: String(restaurantSalesAndTaxAmount),
						restaurantGrossAmount: String(restaurantGrossAmount),
						platformFee: String(calculatedPlatformFee),
						processorFeeRecoveryAmount: String(processorFeeRecoveryAmount),
						restaurantProcessingFeeAmount: String(processorFeeRecoveryAmount),
						restaurantProcessingFeePercentage: String(
							paymentPolicy.restaurantProcessingFeePercentage,
						),
						restaurantProcessingFeeBasis:
							paymentPolicy.restaurantProcessingFeeBasis,
						restaurantProcessingFeeBasisAmount: String(
							restaurantProcessingFeeBasisAmount,
						),
						stripeApplicationFeeAmount: String(applicationFeeAmount),
						stripeConnectChargeType: "destination_charge",
						restaurantTransferAmount: String(restaurantTransferAmount),
						pricingTier: paymentPolicy.pricingTier,
						scervFeeBasis: paymentPolicy.scervFeeBasis,
						scervFeePercentage: String(scervFeePercentage),
						scervFeeWaived: String(paymentPolicy.scervFeeWaived),
						stripeFeeResponsibility: paymentPolicy.stripeFeeResponsibility,
						savePaymentMethod: "true",
						setupFutureUsage: "off_session",
						total: String(finalAmount),
					},
				},
				{
					idempotencyKey: `preparePayment:${newOrderId}`,
				},
			);

			await pendingOrderRef.update({
				paymentIntentId: paymentIntent.id,
				stripePaymentIntentId: paymentIntent.id,
				stripeClientSecretCreatedAt:
					admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			// 7. ============== RETURN SECRETS TO REACT NATIVE ==============
			return {
				paymentIntentClientSecret: paymentIntent.client_secret,
				ephemeralKeySecret: ephemeralKey.secret,
				customerId: stripeCustomerId,
				publishableKey: keys.publishableKey,
				basketId: basketId,
				total: finalAmount,
				subtotal: calculatedSubtotal,
				taxAmount: calculatedTax,
				gratuity,
				platformFee: calculatedPlatformFee,
				paidForUserIds: isSharedBasketPayment ? paidForOwnerIds : [userId],
			};
		} catch (error) {
			console.error("Error in preparePayment:", error);
			throw toPreparePaymentHttpsError(error);
		}
	});

/**
 * Creates a kitchen_orders ticket for a paid pickup order.
 * Safe to call repeatedly: uses orderId as the kitchen order doc id.
 */
const createKitchenOrderForPaidPickup = async ({
	orderId,
	restaurantId,
	partyId = null,
	items = [],
	fulfillmentType = "hotel_pickup",
	locationName = "Hotel Pickup",
	customerName = "",
	customerEmail = "",
	pickupSpecialInstructions = "",
}) => {
	if (!orderId || !restaurantId) {
		throw new Error(
			`[PickupKitchenOrder] Missing orderId or restaurantId. orderId=${orderId}, restaurantId=${restaurantId}`,
		);
	}

	const kitchenOrderRef = db.collection("kitchen_orders").doc(orderId);
	const existingSnap = await kitchenOrderRef.get();

	// Idempotency: if it already exists, do nothing
	if (existingSnap.exists) {
		console.log(
			`[PickupKitchenOrder] kitchen_orders/${orderId} already exists. Skipping.`,
		);
		return;
	}

	let hasKitchen = false;
	let hasBar = false;

	const normalizedItems = (items || []).map((item, index) => {
		const category = item.category || "Other";
		const destination = isBarCategory(category) ? "bar" : "kitchen";

		const selectedModifiers = Array.isArray(item.selectedModifiers)
			? item.selectedModifiers
			: [];

		const kitchenModifiers = [];
		const barModifiers = [];

		selectedModifiers.forEach((modifier) => {
			const modifierCategory = modifier.category || "Extras";
			const normalizedModifier = {
				optionId: modifier.optionId || null,
				groupId: modifier.groupId || null,
				groupName: modifier.groupName || "",
				name: getModifierDisplayName(modifier),
				price:
					modifier.price !== undefined && modifier.price !== null
						? Number(modifier.price)
						: 0,
				category: modifierCategory,
			};

			if (isBarCategory(modifierCategory)) {
				barModifiers.push(normalizedModifier);
			} else {
				kitchenModifiers.push(normalizedModifier);
			}
		});

		if (destination === "kitchen") hasKitchen = true;
		if (destination === "bar") hasBar = true;

		if (kitchenModifiers.length > 0) hasKitchen = true;
		if (barModifiers.length > 0) hasBar = true;

		return {
			id: item.id || `item_${index}`,
			dishName: item.dishName || item.name || "Unknown Item",
			quantity: item.quantity || 1,
			specialInstructions: item.specialInstructions || "",
			orderedFor:
				item.orderedFor ||
				item.orderedByPipName ||
				item.customerName ||
				"Guest",
			destination,
			selectedModifiers: selectedModifiers,
			kitchenModifiers: kitchenModifiers,
			barModifiers: barModifiers,
		};
	});

	console.log(
		"[PICKUP KITCHEN MODIFIER DEBUG]",
		JSON.stringify(normalizedItems, null, 2),
	);
	const initialStationStatuses = {};
	if (hasKitchen) initialStationStatuses.kitchen = "new";
	if (hasBar) initialStationStatuses.bar = "new";

	const kitchenOrderData = {
		restaurantId,
		orderId,
		partyId,

		table: {
			id: "hotel_pickup",
			name: locationName,
		},

		server: {
			id: "pickup_queue",
			name: "Pickup Queue",
		},

		// ✅ ADD THESE (CRITICAL)
		customerName: customerName || "Pickup Guest",
		customerEmail: customerEmail || null,
		pickupSpecialInstructions: pickupSpecialInstructions || "",

		items: normalizedItems,

		stationStatuses: initialStationStatuses,
		overallStatus: "active",
		status: "new",
		fulfillmentType,
		orderMode: "pickup",
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
		restaurantId,
		orderId,
		partyId,
		table: {
			id: "hotel_pickup",
			name: locationName,
		},
		server: {
			id: "pickup_queue",
			name: "Pickup Queue",
		},

		customerName: customerName || "Pickup Guest",
		customerEmail: customerEmail || null,
		pickupSpecialInstructions: pickupSpecialInstructions || "",

		items: normalizedItems,
		stationStatuses: initialStationStatuses,
		overallStatus: "active",
		status: "new",
		fulfillmentType,
		orderMode: "pickup",
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
	};

	await kitchenOrderRef.set(kitchenOrderData);

	console.log(
		`[PickupKitchenOrder] Created kitchen_orders/${orderId} for paid pickup.`,
	);
};

/**
 * @function fulfillOrder
 * @description A consolidated, robust, and GATEWAY-AGNOSTIC function to process a successful payment.
 */
/**
 * @function fulfillOrder
 * @description A consolidated, robust, and gateway-agnostic function to process a successful payment.
 * Safely handles dine-in party orders, pickup orders, and individual orders with idempotent cleanup.
 */
const fulfillOrder = async ({
	orderId,
	paymentType,
	userId,
	customerEmail = null,
	customerName = null,
	restaurantId,
	processor,
	processorTransactionId,
	totalPrice,
	processorFeeActual,
	platformFeeActual = 0,
	applicationFeeActual = 0,
	stripeInstance = null,
	latestChargeId = null,
	stripeDestinationTransferId = null,
	stripePaymentMethodId = null,
	paymentMethodSummary = null,
}) => {
	if (!orderId || !paymentType) {
		console.error(
			`[Fulfill] Critical: Missing orderId or paymentType for ${processorTransactionId}.`,
		);
		return;
	}

	console.log(
		`[Fulfill] Fulfilling ${paymentType} order ${orderId} via ${String(
			processor || "unknown",
		).toUpperCase()}.`,
	);

	const pendingOrderRef = db.collection("pending_orders").doc(orderId);
	const pendingOrderSnap = await pendingOrderRef.get();

	// Idempotency guard: already fulfilled or missing pending order
	if (!pendingOrderSnap.exists) {
		console.log(
			`[Fulfill] Idempotency check: Pending order ${orderId} already processed or missing.`,
		);
		return;
	}

	const pendingOrderData = pendingOrderSnap.data() || {};

	if (
		pendingOrderData.status === "fulfilled" ||
		pendingOrderData.fulfilledOrderId
	) {
		console.log(
			`[Fulfill] Idempotency check: Pending order ${orderId} already fulfilled.`,
		);
		return;
	}

	// Defensive normalization
	const normalizedRestaurantId =
		restaurantId || pendingOrderData.restaurantId || null;

	if (!normalizedRestaurantId) {
		throw new Error(
			`[Fulfill] Cannot fulfill order ${orderId}: missing restaurantId.`,
		);
	}

	const isPickupOrder =
		pendingOrderData.orderMode === "pickup" ||
		pendingOrderData.fulfillmentType === "hotel_pickup" ||
		pendingOrderData.type === "pickup";

	const readableOrderId = await generateOrderId(normalizedRestaurantId);

	const restaurantDoc = await db
		.collection("restaurants")
		.doc(normalizedRestaurantId)
		.get();

	if (!restaurantDoc.exists) {
		throw new Error(
			`[Fulfill] Restaurant ${normalizedRestaurantId} not found for order ${orderId}.`,
		);
	}

	const restaurantData = restaurantDoc.data() || {};
	const payoutRouting = restaurantData.payoutMethod || "stripe_connect";

	// Monetary normalization
	const subtotal = Number(pendingOrderData.subtotal) || 0;
	const gratuity = Number(pendingOrderData.gratuity) || 0;
	const platformFee = Number(
		platformFeeActual || pendingOrderData.platformFee || 0,
	);
	const processorFee = Number(processorFeeActual || 0);
	const stripeConnectChargeType =
		pendingOrderData.stripeConnectChargeType || "separate_charge_transfer";
	const usesDestinationCharge = stripeConnectChargeType === "destination_charge";
	const paymentPolicy = pendingOrderData.paymentPolicy || {};
	const applicationFeeAmount = Number(
		applicationFeeActual ||
			pendingOrderData.stripeApplicationFeeAmount ||
			pendingOrderData.applicationFeeAmount ||
			0,
	);
	const processorFeeRecoveryAmount = Number(
		pendingOrderData.processorFeeRecoveryAmount ||
			pendingOrderData.restaurantProcessingFeeAmount ||
			0,
	);
	const restaurantProcessingFeeBasis =
		pendingOrderData.restaurantProcessingFeeBasis ||
		paymentPolicy.restaurantProcessingFeeBasis ||
		null;
	const restaurantProcessingFeeBasisAmount = Number(
		pendingOrderData.restaurantProcessingFeeBasisAmount || 0,
	);
	const taxAmount = Number(
		pendingOrderData.taxAmount || pendingOrderData.tax || 0,
	);
	const normalizedTotalPrice = Number(
		totalPrice || pendingOrderData.totalPrice || 0,
	);

	const restaurantTierInfo = await getRestaurantTier(normalizedRestaurantId);
	const payoutPercentage = normalizePercentage(
		pendingOrderData.payoutPercentage || restaurantTierInfo.payoutPercentage,
		0.97,
	);
	const scervFeePercentage = normalizePercentage(
		pendingOrderData.scervFeePercentage || restaurantTierInfo.scervFeePercentage,
		0.03,
	);
	const stripeFeeResponsibility = normalizeStripeFeeResponsibility(
		pendingOrderData.stripeFeeResponsibility ||
			paymentPolicy.stripeFeeResponsibility,
	);
	const gratuityPassthroughAmount = gratuity;
	const restaurantSalesAndTaxAmount = subtotal + taxAmount;
	const calculatedRestaurantGross =
		restaurantSalesAndTaxAmount + gratuityPassthroughAmount;
	const restaurantGrossAmount = Number(
		pendingOrderData.restaurantGrossAmount ||
			calculatedRestaurantGross,
	);
	const restaurantPaysStripeFee = stripeFeeResponsibility === "restaurant";
	const processorFeeAppliedToRestaurantSales = restaurantPaysStripeFee
		? Math.min(
				processorFeeRecoveryAmount || processorFee,
				restaurantSalesAndTaxAmount,
			)
		: 0;
	const restaurantSalesAndTaxNetAmount = Math.max(
		0,
		restaurantSalesAndTaxAmount - processorFeeAppliedToRestaurantSales,
	);
	const calculatedAmountToTransfer = Math.max(
		0,
		restaurantSalesAndTaxNetAmount + gratuityPassthroughAmount,
	);
	const amountToTransfer = usesDestinationCharge
		? Math.max(
				0,
				Number(pendingOrderData.restaurantTransferAmount || 0) ||
					(Number(totalPrice || pendingOrderData.totalPrice || 0) -
						applicationFeeAmount),
			)
		: calculatedAmountToTransfer;
	const scervGrossFee = platformFee;
	const scervNet = usesDestinationCharge
		? applicationFeeAmount - processorFee
		: scervGrossFee - (restaurantPaysStripeFee ? 0 : processorFee);

	let turnaroundTimeMinutes = 0;
	try {
		if (pendingOrderData.createdAt.toDate) {
			const openedAtMs = pendingOrderData.createdAt.toDate().getTime();
			turnaroundTimeMinutes = Math.max(
				0,
				Math.round((Date.now() - openedAtMs) / 60000),
			);
		}
	} catch (e) {
		console.warn(
			`[Fulfill] Could not compute turnaroundTimeMinutes for ${orderId}:`,
			e,
		);
	}

	const resolvedCustomerId = pendingOrderData.customerId || userId || null;

	const resolvedCustomerEmail =
		pendingOrderData.customerEmail || customerEmail || null;

	const resolvedCustomerName =
		pendingOrderData.customerName || customerName || null;

	console.log("[Fulfill Customer Debug]", {
		orderId,
		pendingCustomerId: pendingOrderData.customerId || null,
		passedUserId: userId || null,
		resolvedCustomerId,
		pendingCustomerEmail: pendingOrderData.customerEmail || null,
		passedCustomerEmail: customerEmail || null,
		resolvedCustomerEmail,
		pendingCustomerName: pendingOrderData.customerName || null,
		passedCustomerName: customerName || null,
		resolvedCustomerName,
	});

	const finalOrderData = {
		id: orderId,
		readableOrderId,
		partyId: pendingOrderData.partyId || null,
		restaurantId: normalizedRestaurantId,
		restaurantName:
			restaurantData.restaurantName || restaurantData.name || "Scerv Partner",
		workDayId:
			pendingOrderData.workDayId || restaurantData.currentWorkDayId || null,

		customerId: resolvedCustomerId,
		customerEmail: resolvedCustomerEmail,
		customerName: resolvedCustomerName,

		table: pendingOrderData.table || null,
		server: pendingOrderData.server || null,

		subtotal,
		taxAmount,
		gratuityAmount: gratuity,
		gratuityPassthroughAmount,
		restaurantSalesAndTaxAmount,
		restaurantSalesAndTaxNetAmount,
		processorFeeAppliedToRestaurantSales,
		processorFeeRecoveryAmount,
		platformFee,
		scervFee: platformFee,
		scervFeePercentage,
		scervFeeBasis: pendingOrderData.scervFeeBasis || "sales_and_tax",
		baseScervFeePercentage:
			pendingOrderData.baseScervFeePercentage || scervFeePercentage,
		scervFeeWaived: pendingOrderData.scervFeeWaived === true,
		feeWaiverReason: pendingOrderData.feeWaiverReason || null,
		stripeFeeResponsibility,
		restaurantProcessingFeeAmount: processorFeeRecoveryAmount,
		restaurantProcessingFeePercentage:
			pendingOrderData.restaurantProcessingFeePercentage ||
			paymentPolicy.restaurantProcessingFeePercentage ||
			null,
		restaurantProcessingFeeBasis,
		restaurantProcessingFeeBasisAmount,
		applicationFeeAmount,
		stripeApplicationFeeAmount: applicationFeeAmount,
		stripeConnectChargeType,
		restaurantGrossAmount,
		restaurantTransferAmount: amountToTransfer,
		scervGrossFee,
		scervNet,
		payoutPercentage,
		pricingTier:
			pendingOrderData.pricingTier || restaurantTierInfo.tierName || null,
		processorFee,
		totalPrice: normalizedTotalPrice,

		openedAt:
			pendingOrderData.createdAt ||
			admin.firestore.FieldValue.serverTimestamp(),
		fulfilledAt: admin.firestore.FieldValue.serverTimestamp(),
		turnaroundTimeMinutes,

		items: pendingOrderData.items || [],
		sourcePendingOrderId: orderId,
		sourcePendingOrder: {
			status: pendingOrderData.status || null,
			type: pendingOrderData.type || null,
			paymentType: pendingOrderData.paymentType || null,
			orderMode: pendingOrderData.orderMode || null,
			fulfillmentType: pendingOrderData.fulfillmentType || null,
			createdAt: pendingOrderData.createdAt || null,
			itemIds: (pendingOrderData.items || []).map((item) => item.id),
		},

		paymentProcessor: processor || "unknown",
		paymentProcessorId: processorTransactionId || null,
		paymentProvider: processor || "unknown",
		paymentIntentId:
			pendingOrderData.paymentIntentId || processorTransactionId || null,
		stripePaymentIntentId:
			processor === "stripe"
				? processorTransactionId ||
					pendingOrderData.stripePaymentIntentId ||
					null
				: pendingOrderData.stripePaymentIntentId || null,
		stripeChargeId: latestChargeId || null,
		stripeDestinationTransferId: stripeDestinationTransferId || null,
		stripePaymentMethodId:
			stripePaymentMethodId || pendingOrderData.stripePaymentMethodId || null,
		paymentMethodSummary:
			paymentMethodSummary || pendingOrderData.paymentMethodSummary || null,
		paymentMethod: paymentType,
		paymentTender:
			processor === "stripe" ? "card" : pendingOrderData.paymentTender || null,
		paymentStatus: "paid",
		orderStatus: "confirmed",
		currency: pendingOrderData.currency || "usd",
		paymentTrace: {
			...(pendingOrderData.paymentTrace || {}),
			processor: processor || "unknown",
			processorTransactionId: processorTransactionId || null,
			latestChargeId: latestChargeId || null,
			stripeDestinationTransferId: stripeDestinationTransferId || null,
			stripePaymentMethodId:
				stripePaymentMethodId || pendingOrderData.stripePaymentMethodId || null,
			processorFeeActual: processorFee,
			platformFeeActual: platformFee,
			scervFee: platformFee,
			scervFeePercentage,
			scervFeeBasis: pendingOrderData.scervFeeBasis || "sales_and_tax",
			gratuityPassthroughAmount,
			restaurantSalesAndTaxAmount,
			restaurantSalesAndTaxNetAmount,
			processorFeeAppliedToRestaurantSales,
			processorFeeRecoveryAmount,
			stripeFeeResponsibility,
			restaurantProcessingFeeAmount: processorFeeRecoveryAmount,
			restaurantProcessingFeeBasis,
			restaurantProcessingFeeBasisAmount,
			applicationFeeAmount,
			stripeApplicationFeeAmount: applicationFeeAmount,
			stripeConnectChargeType,
			restaurantGrossAmount,
			restaurantTransferAmount: amountToTransfer,
			scervGrossFee,
			scervNet,
			fulfilledAt: admin.firestore.FieldValue.serverTimestamp(),
		},

		type: pendingOrderData.type || paymentType,
		orderMode:
			pendingOrderData.orderMode || (isPickupOrder ? "pickup" : "dineIn"),
		fulfillmentType:
			pendingOrderData.fulfillmentType ||
			(isPickupOrder ? "hotel_pickup" : "table"),
	};

	// 2. ATOMIC DATABASE TRANSACTION
	try {
		await db.runTransaction(async (t) => {
			const transactionalPendingOrderSnap = await t.get(pendingOrderRef);

			// Idempotency check inside transaction
			if (!transactionalPendingOrderSnap.exists) {
				console.log(
					`[Fulfill] Transaction idempotency: pending order ${orderId} no longer exists.`,
				);
				return;
			}

			const transactionalPendingOrderData =
				transactionalPendingOrderSnap.data() || {};

			if (
				transactionalPendingOrderData.status === "fulfilled" ||
				transactionalPendingOrderData.fulfilledOrderId
			) {
				console.log(
					`[Fulfill] Transaction idempotency: pending order ${orderId} already fulfilled.`,
				);
				return;
			}

			const transactionalIsPickupOrder =
				transactionalPendingOrderData.orderMode === "pickup" ||
				transactionalPendingOrderData.fulfillmentType === "hotel_pickup" ||
				transactionalPendingOrderData.type === "pickup";

			let partySnap = null;
			let basketSnap = null;
			let kitchenOrdersSnap = null;

			if (
				transactionalPendingOrderData.partyId &&
				(paymentType === "party" || transactionalIsPickupOrder)
			) {
				const partyRef = db
					.collection("parties")
					.doc(transactionalPendingOrderData.partyId);
				partySnap = await t.get(partyRef);

				const basketRef = db
					.collection("shared_baskets")
					.doc(transactionalPendingOrderData.partyId);
				basketSnap = await t.get(basketRef);

				const kitchenQuery = db
					.collection("kitchen_orders")
					.where("partyId", "==", transactionalPendingOrderData.partyId);
				kitchenOrdersSnap = await t.get(kitchenQuery);
			}

			// Create final order
			const finalOrderRef = db.collection("orders").doc(orderId);
			t.set(finalOrderRef, finalOrderData);

			const payerUserId =
				transactionalPendingOrderData.customerId || resolvedCustomerId || null;

			// Free the paying customer globally
			if (payerUserId && payerUserId !== "anonymous") {
				const customerRef = db.collection("customers").doc(payerUserId);

				t.set(
					customerRef,
					{
						activeCheckIn: null,
						activePartyId: null,
						activeRestaurantId: null,
						...(transactionalPendingOrderData.partyId && {
							partyIds: admin.firestore.FieldValue.arrayRemove(
								transactionalPendingOrderData.partyId,
							),
						}),
						...(transactionalIsPickupOrder && {
							activePickupOrderId: orderId,
						}),
					},
					{ merge: true },
				);

				if (normalizedRestaurantId) {
					t.delete(
						customerRef.collection("baskets").doc(normalizedRestaurantId),
					);
				}
			}

			// Individual Clean
			if (paymentType === "individual") {
				if (
					transactionalPendingOrderData.table &&
					transactionalPendingOrderData.table.id
				) {
					const tableRef = db
						.collection("restaurants")
						.doc(normalizedRestaurantId)
						.collection("tables")
						.doc(transactionalPendingOrderData.table.id);

					t.update(tableRef, { status: "checkedOut" });
				}

				if (transactionalPendingOrderData.checkInId) {
					t.set(
						db.collection("checkIns").doc(transactionalPendingOrderData.checkInId),
						{
							status: "COMPLETED",
							paymentStatus: "paid",
							completedAt: admin.firestore.FieldValue.serverTimestamp(),
							completedBy: "system_digital_checkout",
							archivedForAudit: true,
							archivedOrderId: orderId,
						},
						{ merge: true },
					);
				}

				(transactionalPendingOrderData.items || []).forEach((item) => {
					if (!item || !item.id) return;
					t.delete(db.collection("baskets").doc(item.id));
				});
			}

			// Pickup Clean (party-backed, but NOT dine-in table logic)
			else if (transactionalIsPickupOrder && partySnap.exists) {
				const partyData = partySnap.data() || {};

				if (basketSnap.exists) {
					const currentBasketItems = basketSnap.data().items || [];
					const paidItemIds = (transactionalPendingOrderData.items || []).map(
						(item) => item.id,
					);
					const paidItemIdSet = new Set(paidItemIds.filter(Boolean));
					const paidForUserIdSet = new Set(paidForUserIds);

					const remainingItems = currentBasketItems.filter(
						(item) => {
							if (paidItemIdSet.has(item.id)) return false;

							const itemOwnerId =
								item.orderedByUserId ||
								item.userId ||
								item.addedByUserId ||
								null;
							const isPaidCustomerItem =
								itemOwnerId &&
								paidForUserIdSet.has(itemOwnerId) &&
								item.paymentResponsibility !== "restaurant_pos";

							return !isPaidCustomerItem;
						},
					);

					if (remainingItems.length > 0) {
						t.update(basketSnap.ref, {
							items: remainingItems,
							lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
						});
					} else {
						// Fully complete pickup session only when empty
						t.update(partySnap.ref, {
							status: "completed",
							paymentStatus: "paid",
							closedAt: admin.firestore.FieldValue.serverTimestamp(),
							closedByUserId: "system_digital_checkout",
						});

						t.update(basketSnap.ref, {
							items: [],
							status: "archived_paid",
							archivedForAudit: true,
							archivedAt: admin.firestore.FieldValue.serverTimestamp(),
							archivedOrderId: orderId,
							lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
						});

						if (kitchenOrdersSnap && !kitchenOrdersSnap.empty) {
							kitchenOrdersSnap.forEach((docSnap) =>
								t.update(docSnap.ref, {
									overallStatus: "completed",
									status: "completed",
									closedAt: admin.firestore.FieldValue.serverTimestamp(),
									closedBy: "system_digital_checkout",
									archivedForAudit: true,
									archivedOrderId: orderId,
								}),
							);
						}
					}
				} else {
					// No basket found; still safely complete the pickup party
					t.update(partySnap.ref, {
						status: "completed",
						paymentStatus: "paid",
						closedAt: admin.firestore.FieldValue.serverTimestamp(),
						closedByUserId: "system_digital_checkout",
					});
				}

				if (payerUserId) {
					t.update(partySnap.ref, {
						guestUserIds: admin.firestore.FieldValue.arrayRemove(payerUserId),
					});
				}

				// No table cleanup
				// No check-in deletion
				// No guestPips payment fan-out
			}

			// Dine-in Party Clean
			else if (paymentType === "party" && partySnap.exists) {
				const partyData = partySnap.data() || {};
				const currentGuestPips = Array.isArray(partyData.guestPips)
					? partyData.guestPips
					: [];
				let remainingOrderedItemsAfterPayment = [];
				let hasRemainingPosCloseoutItems = false;
				const paidForUserIds = Array.isArray(
					transactionalPendingOrderData.paidForUserIds,
				)
					? transactionalPendingOrderData.paidForUserIds.filter(Boolean)
					: [payerUserId].filter(Boolean);
				const paidForRealUserIds = new Set(
					currentGuestPips
						.filter((pip) =>
							paidForUserIds.includes(pip.userId || pip.localPipId || pip.id),
						)
						.map((pip) => pip.userId)
						.filter(Boolean),
				);
				const partyRealMemberIds = new Set(
					[
						partyData.hostUserId,
						...(Array.isArray(partyData.guestUserIds)
							? partyData.guestUserIds
							: []),
						...(Array.isArray(partyData.memberUids)
							? partyData.memberUids
							: []),
						...currentGuestPips.map((pip) => pip && pip.userId),
					].filter(Boolean),
				);
				paidForUserIds.forEach((paidForId) => {
					if (partyRealMemberIds.has(paidForId)) {
						paidForRealUserIds.add(paidForId);
					}
				});

				const updatedGuestPips = currentGuestPips.map((pip) =>
					paidForUserIds.includes(pip.userId || pip.localPipId || pip.id)
						? { ...pip, paymentStatus: "paid", paidByUserId: payerUserId }
						: pip,
				);

				t.update(partySnap.ref, {
					guestPips: updatedGuestPips,
					...(paidForRealUserIds.size > 0 && {
						guestUserIds: admin.firestore.FieldValue.arrayRemove(
							...Array.from(paidForRealUserIds),
						),
					}),
				});

				paidForRealUserIds.forEach((uid) => {
					t.set(
						db.collection("customers").doc(uid),
						{
							activeCheckIn: null,
							activePartyId: null,
							activeRestaurantId: null,
							partyIds: admin.firestore.FieldValue.arrayRemove(
								transactionalPendingOrderData.partyId,
							),
						},
						{ merge: true },
					);
				});

				if (partyData.checkInId && paidForRealUserIds.size > 0) {
					t.set(
						db.collection("checkIns").doc(partyData.checkInId),
						{
							paidUserIds: admin.firestore.FieldValue.arrayUnion(
								...Array.from(paidForRealUserIds),
							),
							lastPaidAt: admin.firestore.FieldValue.serverTimestamp(),
						},
						{ merge: true },
					);
				}

				if (basketSnap.exists) {
					const currentBasketItems = basketSnap.data().items || [];
					const paidItemIds = (transactionalPendingOrderData.items || []).map(
						(item) => item.id,
					);

					const remainingItems = currentBasketItems.filter(
						(item) => !paidItemIds.includes(item.id),
					);
					remainingOrderedItemsAfterPayment = remainingItems.filter(
						(item) => item && item.status && item.status !== "new",
					);
					const remainingPosCloseoutItems =
						remainingOrderedItemsAfterPayment.filter(
							(item) => item.paymentResponsibility === "restaurant_pos",
						);
					hasRemainingPosCloseoutItems = remainingPosCloseoutItems.length > 0;
					const remainingCustomerPayableItems =
						remainingOrderedItemsAfterPayment.filter(
							(item) => item.paymentResponsibility !== "restaurant_pos",
						);

					t.update(basketSnap.ref, {
						items: remainingItems,
						remainingPayableItemCount: remainingCustomerPayableItems.length,
						remainingPosCloseoutItemCount: remainingPosCloseoutItems.length,
						lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
					});

					if (hasRemainingPosCloseoutItems) {
						t.set(
							pendingOrderRef,
							{
								remainingPosCloseoutItemCount:
									remainingPosCloseoutItems.length,
							},
							{ merge: true },
						);
					}
				}

				const allGuestPipsPaid =
					updatedGuestPips.length > 0 &&
					updatedGuestPips.every((pip) => pip.paymentStatus === "paid");
				const isDigitalPartyFullyPaid = basketSnap.exists
					? remainingOrderedItemsAfterPayment.length === 0
					: allGuestPipsPaid;

				if (isDigitalPartyFullyPaid && !hasRemainingPosCloseoutItems) {
					t.update(partySnap.ref, {
						status: "checkedOut", // keep visible for cleaning
						paymentStatus: "paid",
						closedAt: admin.firestore.FieldValue.serverTimestamp(),
						closedByUserId: "system_digital_checkout",
					});

					if (partyData.table && partyData.table.id) {
						const tableRef = db
							.collection("restaurants")
							.doc(partyData.restaurantId)
							.collection("tables")
							.doc(partyData.table.id);

						t.update(tableRef, { status: "checkedOut" });
					}

					if (partyData.checkInId) {
						t.set(
							db.collection("checkIns").doc(partyData.checkInId),
							{
								status: "COMPLETED",
								paymentStatus: "paid",
								completedAt: admin.firestore.FieldValue.serverTimestamp(),
								completedBy: "system_digital_checkout",
								archivedForAudit: true,
								archivedOrderId: orderId,
							},
							{ merge: true },
						);
					}

					if (basketSnap.exists) {
						t.update(basketSnap.ref, {
							items: [],
							status: "archived_paid",
							archivedForAudit: true,
							archivedAt: admin.firestore.FieldValue.serverTimestamp(),
							archivedOrderId: orderId,
							lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
						});
					}

					if (kitchenOrdersSnap && !kitchenOrdersSnap.empty) {
						kitchenOrdersSnap.forEach((docSnap) =>
							t.update(docSnap.ref, {
								overallStatus: "completed",
								status: "completed",
								closedAt: admin.firestore.FieldValue.serverTimestamp(),
								closedBy: "system_digital_checkout",
								archivedForAudit: true,
								archivedOrderId: orderId,
							}),
						);
					}

					const usersToFree = [];
					const addUserToFree = (uid) => {
						if (!uid || uid === "walk_in_guest" || usersToFree.includes(uid)) {
							return;
						}
						usersToFree.push(uid);
					};

					addUserToFree(payerUserId);
					addUserToFree(partyData.hostUserId);

					currentGuestPips.forEach((pip) => addUserToFree(pip && pip.userId));

					[
						...(Array.isArray(partyData.guestUserIds)
							? partyData.guestUserIds
							: []),
						...(Array.isArray(partyData.memberUids)
							? partyData.memberUids
							: []),
					].forEach(addUserToFree);

					usersToFree.forEach((uid) => {
						t.set(
							db.collection("customers").doc(uid),
							{
								activeCheckIn: null,
								activePartyId: null,
								activeRestaurantId: null,
								partyIds: admin.firestore.FieldValue.arrayRemove(
									transactionalPendingOrderData.partyId,
								),
							},
							{ merge: true },
						);
					});
				}
			}

			// Preserve the pending order as an audit/index record instead of deleting it.
			t.set(
				pendingOrderRef,
				{
					status: "fulfilled",
					paymentStatus: "paid",
					fulfilledOrderId: orderId,
					fulfilledAt: admin.firestore.FieldValue.serverTimestamp(),
					archivedForAudit: true,
				},
				{ merge: true },
			);
		});

		console.log(`[Fulfill] DB transaction committed for order ${orderId}.`);
	} catch (error) {
		console.error(`[Fulfill] DB transaction failed for ${orderId}:`, error);
		throw error;
	}

	// 3. CREATE PRODUCTION TICKET FOR PAID PICKUP AFTER DB COMMIT
	if (isPickupOrder) {
		try {
			await createKitchenOrderForPaidPickup({
				orderId,
				restaurantId: normalizedRestaurantId,
				partyId: pendingOrderData.partyId || null,
				items: pendingOrderData.items || [],
				fulfillmentType: pendingOrderData.fulfillmentType || "hotel_pickup",
				locationName:
					(pendingOrderData.table && pendingOrderData.table.name) ||
					pendingOrderData.locationName ||
					"Hotel Pickup",

				customerName:
					resolvedCustomerName ||
					pendingOrderData.customerName ||
					"Pickup Guest",

				customerEmail:
					resolvedCustomerEmail || pendingOrderData.customerEmail || null,

				pickupSpecialInstructions:
					pendingOrderData.pickupSpecialInstructions || "",
			});

			console.log(
				`[Fulfill] Created kitchen ticket for paid pickup order ${orderId}.`,
			);
		} catch (pickupTicketError) {
			console.error(
				`[Fulfill] Failed to create kitchen ticket for pickup order ${orderId}:`,
				pickupTicketError,
			);
			throw pickupTicketError;
		}
	}

	// 3. EXTERNAL API CALLS AFTER DB COMMIT
	if (processor === "stripe" && stripeInstance) {
		if (usesDestinationCharge) {
			await db.collection("orders").doc(orderId).update({
				stripeDestinationTransferId: stripeDestinationTransferId || null,
				restaurantTransferStatus: "stripe_destination_charge",
				restaurantTransferAmount: amountToTransfer,
				stripeApplicationFeeAmount: applicationFeeAmount,
				applicationFeeAmount,
			});
		} else if (
			payoutRouting === "stripe_connect" &&
			latestChargeId &&
			pendingOrderData.connectedAccountId
		) {
			try {
				const transfer = await stripeInstance.transfers.create({
					amount: amountToTransfer,
					currency: "usd",
					destination: pendingOrderData.connectedAccountId,
					source_transaction: latestChargeId,
					metadata: {
						orderId,
						stripeFeeResponsibility,
						restaurantGrossAmount: String(restaurantGrossAmount),
						restaurantTransferAmount: String(amountToTransfer),
						gratuityPassthroughAmount: String(gratuityPassthroughAmount),
						restaurantSalesAndTaxAmount: String(restaurantSalesAndTaxAmount),
						restaurantSalesAndTaxNetAmount: String(
							restaurantSalesAndTaxNetAmount,
						),
						processorFeeAppliedToRestaurantSales: String(
							processorFeeAppliedToRestaurantSales,
						),
						scervGrossFee: String(scervGrossFee),
						scervNet: String(scervNet),
					},
				});

				await db.collection("orders").doc(orderId).update({
					stripeTransferId: transfer.id,
					restaurantTransferStatus: "created",
					restaurantTransferAmount: amountToTransfer,
				});
			} catch (apiError) {
				console.error(
					`[Fulfill] 🚨 Stripe Transfer FAILED for ${orderId}:`,
					apiError,
				);
				await db.collection("orders").doc(orderId).set(
					{
						restaurantTransferStatus: "failed",
						restaurantTransferError: apiError.message || String(apiError),
						restaurantTransferFailedAt:
							admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);
			}
		}
	}
};
// --- Webhook Endpoint for TEST Mode ---
exports.stripeWebhookTest = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY_TEST, STRIPE_WEBHOOK_SECRET_TEST], // Only TEST secrets
	})
	.https.onRequest(async (request, response) => {
		const sig = request.headers["stripe-signature"];
		const webhookSecret = STRIPE_WEBHOOK_SECRET_TEST.value();
		const secretKey = STRIPE_SECRET_KEY_TEST.value(); // Use TEST API key
		let event;

		if (!webhookSecret || !secretKey) {
			console.error("🔴 TEST Webhook Error: Missing secrets..");
			return response.status(500).send("Server configuration error.");
		}

		const stripeInstance = require("stripe")(secretKey); // Initialize with TEST key

		try {
			event = stripeInstance.webhooks.constructEvent(
				request.rawBody,
				sig,
				webhookSecret,
			);
			console.log(
				"✅ TEST Webhook signature verified. Event type:",
				event.type,
			);
		} catch (err) {
			console.error("❌ TEST Webhook signature verification failed.", err);
			return response.status(400).send(`Webhook Error: ${err.message}`);
		}

		try {
			await handleStripeEvent(event, stripeInstance); // Call shared logic
			response.status(200).send({ received: true }); // Send success AFTER handling
		} catch (err) {
			console.error(
				`Error in TEST handleStripeEvent for event ${event.id}:`,
				err,
			);
			response.status(500).send(`Webhook Processing Error: ${err.message}`); // Send 500 on processing errors
		}
	});

// --- Webhook Endpoint for LIVE Mode ---
exports.stripeWebhookLive = functions
	.runWith({
		secrets: [STRIPE_SECRET_KEY_LIVE, STRIPE_WEBHOOK_SECRET_LIVE], // Only LIVE secrets
	})
	.https.onRequest(async (request, response) => {
		const sig = request.headers["stripe-signature"];
		const webhookSecret = STRIPE_WEBHOOK_SECRET_LIVE.value();
		const secretKey = STRIPE_SECRET_KEY_LIVE.value(); // Use LIVE API key
		let event;

		if (!webhookSecret || !secretKey) {
			console.error("🔴 LIVE Webhook Error: Missing secrets.");
			return response.status(500).send("Server configuration error.");
		}

		const stripeInstance = require("stripe")(secretKey); // Initialize with LIVE key

		try {
			event = stripeInstance.webhooks.constructEvent(
				request.rawBody,
				sig,
				webhookSecret,
			);
			console.log(
				"✅ LIVE Webhook signature verified. Event type:",
				event.type,
			);
		} catch (err) {
			console.error("❌ LIVE Webhook signature verification failed.", err);
			return response.status(400).send(`Webhook Error: ${err.message}`);
		}

		try {
			await handleStripeEvent(event, stripeInstance); // Call shared logic
			response.status(200).send({ received: true }); // Send success AFTER handling
		} catch (err) {
			console.error(
				`Error in LIVE handleStripeEvent for event ${event.id}:`,
				err,
			);
			response.status(500).send(`Webhook Processing Error: ${err.message}`); // Send 500 on processing errors
		}
	});

// Function to fetch the Stripe publishable key from RemoteCinfig(server-side)
exports.getStripePublishableKey = functions
	.runWith({
		secrets: [
			STRIPE_PUBLISHABLE_KEY_LIVE,
			STRIPE_PUBLISHABLE_KEY_TEST,
			STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST,
		],
	})
	.https.onCall(async (data, context) => {
		try {
			const keys = await getStripeKeys(data.restaurantId);

			if (!keys || !keys.publishableKey) {
				//check for returned object, and key
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Stripe Publishable key is not set",
				);
			}
			return { stripePublishableKey: keys.publishableKey }; //return named property.
		} catch (error) {
			console.error(
				"Error fetching stripe publishable key: ", // removed "from Remote Config"
				error,
			);
			throw new functions.https.HttpsError(
				"internal",
				"An error occurred while fetching the Stripe publishable key.",
			);
		}
	});

exports.fulfillOrder = fulfillOrder;
