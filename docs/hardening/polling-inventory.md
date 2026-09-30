# Polling and Realtime Inventory

Date: 2026-09-29

Purpose: document every polling callable and realtime listener used by restaurant/customer/browser screens so latency, cost and security tradeoffs are explicit.

Status: source inventory updated for the first B-06 client migrations. Testing-lane measurement is pending.

## Executive Summary

Current source remains mostly **Firestore listener based** for restaurant operations, but B-06 has started moving lower-risk staff screens to shaped callables. KDS, reservations, table state and staff badges still update as fast as Firestore listeners deliver changes, but those screens also keep direct collection access alive until rules lockdown/migration is completed.

The main steady-state callable polling paths currently found in source are:

- `ScanRedirect` calls `getBrowserOrderStatus` immediately and every 6 seconds while a browser table session is active.
- Estimated browser status polling cost is 600 invocations/device/hour.
- B-06 staff screens now poll every 10 seconds while mounted:
  - `ServiceRequestsScreen` calls `listStaffServiceRequests`.
  - `HostStandScreen` calls `listStaffHostCheckIns`.
  - `RestaurantCheckin` calls `listStaffActiveTables`.
  - `PickupQueueScreen` calls `listStaffPickupOrders`.
  - `RestaurantReservationsScreen` calls `listStaffReservationOperations`.
- B-06 staff screens/contexts now poll every 30 seconds while mounted:
  - `WorkDayContext` calls `getCurrentWorkDayStatus`.
  - `EmployeeScreen` calls `listStaffDirectory`.
  - `BackOfficeScreen` calls `getStaffBackOfficeSetupStatus`.
  - `MenuManagementScreen` calls `listStaffMenuItems`.
  - `ReservationSettingsScreen` calls `getStaffReservationSettings`.
  - `RestaurantRewardsScreen` calls `getStaffRewardsSettings`.
- Estimated B-06 10-second polling cost is 360 invocations/device/hour per active screen.
- Estimated B-06 30-second polling cost is 120 invocations/device/hour for Work Day Status, Employee Roster, Back Office Setup Status, Menu Management, Reservation Settings and Rewards Settings while mounted.

The practical decision is not "polling everywhere versus sockets." It is:

- keep listeners where operational latency matters and data exposure is acceptable through narrow projection/rules; or
- move specific surfaces to shaped callables with measured polling intervals where raw listener data is too broad.

## Source Inventory

