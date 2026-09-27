# Restaurant permission review — September 26

Scope: source paths reviewed during Phase 1, not a complete inventory of every exported function. All repairs below are local and unreleased. Firebase login tenant claims identify the restaurant account; the staff-session credential identifies the employee. Firestore rules cannot read the separate callable bearer credential.

| Surface | Current local authority | Status / next action |
| --- | --- | --- |
| Staff PIN unlock and directory | Same restaurant Firebase login; directory returns display fields only | Locally tested. Directory deliberately works before PIN unlock. |
| Shared restaurant permission helper | Verified session + current employee role/job title | Locally tested; callers must actually invoke it. |
| Staff administration | Verified owner/manager; first-owner creation has atomic owner-account bootstrap | Locally tested helper/bootstrap; device QA outstanding. |
| Legacy Firebase staff-role mutation | Retired fail-closed endpoint | No current source caller; installed usage unknown. |
| Reservation offer, seat, approve, decline, status | Verified owner/manager/host/server | Repaired and role-matrix tested. Stored reservation resolves tenant. |
| Reservation/experience settings | Existing verified owner/manager helper | Requires end-to-end device QA. |
| Dashboard, ledger, financial order detail, daily sales and aliases | Verified owner/manager | Repaired and handler-matrix tested. |
| Raw orders and payment_events | Restaurant direct reads denied; customer owns order-history read | Rules tested. Staff reports use callables; older clients require review. |
| Employee/private records and unknown restaurant subcollections | Direct client reads/writes denied | Rules tested, including nested documents. Internal privileged raw-document tools are a separate scope. |
| Table CRUD and QR callables | Verified owner/manager callable; stable table IDs; active-table guards | Locally tested. Direct writes denied. Device QA and compatible-client rollout outstanding. |
| Direct tables writes | Denied for every client role | Rules tested. Older installed clients that still write table docs directly will fail after rule rollout. |
| Menu save, archive, availability | Verified owner/manager callable; direct client writes denied | Locally tested: tenant/field validation, retained reputation/reviews, concurrent same-dish creation. Compatible client/device QA and legacy identity migration remain. |
| Restaurant profile/root | Public reads; initial root creation remains allowlisted for onboarding; ongoing profile edits require verified owner/manager callable | Locally tested for profile-update authority. Broader public root-field minimization and onboarding cutover remain review items. |
| Restaurant Profile screen | Verified owner/manager callable returns editable profile fields only | Locally tested. Direct screen read of restaurant root removed; protected root fields are omitted from the read response. |
| Work-day open/close/status | Open/close require verified owner/manager; status uses verified staff callable with minimal output | Locally tested. Direct work_days reads/writes are denied. Device refresh/offline QA outstanding. |
| Terminal payment status | Verified owner/manager/server/bartender callable returns minimal status only | Locally tested. Direct terminal_payments reads/writes are denied. Physical Terminal QA outstanding. |
| Service request queue | Verified owner/manager/host/server/support/busser/runner callable returns minimal party-derived rows | Locally tested. Servers are filtered to assigned tables. Other party reads remain open. |
| Chef/Bar Q screen | Verified owner/manager/chef/kitchen/bartender/bar callable returns shaped active prep tickets | Locally tested. Direct kitchen_orders rules are not locked down yet because other operational screens still read them. |
| Active Tables screen | Verified owner/manager/host/server/support/busser/runner callable returns shaped party rows and ready summaries | Locally tested. Servers are filtered to assigned/unassigned tables. Other party/kitchen reads remain open. |
| Table Management operational overlay | Verified owner/manager/host/server/support/busser/runner callable returns shaped party rows and ready summaries used for occupied/dirty/ready overlays | Locally tested as a client migration. Table setup still uses table-management callables/utilities. Other party/kitchen reads remain open. |
| Manual Seating available-table overlay | Verified owner/manager/host/server/support/busser/runner callable returns shaped party rows used to exclude occupied tables | Locally tested as a client migration. Table list still uses table utility reads. |
| Table order detail modal | Party-backed orders require verified owner/manager/floor staff and assigned/unassigned server boundary; legacy individual check-ins are owner/manager-only | Locally tested with shaped items. Direct modal reads of checkIns/shared_baskets/baskets removed. |
| Restaurant operations pulse | Verified staff callables drive nav badges and bells for check-in, prep, service and ready-item alerts | Locally tested as a client migration. Uses existing staff-callable permission boundaries and role gates. Other raw operational readers remain open. |
| Manage Party screen | Verified owner/manager/host/server/support/busser/runner callable returns shaped party/basket/reward/settings detail | Locally tested. Servers are limited to assigned/unassigned parties. Other raw party/customer reads remain open. |
| Pickup Queue screen | Verified owner/manager/host/support callable returns shaped active pickup tickets only | Locally tested. Direct screen read of kitchen_orders removed. Other kitchen/customer pickup readers remain open. |
| Host Stand screen and seating response | Verified owner/manager/host/server/support callable returns shaped pending arrivals; seating write verifies stored request and current staff session | Locally tested. Direct screen read of checkIns removed. Broader check-in/customer reads remain open. |
| Reservation Operations screen | Verified owner/manager/host/server/support callable returns shaped active reservations and waitlist entries | Locally tested. Direct screen reads of reservations and reservationWaitlist removed. Customer reservation reads remain open. |
| Dashboard/navigation operation badges | Verified reservation operations and host check-in callables feed badge counts | Locally tested as a client migration. Direct hook reads of reservations and checkIns removed. |
| Menu Management screen | Verified owner/manager callable returns shaped menu rows | Locally tested. Direct screen read of menuItems removed. Public/customer menu reads and other menu consumers remain open. |
| Reservation Settings screen | Verified owner/manager callable returns shaped restaurant feature config and reservation settings | Locally tested. Direct screen reads of restaurant root and reservationSettings removed. |
| Rewards Settings screen | Verified owner/manager callable returns shaped rewards program config and eligible menu rows | Locally tested. Direct screen reads of restaurant root and menuItems removed. Rewards save still uses the existing loyalty callable. |
| Back Office setup checklist | Verified owner/manager callable returns count-only setup status | Locally tested. Direct screen reads of tables and menuItems removed. First-owner bootstrap still needs device QA. |
| Kitchen/parties/reservations/waitlist/terminal operational reads | Existing tenant/customer rules plus targeted callables above | OPEN: migrate remaining raw readers and review least necessary data/shared-device visibility; no blanket claim of staff-role isolation. |
| Pending orders | Retired fail-closed legacy endpoint; direct pending_orders client reads/writes denied | Locally tested. Stripe preparePayment remains supported. dLocal/PayPal require server-priced migration before reactivation. |
| Reservation state transitions/server assignment, order retry/settlement | Existing business flow beyond the permission checks | Not certified by this slice. F5 order concurrency remains Phase 2. |

