# B-06 Testing-Profile Client Callable Migration Report

Date: 2026-09-29
Project lane: `scervmvp-testing`
Status: In progress

## Objective

Move testing-profile restaurant client screens away from broad direct Firestore operational reads and onto the hardened W2 callable surface before tightening Firestore rules.

## Completed in this slice

### Service Requests

- Migrated `src/screens/restaurant/ServiceRequestsScreen.js` from a direct `parties` listener to `listStaffServiceRequests`.
- Preserved existing acknowledgement behavior through `acknowledgePartyServiceRequest`.
- Poll interval: 10 seconds.
- Server visibility remains bounded by the staff callable; client-side server filtering remains as an additional UI guard.

### Host Stand

- Migrated `src/screens/restaurant/HostStandScreen.js` from a direct `checkIns` listener to `listStaffHostCheckIns`.
- Preserved seating flow through `handleCheckInResponse`, now passing the active staff session id.
- Added host-facing check-in fields to the callable shape:
  - `type`
  - `numberOfPeople`
  - `occasion`
  - `seatingPreference`
  - `allergyNotes`
  - `guestNotes`
- Deployed updated `listStaffHostCheckIns` to `scervmvp-testing`.
- Poll interval: 10 seconds.

### Pickup Queue

- Migrated `src/screens/restaurant/PickupQueueScreen.js` from a direct `kitchen_orders` listener to `listStaffPickupOrders`.
- Preserved handoff behavior through `completePickupOrderHandoff`.
- Added pickup/receipt fields to the staff kitchen ticket shape:
  - table and location display fields
  - customer display fields
  - pickup and item special instructions
  - receipt totals
  - `restaurantName`
  - `readableOrderId`
- Deployed updated `listStaffPickupOrders` to `scervmvp-testing`.
- Poll interval: 10 seconds.

### Reservation Operations

- Migrated `src/screens/restaurant/RestaurantReservationsScreen.js` from direct `reservations` and `reservationWaitlist` listeners to `listStaffReservationOperations`.
- Preserved reservation actions through existing action callables:
  - `confirmReservation`
  - `cancelReservation`
  - `seatReservation`
  - `restaurantOfferWaitlistSlot`
- Fixed the staff reservation callable query to include the statuses used by the host UI:
  - `requested`
  - `confirmed`
  - `arrival_requested`
  - `seated`
  - legacy `pending`
- Deployed updated `listStaffReservationOperations` to `scervmvp-testing`.
- Poll interval: 10 seconds.

### Work Day Status

- Migrated `src/context/restaurant/WorkDayContext.js` from a direct `restaurants/{restaurantId}/work_days` listener to `getCurrentWorkDayStatus`.
- Preserved the dashboard-facing `currentWorkDay.startTime.toDate()` shape so the existing open/closed banner remains stable.
- Preserved start/end-day mutations through existing callables:
  - `startWorkDay`
  - `endWorkDay`
- Added an immediate status refresh after start/end-day actions.
- Poll interval: 30 seconds.

### Employee Roster

- Migrated `src/screens/restaurant/EmployeeScreen.js` from a direct `restaurants/{restaurantId}/employees` listener to `listStaffDirectory`.
- Preserved employee mutations through existing action callables:
  - `addEmployee`
  - `updateEmployee`
  - `deleteEmployee`
- Moved the `hasSetupEmployees` restaurant flag update into `addEmployee` so setup state is server-owned.
- Deployed updated `addEmployee` to `scervmvp-testing`.
- Poll interval: 30 seconds, with immediate refresh after add/update/delete.

### Back Office Setup Status

- Migrated `src/screens/restaurant/BackOfficeScreen.js` from direct employee, table and menu count listeners to `getStaffBackOfficeSetupStatus`.
- Preserved Stripe onboarding, payout dashboard and navigation actions.
- Poll interval: 30 seconds.

### Active Tables

- Migrated `src/screens/restaurant/RestaurantCheckin.js` from direct `parties`, `kitchen_orders` and server employee reads to `listStaffActiveTables` and `listStaffDirectory`.
- Preserved floor actions through existing action callables:
  - `assignPartyServer`
  - `acknowledgePartyServiceRequest`
  - `markReadyKitchenItemsServed`
  - `markPartyTableClean`
  - `forceClearTable`
