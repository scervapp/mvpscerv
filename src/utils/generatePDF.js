const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const inputDir = path.join(__dirname, "table_qrcodes");
const outputFile = path.join(__dirname, "Daquiri23_QR_Stickers.pdf");

// ==========================================
// GRID LAYOUT SETTINGS (8.5 x 11 inches)
// ==========================================
// 1 inch = 72 points in PDF math
const marginX = 60; // ~0.8 inches from left/right
const marginY = 50; // ~0.7 inches from top/bottom

const cols = 3; // 3 stickers across
const rows = 4; // 4 stickers down (12 per page)

const stickerWidth = 162; // 2.25 inches wide
const stickerHeight = 180; // 2.5 inches tall

const TOTAL_TABLES = 50;

const generatePDF = () => {
	console.log(`Building PDF grid for ${TOTAL_TABLES} QR codes...`);

	// Create a standard US Letter sized PDF
	const doc = new PDFDocument({ size: "letter", margin: 0 });
	doc.pipe(fs.createWriteStream(outputFile));

	for (let i = 1; i <= TOTAL_TABLES; i++) {
		const imagePath = path.join(inputDir, `Table_${i}.png`);

		// Skip if the image doesn't exist for some reason
		if (!fs.existsSync(imagePath)) {
			console.warn(`⚠️ Missing image for Table ${i}, skipping...`);
			continue;
		}

		// Calculate position on the page
		const indexOnPage = (i - 1) % (cols * rows);
		const col = indexOnPage % cols;
		const row = Math.floor(indexOnPage / cols);

		// Add a new page every 12 stickers (except for the very first one)
		if (i > 1 && indexOnPage === 0) {
			doc.addPage();
		}

		const x = marginX + col * stickerWidth;
		const y = marginY + row * stickerHeight;

		// 1. Draw the faint gray cut line
		doc
			.lineWidth(0.5)
			.strokeColor("#CCCCCC")
			.rect(x, y, stickerWidth, stickerHeight)
			.stroke();

		// 2. Insert the QR code image inside the cut lines (leaving a tiny padding)
		const padding = 10;
		doc.image(imagePath, x + padding, y + padding, {
			width: stickerWidth - padding * 2,
			height: stickerHeight - padding * 2,
			align: "center",
			valign: "center",
		});

		console.log(`✅ Placed Table ${i} on PDF`);
	}

	doc.end();
	console.log(`\n🎉 PDF complete! File saved to: ${outputFile}`);
};

generatePDF();
