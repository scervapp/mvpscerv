# Exported endpoint inventory

Updated September 27, 2026, America/New_York. Worktree: `hardening/phase-0-baseline`.

Purpose: track every deployed Firebase export category before Phase 1 is called complete. This is a source inventory, not a deployed-state verification. It does not certify production configuration, IAM, App Check, Stripe/Resend settings, or installed-client compatibility. The current control map lives in [exported endpoint authority matrix](exported-endpoint-authority-matrix.md).

## Status summary

| Area | Current local status | Phase 1 risk |
| --- | --- | --- |
| Staff sessions, PIN, staff directory | Verified staff-session boundary and sanitized directory are locally tested | Device QA, rollout compatibility and historical credential exposure remain open |
| Restaurant management reads | Major staff screens now use verified callables instead of direct raw reads | Remaining customer/public reads require separate decisions; broad rule lockdown not yet safe |
| Restaurant management writes | Menu, tables, profile, work-day, reservations, reporting and many operational actions now require verified staff authority | Authority matrix started; remaining customer/public, admin and Phase 2 payment dispositions remain open |
| Native/customer checkout | Gratuity validation, Stripe customer ownership and server-priced Stripe preparation are locally tested | Split-payment retries, allocation, fulfillment durability and reconciliation move to Phase 2 |
| Legacy payment rails | Legacy client-priced pending order endpoint, PayPal callables and dLocal callables/webhook are locally fail-closed | Reopening any alternate rail requires a new server-priced payment design, compliance decision and reconciliation tests |
| Admin portal | Admin exports exist for full platform support operations | Must remain protected by admin-role controls and production whitelisting; not a restaurant staff boundary |
| Browser dining | Browser table, basket, kitchen submission and checkout endpoints exist | Needs Phase 2 payment/order correctness review under concurrency |
| Firestore/background triggers | Rating aggregation, rewards accrual, customer indexing, check-in/table cleanup and translation triggers exist | Need trigger idempotency/retry and failure-mode review |

## Locally bounded staff/restaurant endpoints

These have local evidence in Phase 1 docs/tests or were migrated as part of the current hardening branch.

- Staff identity/session: `verifyEmployeePin`, `revokeStaffSession`, `listStaffDirectory`.
- Staff administration: `addEmployee`, `updateEmployee`, `deleteEmployee`, retired `setEmployeeRole`.
- Work day: `startWorkDay`, `getCurrentWorkDayStatus`, `endWorkDay`.
- Tables/QR: `addTable`, `updateTable`, `deleteTable`, `regenerateTableQrToken`, `setTableQrEnabled`, `ensureRestaurantTableQrTokens`, `forceClearTable`, `markPartyTableClean`.
- Menu management: `mutateRestaurantMenuItem`, `listStaffMenuItems`.
- Restaurant profile/settings: `getStaffRestaurantProfile`, `saveRestaurantProfile`, `getStaffReservationSettings`, `saveReservationSettings`, `saveRestaurantExperienceSettings`, `getStaffRewardsSettings`, `saveRestaurantLoyaltyProgram`.
- Operational reads: `listStaffServiceRequests`, `listStaffKitchenOrders`, `listStaffPickupOrders`, `listStaffHostCheckIns`, `listStaffActiveTables`, `getStaffPartyDetail`, `getStaffOrderDetail`, `listStaffReservationOperations`, `getStaffBackOfficeSetupStatus`.
- Operational writes with local permission evidence: `handleCheckInResponse`, reservation approve/decline/seat/status/waitlist offer, `assignPartyServer`, `acknowledgePartyServiceRequest`, `updateKitchenOrderStationStatus`, `releaseKitchenOrderPacing`, `markReadyKitchenItemsServed`, `completePickupOrderHandoff`, `closePartyTable`.
- Reporting and financial staff reads: `getReportingDashboard`, `getOrdersLedger`, `getOrderDetail`, aliases `getDashboardReport`, `getSalesReport`, `getAggregatedSalesReport`, `getDailySalesReport`.
- Terminal: `createTerminalConnectionToken`, `prepareStaffTerminalPayment`, `captureStaffTerminalPayment`, `getStaffTerminalPaymentStatus`.

## Customer/browser endpoints requiring ownership and concurrency review

Some endpoints have local authorization repairs, but they still need Phase 2 order/payment correctness or customer-flow review before broad launch.

