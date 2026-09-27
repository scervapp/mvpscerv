# B-02 Admin God-Mode Containment Report

Date: 2026-09-27

Status: Fixed locally. Not deployed.

## Scope

B-02 targets the raw Firestore data-explorer endpoints:

- `getScervFirestoreCollection`
- `getScervFirestoreDocument`
- `setScervFirestoreDocument`
- `deleteScervFirestoreDocument`

## Local Changes

- Added `functions/adminRawAccess.js` for testable raw-access policy helpers.
- Raw writes now default to disabled unless the server-side flag is explicitly set:
  - `SCERV_ADMIN_RAW_WRITE_ENABLED=true`, or
  - legacy functions config `scerv.admin_raw_write_enabled=true`.
- Raw set/delete now deny sensitive operational and payment paths:
  - session, OTP and PIN-attempt collections
  - order, pending-order, payment, Stripe, refund and ledger surfaces
  - admin audit logs
  - restaurant/customer private subdocuments
- Raw read endpoints remain godmode-only and now write audit records before returning data.
- Raw set/delete now run in Firestore transactions that write the audit record before the mutation.
- Raw write audit payloads include:
  - actor UID
  - runtime project/environment
  - target path
  - reason
  - merge mode for set
  - payload keys for set
  - before hash
  - after hash

## Validation

- `node --check functions/adminFunctions.js` passed.
- `node --check functions/adminRawAccess.js` passed.
- `npm.cmd --prefix functions run lint` passed.
- `npm run test:functions` passed outside the sandbox after the sandbox runner hit a Windows EPERM path-resolution error. Result: 11 passing unit tests.
- `npm run ci:backend` passed outside the sandbox after the sandbox runner hit the same Windows EPERM path-resolution error. Result: secret scan passed, functions lint passed, 11 unit tests passed, 5 Firestore rules tests passed.

## Remaining Work Before Testing Deploy

- Decide whether production should ever allow break-glass raw writes. Default remains off.
- Deploy only to the testing lane after the A-08 baseline issue is resolved or explicitly waived.
