# B-10 Customer, Party and Reservation Ownership Review

Date: 2026-09-27

Status: Fixed locally. Not deployed.

## Scope

B-10 reviewed customer-facing ownership boundaries for Party Mode, check-ins, reservations and waitlist flows. The goal was to identify whether each row is bounded, fail-closed or deferred before these paths are promoted through testing.

This is local source evidence only. It is not testing-lane deployment evidence.

## Authority Matrix

| Surface | Caller | Disposition | Evidence |
| --- | --- | --- | --- |
| `inviteToParty` | Party host | Bounded | Requires auth and `partyData.hostUserId === context.auth.uid` before invite generation. |
| `joinParty` | Invited customer or existing member | Fixed locally | Invite-code lookup is now preferred when supplied; raw `partyId` joins are allowed only for users already recognized as party members. |
| `leaveParty` | Party member | Bounded | Uses authenticated UID and verifies membership before changing the party/user relationship; blocks leaving after sent/processing/completed user items. |
| `cancelParty` | Party host | Bounded | Requires authenticated host, pending status and no sent basket items. |
| `activatePartyCheckIn` / `cancelPartyCheckIn` | Party host | Bounded | Requires authenticated host, associated check-in/customer match and expected state transitions. |
| `addLocalPipToParty` | Party host | Bounded | Requires authenticated host. |
| Shared basket item quantity/removal | Item owner or host | Bounded | Requires auth, host or item owner, and blocks non-host updates/removals for processed items. |
| `createPartySession` | Customer scan or permitted restaurant staff/manual seat | Fixed locally | New table-created parties now set both `hostId` and `hostUserId`, preserving existing host-only authorization checks. |
| `createReservationRequest` | Authenticated customer | Bounded | Uses `context.auth.uid` as `customerId`; checks restaurant feature entitlement, no same-time conflict and available slot. |
| `createReservationParty` | Reservation owner | Bounded | Requires reservation `customerId === context.auth.uid` and only confirmed/arrival-requested reservations. |
| Waitlist join/accept/pass | Waitlist owner | Bounded | Join uses authenticated UID; accept/pass requires waitlist `customerId === context.auth.uid` and valid offer state. |
| Restaurant reservation actions | Restaurant owner/staff | Bounded | Restaurant-side actions call restaurant access checks before approve, decline, seat, status update and waitlist offer actions. |
| Direct check-in request create | Customer | Fixed locally | Firestore rules now allow only own `REQUESTED` check-ins and require `associatedPartyId`, when present, to reference a party the caller can already read. |
| Direct operational writes | Customer/staff clients | Bounded by rules | Parties, shared baskets, reservations and waitlist deny direct client writes except the narrow customer service request patch on parties. |

## Local Changes

- Added `functions/partySecurity.js` with normalized invite-code and party-membership helpers.
- Updated `joinParty` so an invite code is used when present and a guessed raw `partyId` cannot add a new member.
- Updated `createPartySession` so table-created parties include `hostUserId`, matching the rest of Party Mode.
- Tightened `firestore.rules` so customer check-in requests can only attach a party the customer already belongs to.
- Added unit coverage for the Party Mode security helper.
- Added Firestore rules coverage for check-in party association ownership.

## Deferred Risks

- Direct realtime listeners remain in the native app for parties, shared baskets, check-ins, reservations and waitlists. Current rules scope reads by customer membership or restaurant identity, so this is acceptable for B-10. Any future migration to callable reads should preserve realtime operational latency where needed.
- Restaurant root documents remain public-readable and may expose fields that should become protected projections. That remains B-12.
- Legacy identity/client-written profile fields remain under B-13.
- Reservation double-booking and table/session invariants that involve concurrent browser/native ordering remain Phase C work.

## Validation

- `node --check functions/partyFunctions.js` passed.
- `node --check functions/partySecurity.js` passed.
- `npm.cmd --prefix functions run lint` passed.
- `npm run test:functions` passed outside the sandbox after the sandbox runner hit a Windows EPERM path-resolution error. Result: 22 unit tests passed.
- `npm run test:rules` passed outside the sandbox after the sandbox runner hit a Windows EPERM path-resolution error. Result: 7 Firestore rules tests passed.

## Remaining Work Before Done

- Deploy to testing only after A-08 is resolved or explicitly waived.
- Run customer Party Mode, restaurant host check-in and reservation seating QA against testing.
- Complete B-12 public restaurant projection and B-13 legacy identity field lockdown.