- Expanded the `listStaffActiveTables` response shape so the card UI receives table, guest, service, browser-order, ready-item and dirty-table context without raw operational documents.
- Deployed updated `listStaffActiveTables` to `scervmvp-testing`.
- Poll interval: 10 seconds, with immediate refresh after assignment, acknowledgement, ready-item service and cleanup actions.

### Menu Management

- Migrated `src/screens/restaurant/MenuManagementScreen.js` from a direct `menuItems` listener to `listStaffMenuItems`.
- Migrated `src/components/restaurant/AddItemModal.js` and `src/components/restaurant/MenuItem.js` from direct `menuItems` writes to `mutateRestaurantMenuItem`.
- Preserved rich menu metadata in the staff callable payload:
  - canonical dish identity
  - daily-special status
  - images
  - ingredient, cuisine, flavor, dietary and search tags
  - modifier groups
  - preserved rating/reputation fields
- Server-side create now checks for an existing same-name/same-category dish at the restaurant and carries forward prior reputation signals where applicable.
- Deployed updated `listStaffMenuItems` and `mutateRestaurantMenuItem` to `scervmvp-testing`.
- Poll interval: 30 seconds, with immediate refresh after create, update, archive and availability actions.

### Reporting Read Surfaces

- Verified the primary restaurant reporting screens already use callable report endpoints rather than direct Firestore reads:
  - `src/screens/restaurant/SalesReportScreen.js`
  - `src/screens/restaurant/HistoricalReportScreen.js`
  - `src/screens/restaurant/OrdersLedgerScreen.js`
  - `src/screens/restaurant/OrderDetailScreen.js`
  - `src/screens/restaurant/DailySalesDetailsScreen.js`
  - `src/screens/restaurant/PayLiteDailyReportScreen.js`
- No code change was needed for this surface in B-06.
- These screens are fetch-on-load/filter-change rather than steady-state polling surfaces.

### Owner/Manager Settings

- Migrated `src/screens/restaurant/ReservationSettingsScreen.js` from direct restaurant-root and `reservationSettings/general` listeners to `getStaffReservationSettings`.
- Added `allowedFeatures` to the reservation settings callable response so the existing feature-lock toggle behavior remains server-shaped.
- Preserved reservation and experience mutations through existing callables:
  - `saveReservationSettings`
  - `saveRestaurantExperienceSettings`
  - `setScervPayLiteOnlyMode`
- Confirmed `getStaffReservationSettings` is active on `scervmvp-testing` with a new deployed hash after the single-function deploy.
- Migrated `src/screens/restaurant/RestaurantRewardsScreen.js` from direct restaurant-root and `menuItems` listeners to `getStaffRewardsSettings`.
- Preserved rewards mutation through `saveRestaurantLoyaltyProgram`.
- Poll interval: 30 seconds for reservation settings and rewards settings, with immediate refresh after save actions.

## Validation

- Testing-profile version metadata was bumped for the next device QA artifact:
  - Expo app version: `0.0.45`
  - iOS build number: `35`
  - Android version code: `37`
  - Native Android Gradle metadata was also updated to `versionName "0.0.45"` and `versionCode 37` because this project has a native `android` directory and EAS uses native values for Android.
- Testing config check passed:
  - `APP_ENV=testing`
  - app name: `Scerv Testing`
  - iOS bundle id: `com.scerv.app.testing`
  - Android package: `com.scerv.eat.testing`
  - Firebase project: `scervmvp-testing`
- Android EAS testing build started:
  - Build id: `3ad1d40f-e80f-42ad-9c64-7b07825993c5`
  - Build URL: `https://expo.dev/accounts/karlwiddakay/projects/scerv/builds/3ad1d40f-e80f-42ad-9c64-7b07825993c5`
  - APK URL: `https://expo.dev/artifacts/eas/5-gWAlEjdf4DOERHN1a_b-dh7fhR3f7P8zZc81jB8mA.apk`
  - Profile: `testing`
  - Distribution: internal
  - Final status: `FINISHED`
  - Note: EAS reports the current committed HEAD as the git hash while uploading the dirty local workspace. Treat this as a dirty-worktree testing artifact until the hardening branch is committed.
