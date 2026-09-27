# B-11 Search PIPs Privacy Review

Date: 2026-09-27

Status: Fixed locally. Not deployed.

## Scope

B-11 reviews the `searchPIPs` callable because it searches customer profiles and is used by guests to add people to their saved party list.

## Findings

- The endpoint required authentication and excluded the caller.
- The endpoint limited results to 10 and required a three-character search term.
- The endpoint returned full customer email addresses in search results even though the client only needs user ID and display name to add a person.

## Local Changes

- Added `functions/userSearchPrivacy.js`.
- `searchPIPs` now returns:
  - `id`
  - `name`
  - `emailHint`
- Raw email, phone number, reward totals and other profile data are not returned by the shaped result.
- The customer PIP screen now displays `emailHint` when present and remains backward-compatible with older `email` responses.

## Validation

- `node --check functions/userSearchPrivacy.js` passed.
- `node --check functions/userSearchFunctions.js` passed.
- `npm.cmd --prefix functions run lint` passed.
- `npm run ci:backend` passed outside the sandbox after the sandbox runner hit a Windows EPERM path-resolution error. Result: secret scan passed, functions lint passed, 19 unit tests passed, 6 Firestore rules tests passed.

## Remaining Work Before Done

- Deploy to testing after A-08 is resolved or explicitly waived.
- Add operational rate limiting or abuse monitoring before broad public growth.
- Device-test the PIP search modal against testing once the callable is deployed.