| Surface | Screen/context/hook | Data path | Interval / listener | Starts when | Stops when | Estimated invocations/device/hour | Latency impact | Owner | Notes |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| Restaurant | `RestaurantDataContext` | Firestore listeners: `parties` active, `kitchen_orders` active, `parties` service requested, pickup `kitchen_orders` | Realtime listeners | Restaurant provider mounted with `restaurantId` | Provider unmount/account switch | 0 callable invocations; Firestore listener reads vary by change volume | Near realtime badges/sounds | ENG/OPS | High-value listener surface, but direct raw reads remain. |
| Restaurant | `useRestaurantOperationsBadges` | Firestore listeners: `reservations`, `checkIns` | Realtime listeners | Hook mounted with `restaurantId` | Hook unmount | 0 callable invocations; Firestore listener reads vary by change volume | Near realtime nav/dashboard badges | ENG/OPS | Direct reads contradict the intended staff-callable hardening direction. |
| Restaurant | `ChefsQScreen` | Firestore listener: `kitchen_orders`; local UI timer only | Realtime listener plus local 60s timer | Screen active with `restaurantId` | Screen unmount/blur cleanup | 0 callable invocations for reads; action callables only on user action | Near realtime KDS/bar queue | ENG/OPS | KDS latency is listener-bound today, not polling-bound. |
| Restaurant | `TableManagementScreen` | Table utility listener plus Firestore listeners: `parties`, `kitchen_orders` | Realtime listeners | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime table occupancy/ready overlays | ENG/OPS | Direct operational reads are broad; separate setup/floor-plan surface from active table service surface before migration. |
| Restaurant | `HostStandScreen` | Callable: `listStaffHostCheckIns` | Immediate, then every 10 seconds | Screen active with `restaurantId` | Screen unmount | 360 | Up to 10s check-in/request staleness unless manually refreshed by remount | ENG/OPS | B-06 migrated from direct `checkIns` listener; seating action still uses `handleCheckInResponse`. |
| Restaurant | `RestaurantReservationsScreen` | Callable: `listStaffReservationOperations` | Immediate, then every 10 seconds | Screen active with `restaurantId` | Screen unmount | 360 | Up to 10s reservation/waitlist staleness | ENG/OPS | B-06 migrated from direct `reservations` and `reservationWaitlist` listeners; action callables unchanged. |
| Restaurant | `BackOfficeScreen` | Callable: `getStaffBackOfficeSetupStatus` | Immediate, then every 30 seconds | Screen active with `restaurantId` | Screen unmount | 120 | Up to 30s setup-checklist count staleness | ENG | B-06 migrated from direct employee/table/menu count listeners; Stripe actions unchanged. |
| Restaurant | `EmployeeScreen` | Callable: `listStaffDirectory` | Immediate, then every 30 seconds | Screen active with `restaurantId` | Screen unmount | 120 | Up to 30s roster staleness; add/update/delete actions refresh immediately | ENG/OPS | B-06 migrated from direct employee listener; avoids raw `pinHash` exposure in the client read path. |
| Restaurant | `MenuManagementScreen` | Callable: `listStaffMenuItems`; mutation callable: `mutateRestaurantMenuItem` | Immediate, then every 30 seconds | Screen active with `restaurantId` | Screen unmount | 120 | Up to 30s menu-list staleness; create/update/archive/availability actions refresh immediately | ENG/OPS | B-06 migrated menu read/write path away from direct `menuItems` access while preserving rich dish metadata. |
| Restaurant | `ReservationSettingsScreen` | Callable: `getStaffReservationSettings`; mutation callables: `saveReservationSettings`, `saveRestaurantExperienceSettings`, `setScervPayLiteOnlyMode` | Immediate, then every 30 seconds | Screen active with `restaurantId` | Screen unmount | 120 | Up to 30s settings staleness; save actions refresh immediately | ENG/OPS | B-06 migrated restaurant-root and reservation-settings reads to a shaped staff callable. |
| Restaurant | `RestaurantRewardsScreen` | Callable: `getStaffRewardsSettings`; mutation callable: `saveRestaurantLoyaltyProgram` | Immediate, then every 30 seconds | Screen active with `restaurantId` | Screen unmount | 120 | Up to 30s rewards/menu eligibility staleness; save action refreshes immediately | ENG/OPS | B-06 migrated rewards setup away from direct restaurant-root and `menuItems` listeners. |
| Restaurant | `ManagePartyScreen` | Firestore listeners: party doc, shared basket, restaurant root, customer restaurant club, customer promotions | Realtime listeners | Screen active for one party | Screen unmount | 0 callable invocations for reads | Near realtime table service | ENG/OPS | High-value operational surface; also broadest direct cross-collection read. |
| Restaurant | `ServiceRequestsScreen` | Callable: `listStaffServiceRequests` | Immediate, then every 10 seconds | Screen active with `restaurantId` | Screen unmount | 360 | Up to 10s service-request staleness | ENG/OPS | B-06 migrated from direct service-request party listener; acknowledge action remains callable. |
| Restaurant | `PickupQueueScreen` | Callable: `listStaffPickupOrders` | Immediate, then every 10 seconds | Screen active with `restaurantId` | Screen unmount | 360 | Up to 10s pickup-order staleness | ENG/OPS | B-06 migrated from direct active pickup `kitchen_orders` listener; handoff remains callable. |
| Restaurant | `ManualSeatingScreen` | Firestore listener: table availability | Realtime listener | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime seating table list | ENG/OPS | Needs paired table/party state review. |
| Restaurant | `RestaurantCheckin` | Callable: `listStaffActiveTables`; callable `listStaffDirectory` for assignable servers | Immediate, then every 10 seconds | Active Tables screen active with `restaurantId` | Screen unmount | 360 for active tables, plus 1 directory load on mount | Up to 10s floor-card staleness; assignment/service/run-food/clean actions refresh immediately | ENG/OPS | B-06 migrated active-table cards away from direct `parties`, `kitchen_orders` and employee reads. |
| Restaurant | `RestaurantTerminalPaymentScreen` | Firestore listener: terminal payment doc/status | Realtime listener | Terminal payment active | Payment flow ends/unmount | 0 callable invocations for reads | Near realtime Terminal status | ENG/OPS | Payment status listener must be reviewed with Terminal QA. |
| Restaurant | `WorkDayContext` | Callable: `getCurrentWorkDayStatus` | Immediate, then every 30 seconds | Restaurant provider mounted with `restaurantId` | Provider unmount/account switch | 120 | Up to 30s work-day banner staleness; start/end actions refresh immediately | ENG/OPS | B-06 migrated from direct `work_days` subcollection listener; start/end mutations remain callable. |
| Browser dining | `ScanRedirect` | Callable: `getBrowserOrderStatus` | Immediate, then every 6 seconds | Browser table session has `sessionId` | Session missing/unmount/payment confirmation flow ends | 600 | Up to 6s status staleness between polls | ENG | This is the primary callable polling cost driver found in source. |
| Browser dining | `ScanRedirect` checkout sync | Callable: `syncBrowserCheckoutSession` retry via `setTimeout` | 2s retry while checkout sync is pending | Stripe checkout return/sync needed | Sync succeeds/fails | Burst only, not steady-state | Payment finalization delay/retry | ENG | Phase 2 must ensure webhook/sync cannot double-fulfill. |

