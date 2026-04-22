// utils/printing/printReceipt.js

const DEFAULT_CURRENCY_SYMBOL = "$";
const DEFAULT_WIDTH = 42;

const safeNumber = (value, fallback = 0) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
};

const centsToDollars = (value) => safeNumber(value, 0) / 100;

const formatMoney = (amount, currencySymbol = DEFAULT_CURRENCY_SYMBOL) =>
	`${currencySymbol}${safeNumber(amount, 0).toFixed(2)}`;

const truncate = (text, max = DEFAULT_WIDTH) => {
	const raw = String(text || "");
	if (raw.length <= max) return raw;
	return `${raw.slice(0, max - 3)}...`;
};

const getLocalizedText = (value, lang = "en") => {
	if (!value) return "";
	if (typeof value === "string") return value;

	return value[lang] || value.en || value.es || value.original || "";
};

const getItemDisplayName = (item, lang = "en") =>
	getLocalizedText(item && item.dishName, lang) ||
	getLocalizedText(item && item.name, lang) ||
	"Item";

const getItemInstructions = (item, lang = "en") =>
	getLocalizedText(item && item.specialInstructions, lang);

const getItemQuantity = (item) => {
	const q = parseInt(item && item.quantity, 10);
	return Number.isFinite(q) && q > 0 ? q : 1;
};

const getEffectiveUnitPriceDollars = (item) => {
	if (
		item &&
		item.discountedPrice !== undefined &&
		item.discountedPrice !== null
	) {
		return safeNumber(item.discountedPrice, 0);
	}
	return safeNumber(item && item.price, 0);
};

const getLineTotalDollars = (item) =>
	getEffectiveUnitPriceDollars(item) * getItemQuantity(item);

const normalizeModifiers = (item, lang = "en") => {
	const modifiers = Array.isArray(item && item.selectedModifiers)
		? item.selectedModifiers
		: [];

	return modifiers.map((modifier) => ({
		name: getLocalizedText(modifier && modifier.name, lang),
		price: safeNumber(modifier && modifier.price, 0),
		category: modifier && modifier.category ? modifier.category : "",
	}));
};

const padRight = (text, width) => {
	const raw = String(text || "");
	if (raw.length >= width) return raw;
	return raw + " ".repeat(width - raw.length);
};

const padLeft = (text, width) => {
	const raw = String(text || "");
	if (raw.length >= width) return raw;
	return " ".repeat(width - raw.length) + raw;
};

const lineItemRow = (
	left,
	right,
	totalWidth = DEFAULT_WIDTH,
	rightWidth = 12,
) => {
	const safeRight = String(right || "");
	const leftWidth = totalWidth - rightWidth;
	return `${padRight(truncate(left, leftWidth), leftWidth)}${padLeft(
		safeRight,
		rightWidth,
	)}`;
};

const divider = (char = "-", width = DEFAULT_WIDTH) => char.repeat(width);

const resolveReceiptTypeLabel = (order, type, lang = "en") => {
	if (type === "pickup")
		return lang === "es" ? "RETIRO / PICKUP" : "PICKUP ORDER";
	if (type === "closeout")
		return lang === "es" ? "RECIBO DE MESA" : "TABLE RECEIPT";

	if (
		order &&
		(order.orderMode === "pickup" || order.fulfillmentType === "hotel_pickup")
	) {
		return lang === "es" ? "RETIRO / PICKUP" : "PICKUP ORDER";
	}

	return lang === "es" ? "RECIBO" : "RECEIPT";
};

const buildReceiptModel = (order, options = {}) => {
	const {
		lang = "en",
		type = "auto",
		currencySymbol = DEFAULT_CURRENCY_SYMBOL,
		showBarcode = true,
		barcodeValue,
		width = DEFAULT_WIDTH,
	} = options;

	const receiptType =
		type === "auto"
			? order &&
				(order.orderMode === "pickup" ||
					order.fulfillmentType === "hotel_pickup")
				? "pickup"
				: "closeout"
			: type;

	const subtotalDollars = centsToDollars(order && order.subtotal);
	const taxDollars = centsToDollars(
		(order && (order.taxAmount !== undefined ? order.taxAmount : order.tax)) ||
			0,
	);
	const gratuityDollars = centsToDollars(order && order.gratuityAmount);
	const platformFeeDollars = centsToDollars(order && order.platformFee);
	const totalDollars = centsToDollars(order && order.totalPrice);

	const items = Array.isArray(order && order.items) ? order.items : [];

	const normalizedItems = items.map((item) => ({
		name: getItemDisplayName(item, lang),
		quantity: getItemQuantity(item),
		lineTotal: getLineTotalDollars(item),
		modifiers: normalizeModifiers(item, lang),
		instructions: getItemInstructions(item, lang),
	}));

	const finalBarcodeValue =
		barcodeValue ||
		(order && order.readableOrderId) ||
		(order && order.orderId) ||
		(order && order.id) ||
		"";

	return {
		width,
		restaurantName: (order && order.restaurantName) || "Scerv Partner",
		tableName: (order && order.table && order.table.name) || "",
		serverName: (order && order.server && order.server.name) || "",
		customerName: (order && order.customerName) || "",
		orderId: (order && order.orderId) || (order && order.id) || "",
		readableOrderId: (order && order.readableOrderId) || "",
		receiptTypeLabel: resolveReceiptTypeLabel(order, receiptType, lang),
		orderMode: (order && order.orderMode) || "",
		fulfillmentType: (order && order.fulfillmentType) || "",
		items: normalizedItems,
		subtotalDollars,
		taxDollars,
		gratuityDollars,
		platformFeeDollars,
		totalDollars,
		currencySymbol,
		showBarcode: showBarcode && !!finalBarcodeValue,
		barcodeValue: finalBarcodeValue,
	};
};

