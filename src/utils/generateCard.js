const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// 🚨 Ensure your image is named exactly this in your folder
const templatePath = path.join(__dirname, "template2.png");
const outputFile = path.join(__dirname, "Daquiri23_TableCards2.pdf");

const TOTAL_TABLES = 50;

// 5x7 inches in PDF math (72 points per inch)
const cardWidth = 5 * 72; // 360
const cardHeight = 7 * 72; // 504

const generateCards = () => {
	if (!fs.existsSync(templatePath)) {
		console.error(
			"❌ ERROR: Could not find template.jpg. Please save it in this folder.",
		);
		return;
	}

	console.log(`Building 50-page PDF using ${templatePath}...`);

	const doc = new PDFDocument({ size: [cardWidth, cardHeight], margin: 0 });
	doc.pipe(fs.createWriteStream(outputFile));

	for (let i = 1; i <= TOTAL_TABLES; i++) {
		if (i > 1) {
			doc.addPage();
		}

		// 1. Place the Canva template as the full background
		doc.image(templatePath, 0, 0, {
			width: cardWidth,
			height: cardHeight,
		});

		// 2. Format the massive number
		doc
			.font("Helvetica-Bold")
			.fontSize(160) // 🚨 Huge font size
			.fillColor("#000000"); // Black text

		// 🚨 This drops the text right into the blank space on your template
		// Decrease to move up, increase to move down
		const yPosition = 160;

		doc.text(i.toString(), 0, yPosition, {
			align: "center",
			width: cardWidth, // Forces it to perfectly center side-to-side
		});

		console.log(`✅ Stamped Table ${i}`);
	}

	doc.end();
	console.log(`\n🎉 Cards complete! File saved to: ${outputFile}`);
};

generateCards();