- iOS EAS testing build was attempted with `--non-interactive` and failed during credential setup:
  - Cause: EAS could not find credentials suitable for internal distribution for the testing bundle.
  - Founder approved interactive credential setup.
  - Interactive retry reached the Apple password prompt for `scervapp@gmail.com` and was cancelled safely because the password/2FA must be entered locally by the founder.
  - On 2026-09-30 the founder deferred the iOS testing build for now. Android-first B-07 may proceed under D-028, but this does not satisfy the original two-platform exit gate.
- `node --check functions\restaurantFunctions.js` passed.
- `node --check functions\reservationFunctions.js` passed.
- `npm.cmd --prefix functions run lint` passed.
- Backend gate evidence:
  - secret hygiene scan
  - functions lint
  - 27 backend unit tests
  - 9 Firestore emulator rules tests
- Note: after the reservation migration, the checks passed in split form. The chained `npm run ci:backend` command can fail on this workstation when the Firestore emulator Java process does not release port `8080` between runs; this is local emulator lifecycle contention, not a test failure.
- JSX parser validation passed for:
  - `src/screens/restaurant/ServiceRequestsScreen.js`
  - `src/screens/restaurant/HostStandScreen.js`
  - `src/screens/restaurant/PickupQueueScreen.js`
  - `src/screens/restaurant/RestaurantReservationsScreen.js`
  - `src/context/restaurant/WorkDayContext.js`
  - `src/screens/restaurant/RestaurantDashboardScreen.js`
  - `src/screens/restaurant/EmployeeScreen.js`
  - `src/screens/restaurant/BackOfficeScreen.js`
  - `src/screens/restaurant/RestaurantCheckin.js`
  - `src/screens/restaurant/MenuManagementScreen.js`
  - `src/components/restaurant/AddItemModal.js`
  - `src/components/restaurant/MenuItem.js`
  - `src/screens/restaurant/ReservationSettingsScreen.js`
  - `src/screens/restaurant/RestaurantRewardsScreen.js`
- Testing deploys completed for:
  - `listStaffHostCheckIns`
  - `listStaffPickupOrders`
  - `listStaffReservationOperations`
  - `addEmployee`
  - `listStaffActiveTables`
  - `listStaffMenuItems`
  - `mutateRestaurantMenuItem`
  - `getStaffReservationSettings`

## Not Done Yet

B-06 is not complete until all of the following are true:

- A testing-profile native build is produced from the migrated client.
- Android build `3ad1d40f-e80f-42ad-9c64-7b07825993c5` is installed on a device.
- iOS internal-distribution credentials are configured for `com.scerv.app.testing`, then an iOS testing build is produced, unless the master plan is formally changed.
- The build is installed on at least one Android device and one iOS device.
- B-07 staff-device QA passes or defects are filed.

## Explicit Deferrals

These surfaces should not be forced into naive polling during B-06:

- KDS / Bar queue (`ChefsQScreen`)
  - Reason: kitchen/bar visible-order latency is service-critical and currently benefits from Firestore realtime listeners.
  - Next step: keep realtime for testing-device QA, then choose between sanitized projection listeners and a measured realtime strategy before rules lockdown.
- Party detail surface (`ManagePartyScreen` and `OrderDetailModal`)
  - Reason: this is a payment/rewards/promotions/shared-basket surface; changing its read model belongs with Phase 2 checkout/idempotency work, not a broad B-06 screen migration.
  - Next step: cover in the state-machine work and concurrency fixes before tightening party/payment rules.
- Table setup/floor-plan surfaces (`TableManagementScreen`, `ManualSeatingScreen`)
  - Reason: this screen mixes table setup with live occupancy/ready-order overlays; it should be split into setup reads and operational projections rather than migrated as one raw polling query.
  - Next step: separate floor-plan setup from live table-service state before R1-R4 rules lockdown.

With these deferrals recorded, the B-06 code-migration slice is ready for a testing-profile build and B-07 device QA.

## Rollback

If a migrated screen blocks testing:

1. Reinstall the prior testing build.
2. Leave the additive callables deployed; they are not used by older clients.
3. Revert only the affected client-screen migration in the hardening branch.
