# B-05 W2 Hardened Handlers Testing Report

Date: 2026-09-29  
Task: B-05 - Wave W2 staff-session backend + hardened handlers  
Evidence level: T + L  
Deploy status: On testing

## Scope

W2 moves high-risk restaurant operational reads and selected mutations toward callable boundaries before Firestore rules are tightened. This report covers the additive backend callable surface deployed to `scervmvp-testing`.

New testing callables deployed in this pass:

- `listStaffMenuItems`
- `mutateRestaurantMenuItem`
- `listStaffKitchenOrders`
- `listStaffActiveTables`
- `getStaffPartyDetail`
- `getStaffOrderDetail`
- `listStaffPickupOrders`
- `listStaffHostCheckIns`
- `listStaffServiceRequests`
- `listStaffReservationOperations`

Already-deployed W2-adjacent endpoints verified in testing inventory include:

- `verifyEmployeePin`
- `addTable`, `updateTable`, `deleteTable`, `regenerateTableQrToken`, `setTableQrEnabled`, `ensureRestaurantTableQrTokens`
- `startWorkDay`, `endWorkDay`
- `handleCheckInResponse`
- `seatReservation`, `approveReservation`, `declineReservation`, `updateReservationStatus`, `restaurantOfferWaitlistSlot`
- `getDashboardReport`, `getOrdersLedger`, `getOrderDetail`, `getDailySalesReport`
- `sendEmailOtp`, `verifyEmailOtp`, `completeBrowserGuestIdentity`
- inactive legacy rail exports: PayPal and dLocal fail-closed callables

## Source Changes

Implemented server-shaped staff operational reads and a bounded menu mutation endpoint in:

- `functions/restaurantFunctions.js`
- `functions/index.js`

Each new callable checks restaurant staff authority before returning operational data. The two detail endpoints were corrected after smoke testing so unauthenticated requests return `UNAUTHENTICATED` before any document existence lookup.

## Deploy Notes

The grouped Firebase deploy filter again failed with `No function matches given --only filters`, even though local module discovery confirmed the exports. Individual plain targets succeeded, matching D-026.

Representative commands:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:listStaffMenuItems --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:mutateRestaurantMenuItem --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:listStaffKitchenOrders --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:listStaffActiveTables --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:getStaffPartyDetail --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:getStaffOrderDetail --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:listStaffPickupOrders --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:listStaffHostCheckIns --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:listStaffServiceRequests --project scervmvp-testing
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'; npx firebase-tools deploy --only functions:listStaffReservationOperations --project scervmvp-testing
```

Firebase emitted the existing non-blocking build-image cleanup warning after deploys.

## Testing Inventory

`functions:list --project scervmvp-testing --json` after deploy:

- Total functions: `199`
- Runtime count: `nodejs22: 199`
- Node 22 holdouts: `0`
- All ten new W2 callables are active in `us-central1`.

## Smoke Results

Unauthenticated smoke with shaped payloads confirmed the new endpoints are live and fail closed:

| Callable | Result |
| --- | --- |
| `listStaffMenuItems` | HTTP `401`, `UNAUTHENTICATED` |
| `mutateRestaurantMenuItem` | HTTP `401`, `UNAUTHENTICATED` |
| `listStaffKitchenOrders` | HTTP `401`, `UNAUTHENTICATED` |
| `listStaffActiveTables` | HTTP `401`, `UNAUTHENTICATED` |
| `getStaffPartyDetail` | HTTP `401`, `UNAUTHENTICATED` after auth-order fix |
| `getStaffOrderDetail` | HTTP `401`, `UNAUTHENTICATED` after auth-order fix |
| `listStaffPickupOrders` | HTTP `401`, `UNAUTHENTICATED` |
| `listStaffHostCheckIns` | HTTP `401`, `UNAUTHENTICATED` |
| `listStaffServiceRequests` | HTTP `401`, `UNAUTHENTICATED` |
| `listStaffReservationOperations` | HTTP `401`, `UNAUTHENTICATED` |

## Local Validation

Passed:

- `node --check functions\restaurantFunctions.js`
- `node --check functions\index.js`
- `npm.cmd --prefix functions run lint`
- `npm run ci:backend` through secret hygiene, functions lint and `27` backend unit tests
- `npm run test:rules` after stopping a stale Firestore emulator on port `8080`: `9` rules tests passed

The first `npm run ci:backend` attempt stopped at the rules phase because port `8080` was occupied by stale PID `29352`. After `Stop-Process -Id 29352 -Force`, the rules suite passed.

## Limits

B-05 is `On testing`, not `Done`.

Known gaps before B-05 can be closed:

- Current client code still has several direct Firestore listeners for restaurant operational screens. B-06 must migrate compatible testing clients to these callables before rules lockdown.
- The current source still relies mainly on active staff profile IDs from the PIN unlock flow. It does not yet fully enforce a server-issued staff session credential across every callable. That must remain explicit in the compatibility and rules-lockdown plan.
- The new staff read callables are polling-friendly. For screens that require near-realtime behavior, the final design may prefer server-written projection documents with narrow listener rules instead of high-frequency callable polling.
- No physical staff-device QA was run in this pass.

## Status

B-05 is now `On testing`.

Next required work:

1. Build/install the testing-profile client that consumes the W2 callables.
2. Run staff-device QA for KDS, active tables, host stand, reservations, party detail, menu management, service requests and pickup.
3. Record old-client behavior where direct Firestore reads continue to work until the rules wave, then define expected failures after rules lockdown.
4. Do not deploy rules R1-R4 until B-06/B-07 evidence exists.
