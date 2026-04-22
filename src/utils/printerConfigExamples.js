// utils/printing/printerConfigExamples.js

export const mockPrinterConfig = {
	enabled: true,
	mode: "mock",
	width: 42,
	lang: "en",
	showBarcode: true,
};

export const xprinterLanConfigExample = {
	enabled: true,
	mode: "escpos",
	connectionType: "network",
	ipAddress: "192.168.1.120",
	port: 9100,
	width: 42,
	lang: "en",
	showBarcode: true,
};
