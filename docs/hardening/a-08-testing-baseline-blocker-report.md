# A-08 Testing Baseline Blocker Report

Date: 2026-09-27
Task: A-08 — Testing-lane baseline deploy
Evidence level: L
Deploy status: None

## Result

A-08 was originally not executed because the exact production source ref was unknown. On 2026-09-27, the founder explicitly approved waiving strict production-baseline parity and using the current hardening branch as the `scervmvp-testing` baseline. This changes A-08 from blocked to an approved non-production-parity baseline path.

The task requires deploying the A-06 verified production baseline source to `scervmvp-testing` and running a smoke script. Current evidence does not identify a deployable source ref that exactly represents the production application baseline.

## Why This Is Blocked

A-06 recorded these facts:

- `scervmvp-testing` currently has zero deployed functions.
- Production application functions are deployed, but the source ref for that deployed production function set is not recorded.
- Production and testing Firestore rules match each other, but they do not match the current local `firestore.rules` source.
- The current local branch contains hardening docs, deploy guards, CI gates, browser-ordering work and other post-production changes.

Additional read-only production function metadata was captured in
`docs/hardening/evidence/production-functions-source-metadata.json`:

- 133 production application functions were returned from the Cloud Functions v1 API.
- Those functions span 32 distinct `firebase-functions-hash` deployment labels.
- The largest deployment label covers 54 functions updated on 2026-06-05.
- Later deployment labels cover smaller groups on 2026-06-10, 2026-06-17 and 2026-06-18.
- These labels are Firebase deployment hashes, not proven Git commit SHAs.

That means production is currently a stitched deployed state, not a single known local source ref.

Deploying the current local branch to testing would violate the W0 rule:

> Baseline: A-06 verified production baseline source. Must not include any hardening.

## Required Before A-08 Can Run

One of these must happen:

1. Identify the exact source commit/ref that produced the current production application functions, then deploy that source to `scervmvp-testing`.
2. Create a deliberate founder-approved baseline source ref from production parity evidence, with explicit drift notes and a smoke checklist.
3. Replace A-08 with a new decision that testing should baseline from current source rather than production source, accepting that this is no longer a production-parity baseline.

## Recommendation

Proceed only under D-023, with explicit drift notes:

- This testing baseline is **current hardening source**, not exact production parity.
- Deploy functions before tightened Firestore rules.
- Backfill `restaurantPublic` before rules that remove public raw restaurant reads.
- Record every testing deploy command and smoke result.
- Do not deploy to production from this lane until testing QA and go/no-go evidence are complete.

## 2026-09-27 Testing Deploy Attempt

Command attempted:

```powershell
npx firebase-tools deploy --only functions --project scervmvp-testing
```

Result:

- Deploy guard passed for `functions` on `scervmvp-testing`.
- Functions lint predeploy passed.
- Firebase confirmed `cloudfunctions.googleapis.com` was enabled.
- Deploy failed before upload because `cloudbuild.googleapis.com` and `artifactregistry.googleapis.com` were missing, and `artifactregistry.googleapis.com` cannot be enabled unless `scervmvp-testing` is upgraded to Blaze.

New blocker: OQ-019.

## 2026-09-27 Testing Deploy Retry After Blaze Upgrade

Founder confirmed `scervmvp-testing` was upgraded to Blaze. Retry command:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60000'; npx.cmd firebase-tools deploy --only functions --project scervmvp-testing
```

Result:

- Deploy guard passed for `functions` on `scervmvp-testing`.
- Functions lint predeploy passed.
- Firebase confirmed `cloudfunctions.googleapis.com`, `cloudbuild.googleapis.com` and `artifactregistry.googleapis.com` were enabled.
- Raising `FUNCTIONS_DISCOVERY_TIMEOUT` to 60 seconds allowed Firebase function discovery to complete after the prior 10-second timeout.
- Deploy then failed before upload because `secretmanager.googleapis.com` is disabled for `scervmvp-testing`.
- Firebase also warned that Node.js 20 was deprecated on 2026-04-30 and will be decommissioned on 2026-10-31.

Resolved blocker: OQ-019.
New blocker: OQ-020.

## 2026-09-27 Testing Deploy Progress After Secret Manager Enablement

Secret and service setup performed:

- Founder enabled Secret Manager for `scervmvp-testing`.
- Engineering copied these dev test-mode secrets into `scervmvp-testing` without printing values: `STRIPE_PUBLISHABLE_KEY_TEST`, `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET_TEST`, `RESEND_API_KEY`.
- Engineering set disabled placeholders for testing live-mode names: `STRIPE_PUBLISHABLE_KEY_LIVE`, `STRIPE_SECRET_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_LIVE`.
- Engineering created Firestore database `(default)` in `nam5` for `scervmvp-testing`.
- Engineering enabled/verified `identitytoolkit.googleapis.com`, but this did not initialize Firebase Auth for auth trigger deployment.

Deploy progress:

- Single-function probe `functions:addItemToBasket` succeeded.
- Full functions deploy then created the bulk of the testing functions.
- Initial Firestore-trigger failures were resolved after creating the default Firestore database.
- Targeted redeploy succeeded for: `aggregateDishRating`, `aggregateMenuItemOrderStats`, `aggregateMenuItemRating`, `autoTranslateMenuItem`, `awardRewardsForPaidOrder`, `clearTable`, `handleCheckIn`, `syncCustomerSearchIndex`, `syncRestaurantPublicProfile`, `updateReservationTrustStats`.
- `functions:list --project scervmvp-testing` confirms the testing lane now has deployed Node.js 20 functions, including callable, HTTPS, scheduled and Firestore-triggered functions.

Remaining blocker:

- `onUserCreate` still fails to deploy because Firebase Auth is not enabled/initialized in `scervmvp-testing`.
- Retry after enabling `identitytoolkit.googleapis.com` failed with the same error:

```text
Failed to configure trigger for event-type:providers/firebase.auth/eventTypes/user.create resource:projects/scervmvp-testing service:firebaseauth.googleapis.com. Firebase Auth is not enabled in the project.
```

New blocker: OQ-021.
