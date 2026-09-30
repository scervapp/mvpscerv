# B-07 Staff Device QA Script

Date: 2026-09-30
Project lane: `scervmvp-testing`
Status: Ready for Android-first run; iOS deferred by D-028.

## Objective

Verify the testing-profile native client against the deployed W1/W2 hardened callable surface before Firestore rules lockdown.

This script is device QA, not a production go-live approval. It must be run on the installed `Scerv Testing` app against `scervmvp-testing`.

## Test Build

- Platform: Android
- Build profile: `testing`
- App version: `0.0.45`
- Android version code: `37`
- EAS build id: `3ad1d40f-e80f-42ad-9c64-7b07825993c5`
- APK: `https://expo.dev/artifacts/eas/5-gWAlEjdf4DOERHN1a_b-dh7fhR3f7P8zZc81jB8mA.apk`

## Required Evidence

For each scenario, capture:

- Tester name
- Device model
- App version/build visible on device if available
- Restaurant tested
- Staff role tested
- Pass/fail
- Screenshot or short video for failures
- Exact error text for failures
- Approximate timestamp in America/New_York

## Preflight

| ID | Scenario | Expected result | Result |
| --- | --- | --- | --- |
| P-01 | Install the APK fresh or over prior testing app | App installs as `Scerv Testing` | |
| P-02 | Open app on normal network | App launches without `scervStatus` or startup render errors | |
| P-03 | Confirm testing lane visually or through known testing data | App is using `scervmvp-testing`, not dev or production | |
| P-04 | Sign in as restaurant owner/manager | Dashboard opens and no unauthorized screen appears | |
| P-05 | Sign in/enter PIN as server/host where applicable | Role-specific navigation appears; restricted areas stay hidden | |

## Staff Session / Role Checks

| ID | Scenario | Expected result | Result |
| --- | --- | --- | --- |
| S-01 | Manager opens dashboard after login | Dashboard data loads or shows clean empty state | |
| S-02 | Server PIN opens allowed server view | Server cannot access manager-only back office controls | |
| S-03 | Host PIN opens host/reservation workflows | Host sees host-facing operations without menu/admin controls | |
| S-04 | Bad PIN attempt | Clear failure state; no crash; no role leak | |
| S-05 | App background/resume | Session remains valid or asks for PIN cleanly | |

## Migrated Callable Screens

| ID | Screen | Scenario | Expected result | Result |
| --- | --- | --- | --- | --- |
| C-01 | Active Tables | Open floor/active tables | Tables load through `listStaffActiveTables`; dirty/occupied/available states look correct | |
| C-02 | Active Tables | Tap occupied/dirty table | Detail/action screen opens without crash; actions match role | |
| C-03 | Host Stand | Open host check-ins | Pending and active check-ins load; no duplicate/ghost rows from old direct listeners | |
| C-04 | Host Stand | Seat or cancel a test check-in | Action succeeds and list refreshes within expected polling window | |
| C-05 | Service Requests | Create a customer service request, then view staff side | Request appears; acknowledge action updates state | |
| C-06 | Pickup Queue | Open pickup queue | Pickup orders load or clean empty state appears | |
| C-07 | Reservations | Open reservation operations | Requested, confirmed, arrival-requested, seated and waitlist data load as applicable | |
| C-08 | Reservations | Confirm/cancel/seat a test reservation | Action succeeds and list refreshes | |
| C-09 | Work Day | Start work day | Work-day status updates after action | |
| C-10 | Work Day | End work day | Work-day status updates after action | |
| C-11 | Employee Roster | Open staff list | Employees load without exposing PIN hashes or private fields | |
| C-12 | Employee Roster | Add/update/delete test employee | Action succeeds and roster refreshes | |
| C-13 | Back Office Setup | Open back office | Setup checklist/status loads from callable; no blank body or hidden overlay issue | |
| C-14 | Menu Management | Open menu manager | Menu items load from callable | |
| C-15 | Menu Management | Add menu item with tags/modifiers/image URL | Item saves and appears with expected metadata | |
| C-16 | Menu Management | Toggle availability | Availability updates and persists after refresh | |
| C-17 | Menu Management | Archive test item | Item disappears from active list or shows archived state as designed | |
| C-18 | Reservation Settings | Open settings | Settings load from callable; toggles reflect stored config | |
| C-19 | Reservation Settings | Change one toggle and save | Only intended setting changes; disabled toggle does not turn itself back on | |
| C-20 | Rewards Settings | Open rewards | Program, tiers and eligible menu items load from callable | |
| C-21 | Rewards Settings | Save tier/reward change | Save succeeds and reload reflects new values | |

## Realtime / Deferred Surfaces

These were intentionally not converted to naive polling in B-06. They still need device confirmation before rules lockdown.

| ID | Surface | Scenario | Expected result | Result |
| --- | --- | --- | --- | --- |
| R-01 | ChefQ | Send food item to kitchen | Ticket appears without needing to leave/reopen screen | |
| R-02 | Bar Q | Send drink item to bar | Header identifies bar queue correctly; ticket appears | |
| R-03 | ChefQ / Bar Q | Mark preparing/ready/complete | Status updates without stuck loading state | |
| R-04 | Server active tables | Ready kitchen/bar item appears to assigned server | Server can mark served where permitted | |
| R-05 | Party detail | Open active party/table | Items, rewards, service requests and payment state load without permission errors | |

## Reporting Screens

| ID | Screen | Scenario | Expected result | Result |
| --- | --- | --- | --- | --- |
| Q-01 | Dashboard report | Load dashboard | No `Failed to generate dashboard report` error | |
| Q-02 | Sales report | Load today and historical ranges | Totals render with correct net/gross/fees/taxes language | |
| Q-03 | Orders ledger | Load ledger | No `Failed to load orders ledger` error | |
| Q-04 | Order detail | Open an order | Detail opens and totals match ledger | |
| Q-05 | Pay Lite receipt | Open manager receipt | Daily transaction rows load or clean empty state appears | |

## Pass Criteria

Android-first B-07 can be marked `Android device-tested` when:

- P-01 through P-05 pass.
- S-01 through S-05 pass for at least owner/manager and one non-manager role.
- C-01 through C-21 pass or every failure has a filed defect.
- R-01 through R-05 pass or every failure has a filed defect.
- Q-01 through Q-05 pass or every failure has a filed defect.

B-07 is not fully `Device-verified` under the master plan until iOS testing is completed or the plan is formally changed.

## Known Boundaries

- This does not validate Phase C concurrency/payment correctness.
- This does not validate Firestore rules lockdown R1-R4.
- This does not validate production.
- This does not validate iOS until D-028 is reversed and an iOS testing build is installed.