## Next implementation

Menu, table, restaurant profile-update and pending-order server-only boundaries are locally complete. Next address financial/operational reads and a complete exported-endpoint inventory. Preserve the first-owner onboarding flow and verify every changed restaurant-management path on devices before rules/backend release.

## Required device acceptance cases before release

1. Cold-start restaurant app and unlock as worker, host, server, manager and owner; confirm selection/PIN errors, expiry and role switching.
2. Host/server approves or declines a pending request, offers a waitlist slot, seats an arrival and updates a reservation; verify real QA notifications and guest state. Chef/bartender/runner attempts must be rejected by the server.
3. Owner/manager opens dashboard, ledger, order detail and historical report. Host/server must not obtain reports through manually invoked APIs or raw Firestore reads.
4. Customer views own order history/detail and cannot read another customer's order.
5. Change or deactivate an employee while another tablet is open; verify the next protected request loses access. Check logout, offline failure and restart behavior.
6. Test menu/table/profile workflows, plus Terminal and kitchen/bar during a representative service. Record build, environment, device, timestamp, steps and result for each case.

Rules changes do not remove previously cached data. Release planning must include compatible client versions, historical credential exposure/cache handling and a forward-repair recovery path. No live QA or deployment has been executed.

### Menu mutation update

Menu save/archive/availability now require verified owner/manager staff through mutateRestaurantMenuItem; all direct menu writes are denied. Customer public reads remain. Test native create/edit/modifiers, archive/restore with retained reviews, availability and image upload before rule rollout.

