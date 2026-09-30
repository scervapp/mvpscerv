# B-01 Node 22 Testing Runtime Report

Date: 2026-09-29  
Lane: `scervmvp-testing`  
Status: Done

## Objective

Move the testing Firebase Functions lane from Node.js 20 to Node.js 22 before live pilot work, without changing production.

## Source Change

- `functions/package.json` now declares `engines.node: "22"`.
- `functions/package-lock.json` root package metadata now declares `engines.node: "22"`.
- No production deploy was performed.

## Local Validation

Validated locally under Node.js `v22.11.0` / npm `10.9.0`.

Commands run:

```powershell
node --check functions\index.js
node --check functions\terminalFunctions.js
npm.cmd --prefix functions run lint
npm run ci:backend
```

Result:

- Functions syntax checks passed.
- Functions lint passed.
- Backend CI gate passed.
- Unit tests passed.
- Firestore rules tests passed.

## Testing Deploy

Initial broad deploy:

```powershell
npx firebase-tools deploy --only functions --project scervmvp-testing
```

Firebase updated most functions to Node.js 22 but hit quota/update scheduling failures on 11 functions.

The holdouts were then migrated one at a time using the verified target format:

```powershell
npx firebase-tools deploy --only functions:default:<functionName> --project scervmvp-testing
```

Functions migrated individually:

- `acceptWaitlistOffer`
- `approveReservation`
- `getAvailableReservationSlots`
- `joinParty`
- `listScervNewsletterSubscribers`
- `redeemCustomerPromotion`
- `setScervAdminUserDisabled`
- `setScervPayLiteOnlyMode`
- `submitScervDemoRequest`
- `updateScervAdminUserRole`
- `updateScervNewsletterSubscriber`

Firebase emitted repeated build-image cleanup warnings during deploys. The function updates completed successfully; the cleanup warning should be treated as artifact housekeeping, not runtime migration failure.

## Runtime Verification

Runtime inventory command:

```powershell
npx firebase-tools functions:list --project scervmvp-testing --json
```

Parsed result after all retries:

```text
runtime counts { nodejs22: 182 }
holdouts []
```

## Remaining Work

- Production runtime migration still needs founder approval and a separate production deploy window.
- Keep the runtime-only deploy discipline: production Node 22 migration should not be bundled with rules lockdown, Phase 2 payment changes, browser features, or unrelated product work.
- Firebase artifact cleanup warnings should be reviewed in Google Cloud Artifact Registry/GCR if charges or stale images become visible.