/**
 * Adapter contract:
 * await adapter.connect?.()
 * await adapter.align?.("center" | "left" | "right")
 * await adapter.bold?.(true|false)
 * await adapter.text?.("line")
 * await adapter.newLine?.(count)
 * await adapter.barcode?.(value)
 * await adapter.cut?.()
 * await adapter.disconnect?.()
 */
const safeCall = async (fn, ...args) => {
	if (typeof fn !== "function") return;
	return await fn(...args);
};

const printReceipt = async (order, adapter, options = {}) => {
	if (!order) throw new Error("printReceipt requires an order object.");
	if (!adapter) throw new Error("printReceipt requires a printer adapter.");

	const model = buildReceiptModel(order, options);
	const {
		width,
		restaurantName,
		tableName,
		serverName,
		customerName,
		readableOrderId,
		orderId,
		receiptTypeLabel,
		items,
		subtotalDollars,
		taxDollars,
		gratuityDollars,
		platformFeeDollars,
		totalDollars,
		currencySymbol,
		showBarcode,
		barcodeValue,
	} = model;

	try {
		await safeCall(adapter.connect);

		await safeCall(adapter.align, "center");
		await safeCall(adapter.bold, true);
		await safeCall(adapter.text, restaurantName);
		await safeCall(adapter.bold, false);
		await safeCall(adapter.text, receiptTypeLabel);

		if (readableOrderId) {
			await safeCall(adapter.text, `Order: ${readableOrderId}`);
		} else if (orderId) {
			await safeCall(adapter.text, `Order: ${orderId}`);
		}

		if (tableName) {
			await safeCall(adapter.text, `Table: ${tableName}`);
		}

		if (serverName) {
			await safeCall(adapter.text, `Server: ${serverName}`);
		}

		if (customerName) {
			await safeCall(adapter.text, `Guest: ${customerName}`);
		}

		await safeCall(adapter.newLine, 1);
		await safeCall(adapter.align, "left");
		await safeCall(adapter.text, divider("-", width));

		for (const item of items) {
			const itemLabel = `${item.quantity}x ${item.name}`;
			const itemAmount = formatMoney(item.lineTotal, currencySymbol);
			await safeCall(adapter.text, lineItemRow(itemLabel, itemAmount, width));

			if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
				for (const modifier of item.modifiers) {
					const modifierLabel =
						modifier.price > 0
							? `  • ${modifier.name} (+${formatMoney(
									modifier.price,
									currencySymbol,
								)})`
							: `  • ${modifier.name}`;

					await safeCall(adapter.text, truncate(modifierLabel, width));
				}
			}

			if (item.instructions) {
				await safeCall(
					adapter.text,
					truncate(`  "${item.instructions}"`, width),
				);
			}

			await safeCall(adapter.newLine, 1);
		}

		await safeCall(adapter.text, divider("-", width));
		await safeCall(
			adapter.text,
			lineItemRow(
				"Subtotal",
				formatMoney(subtotalDollars, currencySymbol),
				width,
			),
		);

		if (taxDollars > 0) {
			await safeCall(
				adapter.text,
				lineItemRow("Tax", formatMoney(taxDollars, currencySymbol), width),
			);
		}

		if (gratuityDollars > 0) {
			await safeCall(
				adapter.text,
				lineItemRow(
					"Gratuity",
					formatMoney(gratuityDollars, currencySymbol),
					width,
				),
			);
		}

		if (platformFeeDollars > 0) {
			await safeCall(
				adapter.text,
				lineItemRow(
					"Service Fee",
					formatMoney(platformFeeDollars, currencySymbol),
					width,
				),
			);
		}

		await safeCall(adapter.text, divider("=", width));
		await safeCall(adapter.bold, true);
		await safeCall(
			adapter.text,
			lineItemRow("TOTAL", formatMoney(totalDollars, currencySymbol), width),
		);
		await safeCall(adapter.bold, false);

		await safeCall(adapter.newLine, 1);

		if (showBarcode) {
			await safeCall(adapter.align, "center");
			if (typeof adapter.barcode === "function") {
				await safeCall(adapter.barcode, barcodeValue);
			} else {
				await safeCall(adapter.text, barcodeValue);
			}
			await safeCall(adapter.newLine, 1);
		}

		await safeCall(adapter.align, "center");
		await safeCall(adapter.text, "Thanks for dining with us!");
		await safeCall(adapter.newLine, 3);
		await safeCall(adapter.cut);
	} finally {
		await safeCall(adapter.disconnect);
	}
};

export { printReceipt, buildReceiptModel };
export default printReceipt;