### Table mutation update

Table create/update/delete now require verified owner/manager callables; all direct table writes are denied. Stable table document IDs are preserved on rename, active/uncleared tables cannot be structurally changed or deleted, and QR lookup records are disabled transactionally on delete. Test native table management, QR regenerate/disable, active table protection, host/browser check-in and clean/release flows before rule rollout.

### Restaurant root profile update

Restaurant profile edits now require saveRestaurantProfile with a verified owner/manager session. Direct restaurant-root updates are denied; initial root creation remains temporarily allowlisted for onboarding compatibility. The callable derives search/location fields and rejects unsupported fields. Test first-owner setup, profile save, image upload and worker denial before rule rollout.

### Restaurant Profile read update

RestaurantProfile now flows through getStaffRestaurantProfile with verified owner/manager authority instead of directly reading the restaurant root. The callable returns editable profile fields and omits protected operational/financial fields such as Stripe IDs, entitlements and platform-fee configuration. This narrows profile form reads without changing broader public restaurant-root read rules.

### Pending order update

Legacy createPendingOrder is retired before database access, and direct pending_orders reads/writes are denied for every client role. Supported Stripe checkout continues through preparePayment, which creates server-priced pending orders. The unused native Panama/dLocal Smart Fields paths now fail early until they are rebuilt around server-priced preparation. Do not restore dLocal/PayPal client-created pending orders.

### Terminal payment status update

Terminal payment status now flows through getStaffTerminalPaymentStatus with verified current staff authority. Direct reads and writes of terminal_payments are denied for every client role. Test physical Terminal payment, webhook completion, timeout fallback and staff closeout before rule rollout.

### Work-day status update

Work-day status now flows through getCurrentWorkDayStatus with verified current staff authority and a minimal open/closed response. Direct reads and writes of restaurants/{restaurantId}/work_days are denied for every client role. Test dashboard refresh, start service, close service and worker visibility before rule rollout.

### Service request queue update

The restaurant service-request queue now flows through listStaffServiceRequests with verified current staff authority and minimal party-derived rows. Servers only receive requests for assigned tables. This does not yet remove every direct party read from the restaurant app; Active Tables, Table Management, Manage Party and Pickup Queue have bounded migrations, while customer party views and other realtime operations still need separate decisions.

### Chef/Bar Q read update

Chef/Bar Q now flows through listStaffKitchenOrders with verified current staff authority and shaped active prep-ticket rows. This is a screen migration, not a global rules lockdown. Active tables, table management and pickup handoff now have bounded alternatives, but remaining restaurant/customer readers still need review before kitchen_orders can be denied broadly to restaurant clients.

### Active Tables read update

Active Tables now flows through listStaffActiveTables with verified current staff authority, shaped party rows and server-side ready-item summaries. Server workers receive assigned tables and unassigned tables needing ownership. This is still a screen migration, not a global rule lockdown; pickup handoff now has its own bounded callable, while customer party views and remaining operational readers need separate decisions before broad party/kitchen read rules can be tightened.

### Table Management operational overlay update

Table Management now derives occupied, dirty and ready-item overlays through listStaffActiveTables instead of direct parties and kitchen_orders listeners. Table setup, QR, clean/release and force-clear actions still use their existing controlled callables. This reduces raw operational reads in the floor-plan surface, but global rules remain unchanged until remaining operational readers are migrated or explicitly accepted.

### Manual Seating update

ManualSeatingScreen now derives occupied table IDs through listStaffActiveTables instead of a direct parties listener. It still reads table setup records through the existing table utility, which remains compatible with current table-read behavior. This narrows operational party exposure on the manual seating surface.