## Cost and Latency Notes

- **KDS/bar latency:** current source uses Firestore listeners, so KDS latency is not governed by a polling interval. The target should be measured as Firestore write-to-visible time on device before deciding whether to move KDS to polling or a projection listener.
- **B-06 staff polling latency:** Active Tables, Host Stand, Service Requests, Pickup Queue and Reservation Operations may be stale for up to 10 seconds between automatic refreshes. This is acceptable for testing-lane hardening if staff-device QA confirms it does not harm service flow.
- **Browser status latency:** browser guests may wait up to 6 seconds to see a status change unless the page triggers an immediate refresh after an action.
- **Function invocation cost:** one active browser table page costs about 600 `getBrowserOrderStatus` invocations/hour. Ten active browser sessions would be about 6,000 invocations/hour. Restaurant listener screens do not create callable polling invocations, but they do incur Firestore listener reads.
- **Security tradeoff:** listeners are operationally responsive, but direct raw collection listeners keep broad data paths alive. The B-12/B-13/B-15 findings make employee, restaurant root and customer reward/promotion reads especially sensitive.

## Recommendations

1. Keep realtime semantics for KDS/bar, service requests, active tables and payment status unless a projection listener replaces raw reads.
2. Prefer server-written projection collections for high-churn realtime surfaces instead of polling callables when p95 latency must stay near realtime.
3. Keep callable polling for lower-frequency browser status if 6-second freshness is acceptable; otherwise add an immediate refresh after every browser order/payment action.
4. Before live pilot, decide whether the restaurant app moves sensitive screens to shaped callables or to sanitized projection listeners.
5. Measure one full testing shift for:
   - Firestore listener read counts;
   - browser `getBrowserOrderStatus` invocations/session/hour;
   - KDS write-to-visible p95/p99;
   - reservation/check-in badge write-to-visible p95/p99.

## Required Decisions

- Pilot KDS p95/p99 visible-order latency target.
- Whether employee, restaurant root, party detail and customer reward/promotion reads move to shaped callables or projection listeners.
- Maximum acceptable steady-state function invocation rate per restaurant for browser dining.
- Whether browser status polling remains at 6 seconds for MVP or shifts to event-triggered refresh plus longer background polling.
