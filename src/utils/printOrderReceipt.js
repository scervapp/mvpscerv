// utils/printing/printOrderReceipt.js

import printReceipt from "./printReceipt";
import createEscPosAdapter from "./createEscPosAdapter";
import createMockPrinterAdapter from "./createMockPrinterAdapter";

/**
 * Printer config shape suggestion:
 * {
 *   enabled: true,
 *   mode: "mock" | "escpos",
 *   connectionType: "network",
 *   ipAddress: "192.168.1.120",
 *   port: 9100,
 *   width: 42,
 *   lang: "en",
 *   autoPrintCloseTable: true,
 *   autoPrintPickup: true,
 * }
 */

const createNetworkPrinterClient = async (printerConfig) => {
	/**
	 * Replace this stub with the actual client creation from the printer library you choose.
	 *
	 * Example expectation from the chosen lib:
	 * const client = new SomeEscPosClient({
	 *   host: printerConfig.ipAddress,
	 *   port: printerConfig.port || 9100,
	 * });
	 * return client;
	 */

	throw new Error(
		"Network printer client not implemented yet. Wire this to your chosen ESC/POS library.",
	);
};

const getAdapterForConfig = async (printerConfig = {}) => {
	const mode =
		printerConfig && printerConfig.mode ? printerConfig.mode : "mock";

	if (mode === "mock") {
		return createMockPrinterAdapter("SCERV_MOCK_PRINTER");
	}

	if (mode === "escpos") {
		const client = await createNetworkPrinterClient(printerConfig);
		return createEscPosAdapter(client);
	}

	throw new Error(`Unsupported printer mode: ${mode}`);
};

const printOrderReceipt = async (order, printerConfig = {}, options = {}) => {
	if (!printerConfig || printerConfig.enabled === false) {
		return {
			success: false,
			skipped: true,
			reason: "printing_disabled",
		};
	}

	try {
		const adapter = await getAdapterForConfig(printerConfig);

		await printReceipt(order, adapter, {
			type: options.type || "auto",
			lang: options.lang || printerConfig.lang || "en",
			showBarcode:
				options.showBarcode !== undefined
					? options.showBarcode
					: !!printerConfig.showBarcode,
			barcodeValue: options.barcodeValue,
			width: printerConfig.width || 42,
		});

		return {
			success: true,
			skipped: false,
		};
	} catch (error) {
		console.error("[printOrderReceipt] print failed:", error);
		return {
			success: false,
			skipped: false,
			error: error && error.message ? error.message : "print_failed",
		};
	}
};

export { printOrderReceipt };
export default printOrderReceipt;