### Table order detail modal update

OrderDetailModal now flows through getStaffOrderDetail instead of directly reading checkIns, shared_baskets or baskets. Party-backed orders keep floor staff visibility but servers are limited to assigned or unassigned parties. Legacy individual check-in baskets are owner/manager-only until reliable assignment data exists for those older records.

### Restaurant operations pulse update

RestaurantDataContext now gets bottom-tab badges and bells through listStaffActiveTables, listStaffKitchenOrders and listStaffServiceRequests rather than direct parties and kitchen_orders listeners. Floor devices do not poll prep-only endpoints, and prep devices do not poll floor-only endpoints. This is still a client/context migration; Reservation views, customer party views and other direct readers need separate decisions before broad rules can be tightened.

### Manage Party read update

Manage Party now flows through getStaffPartyDetail with verified current staff authority, shaped shared basket items, restaurant settings, pricing tiers, and guest reward/promotion data. Server workers can view assigned or unassigned parties only. This reduces raw customer subcollection exposure from the restaurant screen, but global rules remain unchanged until remaining operational readers are migrated or explicitly accepted.

### Pickup Queue read update

PickupQueueScreen now flows through listStaffPickupOrders with verified current staff authority. Owner/manager users and host/support staff can view shaped active pickup tickets, while full kitchen/bar prep-ticket access remains separate through listStaffKitchenOrders. This removes the pickup screen's direct kitchen_orders read, but global kitchen_orders rules remain unchanged until remaining restaurant and customer readers are migrated or explicitly accepted.

### Host Stand read/write update

HostStandScreen now flows through listStaffHostCheckIns with verified current staff authority instead of directly reading checkIns. The seating response path also checks the stored restaurant/customer on the check-in and requires verified owner/manager/host/server/support authority before table assignment writes. This narrows the front-door queue and seating action, but global checkIns rules remain unchanged until remaining restaurant and customer readers are migrated or explicitly accepted.

### Reservation Operations read update

RestaurantReservationsScreen now flows through listStaffReservationOperations with verified current staff authority instead of directly reading reservations and reservationWaitlist. Owner/manager users and host/server/support staff receive shaped active reservation rows and shaped waitlist rows for operational decisions. Global reservation rules remain unchanged until customer reservation views and any remaining staff readers are migrated or explicitly accepted.

### Operations badge hook update

useRestaurantOperationsBadges now flows through listStaffReservationOperations and listStaffHostCheckIns instead of directly reading reservations and checkIns. The hook returns empty counts until a verified staff session exists, then polls the existing staff-callable boundaries for dashboard and tab badges. This removes the remaining raw staff reservation/check-in read in the restaurant screen/context/hook scope.

### Menu Management read update

MenuManagementScreen now flows through listStaffMenuItems with verified owner/manager authority instead of directly reading menuItems. The screen still uses mutateRestaurantMenuItem for save, archive and availability changes, then refreshes through the same verified read path. Global menu item read rules remain unchanged because customer menu browsing, rewards selection and other menu consumers need separate decisions.

### Reservation Settings read update

ReservationSettingsScreen now flows through getStaffReservationSettings with verified owner/manager authority instead of directly reading the restaurant root and reservationSettings document. Saves already use protected settings callables and now refresh through the same verified read path. This narrows the settings surface without changing global restaurant-root read rules.

### Rewards Settings read update

RestaurantRewardsScreen now flows through getStaffRewardsSettings with verified owner/manager authority instead of directly reading the restaurant root and menuItems. Saves still use saveRestaurantLoyaltyProgram and refresh through the verified read path after success. This narrows loyalty setup reads without changing global restaurant-root or public menu item read rules.

### Back Office setup-status update

BackOfficeScreen now flows through getStaffBackOfficeSetupStatus for employee, table and menu setup counts instead of direct tables and menuItems listeners. The callable returns counts only and requires verified owner/manager authority once the restaurant has initialized staff. This narrows setup-checklist reads without changing broader table/menu read rules.
