// utils/printing/createEscPosAdapter.js

/**
 * This adapter expects a printer client object with methods like:
 * connect, disconnect, alignLeft, alignCenter, alignRight,
 * setBold, printText, printBarcode, cutPaper
 *
 * Adjust these method names to match the library you choose.
 */
const createEscPosAdapter = (printerClient) => {
	if (!printerClient) {
		throw new Error("createEscPosAdapter requires a printerClient.");
	}

	return {
		connect: async () => {
			if (typeof printerClient.connect === "function") {
				await printerClient.connect();
			}
		},

		align: async (value) => {
			if (value === "center" && typeof printerClient.alignCenter === "function") {
				await printerClient.alignCenter();
				return;
			}

			if (value === "right" && typeof printerClient.alignRight === "function") {
				await printerClient.alignRight();
				return;
			}

			if (typeof printerClient.alignLeft === "function") {
				await printerClient.alignLeft();
			}
		},

		bold: async (enabled) => {
			if (typeof printerClient.setBold === "function") {
				await printerClient.setBold(!!enabled);
			}
		},

		text: async (value) => {
			if (typeof printerClient.printText === "function") {
				await printerClient.printText(`${String(value || "")}\n`);
			}
		},

		newLine: async (count = 1) => {
			if (typeof printerClient.printText !== "function") return;

			for (let i = 0; i < count; i += 1) {
				await printerClient.printText("\n");
			}
		},

		barcode: async (value) => {
			if (typeof printerClient.printBarcode === "function") {
				await printerClient.printBarcode(String(value || ""));
				return;
			}

			if (typeof printerClient.printText === "function") {
				await printerClient.printText(`${String(value || "")}\n`);
			}
		},

		cut: async () => {
			if (typeof printerClient.cutPaper === "function") {
				await printerClient.cutPaper();
			}
		},

		disconnect: async () => {
			if (typeof printerClient.disconnect === "function") {
				await printerClient.disconnect();
			}
		},
	};
};

export { createEscPosAdapter };
export default createEscPosAdapter;