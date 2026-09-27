# B-15 Staff PIN Historical Exposure Assessment

Date: 2026-09-27

Status: Done. Read-only production scan completed.

## Scope

B-15 assesses whether existing production staff PIN material requires a reset before Scerv signs the first live restaurant. It covers current source behavior, Firestore rules posture and production data presence.

This was a read-only review. No production documents were changed.

## Evidence

- Scanner: `scripts/hardening/audit-staff-pin-exposure.js`
- Redacted production output: `docs/hardening/evidence/b-15-production-staff-pin-exposure-audit.json`
- Project: `scervmvp`
- Database: `(default)`
- Actor: Firebase CLI account `scervapp@gmail.com`
- Limit: 1,000 documents per audited collection/query

## Production Scan Summary

| Area | Result |
| --- | --- |
| `restaurants/*/employees/*` docs scanned | 0 |
| Employee docs with `pinHash` | 0 |
| Employee docs with plaintext `pin` | 0 |
| Top-level `staffSessions` docs scanned | 0 |
| Top-level `staffPinAttempts` docs scanned | 0 |
| `private` collection-group docs scanned | 1 |
| Employee private docs found | 0 |

The output is intentionally redacted. It contains counts and hashed references only.

## Source Assessment

- Staff PIN creation/update uses bcrypt hashing in the current source.
- Legacy plaintext `pin` fields are deleted during update/reset paths.
- `verifyEmployeePin` compares the entered PIN against `pinHash` server-side and returns a shaped employee object without the hash.
- Staff directory/read callables have been migrated in prior hardening work to return display fields only.
- Current Firestore rules still allow a signed-in restaurant account to read `restaurants/{restaurantId}/employees/{employeeId}` directly. If an employee document contains `pinHash`, an old or modified restaurant client could read that hash until the rules lockdown wave removes direct employee reads.

## Findings

1. **No production staff PIN reset is required today.**
   - Production contains no employee docs and no staff-session/PIN-attempt records.
   - There are no production staff PIN hashes to rotate.

2. **The rule posture still requires a hardened rollout before live staff onboarding.**
   - Future staff PIN hashes should not be placed into a broadly readable employee document under the current rules posture.
   - B-09/rules-lockdown and compatible restaurant clients remain required before live operations.

3. **Dev/demo/testing staff PINs are not production authority.**
   - Any demo or testing restaurant employees should be recreated or reset before being treated as live operating credentials.

## Reset Decision

No production PIN reset action is required now because there are no production employee PIN records. Before the first live restaurant:

- Deploy the compatible hardened staff client/backend/rules path through testing.
- Create or reset live staff PINs only after direct employee hash reads are blocked.
- Treat any pre-hardening demo/testing PINs as non-production and rotate them if a demo restaurant becomes a real pilot account.

## Remaining Work

- Complete the rules lockdown wave that removes direct client reads of employee docs containing `pinHash`.
- Device-test staff unlock, role switching, employee create/update, PIN reset and deactivation on the testing lane.
- Re-run this scan before production pilot go/no-go.
