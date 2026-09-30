# B-04 W1 Additive Callables Smoke Report

Date: 2026-09-29
Task: B-04 - Wave W1 additive callables, no rules change
Evidence level: T + L
Deploy status: On testing

## Scope

W1 adds read-only callable surfaces needed before Firestore direct-read lockdown. This wave deliberately avoids rules changes and avoids changing old-client behavior.

New callables:

- `listStaffDirectory`
- `getCurrentWorkDayStatus`
- `getStaffRestaurantProfile`
- `getStaffBackOfficeSetupStatus`
- `getStaffTerminalPaymentStatus`
- `getStaffReservationSettings`
- `getStaffRewardsSettings`

## Source Changes

Implemented sanitized callable reads in:

- `functions/restaurantFunctions.js`
- `functions/terminalFunctions.js`
- `functions/reservationFunctions.js`
- `functions/rewardsFunctions.js`
- `functions/index.js`

These endpoints return bounded operational shapes only. They do not spread raw Firestore documents into responses and do not expose PINs, Stripe client secrets, platform fee policy, unknown employee fields or raw payment provider objects.

## Deploy Notes

Initial deploy using the codebase-qualified target form uploaded the bundle but did not create the new functions. Individual deploys using plain function targets created the endpoints successfully.

Commands used:

```powershell
npx firebase-tools deploy --only functions:listStaffDirectory --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:getCurrentWorkDayStatus --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:getStaffRestaurantProfile --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:getStaffBackOfficeSetupStatus --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:getStaffTerminalPaymentStatus --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:getStaffReservationSettings --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:getStaffRewardsSettings --project scervmvp-testing
```

Firebase emitted the existing non-blocking build-image cleanup warning after deploys. The functions deployed successfully.

## Testing Inventory

`functions:list --project scervmvp-testing --json` after deploy:

- Total functions: `189`
- Runtime count: `nodejs22: 189`
- All seven W1 functions are active in `us-central1`.

## Smoke Results

Unauthenticated smoke confirmed endpoints are live and fail closed:

| Callable | Result |
| --- | --- |
| `listStaffDirectory` | HTTP `401`, `UNAUTHENTICATED` |
| `getCurrentWorkDayStatus` | HTTP `401`, `UNAUTHENTICATED` |
| `getStaffRestaurantProfile` | HTTP `401`, `UNAUTHENTICATED` |
| `getStaffBackOfficeSetupStatus` | HTTP `401`, `UNAUTHENTICATED` |
| `getStaffTerminalPaymentStatus` with shaped dummy payload | HTTP `401`, `UNAUTHENTICATED` |
| `getStaffReservationSettings` with shaped dummy payload | HTTP `401`, `UNAUTHENTICATED` |
| `getStaffRewardsSettings` with shaped dummy payload | HTTP `401`, `UNAUTHENTICATED` |

Empty-payload requests for `getStaffTerminalPaymentStatus`, `getStaffReservationSettings` and `getStaffRewardsSettings` return `INVALID_ARGUMENT` before auth because the payload shape is invalid. Shaped unauthenticated requests hit the auth gate as expected.

## Local Validation

Passed:

- `node --check` for edited function files
- `npm.cmd --prefix functions run lint`
- `npm run ci:backend`
  - secret hygiene passed
  - functions lint passed
  - backend unit tests passed: `27`
  - Firestore emulator rules tests passed: `9`

After replacing the back-office active-employee inequality count with an index-safe in-memory count, validation was refreshed:

- `node --check functions\restaurantFunctions.js` passed.
- `npm.cmd --prefix functions run lint` passed.
- `getStaffBackOfficeSetupStatus` was redeployed and returned HTTP `401` / `UNAUTHENTICATED` on unauthenticated smoke.
- `npm run ci:backend` passed secret hygiene, functions lint and `27` unit tests, then stopped because a stale Firestore emulator Java process occupied port `8080`.
- After stopping that emulator process, `npm run test:rules` passed: `9` rules tests, `0` failed.

## Status

B-04 is `On testing`, not `Done`.

Remaining exit evidence:

- Run old testing client against the testing lane and confirm no regressions.
- Run restaurant staff screens that should eventually consume these callables: staff directory, dashboard work-day state, profile/settings, rewards settings, back-office checklist and Terminal payment status.
- Do not deploy Firestore rules lockdown until client usage is verified and compatibility evidence is updated.
