const { test } = require("node:test");
const assert = require("node:assert/strict");
const admin = require("../../functions/node_modules/firebase-admin");

if (!admin.apps.length) {
	admin.initializeApp({ projectId: "demo-scerv-pay-lite-report" });
}

const {
	_test: {
		buildScervPayLiteCustomerReceipt,
		buildScervPayLiteDailyReport,
		calculatePayLiteFinancials,
	},
} = require("../../functions/terminalFunctions");

test("Pay Lite policy math keeps restaurant sales, guest fee and Scerv fee separate", () => {
	const financials = calculatePayLiteFinancials({
		merchantNetSalesAmount: 10000,
		policy: {
			customerFeeMode: "pass_to_customer",
			customerFeePercentage: 0.04,
			customerFeeFixedCents: 0,
			scervFeeMode: "customer_fee",
			scervFeePercentage: 0.04,
			scervFeeFixedCents: 0,
			scervFeeCapCents: 0,
			scervFeeMinimumCents: 0,
		},
	});

	assert.deepEqual(financials, {
		merchantNetSalesAmount: 10000,
		taxAmount: 0,
		salesAndTaxAmount: 10000,
		customerServiceFeeAmount: 400,
		customerFeeBasisAmount: 10000,
		totalChargeAmount: 10400,
		scervPayLiteFeeAmount: 400,
		restaurantTransferAmount: 10000,
		customerFeeMode: "pass_to_customer",
		customerFeeBasis: undefined,
		taxMode: undefined,
		taxRate: undefined,
		scervFeeMode: "customer_fee",
	});
});

test("Pay Lite customer receipt is generated from payment and restaurant data", () => {
	const receipt = buildScervPayLiteCustomerReceipt({
		paymentIntentId: "pi_1234567890abcdef",
		issuedAt: new Date("2026-09-30T14:30:00.000Z"),
		restaurantData: {
			restaurantName: "Gemini Bar",
			address: "12 Main St",
			city: "Brooklyn",
			state: "NY",
			timeZone: "America/New_York",
		},
		payment: {
			restaurantId: "restaurant_gemini",
			merchantNetSalesAmount: 10000,
			taxAmount: 888,
			customerServiceFeeAmount: 436,
			gratuityAmount: 2000,
			amount: 13324,
			paidAt: "2026-09-30T14:30:00.000Z",
			enteredBy: { staffId: "staff_1", name: "Maya" },
			terminalReader: { label: "Front Bar S710", serialNumber: "STR710" },
			note: "POS 44",
		},
	});

	assert.equal(receipt.version, "pay_lite_receipt_v1");
	assert.equal(receipt.restaurantName, "Gemini Bar");
	assert.equal(receipt.receiptNumber, "90ABCDEF");
	assert.equal(receipt.amount, 13324);
	assert.equal(receipt.lineItems.at(-1).label, "Total paid");
	assert.match(receipt.printableText, /Sale amount: \$100\.00/);
	assert.match(receipt.printableText, /Tax: \$8\.88/);
	assert.match(receipt.printableText, /Card fee: \$4\.36/);
	assert.match(receipt.printableText, /Tip: \$20\.00/);
	assert.match(receipt.printableText, /Total paid: \$133\.24/);
	assert.match(receipt.printableText, /Staff: Maya/);
	assert.match(receipt.printableText, /Reader: Front Bar S710/);
});

test("Pay Lite daily report totals only paid Pay Lite transactions inside the selected day", () => {
	const startMs = Date.parse("2026-09-29T04:00:00.000Z");
	const endMs = Date.parse("2026-09-30T04:00:00.000Z");
	const report = buildScervPayLiteDailyReport({
		restaurantId: "restaurant_123",
		restaurantData: { restaurantName: "Harbor & Ember" },
		startMs,
		endMs,
		payments: [
			{
				id: "pi_old",
				type: "scerv_pay_lite",
				status: "succeeded",
				paidAt: "2026-09-28T23:59:00.000Z",
				amount: 2000,
				merchantNetSalesAmount: 2000,
			},
			{
				id: "pi_unpaid",
				type: "scerv_pay_lite",
				status: "requires_capture",
				paidAt: "2026-09-29T18:00:00.000Z",
				amount: 3000,
				merchantNetSalesAmount: 3000,
			},
			{
				id: "pi_other_flow",
				type: "terminal_closeout",
				status: "succeeded",
				paidAt: "2026-09-29T19:00:00.000Z",
				amount: 4000,
				merchantNetSalesAmount: 4000,
			},
			{
				id: "pi_first",
				type: "scerv_pay_lite",
				status: "succeeded",
				paidAt: "2026-09-29T16:30:00.000Z",
				amount: 10400,
				merchantNetSalesAmount: 10000,
				customerServiceFeeAmount: 400,
				gratuityAmount: 1800,
				applicationFeeAmount: 400,
				restaurantTransferAmount: 10000,
				enteredBy: { staffId: "staff_a", name: "Maya" },
				terminalReader: {
					label: "Harbor & Ember Bar",
					serialNumber: "STR710",
				},
				note: "POS 812",
			},
			{
				id: "pi_second",
				source: "scerv_pay_lite",
				paymentStatus: "paid",
				paidAt: "2026-09-29T20:15:00.000Z",
				amount: 5200,
				subtotal: 5000,
				customerServiceFee: 200,
				tipAmountCents: 900,
				scervPayLiteFeeAmount: 200,
				capturedBy: {
					staffId: "staff_b",
					enteredByName: "Jon",
				},
			},
		],
	});

	assert.equal(report.restaurantName, "Harbor & Ember");
	assert.equal(report.summary.transactionCount, 2);
	assert.equal(report.summary.merchantNetSalesAmount, 15000);
	assert.equal(report.summary.customerServiceFeeAmount, 600);
	assert.equal(report.summary.gratuityAmount, 2700);
	assert.equal(report.summary.amount, 15600);
	assert.equal(report.summary.applicationFeeAmount, 600);
	assert.equal(report.summary.restaurantTransferAmount, 15000);

	assert.deepEqual(
		report.transactions.map((transaction) => transaction.id),
		["pi_second", "pi_first"],
	);
	assert.equal(report.transactions[0].staffName, "Jon");
	assert.equal(report.transactions[0].restaurantTransferAmount, 5000);
	assert.equal(report.transactions[1].staffName, "Maya");
	assert.equal(report.transactions[1].readerLabel, "Harbor & Ember Bar");
	assert.equal(report.transactions[1].note, "POS 812");
});
