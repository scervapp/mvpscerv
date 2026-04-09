const QRCode = require("qrcode");
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");

const outputDir = path.join(__dirname, "hilton_qrcodes");
if (!fs.existsSync(outputDir)) {
	fs.mkdirSync(outputDir);
}

// ==========================================
// HILTON CONFIGURATION
// ==========================================
const TOTAL_ROOMS = 200; // ← Change this to whatever number you want (50, 80, 100, 150…)
const baseUrl = "https://scervmvp.web.app/scan";
const RESTAURANT_UID = "xD6c9KwlHJdY99gNFzTFhKdzVAH2"; // Daiquiri 23 (unchanged)

const generateHiltonCodes = async () => {
	console.log(
		`Starting generation of ${TOTAL_ROOMS} isolated Hilton Room Service QRs...`,
	);

	const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

	for (let i = 1; i <= TOTAL_ROOMS; i++) {
		const roomId = `hilton-panama-${String(i).padStart(3, "0")}`; // e.g. hilton-panama-042
		const displayString = roomId;

		// Payload (exactly like your table system — each room gets its own isolated party)
		const qrPayload = `${baseUrl}?r=${RESTAURANT_UID}&t=${roomId}&n=${encodeURIComponent(displayString)}`;

		const filePath = path.join(
			outputDir,
			`Hilton_${String(i).padStart(3, "0")}.png`,
		);

		try {
			const qrBuffer = await QRCode.toBuffer(qrPayload, {
				errorCorrectionLevel: "H",
				margin: 5,
				width: 800,
				color: { dark: "#000000", light: "#ffffff" },
			});

			const image = await Jimp.read(qrBuffer);

			// Stamp the text at the bottom (exactly like your original script)
			image.print(
				font,
				0,
				720,
				{
					text: displayString,
					alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
				},
				800,
			);

			await image.writeAsync(filePath);
			console.log(`✅ Generated: ${roomId}`);
		} catch (err) {
			console.error(`❌ Failed ${roomId}:`, err);
		}
	}

	console.log(`\n🎉 All done! Files saved in '${outputDir}' folder.`);
	console.log(
		"Send the entire folder to Hilton IT — they can assign any of these to any room on the TVs.",
	);
};

generateHiltonCodes();
