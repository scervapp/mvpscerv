# B-14 Customer Fee, Rewards and Stripe Mapping Data Review

Date: 2026-09-27

Status: Done. Read-only production scan completed.

## Scope

B-14 reviews existing customer-owned financial, rewards and processor-mapping data that may have been written before the latest customer field lockdown. The purpose is to identify suspicious legacy values before Scerv signs the first live restaurant.

This was a read-only review. No production documents were changed.

## Evidence

- Scanner: `scripts/hardening/audit-customer-financial-data.js`
- Redacted production output: `docs/hardening/evidence/b-14-production-customer-financial-audit.json`
- Project: `scervmvp`
- Database: `(default)`
- Actor: Firebase CLI account `scervapp@gmail.com`
- Limit: 1,000 documents per audited collection/query

## Production Scan Summary

| Area | Result |
| --- | --- |
| Customer documents scanned | 48 |
| Root `availablePoints` / `scervAvailablePoints` fields | 0 |
| Customer docs with legacy `stripeCustomerId` | 0 |
| Customer docs with `stripeCustomerId_test` | 43 |
| Customer docs with `stripeCustomerId_live` | 43 |
| Malformed Stripe customer IDs found by prefix check | 0 |
| Customer docs with legacy authority fields | 43 with `role` |
| `restaurantClubs` subdocs scanned | 0 |
| Customer `promotions` subdocs scanned | 0 |

The output is intentionally redacted. It contains hashed document references and masked processor IDs only.

## Findings

1. **Legacy customer `role` field is present on most customer profiles.**
   - This is consistent with old client-created customer profiles.
   - B-13 now blocks future customer-client writes to `role`.
   - Existing values should not be used for authority decisions.

2. **Most existing customers have both test and live Stripe customer mappings.**
   - The IDs are structurally valid by prefix check.
   - This scan does not prove provider-side ownership or metadata correctness.
   - Current server helper creates/reuses customers by Firebase UID and environment metadata for future writes.

3. **No existing customer root point balances were found.**
   - `availablePoints` and `scervAvailablePoints` were not present at the customer root in the scanned production set.
   - Rewards appear to be using nested summary/ledger structures rather than legacy root balances.

4. **No restaurant-club or promotion customer subdocs were found in production.**
   - This matches the current “no live restaurants” posture.
   - There is no existing production restaurant-loyalty ledger to clean up before the first live pilot.

## Remediation Decision

Do not perform an emergency manual production edit today. Before the first live restaurant goes live:

- Remove legacy `role` fields from `customers/{customerId}` through an audited admin/server maintenance action.
- Treat any customer document role as non-authoritative even before cleanup.
- Reconcile existing Stripe customer IDs by provider metadata before trusting them for live payment reuse.
- Never relabel or reuse a Stripe customer record for a different Firebase UID.
- Keep future customer Stripe mappings server-owned only.

This decision is acceptable because the founder confirmed there are no current live restaurants and no active production restaurant payments.

## Remaining Work

- Build or run an audited cleanup utility for legacy customer `role` fields after testing-lane deploy strategy is resolved.
- Add Stripe provider reconciliation to the Phase C payment evidence packet, especially for live-mode customer mappings.
- Rerun this scanner after any customer cleanup and again before production pilot go/no-go.
