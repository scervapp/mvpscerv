# Client compatibility matrix

Purpose: track which app/web builds can safely call each backend/rules generation. Do not deploy breaking rules until this matrix shows compatible clients and a minimum-version gate strategy.

Status: initial placeholder. Fill during Phase A/B.

| Client surface | Version/build | Environment | Uses staff session credential | Direct collections read | Direct collections written | Required callables | Compatible through wave | Breaking wave | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iOS native | Unknown | Production | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Populate from deployed build and source inventory |
| Android native | Unknown | Production | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Populate from deployed build and source inventory |
| Browser dining | Unknown | Production/hosting | N/A | Unknown | Unknown | Unknown | Unknown | Unknown | Include hosted bundle/version once inventoried |
| Admin portal | Unknown | Production/hosting | N/A | Unknown | Unknown | Unknown | Unknown | Unknown | Include environment switch and god-mode controls |

## Local contract changes awaiting testing deployment

| Change | Affected clients | Compatibility expectation | Required before deploy |
| --- | --- | --- | --- |
| `joinParty` requires an invite code for new members; raw `partyId` can only reopen a party for an existing member | Native customer app, browser/table flows if they call `joinParty` | Current native scan flow uses invite code for occupied tables. Notification joins send both `partyId` and `inviteCode`; the callable now honors the invite code first. Any unknown legacy caller that passes only `partyId` for a non-member will fail closed. | Testing smoke for invite notification, occupied-table QR join and already-member reopen |
| Customer check-in create rules require `associatedPartyId` to belong to the caller | Native customer app | Current party check-in flow attaches the current user's own pending party and should continue to pass. Forged cross-party association fails. | Firestore rules test covers local behavior; device check-in QA required in testing |
| Guest-facing restaurant reads move from `restaurants` to `restaurantPublic` | Native customer app and browser dining site | Current source has been migrated for customer discovery, restaurant detail, party checkout/session, order history and browser restaurant lookup. Existing deployed clients still expect raw `restaurants` reads. | Deploy functions, run `rebuildRestaurantPublicProfiles`, ship compatible client/web builds, then deploy tightened rules |

## Required checks

- Minimum native version source of truth identified.
- Store/TestFlight build numbers recorded.
- Web bundle version/reload behavior recorded.
- Each Firestore rules lockdown step maps to affected clients.
- Expected old-client failure mode is explicit and user-readable.
