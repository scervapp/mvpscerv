# B-08 Physical Terminal / Scerv Pay Lite QA

Date: 2026-09-29

Status: In progress. Testing callable and app surface are implemented; physical receipt/share/print behavior still needs real-device QA.

## Scope

This document covers the first live bar workflow:

- A server/bartender signs into the restaurant tablet with a staff PIN.
- If `scervPayLiteOnlyMode` is enabled, the tablet opens Scerv Pay Lite directly.
- The S710 connects automatically from the restaurant's configured default collector.
- Staff enters the POS sale amount from the existing POS.
- The customer pays on the Stripe Terminal reader and can add a tip on the reader.
- Scerv records staff, time, reader, POS note, card total, tip, customer card fee, Scerv fee and restaurant target amount.
- A manager opens the Pay Lite daily receipt from Back Office and shares/prints it for reconciliation.

This does not certify browser ordering, native party checkout, split payments, open tabs, kitchen pacing or full-shift production readiness.

## Current Implementation Evidence

- `getScervPayLiteDailyReport` callable added and deployed to `scervmvp-testing`.
- Pay Lite charge screen no longer displays customer fee, Scerv fee or restaurant payout details.
- Pay Lite manager report added at Back Office -> Pay Lite Receipt.
- Report share/print uses the native share sheet as the MVP print/export mechanism.
- Unit coverage added in `tests/unit/pay-lite-report.test.cjs`.
- `npm run test:functions` passed with 27/27 unit tests.
- `npm.cmd --prefix functions run lint` passed.

## Required Device QA Before Live Use

Run each item on the actual pilot tablet and S710 in the testing lane first.

| ID | Scenario | Expected result | Evidence |
| --- | --- | --- | --- |
| T-01 | Staff PIN opens Pay Lite when Pay Lite-only mode is enabled | Server/bartender lands directly on compact Pay Lite collect screen | Photo/video |
| T-02 | S710 auto-connects from default collector | Screen shows connected S710 without manual reader buttons | Photo/video + Metro log |
| T-03 | Enter POS amount and collect card payment | S710 displays payment, customer completes card flow, app records success | Stripe test PaymentIntent ID |
| T-04 | Customer adds tip on reader | Daily receipt shows tip amount tied to the correct staff member and payment time | Screenshot |
| T-05 | Cancel on reader | App returns a clear canceled/payment not completed state and no paid report row is created | Screenshot + Stripe event |
| T-06 | Reopen app/tablet after successful payment | Daily receipt still shows the completed payment | Screenshot |
| T-07 | Back Office Pay Lite Receipt opens as manager | Manager can see daily summary and transaction rows | Screenshot |
| T-08 | Server/bartender cannot access manager back office receipt without manager privileges | Access denied or not reachable from server-only flow | Screenshot |
| T-09 | Share / Print daily receipt | Android share sheet opens and can send to available print/PDF/email target | Photo/video |
| T-10 | Reconcile against existing POS | POS sale totals and transaction times match the Pay Lite receipt rows | Signed note |

## Go / No-Go

Minimum live go criteria for the bar:

- T-01 through T-07 pass.
- At least one successful S710 test payment includes a tip and appears correctly in the Pay Lite Receipt.
- Stripe Dashboard PaymentIntent amount equals the Scerv card total.
- The Pay Lite Receipt POS sales total equals the intended existing-POS sales total for the test run.
- Share/print works well enough for the operator's current reconciliation process, or a temporary manual export process is documented.

No-go conditions:

- S710 cannot auto-connect reliably.
- A successful card payment does not appear in the daily receipt.
- Staff identity is missing or wrong on report rows.
- Tip amount is missing or assigned to the wrong transaction.
- Stripe payment amount does not match the Scerv-recorded card total.

## Remaining Risks

- Native share/print depends on Android device capabilities and installed print/share targets. A dedicated printer connector remains future work.
- Stripe payout timing and Stripe fee reporting are not the same thing as Scerv's Pay Lite daily receipt. The receipt is an operational reconciliation report, not a bank deposit statement.
- Full platform money correctness still depends on Phase C: allocation, webhook idempotency, fulfillment outbox and reconciliation.
