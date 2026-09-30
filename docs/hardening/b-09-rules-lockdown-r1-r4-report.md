# B-09 Firestore Rules Lockdown R1-R4 Report

Date: 2026-09-30
Project lane: `scervmvp-testing`
Status: R1 deployed to testing; R2 prepared locally; R2 deploy blocked until compatible client build is installed.

## Objective

Deploy Firestore rules lockdown steps R1 through R4 separately, with local rules tests before each deploy and testing-lane evidence after each deploy.

R1 is deployed to testing. R2 is prepared and verified locally, but held from testing deploy until a compatible native testing build is installed. R3-R4 remain pending.

## R1 Scope

R1 denies all client access to server-owned vault and payment-boundary collections:

- `staffSessions`
- `staffPinAttempts`
- `emailOtpChallenges`
- `pending_orders`
- `terminal_payments`

These collections are now intended to be accessed only through trusted backend functions or provider-owned flows. Native and browser clients should use the hardened callable paths and should not read or write these collections directly.

## Local Changes

- Added explicit fail-closed Firestore rules for:
  - `staffSessions/{sessionId}`
  - `staffPinAttempts/{attemptId}`
  - `emailOtpChallenges/{challengeId}`
- Changed `pending_orders/{orderId}` from legacy customer-create/read behavior to deny all client access.
- Changed `terminal_payments/{paymentId}` from restaurant-user read access to deny all client access.
- Replaced the legacy pending-order rules test with an R1 deny-all test covering customer and staff reads plus client writes.

## Verification

Command:

```powershell
npm.cmd run test:rules
```

Result:

- Firestore emulator rules tests: 9 passed, 0 failed.
- The first sandboxed attempt failed with Windows `EPERM: operation not permitted, lstat 'C:\Users\19102'`; rerun outside the sandbox completed successfully.

## Deploy Status

R1 deployed to `scervmvp-testing`.

Command:

```powershell
npm.cmd run deploy:rules:testing
```

Result:

- Firebase deploy guard passed for `firestore:rules` on `scervmvp-testing`.
- Firestore rules compiled successfully.
- Firestore rules released to `cloud.firestore`.

The first deploy also succeeded, but Firebase warned that `isPendingOrderOwner` was unused after `pending_orders` became deny-all. The helper was removed, the rules suite was rerun successfully, and the cleaned rules file was redeployed without that warning.

## Deployed R1 Smoke

Command: one-off Firebase client SDK smoke against `scervmvp-testing`.

Result:

- `staffSessions/deployed-smoke`: read denied, write denied.
- `staffPinAttempts/deployed-smoke`: read denied, write denied.
- `emailOtpChallenges/deployed-smoke`: read denied, write denied.
- `pending_orders/deployed-smoke`: read denied, write denied.
- `terminal_payments/deployed-smoke`: read denied, write denied.
- Command exited successfully after explicit Firestore SDK termination.

Next action: run a testing-lane app smoke focused on checkout, Terminal/Pay Lite status, OTP login and staff PIN unlock before moving to R2.

## Risk Notes

- Any old client still attempting to create `pending_orders` directly will now fail closed. Current payment paths should use server-priced Stripe preparation/finalization instead.
- Any screen still reading `terminal_payments` directly will fail after R1. The current Pay Lite report path should use `getScervPayLiteDailyReport`.
- R1 does not lock down employee private records, menu writes, restaurant updates, customer field allowlists beyond what already exists, or operational collections like `parties`, `shared_baskets`, `checkIns` and `kitchen_orders`.

## Remaining B-09 Work

- R1 app smoke focused on checkout, Terminal/Pay Lite status, OTP login and staff PIN unlock.
- R2 compatible native testing build and install.
- R2 testing-lane deploy and smoke.
- R3: menu/table/profile/work-day/payment-event/raw-order lockdown.
- R4: customer field allowlist, restaurant create allowlist and legacy OTP deny verification.

## R2 Local Preparation

R2 source is prepared locally but is not deployed.

Local changes:

- `src/utils/firebaseUtils.js` now resolves employee lists through `listStaffDirectory` instead of direct `restaurants/{restaurantId}/employees` reads.
- `fetchEmployeesByRole`, `fetchEmployeesByJobTitle` and `fetchEmployees` retain their existing caller-facing contracts while using the hardened callable result.
- `restaurants/{restaurantId}/employees/{employeeId}` now denies all client read/write access.
- `restaurants/{restaurantId}/private/{docId}` now denies all client read/write access.
- The broad recursive `restaurants/{restaurantId}/{document=**}` client read grant was removed.
- Added rules coverage proving restaurant owner/manager/server clients cannot read employee docs, private owner docs or arbitrary reservation-settings subdocs through the old recursive grant.

Local verification:

```powershell
node --check src\utils\firebaseUtils.js
npm.cmd run test:rules
```

Result:

- `src\utils\firebaseUtils.js` syntax passed.
- Firestore emulator rules tests: 10 passed, 0 failed.

Deployment blocker:

- The currently installed Android testing app was built before this helper migration. Deploying R2 rules now would risk breaking lock-screen staff selection, table/server assignment and back-office manager verification on that installed build.
- R2 requires a new testing-profile native build installed on the test device, followed by device smoke of POS unlock, manager back-office verification, host seating/table-server assignment and table selection.