- Basket/order flow: `addItemToBasket`, `removeItemFromBasket`, `updateBasketItemQuantity`, `clearBasket`, `sendToChefsQ`, `sendItemsToChefsQ`, `sendOrderToKitchen`, `addItemToSharedBasket`, `addStaffItemsToPartyAndSendToKitchen`, `linkBasketToCheckIn`.
- Party flow: `createParty`, `inviteToParty`, `joinParty`, `leaveParty`, `cancelParty`, `activatePartyCheckIn`, `cancelPartyCheckIn`, `addLocalPIPToParty`, `updateSharedBasketItemQuantity`, `removeSharedBasketItem`, `createPartySession`.
- Browser dining: `resolveBrowserTableToken`, `createBrowserTableSession`, `addBrowserBasketItem`, `updateBrowserBasketItem`, `removeBrowserBasketItem`, `submitBrowserBasketToKitchen`, `getBrowserOrderStatus`.
- Reservation customer flow: `getAvailableReservationSlots`, `createReservationRequest`, `createReservationParty`, `joinReservationWaitlist`, `acceptWaitlistOffer`, `passWaitlistOffer`, `cancelCustomerReservation`.
- Customer identity/search: `sendEmailOtp`, `verifyEmailOtp`, `completeBrowserGuestIdentity`, `createUserAccount`, `createStripeCustomer`, `searchPIPs`.
- Reviews/recommendations/social discovery: `submitDishRating`, `submitMenuItemRating`, `submitServerRating`, `getScervTasteRecommendations`, `getScervFeed`, `translateInstruction`.

## Payment endpoints requiring special review

Treat payment endpoints as their own release gate. Passing auth checks is not sufficient; money correctness requires idempotency, allocation and reconciliation evidence.

- Supported Stripe paths under current review: `preparePayment`, `createBrowserCheckoutSession`, `syncBrowserCheckoutSession`, `finalizeStripePayment`, `getStripePublishableKey`, `handleStripeEvent`, `stripeWebhookTest`, `stripeWebhookLive`.
- Retired/blocked legacy path: `createPendingOrder` fails before database access locally.
- Legacy/alternate rails blocked locally: `createPayPalOrder`, `capturePayPalOrder` and `chargeVaultedCard` throw `failed-precondition` before provider access, Firestore mutation or fulfillment. `getDlocalPublicKey`, `createDlocalCheckout`, `processDlocalNativePayment`, `processDlocalTokenCharge`, `createDlocalPayment`, `confirmDlocalPayment` and `chargeSavedDlocalCard` do the same. `dlocalWebhook` acknowledges and ignores while dLocal is disabled so it cannot trigger fulfillment.

## Admin/support endpoints

These are internal platform controls and should not be evaluated as restaurant staff endpoints. They need separate admin-role, audit-log and environment-isolation review.

- Admin dashboard and records: `getScervAdminDashboardStats`, `searchScervAdminRecords`, `getScervCustomerProfile`, `getScervRestaurantProfile`, `listScervCustomers`, `listScervAdminAuditLogs`.
- Restaurant/customer support: `createScervRestaurantOnboarding`, `assignScervRestaurantOwner`, `sendScervCustomerPasswordReset`, `setScervCustomerDisabled`, `setScervCustomerCreatorStatus`, `updateScervRestaurantProfile`, `resendRestaurantOwnerSetupEmail`, `getScervOrderSupportDetail`, `addScervOrderSupportNote`, `refundScervStripeOrder`.
- Leads/newsletter/support cases: `submitScervDemoRequest`, `listScervDemoLeads`, `updateScervDemoLead`, `submitScervNewsletterSignup`, `listScervNewsletterSubscribers`, `updateScervNewsletterSubscriber`, `listScervSupportCases`, `saveScervSupportCase`, `addScervSupportCaseNote`.
- Platform feature and wallet controls: `saveRestaurantFeatureEntitlements`, `listScervPromotionLedger`, `issueScervCustomerPromotion`, `cancelScervCustomerPromotion`, `saveScervWalletDefinition`, `saveScervMenuItem`, `archiveScervMenuItem`.
- God-mode Firestore controls: `getScervFirestoreCollection`, `getScervFirestoreDocument`, `setScervFirestoreDocument`, `deleteScervFirestoreDocument`.
- Admin user management: `listScervAdminUsers`, `createScervAdminUser`, `updateScervAdminUserRole`, `setScervAdminUserDisabled`.

## Background triggers and scheduled jobs

These need idempotency and retry review, not only caller authentication.

- Rating/stat aggregation: `aggregateDishRating`, `aggregateMenuItemRating`, `aggregateMenuItemOrderStats`.
- Customer/user triggers: `onUserCreate`, `syncCustomerSearchIndex`.
- Rewards and trust stats: `awardRewardsForPaidOrder`, `updateReservationTrustStats`.
- Restaurant operations triggers/jobs: `handleCheckIn`, `clearTable`, `releaseDueKitchenOrderPacing`, `autoCloseStaleWorkDays`, `autoTranslateMenuItem`, `emitDgiInvoice`.

## Next endpoint-review actions

1. Use the authority matrix to complete review of the customer/browser/payment endpoints above.
2. Confirm every restaurant staff callable either uses `assertRestaurantPermission`, a narrower proven helper, or is intentionally public/customer-scoped.
3. Confirm admin endpoints require admin auth and write audit logs before production use.
4. Keep legacy dLocal/PayPal paths disabled until rebuilt around server-priced payment preparation, provider confirmation, webhook replay handling and reconciliation.
5. Do not move to Phase 2 payment-concurrency work until Phase 1 has a completed endpoint authority disposition.
