# Polling and Realtime Inventory

Date: 2026-09-27

Purpose: document every polling callable and realtime listener used by restaurant/customer/browser screens so latency, cost and security tradeoffs are explicit.

Status: source inventory complete. Testing-lane measurement is pending because A-08 remains blocked.

## Executive Summary

Current source is mostly **Firestore listener based** for restaurant operations, not callable polling based. That means KDS, host, reservations, table state and staff badges should update as fast as Firestore listeners deliver changes, but those screens also keep direct collection access alive until rules lockdown/migration is completed.

The main steady-state callable polling path found in source is the browser dining page:

- `ScanRedirect` calls `getBrowserOrderStatus` immediately and every 6 seconds while a browser table session is active.
- Estimated browser status polling cost is 600 invocations/device/hour.

The practical decision is not "polling everywhere versus sockets." It is:

- keep listeners where operational latency matters and data exposure is acceptable through narrow projection/rules; or
- move specific surfaces to shaped callables with measured polling intervals where raw listener data is too broad.

## Source Inventory

| Surface | Screen/context/hook | Data path | Interval / listener | Starts when | Stops when | Estimated invocations/device/hour | Latency impact | Owner | Notes |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| Restaurant | `RestaurantDataContext` | Firestore listeners: `parties` active, `kitchen_orders` active, `parties` service requested, pickup `kitchen_orders` | Realtime listeners | Restaurant provider mounted with `restaurantId` | Provider unmount/account switch | 0 callable invocations; Firestore listener reads vary by change volume | Near realtime badges/sounds | ENG/OPS | High-value listener surface, but direct raw reads remain. |
| Restaurant | `useRestaurantOperationsBadges` | Firestore listeners: `reservations`, `checkIns` | Realtime listeners | Hook mounted with `restaurantId` | Hook unmount | 0 callable invocations; Firestore listener reads vary by change volume | Near realtime nav/dashboard badges | ENG/OPS | Direct reads contradict the intended staff-callable hardening direction. |
| Restaurant | `ChefsQScreen` | Firestore listener: `kitchen_orders`; local UI timer only | Realtime listener plus local 60s timer | Screen active with `restaurantId` | Screen unmount/blur cleanup | 0 callable invocations for reads; action callables only on user action | Near realtime KDS/bar queue | ENG/OPS | KDS latency is listener-bound today, not polling-bound. |
| Restaurant | `TableManagementScreen` | Table utility listener plus Firestore listeners: `parties`, `kitchen_orders` | Realtime listeners | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime table occupancy/ready overlays | ENG/OPS | Direct operational reads are broad. |
| Restaurant | `HostStandScreen` | Firestore listener: `checkIns` | Realtime listener | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime arrivals | ENG/OPS | Seating action uses callable, read path is direct. |
| Restaurant | `RestaurantReservationsScreen` | Firestore listeners: `reservations`, `reservationWaitlist` | Realtime listeners | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime reservations/waitlist | ENG/OPS | Direct read path remains. |
| Restaurant | `BackOfficeScreen` | Firestore listeners: employees, tables, menuItems counts | Realtime listeners | Screen active | Screen unmount | 0 callable invocations for reads | Setup counts update realtime | ENG | Reads employee docs directly under current source. |
| Restaurant | `EmployeeScreen` | Firestore listener: employees | Realtime listener | Screen active | Screen unmount | 0 callable invocations for reads | Realtime roster | ENG/OPS | Sensitive because employee docs may contain `pinHash` once live staff exist. |
| Restaurant | `MenuManagementScreen` | Firestore listener: menuItems | Realtime listener | Screen active | Screen unmount | 0 callable invocations for reads | Realtime menu edits | ENG/OPS | Direct reads may be acceptable only for non-sensitive menu data after field review. |
| Restaurant | `ReservationSettingsScreen` | Firestore listeners: restaurant root, reservation settings | Realtime listeners | Screen active | Screen unmount | 0 callable invocations for reads | Realtime settings | ENG/OPS | Root read contains sensitive/protected fields until B-12 style split is deployed. |
| Restaurant | `RestaurantRewardsScreen` | Firestore listeners: restaurant root, menuItems | Realtime listeners | Screen active | Screen unmount | 0 callable invocations for reads | Realtime rewards setup | ENG/OPS | Owner/manager-only surface should be shaped server-side before rules lockdown. |
| Restaurant | `ManagePartyScreen` | Firestore listeners: party doc, shared basket, restaurant root, customer restaurant club, customer promotions | Realtime listeners | Screen active for one party | Screen unmount | 0 callable invocations for reads | Near realtime table service | ENG/OPS | High-value operational surface; also broadest direct cross-collection read. |
| Restaurant | `ServiceRequestsScreen` | Firestore listener: service-request parties | Realtime listener | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime help requests | ENG/OPS | Raw party read path remains. |
| Restaurant | `PickupQueueScreen` | Firestore listener: active pickup `kitchen_orders` | Realtime listener | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime pickup queue | ENG/OPS | Direct kitchen-order read path remains. |
| Restaurant | `ManualSeatingScreen` | Firestore listener: table availability | Realtime listener | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime seating table list | ENG/OPS | Needs paired table/party state review. |
| Restaurant | `RestaurantCheckin` | Firestore listeners: tables/check-ins/operational state | Realtime listeners | Screen active | Screen unmount | 0 callable invocations for reads | Near realtime floor ops | ENG/OPS | Broad direct read surface; needs screen-specific migration decision. |
| Restaurant | `RestaurantTerminalPaymentScreen` | Firestore listener: terminal payment doc/status | Realtime listener | Terminal payment active | Payment flow ends/unmount | 0 callable invocations for reads | Near realtime Terminal status | ENG/OPS | Payment status listener must be reviewed with Terminal QA. |
| Restaurant | `WorkDayContext` | Firestore listener: work day query | Realtime listener | Restaurant context active | Context unmount | 0 callable invocations for reads | Near realtime work-day state | ENG/OPS | Direct work-day read path remains in source. |
| Browser dining | `ScanRedirect` | Callable: `getBrowserOrderStatus` | Immediate, then every 6 seconds | Browser table session has `sessionId` | Session missing/unmount/payment confirmation flow ends | 600 | Up to 6s status staleness between polls | ENG | This is the primary callable polling cost driver found in source. |
| Browser dining | `ScanRedirect` checkout sync | Callable: `syncBrowserCheckoutSession` retry via `setTimeout` | 2s retry while checkout sync is pending | Stripe checkout return/sync needed | Sync succeeds/fails | Burst only, not steady-state | Payment finalization delay/retry | ENG | Phase 2 must ensure webhook/sync cannot double-fulfill. |

## Cost and Latency Notes

- **KDS/bar latency:** current source uses Firestore listeners, so KDS latency is not governed by a polling interval. The target should be measured as Firestore write-to-visible time on device.
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
