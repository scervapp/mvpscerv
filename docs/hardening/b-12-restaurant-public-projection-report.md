# B-12 Restaurant Public Projection Report

Date: 2026-09-27

Status: Fixed locally. Not deployed.

## Scope

B-12 splits public restaurant discovery data from protected restaurant operational data. Public guests should be able to discover restaurants, view menus and start browser/native guest flows without reading processor IDs, account mode, test flags, entitlement internals or fee policy fields from raw `restaurants/{restaurantId}` documents.

## Local Changes

- Added `restaurantPublic/{restaurantId}` as the guest-readable restaurant profile collection.
- Added `functions/restaurantPublicProfile.js` with:
  - a public projection builder,
  - a Firestore trigger that syncs `restaurantPublic` when `restaurants/{restaurantId}` changes,
  - an admin-only `rebuildRestaurantPublicProfiles` callable for initial backfill.
- Exported:
  - `syncRestaurantPublicProfile`
  - `rebuildRestaurantPublicProfiles`
- Updated Firestore rules:
  - `restaurantPublic` is public read, server write only.
  - raw `restaurants` docs are readable only by the restaurant account/staff claim or Scerv admin roles.
- Switched guest-facing reads to `restaurantPublic`:
  - native customer discovery,
  - generic customer restaurant fetch helper,
  - customer restaurant detail refresh,
  - customer party checkout/session settings reads,
  - customer order-history restaurant-name lookup,
  - browser restaurant/ordering page lookup.
- Updated browser restaurant landing feature checks to use public `features` only, not internal entitlements.

## Protected Fields

The public projection intentionally excludes fields such as:

- `stripeAccountId`
- `stripeAccountId_live`
- `stripeAccountId_test`
- `stripeAccountMode`
- `stripeAccountStatus`
- `stripeChargesEnabled`
- `stripePayoutsEnabled`
- `featureEntitlements`
- `subscriptionFeatures`
- `feePolicy`
- `isTestAccount`
- internal reward audit/update fields

Guest-visible capability flags such as `features` and `canAcceptPayments` remain public because customers need to know whether reservations, QR check-in, ordering, rewards or payment are available.

## Backfill Requirement

The trigger keeps projections current after deployment, but it does not automatically create public docs for existing restaurants until those root docs are written.

Before deploying the tightened rules to testing:

1. Deploy the function changes to the target lane.
2. Call `rebuildRestaurantPublicProfiles` without confirmation and verify dry-run counts.
3. Call `rebuildRestaurantPublicProfiles` with `confirm: "rebuild-restaurant-public-profiles"` in the target lane.
4. Smoke test customer discovery, browser `/restaurants/:slug`, browser `/dine/...`, restaurant detail, party checkout and order history.
5. Only then deploy the Firestore rules that remove public reads from raw `restaurants`.

## Validation

- `node --check functions/restaurantPublicProfile.js` passed.
- `node --check functions/index.js` passed.
- Edited native/web JavaScript files parsed successfully with Babel parser.
- `npm.cmd --prefix functions run lint` passed.
- `npm run ci:backend` passed outside the sandbox after the sandbox runner hit Windows EPERM path-resolution issues. Result: secret scan passed, functions lint passed, 25 unit tests passed, 8 Firestore rules tests passed.

## Remaining Work Before Done

- Deploy to testing only after A-08 is resolved or explicitly waived.
- Run the projection rebuild in testing before tightening rules there.
- Device-test native customer discovery, QR/table flow, checkout and restaurant staff/admin portal reads in testing.
- Confirm admin portal direct reads continue working with Scerv admin custom claims.
