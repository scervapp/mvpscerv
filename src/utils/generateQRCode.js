const QRCode = require("qrcode");
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");

const outputDir = path.join(__dirname, "table_qrcodesEmilyEats");
if (!fs.existsSync(outputDir)) {
	fs.mkdirSync(outputDir);
}

// ==========================================
// CONFIGURATION
// ==========================================
const TOTAL_TABLES = 10;
const baseUrl = "https://scervmvp.web.app/scan";

// 🚨 PASTE DAQUIRI 23's FIREBASE RESTAURANT ID HERE
const RESTAURANT_UID = " PcqaVn96x1XntOrBtGzGgscEjzz2";

const generateCodes = async () => {
	console.log(
		`Starting generation of ${TOTAL_TABLES} stamped QR codes for Restaurant: ${RESTAURANT_UID}...`,
	);

	// Load the font once outside the loop to make generation super fast
	const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

	for (let i = 1; i <= TOTAL_TABLES; i++) {
		const tableId = `table_${i}`;
		const displayString = `Table ${i}`; // The text stamped on the image
		const tableName = encodeURIComponent(displayString);

		// Payload for the scanner
		const qrPayload = `${baseUrl}?r=${RESTAURANT_UID}&t=${tableId}&n=${tableName}`;
		const filePath = path.join(outputDir, `Table_${i}.png`);

		try {
			// 1. Generate the raw QR code as a Buffer in memory
			const qrBuffer = await QRCode.toBuffer(qrPayload, {
				errorCorrectionLevel: "H",
				margin: 5, // 🚨 Thick margin creates a blank white canvas at the bottom for text
				width: 800,
				color: { dark: "#000000", light: "#ffffff" },
			});

			// 2. Load the Buffer into the Image Processor
			const image = await Jimp.read(qrBuffer);

			// 3. Print the Table Name perfectly centered at the bottom
			image.print(
				font,
				0, // X position
				720, // Y position (Drops it perfectly into the bottom white margin)
				{
					text: displayString,
					alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
				},
				800, // Max width (forces it to center across the entire 800px image)
			);

			// 4. Save the final stamped image
			await image.writeAsync(filePath);

			console.log(`✅ Generated & Stamped: Table ${i}`);
		} catch (err) {
			console.error(`❌ Failed to generate Table ${i}:`, err);
		}
	}

	console.log(`\n🎉 All done! Saved in '${outputDir}'.`);
};

generateCodes();
