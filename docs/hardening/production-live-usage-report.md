# Production live-usage report

Task: A-07
Project: `scervmvp`
Database: `(default)`
Generated: 2026-09-27T03:50:28-04:00
Evidence file: `docs/hardening/evidence/production-live-usage-inventory.json`

## Scope

This report uses read-only Firestore aggregate counts. It does not export document IDs, customer records, payment intent IDs, emails, names or raw documents.

This report does not verify the Stripe dashboard directly. Stripe live-mode activity still requires founder/provider confirmation or an approved read-only Stripe reporting path.

## Production Firestore findings

| Area | Count / result | Interpretation |
| --- | ---: | --- |
| Restaurants | 1 total | Production has one restaurant record |
| Active restaurants | 1 | The restaurant is active in data |
| Live restaurants | 0 | No restaurant is marked `isLive: true` |
| Test restaurants | 1 | The only restaurant is marked `isTestAccount: true` |
| Restaurants accepting payments | 0 | No restaurant is marked `canAcceptPayments: true` |
| Restaurants with live Stripe mode | 0 | No restaurant has `stripeAccountMode: live` |
| Customers | 48 | Customer auth/data exists in production |
| Orders | 0 | No canonical completed order documents exist |
| Paid/completed orders | 0 | No paid/completed canonical orders found |
| Pending orders | 29 | Historical/unfinished payment flow records exist |
| Pending orders marked paid | 29 | These need review before any production cleanup, but they did not produce canonical orders |
| Terminal payments | 7 | Historical Terminal payment records exist |
| Terminal payments marked paid | 7 | These need provider-side reconciliation before cleanup |
| Parties / active parties | 0 / 0 | No active dining sessions found |
| Kitchen orders | 0 | No active/historical kitchen queue records found at top level |
| Browser table sessions | 0 | No browser table sessions found |
| Check-ins | 0 | No current check-in records found |
| Reservations / waitlist | 0 / 0 | No reservation traffic found |
| Payment events | 36 | Top-level payment event records exist; no top-level succeeded/paid/processing/live/test status counts found in checked fields |

## Current answer

Engineering finding: production Firestore does not show evidence of live restaurant operation or completed paid order activity. The only restaurant is a test account, no restaurant is marked live, no restaurant can accept payments, and no canonical orders exist.

Open caveat: Stripe live-mode dashboard activity has not been independently verified in this task. The old `pending_orders`, `terminal_payments` and `payment_events` records should be treated as historical payment-attempt residue until reconciled with Stripe.

## Recommendation

Do not treat production as fully clean yet. Before Phase A exits:

- Founder should confirm Stripe live-mode activity for the same period.
- Engineering should avoid deleting or rewriting old payment-attempt records until a separate cleanup decision is made.
- If Stripe confirms no real money movement, A-09 can be deferred because there is no live operational exposure to contain.
