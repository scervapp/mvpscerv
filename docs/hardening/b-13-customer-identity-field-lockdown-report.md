# B-13 Customer Identity Field Lockdown Report

Date: 2026-09-27

Status: Fixed locally. Not deployed.

## Scope

B-13 removes client authority over legacy customer identity, role, payment mapping and balance fields. Customers should be able to maintain ordinary profile fields, but they must not be able to mark themselves verified, change their role, assign Stripe customer IDs or alter reward balances.

## Local Changes

- Removed native client writes to `isPhoneVerified` and `role` in phone/Twilio sign-in helper paths.
- Added Firestore rules helpers:
  - `customerSensitiveIdentityFields`
  - `customerCreateIsSafe`
  - `customerUpdateIsSafe`
- Customer profile create/update now denies client writes to:
  - `role`
  - `restaurantId`
  - `isPhoneVerified`
  - `phoneVerified`
  - `phoneNumberVerified`
  - `emailVerified`
  - `isEmailVerified`
  - `stripeCustomerId`
  - `stripeCustomerId_test`
  - `stripeCustomerId_live`
  - `availablePoints`
  - `scervAvailablePoints`
- Existing server/admin functions still use Admin SDK and are not blocked by Firestore client rules.

## Validation

- Firestore rules test coverage added for normal customer profile edits and denied sensitive-field writes.
- Native auth context parsed successfully with Babel parser.
- `npm run ci:backend` passed outside the sandbox after the sandbox runner hit Windows EPERM path-resolution issues. Result: secret scan passed, functions lint passed, unit tests passed and Firestore rules tests passed.

## Remaining Work Before Done

- Deploy to testing only after A-08 is resolved or explicitly waived.
- Device-test phone/OTP customer sign-in and profile refresh against testing.
- Confirm all future verification/balance/customer Stripe mapping changes happen through server functions or Firebase Auth provider state, not client document writes.
