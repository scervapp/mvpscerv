# A-08 Testing Baseline Blocker Report

Date: 2026-09-27
Task: A-08 — Testing-lane baseline deploy
Evidence level: L + T
Deploy status: Testing functions deployed; focused backend smoke passed

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

## 2026-09-27 Testing Deploy After Auth Initialization

Founder initialized Firebase Auth for `scervmvp-testing` in the Firebase console. Retry command:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60000'; npx.cmd firebase-tools deploy --only functions:onUserCreate --project scervmvp-testing
```

Result:

- Deploy guard passed for `functions` on `scervmvp-testing`.
- Functions lint predeploy passed.
- `onUserCreate(us-central1)` completed successfully.
- `functions:list --project scervmvp-testing --json` returned success and active Node.js 20 functions, including callable, HTTPS, scheduled, Firestore-triggered and Auth-triggered functions.
- Firebase emitted a non-blocking cleanup warning for old build images. Follow-up cleanup URL shown by Firebase: `https://console.cloud.google.com/gcr/images/scervmvp-testing/us/gcf`.

Minimal smoke:

```powershell
Invoke-RestMethod -Method Post -Uri 'https://us-central1-scervmvp-testing.cloudfunctions.net/checkClientVersion' -ContentType 'application/json' -Body '{"data":{"platform":"ios","nativeVersion":"0.0.0","nativeBuild":"1"}}'
```

Result:

- Callable returned `updateRequired: false`.
- Callable exercised the deployed testing function and a Firestore read of `appConfig/clientVersions`.

Resolved blocker: OQ-021.
Remaining A-08 work: broader baseline smoke is still pending; do not treat this as device QA or full app-flow verification.

## 2026-09-27 Focused Testing-Lane Smoke

Scope: backend/testing-lane smoke only. This did not exercise real devices, native builds, browser checkout with Stripe redirect, QR table flows, reservations or staff KDS workflows.

Testing lane checks:

- `firebase use --project scervmvp-testing` selected `scervmvp-testing`.
- `firestore:databases:get '(default)' --project scervmvp-testing` confirmed the default Firestore Native database exists in `nam5`.
- `functions:list --project scervmvp-testing --json` returned `177` deployed functions.
- All `177` deployed functions reported `ACTIVE`.
- All `177` deployed functions reported runtime `nodejs20`.
- Browser/table/payment-related callable names were present, including `resolveBrowserTableToken`, `createBrowserTableSession`, `addBrowserBasketItem`, `updateBrowserBasketItem`, `removeBrowserBasketItem`, `submitBrowserBasketToKitchen`, `createBrowserCheckoutSession`, `syncBrowserCheckoutSession` and `getBrowserOrderStatus`.

Callable success smoke:

- `checkClientVersion` returned `updateRequired: false` and `reason: supported` for a synthetic iOS client request.

Callable validation smoke:

- `submitScervNewsletterSignup` with `email: "not-an-email"` returned HTTP `400` with `INVALID_ARGUMENT`.
- This proves the deployed testing callable rejects invalid input before accepting the request.

Local backend safety net:

- `npm run ci:backend` passed outside the sandbox after the Windows sandbox hit the known `EPERM` path-resolution issue.
- Secret hygiene check passed.
- Functions lint passed.
- Backend unit tests passed: `25` passed, `0` failed.
- Firestore emulator rules tests passed: `9` passed, `0` failed.

Current A-08 conclusion:

- The testing lane is no longer blocked by Blaze, Secret Manager, Firestore database creation or Firebase Auth initialization.
- The deployed backend baseline is reachable and healthy for focused callables.
- A-08 remains **In progress** until broader app-flow smoke is run in testing, including QR/table session, browser basket-to-kitchen, Stripe test checkout, reservation/check-in and restaurant staff operational screens.
- Tightened Firestore rules still require their own staged rules-lane deployment and should not be bundled into a broad feature deploy.

## 2026-09-27 Native Stripe Payment Smoke

Scope: real-device native checkout smoke in `scervmvp-testing` using a test restaurant configured for Stripe test mode. This was a payment-path smoke, not full end-to-end restaurant QA.

Observed issue and repair:

- Initial native party checkout reached `preparePayment` but failed with Stripe `ERR_INVALID_CHAR` in the Authorization header.
- The testing `STRIPE_SECRET_KEY_TEST` Secret Manager value was inspected without printing the key. A clean latest version was created; local Stripe probe returned HTTP `200`.
- `preparePayment` was redeployed with the hardened Stripe secret normalizer and returned HTTP `200`.
- Payment then reached the native payment details path, but `finalizeStripePayment` failed with the same stale Authorization-header issue.
- `finalizeStripePayment` was redeployed onto the hardened Stripe secret path.

Founder device result:

- Native payment subsequently completed successfully in `scervmvp-testing`.

Evidence notes:

- Permanent code fix is committed as `9b90cc8 Extract Stripe secret token before client init`, following `8ee6d57 Harden Stripe secret normalization`.
- Deployed testing payment functions were refreshed after the successful device payment to remove temporary diagnostic logging.
- The root cause was not the restaurant `isLive` flag. The restaurant was live/visible but remained in test payment mode through `isTestAccount: true`, `stripeAccountMode: test` and a test Stripe account.

Automated safety-net refresh after the payment repair:

- `npm run ci:backend` could not complete as a single command because an existing local process occupied Firestore emulator port `8080`.
- The completed portions of that command passed: secret hygiene, functions lint and `25` backend unit tests.
- The Firestore rules suite was rerun with a temporary root-level emulator config on port `18081` so the real `firestore.rules` source loaded.
- Firestore rules tests passed: `9` passed, `0` failed.

Remaining A-08 work after this smoke:

- QR/table session smoke.
- Browser basket-to-kitchen smoke.
- Browser checkout/confirmation smoke.
- Reservation/check-in smoke.
- Restaurant staff operational screens smoke, including KDS, active tables, host stand and reports.
