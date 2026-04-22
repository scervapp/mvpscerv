// utils/printing/createMockPrinterAdapter.js

const createMockPrinterAdapter = (label = "MOCK_PRINTER") => {
	return {
		connect: async () => {
			console.log(`[${label}] connect`);
		},

		align: async (value) => {
			console.log(`[${label}] align:`, value);
		},

		bold: async (enabled) => {
			console.log(`[${label}] bold:`, enabled);
		},

		text: async (value) => {
			console.log(`[${label}] text: ${value}`);
		},

		newLine: async (count = 1) => {
			console.log(`[${label}] newLine x${count}`);
		},

		barcode: async (value) => {
			console.log(`[${label}] barcode: ${value}`);
		},

		cut: async () => {
			console.log(`[${label}] cut`);
		},

		disconnect: async () => {
			console.log(`[${label}] disconnect`);
		},
	};
};

export { createMockPrinterAdapter };
export default createMockPrinterAdapter;
